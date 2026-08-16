/**
 * 合同解除终止审批流程路由 (flow_contract_end)
 * 绑定表单：contract_end_form
 * 关联已生效合同（仅已生效合同可发起终止/解除）
 *
 * 流转节点（串行6步）：
 * 节点1：经办人发起（自动完成）
 * 节点2：部门负责人业务初审
 * 节点3：法务审核
 * 节点4：财务审核
 * 节点5：对应领导（根据原合同金额确定）
 *   - ≤50000：部门经理
 *   - 50000<金额<500000：分管领导
 *   - ≥500000：总经理
 * 节点6：档案管理员更新归档
 *
 * 业务规则：
 * 1. 仅已生效合同可发起终止/解除，草稿/审批中/已终止/已归档/已作废不可发起
 * 2. 审批完成后合同状态修改为【已终止】
 * 3. 自动记录终止原因到终止台账
 * 4. 禁止越级审批，驳回必须填写意见
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, safeParse, now } = require('../../compat/helpers');
const { hasActiveFlow, ensureAuditLog } = require('../../compat/contract_validation');

router.use(authMiddleware);

// 文件上传配置（终止附件）
const endDir = path.join(__dirname, '..', '..', '..', 'uploads', 'end-attachments');
if (!fs.existsSync(endDir)) fs.mkdirSync(endDir, { recursive: true });

// 驳回附件目录（复用）
const rejectDir = path.join(__dirname, '..', '..', '..', 'uploads', 'reject-attachments');
if (!fs.existsSync(rejectDir)) fs.mkdirSync(rejectDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, endDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// 驳回附件上传（单独配置，存到reject-attachments目录）
const rejectStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, rejectDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const rejectUpload = multer({ storage: rejectStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// ===== 辅助函数 =====

/**
 * 根据原合同金额确定对应领导角色
 */
function getCorrespondingLeaderRole(amount) {
  const amt = Number(amount) || 0;
  if (amt <= 50000) return 'dept_head';
  if (amt < 500000) return 'deputy_leader';
  return 'gm';
}

/**
 * 根据角色获取显示名称
 */
function getLeaderDisplayName(role) {
  switch (role) {
    case 'dept_head': return '部门经理';
    case 'deputy_leader': return '分管领导';
    case 'gm': return '总经理';
    default: return '对应领导';
  }
}

/**
 * 构建合同解除终止审批流程的初始JSON
 * @param {Object} contract - 原合同 t_contract_main 记录
 * @param {Object} endForm - 终止表单数据
 * @param {Object} user - 当前登录用户
 * @returns {Object} 完整流程JSON
 */
