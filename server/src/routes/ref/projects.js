/**
 * 项目管理路由 — 按《OA智能办公平台-项目管理模块PRD（医疗器械销售+AI技术自研专项）》完全重写
 * 双业务场景：
 *  - sales 医疗设备销售项目：立项→部门总监→财务初审→(重大)管理层终审；任务10节点；回款+交付验收+售后
 *  - ai    AI技术自研项目：立项→技术总监→资源配置审核→(重大)管理层终审；任务9节点；版本迭代+测试bug
 * 合规要求：
 *  - 审批流固化不可篡改；变更需审批并永久留痕；结项归档后数据锁定
 *  - 销售项目客户/合同/回款数据仅销售部、财务、管理层可见
 *  - AI项目涉密技术文档仅技术部、管理层可见
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, now } = require('../../compat/helpers');

router.use(authMiddleware);

/* ===== 数据库迁移（幂等，t_pm_ 前缀） ===== */
(function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_code TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'sales',
    name TEXT NOT NULL,
    level TEXT DEFAULT '普通',
    stars INTEGER DEFAULT 3,
    status TEXT DEFAULT '草稿',
    progress INTEGER DEFAULT 0,
    dept_id INTEGER DEFAULT 0,
    dept_name TEXT DEFAULT '',
    creator_id INTEGER DEFAULT 0,
    creator_name TEXT DEFAULT '',
    pm_emp TEXT DEFAULT '',
    pm_name TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    plan_end_date TEXT DEFAULT '',
    actual_end_date TEXT DEFAULT '',
    approval_flow TEXT DEFAULT '[]',
    close_flow TEXT DEFAULT '[]',
    close_report TEXT DEFAULT '',
    reject_reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    archived_at TEXT DEFAULT '',
    -- 销售项目字段
    customer_name TEXT DEFAULT '',
    device_category TEXT DEFAULT '',
    tender_no TEXT DEFAULT '',
    contract_amount REAL DEFAULT 0,
    payment_cycle_days INTEGER DEFAULT 0,
    deliver_cycle TEXT DEFAULT '',
    contact_person TEXT DEFAULT '',
    -- AI自研项目字段
    research_direction TEXT DEFAULT '',
    tech_difficulty TEXT DEFAULT '',
    iter_version TEXT DEFAULT '',
    rd_cycle_days INTEGER DEFAULT 0,
    resource_needs TEXT DEFAULT '',
    application_scene TEXT DEFAULT '',
    description TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id INTEGER DEFAULT 0,
    emp_id TEXT DEFAULT '',
    user_name TEXT DEFAULT '',
    dept TEXT DEFAULT '',
    project_role TEXT DEFAULT '项目成员',
    joined_at TEXT DEFAULT (datetime('now','localtime')),
    left_at TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    seq INTEGER DEFAULT 0,
    name TEXT NOT NULL,
    owner_emp TEXT DEFAULT '',
    owner_name TEXT DEFAULT '',
    status TEXT DEFAULT '待开始',
    progress INTEGER DEFAULT 0,
    start_date TEXT DEFAULT '',
    due_date TEXT DEFAULT '',
    finished_at TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    reason TEXT DEFAULT '',
    content TEXT DEFAULT '',
    impact TEXT DEFAULT '',
    new_end_date TEXT DEFAULT '',
    approval_flow TEXT DEFAULT '[]',
    status TEXT DEFAULT '待审批',
    applicant TEXT DEFAULT '',
    reject_reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    stage TEXT DEFAULT '',
    plan_amount REAL DEFAULT 0,
    plan_date TEXT DEFAULT '',
    actual_amount REAL DEFAULT 0,
    actual_date TEXT DEFAULT '',
    status TEXT DEFAULT '待回款',
    confirmed_by TEXT DEFAULT '',
    confirmed_at TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    version_no TEXT NOT NULL,
    content TEXT DEFAULT '',
    improvements TEXT DEFAULT '',
    released_at TEXT DEFAULT '',
    operator TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    case_name TEXT NOT NULL,
    result TEXT DEFAULT '待测试',
    bugs TEXT DEFAULT '',
    bug_status TEXT DEFAULT '',
    tester TEXT DEFAULT '',
    fixed_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    category TEXT DEFAULT '立项资料',
    name TEXT NOT NULL,
    file_type TEXT DEFAULT '',
    size INTEGER DEFAULT 0,
    content TEXT DEFAULT '',
    confidential INTEGER DEFAULT 0,
    uploader TEXT DEFAULT '',
    uploaded_at TEXT DEFAULT (datetime('now','localtime')),
    deleted INTEGER DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    stage TEXT DEFAULT '发货',
    content TEXT DEFAULT '',
    doc_name TEXT DEFAULT '',
    status TEXT DEFAULT '待处理',
    operator TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_aftersales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    type TEXT DEFAULT '维护',
    content TEXT DEFAULT '',
    handler TEXT DEFAULT '',
    status TEXT DEFAULT '处理中',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_risks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    level TEXT DEFAULT '中',
    description TEXT DEFAULT '',
    solution TEXT DEFAULT '',
    status TEXT DEFAULT '待处理',
    source TEXT DEFAULT 'manual',
    ref_id INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_pm_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    operator TEXT DEFAULT '',
    operator_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
})();

