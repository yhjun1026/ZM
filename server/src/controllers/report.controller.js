const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const reports = db.prepare('SELECT * FROM work_reports ORDER BY id DESC').all();
  const monthReportData = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('monthReportData').value);
  const deptPerformance = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('deptPerformance').value);
  return res.json(success({ reports, monthReportData, deptPerformance }));
}

function create(req, res) {
  const { userName, type, date, content, plan } = req.body;
  try {
    const info = db.prepare('INSERT INTO work_reports (user_name,type,date,content,plan,status) VALUES (?,?,?,?,?,?)')
      .run(userName, type, date, content, plan, '已提交');
    auditLog('ADD_REPORT', req.userId, String(info.lastInsertRowid), type);
    return res.json(success({ id: info.lastInsertRowid }, '汇报提交成功'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

function approve(req, res) {
  try {
    db.prepare('UPDATE work_reports SET status=? WHERE id=?').run('已审批', req.params.id);
    auditLog('APPROVE_REPORT', req.userId, req.params.id, null);
    return res.json(success({}, '汇报审批通过'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_REPORT', req.userId, req.params.id, null);
    db.prepare('DELETE FROM work_reports WHERE id=?').run(req.params.id);
    return res.json(success({}, '汇报已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

module.exports = { list, create, approve, remove };
