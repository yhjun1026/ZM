/**
 * 售后服务控制器（迁移自参考项目 routes/crm.js 的拜访段 + routes/dms.js 的投诉段 + routes/collab.js 的任务段）
 *
 * 对齐参考项目的业务规则：
 *  - 客户投诉 complaints：登记（被投诉经销商/投诉人/产品/事实）→ 处理中 → 已处理（关闭）；
 *     处理结论含「暂停」时联动经销商：admission_status='暂停合作'、tier='观察'（dms.js 处罚联动）
 *  - 客户拜访 customer_visits：登记拜访（客户/日期/方式/目的/沟通内容）→ 回填结果与下一步计划
 *  - 服务任务 tasks：指派（售后工程师/客服）→ 进度更新；进度 100 自动置「已完成」，>0 为「进行中」
 *
 * 数据表：complaints / customer_visits / tasks / customers / contacts / distributors / employees
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); };
const todayStr = () => localNow().slice(0, 10);
const curYm = () => localNow().slice(0, 7);

const COMPLAIN_STATUS = ['待处理', '处理中', '已处理'];
const VISIT_TYPES = ['初次拜访', '常规拜访', '技术交流', '商务谈判', '回访', '售后巡检', '学术活动'];
const TASK_STATUS = ['待开始', '进行中', '已完成'];
const PRIORITIES = ['高', '中', '普通', '低'];
const BIZ_TYPE = '售后';

/** users.id（'28' / 'ZM001'）→ employees 行 */
function empOf(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (/^\d+$/.test(s)) {
    const e = db.prepare('SELECT * FROM employees WHERE id=?').get(Number(s));
    if (e) return e;
  }
  return db.prepare('SELECT * FROM employees WHERE emp_no=? OR emp_no=?').get(s, 'ZM' + s) || null;
}
function isMgr(u) { return !!u && ['总经理', '副总', '销售总监', '超级管理员', '部门经理'].includes(u.role); }

/* ==================== 选项（前端下拉，避免硬编码） ==================== */
async function options(req, res) {
  const employees = db.prepare(`SELECT e.id, e.emp_no, e.name, e.role,
      (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM employees e WHERE e.status='在职' ORDER BY e.emp_no`).all();
  const customers = db.prepare('SELECT id, name FROM customers ORDER BY name LIMIT 300').all();
  const distributors = db.prepare('SELECT id, code, name, tier, region FROM distributors ORDER BY name LIMIT 300').all();
  return res.json(ok({
    employees, customers, distributors,
    complaint_status: COMPLAIN_STATUS,
    visit_types: VISIT_TYPES,
    task_status: TASK_STATUS,
    priorities: PRIORITIES,
  }));
}

async function contacts(req, res) {
  const rows = db.prepare('SELECT id, name, title, dept, phone FROM contacts WHERE customer_id=? ORDER BY is_primary DESC, id').all(req.params.id);
  return res.json(ok(rows));
}

/* ==================== 统计 ==================== */
async function stats(req, res) {
  const cTotal = db.prepare('SELECT COUNT(*) c FROM complaints').get().c;
  const cPending = db.prepare("SELECT COUNT(*) c FROM complaints WHERE status='待处理'").get().c;
  const cDoing = db.prepare("SELECT COUNT(*) c FROM complaints WHERE status='处理中'").get().c;
  const cDone = db.prepare("SELECT COUNT(*) c FROM complaints WHERE status='已处理'").get().c;
  const cMonth = db.prepare('SELECT COUNT(*) c FROM complaints WHERE substr(created_at,1,7)=?').get(curYm()).c;
  const vTotal = db.prepare('SELECT COUNT(*) c FROM customer_visits').get().c;
  const vMonth = db.prepare('SELECT COUNT(*) c FROM customer_visits WHERE substr(visit_date,1,7)=?').get(curYm()).c;
  const vCost = db.prepare('SELECT COALESCE(SUM(cost),0) s FROM customer_visits WHERE substr(visit_date,1,7)=?').get(curYm()).s || 0;
  const tTotal = db.prepare('SELECT COUNT(*) c FROM tasks WHERE biz_type=?').get(BIZ_TYPE).c;
  const tDone = db.prepare("SELECT COUNT(*) c FROM tasks WHERE biz_type=? AND status='已完成'").get(BIZ_TYPE).c;
  const tDoing = db.prepare("SELECT COUNT(*) c FROM tasks WHERE biz_type=? AND status='进行中'").get(BIZ_TYPE).c;
  const tOver = db.prepare("SELECT COUNT(*) c FROM tasks WHERE biz_type=? AND status<>'已完成' AND due_date IS NOT NULL AND due_date < ?").get(BIZ_TYPE, todayStr()).c;
  return res.json(ok({
    complaints: { total: cTotal, pending: cPending, handling: cDoing, closed: cDone, month: cMonth },
    visits: { total: vTotal, month: vMonth, cost: Math.round((vCost || 0) * 100) / 100 },
    tasks: { total: tTotal, done: tDone, doing: tDoing, overdue: tOver, rate: tTotal ? Math.round(tDone / tTotal * 100) : 0 },
  }));
}