/* ===== 工具函数 ===== */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(base, n) {
  const d = base ? new Date(base + 'T00:00:00') : new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function genCode(type) {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prefix = type === 'ai' ? 'PRJ-A-' : 'PRJ-S-';
  const row = db.prepare(`SELECT COUNT(*) AS c FROM t_pm_projects WHERE project_code LIKE '${prefix}${ym}%'`).get();
  return `${prefix}${ym}-${String((row?.c || 0) + 1).padStart(3, '0')}`;
}
function addLog(pid, action, detail, u) {
  db.prepare('INSERT INTO t_pm_logs (project_id,action,detail,operator,operator_name) VALUES (?,?,?,?,?)')
    .run(pid, action, detail || '', u ? String(u.id) : 'system', u ? u.name : '系统');
}
function getProject(id) {
  return db.prepare('SELECT * FROM t_pm_projects WHERE id = ?').get(id);
}

/* 权限：项目创建/立项 —— 部门负责人及以上（销售总监/部门经理/管理层/超管） */
function canCreate(u) {
  return ['超级管理员', '总经理', '副总', '销售总监', '部门经理'].includes(u.role);
}
/* 权限：项目管理员 —— 超管/管理层/本部门负责人/项目创建人/项目经理 */
function canManageProject(u, p) {
  if (['超级管理员', '总经理', '副总'].includes(u.role)) return true;
  if (u.role === '销售总监' && p.dept_name === '销售部') return true;
  if (u.role === '部门经理' && u.dept === p.dept_name) return true;
  if (p.creator_id === u.id) return true;
  const me = db.prepare('SELECT emp_id FROM users WHERE id = ?').get(u.id);
  return !!me && me.emp_id && me.emp_id === p.pm_emp;
}
/* 审批流角色匹配 */
function matchRole(u, role, p) {
  if (u.role === '超级管理员') return true;
  switch (role) {
    case 'deptDirector':
      return (u.role === '销售总监' && p.dept_name === '销售部') ||
             (u.role === '部门经理' && u.dept === p.dept_name);
    case 'finance':
      return u.dept === '财务部';
    case 'admin':
      return u.role === '部门经理' && u.dept === '行政部';
    case 'mgmt':
      return ['总经理', '副总'].includes(u.role);
    case 'deputy':
      return u.role === '副总';
    case 'gm':
      return u.role === '总经理';
    default:
      return false;
  }
}
/* 数据可见性：销售项目财务/客户数据 */
function canSeeFinance(u) {
  return ['销售部', '财务部'].includes(u.dept) || ['超级管理员', '总经理', '副总'].includes(u.role);
}
/* 数据可见性：AI涉密技术文档 */
function canSeeConfidential(u) {
  return u.dept === '技术部' || ['超级管理员', '总经理', '副总'].includes(u.role);
}
function maskProject(u, p) {
  if (p.type === 'sales' && !canSeeFinance(u)) {
    p.customer_name = '***（无权限）';
    p.contract_amount = null;
    p.contact_person = '***';
  }
  return p;
}
function isLocked(p) {
  return ['已结项', '已归档'].includes(p.status);
}

/* 立项审批流（固化，不可篡改） */
function buildApprovalFlow(p) {
  const flow = [];
  if (p.type === 'sales') {
    flow.push({ step: '部门总监审批', role: 'deptDirector', done: false, user: '', time: '—', opinion: '' });
    flow.push({ step: '财务合规初审', role: 'finance', done: false, user: '', time: '—', opinion: '' });
  } else {
    flow.push({ step: '技术总监评审', role: 'deptDirector', done: false, user: '', time: '—', opinion: '' });
    flow.push({ step: '资源配置审核', role: 'admin', done: false, user: '', time: '—', opinion: '' });
  }
  if (p.level === '重大') {
    flow.push({ step: '副总审批', role: 'deputy', done: false, user: '', time: '—', opinion: '' });
    flow.push({ step: '总经理终审', role: 'gm', done: false, user: '', time: '—', opinion: '' });
  }
  flow.push({ step: '项目启动', role: 'system', done: false, user: '', time: '—', opinion: '' });
  return flow;
}
/* 结项审批流 */
function buildCloseFlow(p) {
  const flow = [{ step: '项目经理提交', role: 'system', done: true, user: p.pm_name || p.creator_name, time: now(), opinion: '' },
                { step: '部门负责人审核', role: 'deptDirector', done: false, user: '', time: '—', opinion: '' }];
  if (p.type === 'sales') flow.push({ step: '财务结项审核', role: 'finance', done: false, user: '', time: '—', opinion: '' });
  flow.push({ step: '质控合规审核', role: 'admin', done: false, user: '', time: '—', opinion: '' });
  if (p.level === '重大') { flow.push({ step: '副总审批', role: 'deputy', done: false, user: '', time: '—', opinion: '' }); flow.push({ step: '总经理终审', role: 'gm', done: false, user: '', time: '—', opinion: '' }); }
  flow.push({ step: '归档执行', role: 'system', done: false, user: '', time: '—', opinion: '' });
  return flow;
}
/* 变更审批流 */
function buildChangeFlow(p, changeType) {
  const flow = [{ step: '变更发起', role: 'system', done: true, user: p.pm_name || p.creator_name, time: now(), opinion: '' },
                { step: '部门负责人审批', role: 'deptDirector', done: false, user: '', time: '—', opinion: '' }];
  if (['预算调整', '交付周期变更', '客户需求变更'].includes(changeType)) {
    flow.push({ step: '财务变更审核', role: 'finance', done: false, user: '', time: '—', opinion: '' });
  }
  if (['技术方案变更'].includes(changeType)) {
    flow.push({ step: '质控合规审核', role: 'admin', done: false, user: '', time: '—', opinion: '' });
  }
  if (p.level === '重大') { flow.push({ step: '副总审批', role: 'deputy', done: false, user: '', time: '—', opinion: '' }); flow.push({ step: '总经理终审', role: 'gm', done: false, user: '', time: '—', opinion: '' }); }
  flow.push({ step: '变更生效', role: 'system', done: false, user: '', time: '—', opinion: '' });
  return flow;
}

/* 任务模板（双场景标准化拆解） */
const TASK_TPL = {
  sales: ['线索跟进', '招投标报名', '标书制作', '开标评审', '合同签约', '设备采购备货', '交付安装', '客户验收', '回款跟进', '售后归档'],
  ai: ['需求调研', '方案评审', '算法开发', '代码编写', '内部测试', '迭代优化', '落地试运行', '正式上线', '版本归档']
};
function genTasks(pid, p) {
  const tpl = TASK_TPL[p.type] || TASK_TPL.sales;
  const ins = db.prepare('INSERT INTO t_pm_tasks (project_id,seq,name,owner_emp,owner_name,start_date,due_date) VALUES (?,?,?,?,?,?,?)');
  tpl.forEach((name, i) => {
    ins.run(pid, i + 1, name, p.pm_emp, p.pm_name, addDays(todayStr(), i * 5), addDays(todayStr(), i * 5 + 10));
  });
}
function refreshProgress(pid) {
  const rows = db.prepare('SELECT progress FROM t_pm_tasks WHERE project_id = ?').all(pid);
  if (!rows.length) return;
  const avg = Math.round(rows.reduce((s, r) => s + (r.progress || 0), 0) / rows.length);
  db.prepare('UPDATE t_pm_projects SET progress = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(avg, pid);
}

/* 风险自动扫描：任务逾期 / 回款逾期（去重） */
function riskScan() {
  const today = todayStr();
  // 1. 任务逾期
  const overdueTasks = db.prepare(`SELECT t.*, p.type FROM t_pm_tasks t JOIN t_pm_projects p ON p.id = t.project_id
    WHERE t.due_date < ? AND t.status NOT IN ('已完成') AND p.status = '进行中'`).all(today);
  const existsStmt = db.prepare(`SELECT id FROM t_pm_risks WHERE project_id = ? AND type = ? AND ref_id = ? AND source = 'auto'`);
  const existsRisk = (pid, type, refId) => existsStmt.get(pid, type, refId);
  const insRisk = db.prepare(`INSERT INTO t_pm_risks (project_id,type,level,description,source,ref_id) VALUES (?,?,?,?,?,?)`);
  const updTask = db.prepare(`UPDATE t_pm_tasks SET status = '已逾期' WHERE id = ? AND status != '已完成'`);
  overdueTasks.forEach(t => {
    updTask.run(t.id);
    if (!existsRisk(t.project_id, t.type === 'ai' ? '研发进度延期' : '交付延期', t.id)) {
      insRisk.run(t.project_id, t.type === 'ai' ? '研发进度延期' : '交付延期', '中',
        `任务「${t.name}」已逾期（截止 ${t.due_date}）`, 'auto', t.id);
    }
  });
  // 2. 回款逾期
  const overduePays = db.prepare(`SELECT * FROM t_pm_payments WHERE plan_date < ? AND plan_date != '' AND status = '待回款'`).all(today);
  overduePays.forEach(pay => {
    db.prepare(`UPDATE t_pm_payments SET status = '逾期' WHERE id = ?`).run(pay.id);
    if (!existsRisk(pay.project_id, '回款逾期', pay.id)) {
      insRisk.run(pay.project_id, '回款逾期', '高',
        `计划回款 ${pay.plan_amount} 元（${pay.plan_date}）已逾期`, 'auto', pay.id);
    }
  });
}

/* ===== 项目列表 + 台账统计 ===== */
router.get('/', (req, res) => {
  riskScan();
  const { type, status, dept, keyword, mine } = req.query;
  let sql = 'SELECT * FROM t_pm_projects WHERE 1=1';
  const args = [];
  if (type) { sql += ' AND type = ?'; args.push(type); }
  if (status) { sql += ' AND status = ?'; args.push(status); }
  if (dept) { sql += ' AND dept_name = ?'; args.push(dept); }
  if (keyword) { sql += ' AND (name LIKE ? OR project_code LIKE ?)'; args.push(`%${keyword}%`, `%${keyword}%`); }
  if (mine === '1') { sql += ' AND (creator_id = ? OR pm_emp = (SELECT emp_id FROM users WHERE id = ?))'; args.push(req.user.id, req.user.id); }
  sql += ' ORDER BY created_at DESC';
  let rows = db.prepare(sql).all(...args);
  rows.forEach(r => {
    r.approval_flow = safeParse(r.approval_flow, []);
    r.close_flow = safeParse(r.close_flow, []);
    maskProject(req.user, r);
  });
  // 统计看板
  const all = db.prepare('SELECT type,status,progress,contract_amount FROM t_pm_projects').all();
  const pay = db.prepare(`SELECT project_id, SUM(CASE WHEN status='已回款' THEN actual_amount ELSE 0 END) AS received,
    SUM(plan_amount) AS planned FROM t_pm_payments GROUP BY project_id`).all();
  const payMap = {}; pay.forEach(x => payMap[x.project_id] = x);
  const paid = db.prepare(`SELECT project_id, SUM(actual_amount) AS amt FROM t_pm_payments WHERE status='已回款' GROUP BY project_id`).all();
  const paidMap = {}; paid.forEach(x => paidMap[x.project_id] = x.amt);
  const stats = {
    total: all.length,
    running: all.filter(p => p.status === '进行中').length,
    pending: all.filter(p => ['待审批', '审批中', '结项审批中'].includes(p.status)).length,
    finished: all.filter(p => ['已结项', '已归档'].includes(p.status)).length,
    overdue: db.prepare(`SELECT COUNT(DISTINCT project_id) AS c FROM t_pm_tasks WHERE due_date < ? AND status = '已逾期'`).get(todayStr()).c,
    riskOpen: db.prepare(`SELECT COUNT(*) AS c FROM t_pm_risks WHERE status != '已解决'`).get().c,
    sales: { total: all.filter(p => p.type === 'sales').length,
      contractAmount: all.filter(p => p.type === 'sales' && ['进行中', '已结项', '已归档'].includes(p.status)).reduce((s, p) => s + (p.contract_amount || 0), 0) },
    ai: { total: all.filter(p => p.type === 'ai').length,
      avgProgress: (() => { const l = all.filter(p => p.type === 'ai' && p.status === '进行中'); return l.length ? Math.round(l.reduce((s, p) => s + p.progress, 0) / l.length) : 0; })() }
  };
  // 回款率（销售类）
  const salesIds = all.filter(p => p.type === 'sales' && ['进行中', '已结项', '已归档'].includes(p.status)).map(p => p.id);
  const contractSum = salesIds.reduce((s, id) => { const p = all.find(x => x.id === id); return s + (p ? (p.contract_amount || 0) : 0); }, 0);
  const receivedSum = salesIds.reduce((s, id) => s + (paidMap[id] || 0), 0);
  stats.sales.paymentRate = contractSum > 0 ? Math.round(receivedSum / contractSum * 100) : 0;
  return success(res, { rows, stats });
});

/* ===== 统计报表 ===== */
router.get('/report', (req, res) => {
  riskScan();
  const projects = db.prepare(`SELECT * FROM t_pm_projects`).all();
  const tasks = db.prepare(`SELECT t.*, p.type AS ptype FROM t_pm_tasks t JOIN t_pm_projects p ON p.id = t.project_id`).all();
  const payments = db.prepare(`SELECT * FROM t_pm_payments`).all();
  const versions = db.prepare(`SELECT * FROM t_pm_versions`).all();
  const tests = db.prepare(`SELECT * FROM t_pm_tests`).all();
  const risks = db.prepare(`SELECT * FROM t_pm_risks`).all();
  const changes = db.prepare(`SELECT * FROM t_pm_changes`).all();

  const salesP = projects.filter(p => p.type === 'sales');
  const aiP = projects.filter(p => p.type === 'ai');
  const received = payments.filter(x => x.status === '已回款').reduce((s, x) => s + x.actual_amount, 0);
  const contractSum = salesP.filter(p => ['进行中', '已结项', '已归档'].includes(p.status)).reduce((s, p) => s + (p.contract_amount || 0), 0);
  const salesTasks = tasks.filter(t => t.ptype === 'sales');
  const aiTasks = tasks.filter(t => t.ptype === 'ai');

  // 部门排行
  const deptMap = {};
  projects.filter(p => p.status !== '草稿').forEach(p => {
    if (!deptMap[p.dept_name]) deptMap[p.dept_name] = { dept: p.dept_name, total: 0, amount: 0 };
    deptMap[p.dept_name].total += 1;
    if (p.type === 'sales') deptMap[p.dept_name].amount += (p.contract_amount || 0);
  });
  // 成员工作负荷
  const loadMap = {};
  tasks.forEach(t => {
    if (!t.owner_name) return;
    if (!loadMap[t.owner_name]) loadMap[t.owner_name] = { owner: t.owner_name, total: 0, done: 0, overdue: 0 };
    loadMap[t.owner_name].total += 1;
    if (t.status === '已完成') loadMap[t.owner_name].done += 1;
    if (t.status === '已逾期') loadMap[t.owner_name].overdue += 1;
  });
  // 审批效率（变更/立项平均耗时略：统计通过率）
  const bugTotal = tests.filter(t => t.bugs).length;
  const bugFixed = tests.filter(t => t.bugs && t.bug_status === '已修复').length;
  const report = {
    overview: {
      total: projects.length, running: projects.filter(p => p.status === '进行中').length,
      finished: projects.filter(p => ['已结项', '已归档'].includes(p.status)).length,
      overdueTasks: tasks.filter(t => t.status === '已逾期').length,
      openRisks: risks.filter(r => r.status !== '已解决').length
    },
    sales: {
      total: salesP.length,
      contractAmount: contractSum,
      receivedAmount: received,
      paymentRate: contractSum > 0 ? Math.round(received / contractSum * 100) : 0,
      deliverRate: salesTasks.length ? Math.round(salesTasks.filter(t => t.status === '已完成').length / salesTasks.length * 100) : 0,
      overdueCount: salesTasks.filter(t => t.status === '已逾期').length
    },
    ai: {
      total: aiP.length,
      avgProgress: (() => { const l = aiP.filter(p => p.status === '进行中'); return l.length ? Math.round(l.reduce((s, p) => s + p.progress, 0) / l.length) : 0; })(),
      delayRate: aiTasks.length ? Math.round(aiTasks.filter(t => t.status === '已逾期').length / aiTasks.length * 100) : 0,
      landingRate: aiP.length ? Math.round(aiP.filter(p => ['已结项', '已归档'].includes(p.status)).length / aiP.length * 100) : 0,
      versionCount: versions.length,
      bugTotal, bugFixed, bugFixRate: bugTotal ? Math.round(bugFixed / bugTotal * 100) : 0
    },
    deptRanking: Object.values(deptMap).sort((a, b) => b.total - a.total),
    workload: Object.values(loadMap).sort((a, b) => b.total - a.total),
    changeStat: { total: changes.length, approved: changes.filter(c => c.status === '已通过').length, pending: changes.filter(c => c.status === '待审批').length },
    riskStat: { total: risks.length, open: risks.filter(r => r.status !== '已解决').length, byType: (() => { const m = {}; risks.forEach(r => m[r.type] = (m[r.type] || 0) + 1); return m; })() }
  };
  return success(res, report);
});

/* ===== 风险台账（全局） ===== */
router.get('/risks', (req, res) => {
  riskScan();
  const rows = db.prepare(`SELECT r.*, p.name AS project_name, p.type AS ptype FROM t_pm_risks r
    LEFT JOIN t_pm_projects p ON p.id = r.project_id ORDER BY r.status != '已解决', r.created_at DESC`).all();
  return success(res, rows);
});
router.post('/risks/scan', (req, res) => {
  riskScan();
  return success(res, null, '风险扫描完成');
});

/* ===== 台账CSV导出 ===== */
router.get('/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_pm_projects ORDER BY created_at DESC').all();
  const header = ['项目编号', '类型', '项目名称', '等级', '状态', '进度%', '部门', '项目经理', '客户名称', '合同金额', '计划开始', '计划结束', '立项时间'];
  const lines = rows.map(r => [
    r.project_code, r.type === 'ai' ? 'AI自研' : '医疗销售', r.name, r.level, r.status, r.progress, r.dept_name, r.pm_name,
    r.type === 'sales' && !canSeeFinance(req.user) ? '***' : r.customer_name,
    r.type === 'sales' && !canSeeFinance(req.user) ? '***' : (r.contract_amount || 0),
    r.start_date, r.plan_end_date, r.created_at
  ].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','));
  const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="projects.csv"');
  return res.send(csv);
});

