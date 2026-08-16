/**
 * 权限管理路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireModule } = require('../../compat/auth');
const { success, error, now } = require('../../compat/helpers');
const { MODULES, ROLES, PERM_MATRIX, hasPermission, canAccess, canApprove, canAddTeamMember } = require('../../compat/rbac');

router.use(authMiddleware);

// 角色列表
router.get('/roles', (req, res) => {
  const roles = ROLES.map((name, idx) => {
    const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get(name).c;
    const colors = ['#dc2626','#1e293b','#6366f1','#2563eb','#8b5cf6','#10b981','#f59e0b','#06b6d4','#0d9488'];
    const descs = {
      '超级管理员': '系统全权限管理（行政部负责人）',
      '总经理': '全公司经营管理决策',
      '副总': '分管业务与跨部门协调',
      '部门经理': '管理本部门所有事务',
      '区域经理': '管理本区域销售业务',
      '普通员工': '基础办公功能权限',
      '人事专员': '人事管理功能权限',
      '销售总监': '销售业务全面管理'
    };
    return { id: idx + 1, name, desc: descs[name] || '', color: colors[idx] || '#6366f1', users: count };
  });
  return success(res, roles);
});

// 权限矩阵
router.get('/matrix', (req, res) => {
  return success(res, { modules: MODULES, roles: ROLES, data: PERM_MATRIX });
});

// 系统用户列表
router.get('/system-users', (req, res) => {
  const users = db.prepare('SELECT id, emp_id, name, role, dept, contract_role FROM users ORDER BY dept, id').all();
  return success(res, users);
});

// 审计日志
router.get('/audit-logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM perm_audit_logs ORDER BY created_at DESC LIMIT 50').all();
  return success(res, logs);
});

// 权限检查接口
router.post('/check', (req, res) => {
  const { action, module: moduleName } = req.body;
  const result = {};
  if (action) result.canAccess = canAccess(req.user.role, req.user.dept, action);
  if (moduleName) result.hasPermission = hasPermission(req.user.role, req.user.dept, moduleName);
  result.canApprove = canApprove(req.user.role);
  result.canAddTeamMember = canAddTeamMember(req.user.role, req.user.dept);
  result.canEditPermission = req.user.role === '超级管理员' && req.user.dept === '行政部';
  return success(res, result);
});

// 修改用户角色 — 仅行政部负责人（超级管理员+行政部）可操作
router.put('/users/:userId/role', (req, res) => {
  const u = req.user;
  if (!(u.role === '超级管理员' && u.dept === '行政部')) {
    return error(res, 403, '仅行政部负责人可分配权限');
  }
  const { userId } = req.params;
  const { role } = req.body;
  if (!role) return error(res, 400, '请选择角色');
  if (ROLES.indexOf(role) === -1) return error(res, 400, '无效的角色');

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) return error(res, 404, '用户不存在');
  if (target.role === '超级管理员' && u.id !== target.id) {
    return error(res, 403, '不能修改其他超级管理员的权限');
  }

  const oldRole = target.role;
  db.prepare('UPDATE users SET role = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(role, userId);

  // 记录审计日志
  db.prepare('INSERT INTO perm_audit_logs (time,operator,action,target,detail) VALUES (?,?,?,?,?)')
    .run(now(), u.name, '权限分配', target.name, `${oldRole} → ${role}`);

  return success(res, { userId, oldRole, newRole: role }, '权限已更新');
});

// 修改用户合同角色 — 仅行政部负责人（超级管理员+行政部）可操作
router.put('/users/:userId/contract-role', (req, res) => {
  const u = req.user;
  if (!(u.role === '超级管理员' && u.dept === '行政部')) {
    return error(res, 403, '仅行政部负责人可分配合同角色');
  }
  const { userId } = req.params;
  const { contractRole } = req.body;
  const VALID_CONTRACT_ROLES = [
    '经办人', '部门负责人', '法务专员', '财务审核', '分管领导',
    '总经理', '印章管理员', '合同档案管理员', '系统超级管理员'
  ];
  if (!contractRole && contractRole !== '') return error(res, 400, '请提供合同角色');
  if (contractRole && VALID_CONTRACT_ROLES.indexOf(contractRole) === -1) {
    return error(res, 400, '无效的合同角色');
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) return error(res, 404, '用户不存在');

  const oldRole = target.contract_role || '';
  db.prepare('UPDATE users SET contract_role = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(contractRole || '', userId);

  // 记录审计日志
  db.prepare('INSERT INTO perm_audit_logs (time,operator,action,target,detail) VALUES (?,?,?,?,?)')
    .run(now(), u.name, '合同角色分配', target.name, `${oldRole || '（未分配）'} → ${contractRole || '（清除）'}`);

  return success(res, { userId, oldContractRole: oldRole, newContractRole: contractRole }, '合同角色已更新');
});

module.exports = router;
