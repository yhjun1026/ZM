const { verifyToken } = require('../utils/jwt');
const { fail } = require('../utils/response');
const db = require('../db');

/**
 * JWT 认证中间件：校验 Bearer Token，注入 req.userId / req.userRole / req.user。
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
  // 加载完整用户信息，供各业务控制器使用（req.user.name / dept / role ...）
  try {
    const user = db
      .prepare('SELECT id, name, dept, role, status, phone, email, avatar_color FROM users WHERE id = ?')
      .get(decoded.userId);
    if (user) {
      req.user = user;
      req.userRole = user.role || decoded.role;
    } else {
      // 用户可能已被删除，兜底保留 token 中的信息
      req.user = { id: decoded.userId, name: decoded.userId, dept: '', role: decoded.role };
    }
  } catch (e) {
    req.user = { id: decoded.userId, name: decoded.userId, dept: '', role: decoded.role };
  }
  // 参考项目体系的员工 ID（employees.id，整数）。
  // 当前项目 users.id 混合了数字（'28'）与工号（'ZM001'），而 009 迁移引入的参考项目表
  // 统一用 employees.id 作为人员外键，这里做一次解析，业务代码用 empId(req) 取值即可。
  try {
    const row = db
      .prepare('SELECT id FROM employees WHERE emp_no = ? OR CAST(id AS TEXT) = ? LIMIT 1')
      .get(String(decoded.userId), String(decoded.userId));
    req.empId = row ? row.id : (Number(decoded.userId) || null);
  } catch (e) {
    req.empId = Number(decoded.userId) || null;
  }
  next();
}

module.exports = authMiddleware;