/* ===== 项目详情 ===== */
router.get('/:id', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  p.approval_flow = safeParse(p.approval_flow, []);
  p.close_flow = safeParse(p.close_flow, []);
  maskProject(req.user, p);
  const q = (sql, ...args) => db.prepare(sql).all(...args);
  const detail = {
    ...p,
    members: q('SELECT * FROM t_pm_members WHERE project_id = ? AND left_at = ?', p.id, ''),
    tasks: q('SELECT * FROM t_pm_tasks WHERE project_id = ? ORDER BY seq', p.id),
    payments: canSeeFinance(req.user) || p.type === 'ai' ? q('SELECT * FROM t_pm_payments WHERE project_id = ? ORDER BY plan_date', p.id) : [],
    versions: p.type === 'ai' ? q('SELECT * FROM t_pm_versions WHERE project_id = ? ORDER BY id DESC', p.id) : [],
    tests: p.type === 'ai' ? q('SELECT * FROM t_pm_tests WHERE project_id = ? ORDER BY id DESC', p.id) : [],
    deliveries: p.type === 'sales' ? q('SELECT * FROM t_pm_deliveries WHERE project_id = ? ORDER BY id DESC', p.id) : [],
    aftersales: p.type === 'sales' ? q('SELECT * FROM t_pm_aftersales WHERE project_id = ? ORDER BY id DESC', p.id) : [],
    changes: q('SELECT * FROM t_pm_changes WHERE project_id = ? ORDER BY id DESC', p.id).map(c => (c.approval_flow = safeParse(c.approval_flow, []), c)),
    risks: q('SELECT * FROM t_pm_risks WHERE project_id = ? ORDER BY status != \'已解决\', id DESC', p.id),
    logs: q('SELECT * FROM t_pm_logs WHERE project_id = ? ORDER BY id DESC LIMIT 100', p.id)
  };
  // 涉密文档过滤：AI技术文档仅技术部/管理层可见
  const docs = q('SELECT id,category,name,file_type,size,confidential,uploader,uploaded_at,deleted FROM t_pm_docs WHERE project_id = ?', p.id);
  detail.docs = docs.filter(d => !d.confidential || canSeeConfidential(req.user));
  return success(res, detail);
});

