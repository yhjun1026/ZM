/**
 * 销售管理路由 (PRD 第四章: 销售全流程 + 财务数据互通)
 * 销售订单(生效→预生成待确认应收) → 出库(转正式应收+收入凭证+销项税+反向同步已入账)
 * → 退换货(冲减应收+红字凭证) → 回款对账可视化(回款由财务登记反向同步)
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now, safeParse } = require('../../compat/helpers');
const { syncToFinance, matchTradeRole, buildTradeFlow, calcAmount, scanBizAnomaly } = require('../../compat/trade_sync');
const { guardCustomer, recalcCustomer } = require('../../compat/partner_common');

router.use(authMiddleware);

/* ===== 表迁移(销售域) ===== */
db.exec(`
CREATE TABLE IF NOT EXISTS t_tr_so (
  id TEXT PRIMARY KEY, so_no TEXT,
  customer_id TEXT DEFAULT '', customer_name TEXT DEFAULT '',
  items TEXT DEFAULT '[]', amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0, total_with_tax REAL DEFAULT 0,
  delivery_date TEXT DEFAULT '', pay_cycle TEXT DEFAULT '', remark TEXT DEFAULT '',
  creator_id TEXT, creator_name TEXT, creator_dept TEXT,
  status TEXT DEFAULT '待审批', receive_status TEXT DEFAULT '未回款',
  fin_status TEXT DEFAULT '未同步', flow TEXT DEFAULT '[]',
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS t_tr_out (
  id TEXT PRIMARY KEY, out_no TEXT, so_id TEXT, so_no TEXT DEFAULT '',
  customer_name TEXT DEFAULT '', items TEXT DEFAULT '[]',
  amount REAL DEFAULT 0, tax_amount REAL DEFAULT 0, total_with_tax REAL DEFAULT 0,
  warehouse TEXT DEFAULT '', receiver TEXT DEFAULT '',
  creator_id TEXT, creator_name TEXT, creator_dept TEXT,
  status TEXT DEFAULT '待审批', fin_status TEXT DEFAULT '未同步', voucher_no TEXT DEFAULT '',
  flow TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS t_tr_sreturn (
  id TEXT PRIMARY KEY, rt_no TEXT, so_id TEXT, out_id TEXT DEFAULT '',
  so_no TEXT DEFAULT '', customer_id TEXT DEFAULT '', customer_name TEXT DEFAULT '',
  type TEXT DEFAULT '退货', items TEXT DEFAULT '[]', total_with_tax REAL DEFAULT 0, reason TEXT DEFAULT '',
  creator_id TEXT, creator_name TEXT, creator_dept TEXT,
  status TEXT DEFAULT '待审批', fin_status TEXT DEFAULT '未同步', voucher_no TEXT DEFAULT '',
  flow TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT
);
`);

/* ===== 权限与可见性 ===== */
function canSaleOperate(u) {
  return ['超级管理员', '总经理', '副总', '销售总监'].includes(u.role) ||
         (u.role === '部门经理' && ['销售部', '市场部'].includes(u.dept)) ||
         (u.dept === '财务部');
}
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

function approveGeneric(res, req, table, idCol, noCol, effectCb) {
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

/* ============ 1. 销售订单 ============ */
router.get('/', (req, res) => {
  const sf = scopeFilter(req.user);
  const { status, keyword } = req.query;
  let sql = `SELECT * FROM t_tr_so WHERE 1=1 ${sf.f}`;
  const p = [...sf.p];
  if (status && status !== 'all') { sql += ' AND status = ?'; p.push(status); }
  if (keyword) { sql += ' AND (so_no LIKE ? OR customer_name LIKE ?)'; p.push('%' + keyword + '%', '%' + keyword + '%'); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...p);
  rows.forEach(r => { r.flow = safeParse(r.flow, []); r.items = safeParse(r.items, []); });
  return success(res, rows);
});

router.get('/stats', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_tr_so').all();
  const outs = db.prepare(`SELECT so_id, SUM(total_with_tax) s FROM t_tr_out WHERE status='已生效' GROUP BY so_id`).all();
  const rts = db.prepare(`SELECT so_id, SUM(total_with_tax) s FROM t_tr_sreturn WHERE status='已生效' AND type='退货' GROUP BY so_id`).all();
  const rcs = db.prepare(`SELECT so_id, SUM(amount) s FROM t_tr_receipt GROUP BY so_id`).all();
  const omap = {}, rtmap = {}, rcmap = {};
  outs.forEach(o => omap[o.so_id] = o.s); rts.forEach(x => rtmap[x.so_id] = x.s); rcs.forEach(x => rcmap[x.so_id] = x.s);
  let effective = 0, totalAmount = 0, receivable = 0, received = 0;
  rows.forEach(r => {
    if (['已生效', '部分出库', '全部出库'].includes(r.status)) { effective++; totalAmount += r.total_with_tax; receivable += (omap[r.id] !== undefined ? omap[r.id] : r.total_with_tax) - (rtmap[r.id] || 0); }
    received += rcmap[r.id] || 0;
  });
  return success(res, {
    total: rows.length, effective, pending: rows.filter(r => ['待审批', '审批中'].includes(r.status)).length,
    totalAmount: Math.round(totalAmount * 100) / 100, receivable: Math.round(receivable * 100) / 100,
    received: Math.round(received * 100) / 100, unreceived: Math.round((receivable - received) * 100) / 100
  });
});

