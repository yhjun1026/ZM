const db = require('../db');
const { parseJSON } = require('./response');

/** 读取 kv_store 中某 key 并解析为对象；不存在返回 null（不再抛错） */
function getKV(key) {
  const row = db.prepare('SELECT value FROM kv_store WHERE key=?').get(key);
  return row ? parseJSON(row.value) : null;
}

module.exports = getKV;