/* ===== 创建项目（草稿/直接提交） ===== */
router.post('/', (req, res) => {
  if (!canCreate(req.user)) return error(res, 403, '仅部门负责人及以上可发起项目立项');
  const b = req.body;
  if (!b.name) return error(res, 400, '项目名称不能为空');
  const type = b.type === 'ai' ? 'ai' : 'sales';
  if (type === 'sales' && !b.customer_name) return error(res, 400, '销售项目必须填写客户名称');
  if (type === 'ai' && !b.research_direction) return error(res, 400, 'AI自研项目必须填写研发方向');
  const level = ['普通', '重点', '重大'].includes(b.level) ? b.level : '普通';
  const me = db.prepare('SELECT emp_id FROM users WHERE id = ?').get(req.user.id);
  const project_code = genCode(type);
  const submit = b.submit !== false; // 默认直接提交审批
  const flow = submit ? buildApprovalFlow({ type, level }) : [];
  const info = db.prepare(`INSERT INTO t_pm_projects
    (project_code,type,name,level,stars,status,dept_name,creator_id,creator_name,pm_emp,pm_name,
     start_date,plan_end_date,approval_flow,customer_name,device_category,tender_no,contract_amount,
     payment_cycle_days,deliver_cycle,contact_person,research_direction,tech_difficulty,iter_version,
     rd_cycle_days,resource_needs,application_scene,description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(project_code, type, b.name, level, { '普通': 3, '重点': 4, '重大': 5 }[level],
      submit ? '待审批' : '草稿', req.user.dept || '销售部', req.user.id, req.user.name,
      b.pm_emp || (me?.emp_id || ''), b.pm_name || req.user.name,
      b.start_date || todayStr(), b.plan_end_date || '', JSON.stringify(flow),
      b.customer_name || '', b.device_category || '', b.tender_no || '', b.contract_amount || 0,
      b.payment_cycle_days || 0, b.deliver_cycle || '', b.contact_person || '',
      b.research_direction || '', b.tech_difficulty || '', b.iter_version || '',
      b.rd_cycle_days || 0, b.resource_needs || '', b.application_scene || '', b.description || '');
  const pid = info.lastInsertRowid;
  // 创建人自动成为项目经理成员
  db.prepare('INSERT INTO t_pm_members (project_id,user_id,emp_id,user_name,dept,project_role) VALUES (?,?,?,?,?,?)')
    .run(pid, req.user.id, me?.emp_id || '', req.user.name, req.user.dept || '', '项目经理');
  addLog(pid, submit ? '提交立项审批' : '创建草稿', `项目编号 ${project_code}，等级：${level}`, req.user);
  return success(res, { id: pid, project_code }, submit ? '项目已提交立项审批' : '草稿已保存');
});

/* ===== 草稿提交 ===== */
router.post('/:id/submit', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.status !== '草稿' && p.status !== '已驳回') return error(res, 400, '当前状态不可提交');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可提交');
  const flow = buildApprovalFlow(p);
  db.prepare(`UPDATE t_pm_projects SET status = '待审批', approval_flow = ?, reject_reason = '', updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(JSON.stringify(flow), p.id);
  addLog(p.id, '提交立项审批', '重新提交立项申请', req.user);
  return success(res, null, '已提交立项审批');
});

/* ===== 立项审批/驳回 ===== */
router.post('/:id/approve', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (!['待审批', '审批中'].includes(p.status)) return error(res, 400, '项目不在审批中');
  const flow = safeParse(p.approval_flow, []);
  const idx = flow.findIndex(s => !s.done && s.role !== 'system');
  if (idx < 0) return error(res, 400, '无待审批步骤');
  const step = flow[idx];
  if (!matchRole(req.user, step.role, p)) return error(res, 403, `当前步骤「${step.step}」需由对应审核角色审批，禁止越级`);
  flow[idx] = { ...step, done: true, user: req.user.name, time: now(), opinion: req.body?.opinion || '' };
  // system 步骤自动完成
  let started = false;
  if (idx + 1 < flow.length && flow[idx + 1].role === 'system') {
    flow[idx + 1] = { ...flow[idx + 1], done: true, user: '系统', time: now() };
    started = true;
  }
  const status = started ? '进行中' : '审批中';
  db.prepare(`UPDATE t_pm_projects SET status = ?, approval_flow = ?, start_date = COALESCE(NULLIF(start_date,''), ?), updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(status, JSON.stringify(flow), todayStr(), p.id);
  if (started) {
    genTasks(p.id, { ...p, pm_emp: p.pm_emp, pm_name: p.pm_name });
    addLog(p.id, '立项审批通过', '项目正式启动，按业务模板生成阶段任务', req.user);
  } else {
    addLog(p.id, '审批通过', `步骤「${step.step}」由 ${req.user.name} 通过`, req.user);
  }
  return success(res, null, started ? '审批全部通过，项目已启动' : `步骤「${step.step}」已通过`);
});
router.post('/:id/reject', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (!['待审批', '审批中'].includes(p.status)) return error(res, 400, '项目不在审批中');
  const remark = (req.body?.remark || '').trim();
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const flow = safeParse(p.approval_flow, []);
  const idx = flow.findIndex(s => !s.done && s.role !== 'system');
  if (idx < 0) return error(res, 400, '无待审批步骤');
  if (!matchRole(req.user, flow[idx].role, p)) return error(res, 403, '禁止越级审批');
  db.prepare(`UPDATE t_pm_projects SET status = '已驳回', reject_reason = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(remark, p.id);
  addLog(p.id, '立项驳回', `驳回意见：${remark}`, req.user);
  return success(res, null, '项目已驳回，可修改后重新提交');
});

/* ===== 项目基本编辑（未锁定时） ===== */
router.put('/:id', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (isLocked(p)) return error(res, 400, '项目已结项/归档，数据已锁定禁止修改');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可编辑');
  const b = req.body;
  const fields = ['name', 'description', 'plan_end_date', 'device_category', 'contact_person', 'application_scene', 'resource_needs', 'tech_difficulty'];
  const sets = [], args = [];
  fields.forEach(f => { if (b[f] !== undefined) { sets.push(`${f} = ?`); args.push(b[f]); } });
  if (!sets.length) return error(res, 400, '无有效更新字段');
  args.push(p.id);
  db.prepare(`UPDATE t_pm_projects SET ${sets.join(',')}, updated_at = datetime('now','localtime') WHERE id = ?`).run(...args);
  addLog(p.id, '编辑项目信息', sets.map(s => s.split(' ')[0]).join(','), req.user);
  return success(res, null, '项目信息已更新');
});

