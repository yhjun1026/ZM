/**
 * 借款管理路由 (PRD 4.2)
 * 功能: 借款申请CRUD、台账、未结清借款拦截、超期预警、自动冲抵
 * 审批流程: 提交 → 部门负责人审批 → 财务审核 → 副总审批 → 总经理审批 → 财务放款
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove } = require('../../compat/auth');
const { success, error, safeParse, generateApprovalFlow, now, genId, formatDate } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 辅助函数: 获取财务配置 =====
function getFinanceConfig(key) {
  const row = db.prepare('SELECT config_value FROM t_finance_config WHERE config_key = ? AND status = ?').get(key, '启用');
  return row ? row.config_value : '';
}

// ===== 辅助函数: 步骤级权限检查 =====
function checkStepPermission(stepName, user) {
  const u = user;
  if (stepName.includes('部门负责人')) {
    return u.role === '部门经理' || u.role === '超级管理员' || u.role === '总经理';
  }
  if (stepName.includes('财务审核') || stepName.includes('财务放款') || stepName.includes('财务付款')) {
    return (u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) || u.role === '超级管理员' || u.role === '总经理';
  }
  if (stepName.includes('副总')) {
    return u.role === '副总' || u.role === '超级管理员' || u.role === '总经理';
  }
  if (stepName.includes('总经理')) {
    return u.role === '总经理' || u.role === '超级管理员';
  }
  return true;
}

// ===== 辅助函数: 检查未结清借款拦截 =====
function checkOutstandingLoans(userId) {
  const loans = db.prepare(
    `SELECT id, form_no, amount, outstanding_amount, expected_repay_date,
            julianday('now') - julianday(expected_repay_date) as overdue_days
     FROM t_finance_loan
     WHERE applicant_id = ? AND status = '已通过' AND outstanding_amount > 0`
  ).all(userId);
  return loans;
}

// ===== 辅助函数: 检查超期预警 =====
function checkOverdueLoans() {
  const overdueDays = parseInt(getFinanceConfig('loan_overdue_days') || '30');
  return db.prepare(
    `SELECT id, form_no, applicant, applicant_id, applicant_dept, amount, outstanding_amount,
            expected_repay_date,
            CAST(julianday('now') - julianday(expected_repay_date) AS INTEGER) as overdue_days
     FROM t_finance_loan
     WHERE status = '已通过'
       AND outstanding_amount > 0
       AND julianday('now') - julianday(expected_repay_date) > 0
     ORDER BY overdue_days DESC`
  ).all().map(l => {
    l.is_overdue = true;
    l.overdue_level = l.overdue_days > overdueDays ? '严重' : '一般';
    return l;
  });
}

// ========== API 端点 ==========

// 借款列表(带筛选)
router.get('/', (req, res) => {
  const { status, dept, applicant, keyword, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_loan WHERE 1=1';
  const params = [];

  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (dept && dept !== 'all') { sql += ' AND applicant_dept = ?'; params.push(dept); }
  if (applicant && applicant !== 'all') { sql += ' AND applicant_id = ?'; params.push(applicant); }
  if (keyword) { sql += ' AND (form_no LIKE ? OR applicant LIKE ? OR purpose LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  // 数据权限: 普通员工仅看本人
  if (req.user.role === '普通员工') {
    sql += ' AND applicant_id = ?';
    params.push(req.user.id);
  }

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });

  // 总数
  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 检查未结清借款(拦截用)
router.get('/outstanding-check', (req, res) => {
  const loans = checkOutstandingLoans(req.user.id);
  const hasOutstanding = loans.length > 0;
  return success(res, {
    has_outstanding: hasOutstanding,
    loans: loans,
    total_outstanding: loans.reduce((sum, l) => sum + l.outstanding_amount, 0)
  }, hasOutstanding ? '存在未结清借款' : '无未结清借款');
});

// 超期预警列表
router.get('/overdue-list', (req, res) => {
  const overdueLoans = checkOverdueLoans();
  return success(res, overdueLoans, `共${overdueLoans.length}笔超期借款`);
});

// 借款详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '借款单不存在');
  row.approval_flow = safeParse(row.approval_flow, []);
  // 查询关联的冲抵记录
  row.repayment_records = db.prepare(
    `SELECT e.id as expense_id, e.form_no, e.loan_deduct, e.settle_date, e.applicant
     FROM t_finance_expense e
     WHERE e.loan_deduct > 0 AND e.applicant_id = ?
     ORDER BY e.settle_date DESC`
  ).all(row.applicant_id);
  return success(res, row);
});

// 创建借款(支持草稿)
router.post('/', (req, res) => {
  const {
    loan_type = '备用金',
    amount = 0,
    purpose = '',
    expected_repay_date = '',
    remark = '',
    status: reqStatus = '草稿'
  } = req.body;

  if (!amount || amount <= 0) return error(res, 400, '借款金额必须大于0');
  if (!purpose) return error(res, 400, '请填写借款事由');

  // 检查未结清借款拦截
  const outstanding = checkOutstandingLoans(req.user.id);
  if (outstanding.length > 0) {
    return error(res, 400, `您有${outstanding.length}笔未结清借款，无法新增借款申请`);
  }

  const formNo = genId(getFinanceConfig('form_prefix_loan') || 'JK');
  const finalStatus = reqStatus === '待审批' ? '待审批' : '草稿';

  let flow = [];
  if (finalStatus === '待审批') {
    flow = generateApprovalFlow('loan', req.user.dept);
    flow[0].user = req.user.name;
    flow[0].done = true;
  }

  const id = genId('LOAN');
  db.prepare(
    `INSERT INTO t_finance_loan
     (id, form_no, applicant, applicant_id, applicant_dept, loan_type, amount, purpose,
      expected_repay_date, outstanding_amount, status, approval_flow, remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, formNo, req.user.name, req.user.id, req.user.dept, loan_type, amount, purpose,
    expected_repay_date, amount, finalStatus, JSON.stringify(flow), remark
  );

  return success(res, { id, form_no: formNo }, finalStatus === '待审批' ? '借款申请已提交审批' : '草稿已保存');
});

// 更新借款(仅草稿可修改)
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '借款单不存在');
  if (existing.status !== '草稿') return error(res, 400, '仅草稿状态可修改');
  if (existing.applicant_id !== req.user.id && req.user.role !== '超级管理员') {
    return error(res, 403, '仅申请人可修改');
  }

  const { loan_type, amount, purpose, expected_repay_date, remark, status: newStatus } = req.body;

  let flow = safeParse(existing.approval_flow, []);
  let finalStatus = existing.status;
  if (newStatus === '待审批') {
    finalStatus = '待审批';
    flow = generateApprovalFlow('loan', req.user.dept);
    flow[0].user = req.user.name;
    flow[0].done = true;
  }

  const newAmount = amount || existing.amount;
  db.prepare(
    `UPDATE t_finance_loan SET
     loan_type=?, amount=?, purpose=?, expected_repay_date=?,
     outstanding_amount=?, remark=?, approval_flow=?, status=?,
     updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    loan_type || existing.loan_type, newAmount, purpose || existing.purpose,
    expected_repay_date || existing.expected_repay_date,
    newAmount, remark !== undefined ? remark : existing.remark,
    JSON.stringify(flow), finalStatus, req.params.id
  );

  return success(res, { id: req.params.id }, '借款单已更新');
});

// 提交审批
router.post('/:id/submit', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '借款单不存在');
  if (existing.status !== '草稿') return error(res, 400, '仅草稿状态可提交');

  // 再次检查未结清
  const outstanding = checkOutstandingLoans(req.user.id);
  if (outstanding.length > 0) {
    return error(res, 400, `您有${outstanding.length}笔未结清借款，无法提交`);
  }

  const flow = generateApprovalFlow('loan', req.user.dept);
  flow[0].user = req.user.name;
  flow[0].done = true;

  db.prepare('UPDATE t_finance_loan SET status=?, approval_flow=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('待审批', JSON.stringify(flow), req.params.id);
  return success(res, null, '借款申请已提交审批');
});

// 审批
router.post('/:id/approve', requireApprove(), (req, res) => {
  const u = req.user;
  const item = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '借款单不存在');
  if (['已通过', '已驳回', '已还款'].includes(item.status)) return error(res, 400, '该借款已处理');

  const flow = safeParse(item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;
  if (!checkStepPermission(stepName, u)) {
    return error(res, 403, `当前步骤"${stepName}"无权限审批`);
  }

  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();
  if (req.body.remark) flow[currentIdx].remark = req.body.remark;

  const allDone = flow.every(f => f.done);
  const newStatus = allDone ? '已通过' : '审批中';

  db.prepare('UPDATE t_finance_loan SET approval_flow=?, status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(JSON.stringify(flow), newStatus, req.params.id);

  return success(res, null, allDone ? '借款审批通过' : '审批节点已通过');
});

// 驳回
router.post('/:id/reject', requireApprove(), (req, res) => {
  const { remark } = req.body;
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const item = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '借款单不存在');
  if (['已通过', '已驳回', '已还款'].includes(item.status)) return error(res, 400, '该借款已处理');

  const flow = safeParse(item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx !== -1 && !checkStepPermission(flow[currentIdx].step, req.user)) {
    return error(res, 403, '无权限驳回');
  }

  db.prepare('UPDATE t_finance_loan SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('已驳回', req.params.id);
  return success(res, null, '已驳回');
});

// 手动还款/归还(财务操作)
router.post('/:id/repay', (req, res) => {
  const u = req.user;
  if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员') {
    return error(res, 403, '仅财务可操作还款');
  }
  const { repay_amount, settle_type = '现金归还' } = req.body;
  if (!repay_amount || repay_amount <= 0) return error(res, 400, '还款金额必须大于0');

  const item = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '借款单不存在');
  if (item.status !== '已通过') return error(res, 400, '仅已通过借款可还款');

  const newRepaid = item.repaid_amount + repay_amount;
  const newOutstanding = item.outstanding_amount - repay_amount;
  const newStatus = newOutstanding <= 0 ? '已还款' : item.status;

  db.prepare(
    `UPDATE t_finance_loan SET repaid_amount=?, outstanding_amount=?, status=?, settle_type=?, actual_repay_date=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(newRepaid, newOutstanding, newStatus, settle_type, formatDate(new Date()), req.params.id);

  return success(res, {
    repaid_amount: newRepaid,
    outstanding_amount: newOutstanding,
    status: newStatus
  }, newStatus === '已还款' ? '借款已结清' : '部分还款成功');
});

// 删除借款(仅草稿)
router.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '借款单不存在');
  if (item.status !== '草稿') return error(res, 400, '仅草稿可删除');
  if (item.applicant_id !== req.user.id && req.user.role !== '超级管理员') {
    return error(res, 403, '仅申请人可删除');
  }
  db.prepare('DELETE FROM t_finance_loan WHERE id = ?').run(req.params.id);
  return success(res, null, '草稿已删除');
});

module.exports = router;
