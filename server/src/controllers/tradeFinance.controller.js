const db = require('../db');
const { success, fail } = require('../utils/response');

async function dashboard(req, res) {
  try {
    const apTotal = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM trade_ap WHERE status = '待确认'").get().total;
    const arTotal = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM trade_ar WHERE status = '待确认'").get().total;
    
    return res.json(success({
      ap_balance: apTotal,
      ar_balance: arTotal,
      voucher_count: 0,
      sync_errors: 0,
      partner_count: 0
    }));
  } catch (e) {
    return res.json(fail('获取仪表板数据失败: ' + e.message));
  }
}

async function ap(req, res) {
  try {
    const items = db.prepare('SELECT * FROM trade_ap ORDER BY created_at DESC').all();
    return res.json(success(items));
  } catch (e) {
    return res.json(fail('获取应付账款失败: ' + e.message));
  }
}

async function ar(req, res) {
  try {
    const items = db.prepare('SELECT * FROM trade_ar ORDER BY created_at DESC').all();
    return res.json(success(items));
  } catch (e) {
    return res.json(fail('获取应收账款失败: ' + e.message));
  }
}

module.exports = { dashboard, ap, ar };
