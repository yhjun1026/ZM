const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

// 确保数据目录存在（fresh clone 时 server/data 可能不存在）
fs.mkdirSync(path.dirname(config.db.path), { recursive: true });

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
