const bcrypt = require('bcryptjs');
const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const { signToken } = require('../utils/jwt');
const auditLog = require('../utils/audit');

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
    // 兼容旧明文密码（过渡期），校验通过后自动升级为 bcrypt
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
  const currentUser = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('currentUser').value) || {};
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
  // 到达这里说明 auth 中间件已校验通过
  return res.json(success({ userId: req.userId, role: req.userRole, valid: true }));
}

module.exports = { login, logout, verifyToken };
