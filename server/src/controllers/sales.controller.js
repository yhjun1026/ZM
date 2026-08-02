const db = require('../db');
const { success, fail } = require('../utils/response');
const auditLog = require('../utils/audit');

function listRecords(req, res) {
  const rows = db.prepare('SELECT * FROM sales_records ORDER BY id DESC').all();
  return res.json(success(rows));
}

function addRecord(req, res) {
  const { customer, product, amount, saleDate, salesperson, notes } = req.body;
  try {
    const info = db.prepare(
      'INSERT INTO sales_records (customer,product,amount,sale_date,salesperson,notes) VALUES (?,?,?,?,?,?)'
    ).run(customer || '', product || '', amount || 0, saleDate || '', salesperson || '', notes || '');
    auditLog('ADD_SALES', req.userId, String(info.lastInsertRowid), customer || '');
    return res.json(success({ id: info.lastInsertRowid }, '录入成功'));
  } catch (e) {
    return res.json(fail('录入失败'));
  }
}

function deleteRecord(req, res) {
  try {
    auditLog('DELETE_SALES', req.userId, req.params.id, null);
    db.prepare('DELETE FROM sales_records WHERE id=?').run(req.params.id);
    return res.json(success({}, '已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

module.exports = { listRecords, addRecord, deleteRecord };
