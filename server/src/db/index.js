const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('../utils/logger');

const db = new Database(config.db.path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
logger.info(`[DB] 已连接 SQLite: ${config.db.path}`);

// 审计日志表在运行时确保存在（其它业务表由迁移脚本创建）
db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  user_id TEXT,
  target TEXT,
  detail TEXT,
  timestamp TEXT NOT NULL
)`);

module.exports = db;
