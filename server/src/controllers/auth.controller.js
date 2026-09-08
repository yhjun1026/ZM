const bcrypt = require('bcryptjs');
const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const { signToken } = require('../utils/jwt');
const auditLog = require('../utils/audit');
const { MODULE_KEYS, MODULE_NAME, PERM_ADMIN_ROLES, empBasePerm, getEmpPerms, seedRolePermissions } = require('../utils/rbacPerm');

// ================= 登录 =================
function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json(fail('请输入账号和密码'));
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(username);
  if (!user) {
    auditLog('LOGIN_FAILED', username, 'USER_NOT_FOUND', null);
    return res.json(fail('账号或密码错误'));
  }
  const passwordHash = user.password || '';
  const isHashed = passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$');
  let passwordValid = false;
  if (isHashed) {
    passwordValid = bcrypt.compareSync(password, passwordHash);
  } else {
    passwordValid = password === passwordHash;
    if (passwordValid) {
      const newHash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password=? WHERE id=?').run(newHash, user.id);
    }
  }
  if (!passwordValid) {
    auditLog('LOGIN_FAILED', username, 'WRONG_PASSWORD', null);
    return res.json(fail('账号或密码错误'));
  }
  const token = signToken(user.id, user.role);
  const currentUser = parseJSON((db.prepare('SELECT value FROM kv_store WHERE key=?').get('currentUser') || {}).value) || {};
  currentUser.id = user.id;
  currentUser.name = user.name;
  currentUser.avatar = user.name.charAt(0);
  currentUser.avatarColor = user.avatar_color || currentUser.avatarColor || '#2563eb';
  currentUser.dept = user.dept;
  currentUser.role = user.role;
  currentUser.phone = user.phone;
  currentUser.leaveBalance = parseJSON(user.leave_balance) || currentUser.leaveBalance;
  auditLog('LOGIN_SUCCESS', user.id, null, null);
  return res.json(success({ ...currentUser, token }, '登录成功'));
}

function logout(req, res) {
  auditLog('LOGOUT', req.userId || 'UNKNOWN', null, null);
  return res.json(success({}, '已登出'));
}

function verifyToken(req, res) {
  return res.json(success({ userId: req.userId, role: req.userRole, valid: true }));
}

// ================= 密码安全 =================
function pwdStrength(empNo, pwd) {
  if (!pwd || pwd.length < 6) return '新密码长度至少6位';
  if (pwd.length > 32) return '新密码长度不能超过32位';
  if (/^\d+$/.test(pwd)) return '新密码不能是纯数字';
  const weak = ['123456', '12345678', 'password', 'abc123', 'qwerty', '111111', '000000', '666666', '888888', 'a123456', String(empNo || '').toLowerCase()];
  if (weak.includes(pwd.toLowerCase())) return '新密码过于简单，请更换';
  if (pwd.toLowerCase().includes(String(empNo || '').toLowerCase())) return '新密码不能包含工号';
  return null;
}

// 个人修改密码
function changePassword(req, res) {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.json(fail('旧密码与新密码必填'));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.json(fail('用户不存在'));
  const isHashed = (user.password || '').startsWith('$2a$') || (user.password || '').startsWith('$2b$');
  const oldValid = isHashed ? bcrypt.compareSync(old_password, user.password) : (user.password === old_password);
  if (!oldValid) return res.json(fail('旧密码不正确'));
  const bad = pwdStrength(req.userId, new_password);
  if (bad) return res.json(fail(bad));
  if (new_password === old_password) return res.json(fail('新密码不能与旧密码相同'));
  db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(new_password, 10), req.userId);
  auditLog('CHANGE_PASSWORD', req.userId, null, null);
  return res.json(success({}, '密码修改成功，请使用新密码重新登录'));
}

// 管理员重置他人密码（权限设置归口：超级管理员）
function adminResetPassword(req, res) {
  if (!PERM_ADMIN_ROLES.includes(req.userRole)) return res.json(fail('重置他人密码仅超级管理员可操作'));
  const { emp_no, new_password } = req.body || {};
  if (!emp_no || !new_password) return res.json(fail('工号与新密码必填'));
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(emp_no);
  if (!target) return res.json(fail('员工不存在'));
  const bad = pwdStrength(emp_no, new_password);
  if (bad) return res.json(fail(bad));
  db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(new_password, 10), target.id);
  auditLog('RESET_PASSWORD', req.userId, target.id, null);
  return res.json(success({ emp_no, emp_name: target.name }, `已重置 ${target.name}(${target.id}) 的密码`));
}

