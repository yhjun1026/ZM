const db = require('../db');
const { success, fail } = require('../utils/response');

async function list(req, res) {
  try {
    const suppliers = db.prepare('SELECT * FROM trade_suppliers ORDER BY created_at DESC').all();
    return res.json(success(suppliers));
  } catch (e) {
    return res.json(fail('获取供应商列表失败: ' + e.message));
  }
}

async function stats(req, res) {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM trade_suppliers').get().c;
    const active = db.prepare("SELECT COUNT(*) as c FROM trade_suppliers WHERE status = '合作中'").get().c;
    
    return res.json(success({
      total, active,
      po_amount: 0,
      newSuppliers: 0
    }));
  } catch (e) {
    return res.json(fail('获取统计失败: ' + e.message));
  }
}

module.exports = { list, stats };
