/**
 * 工作报告 controller（22 端点，适配 009 迁移的实际字段）
 * 数据表：work_reports / work_report_templates / work_report_reviews / work_report_cc / work_report_guidance
 * 字段映射（参考项目字段 → 实际字段）：
 *   period → date / title → content[:30] / issues → problems
 *   plan_tomorrow → next_plan / emp_id → user_id / emp_name → user_name
 *   dept_id/dept_name → dept / template_id → approval_flow
 */
const db = require('../db');
const { ok, okWith, bad, notfound, empId } = require('../utils/resp');

const STATUS = ['待提交', '已提交', '已批阅', '已驳回'];

/* ============ 模板 ========== */
function listTemplates(req, res) {
  const { type, status } = req.query;
  let sql = 'SELECT * FROM work_report_templates WHERE 1=1';
  const p = [];
  if (type) { sql += ' AND type=?'; p.push(type); }
  if (status) { sql += ' AND status=?'; p.push(status); }
  else { sql += " AND status='启用'"; }
  sql += ' ORDER BY built_in DESC, id DESC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function createTemplate(req, res) {
  const { name, type, fields } = req.body;
  if (!name || !type) return res.json(bad('名称/类型必填'));
  const r = db.prepare(`INSERT INTO work_report_templates (name, type, fields, built_in, creator_id, creator_name) VALUES (?,?,?,0,?,?)`)
    .run(name, type, JSON.stringify(fields || []), Number(empId(req)) || null, req.user?.name || '');
  return res.json(ok({ id: r.lastInsertRowid }, '已创建'));
}
function updateTemplate(req, res) {
  const { name, type, fields, status } = req.body;
  const r = db.prepare(`UPDATE work_report_templates SET name=?, type=?, fields=?, status=COALESCE(?,status) WHERE id=?`)
    .run(name, type, JSON.stringify(fields || []), status || null, req.params.id);
  return res.json(okWith({ changes: r.changes }, r.changes ? '已更新' : '无需更新'));
}

