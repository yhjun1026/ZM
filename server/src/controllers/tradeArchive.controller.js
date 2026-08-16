const db = require('../db');
const { success, fail } = require('../utils/response');

async function list(req, res) {
  try {
    const archives = db.prepare('SELECT * FROM trade_archive ORDER BY created_at DESC').all();
    return res.json(success(archives));
  } catch (e) {
    return res.json(fail('获取归档列表失败: ' + e.message));
  }
}

async function stats(req, res) {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM trade_archive').get().c;
    const pending = db.prepare("SELECT COUNT(*) as c FROM trade_archive WHERE status = '待归档'").get().c;
    const filed = db.prepare("SELECT COUNT(*) as c FROM trade_archive WHERE status = '已归档'").get().c;
    const customers = db.prepare("SELECT COUNT(*) as c FROM trade_archive WHERE target_type = 'customer'").get().c;
    const suppliers = db.prepare("SELECT COUNT(*) as c FROM trade_archive WHERE target_type = 'supplier'").get().c;
    
    return res.json(success({
      total, pending, filed, borrowed: 0,
      customers, suppliers
    }));
  } catch (e) {
    return res.json(fail('获取统计失败: ' + e.message));
  }
}

module.exports = { list, stats };
