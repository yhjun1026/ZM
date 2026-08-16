/**
 * 销售统计路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireAction } = require('../../compat/auth');
const { success, error, genId } = require('../../compat/helpers');

router.use(authMiddleware);

// 销售记录列表
router.get('/records', (req, res) => {
  const rows = db.prepare('SELECT * FROM sales_records ORDER BY created_at DESC').all();
  return success(res, rows);
});

// 录入销售数据 (仅销售总监可录入)
router.post('/records', requireAction('createSale'), (req, res) => {
  const { date, salesperson, customer, product, amount, region, remark } = req.body;
  if (!customer || !amount) return error(res, 400, '请填写完整信息');
  const id = genId('SR');
  db.prepare(`INSERT INTO sales_records (id,date,salesperson,customer,product,amount,region,status,remark)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, date||new Date().toISOString().slice(0,10), salesperson||req.user.name, customer, product||'', amount||0, region||'', '待确认', remark||'');
  return success(res, { id }, '销售数据已录入');
});

// 销售统计概览
router.get('/overview', (req, res) => {
  const records = db.prepare("SELECT * FROM sales_records WHERE status='已确认'").all();
  const totalRevenue = records.reduce((sum, r) => sum + r.amount, 0);
  const deals = records.length;
  const avgDeal = deals > 0 ? Math.round(totalRevenue / deals) : 0;
  return success(res, { totalRevenue, deals, avgDeal, target: 12000000, rate: deals > 0 ? Math.round(totalRevenue / 12000000 * 1000) / 10 : 0 });
});

// 月度销售趋势
router.get('/monthly', (req, res) => {
  const records = db.prepare("SELECT date, amount, status FROM sales_records WHERE status='已确认'").all();
  const months = {};
  for (let i = 1; i <= 12; i++) {
    const m = String(i).padStart(2, '0');
    months[m] = { revenue: 0, deals: 0 };
  }
  records.forEach(r => {
    const m = (r.date || '').substring(5, 7);
    if (m && months[m]) {
      months[m].revenue += r.amount || 0;
      months[m].deals += 1;
    }
  });
  const result = Object.keys(months).sort().map(m => ({
    month: parseInt(m) + '月',
    revenue: Math.round(months[m].revenue / 10000 * 10) / 10,
    deals: months[m].deals
  }));
  return success(res, result);
});

module.exports = router;
