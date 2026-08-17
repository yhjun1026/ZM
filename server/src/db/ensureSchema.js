/* 启动自愈：在服务加载业务路由之前，自动执行全部结构迁移（up，幂等）。
 * 背景：移植自参考项目的部分路由在 require 时会做幂等 ALTER/CREATE,
 * 依赖基础表已存在；旧库或全新库直接启动时必须先把结构补齐。
 * 仅执行 up(建表/补列),不执行 seed(种子数据由 npm run seed 显式触发)。
 */
const logger = require('../utils/logger');

let ensured = false;
let seeded = false;

/** 结构迁移：必须在加载业务路由之前执行（移植路由 require 时依赖基础表） */
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
        logger.warn(`[ensureSchema] ${m.id} 执行告警: ${e.message}`);
      }
    }
  }
  logger.info(`[ensureSchema] 表结构已就绪(${migrations.length} 个迁移)`);
}

/** 种子数据：必须在业务路由加载之后执行（部分表由路由/公共库 require 时创建）。
 * 各迁移内部幂等(空表守卫 / kv 一次性标记);设 AUTO_SEED=0 可禁用。 */
function ensureSeeds() {
  if (seeded || process.env.AUTO_SEED === '0') return;
  seeded = true;
  const db = require('./index');
  const migrations = require('./migrations');
  for (const m of migrations) {
    if (m.seed) {
      try {
        m.seed(db);
      } catch (e) {
        logger.warn(`[ensureSeeds] ${m.id} 种子执行告警: ${e.message}`);
      }
    }
  }
  logger.info('[ensureSeeds] 种子数据已就绪');
}

module.exports = { ensureSchema, ensureSeeds };
