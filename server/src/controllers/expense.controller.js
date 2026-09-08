const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const records = db
    .prepare('SELECT id,applicant,category,amount,date,desc_text as `desc`,status,receipts FROM expense_records ORDER BY id DESC')
    .all();
  const categories = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('expenseCategories').value);
  const stats = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('expenseStats').value);
  return res.json(success({ records, categories, stats }));
}

function apply(req, res) {
  const { applicant, category, amount, date, desc, receipts } = req.body;
  try {
    const info = db.prepare('INSERT INTO expense_records (applicant,category,amount,date,desc_text,status,receipts) VALUES (?,?,?,?,?,?,?)')
      .run(applicant, category, amount, date, desc, '待审批', receipts || 0);
    auditLog('APPLY_EXPENSE', req.userId, String(info.lastInsertRowid), category);
    return res.json(success({ id: info.lastInsertRowid }, '报销申请已提交'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

function approve(req, res) {
  const { status } = req.body;
  try {
    db.prepare('UPDATE expense_records SET status=? WHERE id=?').run(status, req.params.id);
    auditLog('APPROVE_EXPENSE', req.userId, req.params.id, status);
    return res.json(success({}, '审批完成'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

module.exports = { list, apply, approve };

function cancel(req, res) {
  try {
    const r = db.prepare('SELECT * FROM expense_records WHERE id=?').get(req.params.id);
    if (!r) return res.json(fail('记录不存在'));
    if (r.user_id !== req.userId) return res.json(fail('只能撤销自己的'));
    if (!['待审批', '审批中'].includes(r.status)) return res.json(fail('仅待审批可撤销'));
    db.prepare("UPDATE expense_records SET status='已撤销' WHERE id=?").run(req.params.id);
    return res.json(success({}, '已撤销'));
  } catch (e) { return res.json(fail('操作失败')); }
}

module.exports = { list, apply, approve, cancel };