router.get('/customers-lite', (req, res) => {
  const rows = db.prepare(`SELECT id,name,status FROM customers ORDER BY name`).all();
  return success(res, rows);
});

router.get('/reconcile', (req, res) => {
  const sos = db.prepare(`SELECT * FROM t_tr_so WHERE status IN ('已生效','部分出库','全部出库')`).all();
  const outs = db.prepare(`SELECT so_id, SUM(total_with_tax) s FROM t_tr_out WHERE status='已生效' GROUP BY so_id`).all();
  const rts = db.prepare(`SELECT so_id, SUM(total_with_tax) s FROM t_tr_sreturn WHERE status='已生效' AND type='退货' GROUP BY so_id`).all();
  const rcs = db.prepare(`SELECT so_id, SUM(amount) s FROM t_tr_receipt GROUP BY so_id`).all();
  const omap = {}, rtmap = {}, rcmap = {};
  outs.forEach(o => omap[o.so_id] = o.s); rts.forEach(x => rtmap[x.so_id] = x.s); rcs.forEach(x => rcmap[x.so_id] = x.s);
  const byCustomer = {};
  sos.forEach(s => {
    const confirmed = omap[s.id] !== undefined ? omap[s.id] : s.total_with_tax;
    const receivable = confirmed - (rtmap[s.id] || 0);
    const received = rcmap[s.id] || 0;
    if (!byCustomer[s.customer_name]) byCustomer[s.customer_name] = { customer_name: s.customer_name, orders: 0, order_amount: 0, confirmed: 0, returned: 0, receivable: 0, received: 0, balance: 0 };
    const c = byCustomer[s.customer_name];
    c.orders++; c.order_amount += s.total_with_tax; c.confirmed += confirmed; c.returned += (rtmap[s.id] || 0);
    c.receivable += receivable; c.received += received; c.balance += receivable - received;
  });
  return success(res, Object.values(byCustomer).map(c => {
    Object.keys(c).forEach(k => { if (k !== 'customer_name' && k !== 'orders') c[k] = Math.round(c[k] * 100) / 100; });
    return c;
  }));
});