/* ===== 成员管理 ===== */
router.post('/:id/members', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可添加成员');
  const { emp_id } = req.body;
  const target = db.prepare('SELECT * FROM users WHERE emp_id = ?').get(emp_id);
  if (!target) return error(res, 404, '员工不存在');
  const dup = db.prepare('SELECT id FROM t_pm_members WHERE project_id = ? AND emp_id = ? AND left_at = \'\'').get(p.id, emp_id);
  if (dup) return error(res, 400, '该员工已在项目中');
  db.prepare('INSERT INTO t_pm_members (project_id,user_id,emp_id,user_name,dept,project_role) VALUES (?,?,?,?,?,?)')
    .run(p.id, target.id, emp_id, target.name, target.dept, req.body.project_role || '项目成员');
  addLog(p.id, '添加成员', `${target.name}（${target.dept}）`, req.user);
  return success(res, null, '成员已添加');
});
router.delete('/:id/members/:memberId', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可移除成员');
  const m = db.prepare('SELECT * FROM t_pm_members WHERE id = ? AND project_id = ?').get(req.params.memberId, p.id);
  if (!m) return error(res, 404, '成员不存在');
  db.prepare(`UPDATE t_pm_members SET left_at = datetime('now','localtime') WHERE id = ?`).run(m.id);
  addLog(p.id, '移除成员', `${m.user_name}（离队留痕）`, req.user);
  return success(res, null, '成员已移除');
});

/* ===== 任务管理 ===== */
router.post('/:id/tasks', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可添加任务');
  const b = req.body;
  if (!b.name) return error(res, 400, '任务名称不能为空');
  const max = db.prepare('SELECT MAX(seq) AS m FROM t_pm_tasks WHERE project_id = ?').get(p.id).m || 0;
  db.prepare('INSERT INTO t_pm_tasks (project_id,seq,name,owner_emp,owner_name,start_date,due_date,remark) VALUES (?,?,?,?,?,?,?,?)')
    .run(p.id, max + 1, b.name, b.owner_emp || '', b.owner_name || '', b.start_date || todayStr(), b.due_date || addDays(todayStr(), 7), b.remark || '');
  addLog(p.id, '添加任务', b.name, req.user);
  return success(res, null, '任务已添加');
});
router.put('/tasks/:taskId', (req, res) => {
  const t = db.prepare('SELECT * FROM t_pm_tasks WHERE id = ?').get(req.params.taskId);
  if (!t) return error(res, 404, '任务不存在');
  const p = getProject(t.project_id);
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  const me = db.prepare('SELECT emp_id FROM users WHERE id = ?').get(req.user.id);
  const isOwner = me?.emp_id && me.emp_id === t.owner_emp;
  const isManager = canManageProject(req.user, p);
  const b = req.body;
  // 普通成员仅可编辑个人任务的进度与备注
  if (!isManager && !isOwner) return error(res, 403, '普通成员仅可更新本人任务');
  if (isManager) {
    const sets = [], args = [];
    ['name', 'owner_emp', 'owner_name', 'start_date', 'due_date', 'status', 'remark'].forEach(f => {
      if (b[f] !== undefined) { sets.push(`${f} = ?`); args.push(b[f]); }
    });
    if (b.progress !== undefined) {
      let prog = Math.max(0, Math.min(100, Number(b.progress) || 0));
      sets.push('progress = ?'); args.push(prog);
      if (prog >= 100) { sets.push(`status = '已完成', finished_at = datetime('now','localtime')`); }
      else if (prog > 0 && (!t.progress || t.progress === 0)) { sets.push(`status = '进行中'`); }
    }
    if (!sets.length) return error(res, 400, '无有效更新字段');
    args.push(t.id);
    db.prepare(`UPDATE t_pm_tasks SET ${sets.join(',')} WHERE id = ?`).run(...args);
  } else {
    // 个人任务：进度+备注
    let prog = Math.max(0, Math.min(100, Number(b.progress) || 0));
    const st = prog >= 100 ? '已完成' : '进行中';
    db.prepare('UPDATE t_pm_tasks SET progress = ?, status = ?, remark = ?, finished_at = ? WHERE id = ?')
      .run(prog, st, b.remark ?? t.remark, prog >= 100 ? now() : '', t.id);
  }
  refreshProgress(t.project_id);
  addLog(t.project_id, '更新任务', `「${t.name}」进度更新`, req.user);
  return success(res, null, '任务已更新');
});

