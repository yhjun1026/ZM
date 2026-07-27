const { parseJSON } = require('../utils/response');

/**
 * 推进审批流：把第一个未完成步骤标记为已完成，并记录审批人/时间。
 * 用于 projects / business_trips（两者审批逻辑一致）。
 * 注：purchases 的 flow 结构无 user/time 字段、contracts 审批原实现不更新 flow，
 *     这两者各自在控制器内保留原逻辑，以保证行为一致。
 * @returns {string|null} 新 flow JSON（用于 UPDATE）；行不存在返回 null
 */
function advanceFlow(db, table, id, approver) {
  const row = db.prepare(`SELECT flow FROM ${table} WHERE id=?`).get(id);
  if (!row) return null;
  const flow = parseJSON(row.flow) || [];
  const nextIdx = flow.findIndex((f) => !f.done);
  if (nextIdx >= 0) {
    flow[nextIdx].done = true;
    flow[nextIdx].user = approver || flow[nextIdx].user;
    flow[nextIdx].time = new Date().toISOString().slice(0, 10);
  }
  return JSON.stringify(flow);
}

module.exports = { advanceFlow };
