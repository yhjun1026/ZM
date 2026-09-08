/**
 * 回款应收（参考 finance.js payments 段，4 端点，简化：不做 PDF 凭证 / 审批联动）
 * 数据表：payments / ar_ledgers（010 迁移已建）
 */
const db = require('../db');
const { ok, okWith, bad, notfound } = require('../utils/resp');

function list(req, res) {
  const sql = `SELECT p.*, a.ar_no, a.customer_name, a.region FROM payments p
    LEFT JOIN ar_ledgers a ON p.ar_id=a.id WHERE 1=1 ORDER BY p.id DESC`;
  return res.json(ok({ list: db.prepare(sql).all() }));
}

function create(req, res) {
  const { ar_id, amount, pay_date, method, remark } = req.body || {};
  if (!ar_id || !amount) return res.json(bad('应收单与回款金额必填'));
  const ar = db.prepare('SELECT * FROM ar_ledgers WHERE id=?').get(ar_id);
  if (!ar) return res.json(notfound('应收单不存在'));
  if (Number(amount) + Number(ar.received_amount || 0) > Number(ar.total_amount || 0)) {
    return res.json(bad(`回款超额：应收${ar.total_amount}万，已回${ar.received_amount}万`));
  }
  const no = 'PAY2026' + String(db.prepare('SELECT COUNT(*) n FROM payments').get().n + 1).padStart(3, '0');
  const info = db.prepare(`INSERT INTO payments(pay_no,ar_id,amount,pay_date,method,operator_id,remark)
    VALUES(?,?,?,?,?,?,?)`)
    .run(no, ar_id, Number(amount), pay_date || new Date().toISOString().slice(0, 10), method || '银行转账', req.empId || null, remark || '');
  // 更新应收已回款金额
  db.prepare('UPDATE ar_ledgers SET received_amount=received_amount+? WHERE id=?').run(Number(amount), ar_id);
  return res.json(ok({ pay_no: no, id: info.lastInsertRowid }, '回款已登记'));
}

function uploadVoucher(req, res) {
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
  if (!p) return res.json(notfound('回款记录不存在'));
  return res.json(bad('回款凭证上传暂未启用（简化实现）'));
}

function deleteVoucher(req, res) {
  const p = db.prepare('SELECT * FROM payments WHERE id=?').get(req.params.id);
  if (!p) return res.json(notfound('回款记录不存在'));
  return res.json(ok({}, '已删除回款凭证'));
}

module.exports = { list, create, uploadVoucher, deleteVoucher };