/* ===== 回款管理（销售专项） ===== */
router.post('/:id/payments', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.type !== 'sales') return error(res, 400, '回款管理仅适用于销售项目');
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p) && req.user.dept !== '财务部' && !['超级管理员', '总经理', '副总'].includes(req.user.role))
    return error(res, 403, '仅项目管理员或财务部可录入回款');
  const b = req.body;
  if (!(b.plan_amount > 0)) return error(res, 400, '计划回款金额必须大于0');
  db.prepare('INSERT INTO t_pm_payments (project_id,stage,plan_amount,plan_date,status,remark) VALUES (?,?,?,?,?,?)')
    .run(p.id, b.stage || '', b.plan_amount, b.plan_date || addDays(todayStr(), 30), '待回款', b.remark || '');
  addLog(p.id, '新增回款计划', `${b.stage || ''} ${b.plan_amount} 元，计划 ${b.plan_date}`, req.user);
  return success(res, null, '回款计划已录入');
});
router.put('/payments/:payId', (req, res) => {
  const pay = db.prepare('SELECT * FROM t_pm_payments WHERE id = ?').get(req.params.payId);
  if (!pay) return error(res, 404, '回款记录不存在');
  const p = getProject(pay.project_id);
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p) && req.user.dept !== '财务部') return error(res, 403, '仅项目管理员或财务部可录入实际回款');
  const b = req.body;
  const actual = Number(b.actual_amount) || 0;
  if (actual <= 0) return error(res, 400, '实际回款金额必须大于0');
  db.prepare(`UPDATE t_pm_payments SET actual_amount = ?, actual_date = ?, status = '待确认', remark = ? WHERE id = ?`)
    .run(actual, b.actual_date || todayStr(), b.remark || pay.remark, pay.id);
  addLog(p.id, '录入实际回款', `${actual} 元（${b.actual_date || todayStr()}），待财务确认`, req.user);
  return success(res, null, '实际回款已录入，待财务审核确认');
});
router.post('/payments/:payId/confirm', (req, res) => {
  const pay = db.prepare('SELECT * FROM t_pm_payments WHERE id = ?').get(req.params.payId);
  if (!pay) return error(res, 404, '回款记录不存在');
  if (req.user.dept !== '财务部' && req.user.role !== '超级管理员') return error(res, 403, '仅财务部可审核确认回款');
  if (pay.status === '已回款') return error(res, 400, '该回款已确认');
  db.prepare(`UPDATE t_pm_payments SET status = '已回款', confirmed_by = ?, confirmed_at = datetime('now','localtime') WHERE id = ?`)
    .run(req.user.name, pay.id);
  addLog(pay.project_id, '回款财务确认', `${pay.actual_amount} 元由 ${req.user.name} 确认`, req.user);
  return success(res, null, '回款已财务确认');
});