// ================= 会话 / 菜单 =================
function me(req, res) {
  const perms = getEmpPerms(req.userRole || '', req.empId || req.userId);
  const leader = db.prepare('SELECT COUNT(*) n FROM org_units WHERE manager_emp_id=?').get(req.empId || -1).n > 0;
  return res.json(success({ emp: { ...req.user, is_leader: leader ? 1 : 0 }, role_name: req.userRole, perms, must_change_pwd: 0 }));
}

function menu(req, res) {
  const perms = getEmpPerms(req.userRole || '', req.empId || req.userId);
  const menus = MODULE_KEYS
    .filter(m => perms[m] && perms[m][0])
    .map(m => ({ module: m, name: MODULE_NAME[m] || m, group: '业务', view: perms[m][0], edit: perms[m][1], approve: perms[m][2] }));
  return res.json(success(menus));
}

// ================= RBAC 权限矩阵 =================
function listRbac(req, res) {
  if (!PERM_ADMIN_ROLES.includes(req.userRole)) return res.json(fail('公司员工权限设置由超级管理员执行和调整'));
  seedRolePermissions();
  const rows = db.prepare('SELECT * FROM role_permissions ORDER BY id').all();
  return res.json(success(rows));
}

function rbacDiffField(cur, body) {
  const changed = ['can_view', 'can_edit', 'can_approve'].filter(f => body[f] !== undefined && (body[f] ? 1 : 0) !== Number(cur[f]));
  if (!changed.length) return { noop: true };
  if (changed.length > 1) return { multi: true, fields: changed };
  return { field: changed[0], value: body[changed[0]] ? 1 : 0 };
}

function updateRbac(req, res) {
  if (!PERM_ADMIN_ROLES.includes(req.userRole)) return res.json(fail('公司员工权限设置由超级管理员执行和调整'));
  const { role, module } = req.params;
  const modName = MODULE_NAME[module];
  if (!modName) return res.json(fail('模块不存在'));
  const cur = db.prepare('SELECT can_view,can_edit,can_approve FROM role_permissions WHERE role=? AND module=?').get(role, module);
  if (!cur) return res.json(fail(`[${role}] 当前无「${modName}」权限记录`));
  const diff = rbacDiffField(cur, req.body || {});
  if (diff.noop) return res.json(fail(`[${role}]「${modName}」权限与当前一致`));
  if (diff.multi) return res.json(fail('一次仅可变更一个权限字段'));
  db.prepare(`UPDATE role_permissions SET ${diff.field}=? WHERE role=? AND module=?`).run(diff.value, role, module);
  auditLog('UPDATE_ROLE_PERM', req.userId, role + ':' + module, `${diff.field}=${diff.value}`);
  return res.json(success({}, `已更新 [${role}]「${modName}」权限`));
}

