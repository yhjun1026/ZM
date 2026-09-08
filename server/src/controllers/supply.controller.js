/**
 * 渠道履约控制器（迁移自参考项目 routes/dms.js 的 supply 段 + routes/daily.js 办公用品段）
 * 对齐参考项目业务逻辑：
 *  - 供货登记（supply_registrations）：登记后为「审批中」，审批通过才入 supply_items 明细台账，
 *    并按 库存 <= 预警线 自动置「库存预警」，否则「在库」（参考 approvals.js #306 用品新增审批通过联动）
 *  - 供货申请（supply_applications）：用品与数量必填，库存不足直接拦截；
 *    审批通过后扣减库存，剩余 <= 预警线 自动置「库存预警」（参考 approvals.js 用品领用审批通过联动）
 *  - 明细台账（supply_items）库存/预警线由管理员调整
 *  - DMS 订单（dms_orders）只读查看
 * 数据表：supply_items / supply_registrations / supply_applications / dms_orders（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const auditLog = require('../utils/audit');

/** 用品/物料分类 */
const CATEGORIES = ['办公文具', '打印耗材', '清洁用品', 'IT耗材', '劳保用品', '后勤保障', '其他'];
/** 供货登记状态 */
const REG_STATUS = ['审批中', '通过', '驳回'];
/** 供货申请状态 */
const APP_STATUS = ['审批中', '通过', '驳回', '已撤销'];
/** 明细状态 */
const ITEM_STATUS = ['在库', '库存预警', '停用'];
/** 管理员：可调整明细库存、审批申请与登记 */
const ADMIN_ROLES = ['超级管理员', '总经理', '副总', '销售总监', '部门经理'];

/** 当前登录用户对应的 employee 记录 */
function empOf(req) {
  try {
    const u = db.prepare('SELECT emp_id, name FROM users WHERE id = ?').get(req.userId);
    if (!u) return null;
    return db.prepare('SELECT * FROM employees WHERE emp_no = ? OR name = ?').get(u.emp_id || '', u.name) || null;
  } catch (e) {
    return null;
  }
}
const isAdmin = (req) => ADMIN_ROLES.includes(req.user && req.user.role);

/** 生成单号：前缀 + yyyymmdd + 4 位序号 */
function makeNo(table, prefix) {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const n = db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c + 1;
  return `${prefix}${d}${String(n).padStart(4, '0')}`;
}

/** 枚举 */
async function meta(req, res) {
  return res.json(ok({
    categories: CATEGORIES,
    reg_status: REG_STATUS,
    app_status: APP_STATUS,
    item_status: ITEM_STATUS,
  }));
}

/** 统计：明细种类/预警数、申请数、登记数、DMS 订单数与金额 */
async function stats(req, res) {
  const items = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(stock),0) stock FROM supply_items').get();
  const warn = db.prepare("SELECT COUNT(*) c FROM supply_items WHERE stock <= warn_level AND status <> '停用'").get().c;
  const apps = db.prepare('SELECT COUNT(*) c FROM supply_applications').get().c;
  const appsPending = db.prepare("SELECT COUNT(*) c FROM supply_applications WHERE status='审批中'").get().c;
  const regs = db.prepare('SELECT COUNT(*) c FROM supply_registrations').get().c;
  const regsPending = db.prepare("SELECT COUNT(*) c FROM supply_registrations WHERE status='审批中'").get().c;
  const orders = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount),0) amount FROM dms_orders').get();
  return res.json(ok({
    item_count: items.c,
    item_stock: items.stock,
    warn_count: warn,
    app_count: apps,
    app_pending: appsPending,
    reg_count: regs,
    reg_pending: regsPending,
    order_count: orders.c,
    order_amount: Math.round((orders.amount || 0) * 100) / 100,
  }));
}

/* ==================== 供货明细台账（supply_items） ==================== */

