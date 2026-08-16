/**
 * 应收账款管理路由
 * 支持五种付款类型: 首次付款、进度付款、节点付款、合同尾款、预付款
 * 每笔需明确回款比例和时间节点
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 建表 =====
db.exec(`
CREATE TABLE IF NOT EXISTS t_finance_receivable (
  id TEXT PRIMARY KEY,
  receivable_no TEXT DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  contract_no TEXT DEFAULT '',
  contract_amount REAL DEFAULT 0,
  pay_type TEXT DEFAULT '',
  receivable_amount REAL DEFAULT 0,
  received_amount REAL DEFAULT 0,
  pay_ratio REAL DEFAULT 0,
  plan_date TEXT DEFAULT '',
  actual_date TEXT DEFAULT '',
  status TEXT DEFAULT '待回款',
  remark TEXT DEFAULT '',
  creator_name TEXT DEFAULT '',
  creator_dept TEXT DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);
`);

// ===== 列表查询 =====
router.get('/list', (req, res) => {
  const { pay_type, status, keyword } = req.query;
  let sql = 'SELECT * FROM t_finance_receivable WHERE 1=1';
  const params = [];
  if (pay_type) { sql += ' AND pay_type = ?'; params.push(pay_type); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (keyword) { sql += ' AND (customer_name LIKE ? OR contract_no LIKE ? OR receivable_no LIKE ?)'; params.push('%'+keyword+'%','%'+keyword+'%','%'+keyword+'%'); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  return success(res, rows);
});

// ===== 统计 =====
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(receivable_amount),0) as amt FROM t_finance_receivable').get();
  const received = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(received_amount),0) as amt FROM t_finance_receivable WHERE status='已回款'").get();
  const pending = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(receivable_amount - received_amount),0) as amt FROM t_finance_receivable WHERE status IN ('待回款','部分回款')").get();
  const overdue = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(receivable_amount - received_amount),0) as amt FROM t_finance_receivable WHERE status='逾期'").get();
  const byType = db.prepare("SELECT pay_type, COUNT(*) as c, COALESCE(SUM(receivable_amount),0) as amt, COALESCE(SUM(received_amount),0) as recv FROM t_finance_receivable GROUP BY pay_type").all();
  return success(res, { total, received, pending, overdue, byType });
});

// ===== 创建 =====
router.post('/create', (req, res) => {
  const u = req.user;
  const f = req.body;
  if (!f.customer_name) return error(res, 400, '客户名称不能为空');
  if (!f.pay_type) return error(res, 400, '请选择付款类型');

  const VALID_PAY_TYPES = ['首次付款', '进度付款', '节点付款', '合同尾款', '预付款'];
  if (VALID_PAY_TYPES.indexOf(f.pay_type) === -1) return error(res, 400, '无效的付款类型');

  const id = genId('YSK');
  const t = now();
  const receivableAmount = Number(f.receivable_amount) || 0;
  const contractAmount = Number(f.contract_amount) || 0;
  const payRatio = Number(f.pay_ratio) || (contractAmount > 0 ? Math.round(receivableAmount / contractAmount * 1000) / 10 : 0);

  db.prepare(`INSERT INTO t_finance_receivable (id, receivable_no, customer_name, contract_no, contract_amount, pay_type, receivable_amount, received_amount, pay_ratio, plan_date, actual_date, status, remark, creator_name, creator_dept, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, id, f.customer_name, f.contract_no || '', contractAmount, f.pay_type,
      receivableAmount, 0, payRatio, f.plan_date || '', '', '待回款', f.remark || '',
      u.name, u.dept, t, t);

  return success(res, { id }, '应收账款已创建');
});

// ===== 更新 =====
router.put('/update/:id', (req, res) => {
  const f = req.body;
  const row = db.prepare('SELECT * FROM t_finance_receivable WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '记录不存在');

  const receivableAmount = Number(f.receivable_amount) || row.receivable_amount;
  const contractAmount = Number(f.contract_amount) || row.contract_amount;
  const payRatio = Number(f.pay_ratio) || (contractAmount > 0 ? Math.round(receivableAmount / contractAmount * 1000) / 10 : 0);

  db.prepare(`UPDATE t_finance_receivable SET customer_name=?, contract_no=?, contract_amount=?, pay_type=?, receivable_amount=?, pay_ratio=?, plan_date=?, remark=?, updated_at=? WHERE id=?`)
    .run(f.customer_name || row.customer_name, f.contract_no || row.contract_no, contractAmount,
      f.pay_type || row.pay_type, receivableAmount, payRatio, f.plan_date || row.plan_date,
      f.remark !== undefined ? f.remark : row.remark, now(), req.params.id);

  return success(res, { id: req.params.id }, '已更新');
});

// ===== 登记回款 =====
router.post('/receive/:id', (req, res) => {
  const u = req.user;
  const { amount, receive_date, remark } = req.body;
  const recvAmount = Number(amount) || 0;
  if (recvAmount <= 0) return error(res, 400, '回款金额必须大于0');

  const row = db.prepare('SELECT * FROM t_finance_receivable WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '记录不存在');

  const newReceived = (row.received_amount || 0) + recvAmount;
  let newStatus = '部分回款';
  if (newReceived >= row.receivable_amount) newStatus = '已回款';

  db.prepare(`UPDATE t_finance_receivable SET received_amount=?, actual_date=?, status=?, remark = CASE WHEN ? != '' THEN remark || ' | ' || ? ELSE remark END, updated_at=? WHERE id=?`)
    .run(newReceived, receive_date || now(), newStatus, remark || '', remark || '', now(), req.params.id);

  return success(res, { id: req.params.id, received_amount: newReceived, status: newStatus }, '回款已登记');
});

// ===== 删除 =====
router.delete('/delete/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_receivable WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '记录不存在');
  if (row.status === '已回款') return error(res, 400, '已回款记录不可删除');
  db.prepare('DELETE FROM t_finance_receivable WHERE id = ?').run(req.params.id);
  return success(res, { id: req.params.id }, '已删除');
});

module.exports = router;