/* ===== 交付验收管理（销售专项） ===== */
router.post('/:id/deliveries', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.type !== 'sales') return error(res, 400, '交付验收仅适用于销售项目');
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可录入交付记录');
  const b = req.body;
  db.prepare('INSERT INTO t_pm_deliveries (project_id,stage,content,doc_name,status,operator) VALUES (?,?,?,?,?,?)')
    .run(p.id, b.stage || '发货', b.content || '', b.doc_name || '', b.status || '待处理', req.user.name);
  addLog(p.id, '交付验收记录', `${b.stage || '发货'}：${(b.content || '').slice(0, 50)}`, req.user);
  return success(res, null, '交付记录已录入');
});
router.put('/deliveries/:did', (req, res) => {
  const d = db.prepare('SELECT * FROM t_pm_deliveries WHERE id = ?').get(req.params.did);
  if (!d) return error(res, 404, '交付记录不存在');
  const p = getProject(d.project_id);
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可更新交付记录');
  db.prepare(`UPDATE t_pm_deliveries SET status = ?, content = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(req.body.status || d.status, req.body.content ?? d.content, d.id);
  addLog(d.project_id, '更新交付记录', `${d.stage} → ${req.body.status || d.status}`, req.user);
  return success(res, null, '交付记录已更新');
});

/* ===== 售后跟进（销售专项） ===== */
router.post('/:id/aftersales', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.type !== 'sales') return error(res, 400, '售后跟进仅适用于销售项目');
  if (isLocked(p) && p.status !== '已结项') return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可录入售后记录');
  const b = req.body;
  db.prepare('INSERT INTO t_pm_aftersales (project_id,type,content,handler,status) VALUES (?,?,?,?,?)')
    .run(p.id, b.type || '维护', b.content || '', b.handler || req.user.name, b.status || '处理中');
  addLog(p.id, '售后跟进', `${b.type || '维护'}：${(b.content || '').slice(0, 50)}`, req.user);
  return success(res, null, '售后记录已录入');
});
router.put('/aftersales/:aid', (req, res) => {
  const a = db.prepare('SELECT * FROM t_pm_aftersales WHERE id = ?').get(req.params.aid);
  if (!a) return error(res, 404, '售后记录不存在');
  if (!canManageProject(req.user, getProject(a.project_id))) return error(res, 403, '仅项目管理员可更新售后记录');
  db.prepare(`UPDATE t_pm_aftersales SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(req.body.status || a.status, a.id);
  addLog(a.project_id, '更新售后记录', `${a.type} → ${req.body.status || a.status}`, req.user);
  return success(res, null, '售后记录已更新');
});

/* ===== 版本迭代管理（AI专项） ===== */
router.post('/:id/versions', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.type !== 'ai') return error(res, 400, '版本管理仅适用于AI自研项目');
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可登记版本');
  const b = req.body;
  if (!b.version_no) return error(res, 400, '版本号不能为空');
  db.prepare('INSERT INTO t_pm_versions (project_id,version_no,content,improvements,released_at,operator) VALUES (?,?,?,?,?,?)')
    .run(p.id, b.version_no, b.content || '', b.improvements || '', b.released_at || todayStr(), req.user.name);
  db.prepare(`UPDATE t_pm_projects SET iter_version = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(b.version_no, p.id);
  addLog(p.id, '登记版本迭代', `v${b.version_no}`, req.user);
  return success(res, null, '版本已登记');
});

/* ===== 测试与bug管理（AI专项） ===== */
router.post('/:id/tests', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.type !== 'ai') return error(res, 400, '测试管理仅适用于AI自研项目');
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可录入测试用例');
  const b = req.body;
  if (!b.case_name) return error(res, 400, '测试用例名称不能为空');
  db.prepare('INSERT INTO t_pm_tests (project_id,case_name,result,bugs,bug_status,tester) VALUES (?,?,?,?,?,?)')
    .run(p.id, b.case_name, b.result || '待测试', b.bugs || '', b.bugs ? (b.bug_status || '待修复') : '', req.user.name);
  if (b.result === '不通过') {
    db.prepare(`INSERT INTO t_pm_risks (project_id,type,level,description,source) VALUES (?,?,?,?,?)`)
      .run(p.id, '测试不通过', '中', `测试用例「${b.case_name}」不通过${b.bugs ? '：' + b.bugs : ''}`, 'auto');
  }
  addLog(p.id, '录入测试用例', `${b.case_name} → ${b.result}`, req.user);
  return success(res, null, '测试用例已录入');
});
router.put('/tests/:tid', (req, res) => {
  const t = db.prepare('SELECT * FROM t_pm_tests WHERE id = ?').get(req.params.tid);
  if (!t) return error(res, 404, '测试用例不存在');
  const p = getProject(t.project_id);
  if (isLocked(p)) return error(res, 400, '项目已锁定');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可更新测试记录');
  const b = req.body;
  const bugStatus = b.bug_status || t.bug_status;
  db.prepare('UPDATE t_pm_tests SET result = ?, bugs = ?, bug_status = ?, fixed_at = ? WHERE id = ?')
    .run(b.result || t.result, b.bugs ?? t.bugs, bugStatus, bugStatus === '已修复' ? now() : '', t.id);
  addLog(t.project_id, '更新测试记录', `${t.case_name} bug状态 → ${bugStatus}`, req.user);
  return success(res, null, '测试记录已更新');
});

/* ===== 文档管理（权限化+软删除+留痕） ===== */
router.post('/:id/docs', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (isLocked(p)) return error(res, 400, '项目已锁定，禁止上传文档');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可上传归档文档');
  const b = req.body;
  if (!b.name) return error(res, 400, '文档名称不能为空');
  const content = b.content || '';
  if (content.length > 3 * 1024 * 1024) return error(res, 400, '文档过大（限3MB）');
  const confidential = p.type === 'ai' && ['技术文档', '设计方案', '代码说明'].includes(b.category) ? 1 : (b.confidential ? 1 : 0);
  const info = db.prepare('INSERT INTO t_pm_docs (project_id,category,name,file_type,size,content,confidential,uploader) VALUES (?,?,?,?,?,?,?,?)')
    .run(p.id, b.category || '立项资料', b.name, b.file_type || '', content.length, content, confidential, req.user.name);
  addLog(p.id, '上传文档', `[${b.category || '立项资料'}] ${b.name}${confidential ? '（涉密）' : ''}`, req.user);
  return success(res, { id: info.lastInsertRowid }, '文档已上传归档');
});
router.get('/docs/:docId/download', (req, res) => {
  const d = db.prepare('SELECT * FROM t_pm_docs WHERE id = ? AND deleted = 0').get(req.params.docId);
  if (!d) return error(res, 404, '文档不存在');
  if (d.confidential && !canSeeConfidential(req.user)) return error(res, 403, '涉密文档禁止跨部门下载');
  const p = getProject(d.project_id);
  if (p?.type === 'sales' && ['合同文件', '资质文件'].includes(d.category) && !canSeeFinance(req.user))
    return error(res, 403, '销售合同/资质文件仅销售部、财务、管理层可见');
  addLog(d.project_id, '下载文档', `[${d.category}] ${d.name}`, req.user);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(d.name)}"`);
  return res.send(Buffer.from(d.content || '', 'utf-8'));
});
router.delete('/docs/:docId', (req, res) => {
  const d = db.prepare('SELECT * FROM t_pm_docs WHERE id = ?').get(req.params.docId);
  if (!d) return error(res, 404, '文档不存在');
  const p = getProject(d.project_id);
  if (isLocked(p)) return error(res, 400, '项目已锁定，禁止删除文档');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可删除文档');
  db.prepare('UPDATE t_pm_docs SET deleted = 1 WHERE id = ?').run(d.id);
  addLog(d.project_id, '删除文档（软删除留痕）', `[${d.category}] ${d.name}`, req.user);
  return success(res, null, '文档已删除（审计留痕保留）');
});

