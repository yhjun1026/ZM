/**
 * 资产台账 controller（参考 daily.js /assets 段，3 端点）
 * 数据表（010 迁移建立）：assets（区别于 bizflow 的财务固定资产 fixed_assets）
 */
const db = require('../db');
const { ok, okWith, bad, notfound, empId } = require('../utils/resp');

function list(req, res) {
  const { keyword, category, status, dept_id, custodian_id } = req.query;
  let sql = 'SELECT a.*, e.name as custodian_name_real FROM assets a LEFT JOIN employees e ON e.id=a.custodian_id WHERE 1=1';
  const p = [];
  if (keyword) { sql += ' AND (a.name LIKE ? OR a.asset_no LIKE ? OR a.serial_no LIKE ?)'; p.push('%' + keyword + '%'); p.push('%' + keyword + '%'); p.push('%' + keyword + '%'); }
  if (category) { sql += ' AND a.category=?'; p.push(category); }
  if (status) { sql += ' AND a.status=?'; p.push(status); }
  if (dept_id) { sql += ' AND a.dept_id=?'; p.push(Number(dept_id)); }
  if (custodian_id) { sql += ' AND a.custodian_id=?'; p.push(Number(custodian_id)); }
  sql += ' ORDER BY a.id DESC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function create(req, res) {
  const { name, category, brand, model, serial_no, purchase_date, purchase_amount, location, custodian_id, dept_id, status } = req.body;
  if (!name) return res.json(bad('名称必填'));
  const no = 'A' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000);
  const cu = custodian_id ? db.prepare('SELECT * FROM employees WHERE id=?').get(custodian_id) : null;
  const du = dept_id ? db.prepare('SELECT * FROM org_units WHERE id=?').get(dept_id) : null;
  const r = db.prepare(`INSERT INTO assets (asset_no, name, category, brand, model, serial_no, purchase_date, purchase_amount, location, custodian_id, custodian_name, dept_id, dept_name, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, name, category || '办公设备', brand || '', model || '', serial_no || '', purchase_date || '', Number(purchase_amount) || 0, location || '',
      custodian_id || null, cu?.name || '', dept_id || null, du?.name || '', status || '在用');
  return res.json(ok({ id: r.lastInsertRowid, asset_no: no }, '已建档'));
}
function update(req, res) {
  const { name, category, brand, model, serial_no, purchase_date, purchase_amount, location, custodian_id, dept_id, status, remark } = req.body;
  const r = db.prepare('SELECT * FROM assets WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  const cu = custodian_id ? db.prepare('SELECT * FROM employees WHERE id=?').get(custodian_id) : null;
  const du = dept_id ? db.prepare('SELECT * FROM org_units WHERE id=?').get(dept_id) : null;
  db.prepare(`UPDATE assets SET name=?, category=COALESCE(?,category), brand=?, model=?, serial_no=?, purchase_date=?, purchase_amount=?, location=?, custodian_id=?, custodian_name=?, dept_id=?, dept_name=?, status=COALESCE(?,status), remark=? WHERE id=?`)
    .run(name, category, brand, model, serial_no, purchase_date, purchase_amount, location,
      custodian_id || null, cu?.name || '', dept_id || null, du?.name || '', status, remark || '', req.params.id);
  return res.json(ok({}, '已更新'));
}

module.exports = { list, create, update };
