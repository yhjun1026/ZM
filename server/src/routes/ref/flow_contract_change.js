/**
 * 合同变更审批流程路由 (flow_contract_change)
 * 绑定表单：contract_change_form
 * 关联主单据：合同编号（仅已生效合同可发起变更）
 *
 * 流转节点（串行6步）：
 * 节点1：经办人发起（自动完成）
 * 节点2：部门负责人业务初审
 * 节点3：法务审核
 * 节点4：财务审核
 * 节点5：原终审领导（根据原合同金额确定）
 *   - ≤50000：部门经理（原终审人）
 *   - 50000<金额<500000：分管领导
 *   - ≥500000：总经理
 * 节点6：档案管理员更新归档版本
 *
 * 业务规则：
 * 1. 仅已生效合同可发起变更，草稿/审批中/已终止不可发起
 * 2. 变更完成后在原合同台账新增变更记录
 * 3. 保留新旧版本对比，原合同数据不可覆盖，形成版本链
 * 4. 合同状态更新：已生效 → 变更中 → 已生效
 * 5. 禁止越级审批，驳回必须填写意见
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

// 文件上传配置（变更附件）
const changeDir = path.join(__dirname, '..', '..', '..', 'uploads', 'change-attachments');
if (!fs.existsSync(changeDir)) fs.mkdirSync(changeDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, changeDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ===== 辅助函数 =====

/**
 * 根据原合同金额确定原终审领导角色
 */
function getOriginalFinalApproverRole(amount) {
  const amt = Number(amount) || 0;
  if (amt <= 50000) return 'dept_head';
  if (amt < 500000) return 'deputy_leader';
  return 'gm';
}

/**
 * 根据角色获取显示名称
 */
function getApproverDisplayName(role) {
  switch (role) {
    case 'dept_head': return '部门经理';
    case 'deputy_leader': return '分管领导';
    case 'gm': return '总经理';
    default: return '原终审领导';
  }
}

/**
 * 构建合同变更审批流程的初始JSON
 * @param {Object} contract - 原合同 t_contract_main 记录
 * @param {Object} changeForm - 变更表单数据
 * @param {Object} user - 当前登录用户
 * @returns {Object} 完整流程JSON
 */
