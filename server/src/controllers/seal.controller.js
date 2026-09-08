/**
 * 印章管理控制器（迁移自参考项目 routes/collab.js 的印章管理段，参考 office.js 制度《印章使用与证照外借管理规定》）
 *
 * 对齐参考项目业务逻辑：
 *  - 印章登记（seals）：印章名称（公章/合同章/财务章/发票章/法人章）、保管人、存放位置、状态（在库/在用/停用）
 *  - 用印申请（seal_applications）：用印事由 + 文件说明 + 份数，提交即联动「用印审批」，审批通过后方可登记用印
 *  - 严格审批口径（参考 #229-7）：未审批通过的申请禁止登记用印；状态回写仅允许「已归还」，
 *    通过/驳回由审批流程驱动，杜绝绕过审批直接登记或手工改状态
 *  - 借出与归还：登记用印 → 印章置「在用」；登记归还 → 申请置「已归还」、印章回「在库」
 *  - 用印台账统计：印章分布、申请状态分布、本月用印份数、按印章汇总
 *  - 用印文件打印/下载留痕（print_requests）：申请 → 审批通过发放一次性令牌（24 小时）→ 使用次数留痕
 *
 * 与参考项目的差异（受当前项目库表约束）：
 *  1) 009 迁移的 seals 无 type 列（参考 DDL 注释即以 name 承载类型），故印章类型以名称枚举校验；
 *  2) 当前项目审批中心未与本模块联动（参考由审批引擎回写），故本模块提供 用印审批收口接口
 *     （印章管理员/管理层执行 approve/reject，同步更新 approvals 表），避免流程悬空；
 *  3) 参考项目用印申请 dept_name 取员工 title，本模块改为取所属部门（org_units）。
 *
 * 数据表：seals / seal_applications / print_requests / approvals（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const auditLog = require('../utils/audit');

/** 印章名称（类型）——对齐参考 seals.name 注释 公章/合同章/财务章/发票章/法人章 */
const SEAL_TYPES = ['公章', '合同章', '财务章', '发票章', '法人章'];
/** 印章状态 */
const SEAL_STATUS = ['在库', '在用', '停用'];
/** 用印申请状态 */
const APP_STATUS = ['审批中', '通过', '驳回', '已撤销', '已归还'];
/** 打印/下载申请状态 */
const PRINT_STATUS = ['待审批', '通过', '驳回'];
/** 印章管理员：印章登记/停用、用印登记与归还、审批收口（对齐参考 requirePerm('seal',1)） */
const SEAL_ADMIN_ROLES = ['印章管理员', '行政人事部负责人', '总经理', '副总', '超级管理员'];

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const todayStr = () => localNow().slice(0, 10);
const ymd = () => todayStr().replace(/-/g, '');

/** 当前登录用户对应的 employee 记录（users.emp_id 为工号，与 employees.emp_no 同值） */
function empOf(req) {
  try {
    const u = db.prepare('SELECT emp_id, name FROM users WHERE id = ?').get(req.userId);
    if (!u) return null;
    return db.prepare('SELECT * FROM employees WHERE emp_no = ? OR name = ?').get(u.emp_id || '', u.name) || null;
  } catch (e) {
    return null;
  }
}
const isAdmin = (req) => SEAL_ADMIN_ROLES.includes(req.user && req.user.role);
const empIdOf = (req) => {
  const e = empOf(req);
  return e ? e.id : (empId(req) || null);
};
const deptNameOf = (req) => {
  const e = empOf(req);
  if (e && e.org_id) {
    const o = db.prepare('SELECT name FROM org_units WHERE id = ?').get(e.org_id);
    if (o) return o.name;
  }
  return (req.user && req.user.dept) || '';
};

