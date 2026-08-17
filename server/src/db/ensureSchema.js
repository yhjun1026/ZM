/* 启动自愈：在服务加载业务路由之前，自动执行全部结构迁移（up，幂等）。
 * 背景：移植自参考项目的部分路由在 require 时会做幂等 ALTER/CREATE,
 * 依赖基础表已存在；旧库或全新库直接启动时必须先把结构补齐。
 * 仅执行 up(建表/补列),不执行 seed(种子数据由 npm run seed 显式触发)。
 */
const logger = require('../utils/logger');

let ensured = false;

function ensureSchema() {
  if (ensured) return;
  ensured = true;
  const db = require('./index');
  const migrations = require('./migrations');
  for (const m of migrations) {
    if (m.up) {
      try {
        m.up(db);
      } catch (e) {
        logger.warn('[ensureSchema] %s 执行告警: %s', m.id, e.message);
      }
    }
  }
  logger.info('[ensureSchema] 表结构已就绪(%d 个迁移)', migrations.length);
}

module.exports = ensureSchema;