/* ==================== 客户投诉 ==================== */
async function listComplaints(req, res) {
  const { status, q, distributor_id } = req.query;
  let sql = `SELECT cp.*, d.name distributor_name, d.tier distributor_tier
    FROM complaints cp LEFT JOIN distributors d ON cp.distributor_id=d.id WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND cp.status=?'; p.push(status); }
  if (distributor_id) { sql += ' AND cp.distributor_id=?'; p.push(distributor_id); }
  if (q) { sql += ' AND (cp.complainant LIKE ? OR cp.product LIKE ? OR cp.description LIKE ? OR d.name LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY (cp.status=?), cp.id DESC';
  p.push('已处理');
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createComplaint(req, res) {
  const b = req.body || {};
  const { distributor_id, complainant, region, product, description } = b;
  if (!distributor_id || !description) return res.json(bad('被投诉经销商与投诉事实必填'));
  const info = db.prepare('INSERT INTO complaints(distributor_id,complainant,region,product,description) VALUES(?,?,?,?,?)')
    .run(distributor_id, complainant || '', region || '', product || '', description);
  audit('登记客户投诉', req.userId, `投诉#${info.lastInsertRowid}`, `经销商#${distributor_id} 产品${product || '-'}：${String(description).slice(0, 60)}`);
  return res.json(ok({ id: info.lastInsertRowid }, '投诉已登记'));
}

/** 处理/关闭投诉：status + 处理结果(penalty) */
async function updateComplaint(req, res) {
  const cp = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id);
  if (!cp) return res.json(notfound('投诉记录不存在'));
  const b = req.body || {};
  const status = COMPLAIN_STATUS.includes(b.status) ? b.status : cp.status;
  const penalty = b.penalty !== undefined ? String(b.penalty) : (cp.penalty || '');
  if (status === '已处理' && !penalty) return res.json(bad('处理结果必填（如：警告/罚款/暂停合作）'));
  db.prepare('UPDATE complaints SET status=?, penalty=? WHERE id=?').run(status, penalty, cp.id);
  // 处罚联动：处理结果含「暂停」→ 暂停合作 + 降级（对齐 dms.js）
  if (status === '已处理' && penalty.includes('暂停')) {
    db.prepare("UPDATE distributors SET admission_status='暂停合作', tier='观察' WHERE id=?").run(cp.distributor_id);
  }
  audit('处理客户投诉', req.userId, `投诉#${cp.id}`, `状态:${status} 处理结果:${penalty || '-'}`);
  return res.json(ok({ status, penalty }, `投诉已更新为「${status}」`));
}

async function removeComplaint(req, res) {
  if (!isMgr(req.user)) return res.json(forbidden('仅管理层可删除投诉记录'));
  const cp = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id);
  if (!cp) return res.json(notfound('投诉记录不存在'));
  db.prepare('DELETE FROM complaints WHERE id=?').run(cp.id);
  audit('删除客户投诉', req.userId, `投诉#${cp.id}`, `${cp.complainant || ''} ${cp.product || ''}`);
  return res.json(ok(null, '投诉记录已删除'));
}

