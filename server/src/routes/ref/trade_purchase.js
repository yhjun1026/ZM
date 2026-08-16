/**
 * 采购管理路由 (PRD 第三章: 采购全流程 + 财务数据互通)
 * 采购申请(仅台账) → 采购订单(生效→预生成待确认应付) → 入库(转正式应付+成本凭证+反向同步已入账)
 * → 退货(冲减应付+红字凭证) → 按供应商对账 → 财务付款(反向同步已付款)
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now, safeParse } = require('../../compat/helpers');
const { syncToFinance, matchTradeRole, buildTradeFlow, calcAmount, scanBizAnomaly, addAlert } = require('../../compat/trade_sync');
const { guardSupplier, recalcSupplier } = require('../../compat/partner_common');

router.use(authMiddleware);

/* ===== 表迁移(采购域) ===== */
db.exec(`
CREATE TABLE IF NOT EXISTS t_tr_requests (
  id TEXT PRIMARY KEY, req_no TEXT, title TEXT, reason TEXT DEFAULT '',
  items TEXT DEFAULT '[]', amount REAL DEFAULT 0, total_with_tax REAL DEFAULT 0,
  creator_id TEXT, creator_name TEXT, creator_dept TEXT,
  status TEXT DEFAULT '待审批', flow TEXT DEFAULT '[]', to_po_id TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS t_tr_po (
  id TEXT PRIMARY KEY, po_no TEXT, request_id TEXT DEFAULT '',
  supplier_id TEXT DEFAULT '', supplier_name TEXT DEFAULT '',
  items TEXT DEFAULT '[]', amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0, total_with_tax REAL DEFAULT 0,
  settle_type TEXT DEFAULT '', delivery_date TEXT DEFAULT '', remark TEXT DEFAULT '',
  creator_id TEXT, creator_name TEXT, creator_dept TEXT,
  status TEXT DEFAULT '待审批', pay_status TEXT DEFAULT '未付款',
  fin_status TEXT DEFAULT '未同步', flow TEXT DEFAULT '[]',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS t_tr_grn (
  id TEXT PRIMARY KEY, grn_no TEXT, po_id TEXT, po_no TEXT DEFAULT '',
  supplier_name TEXT DEFAULT '', items TEXT DEFAULT '[]',
  amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0, total_with_tax REAL DEFAULT 0,
  warehouse TEXT DEFAULT '', inspector TEXT DEFAULT '', check_status TEXT DEFAULT '合格',
  creator_id TEXT, creator_name TEXT, creator_dept TEXT,
  status TEXT DEFAULT '待审批', fin_status TEXT DEFAULT '未同步', voucher_no TEXT DEFAULT '',
  flow TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS t_tr_preturn (
  id TEXT PRIMARY KEY, rt_no TEXT, po_id TEXT, grn_id TEXT DEFAULT '',
  po_no TEXT DEFAULT '', supplier_id TEXT DEFAULT '', supplier_name TEXT DEFAULT '',
  items TEXT DEFAULT '[]', total_with_tax REAL DEFAULT 0, reason TEXT DEFAULT '',
  creator_id TEXT, creator_name TEXT, creator_dept TEXT,
  status TEXT DEFAULT '待审批', fin_status TEXT DEFAULT '未同步', voucher_no TEXT DEFAULT '',
  flow TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT
);
`);

/* ===== 权限与可见性 ===== */
const TRADER_ROLES = ['超级管理员', '总经理', '副总', '销售总监', '部门经理'];
function isTrader(u) { return TRADER_ROLES.includes(u.role); }
function isFinance(u) { return u.role === '超级管理员' || u.dept === '财务部'; }
function scopeFilter(u) {
  if (['超级管理员', '总经理', '副总'].includes(u.role) || u.dept === '财务部') return { f: '', p: [] };
  if (u.role === '销售总监') return { f: '', p: [] };
  if (u.role === '部门经理') return { f: ' AND creator_dept = ?', p: [u.dept] };
  return { f: ' AND creator_id = ?', p: [u.id] };
}
function findStep(flow) { return flow.findIndex(s => !s.done); }
function logAction(table, id, act, u) {
  db.prepare(`INSERT INTO t_tr_sync_log (biz_type,biz_id,biz_no,action,status,retries,synced_at) VALUES (?,?,?,?,'success',0,?)`)
    .run('op_' + table, id, '', act + ' by ' + u.name + ' ' + now(), now());
}

