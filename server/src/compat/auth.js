/* 兼容层：参考项目风格的 auth 中间件。
 * 复用当前工程的 JWT 校验（与登录签发的 token 保持一致），
 * 但注入参考项目路由所期望的完整 req.user 字段（含 contract_role / avatarColor）。
 */
const { verifyToken } = require('../utils/jwt');
const { fail } = require('../utils/response');
const db = require('../db');

function loadUser(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar || (user.name || '?').charAt(0),
    avatarColor: user.avatar_color,
    dept: user.dept,
    role: user.role,
    contract_role: user.contract_role || '',
    phone: user.phone,
    status: user.status,
  };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ code: 401, success: false, msg: '未登录或会话已过期，请重新登录', message: '未登录或会话已过期，请重新登录', data: null });
  }
  const user = loadUser(decoded.userId);
  if (!user) {
    return res.status(401).json({ code: 401, success: false, msg: '用户不存在或已被禁用', message: '用户不存在或已被禁用', data: null });
  }
  if (user.status === '离职') {
    return res.status(401).json({ code: 401, success: false, msg: '该账号已离职冻结，无法访问系统', message: '该账号已离职冻结，无法访问系统', data: null });
  }
  req.user = user;
  req.userId = user.id;
  req.userRole = user.role;
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.slice(7));
    if (decoded) {
      const user = loadUser(decoded.userId);
      if (user) {
        req.user = user;
        req.userId = user.id;
        req.userRole = user.role;
      }
    }
  }
  next();
}

// 参考项目部分路由从 middleware/auth 引入权限装饰器，这里从 rbac 再导出保持兼容
const { requireModule, requireAction, requireApprove } = require('./rbac');

module.exports = { authMiddleware, optionalAuth, requireModule, requireAction, requireApprove };
