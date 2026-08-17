const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');
const logger = require('./utils/logger');

// 启动自愈:加载 app(及业务路由)之前,自动执行结构迁移(幂等,仅建表/补列)。
// 移植自参考项目的路由在 require 时会做表结构迁移,要求基础表已存在。
require('./db/ensureSchema')();

const app = require('./app');

/**
 * 启动时把明文密码升级为 bcrypt 哈希（兼容旧数据 / 种子数据）。
 */
function upgradePasswords() {
  try {
    const users = db.prepare('SELECT id, password FROM users').all();
    let upgraded = 0;
    for (const user of users) {
      const pw = user.password || '';
      if (!pw.startsWith('$2a$') && !pw.startsWith('$2b$')) {
        const hash = bcrypt.hashSync(pw, 10);
        db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, user.id);
        upgraded++;
      }
    }
    if (upgraded > 0) logger.info(`[SECURITY] 已将 ${upgraded} 个明文密码升级为 bcrypt 哈希`);
    else logger.info('[SECURITY] 所有密码均为 bcrypt 哈希，无需升级');
  } catch (e) {
    logger.error('[SECURITY] 密码升级失败（请先运行 npm run init-db）: %s', e.message);
  }
}

const server = app.listen(config.port, () => {
  logger.info('════════════════════════════════════════');
  logger.info('  卓盟智办公 服务已启动 v2.1.0');
  logger.info(`  环境: ${config.env}    端口: ${config.port}`);
  logger.info(`  访问: http://localhost:${config.port}`);
  logger.info(`  健康: http://localhost:${config.port}/api/health`);
  logger.info('════════════════════════════════════════');
  upgradePasswords();
});

// 优雅关闭
function shutdown(signal) {
  logger.info(`收到 ${signal}，正在关闭服务...`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    logger.info('服务已关闭');
    process.exit(0);
  });
  // 兜底：5s 内未完成则强制退出
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