/* ============ 销售趋势统计 ============ */
router.get('/stats/trend', (req, res) => {
  // 月度趋势（最近12个月）
  const monthly = db.prepare(`
    SELECT substr(created_at,1,5) || CASE WHEN substr(created_at,7,1)='-' THEN '0'||substr(created_at,6,1) ELSE substr(created_at,6,2) END as month,
           COUNT(*) as count,
           ROUND(SUM(total_with_tax),2) as amount,
           SUM(CASE WHEN status IN ('已生效','部分出库','全部出库') THEN 1 ELSE 0 END) as effective
    FROM t_tr_so
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();

  // 出库月度趋势
  const outMonthly = db.prepare(`
    SELECT substr(created_at,1,5) || CASE WHEN substr(created_at,7,1)='-' THEN '0'||substr(created_at,6,1) ELSE substr(created_at,6,2) END as month,
           COUNT(*) as count,
           ROUND(SUM(total_with_tax),2) as amount
    FROM t_tr_out
    WHERE status='已生效'
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();

  // 回款月度趋势
  const rcMonthly = db.prepare(`
    SELECT substr(created_at,1,5) || CASE WHEN substr(created_at,7,1)='-' THEN '0'||substr(created_at,6,1) ELSE substr(created_at,6,2) END as month,
           COUNT(*) as count,
           ROUND(SUM(amount),2) as amount
    FROM t_tr_receipt
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();

  // 客户排名 TOP10
  const topCustomers = db.prepare(`
    SELECT customer_name,
           COUNT(*) as orders,
           ROUND(SUM(total_with_tax),2) as total_amount
    FROM t_tr_so
    WHERE status IN ('已生效','部分出库','全部出库')
    GROUP BY customer_name
    ORDER BY total_amount DESC
    LIMIT 10
  `).all();

  // 状态分布
  const statusDist = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM t_tr_so
    GROUP BY status
  `).all();

  // 产品销售统计 TOP10（从items JSON展开）
  const allOrders = db.prepare(`SELECT items FROM t_tr_so WHERE status IN ('已生效','部分出库','全部出库')`).all();
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
  const effOrders = topCustomers.reduce((s,c) => s + c.orders, 0);
  const effAmount = topCustomers.reduce((s,c) => s + c.total_amount, 0);
  const avgAmount = effOrders > 0 ? Math.round(effAmount / effOrders * 100) / 100 : 0;
  const maxOrder = db.prepare(`SELECT MAX(total_with_tax) as max FROM t_tr_so WHERE status IN ('已生效','部分出库','全部出库')`).get();
  const summary = {
    avgAmount,
    maxAmount: maxOrder ? Math.round(maxOrder.max * 100) / 100 : 0,
    activeCustomers: topCustomers.length,
    totalMonths: monthly.length
  };

  return success(res, { monthly, outMonthly, rcMonthly, topCustomers, statusDist, topProducts, summary });
});

router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM t_tr_so WHERE id = ?').get(req.params.id);
  if (!s) return error(res, 404, '销售订单不存在');
  s.flow = safeParse(s.flow, []); s.items = safeParse(s.items, []);
  s.outs = db.prepare('SELECT * FROM t_tr_out WHERE so_id = ? ORDER BY created_at DESC').all(s.id).map(o => (o.items = safeParse(o.items, []), o));
  s.returns = db.prepare('SELECT * FROM t_tr_sreturn WHERE so_id = ? ORDER BY created_at DESC').all(s.id);
  s.ar = db.prepare(`SELECT * FROM t_tr_ar WHERE source_type='so' AND source_id=?`).all(s.id);
  s.receipts = db.prepare('SELECT * FROM t_tr_receipt WHERE so_id = ? ORDER BY created_at DESC').all(s.id);
  return success(res, s);
});