// ================= 销售区域 =================
function listRegions(req, res) {
  const rows = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM employees e WHERE e.region=r.name AND e.status='在职') staff_count
    FROM sales_regions r ORDER BY r.id`).all();
  return res.json(success(rows));
}

function setRegionManager(req, res) {
  if (!['超级管理员', '销售总监'].includes(req.userRole)) return res.json(fail('区域负责人任命仅超级管理员或销售总监可操作'));
  const { id } = req.params;
  const { emp_id } = req.body || {};
  const reg = db.prepare('SELECT * FROM sales_regions WHERE id=?').get(id);
  if (!reg) return res.json(fail('区域不存在'));
  const emp = db.prepare('SELECT id,name,role,emp_no FROM employees WHERE id=? AND status=?').get(emp_id, '在职');
  if (!emp) return res.json(fail('员工不存在或已停用'));
  if (!['区域经理', '销售总监', '普通员工'].includes(emp.role)) return res.json(fail('区域负责人须为销售序列员工'));
  db.prepare('UPDATE sales_regions SET manager_emp_id=?, manager_name=? WHERE id=?').run(emp.id, emp.name, id);
  db.prepare('UPDATE employees SET region=? WHERE id=?').run(reg.name, emp.id);
  auditLog('SET_REGION_MANAGER', req.userId, reg.name, emp.name);
  return res.json(success({ region: reg.name, manager: emp.name, manager_emp_id: emp.id }));
}

// ================= 员工级权限覆盖 =================
function listRbacEmps(req, res) {
  if (!PERM_ADMIN_ROLES.includes(req.userRole)) return res.json(fail('公司员工权限设置由超级管理员执行和调整'));
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db.prepare(`SELECT e.id,e.emp_no,e.name,e.role,e.region,e.status,
      (SELECT name FROM org_units WHERE id=e.org_id) dept_name FROM employees e
      WHERE (e.emp_no LIKE ? OR e.name LIKE ?) AND e.status IN ('在职','待开通','已停用') ORDER BY e.id LIMIT 50`)
      .all('%' + q + '%', '%' + q + '%');
  } else {
    rows = db.prepare(`SELECT e.id,e.emp_no,e.name,e.role,e.region,e.status,
      (SELECT name FROM org_units WHERE id=e.org_id) dept_name FROM employees e
      WHERE e.status IN ('在职','待开通','已停用') ORDER BY e.id LIMIT 200`).all();
  }
  return res.json(success(rows));
}

function getEmpPerm(req, res) {
  if (!PERM_ADMIN_ROLES.includes(req.userRole)) return res.json(fail('公司员工权限设置由超级管理员执行和调整'));
  const emp = db.prepare('SELECT id,emp_no,name,role,region,title,status FROM employees WHERE id=?').get(req.params.id);
  if (!emp) return res.json(fail('员工不存在'));
  const rolePerms = getEmpPerms(emp.role, emp.id);
  const overrides = db.prepare('SELECT module, can_view, can_edit, can_approve FROM emp_permissions WHERE emp_id=?').all(emp.id);
  const overMap = {};
  overrides.forEach(x => overMap[x.module] = [x.can_view, x.can_edit, x.can_approve]);
  const rows = MODULE_KEYS.filter(m => rolePerms[m]).map(m => ({
    module: m, mod_name: MODULE_NAME[m] || m,
    view: rolePerms[m][0], edit: rolePerms[m][1], approve: rolePerms[m][2],
    overridden: !!overMap[m],
    ov_view: overMap[m] ? overMap[m][0] : null, ov_edit: overMap[m] ? overMap[m][1] : null, ov_approve: overMap[m] ? overMap[m][2] : null,
  })).sort((a, b) => a.module.localeCompare(b.module));
  return res.json(success({ emp, role_name: emp.role, rows }));
}

function setEmpPerm(req, res) {
  if (!PERM_ADMIN_ROLES.includes(req.userRole)) return res.json(fail('公司员工权限设置由超级管理员执行和调整'));
  const emp = db.prepare('SELECT id,emp_no,name,role FROM employees WHERE id=?').get(req.params.id);
  if (!emp) return res.json(fail('员工不存在'));
  const modName = MODULE_NAME[req.params.module];
  if (!modName) return res.json(fail('模块不存在'));
  const base = empBasePerm(emp.role, req.params.module, emp.id);
  if (!base) return res.json(fail(`${emp.name} 当前角色无「${modName}」生效权限记录`));
  const diff = rbacDiffField(base, req.body || {});
  if (diff.noop) return res.json(fail(`${emp.name} 的「${modName}」权限与当前一致`));
  if (diff.multi) return res.json(fail('一次仅可变更一个权限字段'));
  const existing = db.prepare('SELECT id FROM emp_permissions WHERE emp_id=? AND module=?').get(emp.id, req.params.module);
  if (existing) {
    db.prepare(`UPDATE emp_permissions SET ${diff.field}=?, updated_by=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(diff.value, req.userId, existing.id);
  } else {
    const cols = { can_view: 0, can_edit: 0, can_approve: 0, ...base, [diff.field]: diff.value };
    db.prepare(`INSERT INTO emp_permissions (emp_id, module, can_view, can_edit, can_approve, updated_by, updated_at)
      VALUES (?,?,?,?,?,?,datetime('now','localtime'))`)
      .run(emp.id, req.params.module, cols.can_view, cols.can_edit, cols.can_approve, req.userId);
  }
  auditLog('SET_EMP_PERM', req.userId, emp.id + ':' + req.params.module, `${diff.field}=${diff.value}`);
  return res.json(success({}, `已设置 ${emp.name} 的「${modName}」权限`));
}

function clearEmpPerm(req, res) {
  if (!PERM_ADMIN_ROLES.includes(req.userRole)) return res.json(fail('公司员工权限设置由超级管理员执行和调整'));
  const emp = db.prepare('SELECT id,emp_no,name FROM employees WHERE id=?').get(req.params.id);
  if (!emp) return res.json(fail('员工不存在'));
  const modName = MODULE_NAME[req.params.module];
  if (!modName) return res.json(fail('模块不存在'));
  const r = db.prepare('DELETE FROM emp_permissions WHERE emp_id=? AND module=?').run(emp.id, req.params.module);
  if (!r.changes) return res.json(fail(`${emp.name} 当前无「${modName}」权限覆盖`));
  auditLog('CLEAR_EMP_PERM', req.userId, emp.id + ':' + req.params.module, null);
  return res.json(success({}, `已恢复 ${emp.name} 的「${modName}」角色默认权限`));
}

module.exports = {
  login, logout, verifyToken,
  changePassword, adminResetPassword, me, menu,
  listRbac, updateRbac, listRegions, setRegionManager,
  listRbacEmps, getEmpPerm, setEmpPerm, clearEmpPerm,
};