async function items(req, res) {
  const { category, keyword } = req.query;
  let sql = 'SELECT * FROM supply_items WHERE 1=1';
  const p = [];
  if (category) { sql += ' AND category = ?'; p.push(category); }
  if (keyword) { sql += ' AND (name LIKE ? OR spec LIKE ?)'; p.push(`%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY category, id';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 明细调整：库存 / 预警线，按预警线回算状态（对齐参考 PUT /supplies/:id） */
async function updateItem(req, res) {
  if (!isAdmin(req)) return res.json(forbidden('仅管理员可调整明细库存'));
  const item = db.prepare('SELECT * FROM supply_items WHERE id = ?').get(req.params.id);
  if (!item) return res.json(notfound('明细不存在'));
  const b = req.body || {};
  const ns = b.stock === undefined || b.stock === null ? item.stock : Number(b.stock) || 0;
  const nw = b.warn_level === undefined || b.warn_level === null ? item.warn_level : Number(b.warn_level) || 0;
  const st = b.status && ITEM_STATUS.includes(b.status) ? b.status : (ns <= nw ? '库存预警' : '在库');
  db.prepare('UPDATE supply_items SET name=?, category=?, spec=?, unit=?, stock=?, warn_level=?, status=? WHERE id=?')
    .run(b.name || item.name, CATEGORIES.includes(b.category) ? b.category : item.category,
      b.spec ?? item.spec, b.unit || item.unit, ns, nw, st, item.id);
  auditLog('SUPPLY_ITEM_UPDATE', req.userId, `用品#${item.id}`, `${item.name} 库存=${ns} 预警线=${nw}`);
  return res.json(ok({ stock: ns, status: st }, '明细已更新'));
}

/* ==================== 供货登记（supply_registrations） ==================== */

async function registrations(req, res) {
  let sql = 'SELECT * FROM supply_registrations WHERE 1=1';
  const p = [];
  if (req.query.status) { sql += ' AND status = ?'; p.push(req.query.status); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 登记：先落台账（审批中），审批通过后才入 supply_items */
async function createRegistration(req, res) {
  const b = req.body || {};
  const { name, category, spec, unit, stock, warn_level } = b;
  if (!name) return res.json(bad('用品名称必填'));
  const emp = empOf(req);
  const info = db.prepare(`INSERT INTO supply_registrations
      (name,category,spec,unit,stock,warn_level,applicant_id,applicant_name)
      VALUES(?,?,?,?,?,?,?,?)`)
    .run(name, CATEGORIES.includes(category) ? category : '办公文具', spec || '', unit || '个',
      Number(stock) || 0, Number(warn_level) || 10, emp ? emp.id : 0, req.user ? req.user.name : '');
  auditLog('SUPPLY_REG_CREATE', req.userId, `登记#${info.lastInsertRowid}`, `${name}×${stock || 0}${unit || '个'}（待审批）`);
  return res.json(ok({ id: info.lastInsertRowid }, '供货登记已提交，审批通过后入明细台账'));
}

/** 登记状态流转：通过 → 写入 supply_items；驳回 → 仅回退台账 */
async function setRegistrationStatus(req, res) {
  const { status } = req.body || {};
  if (!REG_STATUS.includes(status)) return res.json(bad('状态须为 审批中/通过/驳回'));
  if (!isAdmin(req)) return res.json(forbidden('仅管理员可审批供货登记'));
  const reg = db.prepare('SELECT * FROM supply_registrations WHERE id = ?').get(req.params.id);
  if (!reg) return res.json(notfound('登记单不存在'));
  if (reg.status !== '审批中') return res.json(bad(`登记单当前状态[${reg.status}]，不可再次处理`));

  if (status === '通过') {
    const st = (reg.stock || 0) <= (reg.warn_level || 10) ? '库存预警' : '在库';
    db.prepare('INSERT INTO supply_items(name,category,spec,unit,stock,warn_level,status) VALUES(?,?,?,?,?,?,?)')
      .run(reg.name, reg.category, reg.spec, reg.unit, reg.stock, reg.warn_level, st);
    auditLog('SUPPLY_REG_APPROVE', req.userId, `登记#${reg.id}`, `${reg.name}×${reg.stock || 0}${reg.unit || '个'} 入明细台账（${st}）`);
  } else {
    auditLog('SUPPLY_REG_REJECT', req.userId, `登记#${reg.id}`, `驳回登记 ${reg.name}`);
  }
  db.prepare('UPDATE supply_registrations SET status=? WHERE id=?').run(status, reg.id);
  return res.json(ok(null, status === '通过' ? '登记已通过并入库' : '登记已驳回'));
}

/* ==================== 供货申请（supply_applications） ==================== */

async function applications(req, res) {
  let sql = `SELECT a.*, i.unit, i.stock, i.category
    FROM supply_applications a LEFT JOIN supply_items i ON a.item_id = i.id WHERE 1=1`;
  const p = [];
  if (req.query.status) { sql += ' AND a.status = ?'; p.push(req.query.status); }
  if (!isAdmin(req)) {
    const emp = empOf(req);
    sql += ' AND a.applicant_id = ?'; p.push(emp ? emp.id : 0);
  }
  sql += ' ORDER BY a.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 申请：用品与数量必填，库存不足拦截（对齐参考 POST /supplies/apply） */
async function createApplication(req, res) {
  const { item_id, qty, reason } = req.body || {};
  if (!item_id || !qty) return res.json(bad('用品与数量必填'));
  const q = Number(qty);
  if (!(q > 0)) return res.json(bad('申请数量须大于 0'));
  const item = db.prepare('SELECT * FROM supply_items WHERE id = ?').get(item_id);
  if (!item) return res.json(notfound('用品不存在'));
  if (item.stock < q) return res.json(bad(`库存不足：当前仅剩 ${item.stock}${item.unit}`));

  const emp = empOf(req);
  const dept = req.user ? req.user.dept : '';
  const no = makeNo('supply_applications', 'SA');
  const info = db.prepare(`INSERT INTO supply_applications
      (app_no,item_id,item_name,qty,applicant_id,applicant_name,dept_name,reason)
      VALUES(?,?,?,?,?,?,?,?)`)
    .run(no, item.id, item.name, q, emp ? emp.id : 0, req.user ? req.user.name : '', dept || '', reason || '');
  auditLog('SUPPLY_APP_CREATE', req.userId, `申请#${info.lastInsertRowid}`, `${no} ${item.name}×${q}`);
  return res.json(ok({ id: info.lastInsertRowid, app_no: no }, '供货申请已提交，审批通过后扣减库存'));
}

/** 申请状态流转：通过 → 扣库存并按预警线置状态；驳回 / 已撤销 → 仅回退 */
async function setApplicationStatus(req, res) {
  const { status } = req.body || {};
  if (!APP_STATUS.includes(status)) return res.json(bad('状态须为 审批中/通过/驳回/已撤销'));
  const app = db.prepare('SELECT * FROM supply_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.json(notfound('申请单不存在'));
  if (status === '已撤销') {
    const emp = empOf(req);
    if (!isAdmin(req) && (!emp || app.applicant_id !== emp.id)) return res.json(forbidden('仅申请人本人或管理员可撤销'));
    if (app.status !== '审批中') return res.json(bad(`当前状态[${app.status}]，不可撤销`));
    db.prepare("UPDATE supply_applications SET status='已撤销' WHERE id=?").run(app.id);
    auditLog('SUPPLY_APP_CANCEL', req.userId, `申请#${app.id}`, `撤销申请 ${app.app_no}`);
    return res.json(ok(null, '申请已撤销'));
  }
  if (!isAdmin(req)) return res.json(forbidden('仅管理员可审批供货申请'));
  if (app.status !== '审批中') return res.json(bad(`申请单当前状态[${app.status}]，不可再次处理`));

  if (status === '通过') {
    const item = db.prepare('SELECT * FROM supply_items WHERE id = ?').get(app.item_id);
    if (!item) return res.json(notfound('关联用品不存在，无法出库'));
    if (item.stock < app.qty) return res.json(bad(`库存不足：当前仅剩 ${item.stock}${item.unit}，无法出库`));
    const remain = Math.max(0, item.stock - app.qty);
    db.prepare('UPDATE supply_items SET stock=?, status=? WHERE id=?')
      .run(remain, remain <= item.warn_level ? '库存预警' : '在库', item.id);
    auditLog('SUPPLY_APP_APPROVE', req.userId, `申请#${app.id}`, `${app.app_no} 出库 ${app.item_name}×${app.qty}，剩余 ${remain}`);
  } else {
    auditLog('SUPPLY_APP_REJECT', req.userId, `申请#${app.id}`, `驳回申请 ${app.app_no}`);
  }
  db.prepare('UPDATE supply_applications SET status=? WHERE id=?').run(status, app.id);
  return res.json(ok(null, status === '通过' ? '申请已通过并扣减库存' : '申请已驳回'));
}

/* ==================== DMS 订单（只读） ==================== */

async function orders(req, res) {
  let sql = `SELECT o.*, d.name distributor_name, d.identity distributor_identity,
      d.credit_limit, d.credit_used, e.name sales_name
    FROM dms_orders o
    LEFT JOIN distributors d ON o.distributor_id = d.id
    LEFT JOIN employees e ON o.sales_id = e.id WHERE 1=1`;
  const p = [];
  if (req.query.status) { sql += ' AND o.status = ?'; p.push(req.query.status); }
  if (req.query.distributor_id) { sql += ' AND o.distributor_id = ?'; p.push(req.query.distributor_id); }
  if (req.query.keyword) {
    sql += ' AND (o.order_no LIKE ? OR o.product LIKE ? OR d.name LIKE ?)';
    p.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`, `%${req.query.keyword}%`);
  }
  sql += ' ORDER BY o.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

module.exports = {
  meta, stats,
  items, updateItem,
  registrations, createRegistration, setRegistrationStatus,
  applications, createApplication, setApplicationStatus,
  orders,
  CATEGORIES,
};
