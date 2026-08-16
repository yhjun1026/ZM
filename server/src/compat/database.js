/* 兼容层：让参考项目路由直接使用当前工程的数据库连接。
 * 参考项目写法: const { db } = require('../config/database')
 * 移植后写法:   const { db } = require('../compat/database')
 */
const db = require('../db');

// 参考项目的 initDatabase 在当前工程由 migrations(007)承担，这里保留空实现保持接口兼容。
async function initDatabase() {
  return db;
}

module.exports = { db, initDatabase };