/* ==================== 客户拜访 ==================== */
async function listVisits(req, res) {
  const { customer_id, visit_type, month, q } = req.query;
  let sql = `SELECT v.*, e.name visitor_name, c.name customer_name, ct.name contact_name
    FROM customer_visits v
    LEFT JOIN employees e ON v.visitor_id=e.id
    LEFT JOIN customers c ON CAST(v.customer_id AS TEXT)=c.id
    LEFT JOIN contacts ct ON v.contact_id=ct.id
    WHERE 1=1`;
  const p = [];
  if (customer_id) { sql += ' AND v.customer_id=?'; p.push(customer_id); }
  if (visit_type) { sql += ' AND v.visit_type=?'; p.push(visit_type); }
  if (month) { sql += ' AND substr(v.visit_date,1,7)=?'; p.push(month); }
  if (q) { sql += ' AND (v.purpose LIKE ? OR v.content LIKE ? OR v.result LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY v.visit_date DESC, v.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createVisit(req, res) {
  const b = req.body || {};
  if (!b.customer_id || !b.visit_date) return res.json(bad('客户与拜访日期必填'));
  const cust = db.prepare('SELECT id FROM customers WHERE id=?').get(String(b.customer_id));
  if (!cust) return res.json(bad('客户不存在'));
  const emp = empOf(req.userId);
  const info = db.prepare(`INSERT INTO customer_visits(customer_id,visit_date,visitor_id,visit_type,contact_id,purpose,content,result,next_plan,cost)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(String(b.customer_id), b.visit_date, emp ? emp.id : null,
      VISIT_TYPES.includes(b.visit_type) ? b.visit_type : '常规拜访',
      b.contact_id || null, b.purpose || '', b.content || '', b.result || '', b.next_plan || '', Number(b.cost) || 0);
  audit('登记客户拜访', req.userId, String(b.customer_id), `${b.visit_date} ${b.visit_type || '常规拜访'}`);
  return res.json(ok({ id: info.lastInsertRowid }, '拜访记录已登记'));
}

/** 回填拜访结果与下一步计划 */
async function updateVisit(req, res) {
  const v = db.prepare('SELECT * FROM customer_visits WHERE id=?').get(req.params.id);
  if (!v) return res.json(notfound('拜访记录不存在'));
  const b = req.body || {};
  db.prepare(`UPDATE customer_visits SET visit_type=?, purpose=?, content=?, result=?, next_plan=?, cost=? WHERE id=?`)
    .run(VISIT_TYPES.includes(b.visit_type) ? b.visit_type : v.visit_type,
      b.purpose !== undefined ? b.purpose : v.purpose,
      b.content !== undefined ? b.content : v.content,
      b.result !== undefined ? b.result : v.result,
      b.next_plan !== undefined ? b.next_plan : v.next_plan,
      b.cost !== undefined ? Number(b.cost) || 0 : v.cost, v.id);
  audit('更新客户拜访', req.userId, String(v.customer_id), `拜访#${v.id} 结果：${(b.result || '').slice(0, 60)}`);
  return res.json(ok(null, '拜访记录已更新'));
}

/* ==================== 服务任务 ==================== */
async function listTasks(req, res) {
  const { status, assignee_id, all, q } = req.query;
  let sql = 'SELECT t.*, e.name assignee_emp_name FROM tasks t LEFT JOIN employees e ON t.assignee_id=e.id WHERE 1=1';
  const p = [];
  if (all === '1') { sql += " AND (t.biz_type=? OR t.biz_type IS NULL)"; p.push(BIZ_TYPE); }
  else { sql += ' AND t.biz_type=?'; p.push(BIZ_TYPE); }
  if (status) { sql += ' AND t.status=?'; p.push(status); }
  if (assignee_id) { sql += ' AND t.assignee_id=?'; p.push(assignee_id); }
  if (q) { sql += ' AND (t.title LIKE ? OR t.task_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY (t.status=?), (t.due_date IS NULL), t.due_date ASC, t.id DESC';
  p.push('已完成');
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createTask(req, res) {
  const b = req.body || {};
  const { title, descr, assignee_id, priority, due_date, biz_id } = b;
  if (!title || !assignee_id) return res.json(bad('任务标题与执行人必填'));
  const to = db.prepare("SELECT id, name FROM employees WHERE id=? AND status='在职'").get(assignee_id);
  if (!to) return res.json(notfound('执行人不存在或已停用'));
  const emp = empOf(req.userId);
  const cnt = db.prepare('SELECT COUNT(*) n FROM tasks').get().n;
  const task_no = `SV${localNow().slice(0, 10).replace(/-/g, '')}${String(cnt + 1).padStart(4, '0')}`;
  const info = db.prepare(`INSERT INTO tasks(task_no,title,descr,assigner_id,assigner_name,assignee_id,assignee_name,priority,due_date,progress,status,biz_type,biz_id)
    VALUES(?,?,?,?,?,?,?,?,?,0,'待开始',?,?)`)
    .run(task_no, title, descr || '', emp ? emp.id : null, (emp && emp.name) || ((req.user && req.user.name) || ''),
      to.id, to.name, PRIORITIES.includes(priority) ? priority : '普通', due_date || null, BIZ_TYPE, biz_id || null);
  audit('指派售后任务', req.userId, task_no, `${title} → ${to.name}`);
  return res.json(ok({ id: info.lastInsertRowid, task_no }, `任务已指派给 ${to.name}`));
}

/** 进度更新：100 → 已完成；>0 → 进行中（对齐 collab.js） */
async function updateProgress(req, res) {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('任务不存在'));
  const b = req.body || {};
  const pr = Math.max(0, Math.min(100, Number(b.progress !== undefined ? b.progress : t.progress) || 0));
  const st = TASK_STATUS.includes(b.status) ? b.status : (pr >= 100 ? '已完成' : (pr > 0 ? '进行中' : '待开始'));
  db.prepare('UPDATE tasks SET progress=?, status=? WHERE id=?').run(pr, st, t.id);
  audit('更新售后任务进度', req.userId, t.task_no, `${t.title} ${pr}% ${st}`);
  return res.json(ok({ progress: pr, status: st }, `进度已更新为 ${pr}%`));
}

async function removeTask(req, res) {
  if (!isMgr(req.user)) return res.json(forbidden('仅管理层可删除任务'));
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('任务不存在'));
  db.prepare('DELETE FROM tasks WHERE id=?').run(t.id);
  audit('删除售后任务', req.userId, t.task_no, t.title);
  return res.json(ok(null, '任务已删除'));
}

module.exports = {
  options, contacts, stats,
  listComplaints, createComplaint, updateComplaint, removeComplaint,
  listVisits, createVisit, updateVisit,
  listTasks, createTask, updateProgress, removeTask,
};
