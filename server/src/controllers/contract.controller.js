const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const rows = db.prepare('SELECT * FROM contracts ORDER BY id').all();
  const contracts = rows.map((r) => ({ ...r, flow: parseJSON(r.flow) || [] }));
  return res.json(success(contracts));
}

function create(req, res) {
  const { id, name, customer, type, amount, startDate, endDate, creator } = req.body;
  try {
    const flow = JSON.stringify([
      { step: '提交', user: creator, time: new Date().toISOString().slice(0, 10), done: true },
      { step: '部门审批', user: '-', time: '-', done: false },
      { step: '财务审核', user: '-', time: '-', done: false },
      { step: '总经理签字', user: '-', time: '-', done: false },
    ]);
    db.prepare('INSERT INTO contracts (id,name,customer,type,amount,start_date,end_date,status,progress,creator,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, name, customer, type, amount, startDate, endDate, '待审批', 0, creator, flow);
    auditLog('ADD_CONTRACT', req.userId, id, name);
    return res.json(success({ id }, '合同提交成功'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

// 注：原实现合同审批只更新 status/approver，不推进 flow。此处保持一致。
function approve(req, res) {
  const { status, approver } = req.body;
  try {
    db.prepare('UPDATE contracts SET status=?, approver=? WHERE id=?').run(status, approver, req.params.id);
    auditLog('APPROVE_CONTRACT', req.userId, req.params.id, status);
    return res.json(success({}, '合同审批已更新'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_CONTRACT', req.userId, req.params.id, null);
    db.prepare('DELETE FROM contracts WHERE id=?').run(req.params.id);
    return res.json(success({}, '合同已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

function progress(req, res) {
  const { progress } = req.body;
  try {
    db.prepare('UPDATE contracts SET progress=? WHERE id=?').run(progress, req.params.id);
    return res.json(success({}, '合同进度已更新'));
  } catch (e) {
    return res.json(fail('更新失败'));
  }
}

module.exports = { list, create, approve, remove, progress };