function buildEndFlow(contract, endForm, user) {
  const originalAmount = Number(contract.amount) || 0;
  const leaderRole = getCorrespondingLeaderRole(originalAmount);

  return {
    flow_id: 'flow_contract_end',
    contract_id: contract.id,
    contract_no: contract.contract_no || '',
    contract_name: contract.contract_name || '',
    end_form_id: endForm.id,
    end_type: endForm.end_type || '终止',
    original_amount: originalAmount,
    corresponding_leader: leaderRole,
    corresponding_leader_name: getLeaderDisplayName(leaderRole),
    initiator: user.name,
    initiator_id: user.id,
    initiator_dept: user.dept,
    status: '进行中',
    current_node: '部门负责人业务初审',
    started_at: now(),
    steps: [
      // 节点1：经办人发起（自动完成）
      {
        id: 'es1',
        name: '经办人发起',
        type: 'serial',
        status: 'done',
        approver_role: 'initiator',
        approver_id: user.id,
        approver: user.name,
        time: now(),
        comment: '发起合同' + (endForm.end_type || '终止') + '审批流程'
      },
      // 节点2：部门负责人业务初审
      {
        id: 'es2',
        name: '部门负责人业务初审',
        type: 'serial',
        status: 'pending',
        approver_role: 'dept_head',
        approver_dept: user.dept,
        approver: '',
        approver_id: '',
        time: '',
        comment: ''
      },
      // 节点3：法务审核
      {
        id: 'es3',
        name: '法务审核',
        type: 'serial',
        status: 'pending',
        approver_role: 'legal',
        approver: '',
        approver_id: '',
        time: '',
        comment: ''
      },
      // 节点4：财务审核
      {
        id: 'es4',
        name: '财务审核',
        type: 'serial',
        status: 'pending',
        approver_role: 'finance',
        approver: '',
        approver_id: '',
        time: '',
        comment: ''
      },
      // 节点5：对应领导审批（如果是总经理，需先经过副总审批）
      ...(leaderRole === 'gm' ? [
        {
          id: 'es5a', name: '副总审批', type: 'serial', status: 'pending',
          approver_role: 'deputy_leader', approver: '', approver_id: '', time: '', comment: ''
        }
      ] : []),
      {
        id: 'es5', name: '对应领导审批（' + getLeaderDisplayName(leaderRole) + '）',
        type: 'serial', status: 'pending',
        approver_role: leaderRole,
        approver: '', approver_id: '', time: '', comment: ''
      },
      // 节点6：档案管理员更新归档
      {
        id: 'es6',
        name: '档案管理员更新归档',
        type: 'serial',
        status: 'pending',
        approver_role: 'archive_admin',
        approver: '',
        approver_id: '',
        time: '',
        comment: ''
      }
    ]
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
    case 'dept_head':
      return role === '超级管理员' || role === '总经理' ||
             (role === '部门经理' && dept === node.approver_dept);
    case 'legal':
      return role === '超级管理员' || dept === '行政部';
    case 'finance':
      return role === '超级管理员' || dept === '财务部';
    case 'deputy_leader':
      return role === '超级管理员' || role === '副总';
    case 'gm':
      return role === '超级管理员' || role === '总经理';
    case 'archive_admin':
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
 * 自动抄送（终止完成后）
 */
function autoCCEnd(flowInstance, endForm) {
  const ccTargets = [
    { target: '经办人', name: flowInstance.initiator || endForm.applicant || '' },
    { target: '财务部', name: '财务部全体' },
    { target: '合同管理员', name: '行政部合同管理员' }
  ];
  for (const cc of ccTargets) {
    db.prepare('INSERT INTO t_flow_cc_records (flow_instance_id, contract_id, contract_no, cc_target, cc_target_name, cc_reason) VALUES (?,?,?,?,?,?)')
      .run(flowInstance.id, flowInstance.contract_id, flowInstance.contract_no || '', cc.target, cc.name, '合同解除终止审批完成自动抄送');
  }
}

// ===== 路由 =====

/**
 * POST /start/:contractId — 发起合同解除终止审批流程
 * 业务规则1: 仅已生效合同可发起终止/解除
 */
router.post('/start/:contractId', upload.single('attachment'), (req, res) => {
  const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.contractId);
  if (!contract) return error(res, 404, '合同不存在');

  // 业务规则1: 仅已生效合同可发起终止/解除
  if (contract.contract_status !== '已生效') {
    return error(res, 400, '仅已生效合同可发起终止/解除，当前状态: ' + contract.contract_status);
  }

  // 检查是否已有进行中的终止流程
  const existing = db.prepare("SELECT * FROM t_contract_end_form WHERE contract_id = ? AND end_status IN ('审批中') ORDER BY created_at DESC LIMIT 1").get(req.params.contractId);
  if (existing) return error(res, 400, '该合同已有进行中的终止/解除审批流程');

  // Rule 3: 跨流程检查 - 检查是否有任何进行中的审批流程（新签/变更/作废等）
  const { hasActive, activeFlow } = hasActiveFlow(req.params.contractId);
  if (hasActive) {
    return error(res, 400, `该合同已有进行中的审批流程（${activeFlow.flow_id}），不可同时启动终止流程（Rule 3）`);
  }

  // 必填校验
  const { end_type, end_reason, end_date } = req.body;
  if (!end_type || end_type.trim() === '') return error(res, 400, '终止类型为必填项（解除/终止）');
  if (!end_reason || end_reason.trim() === '') return error(res, 400, '终止原因为必填项');

  // 对应领导
  const originalAmount = Number(contract.amount) || 0;
  const leaderRole = getCorrespondingLeaderRole(originalAmount);

  // 终止附件路径
  let attachmentPath = '';
  if (req.file) {
    attachmentPath = '/uploads/end-attachments/' + req.file.filename;
  }

  // 创建终止表单记录
  const endFormId = genId('CEF');
  db.prepare(`INSERT INTO t_contract_end_form (id, contract_id, contract_no, contract_name, end_type, end_reason, end_description, end_date, settle_amount, settle_desc, attachment_path, end_status, current_node, original_amount, original_final_approver, applicant, applicant_id, applicant_dept) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(endFormId, req.params.contractId, contract.contract_no || '', contract.contract_name || '',
      end_type, end_reason, req.body.end_description || '', end_date || '',
      Number(req.body.settle_amount) || 0, req.body.settle_desc || '',
      attachmentPath, '审批中', '部门负责人业务初审', originalAmount, leaderRole,
      req.user.name, req.user.id, req.user.dept);

  // 构建流程
  const endForm = db.prepare('SELECT * FROM t_contract_end_form WHERE id = ?').get(endFormId);
  const flow = buildEndFlow(contract, endForm, req.user);
  const flowInstanceId = genId('FEI');

  // 保存流程实例
  db.prepare('INSERT INTO t_flow_instances (id, flow_id, contract_id, contract_no, flow_data, status, current_node, started_by, started_by_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(flowInstanceId, 'flow_contract_end', req.params.contractId, contract.contract_no || '',
      JSON.stringify(flow), '进行中', flow.current_node, req.user.name, req.user.id);

  // 更新终止表单的flow_instance_id
  db.prepare('UPDATE t_contract_end_form SET flow_instance_id = ? WHERE id = ?')
    .run(flowInstanceId, endFormId);

  // 更新合同状态为"终止中"
  db.prepare("UPDATE t_contract_main SET contract_status='终止中', current_approval_node=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(flow.current_node, req.user.name, req.user.id, req.params.contractId);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(req.params.contractId, '发起合同' + end_type, req.user.name, req.user.id, req.user.dept,
      '发起' + end_type + '审批流程 flow_contract_end，终止原因: ' + end_reason.substring(0, 100));

  success(res, { end_form_id: endFormId, flow_instance_id: flowInstanceId, flow }, '合同' + end_type + '审批流程已启动');
});

/**
 * GET /detail/:endId — 获取终止审批流程详情
 */
router.get('/detail/:endId', (req, res) => {
  const endForm = db.prepare('SELECT * FROM t_contract_end_form WHERE id = ?').get(req.params.endId);
  if (!endForm) return error(res, 404, '终止表单不存在');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(endForm.flow_instance_id);
  const flow = instance ? safeParse(instance.flow_data, {}) : {};
  const rejectAttachments = instance
    ? db.prepare('SELECT * FROM t_flow_reject_attachments WHERE flow_instance_id = ? ORDER BY uploaded_at DESC').all(instance.id)
    : [];
  const ccRecords = instance
    ? db.prepare('SELECT * FROM t_flow_cc_records WHERE flow_instance_id = ? ORDER BY sent_at DESC').all(instance.id)
    : [];

  success(res, { endForm, instance, flow, rejectAttachments, ccRecords });
});

/**
 * POST /:endId/approve — 审批通过当前节点
 * 禁止越级审批，只能审批当前待审批节点
 */
router.post('/:endId/approve', (req, res) => {
  const endForm = db.prepare('SELECT * FROM t_contract_end_form WHERE id = ?').get(req.params.endId);
  if (!endForm) return error(res, 404, '终止表单不存在');
  if (endForm.end_status !== '审批中') return error(res, 400, '终止流程不在审批中状态');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(endForm.flow_instance_id);
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
    .run(endForm.contract_id, endForm.end_type + '审批通过', req.user.name, req.user.id, req.user.dept,
      '节点: ' + current.step.name + ' 意见: ' + comment);

  // 检查流程是否全部完成
  if (isFlowComplete(flow)) {
    flow.status = '已完成';
    flow.current_node = '已完成';
    flow.completed_at = now();

    // 业务规则2: 审批完成后合同状态修改为【已终止】
    db.prepare("UPDATE t_contract_main SET contract_status='已终止', current_approval_node='已完成', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(req.user.name, req.user.id, endForm.contract_id);

    // 业务规则3: 自动记录终止原因到终止台账
    const termId = genId('TERM');
    db.prepare('INSERT INTO contract_terminations (id, contract_id, contract_name, term_type, reason, settle_amount, settle_desc, effective_date, applicant, applicant_id, applicant_dept, status, flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(termId, endForm.contract_id, endForm.contract_name, endForm.end_type,
        endForm.end_reason, endForm.settle_amount || 0, endForm.settle_desc || '',
        endForm.end_date || '', endForm.applicant, endForm.applicant_id, endForm.applicant_dept,
        '已生效', JSON.stringify([{ step: '终止审批完成', done: true, user: req.user.name, time: now() }]));

    // 更新终止表单状态
    db.prepare("UPDATE t_contract_end_form SET end_status='已生效', current_node='已完成', archived_by=?, archived_by_id=?, archived_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?")
      .run(req.user.name, req.user.id, endForm.id);

    // 自动抄送
    autoCCEnd({ ...flow, id: instance.id }, endForm);

    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(endForm.contract_id, endForm.end_type + '审批完成', req.user.name, req.user.id, req.user.dept,
        '合同' + endForm.end_type + '审批完成，合同已终止。终止台账ID: ' + termId + '。已自动抄送经办人、财务、合同管理员。');
  } else {
    // 更新终止表单当前节点
    db.prepare("UPDATE t_contract_end_form SET current_node=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(flow.current_node, endForm.id);

    // 更新合同当前审批节点
    db.prepare("UPDATE t_contract_main SET current_approval_node=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(flow.current_node, endForm.contract_id);
  }

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status=?, current_node=?, completed_at=? WHERE id=?")
    .run(JSON.stringify(flow), flow.status, flow.current_node, flow.completed_at || '', instance.id);

  success(res, { flow, end_status: flow.status === '已完成' ? '已生效' : endForm.end_status }, flow.status === '已完成' ? endForm.end_type + '审批流程全部完成，合同已终止，终止台账已建立' : '已通过当前节点: ' + current.step.name);
});

/**
 * POST /:endId/reject — 驳回审批
 * 驳回必须填写审核意见
 */
router.post('/:endId/reject', rejectUpload.array('attachments', 5), (req, res) => {
  const endForm = db.prepare('SELECT * FROM t_contract_end_form WHERE id = ?').get(req.params.endId);
  if (!endForm) return error(res, 404, '终止表单不存在');
  if (endForm.end_status !== '审批中') return error(res, 400, '终止流程不在审批中状态');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(endForm.flow_instance_id);
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

  // 流程退回经办人
  flow.status = '已驳回';
  flow.current_node = '已驳回（退回经办人）';

  // 保存驳回附件
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const filePath = '/uploads/reject-attachments/' + file.filename;
      db.prepare('INSERT INTO t_flow_reject_attachments (flow_instance_id, contract_id, node_id, file_name, file_path, file_size, uploader, uploader_id) VALUES (?,?,?,?,?,?,?,?)')
        .run(instance.id, endForm.contract_id, current.step.id || '', file.originalname, filePath, file.size, req.user.name, req.user.id);
    }
  }

  // 更新终止表单状态为已驳回
  db.prepare("UPDATE t_contract_end_form SET end_status='已驳回', current_node='已驳回（退回经办人）', updated_at=datetime('now','localtime') WHERE id=?")
    .run(endForm.id);

  // 合同恢复为已生效状态（终止前状态）
  db.prepare("UPDATE t_contract_main SET contract_status='已生效', current_approval_node='', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(req.user.name, req.user.id, endForm.contract_id);

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status='已驳回', current_node='已驳回（退回经办人）' WHERE id=?")
    .run(JSON.stringify(flow), instance.id);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(endForm.contract_id, endForm.end_type + '审批驳回', req.user.name, req.user.id, req.user.dept,
      '节点: ' + current.step.name + ' 驳回原因: ' + comment +
      (req.files && req.files.length > 0 ? '（附' + req.files.length + '个附件批注）' : ''));

  success(res, { flow, rejected_node: current.step.name }, '已驳回，' + endForm.end_type + '流程退回经办人');
});

/**
 * GET /progress/:endId — 获取终止流程进度（用于前端可视化）
 */
router.get('/progress/:endId', (req, res) => {
  const endForm = db.prepare('SELECT * FROM t_contract_end_form WHERE id = ?').get(req.params.endId);
  if (!endForm) return error(res, 404, '终止表单不存在');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(endForm.flow_instance_id);
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
    end_type: flow.end_type,
    corresponding_leader_name: flow.corresponding_leader_name,
    original_amount: flow.original_amount,
    progress
  });
});

/**
 * GET /list — 获取终止审批列表
 */
router.get('/list', (req, res) => {
  const { status, contractId, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_contract_end_form WHERE 1=1';
  const params = [];
  if (status && status !== '全部') { sql += ' AND end_status = ?'; params.push(status); }
  if (contractId) { sql += ' AND contract_id = ?'; params.push(contractId); }
  sql += ' ORDER BY created_at DESC';

  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as c')).get(...params).c;
  sql += ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const rows = db.prepare(sql).all(...params);

  success(res, { list: rows, total, page: Number(page), pageSize: Number(pageSize) });
});

/**
 * GET /eligible-contracts — 获取可发起终止/解除的合同列表（仅已生效）
 */
router.get('/eligible-contracts', (req, res) => {
  const rows = db.prepare("SELECT id, contract_no, contract_name, partner_company, amount, contract_type, contract_status FROM t_contract_main WHERE contract_status = '已生效' ORDER BY updated_at DESC").all();
  success(res, { list: rows, total: rows.length });
});

module.exports = router;
module.exports.buildEndFlow = buildEndFlow;
module.exports.canApproveNode = canApproveNode;
module.exports.findCurrentStep = findCurrentStep;
module.exports.isFlowComplete = isFlowComplete;
module.exports.getCurrentNodeName = getCurrentNodeName;
module.exports.getCorrespondingLeaderRole = getCorrespondingLeaderRole;
