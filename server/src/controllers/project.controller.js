const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');
const { advanceFlow } = require('../services/approval.service');

function list(req, res) {
  const rows = db.prepare('SELECT * FROM projects ORDER BY id').all();
  const projects = rows.map((r) => ({
    ...r,
    team: parseJSON(r.team) || [],
    milestones: parseJSON(r.milestones) || [],
    audits: parseJSON(r.audits) || [],
    flow: parseJSON(r.flow) || [],
  }));
  return res.json(success(projects));
}

function create(req, res) {
  const { id, name, customer, priority, startDate, endDate, budget, manager } = req.body;
  try {
    const flow = JSON.stringify([
      { step: '提交立项', user: manager || '-', time: new Date().toISOString().slice(0, 10), done: true },
      { step: '部门审批', user: '-', time: '-', done: false },
      { step: '财务审核', user: '-', time: '-', done: false },
      { step: '总经理批准', user: '-', time: '-', done: false },
    ]);
    const info = db.prepare('INSERT INTO projects (id,name,customer,status,priority,start_date,end_date,progress,budget,spent,manager,team,milestones,audits,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id || ('PJ-' + Date.now()), name, customer || '-', '立项审批中', priority || '中', startDate || '-', endDate || '-', 0, budget || 0, 0, manager || '-', '[]', '[]', '[]', flow);
    auditLog('ADD_PROJECT', req.userId, String(id || ''), name);
    return res.json(success({ id: info.lastInsertRowid }, '项目立项申请已提交'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

function update(req, res) {
  const fields = ['name', 'customer', 'status', 'priority', 'start_date', 'end_date', 'progress', 'budget', 'spent', 'manager'];
  const sets = [];
  const vals = [];
  fields.forEach((f) => {
    const bodyKey = f.replace(/_./g, (m) => m[1].toUpperCase());
    if (req.body[bodyKey] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(req.body[bodyKey]);
    }
  });
  ['team', 'milestones', 'audits', 'flow'].forEach((f) => {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(JSON.stringify(req.body[f]));
    }
  });
  if (sets.length === 0) return res.json(fail('无更新字段'));
  vals.push(req.params.id);
  try {
    db.prepare(`UPDATE projects SET ${sets.join(',')} WHERE id=?`).run(...vals);
    return res.json(success({}, '项目信息更新成功'));
  } catch (e) {
    return res.json(fail('更新失败'));
  }
}

function approve(req, res) {
  const { status, approver } = req.body;
  try {
    const newFlow = advanceFlow(db, 'projects', req.params.id, approver);
    if (newFlow !== null) {
      db.prepare('UPDATE projects SET status=?, flow=? WHERE id=?').run(status, newFlow, req.params.id);
    }
    auditLog('APPROVE_PROJECT', req.userId, req.params.id, status);
    return res.json(success({}, '项目审批已更新'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_PROJECT', req.userId, req.params.id, null);
    db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
    return res.json(success({}, '项目已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

module.exports = { list, create, update, approve, remove };
