/**
 * 费用报销管理路由 (PRD 4.1)
 * 功能: 普通/差旅报销CRUD、超标校验、多发票关联、借款自动抵扣、草稿暂存、完整审批流程
 * 审批流程: 提交 → 部门负责人审批 → 财务审核 → 副总审批 → 总经理终审 → 财务付款
 * 金额分流: >500总经理终审，≤500副总终审
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove } = require('../../compat/auth');
const { success, error, safeParse, generateApprovalFlow, now, genId, formatDate } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 凭证照片上传配置 =====
const voucherPhotoDir = path.join(__dirname, '..', '..', '..', 'uploads', 'voucher-photos');
if (!fs.existsSync(voucherPhotoDir)) {
  fs.mkdirSync(voucherPhotoDir, { recursive: true });
}

const voucherPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, voucherPhotoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'VCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});

const voucherPhotoUpload = multer({
  storage: voucherPhotoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG/PNG/GIF/BMP/WEBP 图片格式'));
    }
  }
});

// ===== 辅助函数: 获取财务配置 =====
function getFinanceConfig(key) {
  const row = db.prepare('SELECT config_value FROM t_finance_config WHERE config_key = ? AND status = ?').get(key, '启用');
  return row ? row.config_value : '';
}

// ===== 辅助函数: 校验超标 =====
function checkOverStandard(details, expenseType) {
  const results = [];
  const subsidyPerDay = parseFloat(getFinanceConfig('travel_subsidy_per_day') || '200');
  const hotelStd = parseFloat(getFinanceConfig('hotel_standard') || '350');
  const mealStd = parseFloat(getFinanceConfig('meal_standard') || '100');
  const highSpeedStd = parseFloat(getFinanceConfig('transport_standard_highspeed') || '500');
  const flightStd = parseFloat(getFinanceConfig('transport_standard_flight') || '1200');

  (details || []).forEach(d => {
    let stdAmt = 0;
    let isOver = false;
    if (d.category === '住宿费') stdAmt = hotelStd;
    else if (d.category === '餐饮费') stdAmt = mealStd;
    else if (d.category === '交通费') stdAmt = highSpeedStd;

    if (stdAmt > 0 && d.amount > stdAmt) {
      isOver = true;
    }
    results.push({
      ...d,
      is_over_standard: isOver ? 1 : 0,
      standard_amount: stdAmt,
      over_amount: isOver ? (d.amount - stdAmt) : 0
    });
  });
  return results;
}

// ===== 辅助函数: 计算差旅补贴 =====
function calcTravelSubsidy(travelDays) {
  const perDay = parseFloat(getFinanceConfig('travel_subsidy_per_day') || '200');
  return (travelDays || 0) * perDay;
}

// ===== 辅助函数: 查询可抵扣的未结清借款 =====
function getDeductibleLoans(userId) {
  return db.prepare(
    `SELECT id, form_no, amount, repaid_amount, outstanding_amount, loan_type
     FROM t_finance_loan
     WHERE applicant_id = ? AND status = '已通过' AND outstanding_amount > 0
     ORDER BY created_at ASC`
  ).all(userId);
}

// ===== 辅助函数: 步骤级权限检查 =====
function checkStepPermission(stepName, user) {
  const u = user;
  if (stepName.includes('部门负责人')) {
    return u.role === '部门经理' || u.role === '超级管理员' || u.role === '总经理';
  }
  if (stepName.includes('财务审核') || stepName.includes('财务付款') || stepName.includes('财务放款')) {
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

// ===== 辅助函数: 金额分流判断(>500需总经理终审) =====
function needsGmApproval(amount) {
  const threshold = parseFloat(getFinanceConfig('expense_threshold_gm') || '500');
  return amount > threshold;
}

// ========== API 端点 ==========

// 获取费用标准配置
router.get('/standards', (req, res) => {
  const configs = db.prepare(
    "SELECT config_key, config_value, description FROM t_finance_config WHERE config_type = '标准' AND status = '启用'"
  ).all();
  return success(res, configs, '费用标准配置');
});

// 校验超标
router.post('/check-over-standard', (req, res) => {
  const { details, expense_type } = req.body;
  const results = checkOverStandard(details, expense_type);
  const hasOver = results.some(r => r.is_over_standard);
  return success(res, { details: results, has_over_standard: hasOver }, hasOver ? '存在超标项' : '无超标');
});

// 查询可抵扣借款
router.get('/deductible-loans', (req, res) => {
  const loans = getDeductibleLoans(req.user.id);
  return success(res, loans, '可抵扣借款列表');
});

// 报销列表(带筛选)
router.get('/', (req, res) => {
  const { status, expense_type, dept, applicant, keyword, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_expense WHERE 1=1';
  const params = [];

  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (expense_type && expense_type !== 'all') { sql += ' AND expense_type = ?'; params.push(expense_type); }
  if (dept && dept !== 'all') { sql += ' AND applicant_dept = ?'; params.push(dept); }
  if (applicant && applicant !== 'all') { sql += ' AND applicant_id = ?'; params.push(applicant); }
  if (keyword) { sql += ' AND (form_no LIKE ? OR applicant LIKE ? OR remark LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  // 数据权限: 普通员工仅看本人
  if (req.user.role === '普通员工') {
    sql += ' AND applicant_id = ?';
    params.push(req.user.id);
  }

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => {
    r.attachments = safeParse(r.attachments, []);
    r.approval_flow = safeParse(r.approval_flow, []);
  });

  // 总数
  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 报销详情(含明细)
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '报销单不存在');
  row.attachments = safeParse(row.attachments, []);
  row.approval_flow = safeParse(row.approval_flow, []);
  // 获取明细
  row.details = db.prepare('SELECT * FROM t_finance_expense_detail WHERE expense_id = ? ORDER BY id').all(req.params.id);
  row.details.forEach(d => { d.invoice_ids = safeParse(d.invoice_ids, []); });
  // 获取关联发票信息
  if (row.details.length > 0) {
    const allInvoiceIds = row.details.flatMap(d => d.invoice_ids);
    if (allInvoiceIds.length > 0) {
      const placeholders = allInvoiceIds.map(() => '?').join(',');
      row.invoices = db.prepare(`SELECT id, invoice_code, invoice_no, invoice_type, total_amount, seller, invoice_date FROM t_finance_invoice WHERE id IN (${placeholders})`).all(...allInvoiceIds);
    } else {
      row.invoices = [];
    }
  } else {
    row.invoices = [];
  }
  // 获取凭证列表
  row.vouchers = db.prepare('SELECT * FROM t_finance_voucher WHERE expense_id = ? ORDER BY created_at DESC').all(req.params.id);
  return success(res, row);
});

// 创建报销(支持草稿暂存)
router.post('/', (req, res) => {
  const {
    expense_type = '普通报销',
    status: reqStatus = '草稿',
    total_amount = 0,
    travel_days = 0,
    bank_account = '',
    bank_name = '',
    reimburse_date = '',
    attachments = [],
    remark = '',
    details = [],
    loan_deduct = 0
  } = req.body;

  // 生成单号
  const formNo = genId(getFinanceConfig('form_prefix_expense') || 'BX');

  // 差旅报销自动计算补贴
  let travelSubsidy = 0;
  if (expense_type === '差旅报销' && travel_days > 0) {
    travelSubsidy = calcTravelSubsidy(travel_days);
  }

  const actualAmount = (total_amount || 0) + travelSubsidy - (loan_deduct || 0);
  const finalStatus = reqStatus === '待审批' ? '待审批' : '草稿';

  // 生成审批流(仅当提交审批时)
  let flow = [];
  if (finalStatus === '待审批') {
    flow = generateApprovalFlow('reimbursement', req.user.dept);
    flow[0].user = req.user.name;
    // 金额分流: ≤500跳过总经理终审
    if (!needsGmApproval(total_amount)) {
      flow = flow.filter(f => !f.step.includes('总经理终审'));
    }
  }

  const id = genId('EXP');
  const info = db.prepare(
    `INSERT INTO t_finance_expense
     (id, form_no, applicant, applicant_id, applicant_dept, expense_type, status, total_amount,
      travel_days, travel_subsidy, loan_deduct, actual_amount, bank_account, bank_name,
      reimburse_date, attachments, remark, approval_flow)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id, formNo, req.user.name, req.user.id, req.user.dept, expense_type, finalStatus, total_amount,
    travel_days, travelSubsidy, loan_deduct, actualAmount, bank_account, bank_name,
    reimburse_date || formatDate(new Date()), JSON.stringify(attachments), remark, JSON.stringify(flow)
  );

  // 插入明细
  if (details && details.length > 0) {
    const checkedDetails = checkOverStandard(details, expense_type);
    const detailStmt = db.prepare(
      `INSERT INTO t_finance_expense_detail
       (expense_id, category, amount, occur_date, desc, is_over_standard, standard_amount, over_amount, invoice_ids)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    checkedDetails.forEach(d => {
      detailStmt.run(
        id, d.category, d.amount, d.occur_date || '', d.desc || '',
        d.is_over_standard || 0, d.standard_amount || 0, d.over_amount || 0,
        JSON.stringify(d.invoice_ids || [])
      );
    });
  }

  return success(res, { id, form_no: formNo, actual_amount: actualAmount, travel_subsidy: travelSubsidy },
    finalStatus === '待审批' ? '报销申请已提交审批' : '草稿已保存');
});

// 更新报销(仅草稿/待审批可修改)
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '报销单不存在');
  if (!['草稿', '待审批'].includes(existing.status)) return error(res, 400, '当前状态不可修改');

  // 仅本人或管理员可修改
  if (existing.applicant_id !== req.user.id && req.user.role !== '超级管理员') {
    return error(res, 403, '仅申请人可修改');
  }

  const {
    expense_type, total_amount, travel_days, bank_account, bank_name,
    reimburse_date, attachments, remark, details, loan_deduct = 0, status: newStatus
  } = req.body;

  let travelSubsidy = existing.travel_subsidy;
  if (expense_type === '差旅报销' && travel_days > 0) {
    travelSubsidy = calcTravelSubsidy(travel_days);
  }
  const actualAmount = (total_amount || existing.total_amount) + travelSubsidy - (loan_deduct || 0);

  let flow = safeParse(existing.approval_flow, []);
  let finalStatus = existing.status;
  if (newStatus === '待审批') {
    finalStatus = '待审批';
    flow = generateApprovalFlow('reimbursement', req.user.dept);
    flow[0].user = req.user.name;
    flow[0].done = true;
    if (!needsGmApproval(total_amount || existing.total_amount)) {
      flow = flow.filter(f => !f.step.includes('总经理终审'));
    }
  }

  db.prepare(
    `UPDATE t_finance_expense SET
     expense_type=?, total_amount=?, travel_days=?, travel_subsidy=?, loan_deduct=?, actual_amount=?,
     bank_account=?, bank_name=?, reimburse_date=?, attachments=?, remark=?, approval_flow=?, status=?,
     updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    expense_type || existing.expense_type, total_amount || existing.total_amount,
    travel_days || existing.travel_days, travelSubsidy, loan_deduct, actualAmount,
    bank_account || existing.bank_account, bank_name || existing.bank_name,
    reimburse_date || existing.reimburse_date,
    JSON.stringify(attachments || safeParse(existing.attachments, [])),
    remark !== undefined ? remark : existing.remark,
    JSON.stringify(flow), finalStatus, req.params.id
  );

  // 更新明细: 先删后插
  if (details && details.length > 0) {
    db.prepare('DELETE FROM t_finance_expense_detail WHERE expense_id = ?').run(req.params.id);
    const checkedDetails = checkOverStandard(details, expense_type);
    const detailStmt = db.prepare(
      `INSERT INTO t_finance_expense_detail
       (expense_id, category, amount, occur_date, desc, is_over_standard, standard_amount, over_amount, invoice_ids)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    checkedDetails.forEach(d => {
      detailStmt.run(
        req.params.id, d.category, d.amount, d.occur_date || '', d.desc || '',
        d.is_over_standard || 0, d.standard_amount || 0, d.over_amount || 0,
        JSON.stringify(d.invoice_ids || [])
      );
    });
  }

  return success(res, { id: req.params.id, actual_amount: actualAmount, travel_subsidy: travelSubsidy }, '报销单已更新');
});

// 提交审批(从草稿→待审批)
router.post('/:id/submit', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '报销单不存在');
  if (existing.status !== '草稿') return error(res, 400, '仅草稿状态可提交审批');
  if (existing.applicant_id !== req.user.id && req.user.role !== '超级管理员') {
    return error(res, 403, '仅申请人可提交');
  }

  let flow = generateApprovalFlow('reimbursement', req.user.dept);
  flow[0].user = req.user.name;
  flow[0].done = true;
  if (!needsGmApproval(existing.total_amount)) {
    flow = flow.filter(f => !f.step.includes('总经理终审'));
  }

  db.prepare('UPDATE t_finance_expense SET status=?, approval_flow=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('待审批', JSON.stringify(flow), req.params.id);
  return success(res, null, '报销单已提交审批');
});

// 审批
router.post('/:id/approve', requireApprove(), (req, res) => {
  const u = req.user;
  const item = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '报销单不存在');
  if (['已通过', '已驳回', '已付款'].includes(item.status)) return error(res, 400, '该报销单已处理');

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

  db.prepare('UPDATE t_finance_expense SET approval_flow=?, status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(JSON.stringify(flow), newStatus, req.params.id);

  // 审批通过后: 预算占用→已确认
  if (allDone) {
    const budgetOccupy = db.prepare('SELECT * FROM t_finance_budget_occupy WHERE related_id = ? AND status = ?').get(req.params.id, '占用中');
    if (budgetOccupy) {
      db.prepare('UPDATE t_finance_budget_occupy SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
        .run('已确认', budgetOccupy.id);
      // 预算已使用金额 += 占用金额
      db.prepare('UPDATE t_finance_budget SET used_amount=used_amount+?, occupied_amount=occupied_amount-?, available_amount=total_amount-used_amount-occupied_amount, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
        .run(budgetOccupy.amount, budgetOccupy.amount, budgetOccupy.budget_id);
    }
  }

  return success(res, null, allDone ? '报销审批通过' : '审批节点已通过');
});

// 驳回
router.post('/:id/reject', requireApprove(), (req, res) => {
  const { remark } = req.body;
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const item = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '报销单不存在');
  if (['已通过', '已驳回', '已付款'].includes(item.status)) return error(res, 400, '该报销单已处理');

  const flow = safeParse(item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx !== -1 && !checkStepPermission(flow[currentIdx].step, req.user)) {
    return error(res, 403, '无权限驳回');
  }

  db.prepare('UPDATE t_finance_expense SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('已驳回', req.params.id);

  // 释放预算占用
  const budgetOccupy = db.prepare('SELECT * FROM t_finance_budget_occupy WHERE related_id = ? AND status = ?').get(req.params.id, '占用中');
  if (budgetOccupy) {
    db.prepare('UPDATE t_finance_budget_occupy SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run('已释放', budgetOccupy.id);
    db.prepare('UPDATE t_finance_budget SET occupied_amount=occupied_amount-?, available_amount=total_amount-used_amount-occupied_amount, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
      .run(budgetOccupy.amount, budgetOccupy.budget_id);
  }

  return success(res, null, '已驳回');
});

// 标记已付款(财务操作)
router.post('/:id/pay', (req, res) => {
  const u = req.user;
  if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员') {
    return error(res, 403, '仅财务可执行付款操作');
  }
  const item = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '报销单不存在');
  if (item.status !== '已通过') return error(res, 400, '仅审批通过的报销可付款');

  db.prepare('UPDATE t_finance_expense SET status=?, settle_date=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('已付款', formatDate(new Date()), req.params.id);

  // 如有借款抵扣: 更新借款还款记录
  if (item.loan_deduct > 0) {
    const loans = getDeductibleLoans(item.applicant_id);
    let remaining = item.loan_deduct;
    for (const loan of loans) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, loan.outstanding_amount);
      const newRepaid = loan.repaid_amount + deduct;
      const newOutstanding = loan.outstanding_amount - deduct;
      const newStatus = newOutstanding <= 0 ? '已还款' : loan.status;
      db.prepare('UPDATE t_finance_loan SET repaid_amount=?, outstanding_amount=?, status=?, settle_type=?, actual_repay_date=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
        .run(newRepaid, newOutstanding, newStatus, '报销冲抵', formatDate(new Date()), loan.id);
      remaining -= deduct;
    }
  }

  return success(res, null, '已标记付款完成');
});

// 删除报销(仅草稿)
router.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '报销单不存在');
  if (item.status !== '草稿') return error(res, 400, '仅草稿可删除');
  if (item.applicant_id !== req.user.id && req.user.role !== '超级管理员') {
    return error(res, 403, '仅申请人可删除');
  }
  db.prepare('DELETE FROM t_finance_expense WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM t_finance_expense_detail WHERE expense_id = ?').run(req.params.id);
  db.prepare('DELETE FROM t_finance_voucher WHERE expense_id = ?').run(req.params.id);
  return success(res, null, '草稿已删除');
});

// ========== 凭证管理 API ==========

// 获取报销单的凭证列表
router.get('/:id/vouchers', (req, res) => {
  const row = db.prepare('SELECT id FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '报销单不存在');
  const vouchers = db.prepare('SELECT * FROM t_finance_voucher WHERE expense_id = ? ORDER BY created_at DESC').all(req.params.id);
  return success(res, vouchers);
});

// 录入凭证(支持照片上传)
router.post('/:id/vouchers', voucherPhotoUpload.single('photo'), (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(req.params.id);
  if (!row) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return error(res, 404, '报销单不存在');
  }
  // 仅申请人或管理员可录入凭证
  if (row.applicant_id !== req.user.id && req.user.role !== '超级管理员') {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return error(res, 403, '仅申请人可录入凭证');
  }
  const { voucher_type = '发票', voucher_no = '', amount = 0, voucher_date = '', description = '' } = req.body;
  if (!voucher_type) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return error(res, 400, '凭证类型不能为空');
  }

  // 处理上传的照片文件
  let filePath = '';
  let fileName = '';
  if (req.file) {
    filePath = '/uploads/voucher-photos/' + req.file.filename;
    fileName = req.file.originalname;
  }

  const info = db.prepare(
    `INSERT INTO t_finance_voucher (expense_id, voucher_type, voucher_no, amount, voucher_date, description, file_path, file_name, uploaded_by, uploaded_by_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(req.params.id, voucher_type, voucher_no, parseFloat(amount) || 0, voucher_date || formatDate(new Date()), description, filePath, fileName, req.user.name, req.user.id);
  return success(res, { id: info.lastInsertRowid, file_path: filePath, file_name: fileName }, '凭证录入成功');
});

// 更新凭证(支持照片上传)
router.put('/:id/vouchers/:vId', voucherPhotoUpload.single('photo'), (req, res) => {
  const voucher = db.prepare('SELECT * FROM t_finance_voucher WHERE id = ? AND expense_id = ?').get(req.params.vId, req.params.id);
  if (!voucher) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(e) {} }
    return error(res, 404, '凭证不存在');
  }
  const { voucher_type, voucher_no, amount, voucher_date, description } = req.body;

  // 处理新上传的照片
  let filePath = voucher.file_path;
  let fileName = voucher.file_name;
  if (req.file) {
    // 删除旧照片文件
    if (voucher.file_path) {
      const oldFileName = path.basename(voucher.file_path);
      const oldPath = path.join(voucherPhotoDir, oldFileName);
      if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch(e) {} }
    }
    filePath = '/uploads/voucher-photos/' + req.file.filename;
    fileName = req.file.originalname;
  }

  db.prepare(
    `UPDATE t_finance_voucher SET voucher_type=?, voucher_no=?, amount=?, voucher_date=?, description=?, file_path=?, file_name=? WHERE id=?`
  ).run(voucher_type || voucher.voucher_type, voucher_no || voucher.voucher_no, parseFloat(amount) || voucher.amount, voucher_date || voucher.voucher_date, description !== undefined ? description : voucher.description, filePath, fileName, req.params.vId);
  return success(res, null, '凭证已更新');
});

// 删除凭证(同时删除照片文件)
router.delete('/:id/vouchers/:vId', (req, res) => {
  const voucher = db.prepare('SELECT * FROM t_finance_voucher WHERE id = ? AND expense_id = ?').get(req.params.vId, req.params.id);
  if (!voucher) return error(res, 404, '凭证不存在');
  // 删除关联的照片文件
  if (voucher.file_path) {
    const oldFileName = path.basename(voucher.file_path);
    const oldPath = path.join(voucherPhotoDir, oldFileName);
    if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch(e) {} }
  }
  db.prepare('DELETE FROM t_finance_voucher WHERE id = ?').run(req.params.vId);
  return success(res, null, '凭证已删除');
});

// 获取费用报销种类配置
router.get('/types/list', (req, res) => {
  const types = [
    { value: '普通报销', label: '普通报销', categories: ['办公用品', '通讯费', '交通费', '其他'] },
    { value: '差旅报销', label: '差旅报销', categories: ['交通费', '住宿费', '餐饮费', '差旅补贴', '其他'] },
    { value: '办公费报销', label: '办公费报销', categories: ['办公用品', '打印复印', '快递费', '其他'] },
    { value: '会议费报销', label: '会议费报销', categories: ['场地费', '餐饮费', '资料费', '交通费', '其他'] },
    { value: '培训费报销', label: '培训费报销', categories: ['培训费', '教材费', '交通费', '住宿费', '餐饮费', '其他'] },
    { value: '招待费报销', label: '招待费报销', categories: ['餐饮费', '礼品费', '娱乐费', '其他'] },
    { value: '通讯费报销', label: '通讯费报销', categories: ['手机费', '网络费', '电话费', '其他'] },
    { value: '交通费报销', label: '交通费报销', categories: ['公交费', '出租车', '地铁费', '停车费', '过路费', '其他'] },
    { value: '广告宣传费报销', label: '广告宣传费报销', categories: ['广告费', '宣传品', '活动费', '其他'] },
    { value: '维修维护费报销', label: '维修维护费报销', categories: ['设备维修', '办公维修', '其他'] },
    { value: '咨询服务费报销', label: '咨询服务费报销', categories: ['咨询费', '审计费', '法律费', '其他'] },
    { value: '其他费用报销', label: '其他费用报销', categories: ['其他'] }
  ];
  const voucherTypes = [
    { value: '发票', label: '发票' },
    { value: '收据', label: '收据' },
    { value: '银行回单', label: '银行回单' },
    { value: '电子凭证', label: '电子凭证' },
    { value: '其他', label: '其他' }
  ];
  return success(res, { types, voucherTypes }, '费用报销种类配置');
});

module.exports = router;
