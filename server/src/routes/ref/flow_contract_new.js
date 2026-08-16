/**
 * 合同新签审批流程路由 (flow_contract_new)
 * 流转模式：串行 + 并行混合
 *
 * 节点1：经办人发起（自动完成）
 * 节点2：部门负责人业务初审
 * 节点3：并行会签（法务审核 + 财务审核，全部通过才继续；任意驳回退回经办人）
 * 节点4：金额条件分支
 *   A: ≤50,000 → 跳过，直接到用印
 *   B: 50,000<金额<500,000 → 分管领导终审
 *   C: ≥500,000 → 分管领导 → 总经理终审
 * 节点5：印章管理员用印核对
 * 节点6：合同档案管理员归档
 *
 * 全局约束：
 * 1. 禁止越级审批，职能审核不能跳过
 * 2. 驳回必须填写审核意见，支持附件批注
 * 3. 全部完成 → 表单状态自动变更为【已生效】
 * 4. 不允许管理员后台强行跳过节点
 * 5. 审批完成自动抄送：经办人、财务、合同管理员
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, safeParse, now } = require('../../compat/helpers');

router.use(authMiddleware);

// 文件上传配置（驳回附件）
const rejectDir = path.join(__dirname, '..', '..', '..', 'uploads', 'reject-attachments');
if (!fs.existsSync(rejectDir)) fs.mkdirSync(rejectDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, rejectDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ===== 流程构建函数 =====

/**
 * 构建合同新签审批流程的初始JSON
 * @param {Object} contract - t_contract_main 记录
 * @param {Object} user - 当前登录用户
 * @returns {Object} 完整流程JSON
 */
