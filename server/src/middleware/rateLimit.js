const rateLimit = require('express-rate-limit');
const config = require('../config');

// 关键：在 nginx 反代后，express 默认会用 X-Forwarded-For 第一个值作为 req.ip，
// 如果 nginx 没正确透传这个头，所有外部用户都会被认成同一 IP → 一个用户登录
// 失败次数多了，整个站都被锁。强制用 req.socket.remoteAddress 更可靠。
function getClientIp(req) {
  return (
    (req.ip && req.ip.replace(/^::ffff:/, '')) ||
    req.socket?.remoteAddress?.replace(/^::ffff:/, '') ||
    req.connection?.remoteAddress?.replace(/^::ffff:/, '') ||
    'unknown'
  );
}

/** 全局限速：每 IP 每分钟 max 次 */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.global,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

/** 登录限速：每 IP 每 15 分钟 max 次，成功请求不计数 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.login,
  message: { success: false, message: '登录尝试过多，请15分钟后再试' },
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
});

module.exports = { globalLimiter, loginLimiter, getClientIp };
