/**
 * 台账与报表中心路由 (PRD 第八章)
 * 功能: 四类台账(报销/借款/付款/发票)、多维度筛选导出、统计趋势分析、权限隔离
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 辅助函数: 数据权限过滤 =====
function getDataFilter(user) {
  if (user.role === '超级管理员' || user.role === '总经理' || user.role === '副总') {
    return { filter: '', params: [] }; // 全量
  }
  if (user.role === '部门经理') {
    return { filter: ' AND applicant_dept = ?', params: [user.dept] }; // 本部门
  }
  return { filter: ' AND applicant_id = ?', params: [user.id] }; // 本人
}

// ========== 四类台账 ==========

// 1. 报销台账
router.get('/expense', (req, res) => {
  const { startDate, endDate, dept, expense_type, status, applicant, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM t_finance_expense WHERE 1=1';
  const params = [];

  if (startDate) { sql += ' AND reimburse_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND reimburse_date <= ?'; params.push(endDate); }
  if (dept && dept !== 'all') { sql += ' AND applicant_dept = ?'; params.push(dept); }
  if (expense_type && expense_type !== 'all') { sql += ' AND expense_type = ?'; params.push(expense_type); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (applicant && applicant !== 'all') { sql += ' AND applicant_id = ?'; params.push(applicant); }

  // 数据权限
  const df = getDataFilter(req.user);
  sql += df.filter;
  params.push(...df.params);

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  // 汇总统计
  let summarySql = sql.replace('SELECT *', 'SELECT COALESCE(SUM(total_amount), 0) as total_amount, COALESCE(SUM(actual_amount), 0) as actual_amount, COUNT(*) as count').replace(/LIMIT.*$/, '').replace(/ORDER BY.*$/, '');
  const summary = db.prepare(summarySql).get(...params);

  return success(res, { list: rows, total, summary, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 2. 借款台账
router.get('/loan', (req, res) => {
  const { startDate, endDate, dept, loan_type, status, applicant, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM t_finance_loan WHERE 1=1';
  const params = [];

  if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate + ' 23:59:59'); }
  if (dept && dept !== 'all') { sql += ' AND applicant_dept = ?'; params.push(dept); }
  if (loan_type && loan_type !== 'all') { sql += ' AND loan_type = ?'; params.push(loan_type); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (applicant && applicant !== 'all') { sql += ' AND applicant_id = ?'; params.push(applicant); }

  const df = getDataFilter(req.user);
  sql += df.filter;
  params.push(...df.params);

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  let summarySql = sql.replace('SELECT *', 'SELECT COALESCE(SUM(amount), 0) as total_amount, COALESCE(SUM(outstanding_amount), 0) as outstanding, COUNT(*) as count').replace(/LIMIT.*$/, '').replace(/ORDER BY.*$/, '');
  const summary = db.prepare(summarySql).get(...params);

  return success(res, { list: rows, total, summary, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 3. 付款台账
router.get('/payment', (req, res) => {
  const { startDate, endDate, dept, payment_type, status, applicant, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM t_finance_payment WHERE 1=1';
  const params = [];

  if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate + ' 23:59:59'); }
  if (dept && dept !== 'all') { sql += ' AND applicant_dept = ?'; params.push(dept); }
  if (payment_type && payment_type !== 'all') { sql += ' AND payment_type = ?'; params.push(payment_type); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (applicant && applicant !== 'all') { sql += ' AND applicant_id = ?'; params.push(applicant); }

  const df = getDataFilter(req.user);
  sql += df.filter;
  params.push(...df.params);

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  let summarySql = sql.replace('SELECT *', 'SELECT COALESCE(SUM(this_amount), 0) as total_amount, COALESCE(SUM(paid_amount), 0) as paid, COUNT(*) as count').replace(/LIMIT.*$/, '').replace(/ORDER BY.*$/, '');
  const summary = db.prepare(summarySql).get(...params);

  return success(res, { list: rows, total, summary, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 4. 发票台账
router.get('/invoice', (req, res) => {
  const { startDate, endDate, invoice_type, status, verified, keyword, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM t_finance_invoice WHERE 1=1';
  const params = [];

  if (startDate) { sql += ' AND invoice_date >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND invoice_date <= ?'; params.push(endDate); }
  if (invoice_type && invoice_type !== 'all') { sql += ' AND invoice_type = ?'; params.push(invoice_type); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (verified && verified !== 'all') { sql += ' AND verified = ?'; params.push(verified); }
  if (keyword) { sql += ' AND (invoice_code LIKE ? OR invoice_no LIKE ? OR seller LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  let summarySql = sql.replace('SELECT *', 'SELECT COALESCE(SUM(total_amount), 0) as total_amount, COALESCE(SUM(amount), 0) as net_amount, COALESCE(SUM(tax_amount), 0) as tax, COUNT(*) as count').replace(/LIMIT.*$/, '').replace(/ORDER BY.*$/, '');
  const summary = db.prepare(summarySql).get(...params);

  return success(res, { list: rows, total, summary, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// ========== 统计趋势分析 ==========

// 月度趋势统计
router.get('/stats/monthly-trend', (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  const expenseTrend = db.prepare(
    `SELECT substr(reimburse_date, 6, 2) as month,
      COUNT(*) as count, COALESCE(SUM(total_amount), 0) as amount
     FROM t_finance_expense
     WHERE substr(reimburse_date, 1, 4) = ? AND status != '已驳回'
     GROUP BY month ORDER BY month`
  ).all(String(year));

  const paymentTrend = db.prepare(
    `SELECT substr(created_at, 6, 2) as month,
      COUNT(*) as count, COALESCE(SUM(this_amount), 0) as amount
     FROM t_finance_payment
     WHERE substr(created_at, 1, 4) = ? AND status != '已驳回'
     GROUP BY month ORDER BY month`
  ).all(String(year));

  const loanTrend = db.prepare(
    `SELECT substr(created_at, 6, 2) as month,
      COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
     FROM t_finance_loan
     WHERE substr(created_at, 1, 4) = ? AND status != '已驳回'
     GROUP BY month ORDER BY month`
  ).all(String(year));

  // 组装12个月数据
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const exp = expenseTrend.find(t => t.month === mm) || { count: 0, amount: 0 };
    const pay = paymentTrend.find(t => t.month === mm) || { count: 0, amount: 0 };
    const loan = loanTrend.find(t => t.month === mm) || { count: 0, amount: 0 };
    months.push({ month: mm, expense: exp, payment: pay, loan: loan });
  }

  return success(res, { year: parseInt(year), months }, '月度趋势统计');
});

// 部门维度统计
router.get('/stats/by-department', (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  const byDept = db.prepare(
    `SELECT applicant_dept as dept,
      COALESCE(SUM(CASE WHEN 't_finance_expense' != '' THEN total_amount ELSE 0 END), 0) as expense_amount
     FROM t_finance_expense
     WHERE substr(reimburse_date, 1, 4) = ? AND status != '已驳回' AND applicant_dept != ''
     GROUP BY applicant_dept`
  ).all(String(year));

  const expenseByDept = db.prepare(
    `SELECT applicant_dept as dept, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as amount
     FROM t_finance_expense
     WHERE substr(reimburse_date, 1, 4) = ? AND status != '已驳回' AND applicant_dept != ''
     GROUP BY applicant_dept ORDER BY amount DESC`
  ).all(String(year));

  const paymentByDept = db.prepare(
    `SELECT applicant_dept as dept, COUNT(*) as count, COALESCE(SUM(this_amount), 0) as amount
     FROM t_finance_payment
     WHERE substr(created_at, 1, 4) = ? AND status != '已驳回' AND applicant_dept != ''
     GROUP BY applicant_dept ORDER BY amount DESC`
  ).all(String(year));

  const loanByDept = db.prepare(
    `SELECT applicant_dept as dept, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
     FROM t_finance_loan
     WHERE substr(created_at, 1, 4) = ? AND status != '已驳回' AND applicant_dept != ''
     GROUP BY applicant_dept ORDER BY amount DESC`
  ).all(String(year));

  return success(res, { year: parseInt(year), expense: expenseByDept, payment: paymentByDept, loan: loanByDept });
});

// 费用类别统计
router.get('/stats/by-category', (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  const expenseByCategory = db.prepare(
    `SELECT d.category, COUNT(*) as count, COALESCE(SUM(d.amount), 0) as amount
     FROM t_finance_expense_detail d
     JOIN t_finance_expense e ON d.expense_id = e.id
     WHERE substr(e.reimburse_date, 1, 4) = ? AND e.status != '已驳回'
     GROUP BY d.category ORDER BY amount DESC`
  ).all(String(year));

  const invoiceByType = db.prepare(
    `SELECT invoice_type, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as amount
     FROM t_finance_invoice
     WHERE substr(invoice_date, 1, 4) = ? AND status = '正常'
     GROUP BY invoice_type ORDER BY amount DESC`
  ).all(String(year));

  return success(res, { year: parseInt(year), expense_by_category: expenseByCategory, invoice_by_type: invoiceByType });
});

// 综合总览看板
router.get('/stats/overview', (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  // 报销统计
  const expenseStats = db.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total,
      COALESCE(SUM(CASE WHEN status='已付款' THEN actual_amount ELSE 0 END), 0) as paid
     FROM t_finance_expense
     WHERE substr(reimburse_date, 1, 4) = ? AND status != '已驳回'`
  ).get(String(year));

  // 借款统计
  const loanStats = db.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total,
      COALESCE(SUM(outstanding_amount), 0) as outstanding
     FROM t_finance_loan
     WHERE substr(created_at, 1, 4) = ? AND status != '已驳回'`
  ).get(String(year));

  // 付款统计
  const paymentStats = db.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(this_amount), 0) as total,
      COALESCE(SUM(paid_amount), 0) as paid
     FROM t_finance_payment
     WHERE substr(created_at, 1, 4) = ? AND status != '已驳回'`
  ).get(String(year));

  // 发票统计
  const invoiceStats = db.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
     FROM t_finance_invoice
     WHERE substr(invoice_date, 1, 4) = ? AND status = '正常'`
  ).get(String(year));

  // 预算统计
  const budgetStats = db.prepare(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total,
      COALESCE(SUM(used_amount), 0) as used, COALESCE(SUM(occupied_amount), 0) as occupied
     FROM t_finance_budget WHERE year = ?`
  ).get(parseInt(year));

  return success(res, {
    year: parseInt(year),
    expense: expenseStats,
    loan: loanStats,
    payment: paymentStats,
    invoice: invoiceStats,
    budget: {
      ...budgetStats,
      usage_rate: budgetStats.total > 0 ? ((budgetStats.used / budgetStats.total) * 100).toFixed(1) : '0'
    }
  }, '财务总览看板');
});

// 导出台账CSV(带BOM头支持中文)
router.get('/export/:type', (req, res) => {
  const { type } = req.params;
  const { startDate, endDate, dept } = req.query;

  let sql = '', headers = [], fields = [];

  if (type === 'expense') {
    sql = 'SELECT form_no, applicant, applicant_dept, expense_type, total_amount, actual_amount, status, reimburse_date FROM t_finance_expense WHERE 1=1';
    headers = ['单号', '申请人', '部门', '类型', '报销金额', '实付金额', '状态', '报销日期'];
    fields = ['form_no', 'applicant', 'applicant_dept', 'expense_type', 'total_amount', 'actual_amount', 'status', 'reimburse_date'];
  } else if (type === 'loan') {
    sql = 'SELECT form_no, applicant, applicant_dept, loan_type, amount, outstanding_amount, status, expected_repay_date FROM t_finance_loan WHERE 1=1';
    headers = ['单号', '申请人', '部门', '类型', '借款金额', '未还金额', '状态', '预计还款日期'];
    fields = ['form_no', 'applicant', 'applicant_dept', 'loan_type', 'amount', 'outstanding_amount', 'status', 'expected_repay_date'];
  } else if (type === 'payment') {
    sql = 'SELECT form_no, applicant, applicant_dept, payment_type, payee_name, this_amount, status, pay_date FROM t_finance_payment WHERE 1=1';
    headers = ['单号', '申请人', '部门', '类型', '收款方', '付款金额', '状态', '付款日期'];
    fields = ['form_no', 'applicant', 'applicant_dept', 'payment_type', 'payee_name', 'this_amount', 'status', 'pay_date'];
  } else if (type === 'invoice') {
    sql = 'SELECT invoice_code, invoice_no, invoice_type, seller, total_amount, status, verified, invoice_date FROM t_finance_invoice WHERE 1=1';
    headers = ['发票代码', '发票号码', '类型', '销方', '价税合计', '状态', '校验', '开票日期'];
    fields = ['invoice_code', 'invoice_no', 'invoice_type', 'seller', 'total_amount', 'status', 'verified', 'invoice_date'];
  } else {
    return error(res, 400, '不支持的类型');
  }

  const params = [];
  if (startDate) { sql += ' AND created_at >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND created_at <= ?'; params.push(endDate + ' 23:59:59'); }
  if (dept && dept !== 'all') { sql += ' AND applicant_dept = ?'; params.push(dept); }
  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params);

  // 构建CSV
  const bom = '\uFEFF';
  let csv = bom + headers.join(',') + '\n';
  rows.forEach(row => {
    csv += fields.map(f => {
      const val = row[f] !== null ? String(row[f]).replace(/,/g, ';') : '';
      return val;
    }).join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=ledger_${type}_${new Date().toISOString().slice(0,10)}.csv`);
  return res.send(csv);
});

module.exports = router;
