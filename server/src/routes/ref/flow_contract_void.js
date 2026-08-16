/**
 * 合同作废审批流程路由 (flow_contract_void)
 * 绑定表单：t_contract_void_form
 * 关联主单据：合同编号（仅已生效/已归档/已变更合同可发起作废）
 *
 * 流转节点（串行5步）：
 * 节点1：经办人发起（自动完成）
 * 节点2：部门负责人审核
 * 节点3：法务审核
 * 节点4：副总审批
 * 节点5：总经理终审
 *
 * 完成后：合同状态 → '已作废'（物理数据保留）
 *
 * 路由前缀：/api/flow-contract-void
 */

'use strict';

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

// 文件上传配置（作废附件）
const voidDir = path.join(__dirname, '..', '..', '..', 'uploads', 'void-attachments');
if (!fs.existsSync(voidDir)) fs.mkdirSync(voidDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, voidDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'VOID-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ============================================================
// 流程构建函数
// ============================================================
function buildVoidFlow(contract, user) {
  const nowStr = now();
  return {
    flow_id: 'flow_contract_void',
    flow_name: '合同作废审批',
    current_node: 's2',
    nodes: [
      {
        id: 's1', name: '经办人发起', status: 'approved',
        approver: user.name, approver_id: user.id,
        approver_dept: user.dept, approved_at: nowStr,
        remark: '发起合同作废'
      },
      {
        id: 's2', name: '部门负责人审核', status: 'pending',
        approver: '', approver_id: '', approved_at: '', remark: ''
      },
      {
        id: 's3', name: '法务审核', status: 'pending',
        approver: '', approver_id: '', approved_at: '', remark: ''
      },
      {
        id: 's4', name: '副总审批', status: 'pending',
        approver: '', approver_id: '', approved_at: '', remark: ''
      },
      {
        id: 's5', name: '总经理终审', status: 'pending',
        approver: '', approver_id: '', approved_at: '', remark: ''
      }
    ]
  };
}

/**
 * 查找当前待审批节点
 */
function findCurrentStep(flow) {
  return flow.nodes.find(n => n.status === 'pending');
}

/**
 * 检查流程是否完成
 */
function isFlowComplete(flow) {
  return !flow.nodes.find(n => n.status === 'pending');
}

// ============================================================
// GET /available/:contractId - 检查合同是否可发起作废流程
// ============================================================
router.get('/available/:contractId', (req, res) => {
  try {
    const contract = db.prepare('SELECT id, contract_no, contract_name, contract_status FROM t_contract_main WHERE id = ?').get(req.params.contractId);
    if (!contract) return error(res, 404, '合同不存在');

    const protectedStatuses = ['已生效', '已归档', '已变更'];
    const canVoid = protectedStatuses.includes(contract.contract_status);

    // 检查是否已有进行中的流程
    const { hasActive } = hasActiveFlow(req.params.contractId);

    return success(res, {
      can_void: canVoid && !hasActive,
      contract_status: contract.contract_status,
      has_active_flow: hasActive,
      reason: !canVoid ? `合同状态「${contract.contract_status}」无需作废审批` : (hasActive ? '已有进行中的审批流程' : '可以发起作废审批')
    });
  } catch (e) {
    return error(res, 500, '检查失败: ' + e.message);
  }
});

// ============================================================
// POST /start/:contractId - 启动合同作废审批流程
// ============================================================
router.post('/start/:contractId', upload.single('attachment'), (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.contractId);
    if (!contract) return error(res, 404, '合同不存在');

    // Rule 2: 仅已生效/已归档/已变更的合同需要走作废审批流程
    const protectedStatuses = ['已生效', '已归档', '已变更'];
    if (!protectedStatuses.includes(contract.contract_status)) {
      return error(res, 400, `合同状态为「${contract.contract_status}」，无需走作废审批流程（可直接作废）`);
    }

    // Rule 3: 跨流程检查
    const { hasActive, activeFlow } = hasActiveFlow(req.params.contractId);
    if (hasActive) {
      return error(res, 400, `该合同已有进行中的审批流程（${activeFlow.flow_id}），不可同时启动作废流程（Rule 3）`);
    }

    // 必填校验
    const { void_reason, void_type, void_description } = req.body;
    if (!void_reason || !void_reason.trim()) {
      return error(res, 400, '作废原因为必填项');
    }

    // 构建流程
    const flow = buildVoidFlow(contract, req.user);
    const flowInstanceId = genId('FIN');
    const formId = genId('VOD');

    // 保存流程实例
    db.prepare(
      `INSERT INTO t_flow_instances (id, flow_id, contract_id, contract_no, flow_data, status, current_node, started_by, started_by_id)
       VALUES (?, 'flow_contract_void', ?, ?, ?, '进行中', ?, ?, ?)`
    ).run(flowInstanceId, req.params.contractId, contract.contract_no || '', JSON.stringify(flow), flow.current_node, req.user.name, req.user.id);

    // 保存作废表单
    db.prepare(
      `INSERT INTO t_contract_void_form
        (id, contract_id, contract_no, contract_name, void_reason, void_description, void_type,
         attachment_path, flow_instance_id, void_status, current_node,
         applicant, applicant_id, applicant_dept)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '审批中', ?, ?, ?, ?)`
    ).run(
      formId, req.params.contractId, contract.contract_no || '', contract.contract_name || '',
      void_reason.trim(), void_description || '', void_type || '主动作废',
      req.file ? ('/uploads/void-attachments/' + req.file.filename) : '',
      flowInstanceId, flow.current_node,
      req.user.name, req.user.id, req.user.dept
    );

    // 更新合同状态为 '作废中'
    db.prepare(
      `UPDATE t_contract_main SET contract_status='作废中', current_approval_node=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(flow.nodes[1].name, req.user.name, req.user.id, req.params.contractId);

    // Rule 6: 审计日志
    ensureAuditLog(req.params.contractId, req.user, '发起作废', `发起合同作废审批流程，作废原因：${void_reason}`);
    ensureAuditLog(req.params.contractId, req.user, '流程操作', `创建作废流程实例 ${flowInstanceId}`);

    return success(res, { flowInstanceId, formId, flow }, '合同作废审批流程已启动');
  } catch (e) {
    console.error('[flow_contract_void] /start error:', e);
    return error(res, 500, '启动作废流程失败: ' + e.message);
  }
});

// ============================================================
// GET /detail/:flowInstanceId - 获取作废流程详情
// ============================================================
router.get('/detail/:flowInstanceId', (req, res) => {
  try {
    const flowInstance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(req.params.flowInstanceId);
    if (!flowInstance) return error(res, 404, '流程实例不存在');

    const voidForm = db.prepare('SELECT * FROM t_contract_void_form WHERE flow_instance_id = ?').get(req.params.flowInstanceId);

    const flow = safeParse(flowInstance.flow_data, { nodes: [] });

    return success(res, {
      flowInstance: {
        id: flowInstance.id,
        flow_id: flowInstance.flow_id,
        contract_id: flowInstance.contract_id,
        contract_no: flowInstance.contract_no,
        status: flowInstance.status,
        current_node: flowInstance.current_node,
        started_by: flowInstance.started_by,
        started_at: flowInstance.started_at,
        completed_at: flowInstance.completed_at
      },
      flow,
      voidForm
    });
  } catch (e) {
    return error(res, 500, '获取流程详情失败: ' + e.message);
  }
});

// ============================================================
// POST /approve/:flowInstanceId - 审批通过（单步）
// ============================================================
router.post('/approve/:flowInstanceId', (req, res) => {
  try {
    const { flowInstanceId } = req.params;
    const { remark } = req.body;

    const flowInstance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(flowInstanceId);
    if (!flowInstance) return error(res, 404, '流程实例不存在');
    if (flowInstance.status !== '进行中') return error(res, 400, '流程不在进行中状态');

    const flow = safeParse(flowInstance.flow_data, { nodes: [] });
    const currentStep = findCurrentStep(flow);
    if (!currentStep) return error(res, 400, '没有待审批的节点');

    // 审批当前节点
    currentStep.status = 'approved';
    currentStep.approver = req.user.name;
    currentStep.approver_id = req.user.id;
    currentStep.approver_dept = req.user.dept;
    currentStep.approved_at = now();
    currentStep.remark = remark || '同意';

    // 查找下一个待审批节点
    const nextStep = findCurrentStep(flow);
    if (nextStep) {
      // 流程继续
      flow.current_node = nextStep.id;
      db.prepare(
        'UPDATE t_flow_instances SET flow_data=?, current_node=? WHERE id=?'
      ).run(JSON.stringify(flow), nextStep.id, flowInstanceId);

      // 更新合同当前审批节点
      db.prepare(
        "UPDATE t_contract_main SET current_approval_node=?, updated_at=datetime('now','localtime') WHERE id=?"
      ).run(nextStep.name, flowInstance.contract_id);

      ensureAuditLog(flowInstance.contract_id, req.user, '审批通过', `节点「${currentStep.name}」审批通过`);
    } else {
      // 流程完成
      flow.current_node = '已完成';
      db.prepare(
        `UPDATE t_flow_instances SET flow_data=?, status='已完成', current_node='已完成', completed_at=datetime('now','localtime') WHERE id=?`
      ).run(JSON.stringify(flow), flowInstanceId);

      // Rule 2: 流程完成后，合同状态改为 '已作废'（物理数据保留）
      db.prepare(
        `UPDATE t_contract_main SET contract_status='已作废', current_approval_node='作废完成', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`
      ).run(req.user.name, req.user.id, flowInstance.contract_id);

      // 更新作废表单状态
      db.prepare(
        `UPDATE t_contract_void_form SET void_status='已完成', current_node='已完成', updated_at=datetime('now','localtime') WHERE flow_instance_id=?`
      ).run(flowInstanceId);

      ensureAuditLog(flowInstance.contract_id, req.user, '作废完成', `合同作废审批流程已完成，合同已标记为「已作废」`);
    }

    return success(res, { flowInstanceId, currentNode: flow.current_node }, '审批通过');
  } catch (e) {
    console.error('[flow_contract_void] /approve error:', e);
    return error(res, 500, '审批失败: ' + e.message);
  }
});

// ============================================================
// POST /reject/:flowInstanceId - 驳回（回退发起人）
// ============================================================
router.post('/reject/:flowInstanceId', (req, res) => {
  try {
    const { flowInstanceId } = req.params;
    const { remark } = req.body;

    if (!remark || !remark.trim()) {
      return error(res, 400, '驳回必须填写意见');
    }

    const flowInstance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(flowInstanceId);
    if (!flowInstance) return error(res, 404, '流程实例不存在');
    if (flowInstance.status !== '进行中') return error(res, 400, '流程不在进行中状态');

    const flow = safeParse(flowInstance.flow_data, { nodes: [] });
    const currentStep = findCurrentStep(flow);
    if (!currentStep) return error(res, 400, '没有待审批的节点');

    // 标记当前节点为已驳回
    currentStep.status = 'rejected';
    currentStep.approver = req.user.name;
    currentStep.approver_id = req.user.id;
    currentStep.approver_dept = req.user.dept;
    currentStep.approved_at = now();
    currentStep.remark = remark;

    // 流程状态变为已驳回
    flow.current_node = '已驳回';
    db.prepare(
      `UPDATE t_flow_instances SET flow_data=?, status='已驳回', current_node='已驳回', completed_at=datetime('now','localtime') WHERE id=?`
    ).run(JSON.stringify(flow), flowInstanceId);

    // 合同状态恢复为原状态（回退到作废前）
    // 由于我们不知道原始状态，使用 '已生效' 作为默认恢复状态
    db.prepare(
      `UPDATE t_contract_main SET contract_status='已生效', current_approval_node='', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(req.user.name, req.user.id, flowInstance.contract_id);

    // 更新作废表单状态
    db.prepare(
      `UPDATE t_contract_void_form SET void_status='已驳回', current_node='已驳回', updated_at=datetime('now','localtime') WHERE flow_instance_id=?`
    ).run(flowInstanceId);

    ensureAuditLog(flowInstance.contract_id, req.user, '审批驳回', `节点「${currentStep.name}」驳回，原因：${remark}`);

    return success(res, { flowInstanceId }, '已驳回，合同状态恢复');
  } catch (e) {
    console.error('[flow_contract_void] /reject error:', e);
    return error(res, 500, '驳回失败: ' + e.message);
  }
});

// ============================================================
// GET /list - 获取作废流程列表
// ============================================================
router.get('/list', (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT vf.*, fi.status as flow_status, fi.current_node as flow_current_node
               FROM t_contract_void_form vf
               LEFT JOIN t_flow_instances fi ON vf.flow_instance_id = fi.id
               WHERE 1=1`;
    const params = [];
    if (status) {
      sql += ` AND vf.void_status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY vf.created_at DESC`;

    const list = db.prepare(sql).all(...params);
    return success(res, { total: list.length, list });
  } catch (e) {
    return error(res, 500, '获取列表失败: ' + e.message);
  }
});

module.exports = router;
