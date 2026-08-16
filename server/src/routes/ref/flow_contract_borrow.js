/**
 * 合同借阅审批流程路由 (flow_contract_borrow)
 * 绑定表单：contract_borrow_form
 * 关联合同（仅已生效/已归档合同可发起借阅）
 *
 * 流转节点：
 * 节点1：申请人提交（自动完成）
 * 节点2：合同管理员审批
 * 节点3（条件）：涉密合同 → 法务二次审批
 *
 * 业务规则：
 * 1. 仅已生效或已归档合同可发起借阅
 * 2. 涉密合同（is_confidential=1）增加法务二次审批节点
 * 3. 审批通过后状态为【已批准】，借阅人可查阅/下载（视allow_download）
 * 4. 借阅到期后标记逾期，自动提醒归还
 * 5. 借阅人归还后状态变为【已归还】
 * 6. 禁止越级审批，驳回必须填写意见
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, safeParse, now } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 辅助函数 =====

/**
 * 计算预计归还日期（借阅日期 + 借阅天数）
 */
function calcExpectedReturn(borrowDate, periodDays) {
  const days = parseInt(periodDays) || 30;
  const d = new Date(borrowDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * 构建合同借阅审批流程JSON
 * @param {Object} contract - 合同记录
 * @param {Object} borrowForm - 借阅表单数据
 * @param {Object} user - 当前登录用户
 * @returns {Object} 完整流程JSON
 */
function buildBorrowFlow(contract, borrowForm, user) {
  const isConfidential = Number(contract.is_confidential) === 1;
  const steps = [
    // 节点1：申请人提交（自动完成）
    {
      id: 'bs1',
      name: '申请人提交',
      type: 'serial',
      status: 'done',
      approver_role: 'initiator',
      approver_id: user.id,
      approver: user.name,
      time: now(),
      comment: '发起合同借阅申请'
    },
    // 节点2：合同管理员审批
    {
      id: 'bs2',
      name: '合同管理员审批',
      type: 'serial',
      status: 'pending',
      approver_role: 'contract_admin',
      approver: '',
      approver_id: '',
      time: '',
      comment: ''
    }
  ];

  // 节点3（条件）：涉密合同增加法务二次审批
  if (isConfidential) {
    steps.push({
      id: 'bs3',
      name: '法务二次审批（涉密合同）',
      type: 'serial',
      status: 'pending',
      approver_role: 'legal',
      approver: '',
      approver_id: '',
      time: '',
      comment: ''
    });
  }

  return {
    flow_id: 'flow_contract_borrow',
    contract_id: contract.id,
    contract_no: contract.contract_no || '',
    contract_name: contract.contract_name || '',
    borrow_form_id: borrowForm.id,
    is_confidential: isConfidential,
    initiator: user.name,
    initiator_id: user.id,
    initiator_dept: user.dept,
    status: '进行中',
    current_node: '合同管理员审批',
    started_at: now(),
    steps
  };
}

/**
 * 判断用户是否有权审批某个节点
 */
function canApproveNode(user, node) {
  const role = user.role;
  const dept = user.dept;

  switch (node.approver_role) {
    case 'initiator':
      return user.id === node.approver_id;
    case 'contract_admin':
      // 合同管理员：行政部人员或超管
      return role === '超级管理员' || dept === '行政部';
    case 'legal':
      // 法务：行政部人员或超管
      return role === '超级管理员' || dept === '行政部';
    default:
      return false;
  }
}

/**
 * 查找当前需要审批的步骤（纯串行流程）
 */
function findCurrentStep(flow) {
  for (const step of flow.steps) {
    if (step.status === 'done' || step.status === 'skipped') continue;
    if (step.status === 'pending') {
      return { step, type: 'serial' };
    }
  }
  return null;
}

/**
 * 检查流程是否全部完成
 */
function isFlowComplete(flow) {
  for (const step of flow.steps) {
    if (step.status === 'pending' || step.status === 'rejected') return false;
  }
  return true;
}

/**
 * 获取当前待审批节点的显示名称
 */
function getCurrentNodeName(flow) {
  const current = findCurrentStep(flow);
  if (!current) return '已完成';
  return current.step.name;
}

/**
 * 检查并标记逾期借阅
 */
function checkOverdue() {
  const today = now().split(' ')[0];
  const overdueRows = db.prepare(`
    SELECT * FROM t_contract_borrow_form
    WHERE borrow_status = '已批准'
      AND is_overdue = 0
      AND expected_return < ?
      AND expected_return != ''
  `).all(today);

  for (const row of overdueRows) {
    db.prepare("UPDATE t_contract_borrow_form SET is_overdue = 1, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(row.id);
    // 记录逾期日志
    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(row.contract_id, '借阅逾期', '系统', '', '', '借阅表单 ' + row.id + ' 已逾期，预计归还日期: ' + row.expected_return);
  }

  return overdueRows.length;
}

// ===== 路由 =====

/**
 * POST /start/:contractId — 发起合同借阅审批流程
 * 业务规则1: 仅已生效或已归档合同可发起借阅
 */
router.post('/start/:contractId', (req, res) => {
  const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.contractId);
  if (!contract) return error(res, 404, '合同不存在');

  // 业务规则1: 仅已生效或已归档合同可发起借阅
  if (contract.contract_status !== '已生效' && contract.contract_status !== '已归档') {
    return error(res, 400, '仅已生效或已归档合同可发起借阅，当前状态: ' + contract.contract_status);
  }

  // 检查是否已有进行中的借阅流程
  const existing = db.prepare("SELECT * FROM t_contract_borrow_form WHERE contract_id = ? AND borrow_status IN ('审批中','已批准') ORDER BY created_at DESC LIMIT 1").get(req.params.contractId);
  if (existing) return error(res, 400, '该合同已有进行中或已批准的借阅申请');

  // 必填校验
  const { borrow_purpose, borrow_period, allow_download } = req.body;
  if (!borrow_purpose || borrow_purpose.trim() === '') return error(res, 400, '借阅用途为必填项');
  if (!borrow_period || borrow_period.trim() === '') return error(res, 400, '借阅期限为必填项');

  // 获取合同涉密状态
  const isConfidential = Number(contract.is_confidential) === 1;

  // 计算预计归还日期
  const borrowDate = now().split(' ')[0];
  const expectedReturn = calcExpectedReturn(borrowDate, borrow_period);

  // 创建借阅表单记录
  const borrowFormId = genId('CBF');
  const columns = 'id, contract_id, contract_no, contract_name, borrow_purpose, borrow_period, expected_return, allow_download, is_confidential, borrow_status, current_node, applicant, applicant_id, applicant_dept, borrow_date';
  const placeholders = '?,?,?,?,?,?,?,?,?,?,?,?,?,?,?';
  db.prepare(`INSERT INTO t_contract_borrow_form (${columns}) VALUES (${placeholders})`)
    .run(borrowFormId, req.params.contractId, contract.contract_no || '', contract.contract_name || '',
      borrow_purpose, borrow_period, expectedReturn,
      allow_download === 'true' || allow_download === true ? 1 : 0,
      isConfidential ? 1 : 0,
      '审批中', '合同管理员审批',
      req.user.name, req.user.id, req.user.dept, borrowDate);

  // 构建流程
  const borrowForm = db.prepare('SELECT * FROM t_contract_borrow_form WHERE id = ?').get(borrowFormId);
  const flow = buildBorrowFlow(contract, borrowForm, req.user);
  const flowInstanceId = genId('FBI');

  // 保存流程实例
  db.prepare('INSERT INTO t_flow_instances (id, flow_id, contract_id, contract_no, flow_data, status, current_node, started_by, started_by_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(flowInstanceId, 'flow_contract_borrow', req.params.contractId, contract.contract_no || '',
      JSON.stringify(flow), '进行中', flow.current_node, req.user.name, req.user.id);

  // 更新借阅表单的flow_instance_id
  db.prepare('UPDATE t_contract_borrow_form SET flow_instance_id = ? WHERE id = ?')
    .run(flowInstanceId, borrowFormId);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(req.params.contractId, '申请借阅', req.user.name, req.user.id, req.user.dept,
      '发起借阅审批流程 flow_contract_borrow，借阅用途: ' + borrow_purpose.substring(0, 100) + '，借阅期限: ' + borrow_period + '天' + (isConfidential ? '（涉密合同，需法务二次审批）' : ''));

  success(res, { borrow_form_id: borrowFormId, flow_instance_id: flowInstanceId, flow }, '合同借阅审批流程已启动');
});

/**
 * GET /detail/:borrowId — 获取借阅审批流程详情
 */
router.get('/detail/:borrowId', (req, res) => {
  const borrowForm = db.prepare('SELECT * FROM t_contract_borrow_form WHERE id = ?').get(req.params.borrowId);
  if (!borrowForm) return error(res, 404, '借阅表单不存在');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(borrowForm.flow_instance_id);
  const flow = instance ? safeParse(instance.flow_data, {}) : {};
  const ccRecords = instance
    ? db.prepare('SELECT * FROM t_flow_cc_records WHERE flow_instance_id = ? ORDER BY sent_at DESC').all(instance.id)
    : [];

  success(res, { borrowForm, instance, flow, ccRecords });
});

/**
 * POST /:borrowId/approve — 审批通过当前节点
 * 禁止越级审批，只能审批当前待审批节点
 */
router.post('/:borrowId/approve', (req, res) => {
  const borrowForm = db.prepare('SELECT * FROM t_contract_borrow_form WHERE id = ?').get(req.params.borrowId);
  if (!borrowForm) return error(res, 404, '借阅表单不存在');
  if (borrowForm.borrow_status !== '审批中') return error(res, 400, '借阅流程不在审批中状态');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(borrowForm.flow_instance_id);
  if (!instance) return error(res, 404, '未找到流程实例');
  const flow = safeParse(instance.flow_data, {});
  if (flow.status !== '进行中') return error(res, 400, '流程不在进行中状态');

  const comment = req.body.comment || '审批通过';
  const current = findCurrentStep(flow);
  if (!current) return error(res, 400, '没有待审批的节点');

  // 约束1: 禁止越级审批
  if (!canApproveNode(req.user, current.step)) {
    return error(res, 403, '您无权审批此节点: ' + current.step.name + '（禁止越级审批）');
  }

  // 通过当前节点
  current.step.status = 'done';
  current.step.approver = req.user.name;
  current.step.approver_id = req.user.id;
  current.step.time = now();
  current.step.comment = comment;

  // 更新当前节点名称
  flow.current_node = getCurrentNodeName(flow);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(borrowForm.contract_id, '借阅审批通过', req.user.name, req.user.id, req.user.dept,
      '节点: ' + current.step.name + ' 意见: ' + comment);

  // 检查流程是否全部完成
  if (isFlowComplete(flow)) {
    flow.status = '已完成';
    flow.current_node = '已完成';
    flow.completed_at = now();

    // 业务规则3: 审批通过后状态为已批准
    db.prepare("UPDATE t_contract_borrow_form SET borrow_status='已批准', current_node='已完成', approved_by=?, approved_by_id=?, approved_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?")
      .run(req.user.name, req.user.id, borrowForm.id);

    // 写入借阅台账（复用contract_borrows表）
    const brwId = genId('BRW');
    db.prepare('INSERT INTO contract_borrows (id, contract_id, contract_name, borrower, borrower_id, borrower_dept, borrow_date, expected_return, purpose, status, flow) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(brwId, borrowForm.contract_id, borrowForm.contract_name,
        borrowForm.applicant, borrowForm.applicant_id, borrowForm.applicant_dept,
        borrowForm.borrow_date, borrowForm.expected_return,
        borrowForm.borrow_purpose, '已批准',
        JSON.stringify([{ step: '借阅审批完成', done: true, user: req.user.name, time: now() }]));

    // 自动抄送
    const ccTargets = [
      { target: '借阅人', name: flow.initiator || borrowForm.applicant || '' },
      { target: '合同管理员', name: '行政部合同管理员' },
      { target: '法务', name: '行政部法务' }
    ];
    for (const cc of ccTargets) {
      db.prepare('INSERT INTO t_flow_cc_records (flow_instance_id, contract_id, contract_no, cc_target, cc_target_name, cc_reason) VALUES (?,?,?,?,?,?)')
        .run(instance.id, borrowForm.contract_id, borrowForm.contract_no || '', cc.target, cc.name, '合同借阅审批完成自动抄送');
    }

    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(borrowForm.contract_id, '借阅审批完成', req.user.name, req.user.id, req.user.dept,
        '合同借阅审批完成，借阅人: ' + borrowForm.applicant + '，预计归还: ' + borrowForm.expected_return + '。已自动抄送借阅人、合同管理员、法务。');
  } else {
    // 更新借阅表单当前节点
    db.prepare("UPDATE t_contract_borrow_form SET current_node=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(flow.current_node, borrowForm.id);
  }

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status=?, current_node=?, completed_at=? WHERE id=?")
    .run(JSON.stringify(flow), flow.status, flow.current_node, flow.completed_at || '', instance.id);

  success(res, { flow, borrow_status: flow.status === '已完成' ? '已批准' : borrowForm.borrow_status },
    flow.status === '已完成' ? '借阅审批流程全部完成，借阅已批准' : '已通过当前节点: ' + current.step.name);
});

/**
 * POST /:borrowId/reject — 驳回审批
 * 驳回必须填写审核意见
 */
router.post('/:borrowId/reject', (req, res) => {
  const borrowForm = db.prepare('SELECT * FROM t_contract_borrow_form WHERE id = ?').get(req.params.borrowId);
  if (!borrowForm) return error(res, 404, '借阅表单不存在');
  if (borrowForm.borrow_status !== '审批中') return error(res, 400, '借阅流程不在审批中状态');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(borrowForm.flow_instance_id);
  if (!instance) return error(res, 404, '未找到流程实例');
  const flow = safeParse(instance.flow_data, {});
  if (flow.status !== '进行中') return error(res, 400, '流程不在进行中状态');

  // 驳回必须填写审核意见
  const comment = req.body.comment;
  if (!comment || comment.trim() === '') {
    return error(res, 400, '驳回必须填写审核意见');
  }

  const current = findCurrentStep(flow);
  if (!current) return error(res, 400, '没有待审批的节点');

  if (!canApproveNode(req.user, current.step)) {
    return error(res, 403, '您无权驳回此节点: ' + current.step.name);
  }

  current.step.status = 'rejected';
  current.step.approver = req.user.name;
  current.step.approver_id = req.user.id;
  current.step.time = now();
  current.step.comment = comment;

  // 流程退回申请人
  flow.status = '已驳回';
  flow.current_node = '已驳回（退回申请人）';

  // 更新借阅表单状态为已驳回
  db.prepare("UPDATE t_contract_borrow_form SET borrow_status='已驳回', current_node='已驳回（退回申请人）', updated_at=datetime('now','localtime') WHERE id=?")
    .run(borrowForm.id);

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status='已驳回', current_node='已驳回（退回申请人）' WHERE id=?")
    .run(JSON.stringify(flow), instance.id);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(borrowForm.contract_id, '借阅审批驳回', req.user.name, req.user.id, req.user.dept,
      '节点: ' + current.step.name + ' 驳回原因: ' + comment);

  success(res, { flow, rejected_node: current.step.name }, '已驳回，借阅流程退回申请人');
});

/**
 * POST /:borrowId/return — 归还合同
 * 仅已批准的借阅可归还
 */
router.post('/:borrowId/return', (req, res) => {
  const borrowForm = db.prepare('SELECT * FROM t_contract_borrow_form WHERE id = ?').get(req.params.borrowId);
  if (!borrowForm) return error(res, 404, '借阅表单不存在');
  if (borrowForm.borrow_status !== '已批准') return error(res, 400, '仅已批准的借阅可归还，当前状态: ' + borrowForm.borrow_status);

  const returnRemark = req.body.return_remark || '';

  db.prepare("UPDATE t_contract_borrow_form SET borrow_status='已归还', returned_by=?, returned_by_id=?, returned_at=datetime('now','localtime'), return_remark=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(req.user.name, req.user.id, returnRemark, borrowForm.id);

  // 更新借阅台账
  db.prepare("UPDATE contract_borrows SET status='已归还', actual_return=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE contract_id=? AND borrower_id=? AND status='已批准'")
    .run(borrowForm.contract_id, borrowForm.applicant_id);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(borrowForm.contract_id, '合同归还', req.user.name, req.user.id, req.user.dept,
      '借阅表单 ' + borrowForm.id + ' 已归还' + (returnRemark ? '，归还备注: ' + returnRemark : ''));

  success(res, null, '合同已归还');
});

/**
 * GET /progress/:borrowId — 获取借阅流程进度（用于前端可视化）
 */
router.get('/progress/:borrowId', (req, res) => {
  const borrowForm = db.prepare('SELECT * FROM t_contract_borrow_form WHERE id = ?').get(req.params.borrowId);
  if (!borrowForm) return error(res, 404, '借阅表单不存在');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(borrowForm.flow_instance_id);
  if (!instance) return error(res, 404, '未找到流程实例');
  const flow = safeParse(instance.flow_data, {});

  const progress = flow.steps.map(step => ({
    id: step.id,
    name: step.name,
    type: step.type,
    status: step.status,
    approver: step.approver || '',
    time: step.time || '',
    comment: step.comment || ''
  }));

  success(res, {
    instance_id: instance.id,
    flow_status: flow.status,
    current_node: flow.current_node,
    started_at: flow.started_at,
    completed_at: flow.completed_at,
    is_confidential: flow.is_confidential,
    progress
  });
});

/**
 * GET /list — 获取借阅审批列表
 */
router.get('/list', (req, res) => {
  const { status, contractId, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_contract_borrow_form WHERE 1=1';
  const params = [];
  if (status && status !== '全部') { sql += ' AND borrow_status = ?'; params.push(status); }
  if (contractId) { sql += ' AND contract_id = ?'; params.push(contractId); }
  sql += ' ORDER BY created_at DESC';

  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as c')).get(...params).c;
  sql += ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const rows = db.prepare(sql).all(...params);

  success(res, { list: rows, total, page: Number(page), pageSize: Number(pageSize) });
});

/**
 * GET /eligible-contracts — 获取可发起借阅的合同列表（仅已生效/已归档）
 */
router.get('/eligible-contracts', (req, res) => {
  const rows = db.prepare("SELECT id, contract_no, contract_name, partner_company, amount, contract_type, contract_status, is_confidential FROM t_contract_main WHERE contract_status IN ('已生效','已归档') ORDER BY updated_at DESC").all();
  success(res, { list: rows, total: rows.length });
});

/**
 * GET /overdue — 获取逾期借阅列表（并自动标记逾期）
 */
router.get('/overdue', (req, res) => {
  // 自动检查逾期
  const overdueCount = checkOverdue();

  const rows = db.prepare(`
    SELECT * FROM t_contract_borrow_form
    WHERE borrow_status = '已批准' AND is_overdue = 1
    ORDER BY expected_return ASC
  `).all();

  success(res, { list: rows, total: rows.length, newly_marked: overdueCount });
});

module.exports = router;
module.exports.buildBorrowFlow = buildBorrowFlow;
module.exports.canApproveNode = canApproveNode;
module.exports.findCurrentStep = findCurrentStep;
module.exports.isFlowComplete = isFlowComplete;
module.exports.getCurrentNodeName = getCurrentNodeName;
module.exports.checkOverdue = checkOverdue;