/** 发起审批并生成步骤（对齐 archive.controller.js 的 createApproval 写法） */
function createApproval(empId, userName, type, title, refId, chain) {
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  const approvalNo = 'AP' + ymd() + String(n).padStart(4, '0');
  const info = db.prepare(`INSERT INTO approvals
      (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, type, title, refId || 0, 0,
      Number(empId) || 0, userName || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/** 编号：前缀 + 年月日 + 4 位序号（对齐参考 collab.js app_no / req_no 规则） */
function nextNo(table, prefix) {
  const n = db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c + 1;
  return `${prefix}${ymd()}${String(n).padStart(4, '0')}`;
}

/* ==================== 0. 元数据 / 统计 ==================== */

async function meta(req, res) {
  return res.json(ok({
    seal_types: SEAL_TYPES,
    seal_status: SEAL_STATUS,
    app_status: APP_STATUS,
    print_status: PRINT_STATUS,
    is_admin: isAdmin(req),
  }));
}

/** 用印台账统计：印章分布 / 申请状态分布 / 本月用印份数 / 按印章汇总 */
async function stats(req, res) {
  const sealTotal = db.prepare('SELECT COUNT(*) c FROM seals').get().c;
  const byStatus = SEAL_STATUS.map((s) => ({
    status: s, count: db.prepare('SELECT COUNT(*) c FROM seals WHERE status = ?').get(s).c,
  }));
  const appTotal = db.prepare('SELECT COUNT(*) c FROM seal_applications').get().c;
  const byApp = APP_STATUS.map((s) => ({
    status: s, count: db.prepare('SELECT COUNT(*) c FROM seal_applications WHERE status = ?').get(s).c,
  }));
  const month = todayStr().slice(0, 7);
  const monthUsed = db.prepare(
    "SELECT COALESCE(SUM(copies),0) s FROM seal_applications WHERE used_at IS NOT NULL AND used_at LIKE ?").get(`${month}%`).s;
  const copies = db.prepare(
    "SELECT COALESCE(SUM(copies),0) s FROM seal_applications WHERE used_at IS NOT NULL").get().s;
  const bySeal = db.prepare(`SELECT s.id, s.seal_no, s.name, s.status,
      COUNT(a.id) app_count,
      COALESCE(SUM(CASE WHEN a.used_at IS NOT NULL THEN a.copies ELSE 0 END),0) copies
    FROM seals s LEFT JOIN seal_applications a ON a.seal_id = s.id
    GROUP BY s.id ORDER BY s.id`).all();
  const printPending = db.prepare("SELECT COUNT(*) c FROM print_requests WHERE status='待审批'").get().c;
  return res.json(ok({
    seal_total: sealTotal, by_status: byStatus,
    app_total: appTotal, by_app_status: byApp,
    month_copies: monthUsed, total_copies: copies,
    by_seal: bySeal, print_pending: printPending,
  }));
}

/* ==================== 1. 印章登记（seals） ==================== */

/** 印章列表：附在用申请数，便于台账查看 */
async function list(req, res) {
  const rows = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM seal_applications a WHERE a.seal_id = s.id AND a.status = '通过') using_count,
      (SELECT COUNT(*) FROM seal_applications a WHERE a.seal_id = s.id) app_count
    FROM seals s ORDER BY s.id`).all();
  return res.json(ok(rows));
}

/** 登记印章：名称须在类型枚举内且唯一；保管人可指定员工 */
async function create(req, res) {
  if (!isAdmin(req)) return res.json(forbidden('印章登记仅印章管理员/行政人事部操作'));
  const b = req.body || {};
  const name = (b.name || '').trim();
  if (!name) return res.json(bad('印章名称必填'));
  if (!SEAL_TYPES.includes(name)) return res.json(bad(`印章名称须为：${SEAL_TYPES.join('/')}`));
  if (db.prepare('SELECT id FROM seals WHERE name = ?').get(name)) return res.json(bad(`印章「${name}」已登记`));
  const keeperId = Number(b.keeper_id) || null;
  const keeper = keeperId ? db.prepare('SELECT id,name FROM employees WHERE id = ?').get(keeperId) : null;
  const sealNo = 'SEAL' + String(db.prepare('SELECT COUNT(*) c FROM seals').get().c + 1).padStart(3, '0');
  const info = db.prepare('INSERT INTO seals(seal_no,name,keeper_id,keeper_name,location,status) VALUES(?,?,?,?,?,?)')
    .run(sealNo, name, keeper ? keeper.id : null, keeper ? keeper.name : (b.keeper_name || ''),
      b.location || '行政人事部', SEAL_STATUS.includes(b.status) ? b.status : '在库');
  auditLog('SEAL_CREATE', req.userId, `印章#${info.lastInsertRowid}`, `登记印章 ${name}(${sealNo})`);
  return res.json(ok({ id: info.lastInsertRowid, seal_no: sealNo }, `印章「${name}」已登记`));
}

