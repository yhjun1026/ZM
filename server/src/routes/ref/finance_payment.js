/**
 * 对公付款申请路由 (PRD 4.3)
 * 功能: 供应商付款/合同付款/预付款申请、收款方账户档案、付款节点控制、审批流程
 * 审批流程: 提交 → 部门负责人审批 → 财务审核 → 副总审批 → 总经理审批 → 财务付款
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
  if (stepName.includes('财务审核') || stepName.includes('财务付款')) {
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

// ===== 辅助函数: 预算占用 =====
function occupyBudget(budgetId, amount, formNo, occupyType, user) {
  if (!budgetId || amount <= 0) return false;
  const budget = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(budgetId);
  if (!budget) return false;
  const available = budget.total_amount - budget.used_amount - budget.occupied_amount;
  if (available < amount) return false;

  db.prepare(
    `INSERT INTO t_finance_budget_occupy (id, budget_id, occupy_type, related_form_no, amount, status, operator, operator_id)
     VALUES (?,?,?,?,?,?,'占用中',?,?)`
  ).run(genId('OCC'), budgetId, occupyType, formNo, amount, user.name, user.id);

  db.prepare(
    `UPDATE t_finance_budget SET occupied_amount=occupied_amount+?, available_amount=total_amount-used_amount-occupied_amount-?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(amount, amount, budgetId);
  return true;
}

// ===== 辅助函数: 释放预算占用 =====
function releaseBudget(formNo) {
  const occupies = db.prepare("SELECT * FROM t_finance_budget_occupy WHERE related_form_no = ? AND status = '占用中'").all(formNo);
  occupies.forEach(occ => {
    db.prepare("UPDATE t_finance_budget_occupy SET status='已释放', updated_at=datetime('now','localtime') WHERE id=?").run(occ.id);
    db.prepare(
      `UPDATE t_finance_budget SET occupied_amount=occupied_amount-?, available_amount=total_amount-used_amount-occupied_amount, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(occ.amount, occ.budget_id);
  });
}

// ===== 辅助函数: 确认预算占用(审批通过后) =====
function confirmBudget(formNo) {
  const occupies = db.prepare("SELECT * FROM t_finance_budget_occupy WHERE related_form_no = ? AND status = '占用中'").all(formNo);
  occupies.forEach(occ => {
    db.prepare("UPDATE t_finance_budget_occupy SET status='已确认', updated_at=datetime('now','localtime') WHERE id=?").run(occ.id);
    db.prepare(
      `UPDATE t_finance_budget SET used_amount=used_amount+?, occupied_amount=occupied_amount-?, available_amount=total_amount-used_amount-occupied_amount, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(occ.amount, occ.amount, occ.budget_id);
  });
}

// ========== 付款申请 API ==========

// 付款申请列表
router.get('/', (req, res) => {
  const { status, payment_type, dept, applicant, keyword, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_payment WHERE 1=1';
  const params = [];

  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (payment_type && payment_type !== 'all') { sql += ' AND payment_type = ?'; params.push(payment_type); }
  if (dept && dept !== 'all') { sql += ' AND applicant_dept = ?'; params.push(dept); }
  if (applicant && applicant !== 'all') { sql += ' AND applicant_id = ?'; params.push(applicant); }
  if (keyword) {
    sql += ' AND (form_no LIKE ? OR payee_name LIKE ? OR contract_name LIKE ? OR purpose LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (req.user.role === '普通员工') {
    sql += ' AND applicant_id = ?';
    params.push(req.user.id);
  }

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });

  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 付款详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '付款申请不存在');
  row.approval_flow = safeParse(row.approval_flow, []);
  // 获取收款方账户信息
  if (row.payee_name) {
    row.payee_info = db.prepare('SELECT * FROM t_finance_payee WHERE payee_name = ? AND status = ?').get(row.payee_name, '正常') || null;
  }
  // 预算占用信息
  row.budget_occupies = db.prepare("SELECT * FROM t_finance_budget_occupy WHERE related_form_no = ?").all(row.form_no);
  return success(res, row);
});

// 创建付款申请
router.post('/', (req, res) => {
  const {
    payment_type = '供应商付款', payee_name, payee_account, payee_bank,
    contract_id = '', contract_name = '', supplier_id = '',
    total_amount = 0, this_amount = 0, payment_stage = '全款',
    payment_method = '银行转账', purpose = '',
    budget_id = '', status: reqStatus = '草稿', remark = ''
  } = req.body;

  if (!payee_name) return error(res, 400, '请填写收款方名称');
  if (!this_amount || this_amount <= 0) return error(res, 400, '付款金额必须大于0');

  const formNo = genId(getFinanceConfig('form_prefix_payment') || 'FK');
  const finalStatus = reqStatus === '待审批' ? '待审批' : '草稿';

  let flow = [];
  if (finalStatus === '待审批') {
    flow = generateApprovalFlow('payment', req.user.dept);
    flow[0].user = req.user.name;
    flow[0].done = true;
    // 预算占用
    if (budget_id) {
      const occupied = occupyBudget(budget_id, this_amount, formNo, '付款', req.user);
      if (!occupied) return error(res, 400, '预算不足，无法提交付款申请');
    }
  }

  const id = genId('PAY');
  db.prepare(
    `INSERT INTO t_finance_payment
     (id, form_no, applicant, applicant_id, applicant_dept, payment_type, payee_name, payee_account,
      payee_bank, contract_id, contract_name, supplier_id, total_amount, paid_amount, this_amount,
      payment_stage, payment_method, purpose, status, approval_flow, remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, formNo, req.user.name, req.user.id, req.user.dept, payment_type, payee_name, payee_account || '',
    payee_bank || '', contract_id, contract_name, supplier_id, total_amount || this_amount, 0, this_amount,
    payment_stage, payment_method, purpose, finalStatus, JSON.stringify(flow), remark
  );

  return success(res, { id, form_no: formNo }, finalStatus === '待审批' ? '付款申请已提交审批' : '草稿已保存');
});

// 更新付款申请
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '付款申请不存在');
  if (!['草稿', '待审批'].includes(existing.status)) return error(res, 400, '当前状态不可修改');
  if (existing.applicant_id !== req.user.id && req.user.role !== '超级管理员') return error(res, 403, '仅申请人可修改');

  const {
    payment_type, payee_name, payee_account, payee_bank, contract_id, contract_name,
    supplier_id, total_amount, this_amount, payment_stage, payment_method, purpose,
    budget_id = '', remark, status: newStatus
  } = req.body;

  let flow = safeParse(existing.approval_flow, []);
  let finalStatus = existing.status;
  if (newStatus === '待审批') {
    finalStatus = '待审批';
    flow = generateApprovalFlow('payment', req.user.dept);
    flow[0].user = req.user.name;
    flow[0].done = true;
    if (budget_id) {
      releaseBudget(existing.form_no);
      const occupied = occupyBudget(budget_id, this_amount || existing.this_amount, existing.form_no, '付款', req.user);
      if (!occupied) return error(res, 400, '预算不足');
    }
  }

  db.prepare(
    `UPDATE t_finance_payment SET
     payment_type=?, payee_name=?, payee_account=?, payee_bank=?, contract_id=?, contract_name=?,
     supplier_id=?, total_amount=?, this_amount=?, payment_stage=?, payment_method=?, purpose=?,
     remark=?, approval_flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    payment_type || existing.payment_type, payee_name || existing.payee_name,
    payee_account || existing.payee_account, payee_bank || existing.payee_bank,
    contract_id || existing.contract_id, contract_name || existing.contract_name,
    supplier_id || existing.supplier_id, total_amount || existing.total_amount,
    this_amount || existing.this_amount, payment_stage || existing.payment_stage,
    payment_method || existing.payment_method, purpose || existing.purpose,
    remark !== undefined ? remark : existing.remark,
    JSON.stringify(flow), finalStatus, req.params.id
  );

  return success(res, { id: req.params.id }, '付款申请已更新');
});

// 提交审批
router.post('/:id/submit', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '付款申请不存在');
  if (existing.status !== '草稿') return error(res, 400, '仅草稿可提交');
  if (existing.applicant_id !== req.user.id && req.user.role !== '超级管理员') return error(res, 403, '仅申请人可提交');

  const flow = generateApprovalFlow('payment', req.user.dept);
  flow[0].user = req.user.name;
  flow[0].done = true;

  // 如果有预算ID则占用
  const { budget_id } = req.body || {};
  if (budget_id) {
    const occupied = occupyBudget(budget_id, existing.this_amount, existing.form_no, '付款', req.user);
    if (!occupied) return error(res, 400, '预算不足');
  }

  db.prepare('UPDATE t_finance_payment SET status=?, approval_flow=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('待审批', JSON.stringify(flow), req.params.id);
  return success(res, null, '付款申请已提交审批');
});

// 审批
router.post('/:id/approve', requireApprove(), (req, res) => {
  const u = req.user;
  const item = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '付款申请不存在');
  if (['已通过', '已驳回', '已付款'].includes(item.status)) return error(res, 400, '该付款已处理');

  const flow = safeParse(item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;
  if (!checkStepPermission(stepName, u)) return error(res, 403, `当前步骤"${stepName}"无权限审批`);

  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();
  if (req.body.remark) flow[currentIdx].remark = req.body.remark;

  const allDone = flow.every(f => f.done);
  const newStatus = allDone ? '已通过' : '审批中';

  db.prepare('UPDATE t_finance_payment SET approval_flow=?, status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(JSON.stringify(flow), newStatus, req.params.id);

  if (allDone) confirmBudget(item.form_no);

  return success(res, null, allDone ? '付款审批通过' : '审批节点已通过');
});

// 驳回
router.post('/:id/reject', requireApprove(), (req, res) => {
  const { remark } = req.body;
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const item = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '付款申请不存在');
  if (['已通过', '已驳回', '已付款'].includes(item.status)) return error(res, 400, '该付款已处理');

  const flow = safeParse(item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx !== -1 && !checkStepPermission(flow[currentIdx].step, req.user)) return error(res, 403, '无权限驳回');

  db.prepare('UPDATE t_finance_payment SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('已驳回', req.params.id);
  releaseBudget(item.form_no);
  return success(res, null, '已驳回');
});

// 执行付款(财务操作)
router.post('/:id/pay', (req, res) => {
  const u = req.user;
  if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员') return error(res, 403, '仅财务可执行付款');

  const item = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '付款申请不存在');
  if (item.status !== '已通过') return error(res, 400, '仅审批通过可付款');

  const newPaid = item.paid_amount + item.this_amount;
  const newStatus = newPaid >= item.total_amount ? '已付款' : '已通过';

  db.prepare('UPDATE t_finance_payment SET paid_amount=?, status=?, pay_date=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(newPaid, newStatus, formatDate(new Date()), req.params.id);

  return success(res, { paid_amount: newPaid, status: newStatus }, '付款执行成功');
});

// 删除付款申请(仅草稿)
router.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '付款申请不存在');
  if (item.status !== '草稿') return error(res, 400, '仅草稿可删除');
  if (item.applicant_id !== req.user.id && req.user.role !== '超级管理员') return error(res, 403, '仅申请人可删除');
  db.prepare('DELETE FROM t_finance_payment WHERE id = ?').run(req.params.id);
  return success(res, null, '草稿已删除');
});

// ========== 收款方账户档案 API ==========

// 收款方列表
router.get('/payees/list', (req, res) => {
  const { keyword, type, page = 1, pageSize = 20 } = req.query;
  let sql = "SELECT * FROM t_finance_payee WHERE status = '正常'";
  const params = [];
  if (type && type !== 'all') { sql += ' AND payee_type = ?'; params.push(type); }
  if (keyword) { sql += ' AND (payee_name LIKE ? OR bank_account LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;
  const rows = db.prepare(sql).all(...params);

  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;
  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 新增收款方
router.post('/payees', (req, res) => {
  const { payee_name, payee_type = '供应商', bank_account, bank_name, bank_branch = '', related_id = '', remark = '' } = req.body;
  if (!payee_name) return error(res, 400, '收款方名称必填');

  // 查重
  const existing = db.prepare('SELECT id FROM t_finance_payee WHERE payee_name = ? AND status = ?').get(payee_name, '正常');
  if (existing) return error(res, 409, '收款方已存在');

  const id = genId('PAYEE');
  db.prepare(
    `INSERT INTO t_finance_payee (id, payee_name, payee_type, bank_account, bank_name, bank_branch, related_id, status, creator, creator_id, remark)
     VALUES (?,?,?,?,?,?,?, '正常', ?, ?, ?)`
  ).run(id, payee_name, payee_type, bank_account || '', bank_name || '', bank_branch, related_id, req.user.name, req.user.id, remark);
  return success(res, { id }, '收款方档案已创建');
});

// 更新收款方
router.put('/payees/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_payee WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '收款方不存在');
  const { payee_name, payee_type, bank_account, bank_name, bank_branch, remark, status } = req.body;
  db.prepare(
    `UPDATE t_finance_payee SET payee_name=?, payee_type=?, bank_account=?, bank_name=?, bank_branch=?, remark=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    payee_name || existing.payee_name, payee_type || existing.payee_type,
    bank_account || existing.bank_account, bank_name || existing.bank_name,
    bank_branch || existing.bank_branch, remark !== undefined ? remark : existing.remark,
    status || existing.status, req.params.id
  );
  return success(res, { id: req.params.id }, '收款方档案已更新');
});

// 删除收款方(软删除-标记停用)
router.delete('/payees/:id', (req, res) => {
  db.prepare("UPDATE t_finance_payee SET status='已停用', updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  return success(res, null, '收款方已停用');
});

module.exports = router;