router.post('/', (req, res) => {
  if (!canSaleOperate(req.user)) return error(res, 403, '仅销售管理员(销售部/市场部管理岗)可创建销售订单');
  const { customer_id, customer_name, items, delivery_date, pay_cycle, remark } = req.body;
  if (!customer_name) return error(res, 400, '请选择客户');
  if (!Array.isArray(items) || !items.length) return error(res, 400, '请至少填写一行销售产品');
  const amt = calcAmount(items);
  // 客户/供应商模块互通: 校验客户档案状态, 未建档自动捕捉建档+AI初始评级, 停用/注销拦截
  const g = guardCustomer(customer_name.trim(), amt.total_with_tax, req.user.name, req.user.dept);
  if (!g.ok) return error(res, g.code || 400, g.msg);
  if (amt.total_with_tax <= 0) return error(res, 400, '订单金额必须大于0');
  const id = genId('XS');
  const flow = buildTradeFlow('so', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_so (id,so_no,customer_id,customer_name,items,amount,tax_amount,total_with_tax,delivery_date,pay_cycle,remark,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, customer_id || '', customer_name, JSON.stringify(items), amt.amount, amt.tax_amount, amt.total_with_tax,
      delivery_date || '', pay_cycle || '月结30天', remark || '', req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  scanBizAnomaly('so', id, id, items, amt.total_with_tax);
  logAction('so', id, '创建订单', req.user);
  return success(res, { id }, '销售订单已提交，等待审批');
});

router.post('/:id/approve', (req, res) => {
  approveGeneric(res, req, 't_tr_so', 'id', 'so_no', item => {
    const r = syncToFinance('so_effective', item.id, item.so_no);
    // 互通: 订单生效自动抓取合作数据重算客户AI评级
    try { recalcCustomer(item.customer_name, true); } catch (e) { console.error('recalcCustomer fail', e.message); }
    return r;
  });
});
router.post('/:id/reject', (req, res) => rejectGeneric(res, req, 't_tr_so', 'id'));

router.post('/:id/void', (req, res) => {
  if (!canSaleOperate(req.user)) return error(res, 403, '无权作废销售订单');
  const s = db.prepare('SELECT * FROM t_tr_so WHERE id = ?').get(req.params.id);
  if (!s) return error(res, 404, '销售订单不存在');
  if (s.status === '已作废') return error(res, 400, '订单已作废');
  const hasOut = db.prepare(`SELECT COUNT(*) n FROM t_tr_out WHERE so_id=? AND status='已生效'`).get(s.id).n;
  const hasRc = db.prepare(`SELECT COUNT(*) n FROM t_tr_receipt WHERE so_id=?`).get(s.id).n;
  if (hasOut) return error(res, 400, '订单已存在生效出库单(财务已入账)，禁止作废，请走退换货流程');
  if (hasRc) return error(res, 400, '订单已发生回款，禁止作废');
  db.prepare(`UPDATE t_tr_so SET status='已作废', updated_at=? WHERE id=?`).run(now(), s.id);
  const r = syncToFinance('so_void', s.id, s.so_no);
  logAction('so', s.id, '作废', req.user);
  return success(res, { id: s.id, sync: r }, '订单已作废，财务预登记同步冲销');
});

/* ============ 2. 销售出库单 ============ */
router.post('/out', (req, res) => {
  if (!canSaleOperate(req.user)) return error(res, 403, '无权创建出库单');
  const { so_id, items, warehouse, receiver } = req.body;
  const so = db.prepare('SELECT * FROM t_tr_so WHERE id = ?').get(so_id);
  if (!so) return error(res, 404, '销售订单不存在');
  if (!['已生效', '部分出库'].includes(so.status)) return error(res, 400, '仅已生效订单可创建出库单(支持一单多次出库)');
  if (!Array.isArray(items) || !items.length) return error(res, 400, '请填写实际出库明细');
  const amt = calcAmount(items);
  if (amt.total_with_tax <= 0) return error(res, 400, '出库金额必须大于0');
  const id = genId('CK');
  const flow = buildTradeFlow('out', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_out (id,out_no,so_id,so_no,customer_name,items,amount,tax_amount,total_with_tax,warehouse,receiver,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, so_id, so.so_no, so.customer_name, JSON.stringify(items), amt.amount, amt.tax_amount, amt.total_with_tax,
      warehouse || '主仓库', receiver || '', req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  return success(res, { id }, '出库单已提交，等待审批');
});

router.post('/out/:id/approve', (req, res) => {
  approveGeneric(res, req, 't_tr_out', 'id', 'out_no', item => syncToFinance('out_effective', item.id, item.out_no));
});
router.post('/out/:id/reject', (req, res) => rejectGeneric(res, req, 't_tr_out', 'id'));

/* ============ 3. 销售退换货单 ============ */
router.post('/sreturn', (req, res) => {
  if (!canSaleOperate(req.user)) return error(res, 403, '无权创建退换货单');
  const { so_id, out_id, type, items, reason } = req.body;
  const so = db.prepare('SELECT * FROM t_tr_so WHERE id = ?').get(so_id);
  if (!so) return error(res, 404, '销售订单不存在');
  const out = db.prepare(`SELECT * FROM t_tr_out WHERE id=? AND so_id=? AND status='已生效'`).get(out_id, so_id);
  if (!out) return error(res, 400, '退换货必须关联该订单下已生效的出库单');
  const tp = type === '换货' ? '换货' : '退货';
  if (!Array.isArray(items) || !items.length) return error(res, 400, '请填写退换货明细');
  const amt = calcAmount(items);
  if (tp === '退货' && amt.total_with_tax <= 0) return error(res, 400, '退货金额必须大于0');
  const id = genId('TH');
  const flow = buildTradeFlow('sreturn', amt.total_with_tax, req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO t_tr_sreturn (id,rt_no,so_id,out_id,so_no,customer_id,customer_name,type,items,total_with_tax,reason,creator_id,creator_name,creator_dept,status,flow,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, so_id, out_id, so.so_no, so.customer_id, so.customer_name, tp, JSON.stringify(items), amt.total_with_tax,
      reason || '', req.user.id, req.user.name, req.user.dept, '待审批', JSON.stringify(flow), now(), now());
  return success(res, { id }, '退换货单已提交，等待审批');
});

router.post('/sreturn/:id/approve', (req, res) => {
  approveGeneric(res, req, 't_tr_sreturn', 'id', 'rt_no', item => syncToFinance('sreturn_effective', item.id, item.rt_no));
});
router.post('/sreturn/:id/reject', (req, res) => rejectGeneric(res, req, 't_tr_sreturn', 'id'));

/* ============ 4. 出库/退换货列表 ============ */
router.get('/outs/list', (req, res) => {
  const sf = scopeFilter(req.user);
  const rows = db.prepare(`SELECT * FROM t_tr_out WHERE 1=1 ${sf.f} ORDER BY created_at DESC`).all(...sf.p);
  rows.forEach(r => { r.items = safeParse(r.items, []); });
  return success(res, rows);
});
router.get('/sreturns/list', (req, res) => {
  const sf = scopeFilter(req.user);
  const rows = db.prepare(`SELECT * FROM t_tr_sreturn WHERE 1=1 ${sf.f} ORDER BY created_at DESC`).all(...sf.p);
  rows.forEach(r => { r.items = safeParse(r.items, []); });
  return success(res, rows);
});

module.exports = router;