function buildChangeFlow(contract, changeForm, user) {
  const originalAmount = Number(contract.amount) || 0;
  const finalApproverRole = getOriginalFinalApproverRole(originalAmount);

  return {
    flow_id: 'flow_contract_change',
    contract_id: contract.id,
    contract_no: contract.contract_no || '',
    contract_name: contract.contract_name || '',
    change_form_id: changeForm.id,
    version_num: changeForm.version_num,
    original_amount: originalAmount,
    original_final_approver: finalApproverRole,
    original_final_approver_name: getApproverDisplayName(finalApproverRole),
    initiator: user.name,
    initiator_id: user.id,
    initiator_dept: user.dept,
    status: '进行中',
    current_node: '部门负责人业务初审',
    started_at: now(),
    steps: [
      // 节点1：经办人发起（自动完成）
      {
        id: 'cs1',
        name: '经办人发起',
        type: 'serial',
        status: 'done',
        approver_role: 'initiator',
        approver_id: user.id,
        approver: user.name,
        time: now(),
        comment: '发起合同变更审批，版本号: V' + changeForm.version_num
      },
      // 节点2：部门负责人业务初审
      {
        id: 'cs2',
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
        id: 'cs3',
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
        id: 'cs4',
        name: '财务审核',
        type: 'serial',
        status: 'pending',
        approver_role: 'finance',
        approver: '',
        approver_id: '',
        time: '',
        comment: ''
      },
      // 节点5：原终审领导（如果是总经理，需先经过副总审批）
      ...(finalApproverRole === 'gm' ? [
        {
          id: 'cs5a', name: '副总审批', type: 'serial', status: 'pending',
          approver_role: 'deputy_leader', approver: '', approver_id: '', time: '', comment: ''
        }
      ] : []),
      {
        id: 'cs5', name: '原终审领导审批（' + getApproverDisplayName(finalApproverRole) + '）',
        type: 'serial', status: 'pending',
        approver_role: finalApproverRole,
        approver: '', approver_id: '', time: '', comment: ''
      },
      // 节点6：档案管理员更新归档版本
      {
        id: 'cs6',
        name: '档案管理员更新归档版本',
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
 * 自动抄送（变更完成后）
 */
function autoCCChange(flowInstance, changeForm) {
  const ccTargets = [
    { target: '经办人', name: flowInstance.initiator || changeForm.applicant || '' },
    { target: '财务部', name: '财务部全体' },
    { target: '合同管理员', name: '行政部合同管理员' }
  ];
  for (const cc of ccTargets) {
    db.prepare('INSERT INTO t_flow_cc_records (flow_instance_id, contract_id, contract_no, cc_target, cc_target_name, cc_reason) VALUES (?,?,?,?,?,?)')
      .run(flowInstance.id, flowInstance.contract_id, flowInstance.contract_no || '', cc.target, cc.name, '合同变更审批完成自动抄送');
  }
}

/**
 * 保存版本链快照（核心：原合同数据不可覆盖）
 * - before_snapshot: 变更前的原合同完整快照
 * - after_snapshot: 变更后的新合同完整快照
 * - changed_fields: 发生变更的字段列表
 */
function saveVersionChain(contractId, changeFormId, changeForm, user) {
  // 获取当前合同数据作为"变更前"快照
  const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(contractId);
  if (!contract) return;

  const beforeSnapshot = JSON.parse(JSON.stringify(contract));

  // 构建变更后的快照（将变更内容应用到合同数据上，但不实际更新原表）
  const afterSnapshot = JSON.parse(JSON.stringify(contract));
  const changedTerms = safeParse(changeForm.changed_terms, {});
  const changedFields = [];

  // 将变更条款应用到快照中
  for (const [key, value] of Object.entries(changedTerms)) {
    if (key in afterSnapshot) {
      if (JSON.stringify(afterSnapshot[key]) !== JSON.stringify(value)) {
        changedFields.push({
          field: key,
          before: afterSnapshot[key],
          after: value
        });
        afterSnapshot[key] = value;
      }
    }
  }

  // 如果变更内容包含在change_content中描述，也记录
  if (changeForm.change_content) {
    changedFields.push({
      field: 'change_content',
      before: '',
      after: changeForm.change_content
    });
  }

  const versionId = genId('VER');
  db.prepare('INSERT INTO t_contract_change_versions (id, contract_id, contract_no, change_form_id, version_num, version_type, before_snapshot, after_snapshot, change_summary, changed_fields, operator, operator_id, operator_dept, flow_instance_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(versionId, contractId, contract.contract_no || '', changeFormId, changeForm.version_num, 'change',
      JSON.stringify(beforeSnapshot), JSON.stringify(afterSnapshot),
      changeForm.change_content || '合同变更版本V' + changeForm.version_num,
      JSON.stringify(changedFields),
      user.name, user.id, user.dept, changeForm.flow_instance_id);

  return { versionId, beforeSnapshot, afterSnapshot, changedFields };
}

// ===== 路由 =====

/**
 * POST /start/:contractId — 发起合同变更审批流程
 * 业务规则：仅已生效合同可发起变更
 */
router.post('/start/:contractId', upload.single('attachment'), (req, res) => {
  const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.contractId);
  if (!contract) return error(res, 404, '合同不存在');

  // 业务规则1: 仅已生效合同可发起变更
  if (contract.contract_status !== '已生效') {
    return error(res, 400, '仅已生效合同可发起变更，当前状态: ' + contract.contract_status);
  }

  // 检查是否已有进行中的变更流程
  const existing = db.prepare("SELECT * FROM t_contract_change_form WHERE contract_id = ? AND change_status IN ('审批中') ORDER BY created_at DESC LIMIT 1").get(req.params.contractId);
  if (existing) return error(res, 400, '该合同已有进行中的变更审批流程');

  // Rule 3: 跨流程检查 - 检查是否有任何进行中的审批流程（新签/终止/作废等）
  const { hasActive, activeFlow } = hasActiveFlow(req.params.contractId);
  if (hasActive) {
    return error(res, 400, `该合同已有进行中的审批流程（${activeFlow.flow_id}），不可同时启动变更流程（Rule 3）`);
  }

  // 必填校验
  const { change_content, change_reason, effective_date } = req.body;
  if (!change_content || change_content.trim() === '') return error(res, 400, '变更内容为必填项');
  if (!change_reason || change_reason.trim() === '') return error(res, 400, '变更原因为必填项');

  // 解析变更后的条款
  let changedTerms = {};
  try {
    changedTerms = typeof req.body.changed_terms === 'string' ? JSON.parse(req.body.changed_terms) : (req.body.changed_terms || {});
  } catch (e) {
    changedTerms = {};
  }

  // 确定版本号（查询当前最大版本号+1）
  const verRow = db.prepare('SELECT COALESCE(MAX(version_num), 0) as max_ver FROM t_contract_change_versions WHERE contract_id = ?').get(req.params.contractId);
  const versionNum = (verRow.max_ver || 0) + 1;

  // 原终审领导
  const originalAmount = Number(contract.amount) || 0;
  const finalApproverRole = getOriginalFinalApproverRole(originalAmount);

  // 变更附件路径
  let attachmentPath = '';
  if (req.file) {
    attachmentPath = '/uploads/change-attachments/' + req.file.filename;
  }

  // 创建变更表单记录
  const changeFormId = genId('CCF');
  db.prepare(`INSERT INTO t_contract_change_form (id, contract_id, contract_no, contract_name, change_content, change_reason, changed_terms, change_attachment, effective_date, version_num, change_status, current_node, original_amount, original_final_approver, applicant, applicant_id, applicant_dept) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(changeFormId, req.params.contractId, contract.contract_no || '', contract.contract_name || '',
      change_content, change_reason, JSON.stringify(changedTerms), attachmentPath, effective_date || '',
      versionNum, '审批中', '部门负责人业务初审', originalAmount, finalApproverRole,
      req.user.name, req.user.id, req.user.dept);

  // 构建流程
  const changeForm = db.prepare('SELECT * FROM t_contract_change_form WHERE id = ?').get(changeFormId);
  const flow = buildChangeFlow(contract, changeForm, req.user);
  const flowInstanceId = genId('FCI');

  // 保存流程实例
  db.prepare('INSERT INTO t_flow_instances (id, flow_id, contract_id, contract_no, flow_data, status, current_node, started_by, started_by_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(flowInstanceId, 'flow_contract_change', req.params.contractId, contract.contract_no || '',
      JSON.stringify(flow), '进行中', flow.current_node, req.user.name, req.user.id);

  // 更新变更表单的flow_instance_id
  db.prepare('UPDATE t_contract_change_form SET flow_instance_id = ? WHERE id = ?')
    .run(flowInstanceId, changeFormId);

  // 更新合同状态为"变更中"
  db.prepare("UPDATE t_contract_main SET contract_status='变更中', current_approval_node=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(flow.current_node, req.user.name, req.user.id, req.params.contractId);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(req.params.contractId, '发起合同变更', req.user.name, req.user.id, req.user.dept,
      '发起变更审批流程 flow_contract_change，版本号: V' + versionNum + '，变更内容: ' + change_content.substring(0, 100));

  success(res, { change_form_id: changeFormId, flow_instance_id: flowInstanceId, version_num: versionNum, flow }, '合同变更审批流程已启动，版本号: V' + versionNum);
});

/**
 * GET /detail/:changeId — 获取变更审批流程详情
 */
router.get('/detail/:changeId', (req, res) => {
  const changeForm = db.prepare('SELECT * FROM t_contract_change_form WHERE id = ?').get(req.params.changeId);
  if (!changeForm) return error(res, 404, '变更表单不存在');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(changeForm.flow_instance_id);
  const flow = instance ? safeParse(instance.flow_data, {}) : {};
  const rejectAttachments = instance
    ? db.prepare('SELECT * FROM t_flow_reject_attachments WHERE flow_instance_id = ? ORDER BY uploaded_at DESC').all(instance.id)
    : [];
  const ccRecords = instance
    ? db.prepare('SELECT * FROM t_flow_cc_records WHERE flow_instance_id = ? ORDER BY sent_at DESC').all(instance.id)
    : [];

  success(res, { changeForm, instance, flow, rejectAttachments, ccRecords });
});

/**
 * POST /:changeId/approve — 审批通过当前节点
 * 禁止越级审批，只能审批当前待审批节点
 */
router.post('/:changeId/approve', (req, res) => {
  const changeForm = db.prepare('SELECT * FROM t_contract_change_form WHERE id = ?').get(req.params.changeId);
  if (!changeForm) return error(res, 404, '变更表单不存在');
  if (changeForm.change_status !== '审批中') return error(res, 400, '变更流程不在审批中状态');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(changeForm.flow_instance_id);
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
    .run(changeForm.contract_id, '变更审批通过', req.user.name, req.user.id, req.user.dept,
      '变更V' + changeForm.version_num + ' 节点: ' + current.step.name + ' 意见: ' + comment);

  // 检查流程是否全部完成
  if (isFlowComplete(flow)) {
    flow.status = '已完成';
    flow.current_node = '已完成';
    flow.completed_at = now();

    // 业务规则2: 变更完成后在原合同台账新增变更记录
    // 业务规则3: 保留新旧版本对比，原合同数据不可覆盖，形成版本链
    const versionInfo = saveVersionChain(changeForm.contract_id, changeForm.id, changeForm, req.user);

    // 在原合同台账（contract_changes表）新增变更记录
    const changeRecordId = genId('CHG');
    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(changeForm.contract_id);
    db.prepare('INSERT INTO contract_changes (id, contract_id, contract_name, change_type, reason, before_desc, after_desc, applicant, applicant_id, applicant_dept, status, flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(changeRecordId, changeForm.contract_id, changeForm.contract_name || contract?.contract_name || '',
        '条款变更', changeForm.change_reason, versionInfo.beforeSnapshot.contract_name || '',
        changeForm.change_content, changeForm.applicant, changeForm.applicant_id, changeForm.applicant_dept,
        '已生效', JSON.stringify([{ step: '变更V' + changeForm.version_num, done: true, user: req.user.name, time: now() }]));

    // 业务规则4: 合同状态更新 变更中→已生效
    db.prepare("UPDATE t_contract_main SET contract_status='已生效', current_approval_node='已完成', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(req.user.name, req.user.id, changeForm.contract_id);

    // 更新变更表单状态
    db.prepare("UPDATE t_contract_change_form SET change_status='已生效', current_node='已完成', archived_by=?, archived_by_id=?, archived_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?")
      .run(req.user.name, req.user.id, changeForm.id);

    // 自动抄送
    autoCCChange({ ...flow, id: instance.id }, changeForm);

    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(changeForm.contract_id, '变更审批完成', req.user.name, req.user.id, req.user.dept,
        '合同变更V' + changeForm.version_num + '审批完成，版本链已保存，合同已生效。已自动抄送经办人、财务、合同管理员。版本链ID: ' + (versionInfo?.versionId || ''));
  } else {
    // 更新变更表单当前节点
    db.prepare("UPDATE t_contract_change_form SET current_node=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(flow.current_node, changeForm.id);

    // 更新合同当前审批节点
    db.prepare("UPDATE t_contract_main SET current_approval_node=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(flow.current_node, changeForm.contract_id);
  }

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status=?, current_node=?, completed_at=? WHERE id=?")
    .run(JSON.stringify(flow), flow.status, flow.current_node, flow.completed_at || '', instance.id);

  success(res, { flow, change_status: flow.status === '已完成' ? '已生效' : changeForm.change_status }, flow.status === '已完成' ? '变更审批流程全部完成，合同已生效，版本链已保存' : '已通过当前节点: ' + current.step.name);
});

/**
 * POST /:changeId/reject — 驳回审批
 * 驳回必须填写审核意见
 */
router.post('/:changeId/reject', upload.array('attachments', 5), (req, res) => {
  const changeForm = db.prepare('SELECT * FROM t_contract_change_form WHERE id = ?').get(req.params.changeId);
  if (!changeForm) return error(res, 404, '变更表单不存在');
  if (changeForm.change_status !== '审批中') return error(res, 400, '变更流程不在审批中状态');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(changeForm.flow_instance_id);
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
        .run(instance.id, changeForm.contract_id, current.step.id || '', file.originalname, filePath, file.size, req.user.name, req.user.id);
    }
  }

  // 更新变更表单状态为已驳回
  db.prepare("UPDATE t_contract_change_form SET change_status='已驳回', current_node='已驳回（退回经办人）', updated_at=datetime('now','localtime') WHERE id=?")
    .run(changeForm.id);

  // 合同恢复为已生效状态（变更前状态）
  db.prepare("UPDATE t_contract_main SET contract_status='已生效', current_approval_node='', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(req.user.name, req.user.id, changeForm.contract_id);

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status='已驳回', current_node='已驳回（退回经办人）' WHERE id=?")
    .run(JSON.stringify(flow), instance.id);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(changeForm.contract_id, '变更审批驳回', req.user.name, req.user.id, req.user.dept,
      '变更V' + changeForm.version_num + ' 节点: ' + current.step.name + ' 驳回原因: ' + comment +
      (req.files && req.files.length > 0 ? '（附' + req.files.length + '个附件批注）' : ''));

  success(res, { flow, rejected_node: current.step.name }, '已驳回，变更流程退回经办人');
});

/**
 * GET /progress/:changeId — 获取变更流程进度（用于前端可视化）
 */
router.get('/progress/:changeId', (req, res) => {
  const changeForm = db.prepare('SELECT * FROM t_contract_change_form WHERE id = ?').get(req.params.changeId);
  if (!changeForm) return error(res, 404, '变更表单不存在');

  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(changeForm.flow_instance_id);
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
    version_num: flow.version_num,
    original_final_approver_name: flow.original_final_approver_name,
    original_amount: flow.original_amount,
    progress
  });
});

/**
 * GET /versions/:contractId — 获取合同的版本链列表
 */
router.get('/versions/:contractId', (req, res) => {
  const versions = db.prepare('SELECT id, contract_id, contract_no, change_form_id, version_num, version_type, change_summary, operator, operator_id, operator_dept, flow_instance_id, created_at FROM t_contract_change_versions WHERE contract_id = ? ORDER BY version_num ASC').all(req.params.contractId);
  success(res, { list: versions, total: versions.length });
});

/**
 * GET /version-compare/:versionId — 版本对比详情（新旧版本快照）
 */
router.get('/version-compare/:versionId', (req, res) => {
  const version = db.prepare('SELECT * FROM t_contract_change_versions WHERE id = ?').get(req.params.versionId);
  if (!version) return error(res, 404, '版本记录不存在');

  const beforeSnapshot = safeParse(version.before_snapshot, {});
  const afterSnapshot = safeParse(version.after_snapshot, {});
  const changedFields = safeParse(version.changed_fields, []);

  success(res, {
    version_id: version.id,
    contract_id: version.contract_id,
    contract_no: version.contract_no,
    version_num: version.version_num,
    version_type: version.version_type,
    before_snapshot: beforeSnapshot,
    after_snapshot: afterSnapshot,
    changed_fields: changedFields,
    change_summary: version.change_summary,
    operator: version.operator,
    created_at: version.created_at
  });
});

/**
 * GET /list — 获取变更审批列表
 */
router.get('/list', (req, res) => {
  const { status, contractId, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_contract_change_form WHERE 1=1';
  const params = [];
  if (status && status !== '全部') { sql += ' AND change_status = ?'; params.push(status); }
  if (contractId) { sql += ' AND contract_id = ?'; params.push(contractId); }
  sql += ' ORDER BY created_at DESC';

  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as c')).get(...params).c;
  sql += ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const rows = db.prepare(sql).all(...params);

  success(res, { list: rows, total, page: Number(page), pageSize: Number(pageSize) });
});

/**
 * GET /eligible-contracts — 获取可发起变更的合同列表（仅已生效）
 */
router.get('/eligible-contracts', (req, res) => {
  const rows = db.prepare("SELECT id, contract_no, contract_name, partner_company, amount, contract_status FROM t_contract_main WHERE contract_status = '已生效' ORDER BY updated_at DESC").all();
  success(res, { list: rows, total: rows.length });
});

module.exports = router;
module.exports.buildChangeFlow = buildChangeFlow;
module.exports.canApproveNode = canApproveNode;
module.exports.findCurrentStep = findCurrentStep;
module.exports.isFlowComplete = isFlowComplete;
module.exports.getCurrentNodeName = getCurrentNodeName;
module.exports.saveVersionChain = saveVersionChain;
module.exports.getOriginalFinalApproverRole = getOriginalFinalApproverRole;