/* ============ 1. 采购申请单 (仅业务台账, 不触发财务) ============ */
router.get('/requests', (req, res) => {
  const sf = scopeFilter(req.user);
  const rows = db.prepare(`SELECT * FROM t_tr_requests WHERE 1=1 ${sf.f} ORDER BY created_at DESC`).all(...sf.p);
  rows.forEach(r => { r.flow = safeParse(r.flow, []); r.items = safeParse(r.items, []); });
  return success(res, rows);
});

router.get('/requests/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM t_tr_requests WHERE id = ?').get(req.params.id);
  if (!r) return error(res, 404, '采购申请不存在');
  r.flow = safeParse(r.flow, []); r.items = safeParse(r.items, []);
  return success(res, r);
});

router.post('/requests', (req, res) => {
  const { title, items, reason } = req.body;
  if (!title) return error(res, 400, '采购标题不能为空');
  const list = Array.isArray(items) && items.length ? items : [{ name: title, qty: 1, price: 0, tax_rate: 13 }];
  const amt = calcAmount(list);
  const id = genId('SQ');
  const flow = buildTradeFlow('request', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_requests (id,req_no,title,reason,items,amount,total_with_tax,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, title, reason || '', JSON.stringify(list), amt.amount, amt.total_with_tax, req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  return success(res, { id }, '采购申请已提交(仅业务台账，不触发财务)');
});

router.post('/requests/:id/approve', (req, res) => {
  const r = db.prepare('SELECT * FROM t_tr_requests WHERE id = ?').get(req.params.id);
  if (!r) return error(res, 404, '采购申请不存在');
  if (!['待审批', '审批中'].includes(r.status)) return error(res, 400, '该申请不在审批中');
  const flow = safeParse(r.flow, []);
  const idx = findStep(flow);
  if (idx === -1) return error(res, 400, '流程已结束');
  if (flow[idx].role === 'system') return error(res, 400, '系统步骤无需审批');
  if (!matchTradeRole(req.user, flow[idx].role, r.creator_dept)) return error(res, 403, `当前步骤「${flow[idx].step}」禁止越级审批`);
  flow[idx].done = true; flow[idx].user = req.user.name; flow[idx].time = now();
  if (flow[idx + 1] && flow[idx + 1].role === 'system') {
    flow[idx + 1].done = true; flow[idx + 1].user = '系统'; flow[idx + 1].time = now();
    db.prepare(`UPDATE t_tr_requests SET status='已通过', flow=?, updated_at=? WHERE id=?`).run(JSON.stringify(flow), now(), r.id);
    return success(res, { id: r.id }, '采购申请已通过');
  }
  db.prepare(`UPDATE t_tr_requests SET status='审批中', flow=?, updated_at=? WHERE id=?`).run(JSON.stringify(flow), now(), r.id);
  return success(res, { id: r.id }, '审批成功');
});

router.post('/requests/:id/reject', (req, res) => {
  const remark = (req.body || {}).remark;
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const r = db.prepare('SELECT * FROM t_tr_requests WHERE id = ?').get(req.params.id);
  if (!r) return error(res, 404, '采购申请不存在');
  if (!['待审批', '审批中'].includes(r.status)) return error(res, 400, '该申请不在审批中');
  const flow = safeParse(r.flow, []);
  const idx = findStep(flow);
  if (idx === -1 || flow[idx].role === 'system') return error(res, 400, '流程已结束');
  if (!matchTradeRole(req.user, flow[idx].role, r.creator_dept)) return error(res, 403, '禁止越级审批');
  flow[idx].done = true; flow[idx].user = req.user.name; flow[idx].time = now(); flow[idx].opinion = '驳回: ' + remark;
  db.prepare(`UPDATE t_tr_requests SET status='已驳回', flow=?, updated_at=? WHERE id=?`).run(JSON.stringify(flow), now(), r.id);
  return success(res, { id: r.id }, '已驳回');
});

/* 申请转采购订单 */
router.post('/requests/:id/to-order', (req, res) => {
  if (!isTrader(req.user)) return error(res, 403, '仅采购管理员可创建采购订单');
  const r = db.prepare('SELECT * FROM t_tr_requests WHERE id = ?').get(req.params.id);
  if (!r) return error(res, 404, '采购申请不存在');
  if (r.status !== '已通过') return error(res, 400, '仅已通过的申请可转采购订单');
  if (r.to_po_id) return error(res, 400, '该申请已转订单 ' + r.to_po_id);
  const { supplier_id, supplier_name, settle_type, delivery_date } = req.body || {};
  if (!supplier_name) return error(res, 400, '请选择供应商');
  // 客户/供应商模块互通: 校验备案状态, 未建档自动捕捉建档, 停用/淘汰拦截
  const g = guardSupplier(supplier_name.trim(), req.user.name, req.user.dept);
  if (!g.ok) return error(res, g.code || 400, g.msg);
  const items = safeParse(r.items, []);
  const amt = calcAmount(items);
  const id = genId('CG');
  const flow = buildTradeFlow('po', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_po (id,po_no,request_id,supplier_id,supplier_name,items,amount,tax_amount,total_with_tax,settle_type,delivery_date,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, r.id, supplier_id || '', supplier_name, JSON.stringify(items), amt.amount, amt.tax_amount, amt.total_with_tax,
      settle_type || '月结', delivery_date || '', req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  db.prepare(`UPDATE t_tr_requests SET to_po_id=?, status='已转单', updated_at=? WHERE id=?`).run(id, now(), r.id);
  scanBizAnomaly('po', id, id, items, amt.total_with_tax);
  return success(res, { id }, '已生成采购订单，等待审批');
});

/* ============ 2. 采购订单 (核心财务联动节点) ============ */
router.get('/', (req, res) => {
  const sf = scopeFilter(req.user);
  const { status, keyword } = req.query;
  let sql = `SELECT * FROM t_tr_po WHERE 1=1 ${sf.f}`;
  const p = [...sf.p];
  if (status && status !== 'all') { sql += ' AND status = ?'; p.push(status); }
  if (keyword) { sql += ' AND (po_no LIKE ? OR supplier_name LIKE ?)'; p.push('%' + keyword + '%', '%' + keyword + '%'); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...p);
  rows.forEach(r => { r.flow = safeParse(r.flow, []); r.items = safeParse(r.items, []); });
  return success(res, rows);
});

router.get('/stats', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_tr_po').all();
  const grns = db.prepare(`SELECT po_id, SUM(total_with_tax) s FROM t_tr_grn WHERE status='已生效' GROUP BY po_id`).all();
  const pays = db.prepare(`SELECT po_id, SUM(amount) s FROM t_tr_pay GROUP BY po_id`).all();
  const rts = db.prepare(`SELECT po_id, SUM(total_with_tax) s FROM t_tr_preturn WHERE status='已生效' GROUP BY po_id`).all();
  const gmap = {}, pmap = {}, rtmap = {};
  grns.forEach(g => gmap[g.po_id] = g.s); pays.forEach(x => pmap[x.po_id] = x.s); rts.forEach(x => rtmap[x.po_id] = x.s);
  let effective = 0, totalAmount = 0, payable = 0, paid = 0;
  rows.forEach(r => {
    if (['已生效', '部分入库', '全部入库'].includes(r.status)) { effective++; totalAmount += r.total_with_tax; payable += (gmap[r.id] || r.total_with_tax) - (rtmap[r.id] || 0); }
    paid += pmap[r.id] || 0;
  });
  return success(res, {
    total: rows.length, effective, pending: rows.filter(r => ['待审批', '审批中'].includes(r.status)).length,
    totalAmount: Math.round(totalAmount * 100) / 100, payable: Math.round(payable * 100) / 100,
    paid: Math.round(paid * 100) / 100, unpaid: Math.round((payable - paid) * 100) / 100
  });
});

router.get('/suppliers-lite', (req, res) => {
  const rows = db.prepare(`SELECT id,name,status FROM suppliers ORDER BY name`).all();
  return success(res, rows.filter(r => ['合作中', '已合作', '合格'].includes(r.status)).concat(rows.filter(r => !['合作中', '已合作', '合格'].includes(r.status))));
});

router.get('/reconcile', (req, res) => {
  const pos = db.prepare(`SELECT * FROM t_tr_po WHERE status IN ('已生效','部分入库','全部入库')`).all();
  const grns = db.prepare(`SELECT po_id, SUM(total_with_tax) s, COUNT(*) n FROM t_tr_grn WHERE status='已生效' GROUP BY po_id`).all();
  const rts = db.prepare(`SELECT po_id, SUM(total_with_tax) s FROM t_tr_preturn WHERE status='已生效' GROUP BY po_id`).all();
  const pays = db.prepare(`SELECT po_id, SUM(amount) s FROM t_tr_pay GROUP BY po_id`).all();
  const gmap = {}, rtmap = {}, pmap = {}, gcnt = {};
  grns.forEach(g => { gmap[g.po_id] = g.s; gcnt[g.po_id] = g.n; });
  rts.forEach(x => rtmap[x.po_id] = x.s); pays.forEach(x => pmap[x.po_id] = x.s);
  const bySupplier = {};
  pos.forEach(p => {
    const confirmed = gmap[p.id] !== undefined ? gmap[p.id] : p.total_with_tax;
    const payable = confirmed - (rtmap[p.id] || 0);
    const paid = pmap[p.id] || 0;
    if (!bySupplier[p.supplier_name]) bySupplier[p.supplier_name] = { supplier_name: p.supplier_name, orders: 0, order_amount: 0, confirmed: 0, returned: 0, payable: 0, paid: 0, balance: 0 };
    const s = bySupplier[p.supplier_name];
    s.orders++; s.order_amount += p.total_with_tax; s.confirmed += confirmed; s.returned += (rtmap[p.id] || 0);
    s.payable += payable; s.paid += paid; s.balance += payable - paid;
  });
  return success(res, Object.values(bySupplier).map(s => {
    Object.keys(s).forEach(k => { if (k !== 'supplier_name' && k !== 'orders') s[k] = Math.round(s[k] * 100) / 100; });
    return s;
  }));
});

/* ============ 采购趋势统计 ============ */
router.get('/stats/trend', (req, res) => {
  // 月度趋势（最近12个月）
  const monthly = db.prepare(`
    SELECT substr(created_at,1,5) || CASE WHEN substr(created_at,7,1)='-' THEN '0'||substr(created_at,6,1) ELSE substr(created_at,6,2) END as month,
           COUNT(*) as count,
           ROUND(SUM(total_with_tax),2) as amount,
           SUM(CASE WHEN status IN ('已生效','部分入库','全部入库') THEN 1 ELSE 0 END) as effective
    FROM t_tr_po
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();

  // 入库月度趋势
  const grnMonthly = db.prepare(`
    SELECT substr(created_at,1,5) || CASE WHEN substr(created_at,7,1)='-' THEN '0'||substr(created_at,6,1) ELSE substr(created_at,6,2) END as month,
           COUNT(*) as count,
           ROUND(SUM(total_with_tax),2) as amount
    FROM t_tr_grn
    WHERE status='已生效'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();

  // 付款月度趋势
  const payMonthly = db.prepare(`
    SELECT substr(created_at,1,5) || CASE WHEN substr(created_at,7,1)='-' THEN '0'||substr(created_at,6,1) ELSE substr(created_at,6,2) END as month,
           COUNT(*) as count,
           ROUND(SUM(amount),2) as amount
    FROM t_tr_pay
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();

  // 供应商排名 TOP10
  const topSuppliers = db.prepare(`
    SELECT supplier_name,
           COUNT(*) as orders,
           ROUND(SUM(total_with_tax),2) as total_amount
    FROM t_tr_po
    WHERE status IN ('已生效','部分入库','全部入库')
    GROUP BY supplier_name
    ORDER BY total_amount DESC
    LIMIT 10
  `).all();

  // 状态分布
  const statusDist = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM t_tr_po
    GROUP BY status
  `).all();

  // 物料采购统计 TOP10（从items JSON展开）
  const allOrders = db.prepare(`SELECT items FROM t_tr_po WHERE status IN ('已生效','部分入库','全部入库')`).all();
  const prodMap = {};
  allOrders.forEach(o => {
    const items = safeParse(o.items, []);
    items.forEach(it => {
      const name = it.name || '未命名';
      const qty = parseFloat(it.qty) || 0;
      const price = parseFloat(it.price) || 0;
      const taxRate = parseFloat(it.tax_rate) || 0;
      const itemAmount = qty * price * (1 + taxRate / 100);
      if (!prodMap[name]) prodMap[name] = { name, qty: 0, amount: 0 };
      prodMap[name].qty += qty;
      prodMap[name].amount += itemAmount;
    });
  });
  const topProducts = Object.values(prodMap).sort((a,b) => b.amount - a.amount).slice(0, 10).map(p => ({
    name: p.name, qty: Math.round(p.qty * 100) / 100, amount: Math.round(p.amount * 100) / 100
  }));

  // 汇总
  const effOrders = topSuppliers.reduce((s,c) => s + c.orders, 0);
  const effAmount = topSuppliers.reduce((s,c) => s + c.total_amount, 0);
  const avgAmount = effOrders > 0 ? Math.round(effAmount / effOrders * 100) / 100 : 0;
  const maxOrder = db.prepare(`SELECT MAX(total_with_tax) as max FROM t_tr_po WHERE status IN ('已生效','部分入库','全部入库')`).get();
  const summary = {
    avgAmount,
    maxAmount: maxOrder ? Math.round(maxOrder.max * 100) / 100 : 0,
    activeSuppliers: topSuppliers.length,
    totalMonths: monthly.length
  };

  return success(res, { monthly, grnMonthly, payMonthly, topSuppliers, statusDist, topProducts, summary });
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM t_tr_po WHERE id = ?').get(req.params.id);
  if (!p) return error(res, 404, '采购订单不存在');
  p.flow = safeParse(p.flow, []); p.items = safeParse(p.items, []);
  p.grns = db.prepare('SELECT * FROM t_tr_grn WHERE po_id = ? ORDER BY created_at DESC').all(p.id).map(g => (g.items = safeParse(g.items, []), g));
  p.returns = db.prepare('SELECT * FROM t_tr_preturn WHERE po_id = ? ORDER BY created_at DESC').all(p.id);
  p.ap = db.prepare(`SELECT * FROM t_tr_ap WHERE source_type='po' AND source_id=?`).all(p.id);
  p.pays = db.prepare('SELECT * FROM t_tr_pay WHERE po_id = ? ORDER BY created_at DESC').all(p.id);
  return success(res, p);
});

router.post('/', (req, res) => {
  if (!isTrader(req.user)) return error(res, 403, '仅采购管理员可创建采购订单，普通员工请先提交采购申请');
  const { supplier_id, supplier_name, items, settle_type, delivery_date, remark } = req.body;
  if (!supplier_name) return error(res, 400, '请选择供应商');
  // 客户/供应商模块互通: 校验备案状态, 未建档自动捕捉建档, 停用/淘汰拦截
  const g = guardSupplier(supplier_name.trim(), req.user.name, req.user.dept);
  if (!g.ok) return error(res, g.code || 400, g.msg);
  if (!Array.isArray(items) || !items.length) return error(res, 400, '请至少填写一行采购物料');
  const amt = calcAmount(items);
  if (amt.total_with_tax <= 0) return error(res, 400, '订单金额必须大于0');
  const id = genId('CG');
  const flow = buildTradeFlow('po', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_po (id,po_no,supplier_id,supplier_name,items,amount,tax_amount,total_with_tax,settle_type,delivery_date,remark,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, supplier_id || '', supplier_name, JSON.stringify(items), amt.amount, amt.tax_amount, amt.total_with_tax,
      settle_type || '月结', delivery_date || '', remark || '', req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  scanBizAnomaly('po', id, id, items, amt.total_with_tax);
  logAction('po', id, '创建订单', req.user);
  return success(res, { id }, '采购订单已提交，等待审批');
});

function approveGeneric(res, req, table, idCol, effectCb) {
  const item = db.prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(req.params.id);
  if (!item) return error(res, 404, '单据不存在');
  if (!['待审批', '审批中'].includes(item.status)) return error(res, 400, '该单据不在审批中');
  const flow = safeParse(item.flow, []);
  const idx = findStep(flow);
  if (idx === -1) return error(res, 400, '流程已结束');
  if (flow[idx].role === 'system') return error(res, 400, '系统步骤无需审批');
  if (!matchTradeRole(req.user, flow[idx].role, item.creator_dept)) return error(res, 403, `当前步骤「${flow[idx].step}」禁止越级审批`);
  flow[idx].done = true; flow[idx].user = req.user.name; flow[idx].time = now();
  const next = flow[idx + 1];
  if (next && next.role === 'system') {
    next.done = true; next.user = '系统'; next.time = now();
    db.prepare(`UPDATE ${table} SET status='已生效', flow=?, updated_at=? WHERE ${idCol}=?`).run(JSON.stringify(flow), now(), item[idCol]);
    const r = effectCb ? effectCb(item) : null;
    logAction(table, item[idCol], '审批通过生效', req.user);
    return success(res, { id: item[idCol], sync: r }, '审批通过，单据已生效' + (r && r.msg ? '；财务联动: ' + r.msg : ''));
  }
  db.prepare(`UPDATE ${table} SET status='审批中', flow=?, updated_at=? WHERE ${idCol}=?`).run(JSON.stringify(flow), now(), item[idCol]);
  return success(res, { id: item[idCol] }, '审批成功');
}

function rejectGeneric(res, req, table, idCol) {
  const remark = (req.body || {}).remark;
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const item = db.prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(req.params.id);
  if (!item) return error(res, 404, '单据不存在');
  if (!['待审批', '审批中'].includes(item.status)) return error(res, 400, '该单据不在审批中');
  const flow = safeParse(item.flow, []);
  const idx = findStep(flow);
  if (idx === -1 || flow[idx].role === 'system') return error(res, 400, '流程已结束');
  if (!matchTradeRole(req.user, flow[idx].role, item.creator_dept)) return error(res, 403, '禁止越级审批');
  flow[idx].done = true; flow[idx].user = req.user.name; flow[idx].time = now(); flow[idx].opinion = '驳回: ' + remark;
  db.prepare(`UPDATE ${table} SET status='已驳回', flow=?, updated_at=? WHERE ${idCol}=?`).run(JSON.stringify(flow), now(), item[idCol]);
  return success(res, { id: item[idCol] }, '已驳回');
}

router.post('/:id/approve', (req, res) => {
  approveGeneric(res, req, 't_tr_po', 'id', item => {
    const r = syncToFinance('po_effective', item.id, item.po_no);
    // 互通: 订单生效自动抓取合作数据重算供应商AI评分
    try { recalcSupplier(item.supplier_name, true); } catch (e) { console.error('recalcSupplier fail', e.message); }
    return r;
  });
});
router.post('/:id/reject', (req, res) => rejectGeneric(res, req, 't_tr_po', 'id'));

router.post('/:id/void', (req, res) => {
  if (!isTrader(req.user)) return error(res, 403, '无权作废采购订单');
  const p = db.prepare('SELECT * FROM t_tr_po WHERE id = ?').get(req.params.id);
  if (!p) return error(res, 404, '采购订单不存在');
  if (p.status === '已作废') return error(res, 400, '订单已作废');
  const hasGrn = db.prepare(`SELECT COUNT(*) n FROM t_tr_grn WHERE po_id=? AND status='已生效'`).get(p.id).n;
  const hasPay = db.prepare(`SELECT COUNT(*) n FROM t_tr_pay WHERE po_id=?`).get(p.id).n;
  if (hasGrn) return error(res, 400, '订单已存在生效入库单(财务已入账)，禁止作废，请走退货流程');
  if (hasPay) return error(res, 400, '订单已发生付款，禁止作废');
  db.prepare(`UPDATE t_tr_po SET status='已作废', updated_at=? WHERE id=?`).run(now(), p.id);
  const r = syncToFinance('po_void', p.id, p.po_no);
  logAction('po', p.id, '作废', req.user);
  return success(res, { id: p.id, sync: r }, '订单已作废，财务预登记同步冲销');
});

/* ============ 3. 采购入库单 ============ */
router.post('/grn', (req, res) => {
  if (!isTrader(req.user)) return error(res, 403, '无权创建入库单');
  const { po_id, items, warehouse, inspector, check_status } = req.body;
  const po = db.prepare('SELECT * FROM t_tr_po WHERE id = ?').get(po_id);
  if (!po) return error(res, 404, '采购订单不存在');
  if (!['已生效', '部分入库'].includes(po.status)) return error(res, 400, '仅已生效订单可创建入库单');
  if (!Array.isArray(items) || !items.length) return error(res, 400, '请填写实际入库明细');
  const amt = calcAmount(items);
  if (amt.total_with_tax <= 0) return error(res, 400, '入库金额必须大于0');
  const id = genId('RK');
  const flow = buildTradeFlow('grn', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_grn (id,grn_no,po_id,po_no,supplier_name,items,amount,tax_amount,total_with_tax,warehouse,inspector,check_status,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, po_id, po.po_no, po.supplier_name, JSON.stringify(items), amt.amount, amt.tax_amount, amt.total_with_tax,
      warehouse || '主仓库', inspector || req.user.name, check_status || '合格', req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  return success(res, { id }, '入库单已提交，等待审批');
});

router.post('/grn/:id/approve', (req, res) => {
  approveGeneric(res, req, 't_tr_grn', 'id', item => syncToFinance('grn_effective', item.id, item.grn_no));
});
router.post('/grn/:id/reject', (req, res) => rejectGeneric(res, req, 't_tr_grn', 'id'));

/* ============ 4. 采购退货单 ============ */
router.post('/preturn', (req, res) => {
  if (!isTrader(req.user)) return error(res, 403, '无权创建退货单');
  const { po_id, grn_id, items, reason } = req.body;
  const po = db.prepare('SELECT * FROM t_tr_po WHERE id = ?').get(po_id);
  if (!po) return error(res, 404, '采购订单不存在');
  const grn = db.prepare(`SELECT * FROM t_tr_grn WHERE id=? AND po_id=? AND status='已生效'`).get(grn_id, po_id);
  if (!grn) return error(res, 400, '退货必须关联该订单下已生效的入库单');
  if (!Array.isArray(items) || !items.length) return error(res, 400, '请填写退货明细');
  const amt = calcAmount(items);
  if (amt.total_with_tax <= 0) return error(res, 400, '退货金额必须大于0');
  const id = genId('CT');
  const flow = buildTradeFlow('preturn', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_preturn (id,rt_no,po_id,grn_id,po_no,supplier_id,supplier_name,items,total_with_tax,reason,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, po_id, grn_id, po.po_no, po.supplier_id, po.supplier_name, JSON.stringify(items), amt.total_with_tax,
      reason || '', req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  return success(res, { id }, '退货单已提交，等待审批');
});

router.post('/preturn/:id/approve', (req, res) => {
  approveGeneric(res, req, 't_tr_preturn', 'id', item => syncToFinance('preturn_effective', item.id, item.rt_no));
});
router.post('/preturn/:id/reject', (req, res) => rejectGeneric(res, req, 't_tr_preturn', 'id'));

/* ============ 5. 入库/退货/付款列表 ============ */
router.get('/grns/list', (req, res) => {
  const sf = scopeFilter(req.user);
  const rows = db.prepare(`SELECT * FROM t_tr_grn WHERE 1=1 ${sf.f} ORDER BY created_at DESC`).all(...sf.p);
  rows.forEach(r => { r.items = safeParse(r.items, []); });
  return success(res, rows);
});
router.get('/preturns/list', (req, res) => {
  const sf = scopeFilter(req.user);
  const rows = db.prepare(`SELECT * FROM t_tr_preturn WHERE 1=1 ${sf.f} ORDER BY created_at DESC`).all(...sf.p);
  rows.forEach(r => { r.items = safeParse(r.items, []); });
  return success(res, rows);
});

module.exports = router;
