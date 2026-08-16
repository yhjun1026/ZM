/**
 * 财务互通中心 (PRD 第二/五/七章: 数据自动抓取+智能捕捉+双向同步+异常处理)
 * 应付/应收账款台账、付款登记(核销应付+反向同步已付款)、回款登记(核销应收+反向同步已回款)、
 * 往来单位同步、凭证台账、同步异常(自动重试3次+手动重试)、异常捕捉复核、进销存报表、月度对账CSV
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now } = require('../../compat/helpers');
const { retryFailedSyncs, syncToFinance, makeVoucher, addAlert } = require('../../compat/trade_sync');

router.use(authMiddleware);

function isFinance(u) { return u.role === '超级管理员' || u.dept === '财务部' || ['总经理', '副总'].includes(u.role); }
function requireFinance(req, res) {
  if (!isFinance(req.user)) { error(res, 403, '仅财务管理员可执行该操作'); return false; }
  return true;
}

/* ============ 1. 总览仪表板 (访问时自动重试失败同步) ============ */
router.get('/dashboard', (req, res) => {
  const retry = retryFailedSyncs();
  const aps = db.prepare(`SELECT * FROM t_tr_ap`).all();
  const ars = db.prepare(`SELECT * FROM t_tr_ar`).all();
  const apActive = aps.filter(a => !['已作废'].includes(a.status));
  const arActive = ars.filter(a => !['已作废'].includes(a.status));
  const apTotal = apActive.reduce((s, a) => s + a.amount, 0);
  const arTotal = arActive.reduce((s, a) => s + a.amount, 0);
  const apPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM t_tr_pay`).get().s;
  const arReceived = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM t_tr_receipt`).get().s;
  const failedSync = db.prepare(`SELECT COUNT(*) n FROM t_tr_sync_log WHERE status='failed' AND retries < 3`).get().n;
  const pendingAlerts = db.prepare(`SELECT COUNT(*) n FROM t_tr_alerts WHERE status='待复核'`).get().n;
  const vouchers = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM t_tr_vouchers`).get();
  return success(res, {
    ap: { total: Math.round(apTotal * 100) / 100, paid: Math.round(apPaid * 100) / 100, balance: Math.round((apTotal - apPaid) * 100) / 100, pending: apActive.filter(a => a.status === '待确认').length, formal: apActive.filter(a => a.status === '正式').length },
    ar: { total: Math.round(arTotal * 100) / 100, received: Math.round(arReceived * 100) / 100, balance: Math.round((arTotal - arReceived) * 100) / 100, pending: arActive.filter(a => a.status === '待确认').length, formal: arActive.filter(a => a.status === '正式').length },
    vouchers: { count: vouchers.n, amount: Math.round(vouchers.s * 100) / 100 },
    sync: { failed: failedSync, pendingAlerts, lastRetry: retry },
    partners: db.prepare(`SELECT COUNT(*) n FROM t_tr_partners`).get().n
  });
});

/* ============ 2. 应付/应收账款台账 ============ */
router.get('/ap', (req, res) => {
  const rows = db.prepare(`SELECT * FROM t_tr_ap ORDER BY created_at DESC`).all();
  return success(res, rows);
});
router.get('/ar', (req, res) => {
  const rows = db.prepare(`SELECT * FROM t_tr_ar ORDER BY created_at DESC`).all();
  return success(res, rows);
});

/* ============ 3. 付款登记 (财务→采购反向同步) ============ */
router.post('/pay', (req, res) => {
  if (!requireFinance(req, res)) return;
  const { po_id, amount, pay_date, way } = req.body;
  const po = db.prepare('SELECT * FROM t_tr_po WHERE id = ?').get(po_id);
  if (!po) return error(res, 404, '采购订单不存在');
  const amt = Number(amount);
  if (!(amt > 0)) return error(res, 400, '付款金额必须大于0');
  const grnSum = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) s FROM t_tr_grn WHERE po_id=? AND status='已生效'`).get(po_id).s;
  const rtSum = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) s FROM t_tr_preturn WHERE po_id=? AND status='已生效'`).get(po_id).s;
  const payable = (grnSum > 0 ? grnSum : po.total_with_tax) - rtSum;
  const paid = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM t_tr_pay WHERE po_id=?`).get(po_id).s;
  if (paid + amt > payable + 0.01) return error(res, 400, `付款超出应付余额(应付 ${Math.round((payable - paid) * 100) / 100} 元)`);
  const vno = makeVoucher('采购付款', po.po_no, amt, '支出', `供应商付款 ${po.supplier_name} ${amt} 元`);
  const id = genId('FK');
  db.prepare(`INSERT INTO t_tr_pay (id,po_id,po_no,supplier_name,amount,pay_date,way,voucher_no,operator,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, po_id, po.po_no, po.supplier_name, amt, pay_date || now().slice(0, 10), way || '银行转账', vno, req.user.name, now());
  // 核销应付（基准=确认应付额, 已扣除退货冲减）
  db.prepare(`UPDATE t_tr_ap SET pay_amount = pay_amount + ?, updated_at=? WHERE source_type='po' AND source_id=? AND status IN ('正式','部分核销')`)
    .run(amt, now(), po_id);
  // 反向同步采购订单付款状态
  const newPaid = paid + amt;
  const st = newPaid >= payable - 0.01 ? '已全额付款' : '部分付款';
  db.prepare(`UPDATE t_tr_ap SET status=?, updated_at=? WHERE source_type='po' AND source_id=? AND status IN ('正式','部分核销')`)
    .run(newPaid >= payable - 0.01 ? '已核销' : '部分核销', now(), po_id);
  db.prepare(`UPDATE t_tr_po SET pay_status=?, updated_at=? WHERE id=?`).run(st, now(), po_id);
  db.prepare(`INSERT INTO t_tr_sync_log (biz_type,biz_id,biz_no,action,status,retries,synced_at) VALUES ('pay',?,?,?,?,0,?)`)
    .run(id, po.po_no, `付款 ${amt} 元，反向同步订单「${st}」`, 'success', now());
  return success(res, { id }, `付款登记成功，已反向同步采购订单为「${st}」`);
});

/* ============ 4. 回款登记 (财务→销售反向同步) ============ */
router.post('/receipt', (req, res) => {
  if (!requireFinance(req, res)) return;
  const { so_id, amount, receipt_date, way } = req.body;
  const so = db.prepare('SELECT * FROM t_tr_so WHERE id = ?').get(so_id);
  if (!so) return error(res, 404, '销售订单不存在');
  const amt = Number(amount);
  if (!(amt > 0)) return error(res, 400, '回款金额必须大于0');
  const outSum = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) s FROM t_tr_out WHERE so_id=? AND status='已生效'`).get(so_id).s;
  const rtSum = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) s FROM t_tr_sreturn WHERE so_id=? AND status='已生效' AND type='退货'`).get(so_id).s;
  const receivable = (outSum > 0 ? outSum : so.total_with_tax) - rtSum;
  const received = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM t_tr_receipt WHERE so_id=?`).get(so_id).s;
  if (received + amt > receivable + 0.01) return error(res, 400, `回款超出应收余额(应收 ${Math.round((receivable - received) * 100) / 100} 元)`);
  const vno = makeVoucher('销售回款', so.so_no, amt, '收入', `客户回款 ${so.customer_name} ${amt} 元`);
  const id = genId('HK');
  db.prepare(`INSERT INTO t_tr_receipt (id,so_id,so_no,customer_name,amount,receipt_date,way,voucher_no,operator,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, so_id, so.so_no, so.customer_name, amt, receipt_date || now().slice(0, 10), way || '银行转账', vno, req.user.name, now());
  // 核销应收（基准=确认应收额, 已扣除退货冲减）
  db.prepare(`UPDATE t_tr_ar SET received_amount = received_amount + ?, updated_at=? WHERE source_type='so' AND source_id=? AND status IN ('正式','部分核销')`)
    .run(amt, now(), so_id);
  const newRc = received + amt;
  const st = newRc >= receivable - 0.01 ? '已全额回款' : '部分回款';
  db.prepare(`UPDATE t_tr_ar SET status=?, updated_at=? WHERE source_type='so' AND source_id=? AND status IN ('正式','部分核销')`)
    .run(newRc >= receivable - 0.01 ? '已核销' : '部分核销', now(), so_id);
  db.prepare(`UPDATE t_tr_so SET receive_status=?, updated_at=? WHERE id=?`).run(st, now(), so_id);
  db.prepare(`INSERT INTO t_tr_sync_log (biz_type,biz_id,biz_no,action,status,retries,synced_at) VALUES ('receipt',?,?,?,?,0,?)`)
    .run(id, so.so_no, `回款 ${amt} 元，反向同步订单「${st}」`, 'success', now());
  return success(res, { id }, `回款登记成功，已反向同步销售订单为「${st}」`);
});

/* ============ 5. 付款/回款流水 ============ */
router.get('/pays', (req, res) => success(res, db.prepare('SELECT * FROM t_tr_pay ORDER BY created_at DESC').all()));
router.get('/receipts', (req, res) => success(res, db.prepare('SELECT * FROM t_tr_receipt ORDER BY created_at DESC').all()));

/* ============ 6. 凭证台账 ============ */
router.get('/vouchers', (req, res) => {
  const { vtype } = req.query;
  let rows;
  if (vtype && vtype !== 'all') rows = db.prepare('SELECT * FROM t_tr_vouchers WHERE vtype = ? ORDER BY id DESC').all(vtype);
  else rows = db.prepare('SELECT * FROM t_tr_vouchers ORDER BY id DESC').all();
  return success(res, rows);
});

/* ============ 7. 往来单位同步 (供应商/客户 → 财务往来台账, 实时抓取) ============ */
router.get('/partners', (req, res) => {
  const r = syncToFinance('partner_sync', 'all', '');
  const rows = db.prepare(`SELECT * FROM t_tr_partners ORDER BY partner_type, name`).all();
  return success(res, rows, r && r.msg ? r.msg : undefined);
});

/* ============ 8. 同步日志 + 手动重试 (PRD 第七章) ============ */
router.get('/sync-logs', (req, res) => {
  retryFailedSyncs();
  const rows = db.prepare(`SELECT * FROM (SELECT * FROM t_tr_sync_log ORDER BY id DESC LIMIT 200) ORDER BY id DESC`).all();
  return success(res, rows);
});

router.post('/sync-retry/:logId', (req, res) => {
  if (!requireFinance(req, res)) return;
  const log = db.prepare('SELECT * FROM t_tr_sync_log WHERE id = ?').get(req.params.logId);
  if (!log) return error(res, 404, '同步日志不存在');
  if (log.biz_type.startsWith('op_')) return error(res, 400, '操作日志无需重试');
  const r = syncToFinance(log.biz_type, log.biz_id, log.biz_no);
  db.prepare(`UPDATE t_tr_sync_log SET retries = retries + 1, status=?, error_msg=?, synced_at=? WHERE id=?`)
    .run(r.ok ? 'success' : 'failed', r.ok ? '' : r.msg, now(), log.id);
  if (r.ok) db.prepare(`DELETE FROM t_tr_alerts WHERE biz_type='sync' AND biz_id=?`).run(log.biz_type + ':' + log.biz_id);
  return success(res, r, r.ok ? '手动重试成功，财务数据已同步' : '重试仍失败: ' + r.msg);
});

/* ============ 9. 异常捕捉台账 ============ */
router.get('/alerts', (req, res) => {
  const rows = db.prepare(`SELECT * FROM t_tr_alerts ORDER BY status='待复核' DESC, id DESC`).all();
  return success(res, rows);
});
router.post('/alerts/:id/review', (req, res) => {
  if (!requireFinance(req, res)) return;
  const remark = (req.body || {}).remark || '';
  const n = db.prepare(`UPDATE t_tr_alerts SET status='已复核', msg = CASE WHEN ? != '' THEN msg || ' | 复核意见: ' || ? ELSE msg END WHERE id=?`)
    .run(remark, remark, req.params.id).changes;
  if (!n) return error(res, 404, '异常记录不存在');
  return success(res, { id: Number(req.params.id) }, '已复核');
});

/* ============ 10. 进销存报表 ============ */
router.get('/report/monthly', (req, res) => {
  const pos = db.prepare(`SELECT total_with_tax, created_at FROM t_tr_po WHERE status IN ('已生效','部分入库','全部入库')`).all();
  const sos = db.prepare(`SELECT total_with_tax, created_at FROM t_tr_so WHERE status IN ('已生效','部分出库','全部出库')`).all();
  const months = {};
  const y = new Date().getFullYear();
  for (let m = 1; m <= 12; m++) months[y + '-' + String(m).padStart(2, '0')] = { month: y + '-' + String(m).padStart(2, '0'), purchase: 0, sales: 0 };
  const monthKey = (s) => { const d = String(s || '').split(' ')[0].split('-'); return d.length >= 2 ? d[0] + '-' + d[1].padStart(2, '0') : ''; };
  pos.forEach(p => { const k = monthKey(p.created_at); if (months[k]) months[k].purchase += p.total_with_tax; });
  sos.forEach(s => { const k = monthKey(s.created_at); if (months[k]) months[k].sales += s.total_with_tax; });
  return success(res, Object.values(months).map(m => ({ ...m, purchase: Math.round(m.purchase * 100) / 100, sales: Math.round(m.sales * 100) / 100, diff: Math.round((m.sales - m.purchase) * 100) / 100 })));
});

/* 月度对账报表 CSV 导出 (含应付/应收/收付汇总) */
router.get('/export', (req, res) => {
  const BOM = '\uFEFF';
  const pos = db.prepare(`SELECT * FROM t_tr_po WHERE status IN ('已生效','部分入库','全部入库')`).all();
  const sos = db.prepare(`SELECT * FROM t_tr_so WHERE status IN ('已生效','部分出库','全部出库')`).all();
  const pays = db.prepare('SELECT * FROM t_tr_pay').all();
  const rcs = db.prepare('SELECT * FROM t_tr_receipt').all();
  const pmap = {}; pays.forEach(p => pmap[p.po_id] = (pmap[p.po_id] || 0) + p.amount);
  const rmap = {}; rcs.forEach(r => rmap[r.so_id] = (rmap[r.so_id] || 0) + r.amount);
  let csv = BOM + '类别,单据编号,往来单位,含税金额,已结金额,未结金额,状态,创建时间\n';
  pos.forEach(p => {
    const paid = pmap[p.id] || 0;
    csv += `采购订单,${p.po_no},${p.supplier_name},${p.total_with_tax},${paid},${Math.round((p.total_with_tax - paid) * 100) / 100},${p.status},${(p.created_at || '').slice(0, 10)}\n`;
  });
  sos.forEach(s => {
    const rc = rmap[s.id] || 0;
    csv += `销售订单,${s.so_no},${s.customer_name},${s.total_with_tax},${rc},${Math.round((s.total_with_tax - rc) * 100) / 100},${s.status},${(s.created_at || '').slice(0, 10)}\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="trade_reconcile.csv"');
  return res.send(csv);
});

module.exports = router;
