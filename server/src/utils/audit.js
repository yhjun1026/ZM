const db = require('../db');
const logger = require('./logger');

/**
 * 写审计日志。安全降级：写库失败只记日志，不影响主流程。
 * @param {string} action 动作标识，如 LOGIN_SUCCESS / DELETE_USER / APPROVE_LEAVE
 * @param {string} userId 操作者
 * @param {string} target 操作对象
 * @param {string} detail 详情
 */
function auditLog(action, userId, target, detail) {
  try {
    db.prepare(
      'INSERT INTO audit_log (action,user_id,target,detail,timestamp) VALUES (?,?,?,?,?)'
    ).run(action, userId || 'SYSTEM', target || '', detail || '', new Date().toISOString());
  } catch (e) {
    logger.error('[AUDIT-LOG-ERROR] %s', e.message);
  }
}

module.exports = auditLog;