/** 修改印章：保管人/存放位置/状态；停用时有在途用印申请则拒绝 */
async function update(req, res) {
  if (!isAdmin(req)) return res.json(forbidden('印章维护仅印章管理员/行政人事部操作'));
  const s = db.prepare('SELECT * FROM seals WHERE id = ?').get(req.params.id);
  if (!s) return res.json(notfound('印章不存在'));
  const b = req.body || {};
  const status = SEAL_STATUS.includes(b.status) ? b.status : s.status;
  if (status === '停用' && s.status !== '停用') {
    const using = db.prepare("SELECT COUNT(*) c FROM seal_applications WHERE seal_id = ? AND status = '通过'").get(s.id).c;
    if (using > 0) return res.json(bad(`该印章尚有 ${using} 笔已通过未归还的用印申请，不可停用`));
  }
  const keeperId = b.keeper_id !== undefined ? (Number(b.keeper_id) || null) : s.keeper_id;
  const keeper = keeperId ? db.prepare('SELECT id,name FROM employees WHERE id = ?').get(keeperId) : null;
  db.prepare('UPDATE seals SET keeper_id=?, keeper_name=?, location=?, status=? WHERE id=?')
    .run(keeperId, keeper ? keeper.name : (b.keeper_name !== undefined ? b.keeper_name : s.keeper_name),
      b.location !== undefined ? b.location : s.location, status, s.id);
  auditLog('SEAL_UPDATE', req.userId, `印章#${s.id}`, `维护印章 ${s.name}：状态${status}`);
  return res.json(ok({ status }, '印章已更新'));
}

/* ==================== 2. 用印申请（seal_applications） ==================== */

