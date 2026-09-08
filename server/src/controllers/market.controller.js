/**
 * 市场活动控制器（迁移自参考项目 routes/market.js）
 * 对齐参考项目业务逻辑：
 *  - 活动类型固定 10 类；活动名称/类型/开始日期/预算必填，预算必须 > 0（单位：万元）
 *  - 活动申请提交后为「审批中」，审批通过后才可推进与复盘
 *  - 复盘：仅 通过/进行中/已结束 状态可登记；仅发起人或市场部/管理层可登记；
 *    登记实际费用、线索数、关联成交额与总结后置为「已结束」（参考明确：复盘不重复记预算执行）
 *  - 市场费用：事项/类别/金额（>0 万元）必填，登记后为「审批中」
 * 数据表：market_activities / market_fees（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const auditLog = require('../utils/audit');

/** 活动类型（参考项目 ACT_TYPES） */
const ACT_TYPES = ['学术会议', '展会', '科室会', '线上推广', '学术赞助', 'KOL拜访', '终端推广', '经销商年会', '用户培训班', '市场调研'];
/** 活动状态 */
const ACT_STATUS = ['审批中', '通过', '驳回', '已撤销', '进行中', '已结束'];
/** 费用类别 */
const FEE_CATEGORIES = ['学术推广', '会议', '样品', '科室会', '线上推广', '赞助', 'KOL', '其他'];
/** 市场部/管理层：可审批活动与费用、登记复盘 */
const MARKET_ROLES = ['超级管理员', '总经理', '副总', '部门经理', '销售总监'];

/** 本地时间串（与 created_at 的 datetime('now','localtime') 格式一致） */
function ts() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
/** 单号：前缀 + 时间戳(YYYYMMDDHHMMSS) + 2 位随机 */
function makeNo(prefix) {
  return prefix + ts().replace(/[-: ]/g, '').slice(0, 14) + Math.floor(Math.random() * 90 + 10);
}
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
/** 数据范围：区域过滤（对齐参考 dataScope 的 region 过滤） */
function scopeRegion(req) {
  const e = empOf(req);
  return e && e.region ? e.region : '';
}
const isMarketAdmin = (req) => MARKET_ROLES.includes(req.user && req.user.role);

/** 枚举 */
async function meta(req, res) {
  return res.json(ok({ types: ACT_TYPES, status: ACT_STATUS, fee_categories: FEE_CATEGORIES }));
}

