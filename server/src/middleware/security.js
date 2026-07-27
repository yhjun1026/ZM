const xssFilter = require('xss');
const auditLog = require('../utils/audit');
const { fail } = require('../utils/response');

/** HTTP 安全响应头 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

const SENSITIVE = [
  '/server/', '/src/', '/node_modules/', '.db', '.env', '.git',
  '.log', '/migrations/', '/scripts/', '/tests/',
];

/** 禁止通过 HTTP 访问敏感文件/目录（防御纵深；静态服务本就只暴露 public/） */
function sensitiveFileGuard(req, res, next) {
  const p = req.path.toLowerCase();
  for (const sp of SENSITIVE) {
    if (p.includes(sp)) {
      auditLog('BLOCKED_FILE_ACCESS', null, req.path, null);
      return res.status(403).json(fail('访问被拒绝'));
    }
  }
  next();
}

function sanitizeObject(obj) {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = xssFilter(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/** 对请求体字符串字段做 XSS 消毒 */
function xssSanitize(req, res, next) {
  if (req.body && typeof req.body === 'object') sanitizeObject(req.body);
  next();
}

module.exports = { securityHeaders, sensitiveFileGuard, xssSanitize };
