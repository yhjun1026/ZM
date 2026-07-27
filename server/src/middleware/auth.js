const { verifyToken } = require('../utils/jwt');
const { fail } = require('../utils/response');

/**
 * JWT 认证中间件：校验 Bearer Token，注入 req.userId / req.userRole。
 * Token 无效或过期返回 401（前端 api.js 据此跳登录）。
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json(fail('未登录或会话已过期，请重新登录'));
  }
  req.userId = decoded.userId;
  req.userRole = decoded.role;
  next();
}

module.exports = authMiddleware;
