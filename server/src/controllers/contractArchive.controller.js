/**
 * 合同档案管理（参考 office.js contract-archives 段，4 端点）
 * 数据表：contract_archives（010 迁移已建）
 */
const db = require('../db');
const { ok, okWith, bad, notfound } = require('../utils/resp');

function list(req, res) {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM contract_archives WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (q) { sql += ' AND (contract_name LIKE ? OR contract_no LIKE ? OR customer_name LIKE ?)'; const k = `%${q}%`; p.push(k, k, k); }
  sql += ' ORDER BY expire_date IS NULL, expire_date ASC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}

function expiring(req, res) {
  const rows = db.prepare(`
    SELECT * FROM contract_archives WHERE status IN ('履行中','即将到期')
    AND expire_date IS NOT NULL AND expire_date <= date('now','localtime','+30 day')
    ORDER BY expire_date ASC`).all();
  const today = new Date().toISOString().slice(0, 10);
  const out = rows.map(c => ({
    ...c,
    warn: c.expire_date < today ? '已到期' : '即将到期',
    days: Math.max(0, Math.round((new Date(c.expire_date) - new Date()) / 86400000)),
  }));
  return res.json(ok({ list: out }));
}

function create(req, res) {
  const { contract_no, contract_name, customer_name, amount, sign_date, expire_date, owner_dept, owner_name, remark } = req.body || {};
  if (!contract_name) return res.json(bad('合同名称必填'));
  const cnt = db.prepare('SELECT COUNT(*) n FROM contract_archives').get().n;
  const archive_no = `CA${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(cnt + 1).padStart(4, '0')}`;
  const info = db.prepare(`INSERT INTO contract_archives(archive_no,contract_no,contract_name,customer_name,amount,sign_date,expire_date,owner_dept,owner_name,remark)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(archive_no, contract_no || '', contract_name, customer_name || '', amount || 0, sign_date || null, expire_date || null, owner_dept || '', owner_name || '', remark || '');
  return res.json(ok({ archive_no, id: info.lastInsertRowid }, '已登记归档'));
}

function update(req, res) {
  const c = db.prepare('SELECT * FROM contract_archives WHERE id=?').get(req.params.id);
  if (!c) return res.json(notfound('档案不存在'));
  const { status, remark, expire_date } = req.body || {};
  db.prepare('UPDATE contract_archives SET status=?, remark=?, expire_date=? WHERE id=?')
    .run(status || c.status, remark !== undefined ? remark : c.remark, expire_date || c.expire_date, c.id);
  return res.json(ok({}, '已更新'));
}

module.exports = { list, expiring, create, update };