/* ===== 变更管理 ===== */
router.post('/:id/changes', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (isLocked(p)) return error(res, 400, '项目已锁定，禁止变更');
  if (p.status !== '进行中') return error(res, 400, '仅进行中的项目可发起变更');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可发起变更申请');
  const b = req.body;
  const types = ['进度延期', '预算调整', '交付周期变更', '技术方案变更', '客户需求变更'];
  if (!types.includes(b.change_type)) return error(res, 400, '变更类型无效');
  if (!b.reason || !b.content) return error(res, 400, '变更原因与变更内容必填');
  const flow = buildChangeFlow(p, b.change_type);
  db.prepare(`INSERT INTO t_pm_changes (project_id,change_type,reason,content,impact,new_end_date,approval_flow,status,applicant)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(p.id, b.change_type, b.reason, b.content, b.impact || '', b.new_end_date || '', JSON.stringify(flow), '待审批', req.user.name);
  addLog(p.id, '发起变更申请', `[${b.change_type}] ${b.content.slice(0, 60)}`, req.user);
  return success(res, null, '变更申请已提交审批');
});
router.post('/changes/:changeId/approve', (req, res) => {
  const c = db.prepare('SELECT * FROM t_pm_changes WHERE id = ?').get(req.params.changeId);
  if (!c) return error(res, 404, '变更申请不存在');
  if (!['待审批', '审批中'].includes(c.status)) return error(res, 400, '该变更不在审批中');
  const p = getProject(c.project_id);
  const flow = safeParse(c.approval_flow, []);
  const idx = flow.findIndex(s => !s.done && s.role !== 'system');
  if (idx < 0) return error(res, 400, '无待审批步骤');
  if (!matchRole(req.user, flow[idx].role, p)) return error(res, 403, `当前步骤「${flow[idx].step}」禁止越级审批`);
  flow[idx] = { ...flow[idx], done: true, user: req.user.name, time: now(), opinion: req.body?.opinion || '' };
  let applied = false;
  if (idx + 1 < flow.length && flow[idx + 1].role === 'system') {
    flow[idx + 1] = { ...flow[idx + 1], done: true, user: '系统', time: now() };
    applied = true;
  }
  db.prepare(`UPDATE t_pm_changes SET status = ?, approval_flow = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(applied ? '已通过' : '审批中', JSON.stringify(flow), c.id);
  if (applied) {
    // 进度延期/交付周期变更 → 更新计划结束日期
    if (['进度延期', '交付周期变更'].includes(c.change_type) && c.new_end_date) {
      db.prepare(`UPDATE t_pm_projects SET plan_end_date = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(c.new_end_date, c.project_id);
    }
    addLog(c.project_id, '变更生效', `[${c.change_type}] ${c.content.slice(0, 60)}${c.new_end_date ? '，新计划结束日：' + c.new_end_date : ''}（永久留痕）`, req.user);
  } else {
    addLog(c.project_id, '变更审批', `步骤「${flow[idx].step}」由 ${req.user.name} 通过`, req.user);
  }
  return success(res, null, applied ? '变更审批通过并生效（已记录变更日志）' : `步骤「${flow[idx].step}」已通过`);
});
router.post('/changes/:changeId/reject', (req, res) => {
  const c = db.prepare('SELECT * FROM t_pm_changes WHERE id = ?').get(req.params.changeId);
  if (!c) return error(res, 404, '变更申请不存在');
  if (!['待审批', '审批中'].includes(c.status)) return error(res, 400, '该变更不在审批中');
  const remark = (req.body?.remark || '').trim();
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const p = getProject(c.project_id);
  const flow = safeParse(c.approval_flow, []);
  const idx = flow.findIndex(s => !s.done && s.role !== 'system');
  if (idx < 0) return error(res, 400, '无待审批步骤');
  if (!matchRole(req.user, flow[idx].role, p)) return error(res, 403, '禁止越级审批');
  db.prepare(`UPDATE t_pm_changes SET status = '已驳回', reject_reason = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(remark, c.id);
  addLog(c.project_id, '变更驳回', `[${c.change_type}] 驳回意见：${remark}`, req.user);
  return success(res, null, '变更申请已驳回');
});

/* ===== 风险管理 ===== */
router.post('/:id/risks', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可录入风险');
  const b = req.body;
  if (!b.type || !b.description) return error(res, 400, '风险类型与描述必填');
  db.prepare('INSERT INTO t_pm_risks (project_id,type,level,description,solution,source) VALUES (?,?,?,?,?,?)')
    .run(p.id, b.type, ['低', '中', '高'].includes(b.level) ? b.level : '中', b.description, b.solution || '', 'manual');
  addLog(p.id, '录入风险', `[${b.type}] ${b.description.slice(0, 50)}`, req.user);
  return success(res, null, '风险已录入台账');
});
router.put('/risks/:rid', (req, res) => {
  const r = db.prepare('SELECT * FROM t_pm_risks WHERE id = ?').get(req.params.rid);
  if (!r) return error(res, 404, '风险记录不存在');
  const p = getProject(r.project_id);
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可处理风险');
  db.prepare(`UPDATE t_pm_risks SET status = ?, solution = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(req.body.status || r.status, req.body.solution ?? r.solution, r.id);
  if ((req.body.status || '') === '已解决') addLog(r.project_id, '风险解决', `[${r.type}] ${r.description.slice(0, 50)}`, req.user);
  return success(res, null, '风险状态已更新');
});

/* ===== 结项与归档 ===== */
router.post('/:id/close', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.status !== '进行中') return error(res, 400, '仅进行中的项目可发起结项');
  if (!canManageProject(req.user, p)) return error(res, 403, '仅项目管理员可发起结项申请');
  const report = (req.body?.report || '').trim();
  if (!report) return error(res, 400, '结项报告必填');
  // 校验：销售项目须无未回款计划（已逾期/待回款）
  if (p.type === 'sales') {
    const unpaid = db.prepare(`SELECT COUNT(*) AS c FROM t_pm_payments WHERE project_id = ? AND status IN ('待回款','逾期','待确认')`).get(p.id).c;
    if (unpaid > 0) return error(res, 400, `尚有 ${unpaid} 笔回款未完成（待回款/逾期/待确认），不可结项`);
  }
  // 校验：任务须全部完成
  const undone = db.prepare(`SELECT COUNT(*) AS c FROM t_pm_tasks WHERE project_id = ? AND status != '已完成'`).get(p.id).c;
  if (undone > 0) return error(res, 400, `尚有 ${undone} 项任务未完成，不可结项`);
  const flow = buildCloseFlow(p);
  db.prepare(`UPDATE t_pm_projects SET status = '结项审批中', close_flow = ?, close_report = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(JSON.stringify(flow), report, p.id);
  addLog(p.id, '发起结项申请', '结项报告已提交', req.user);
  return success(res, null, '结项申请已提交，等待多部门审核');
});
router.post('/:id/close-approve', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.status !== '结项审批中') return error(res, 400, '项目不在结项审批中');
  const flow = safeParse(p.close_flow, []);
  const idx = flow.findIndex(s => !s.done && s.role !== 'system');
  if (idx < 0) return error(res, 400, '无待审批步骤');
  if (!matchRole(req.user, flow[idx].role, p)) return error(res, 403, `当前步骤「${flow[idx].step}」禁止越级审批`);
  flow[idx] = { ...flow[idx], done: true, user: req.user.name, time: now(), opinion: req.body?.opinion || '' };
  let closed = false;
  if (idx + 1 < flow.length && flow[idx + 1].role === 'system') {
    flow[idx + 1] = { ...flow[idx + 1], done: true, user: '系统', time: now() };
    closed = true;
  }
  db.prepare(`UPDATE t_pm_projects SET status = ?, close_flow = ?, actual_end_date = COALESCE(NULLIF(actual_end_date,''), ?), updated_at = datetime('now','localtime') WHERE id = ?`)
    .run(closed ? '已结项' : '结项审批中', JSON.stringify(flow), closed ? todayStr() : '', p.id);
  addLog(p.id, closed ? '结项完成' : '结项审批', closed ? '全部审核通过，项目数据已锁定' : `步骤「${flow[idx].step}」由 ${req.user.name} 通过`, req.user);
  return success(res, null, closed ? '结项完成，项目数据已锁定' : `步骤「${flow[idx].step}」已通过`);
});
router.post('/:id/close-reject', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.status !== '结项审批中') return error(res, 400, '项目不在结项审批中');
  const remark = (req.body?.remark || '').trim();
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const flow = safeParse(p.close_flow, []);
  const idx = flow.findIndex(s => !s.done && s.role !== 'system');
  if (idx < 0) return error(res, 400, '无待审批步骤');
  if (!matchRole(req.user, flow[idx].role, p)) return error(res, 403, '禁止越级审批');
  db.prepare(`UPDATE t_pm_projects SET status = '进行中', updated_at = datetime('now','localtime') WHERE id = ?`).run(p.id);
  addLog(p.id, '结项驳回', `驳回意见：${remark}，项目恢复进行中`, req.user);
  return success(res, null, '结项已驳回，项目恢复进行中');
});
router.post('/:id/archive', (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return error(res, 404, '项目不存在');
  if (p.status !== '已结项') return error(res, 400, '仅已结项项目可归档');
  if (!['超级管理员', '总经理'].includes(req.user.role)) return error(res, 403, '仅总经理/超级管理员可执行归档');
  db.prepare(`UPDATE t_pm_projects SET status = '已归档', archived_at = datetime('now','localtime') WHERE id = ?`).run(p.id);
  addLog(p.id, '项目归档', '归档至历史项目库，永久留存', req.user);
  return success(res, null, '项目已归档，永久留存可溯源');
});

module.exports = router;
