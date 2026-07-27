const rateLimit = require('express-rate-limit');
const config = require('../config');

/** 全局限速：每 IP 每分钟 max 次 */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.global,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** 登录限速：每 IP 每 15 分钟 max 次，成功请求不计数 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.rateLimit.login,
  message: { success: false, message: '登录尝试过多，请15分钟后再试' },
  skipSuccessfulRequests: true,
});

module.exports = { globalLimiter, loginLimiter };