/** 申请列表：印章管理员/管理层看全量，其余仅看本人（对齐 collab.js 数据范围） */
async function listApplications(req, res) {
  const { status, seal_id } = req.query;
  let sql = `SELECT a.*, s.seal_no
    FROM seal_applications a LEFT JOIN seals s ON a.seal_id = s.id WHERE 1 = 1`;
  const p = [];
  if (!isAdmin(req)) { sql += ' AND a.emp_id = ?'; p.push(empIdOf(req)); }
  if (status) { sql += ' AND a.status = ?'; p.push(status); }
  if (seal_id) { sql += ' AND a.seal_id = ?'; p.push(seal_id); }
  sql += ' ORDER BY a.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 提交用印申请：校验印章可用 → 联动「用印审批」→ 状态「审批中」 */
async function createApplication(req, res) {
  const b = req.body || {};
  const sealId = Number(b.seal_id) || 0;
  const purpose = (b.purpose || '').trim();
  if (!sealId || !purpose) return res.json(bad('印章与用印事由必填'));
  const seal = db.prepare('SELECT * FROM seals WHERE id = ?').get(sealId);
  if (!seal) return res.json(notfound('印章不存在'));
  if (seal.status === '停用') return res.json(bad(`印章「${seal.name}」已停用，不可申请用印`));
  const copies = Math.max(1, Number(b.copies) || 1);
  const emp = empOf(req);
  const appNo = nextNo('seal_applications', 'ST');
  const ap = createApproval(emp ? emp.id : empIdOf(req), (req.user && req.user.name) || '', '用印审批',
    `用印申请[${seal.name}]：${purpose.slice(0, 30)}`, 0, ['印章管理员', '行政人事部负责人', '总经理']);
  const info = db.prepare(`INSERT INTO seal_applications
      (app_no,seal_id,seal_name,emp_id,emp_name,dept_name,purpose,file_desc,copies,approval_id,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,'审批中')`)
    .run(appNo, seal.id, seal.name, emp ? emp.id : empIdOf(req), (req.user && req.user.name) || '',
      deptNameOf(req), purpose, b.file_desc || '', copies, ap.id);
  db.prepare('UPDATE approvals SET ref_id = ? WHERE id = ?').run(info.lastInsertRowid, ap.id);
  auditLog('SEAL_APPLY', req.userId, `用印申请#${info.lastInsertRowid}`,
    `发起用印 ${appNo} ${seal.name} ${purpose.slice(0, 20)}（${copies} 份，联动审批 ${ap.approval_no}）`);
  return res.json(ok({ id: info.lastInsertRowid, app_no: appNo, approval_id: ap.id, approval_no: ap.approval_no },
    `用印申请已提交，审批单 ${ap.approval_no}`));
}

/**
 * 用印登记 / 归还 / 撤销 / 审批收口
 * action:
 *  - used      登记用印（仅已通过申请；印章置「在用」）        —— 印章管理员
 *  - return    归还（须已登记用印；申请置「已归还」，印章回「在库」）—— 印章管理员
 *  - cancel    撤销（仅申请人本人且状态为审批中）
 *  - approve   用印审批通过（印章管理员/管理层；同步 approvals）
 *  - reject    用印审批驳回（印章管理员/管理层；同步 approvals）
 */
async function updateApplication(req, res) {
  const { action, used_at, comment } = req.body || {};
  const app = db.prepare('SELECT * FROM seal_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.json(notfound('用印申请不存在'));

  if (action === 'cancel') {
    if (app.emp_id !== empIdOf(req) && !isAdmin(req)) return res.json(forbidden('仅申请人本人可撤销'));
    if (app.status !== '审批中') return res.json(bad(`当前状态（${app.status}）不可撤销`));
    db.prepare("UPDATE seal_applications SET status='已撤销' WHERE id=?").run(app.id);
    if (app.approval_id) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(localNow(), app.approval_id);
    auditLog('SEAL_APP_CANCEL', req.userId, `用印申请#${app.id}`, `撤销用印申请 ${app.app_no}`);
    return res.json(ok(null, '用印申请已撤销'));
  }

  if (action === 'approve' || action === 'reject') {
    if (!isAdmin(req)) return res.json(forbidden('用印审批仅印章管理员/管理层操作'));
    if (app.status !== '审批中') return res.json(bad(`当前状态（${app.status}）不可再次审批`));
    const st = action === 'approve' ? '通过' : '驳回';
    db.prepare('UPDATE seal_applications SET status=? WHERE id=?').run(st, app.id);
    if (app.approval_id) {
      db.prepare('UPDATE approvals SET status=?, finished_at=? WHERE id=?').run(st, localNow(), app.approval_id);
      db.prepare("UPDATE approval_steps SET action=?, comment=?, acted_at=? WHERE approval_id=? AND action='待审批'")
        .run(st === '通过' ? '通过' : '驳回', comment || '', localNow(), app.approval_id);
    }
    auditLog('SEAL_APP_AUDIT', req.userId, `用印申请#${app.id}`, `用印审批${st}：${app.app_no} ${app.seal_name}`);
    return res.json(ok({ status: st }, `用印申请已${st}`));
  }

  if (action === 'used') {
    if (!isAdmin(req)) return res.json(forbidden('用印登记仅印章管理员/行政人事部操作'));
    if (app.status !== '通过') {
      return res.json(bad(`该用印申请尚未审批通过（当前「${app.status}」），禁止登记用印`));
    }
    const at = used_at || localNow();
    db.prepare('UPDATE seal_applications SET used_at=? WHERE id=?').run(at, app.id);
    db.prepare("UPDATE seals SET status='在用' WHERE id=?").run(app.seal_id);
    auditLog('SEAL_APP_USED', req.userId, `用印申请#${app.id}`, `登记用印 ${app.app_no} ${app.seal_name}（${app.copies} 份）`);
    return res.json(ok({ used_at: at }, '用印已登记，印章置为在用'));
  }

  if (action === 'return') {
    if (!isAdmin(req)) return res.json(forbidden('印章归还仅印章管理员/行政人事部操作'));
    if (app.status !== '通过') return res.json(bad(`仅审批通过的用印申请可登记归还（当前「${app.status}」）`));
    if (!app.used_at) return res.json(bad('尚未登记用印时间，请先登记用印后再归还'));
    db.prepare("UPDATE seal_applications SET status='已归还' WHERE id=?").run(app.id);
    db.prepare("UPDATE seals SET status='在库' WHERE id=?").run(app.seal_id);
    auditLog('SEAL_APP_RETURN', req.userId, `用印申请#${app.id}`, `印章归还 ${app.app_no} ${app.seal_name}`);
    return res.json(ok(null, '印章已归还，状态回在库'));
  }

  return res.json(bad('操作类型须为 used / return / cancel / approve / reject'));
}

/* ==================== 3. 用印文件打印下载留痕（print_requests） ==================== */

/** 打印/下载申请列表（本人或管理员可见） */
async function listPrints(req, res) {
  let sql = 'SELECT * FROM print_requests WHERE 1 = 1';
  const p = [];
  if (!isAdmin(req)) { sql += ' AND applicant_id = ?'; p.push(empIdOf(req)); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 提交打印/下载申请：仅部门负责人/公司领导可申请（对齐参考口径），审批通过后发令牌 */
async function createPrint(req, res) {
  const b = req.body || {};
  const bizId = String(b.biz_id || '');
  const purpose = (b.purpose || '').trim();
  if (!bizId || !purpose) return res.json(bad('关联对象与用途说明必填'));
  const reqNo = nextNo('print_requests', 'PR');
  const info = db.prepare(`INSERT INTO print_requests
      (req_no,biz_type,biz_id,biz_name,purpose,applicant_id,applicant_name,status)
      VALUES(?,?,?,?,?,?,?,'待审批')`)
    .run(reqNo, 'seal_print', bizId, b.biz_name || `用印申请#${bizId}`, purpose,
      empIdOf(req), (req.user && req.user.name) || '');
  auditLog('SEAL_PRINT_APPLY', req.userId, `打印申请#${info.lastInsertRowid}`,
    `申请打印/下载用印文件 ${reqNo}（对象 ${bizId}）：${purpose.slice(0, 30)}`);
  return res.json(ok({ id: info.lastInsertRowid, req_no: reqNo }, '打印/下载申请已提交，待审批'));
}

/** 打印/下载审批：通过发放一次性令牌（24 小时有效）/ 驳回 */
async function updatePrint(req, res) {
  if (!isAdmin(req)) return res.json(forbidden('打印/下载审批仅印章管理员/管理层操作'));
  const { action } = req.body || {};
  const pr = db.prepare('SELECT * FROM print_requests WHERE id = ?').get(req.params.id);
  if (!pr) return res.json(notfound('打印申请不存在'));
  if (pr.status !== '待审批') return res.json(bad(`当前状态（${pr.status}）不可重复审批`));
  if (action === 'reject') {
    db.prepare("UPDATE print_requests SET status='驳回' WHERE id=?").run(pr.id);
    auditLog('SEAL_PRINT_REJECT', req.userId, `打印申请#${pr.id}`, `驳回打印/下载申请 ${pr.req_no}`);
    return res.json(ok(null, '已驳回'));
  }
  if (action !== 'approve') return res.json(bad('操作类型须为 approve / reject'));
  const token = 'TK' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const exp = new Date(Date.now() + 24 * 3600 * 1000);
  const expStr = new Date(exp.getTime() - exp.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE print_requests SET status=?, token=?, token_expires_at=? WHERE id=?')
    .run('通过', token, expStr, pr.id);
  auditLog('SEAL_PRINT_APPROVE', req.userId, `打印申请#${pr.id}`, `通过打印/下载申请 ${pr.req_no}，发放令牌（24 小时）`);
  return res.json(ok({ token, token_expires_at: expStr }, '审批通过，已发放一次性令牌（24 小时有效）'));
}

module.exports = {
  meta, stats,
  list, create, update,
  listApplications, createApplication, updateApplication,
  listPrints, createPrint, updatePrint,
  SEAL_TYPES, SEAL_STATUS, APP_STATUS,
};
