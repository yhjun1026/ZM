const logger = require('../utils/logger');
const { fail } = require('../utils/response');

/** 404：API 返回 JSON；非 API 已由 SPA 兜底处理，到这里说明真不存在 */
function notFound(req, res) {
  return res.status(404).json(fail('接口不存在'));
}

/** 统一错误处理：捕获所有未处理异常，避免向前端暴露堆栈 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('[UNHANDLED] %s', err.stack || err.message);
  const msg = process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message;
  res.status(500).json({ success: false, data: null, message: msg });
}

module.exports = { notFound, errorHandler };