/** 活动台账（按大区行权限过滤） */
async function list(req, res) {
  const { type, status, keyword } = req.query;
  let sql = 'SELECT * FROM market_activities WHERE 1=1';
  const p = [];
  const reg = scopeRegion(req);
  if (reg) { sql += " AND (region = ? OR region IS NULL OR region = '全国')"; p.push(reg); }
  if (type) { sql += ' AND type = ?'; p.push(type); }
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (keyword) { sql += ' AND (name LIKE ? OR act_no LIKE ?)'; p.push(`%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY start_date DESC, id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 台账统计（对齐参考：先按行权限取数再在 JS 聚合） */
async function stats(req, res) {
  const reg = scopeRegion(req);
  const rows = reg
    ? db.prepare("SELECT budget, actual_cost, leads, status FROM market_activities WHERE (region = ? OR region IS NULL OR region = '全国')").all(reg)
    : db.prepare('SELECT budget, actual_cost, leads, status FROM market_activities').all();
  const t = { total: rows.length, pending: 0, approved: 0, ongoing: 0, finished: 0, budgetTotal: 0, costTotal: 0, leads: 0 };
  for (const x of rows) {
    if (x.status === '审批中') t.pending++;
    else if (x.status === '通过') t.approved++;
    else if (x.status === '进行中') t.ongoing++;
    else if (x.status === '已结束') t.finished++;
    t.budgetTotal += Number(x.budget) || 0;
    if (x.actual_cost !== null && x.actual_cost !== undefined) t.costTotal += Number(x.actual_cost) || 0;
    t.leads += Number(x.leads) || 0;
  }
  t.budgetTotal = round2(t.budgetTotal);
  t.costTotal = round2(t.costTotal);
  return res.json(ok(t));
}

/** 详情 */
async function detail(req, res) {
  const row = db.prepare('SELECT * FROM market_activities WHERE id = ?').get(req.params.id);
  if (!row) return res.json(notfound('活动不存在'));
  return res.json(ok(row));
}

/** 新增活动申请：名称/类型/开始日期/预算必填，预算 > 0；提交后为「审批中」 */
async function create(req, res) {
  const b = req.body || {};
  if (!b.name || !b.type || !b.start_date || !b.budget) return res.json(bad('活动名称、类型、开始日期、预算为必填项'));
  const budget = Number(b.budget) || 0;
  if (budget <= 0) return res.json(bad('预算必须大于0（单位：万元）'));
  if (!ACT_TYPES.includes(b.type)) return res.json(bad(`活动类型须为：${ACT_TYPES.join('/')}`));
  const emp = empOf(req);
  const no = makeNo('MK');
  const info = db.prepare(`INSERT INTO market_activities
      (act_no,name,type,region,start_date,end_date,budget,target,owner_id,owner_name,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, b.name, b.type, b.region || '全国', b.start_date, b.end_date || null, budget,
      b.target || '', emp ? emp.id : 0, req.user ? req.user.name : '', '审批中', ts());
  auditLog('MARKET_ACT_CREATE', req.userId, `活动#${info.lastInsertRowid}`, `${no} ${b.name}（${b.type}）预算 ${budget}万`);
  return res.json(ok({ id: info.lastInsertRowid, act_no: no }, '活动申请已提交，审批通过后可推进与复盘'));
}

/** 编辑：仅审批中/驳回的活动可改（对齐参考：通过后不得随意变更） */
async function update(req, res) {
  const a = db.prepare('SELECT * FROM market_activities WHERE id = ?').get(req.params.id);
  if (!a) return res.json(notfound('活动不存在'));
  if (!['审批中', '驳回'].includes(a.status)) return res.json(bad(`当前状态[${a.status}]不允许编辑`));
  const emp = empOf(req);
  if (!isMarketAdmin(req) && (!emp || a.owner_id !== emp.id)) return res.json(forbidden('仅活动发起人或市场部/管理层可编辑'));
  const b = req.body || {};
  const budget = b.budget === undefined ? a.budget : Number(b.budget) || 0;
  if (budget <= 0) return res.json(bad('预算必须大于0（单位：万元）'));
  db.prepare(`UPDATE market_activities SET name=?, type=?, region=?, start_date=?, end_date=?, budget=?, target=? WHERE id=?`)
    .run(b.name || a.name, ACT_TYPES.includes(b.type) ? b.type : a.type, b.region || a.region,
      b.start_date || a.start_date, b.end_date ?? a.end_date, budget, b.target ?? a.target, a.id);
  auditLog('MARKET_ACT_UPDATE', req.userId, `活动#${a.id}`, `编辑活动 ${a.act_no}`);
  return res.json(ok(null, '活动已更新'));
}

/** 状态流转：审批通过 / 驳回 / 推进为进行中 / 撤销 */
async function setStatus(req, res) {
  const { status } = req.body || {};
  if (!ACT_STATUS.includes(status)) return res.json(bad(`状态须为：${ACT_STATUS.join('/')}`));
  const a = db.prepare('SELECT * FROM market_activities WHERE id = ?').get(req.params.id);
  if (!a) return res.json(notfound('活动不存在'));
  if (!isMarketAdmin(req)) return res.json(forbidden('仅市场部/管理层可审批活动'));
  if (status === '已撤销') {
    if (a.status === '已结束') return res.json(bad('已结束的活动不可撤销'));
  } else if (a.status !== '审批中') {
    return res.json(bad(`当前状态[${a.status}]，仅审批中的活动可流转`));
  }
  db.prepare('UPDATE market_activities SET status=? WHERE id=?').run(status, a.id);
  auditLog('MARKET_ACT_STATUS', req.userId, `活动#${a.id}`, `${a.act_no} 状态置为 ${status}`);
  return res.json(ok({ status }, `活动状态已置为 ${status}`));
}

/** 活动复盘：仅 通过/进行中/已结束 且 发起人或市场部/管理层 可登记 */
async function finish(req, res) {
  const a = db.prepare('SELECT * FROM market_activities WHERE id = ?').get(req.params.id);
  if (!a) return res.json(notfound('活动不存在'));
  if (!['通过', '进行中', '已结束'].includes(a.status)) return res.json(bad('仅审批通过的活动可复盘'));
  const emp = empOf(req);
  if (!isMarketAdmin(req) && (!emp || a.owner_id !== emp.id)) return res.json(forbidden('仅活动发起人或市场部/管理层可登记复盘'));
  const b = req.body || {};
  db.prepare(`UPDATE market_activities SET status='已结束', actual_cost=?, leads=?, deal_amount=?, summary=?, finished_at=? WHERE id=?`)
    .run(Number(b.actual_cost) || 0, Number(b.leads) || 0, Number(b.deal_amount) || 0, b.summary || '', ts(), a.id);
  // 对齐参考：预算执行由审批通过时统一记账，复盘仅登记台账，避免双记账
  auditLog('MARKET_ACT_FINISH', req.userId, `活动#${a.id}`, `${a.act_no} ${a.name} 实际费用 ${b.actual_cost || 0}万 线索 ${b.leads || 0}`);
  return res.json(ok(null, '复盘已登记，活动已结束'));
}

/** 撤销（软删） */
async function remove(req, res) {
  const a = db.prepare('SELECT * FROM market_activities WHERE id = ?').get(req.params.id);
  if (!a) return res.json(notfound('活动不存在'));
  if (a.status === '已结束') return res.json(bad('已结束的活动不可删除'));
  db.prepare("UPDATE market_activities SET status='已撤销' WHERE id=?").run(a.id);
  auditLog('MARKET_ACT_CANCEL', req.userId, `活动#${a.id}`, `撤销活动 ${a.act_no}`);
  return res.json(ok(null, '活动已撤销'));
}

/* ==================== 市场费用台账 ==================== */

async function fees(req, res) {
  let sql = 'SELECT * FROM market_fees WHERE 1=1';
  const p = [];
  const reg = scopeRegion(req);
  if (reg) { sql += " AND (region = ? OR region IS NULL OR region = '全国')"; p.push(reg); }
  if (req.query.category) { sql += ' AND category = ?'; p.push(req.query.category); }
  if (req.query.status) { sql += ' AND status = ?'; p.push(req.query.status); }
  if (req.query.fee_period) { sql += ' AND fee_period = ?'; p.push(req.query.fee_period); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 费用登记：事项 / 类别 / 金额（>0 万元）必填，登记后为「审批中」 */
async function createFee(req, res) {
  const b = req.body || {};
  if (!b.title || !b.category || b.amount === undefined || Number(b.amount) <= 0)
    return res.json(bad('费用事项、类别、金额（>0，万元）为必填项'));
  const amount = Number(b.amount) || 0;
  const emp = empOf(req);
  const no = makeNo('MF');
  const items = b.items_json ? (Array.isArray(b.items_json) ? JSON.stringify(b.items_json) : String(b.items_json)) : '';
  const info = db.prepare(`INSERT INTO market_fees
      (fee_no,title,category,fee_period,amount,region,owner_id,owner_name,purpose,items_json,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, b.title, FEE_CATEGORIES.includes(b.category) ? b.category : b.category, b.fee_period || '',
      amount, b.region || '全国', emp ? emp.id : 0, req.user ? req.user.name : '', b.purpose || '', items, '审批中', ts());
  auditLog('MARKET_FEE_CREATE', req.userId, `费用#${info.lastInsertRowid}`, `${no} ${b.title} ${amount}万`);
  return res.json(ok({ id: info.lastInsertRowid, fee_no: no }, '市场费用已登记，待审批'));
}

/** 费用审批：通过 / 驳回 / 撤销 */
async function setFeeStatus(req, res) {
  const { status } = req.body || {};
  if (!['审批中', '通过', '驳回', '已撤销'].includes(status)) return res.json(bad('状态须为 审批中/通过/驳回/已撤销'));
  const f = db.prepare('SELECT * FROM market_fees WHERE id = ?').get(req.params.id);
  if (!f) return res.json(notfound('费用单不存在'));
  if (!isMarketAdmin(req)) return res.json(forbidden('仅市场部/管理层可审批费用'));
  if (f.status !== '审批中') return res.json(bad(`当前状态[${f.status}]，不可再次处理`));
  db.prepare('UPDATE market_fees SET status=? WHERE id=?').run(status, f.id);
  auditLog('MARKET_FEE_STATUS', req.userId, `费用#${f.id}`, `${f.fee_no} 状态置为 ${status}`);
  return res.json(ok(null, `费用状态已置为 ${status}`));
}

/** 费用统计：总额 / 按类别汇总 / 状态分布 */
async function feeStats(req, res) {
  const reg = scopeRegion(req);
  const where = reg ? " WHERE (region = ? OR region IS NULL OR region = '全国')" : '';
  const p = reg ? [reg] : [];
  const rows = db.prepare(`SELECT category, status, amount FROM market_fees${where}`).all(...p);
  const byCategory = {};
  const byStatus = {};
  let total = 0;
  for (const x of rows) {
    const amt = Number(x.amount) || 0;
    total += amt;
    const c = x.category || '其他';
    byCategory[c] = round2((byCategory[c] || 0) + amt);
    const s = x.status || '审批中';
    byStatus[s] = round2((byStatus[s] || 0) + amt);
  }
  return res.json(ok({
    total: round2(total),
    count: rows.length,
    by_category: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    by_status: Object.entries(byStatus).map(([status, amount]) => ({ status, amount })),
  }));
}

module.exports = {
  meta, list, stats, detail, create, update, setStatus, finish, remove,
  fees, createFee, setFeeStatus, feeStats,
  ACT_TYPES, FEE_CATEGORIES,
};
