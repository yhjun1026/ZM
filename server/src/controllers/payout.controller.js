/**
 * 支付/分成 controller（参考 payout.js，4 端点）
 * 数据表（009 迁移已建）：finance_payouts
 * 010 已建：payout_sources
 */
const db = require('../db');
const { ok, bad, notfound, empId } = require('../utils/resp');

function listPayouts(req, res) {
  const { pay_type, source_table, from, to, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM finance_payouts WHERE 1=1';
  const p = [];
  if (pay_type) { sql += ' AND pay_type=?'; p.push(pay_type); }
  if (source_table) { sql += ' AND source_table=?'; p.push(source_table); }
  if (from) { sql += ' AND pay_date >= ?'; p.push(from); }
  if (to) { sql += ' AND pay_date <= ?'; p.push(to); }
  const total = db.prepare(sql.replace(/SELECT \*[\s\S]*?FROM/, 'SELECT COUNT(*) c FROM')).get(...p).c;
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  p.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  return res.json(ok({ list: db.prepare(sql).all(...p), total, page: Number(page), pageSize: Number(pageSize) }));
}
function listSources(req, res) {
  const rows = db.prepare('SELECT * FROM payout_sources WHERE enabled=1 ORDER BY code').all();
  return res.json(ok({ list: rows }));
}
function createPayout(req, res) {
  const { pay_type, source_table, source_id, source_no, amount, payee, method, pay_date } = req.body;
  if (!pay_type || !amount) return res.json(bad('支付类型/金额必填'));
  const no = 'FP' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000);
  const r = db.prepare(`INSERT INTO finance_payouts (pay_no, pay_type, source_table, source_id, source_no, amount, payee, method, pay_date)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(no, pay_type, source_table || '', source_id || null, source_no || '', Number(amount), payee || '',
      method || '银行转账', pay_date || new Date().toISOString().slice(0, 10));
  return res.json(ok({ id: r.lastInsertRowid, pay_no: no }, '已创建'));
}
function detail(req, res) {
  const r = db.prepare('SELECT * FROM finance_payouts WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  return res.json(ok(r));
}

module.exports = { listPayouts, listSources, createPayout, detail };
