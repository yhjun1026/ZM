const logger = require('./logger');

/** 成功响应体 */
function success(data, msg = '') {
  return { success: true, data, message: msg };
}

/** 失败响应体 */
function fail(msg) {
  return { success: false, data: null, message: msg };
}

/** 安全失败：详细错误记日志，对外只返回通用消息（不暴露内部细节） */
function safeFail(msg, e) {
  if (e) logger.error('[SERVER-ERROR] %s: %s', msg, e.message);
  return fail(msg);
}

/** 安全解析 JSON，失败返回 null */
function parseJSON(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

module.exports = { success, fail, safeFail, parseJSON };
