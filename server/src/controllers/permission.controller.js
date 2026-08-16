const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all().map((r) => ({
    ...r,
    duties: parseJSON(r.duties) || [],
  }));
  const permMatrix = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('permMatrix').value);
  const approvals = db.prepare('SELECT * FROM perm_approvals ORDER BY apply_date DESC').all().map((a) => ({
    ...a,
    target_modules: parseJSON(a.target_modules) || [],
  }));
  const logs = db.prepare('SELECT * FROM perm_logs ORDER BY log_date DESC').all();
  return res.json(success({ roles, permMatrix, approvals, logs }));
}

function apply(req, res) {
  const { applicant, applicantRole, targetRole, targetModules, reason, approver, urgency } = req.body;
  const id = 'PA-' + String(Date.now()).slice(-6);
  try {
    db.prepare('INSERT INTO perm_approvals (id,applicant,applicant_role,target_role,target_modules,reason,status,apply_date,approver,urgency) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, applicant, applicantRole, targetRole, JSON.stringify(targetModules), reason, '待审批', new Date().toISOString().slice(0, 10), approver, urgency || '普通');
    auditLog('APPLY_PERM', req.userId, id, targetRole);
    return res.json(success({ id }, '权限申请已提交'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

function approve(req, res) {
  const { status, remark } = req.body;
  try {
    db.prepare('UPDATE perm_approvals SET status=?, approve_date=?, remark=? WHERE id=?')
      .run(status, new Date().toISOString().slice(0, 10), remark || '', req.params.id);
    auditLog('APPROVE_PERM', req.userId, req.params.id, status);
    return res.json(success({}, '审批操作完成'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

// 获取角色列表
function listRoles(req, res) {
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all().map((r) => ({
    id: r.id,
    name: r.name,
    desc: r.desc_text,
    color: r.color,
    users: r.users,
    level: r.level,
    scope: r.scope,
    duties: parseJSON(r.duties) || []
  }));
  return res.json(success(roles));
}

// 获取权限审计日志
function listAuditLogs(req, res) {
  const logs = db.prepare('SELECT * FROM perm_logs ORDER BY log_date DESC').all();
  return res.json(success(logs));
}

module.exports = { list, apply, approve, listRoles, listAuditLogs };
