/**
 * 备用金 controller（参考 daily.js /petty-funds 段，7 端点）
 * 数据表（009 迁移已建）：petty_funds
 * 状态机：审批中 → (通过→待放款) → (已放款→使用中) → (申请核销→待核销) → (财务确认→已核销) / (驳回→已驳回) / (撤销→已撤销)
 */
const db = require('../db');
const { ok, okWith, bad, notfound, empId } = require('../utils/resp');

function stats(req, res) {
  const total = db.prepare('SELECT COUNT(*) c FROM petty_funds').get().c;
  const pending = db.prepare("SELECT COUNT(*) c FROM petty_funds WHERE status IN ('审批中','待放款','使用中','待核销')").get().c;
  const amount = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM petty_funds WHERE status IN ('使用中','待核销')").get().v;
  const used = db.prepare("SELECT COALESCE(SUM(used_amount),0) v FROM petty_funds WHERE status='已核销'").get().v;
  const byStatus = db.prepare('SELECT status, COUNT(*) c, COALESCE(SUM(amount),0) amount FROM petty_funds GROUP BY status').all();
  return res.json(ok({ total, pending, in_use: amount, used, by_status: byStatus }));
}
function list(req, res) {
  const { status, emp_id } = req.query;
  let sql = 'SELECT * FROM petty_funds WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (emp_id) { sql += ' AND emp_id=?'; p.push(Number(emp_id)); }
  sql += ' ORDER BY id DESC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function create(req, res) {
  const { purpose, amount, expect_return_date } = req.body;
  if (!purpose || !amount) return res.json(bad('用途/金额必填'));
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(empId(req));
  const no = 'PF' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000);
  const r = db.prepare(`INSERT INTO petty_funds (fund_no, emp_id, emp_name, dept_name, region, purpose, amount, expect_return_date, status)
    VALUES (?,?,?,?,?,?,?,?, '审批中')`)
    .run(no, empId(req), e?.name || '', e?.dept || '', e?.region || '', purpose, Number(amount), expect_return_date || '');
  return res.json(ok({ id: r.lastInsertRowid, fund_no: no }, '已申请'));
}
function cancel(req, res) {
  const r = db.prepare('SELECT * FROM petty_funds WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  if (r.emp_id !== empId(req)) return res.json(bad('只能撤销自己的'));
  if (!['审批中'].includes(r.status)) return res.json(bad('仅审批中可撤销'));
  db.prepare("UPDATE petty_funds SET status='已撤销' WHERE id=?").run(r.id);
  return res.json(ok({}, '已撤销'));
}
function pay(req, res) {
  const { pay_type } = req.body;
  const r = db.prepare('SELECT * FROM petty_funds WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  if (r.status !== '待放款') return res.json(bad('仅待放款可支付'));
  db.prepare("UPDATE petty_funds SET status='使用中', pay_type=?, paid_at=datetime('now','localtime'), paid_by_id=?, paid_by_name=? WHERE id=?")
    .run(pay_type || '银行转账', empId(req), req.user?.name || '', r.id);
  return res.json(ok({}, '已放款'));
}
function settle(req, res) {
  const { used_amount, return_amount, settle_note, voucher_path } = req.body;
  const r = db.prepare('SELECT * FROM petty_funds WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  if (r.status !== '使用中') return res.json(bad('仅使用中可申请核销'));
  const ua = Number(used_amount) || 0;
  const ra = Number(return_amount) || 0;
  const settleType = ra > 0 ? '部分使用退回' : '用完核销';
  db.prepare(`UPDATE petty_funds SET status='待核销', used_amount=?, return_amount=?, settle_type=?, settle_note=?, voucher_path=?, settle_at=datetime('now','localtime') WHERE id=?`)
    .run(ua, ra, settleType, settle_note || '', voucher_path || '', r.id);
  return res.json(ok({}, '已申请核销'));
}
function confirm(req, res) {
  const { confirm_note } = req.body;
  const r = db.prepare('SELECT * FROM petty_funds WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  if (r.status !== '待核销') return res.json(bad('仅待核销可确认'));
  db.prepare("UPDATE petty_funds SET status='已核销', confirmed_at=datetime('now','localtime'), confirmed_by_id=?, confirmed_by_name=?, confirm_note=? WHERE id=?")
    .run(empId(req), req.user?.name || '', confirm_note || '', r.id);
  return res.json(ok({}, '已确认核销'));
}

module.exports = { stats, list, create, cancel, pay, settle, confirm };