function buildFlow(contract, user) {
  const amount = Number(contract.amount) || 0;
  return {
    flow_id: 'flow_contract_new',
    contract_id: contract.id,
    contract_no: contract.contract_no || '',
    contract_name: contract.contract_name || '',
    amount: amount,
    initiator: user.name,
    initiator_id: user.id,
    initiator_dept: user.dept,
    status: '进行中',
    current_node: '部门负责人业务初审',
    started_at: now(),
    steps: [
      // 节点1：经办人发起（自动完成）
      {
        id: 's1',
        name: '经办人发起',
        type: 'serial',
        status: 'done',
        approver_role: 'initiator',
        approver_id: user.id,
        approver: user.name,
        time: now(),
        comment: '发起合同新签审批'
      },
      // 节点2：部门负责人业务初审
      {
        id: 's2',
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
      // 节点3：并行会签（法务 + 财务）
      {
        id: 's3',
        name: '并行会签',
        type: 'parallel',
        status: 'pending',
        children: [
          {
            id: 's3a',
            name: '法务审核',
            status: 'pending',
            approver_role: 'legal',
            approver: '',
            approver_id: '',
            time: '',
            comment: ''
          },
          {
            id: 's3b',
            name: '财务审核',
            status: 'pending',
            approver_role: 'finance',
            approver: '',
            approver_id: '',
            time: '',
            comment: ''
          }
        ]
      },
      // 节点4：金额条件分支
      {
        id: 's4',
        name: '金额条件分支',
        type: 'conditional',
        status: 'pending',
        condition_field: 'amount',
        amount: amount,
        active_branch: null,
        active_nodes: [],
        branches: [
          {
            condition: '<=50000',
            label: '≤5万元（直接用印）',
            nodes: []
          },
          {
            condition: '>50000<500000',
            label: '5万-50万元（分管领导终审）',
            nodes: [
              {
                id: 's4b',
                name: '分管领导终审',
                approver_role: 'deputy_leader',
                status: 'pending',
                approver: '',
                approver_id: '',
                time: '',
                comment: ''
              }
            ]
          },
          {
            condition: '>=500000',
            label: '≥50万元（分管领导+总经理终审）',
            nodes: [
              {
                id: 's4c1',
                name: '分管领导审批',
                approver_role: 'deputy_leader',
                status: 'pending',
                approver: '',
                approver_id: '',
                time: '',
                comment: ''
              },
              {
                id: 's4c2',
                name: '总经理终审',
                approver_role: 'gm',
                status: 'pending',
                approver: '',
                approver_id: '',
                time: '',
                comment: ''
              }
            ]
          }
        ]
      },
      // 节点5：用印核对
      {
        id: 's5',
        name: '用印核对',
        type: 'serial',
        status: 'pending',
        approver_role: 'seal_admin',
        approver: '',
        approver_id: '',
        time: '',
        comment: ''
      },
      // 节点6：归档
      {
        id: 's6',
        name: '归档',
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

  // 约束4: 不允许管理员强行跳过节点
  // 超管可以审批任何当前待审批节点，但不能跳过
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
    case 'seal_admin':
      return role === '超级管理员' || dept === '行政部';
    case 'archive_admin':
      return role === '超级管理员' || dept === '行政部';
    default:
      return false;
  }
}

/**
 * 查找当前需要审批的步骤
 * 返回 { step, childNode, parallelChild } 信息
 */
function findCurrentStep(flow) {
  for (const step of flow.steps) {
    if (step.status === 'done' || step.status === 'skipped') continue;
    if (step.status === 'pending') {
      if (step.type === 'serial') {
        return { step, type: 'serial' };
      }
      if (step.type === 'parallel') {
        // 找到第一个未完成的子节点
        for (const child of step.children) {
          if (child.status === 'pending') {
            return { step, type: 'parallel', child };
          }
        }
        // 所有子节点都完成了但父节点状态还是pending？
        // 不应该发生，但做个安全检查
        return null;
      }
      if (step.type === 'conditional') {
        // 如果还没选择分支，先选择
        if (step.active_branch === null) {
          return { step, type: 'conditional_init' };
        }
        // 检查活跃分支中的节点
        const branch = step.branches[step.active_branch];
        if (branch && branch.nodes.length > 0) {
          for (const node of branch.nodes) {
            if (node.status === 'pending') {
              return { step, type: 'conditional_node', node, branch };
            }
          }
        }
        // 分支中所有节点完成，但条件节点状态还是pending
        // 标记条件节点完成
        return { step, type: 'conditional_complete' };
      }
    }
  }
  return null;
}

/**
 * 评估金额条件分支，选择活跃分支
 */
function evaluateConditional(step) {
  const amount = step.amount || 0;
  let branchIdx = 0;
  if (amount <= 50000) {
    branchIdx = 0;
  } else if (amount > 50000 && amount < 500000) {
    branchIdx = 1;
  } else {
    branchIdx = 2;
  }
  step.active_branch = branchIdx;
  const branch = step.branches[branchIdx];
  step.active_nodes = branch.nodes.map(n => n.id);
  return branch;
}

/**
 * 检查流程是否全部完成
 */
function isFlowComplete(flow) {
  for (const step of flow.steps) {
    if (step.status === 'pending') return false;
    // parallel: check children
    if (step.type === 'parallel' && step.status !== 'done') return false;
    // conditional: check active branch nodes
    if (step.type === 'conditional' && step.status !== 'done') {
      if (step.active_branch !== null) {
        const branch = step.branches[step.active_branch];
        for (const node of branch.nodes) {
          if (node.status === 'pending') return false;
        }
      } else {
        return false;
      }
    }
  }
  return true;
}

/**
 * 获取当前待审批节点的显示名称
 */
function getCurrentNodeName(flow) {
  const current = findCurrentStep(flow);
  if (!current) return '已完成';
  if (current.type === 'serial') return current.step.name;
  if (current.type === 'parallel') return current.child.name;
  if (current.type === 'conditional_init') return current.step.name + '（待评估）';
  if (current.type === 'conditional_node') return current.node.name;
  if (current.type === 'conditional_complete') return '条件分支评估完成';
  return '';
}

/**
 * 自动抄送
 */
function autoCC(flowInstance, contract) {
  const ccTargets = [
    { target: '经办人', name: flowInstance.initiator || contract.created_by || '' },
    { target: '财务部', name: '财务部全体' },
    { target: '合同管理员', name: '行政部合同管理员' }
  ];
  for (const cc of ccTargets) {
    db.prepare('INSERT INTO t_flow_cc_records (flow_instance_id, contract_id, contract_no, cc_target, cc_target_name, cc_reason) VALUES (?,?,?,?,?,?)')
      .run(flowInstance.id, flowInstance.contract_id, flowInstance.contract_no || '', cc.target, cc.name, '合同审批完成自动抄送');
  }
}

// ===== 路由 =====

/**
 * POST /start/:contractId — 启动合同新签审批流程
 * 从 t_contract_main 草稿提交审批时调用
 */
router.post('/start/:contractId', (req, res) => {
  const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.contractId);
  if (!contract) return error(res, 404, '合同不存在');
  if (contract.contract_status !== '草稿') return error(res, 400, '仅草稿状态可发起审批流程');

  // 必填校验
  if (!contract.contract_name) return error(res, 400, '合同名称为必填项');
  if (!contract.partner_company) return error(res, 400, '合作方单位为必填项');
  if (!contract.amount) return error(res, 400, '合同金额为必填项');

  // 检查是否已有进行中的流程
  const existing = db.prepare("SELECT * FROM t_flow_instances WHERE contract_id = ? AND status = '进行中'").get(req.params.contractId);
  if (existing) return error(res, 400, '该合同已有进行中的审批流程');

  // 生成合同编号
  const d = new Date();
  const ym = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0');
  const prefix = 'HT-' + ym + '-';
  const row = db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_no LIKE ?").get(prefix + '%');
  const seq = String((row.c || 0) + 1).padStart(3, '0');
  const contractNo = prefix + seq;

  // 构建流程
  const flow = buildFlow({ ...contract, contract_no: contractNo }, req.user);
  const flowInstanceId = genId('FIN');

  // 保存流程实例
  db.prepare('INSERT INTO t_flow_instances (id, flow_id, contract_id, contract_no, flow_data, status, current_node, started_by, started_by_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(flowInstanceId, 'flow_contract_new', req.params.contractId, contractNo, JSON.stringify(flow), '进行中', flow.current_node, req.user.name, req.user.id);

  // 更新合同状态
  db.prepare("UPDATE t_contract_main SET contract_no=?, contract_status='审批中', current_approval_node=?, approval_flow_id=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(contractNo, flow.current_node, flowInstanceId, req.user.name, req.user.id, req.params.contractId);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(req.params.contractId, '启动审批流程', req.user.name, req.user.id, req.user.dept, '生成合同编号: ' + contractNo + '，启动合同新签审批流程 flow_contract_new');

  success(res, { flow_instance_id: flowInstanceId, contract_no: contractNo, flow }, '审批流程已启动，合同编号: ' + contractNo);
});

/**
 * GET /detail/:contractId — 获取流程详情
 */
router.get('/detail/:contractId', (req, res) => {
  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE contract_id = ? ORDER BY started_at DESC LIMIT 1').get(req.params.contractId);
  if (!instance) return error(res, 404, '未找到审批流程');
  const flow = safeParse(instance.flow_data, {});
  // 获取驳回附件
  const rejectAttachments = db.prepare('SELECT * FROM t_flow_reject_attachments WHERE flow_instance_id = ? ORDER BY uploaded_at DESC').all(instance.id);
  // 获取抄送记录
  const ccRecords = db.prepare('SELECT * FROM t_flow_cc_records WHERE flow_instance_id = ? ORDER BY sent_at DESC').all(instance.id);
  success(res, { instance, flow, rejectAttachments, ccRecords });
});

/**
 * POST /:contractId/approve — 审批通过当前节点
 * 约束1: 禁止越级审批，只能审批当前待审批节点
 * 约束4: 不允许管理员强行跳过节点
 */
router.post('/:contractId/approve', (req, res) => {
  const instance = db.prepare("SELECT * FROM t_flow_instances WHERE contract_id = ? AND status = '进行中' ORDER BY started_at DESC LIMIT 1").get(req.params.contractId);
  if (!instance) return error(res, 404, '未找到进行中的审批流程');
  const flow = safeParse(instance.flow_data, {});
  if (flow.status !== '进行中') return error(res, 400, '流程不在进行中状态');

  const comment = req.body.comment || '审批通过';
  const current = findCurrentStep(flow);

  if (!current) return error(res, 400, '没有待审批的节点');

  // 处理不同类型节点
  if (current.type === 'serial') {
    // 约束1: 检查审批权限
    if (!canApproveNode(req.user, current.step)) {
      return error(res, 403, '您无权审批此节点: ' + current.step.name + '（禁止越级审批）');
    }
    current.step.status = 'done';
    current.step.approver = req.user.name;
    current.step.approver_id = req.user.id;
    current.step.time = now();
    current.step.comment = comment;

    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(req.params.contractId, '审批通过', req.user.name, req.user.id, req.user.dept, '节点: ' + current.step.name + ' 意见: ' + comment);
  }
  else if (current.type === 'parallel') {
    // 并行会签：审批子节点
    if (!canApproveNode(req.user, current.child)) {
      return error(res, 403, '您无权审批此节点: ' + current.child.name + '（禁止越级审批）');
    }
    current.child.status = 'done';
    current.child.approver = req.user.name;
    current.child.approver_id = req.user.id;
    current.child.time = now();
    current.child.comment = comment;

    // 检查所有子节点是否完成
    const allChildrenDone = current.step.children.every(c => c.status === 'done');
    if (allChildrenDone) {
      current.step.status = 'done';
    }

    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(req.params.contractId, '审批通过', req.user.name, req.user.id, req.user.dept, '并行会签节点: ' + current.child.name + (allChildrenDone ? '（全部完成）' : '') + ' 意见: ' + comment);
  }
  else if (current.type === 'conditional_init') {
    // 评估金额条件分支
    const branch = evaluateConditional(current.step);
    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(req.params.contractId, '条件分支评估', req.user.name, req.user.id, req.user.dept, '合同金额: ' + current.step.amount + '，匹配分支: ' + branch.label);

    // 如果分支没有节点（≤5万），直接标记条件节点完成
    if (branch.nodes.length === 0) {
      current.step.status = 'done';
    }
  }
  else if (current.type === 'conditional_node') {
    // 审批条件分支中的节点
    if (!canApproveNode(req.user, current.node)) {
      return error(res, 403, '您无权审批此节点: ' + current.node.name + '（禁止越级审批）');
    }
    current.node.status = 'done';
    current.node.approver = req.user.name;
    current.node.approver_id = req.user.id;
    current.node.time = now();
    current.node.comment = comment;

    // 检查分支中所有节点是否完成
    const allNodesDone = current.branch.nodes.every(n => n.status === 'done');
    if (allNodesDone) {
      current.step.status = 'done';
    }

    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(req.params.contractId, '审批通过', req.user.name, req.user.id, req.user.dept, '条件分支节点: ' + current.node.name + (allNodesDone ? '（分支全部完成）' : '') + ' 意见: ' + comment);
  }
  else if (current.type === 'conditional_complete') {
    // 条件分支评估完成但状态没更新
    current.step.status = 'done';
  }

  // 更新当前节点名称
  flow.current_node = getCurrentNodeName(flow);

  // 检查流程是否全部完成
  if (isFlowComplete(flow)) {
    flow.status = '已完成';
    flow.current_node = '已完成';
    flow.completed_at = now();

    // 约束3: 流程全部完成，表单状态自动变更为【已生效】
    db.prepare("UPDATE t_contract_main SET contract_status='已生效', current_approval_node='已完成', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(req.user.name, req.user.id, req.params.contractId);

    // 财务联动: 合同生效后自动推送至财务记录表
    try {
      const contract = db.prepare("SELECT id, contract_no, contract_name, contract_type, amount, partner_company, created_dept, handler, handler_id FROM t_contract_main WHERE id=?").get(req.params.contractId);
      if (contract && contract.amount > 0) {
        const financeId = genId('FIN');
        const finType = (contract.contract_type === '采购合同' || contract.contract_type === '采购') ? 'payable' : 'receivable';
        const finDesc = '合同生效自动推送 - ' + (contract.contract_name || contract.contract_no || '') + ' / ' + (contract.partner_company || '');
        db.prepare(`INSERT INTO finance_records (id, type, category, amount, date, dept, desc, status, related_id, submitter, submitter_id, approval_flow, created_at, updated_at)
                    VALUES (?, ?, ?, ?, datetime('now','localtime'), ?, ?, '已生效', ?, ?, ?, '[]', datetime('now','localtime'), datetime('now','localtime'))`)
          .run(financeId, finType, contract.contract_type || '合同', contract.amount,
               contract.created_dept || '', finDesc, contract.id,
               contract.handler || req.user.name, contract.handler_id || req.user.id);
      }
    } catch(finErr) {
      console.error('[flow_contract_new] finance hook error:', finErr);
    }

    // 约束5: 自动抄送
    autoCC({ ...flow, id: instance.id }, { ...flow, created_by: flow.initiator });

    db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
      .run(req.params.contractId, '审批完成', req.user.name, req.user.id, req.user.dept, '合同新签审批流程全部完成，合同已生效。已自动推送财务记录并抄送经办人、财务、合同管理员');
  }

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status=?, current_node=?, completed_at=? WHERE id=?")
    .run(JSON.stringify(flow), flow.status, flow.current_node, flow.completed_at || '', instance.id);

  // 更新合同当前审批节点
  if (flow.status !== '已完成') {
    db.prepare("UPDATE t_contract_main SET current_approval_node=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(flow.current_node, req.params.contractId);
  }

  success(res, { flow }, flow.status === '已完成' ? '审批流程全部完成，合同已生效' : '已通过当前节点: ' + (current.step ? current.step.name : ''));
});

/**
 * POST /:contractId/reject — 驳回审批
 * 约束2: 驳回必须填写审核意见，支持附件批注
 * 并行会签任意一方驳回，流程退回经办人
 */
router.post('/:contractId/reject', upload.array('attachments', 5), (req, res) => {
  const instance = db.prepare("SELECT * FROM t_flow_instances WHERE contract_id = ? AND status = '进行中' ORDER BY started_at DESC LIMIT 1").get(req.params.contractId);
  if (!instance) return error(res, 404, '未找到进行中的审批流程');
  const flow = safeParse(instance.flow_data, {});
  if (flow.status !== '进行中') return error(res, 400, '流程不在进行中状态');

  // 约束2: 驳回必须填写审核意见
  const comment = req.body.comment;
  if (!comment || comment.trim() === '') {
    return error(res, 400, '驳回必须填写审核意见');
  }

  const current = findCurrentStep(flow);
  if (!current) return error(res, 400, '没有待审批的节点');

  // 确定驳回的节点名称
  let rejectedNodeName = '';
  if (current.type === 'serial') {
    rejectedNodeName = current.step.name;
    if (!canApproveNode(req.user, current.step)) {
      return error(res, 403, '您无权驳回此节点: ' + current.step.name);
    }
    current.step.status = 'rejected';
    current.step.approver = req.user.name;
    current.step.approver_id = req.user.id;
    current.step.time = now();
    current.step.comment = comment;
  } else if (current.type === 'parallel') {
    rejectedNodeName = current.child.name;
    if (!canApproveNode(req.user, current.child)) {
      return error(res, 403, '您无权驳回此节点: ' + current.child.name);
    }
    current.child.status = 'rejected';
    current.child.approver = req.user.name;
    current.child.approver_id = req.user.id;
    current.child.time = now();
    current.child.comment = comment;
    // 标记整个并行节点为已驳回
    current.step.status = 'rejected';
  } else if (current.type === 'conditional_node') {
    rejectedNodeName = current.node.name;
    if (!canApproveNode(req.user, current.node)) {
      return error(res, 403, '您无权驳回此节点: ' + current.node.name);
    }
    current.node.status = 'rejected';
    current.node.approver = req.user.name;
    current.node.approver_id = req.user.id;
    current.node.time = now();
    current.node.comment = comment;
    current.step.status = 'rejected';
  } else {
    return error(res, 400, '当前节点不支持驳回');
  }

  // 流程退回经办人：重置所有节点（除经办人发起节点）
  flow.status = '已驳回';
  flow.current_node = '已驳回（退回经办人）';

  // 保存驳回附件批注
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const filePath = '/uploads/reject-attachments/' + file.filename;
      db.prepare('INSERT INTO t_flow_reject_attachments (flow_instance_id, contract_id, node_id, file_name, file_path, file_size, uploader, uploader_id) VALUES (?,?,?,?,?,?,?,?)')
        .run(instance.id, req.params.contractId, current.step.id || '', file.originalname, filePath, file.size, req.user.name, req.user.id);
    }
  }

  // 合同退回草稿状态
  db.prepare("UPDATE t_contract_main SET contract_status='草稿', current_approval_node='已驳回', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(req.user.name, req.user.id, req.params.contractId);

  // 保存流程
  db.prepare("UPDATE t_flow_instances SET flow_data=?, status='已驳回', current_node='已驳回（退回经办人）' WHERE id=?")
    .run(JSON.stringify(flow), instance.id);

  // 记录日志
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(req.params.contractId, '审批驳回', req.user.name, req.user.id, req.user.dept, '节点: ' + rejectedNodeName + ' 驳回原因: ' + comment + (req.files && req.files.length > 0 ? '（附' + req.files.length + '个附件批注）' : ''));

  success(res, { flow, rejected_node: rejectedNodeName }, '已驳回，合同退回经办人草稿状态');
});

/**
 * GET /progress/:contractId — 获取流程进度（用于前端可视化）
 */
router.get('/progress/:contractId', (req, res) => {
  const instance = db.prepare('SELECT * FROM t_flow_instances WHERE contract_id = ? ORDER BY started_at DESC LIMIT 1').get(req.params.contractId);
  if (!instance) return error(res, 404, '未找到审批流程');
  const flow = safeParse(instance.flow_data, {});

  // 构建进度展示数据
  const progress = flow.steps.map(step => {
    let displayStatus = step.status;
    let approver = step.approver || '';
    let time = step.time || '';
    let comment = step.comment || '';

    if (step.type === 'parallel') {
      const childrenInfo = step.children.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        approver: c.approver || '',
        time: c.time || '',
        comment: c.comment || ''
      }));
      const doneCount = step.children.filter(c => c.status === 'done').length;
      const totalCount = step.children.length;
      if (doneCount === totalCount) displayStatus = 'done';
      else if (doneCount > 0) displayStatus = 'partial';
      return { id: step.id, name: step.name, type: step.type, status: displayStatus, children: childrenInfo, doneCount, totalCount };
    }

    if (step.type === 'conditional') {
      let activeBranch = step.active_branch !== null ? step.branches[step.active_branch] : null;
      let nodesInfo = [];
      if (activeBranch) {
        nodesInfo = activeBranch.nodes.map(n => ({
          id: n.id,
          name: n.name,
          status: n.status,
          approver: n.approver || '',
          time: n.time || '',
          comment: n.comment || ''
        }));
      }
      return {
        id: step.id,
        name: step.name,
        type: step.type,
        status: step.status,
        amount: step.amount,
        active_branch_label: activeBranch ? activeBranch.label : '待评估',
        branches: step.branches.map(b => ({ label: b.label, node_count: b.nodes.length })),
        active_nodes: nodesInfo
      };
    }

    return { id: step.id, name: step.name, type: step.type, status: displayStatus, approver, time, comment };
  });

  success(res, { instance_id: instance.id, flow_status: flow.status, current_node: flow.current_node, started_at: flow.started_at, completed_at: flow.completed_at, progress });
});

/**
 * GET /cc-list — 获取抄送列表
 */
router.get('/cc-list', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  const total = db.prepare('SELECT COUNT(*) as c FROM t_flow_cc_records').get().c;
  const rows = db.prepare('SELECT * FROM t_flow_cc_records ORDER BY sent_at DESC LIMIT ? OFFSET ?').all(pageSize, offset);
  success(res, { list: rows, total, page: Number(page), pageSize: Number(pageSize) });
});

/**
 * GET /list — 获取所有流程实例列表
 */
router.get('/list', (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT id, flow_id, contract_id, contract_no, status, current_node, started_by, started_by_id, started_at, completed_at FROM t_flow_instances WHERE 1=1';
  const params = [];
  if (status && status !== '全部') { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY started_at DESC';
  const total = db.prepare(sql.replace('SELECT id, flow_id, contract_id, contract_no, status, current_node, started_by, started_by_id, started_at, completed_at', 'SELECT COUNT(*) as c')).get(...params).c;
  sql += ` LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const rows = db.prepare(sql).all(...params);
  success(res, { list: rows, total, page: Number(page), pageSize: Number(pageSize) });
});

module.exports = router;
module.exports.buildFlow = buildFlow;
module.exports.canApproveNode = canApproveNode;
module.exports.findCurrentStep = findCurrentStep;
module.exports.evaluateConditional = evaluateConditional;
module.exports.isFlowComplete = isFlowComplete;
module.exports.getCurrentNodeName = getCurrentNodeName;
module.exports.autoCC = autoCC;
