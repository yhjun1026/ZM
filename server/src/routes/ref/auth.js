/**
 * 认证路由 - 登录/登出/会话恢复
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../../compat/database');
const { generateToken, authMiddleware } = require('../../compat/auth');
const { success, error } = require('../../compat/helpers');

// 登录
router.post('/login', (req, res) => {
  const { empId, password } = req.body;
  if (!empId || !password) {
    return error(res, 400, '请输入工号和密码');
  }
  // 密码格式校验
  if (password.length < 6) {
    return error(res, 400, '密码不低于6位');
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return error(res, 400, '密码必须由字母和数字组成');
  }

  const user = db.prepare('SELECT * FROM users WHERE emp_id = ?').get(empId);
  if (!user) {
    return error(res, 401, '账号或密码错误');
  }

  // 验证密码 (支持明文和bcrypt)
  let valid = false;
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    valid = bcrypt.compareSync(password, user.password);
  } else {
    valid = user.password === password;
  }
  if (!valid) {
    return error(res, 401, '账号或密码错误');
  }

  // 离职账号自动冻结：禁止登录
  if (user.status === '离职') {
    return error(res, 403, '该账号已离职冻结，无法登录系统');
  }

  const token = generateToken(user);
  const userData = {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    avatarColor: user.avatar_color,
    dept: user.dept,
    role: user.role,
    contract_role: user.contract_role || '',
    phone: user.phone,
    token
  };
  return success(res, userData, '登录成功');
});

// 会话恢复
router.get('/session', authMiddleware, (req, res) => {
  const u = req.user;
  return success(res, {
    id: u.id, name: u.name, avatar: u.avatar,
    avatarColor: u.avatarColor, dept: u.dept, role: u.role, contract_role: u.contract_role || '', phone: u.phone,
    leaveBalance: { annual: 5, sick: 3, personal: 2, totalUsed: 3 }
  });
});

// 修改密码
router.post('/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return error(res, 400, '请输入旧密码和新密码');
  }
  if (newPassword.length < 6) {
    return error(res, 400, '新密码不低于6位');
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  let valid = false;
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    valid = bcrypt.compareSync(oldPassword, user.password);
  } else {
    valid = user.password === oldPassword;
  }
  if (!valid) {
    return error(res, 400, '旧密码错误');
  }
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(hashed, req.user.id);
  return success(res, null, '密码修改成功');
});

module.exports = router;
