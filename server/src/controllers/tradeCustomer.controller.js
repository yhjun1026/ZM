const db = require('../db');
const { success, fail } = require('../utils/response');

async function list(req, res) {
  try {
    const customers = db.prepare('SELECT * FROM trade_customers ORDER BY created_at DESC').all();
    return res.json(success(customers));
  } catch (e) {
    return res.json(fail('获取客户列表失败: ' + e.message));
  }
}

async function stats(req, res) {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM trade_customers').get().c;
    const active = db.prepare("SELECT COUNT(*) as c FROM trade_customers WHERE status = '合作中'").get().c;
    
    return res.json(success({
      total, active,
      so_amount: 0,
      newCustomers: 0,
      pendingAlerts: 0
    }));
  } catch (e) {
    return res.json(fail('获取统计失败: ' + e.message));
  }
}

async function createApply(req, res) {
  try {
    const { biz_type, form } = req.body;
    const id = 'TC-' + Date.now();
    
    db.prepare(`
      INSERT INTO trade_customer_applies (id, biz_type, applicant, form_data, status, created_at)
      VALUES (?, ?, ?, ?, '待审批', datetime('now'))
    `).run(id, biz_type, req.user.name, JSON.stringify(form));
    
    return res.json(success({ id }, '申请已提交'));
  } catch (e) {
    return res.json(fail('提交申请失败: ' + e.message));
  }
}

module.exports = { list, stats, createApply };
