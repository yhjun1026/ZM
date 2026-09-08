const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const records = db
    .prepare('SELECT id,applicant,type,start_date as startDate,end_date as endDate,days,reason,status,approver FROM leave_records ORDER BY id DESC')
    .all();
  const leaveTypes = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('leaveTypes').value);
  return res.json(success({ records, leaveTypes }));
}

function apply(req, res) {
  const { applicant, type, startDate, endDate, days, reason, approver } = req.body;
  try {
    const info = db.prepare('INSERT INTO leave_records (applicant,type,start_date,end_date,days,reason,status,approver) VALUES (?,?,?,?,?,?,?,?)')
      .run(applicant, type, startDate, endDate, days, reason, '待审批', approver || '直属主管');
    auditLog('APPLY_LEAVE', req.userId, String(info.lastInsertRowid), type);
    return res.json(success({ id: info.lastInsertRowid }, '假期申请已提交'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

function approve(req, res) {
  const { status, approver } = req.body;
  try {
    db.prepare('UPDATE leave_records SET status=?, approver=? WHERE id=?').run(status, approver, req.params.id);
    auditLog('APPROVE_LEAVE', req.userId, req.params.id, status);
    return res.json(success({}, '审批完成'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

module.exports = { list, apply, approve };

function cancel(req, res) {
  try {
    const r = db.prepare('SELECT * FROM leave_records WHERE id=?').get(req.params.id);
    if (!r) return res.json(fail('记录不存在'));
    if (r.user_id !== req.userId) return res.json(fail('只能撤销自己的'));
    if (!['待审批', '审批中'].includes(r.status)) return res.json(fail('仅待审批可撤销'));
    db.prepare("UPDATE leave_records SET status='已撤销' WHERE id=?").run(req.params.id);
    auditLog('CANCEL_LEAVE', req.userId, req.params.id, null);
    return res.json(success({}, '已撤销'));
  } catch (e) { return res.json(fail('操作失败: ' + e.message)); }
}

module.exports = { list, apply, approve, cancel };