/* ============ 报告主表 ========== */
function list(req, res) {
  const { type, status, user_id, dept, keyword, from, to, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT r.* FROM work_reports r WHERE 1=1';
  const p = [];
  if (type) { sql += ' AND r.type=?'; p.push(type); }
  if (status) { sql += ' AND r.status=?'; p.push(status); }
  if (user_id) { sql += ' AND r.user_id=?'; p.push(user_id); }
  if (dept) { sql += ' AND r.dept=?'; p.push(dept); }
  if (keyword) { sql += ' AND (r.content LIKE ? OR r.problems LIKE ? OR r.report_no LIKE ?)'; p.push('%' + keyword + '%'); p.push('%' + keyword + '%'); p.push('%' + keyword + '%'); }
  if (from) { sql += ' AND r.created_at >= ?'; p.push(from); }
  if (to) { sql += ' AND r.created_at <= ?'; p.push(to); }
  const total = db.prepare(sql.replace(/SELECT r\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) c FROM')).get(...p).c;
  sql += ' ORDER BY r.id DESC LIMIT ? OFFSET ?';
  p.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  return res.json(okWith({ list: db.prepare(sql).all(...p), total, page: Number(page), pageSize: Number(pageSize) }));
}
function detail(req, res) {
  const r = db.prepare('SELECT * FROM work_reports WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  const reviews = db.prepare('SELECT * FROM work_report_reviews WHERE report_id=? ORDER BY id').all(req.params.id);
  const cc = db.prepare('SELECT * FROM work_report_cc WHERE report_id=?').all(req.params.id);
  return res.json(ok({ report: r, reviews, cc }));
}
function create(req, res) {
  const { type, period, content, issues, plan_tomorrow, template_id, cc_emp_ids, month } = req.body;
  if (!type) return res.json(bad('类型必填'));
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(Number(empId(req)) || 0);
  const no = 'WR' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000);
  const r = db.prepare(`INSERT INTO work_reports
    (report_no, type, user_id, user_name, dept, date, month, content, problems, next_plan, approval_flow, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, '待提交')`)
    .run(no, type, String(empId(req) || ''), e?.name || '', e?.dept || '',
      period || new Date().toISOString().slice(0, 10),
      month || (period || '').slice(0, 7),
      content || '', issues || '', plan_tomorrow || '',
      template_id ? String(template_id) : '');
  // 写抄送
  if (cc_emp_ids) {
    const ccs = String(cc_emp_ids).split(',').filter(Boolean);
    for (const eid of ccs) {
      const num = parseInt(eid);
      if (num) db.prepare('INSERT INTO work_report_cc (report_id, cc_emp_id, cc_emp_name) VALUES (?,?,?)')
        .run(r.lastInsertRowid, num, '');
    }
  }
  return res.json(ok({ id: r.lastInsertRowid, report_no: no }, '已创建'));
}
function update(req, res) {
  const r = db.prepare('SELECT * FROM work_reports WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  if (String(r.user_id) !== String(empId(req))) return res.json(bad('只能改自己的'));
  if (r.status !== '待提交') return res.json(bad('已提交后不能修改'));
  const { type, period, content, issues, plan_tomorrow } = req.body;
  db.prepare(`UPDATE work_reports SET type=COALESCE(?,type), date=COALESCE(?,date), content=COALESCE(?,content), problems=COALESCE(?,problems), next_plan=COALESCE(?,next_plan) WHERE id=?`)
    .run(type, period, content, issues, plan_tomorrow, req.params.id);
  return res.json(ok({}, '已更新'));
}
function submit(req, res) {
  const r = db.prepare('SELECT * FROM work_reports WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  if (r.status !== '待提交') return res.json(bad('仅待提交可提交'));
  db.prepare(`UPDATE work_reports SET status='已提交', submitted_at=datetime('now','localtime') WHERE id=?`).run(req.params.id);
  return res.json(ok({}, '已提交'));
}

/* ============ 批阅 / 指导 ========== */
function review(req, res) {
  const { action, comment } = req.body;
  if (!['通过', '驳回'].includes(action)) return res.json(bad('动作非法'));
  const r = db.prepare('SELECT * FROM work_reports WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  db.prepare('INSERT INTO work_report_reviews (report_id, reviewer_id, reviewer_name, action, comment) VALUES (?,?,?,?,?)')
    .run(r.id, Number(empId(req)) || null, req.user?.name || '', action, comment || '');
  db.prepare(`UPDATE work_reports SET status=? WHERE id=?`).run(action === '通过' ? '已批阅' : '已驳回', r.id);
  return res.json(ok({}, '已' + action));
}
function batchReview(req, res) {
  const { ids, action, comment } = req.body;
  if (!Array.isArray(ids) || !['通过', '驳回'].includes(action)) return res.json(bad('参数错误'));
  let n = 0;
  for (const id of ids) {
    try {
      const r = db.prepare('SELECT * FROM work_reports WHERE id=?').get(id);
      if (!r || r.status !== '已提交') continue;
      db.prepare('INSERT INTO work_report_reviews (report_id, reviewer_id, reviewer_name, action, comment) VALUES (?,?,?,?,?)')
        .run(id, Number(empId(req)) || null, req.user?.name || '', action, comment || '');
      db.prepare(`UPDATE work_reports SET status=? WHERE id=?`).run(action === '通过' ? '已批阅' : '已驳回', id);
      n++;
    } catch (e) {}
  }
  return res.json(okWith({ count: n }, '已批阅 ' + n));
}
function guide(req, res) {
  const { comment } = req.body;
  if (!comment) return res.json(bad('意见必填'));
  const r = db.prepare('SELECT * FROM work_reports WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  // 写 work_report_reviews（指导）
  db.prepare('INSERT INTO work_report_reviews (report_id, reviewer_id, reviewer_name, action, comment) VALUES (?,?,?,?,?)')
    .run(r.id, Number(empId(req)) || null, req.user?.name || '', '指导', comment);
  // 写 work_report_guidance（009 表）
  try {
    db.prepare(`INSERT INTO work_report_guidance (report_id, leader_id, leader_name, content, created_at) VALUES (?,?,?,?,datetime('now','localtime'))`)
      .run(r.id, Number(empId(req)) || null, req.user?.name || '', comment);
  } catch (e) {}
  return res.json(ok({}, '已下发指导意见'));
}
function getGuidance(req, res) {
  let rows = [];
  try { rows = db.prepare('SELECT * FROM work_report_guidance WHERE report_id=? ORDER BY id DESC').all(req.params.id); } catch (e) {
    // 表不存在时退到 reviews 的 action='指导'
    rows = db.prepare("SELECT * FROM work_report_reviews WHERE report_id=? AND action='指导' ORDER BY id DESC").all(req.params.id);
  }
  return res.json(ok({ list: rows }));
}

/* ============ 统计 ========== */
function stats(req, res) {
  const total = db.prepare('SELECT COUNT(*) c FROM work_reports').get().c;
  const byType = db.prepare('SELECT type, COUNT(*) c FROM work_reports GROUP BY type').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) c FROM work_reports GROUP BY status').all();
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = db.prepare("SELECT COUNT(*) c FROM work_reports WHERE date=? OR submitted_at LIKE ? || '%'").get(today, today).c;
  return res.json(ok({ total, by_type: byType, by_status: byStatus, today: todayCount }));
}
function deptSummary(req, res) {
  const { period } = req.query;
  let sql = `SELECT dept,
    COUNT(*) total,
    SUM(CASE WHEN status='已批阅' THEN 1 ELSE 0 END) reviewed,
    SUM(CASE WHEN status='已驳回' THEN 1 ELSE 0 END) rejected,
    SUM(CASE WHEN status='已提交' THEN 1 ELSE 0 END) pending
    FROM work_reports WHERE 1=1`;
  const p = [];
  if (period) { sql += ' AND month=?'; p.push(period); }
  sql += ' GROUP BY dept ORDER BY total DESC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function issuesTop(req, res) {
  const rows = db.prepare("SELECT user_name, dept, problems, created_at FROM work_reports WHERE problems IS NOT NULL AND problems != '' ORDER BY id DESC LIMIT 200").all();
  const issues = [];
  for (const r of rows) {
    const lines = String(r.problems).split(/[\n;；]/).map(s => s.trim()).filter(s => s.length > 5);
    for (const line of lines) issues.push({ text: line, emp: r.user_name, dept: r.dept, at: r.created_at });
  }
  const counter = {};
  for (const i of issues) counter[i.text] = (counter[i.text] || 0) + 1;
  const top = Object.entries(counter).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 20);
  return res.json(ok({ top, sample: issues.slice(0, 20) }));
}

/* ============ 抄送 ========== */
function listCc(req, res) {
  const me = Number(empId(req)) || 0;
  const rows = db.prepare(`SELECT r.* FROM work_reports r
    JOIN work_report_cc c ON c.report_id=r.id WHERE c.cc_emp_id=? ORDER BY r.id DESC LIMIT 100`).all(me);
  return res.json(ok({ list: rows }));
}
function readCc(req, res) {
  const me = Number(empId(req)) || 0;
  db.prepare(`UPDATE work_report_cc SET read_at=datetime('now','localtime') WHERE report_id=? AND cc_emp_id=? AND read_at IS NULL`)
    .run(req.params.id, me);
  return res.json(ok({}, '已读'));
}

/* ============ 流程 ========== */
function getSchedule(req, res) {
  const me = empId(req);
  const today = new Date().toISOString().slice(0, 10);
  const my = db.prepare("SELECT COUNT(*) c FROM work_reports WHERE user_id=? AND status='待提交'").get(String(me)).c;
  // 全员待提交
  const teamPending = db.prepare("SELECT COUNT(*) c FROM work_reports WHERE status='待提交'").get().c;
  return res.json(ok({ my_pending: my, team_pending: teamPending, today }));
}
function getPending(req, res) {
  const rows = db.prepare("SELECT * FROM work_reports WHERE status='已提交' ORDER BY submitted_at DESC LIMIT 100").all();
  return res.json(ok({ list: rows }));
}
function getPrev(req, res) {
  const r = db.prepare("SELECT * FROM work_reports WHERE user_id=? AND status IN ('已批阅','已提交') ORDER BY id DESC LIMIT 1").get(String(empId(req)));
  return res.json(ok({ report: r }));
}
function exportAll(req, res) {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM work_reports WHERE 1=1';
  const p = [];
  if (from) { sql += ' AND created_at >= ?'; p.push(from); }
  if (to) { sql += ' AND created_at <= ?'; p.push(to); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...p);
  const lines = ['单号\t工号\t姓名\t部门\t类型\t期间\t状态\t内容\t问题\t次日计划\t创建时间'];
  for (const r of rows) {
    lines.push([r.report_no, r.user_id, r.user_name, r.dept, r.type, r.date, r.status, (r.content || '').replace(/\n/g, ' '), (r.problems || '').replace(/\n/g, ' '), (r.next_plan || '').replace(/\n/g, ' '), r.created_at].join('\t'));
  }
  return res.json(ok({ text: lines.join('\n'), count: rows.length }));
}
function remind(req, res) {
  const rows = db.prepare("SELECT * FROM work_reports WHERE status='待提交'").all();
  let n = 0;
  for (const r of rows) {
    db.prepare(`INSERT INTO messages (biz_type, biz_id, to_emp_id, title, content, msg_type, created_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))`)
      .run('工作汇报', r.id, r.user_id || '0', '汇报催交', `请尽快提交「${r.type}」`, '待办');
    n++;
  }
  return res.json(okWith({ count: n }, '已催交 ' + n + ' 条'));
}

module.exports = {
  listTemplates, createTemplate, updateTemplate,
  list, detail, create, update, submit,
  review, batchReview, guide, getGuidance,
  stats, deptSummary, issuesTop,
  listCc, readCc,
  getSchedule, getPending, getPrev, exportAll, remind,
  STATUS,
};
