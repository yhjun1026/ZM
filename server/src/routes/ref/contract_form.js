/**
 * 合同主信息表单路由 (contract_form)
 * 绑定数据表：t_contract_main
 * 表单标识：contract_form
 * 约束规则：
 *   1. 草稿状态允许完整编辑；审批后基础字段锁定
 *   2. 归档完成后全部锁定，仅通过合同变更流程调整
 *   3. 附件保留上传日志，禁止直接删除历史附件（软删除）
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { canAccess } = require('../../compat/rbac');
const { success, error, genId, safeParse, generateApprovalFlow, now } = require('../../compat/helpers');
const { stripContractStatus, validateVoidOperation, ensureAuditLog } = require('../../compat/contract_validation');

// 导入合同权限规则集
const {
  getContractRole,
  getDataScope,
  getFormPermission,
  canViewContract,
  canEditField,
  canDownload,
  canSeal,
  canArchive,
  canDirectEdit,
  getListFilter,
  logAudit,
  checkConfidentialAccess,
  UNIVERSAL_CONSTRAINTS
} = require('../../compat/contract_permissions');

// 导入合同新签审批流程引擎函数
const flowContractNew = require('./flow_contract_new');
const buildFlowNew = flowContractNew.buildFlow;
const canApproveNodeNew = flowContractNew.canApproveNode;
const findCurrentStepNew = flowContractNew.findCurrentStep;
const evaluateConditionalNew = flowContractNew.evaluateConditional;
const isFlowCompleteNew = flowContractNew.isFlowComplete;
const getCurrentNodeNameNew = flowContractNew.getCurrentNodeName;
const autoCCNew = flowContractNew.autoCC;

router.use(authMiddleware);
// Rule 7: 全局拦截前端直接修改 contract_status（draft PUT 已单独使用，此处为兜底保护）
router.use(stripContractStatus);

// 文件上传配置
const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads', 'contracts');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// ===== 辅助函数 =====

// 生成合同编号: HT-YYYYMM-NNN
function genContractNo() {
  const d = new Date();
  const ym = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0');
  const prefix = 'HT-' + ym + '-';
  const row = db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_no LIKE ?").get(prefix + '%');
  const seq = String((row.c || 0) + 1).padStart(3, '0');
  return prefix + seq;
}

// 自动计算履行期限
function calcDuration(start, end) {
  if (!start || !end) return '';
  const s = new Date(start), e = new Date(end);
  if (isNaN(s) || isNaN(e)) return '';
  const days = Math.round((e - s) / (1000 * 60 * 60 * 24));
  if (days < 0) return '日期异常';
  if (days < 30) return days + '天';
  const months = Math.floor(days / 30);
  const remainDays = days % 30;
  return months + '个月' + (remainDays > 0 ? remainDays + '天' : '');
}

// 操作日志
function logFormAction(contractId, action, user, detail) {
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(contractId || '', action, user.name || '', user.id || '', user.dept || '', detail || '');
}

// 权限检查：能否编辑合同表单
function canEditForm(user, contract) {
  if (!contract) return false;
  if (contract.contract_status === '草稿') return true;
  if (contract.contract_status === '已归档') return false;
  if (contract.contract_status === '已作废') return false;
  // 审批中/已生效/变更中 — 不允许直接编辑基础字段
  return false;
}

// 权限检查：能否创建合同
function canCreateContract(user) {
  if (user.role === '超级管理员') return true;
  if (user.role === '总经理') return true;
  if (user.dept === '行政部') return true;
  return false;
}

// ===== 路由 =====

/**
 * GET /list — 合同主信息列表
 * 支持筛选：status, type, keyword
 */
router.get('/list', (req, res) => {
  const { status, type, keyword, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_contract_main WHERE 1=1';
  const params = [];
  if (status && status !== '全部') { sql += ' AND contract_status = ?'; params.push(status); }
  if (type && type !== '全部') { sql += ' AND contract_type = ?'; params.push(type); }
  if (keyword) { sql += ' AND (contract_name LIKE ? OR partner_company LIKE ? OR contract_no LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%', '%'+keyword+'%'); }
  // 数据权限：按合同角色数据范围过滤（经办人=仅本人，部门负责人=本部门，其余=全部）
  const filter = getListFilter(req.user);
  if (filter.where) {
    sql += filter.where;
    params.push(...filter.params);
  }
  // 涉密合同隔离：无涉密访问权限的用户不可见涉密合同
  if (UNIVERSAL_CONSTRAINTS.confidential_isolation) {
    const hasConfidentialAccess = checkConfidentialAccess(db, req.user);
    if (!hasConfidentialAccess) {
      sql += ' AND (is_confidential = 0 OR is_confidential IS NULL OR created_by_id = ?)';
      params.push(req.user.id);
    }
  }
  sql += ' ORDER BY created_at DESC';
  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as c')).get(...params).c;
  const offset = (page - 1) * pageSize;
  sql += ` LIMIT ${pageSize} OFFSET ${offset}`;
  const rows = db.prepare(sql).all(...params);
  // 解析JSON字段
  rows.forEach(r => {
    r.attachment_group = safeParse(r.attachment_group, []);
    r.flow = safeParse(r.flow, []);
  });
  success(res, { list: rows, total, page: Number(page), pageSize: Number(pageSize) });
});

/**
 * GET /detail/:id — 合同主信息详情
 */
router.get('/detail/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  // 权限检查：按合同角色数据范围验证是否有权查看
  const hasConfidential = checkConfidentialAccess(db, req.user);
  if (!canViewContract(req.user, row, { confidentialAccess: hasConfidential })) {
    return error(res, 403, '无权查看该合同（数据范围限制或涉密隔离）');
  }
  row.attachment_group = safeParse(row.attachment_group, []);
  row.flow = safeParse(row.flow, []);
  // 获取附件日志
  const attachments = db.prepare('SELECT * FROM t_contract_attachments WHERE contract_id = ? ORDER BY uploaded_at DESC').all(req.params.id);
  row.attachment_logs = attachments;
  // 附加权限信息供前端使用
  const contractRole = getContractRole(req.user);
  row._permissions = {
    contractRole: contractRole,
    formPermission: getFormPermission(contractRole, row.contract_status),
    canEdit: canEditField(req.user, row, 'contract_name'),
    canDownload: canDownload(req.user),
    canArchive: canArchive(req.user, row),
    canDirectEdit: canDirectEdit(req.user, row),
    dataScope: getDataScope(contractRole)
  };
  // 写入审计日志：查看操作
  logAudit(db, req.user.id, req.user.name, req.user.dept, req.params.id, '查看', '查看合同详情');
  success(res, row);
});

/**
 * POST /draft — 创建草稿（不生成合同编号）
 */
router.post('/draft', (req, res) => {
  // 权限检查：经办人角色可创建合同，超管禁止直接创建业务单据
  const contractRole = getContractRole(req.user);
  if (contractRole === '系统超级管理员') {
    return error(res, 403, '超级管理员不可直接创建业务单据，请通过经办人发起');
  }
  // 经办人、部门负责人、法务专员、财务审核 可发起合同
  const canInitiate = ['经办人', '部门负责人'].includes(contractRole) || canCreateContract(req.user);
  if (!canInitiate) return error(res, 403, '无权创建合同，仅经办人或行政部可操作');
  const b = req.body;
  const id = genId('CM'); // Contract Main
  // 计算履行期限
  const duration = calcDuration(b.start_date, b.end_date);
  db.prepare(`INSERT INTO t_contract_main
    (id, contract_type, contract_name, partner_company, social_credit_code, contact_person, contact_phone,
     sign_location, amount, currency, tax_rate, tax_inclusive, payment_method, payment_milestones,
     start_date, end_date, duration, budget_department, handler, handler_id,
     external_remark, internal_risk_remark, contract_status, created_by, created_by_id, created_dept)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id,
      b.contract_type || '', b.contract_name || '', b.partner_company || '',
      b.social_credit_code || '', b.contact_person || '', b.contact_phone || '',
      b.sign_location || '', b.amount || 0, b.currency || '人民币',
      b.tax_rate || '', b.tax_inclusive || '含税', b.payment_method || '', b.payment_milestones || '',
      b.start_date || '', b.end_date || '', duration,
      b.budget_department || req.user.dept || '', b.handler || req.user.name, b.handler_id || req.user.id,
      b.external_remark || '', b.internal_risk_remark || '',
      '草稿', req.user.name, req.user.id, req.user.dept
    );
  logFormAction(id, '创建草稿', req.user, '创建合同草稿: ' + (b.contract_name || ''));
  success(res, { id }, '草稿创建成功');
});

/**
 * PUT /draft/:id — 更新草稿（仅草稿状态可编辑）
 */
router.put('/draft/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  // 权限检查：使用新的表单权限规则
  const contractRole = getContractRole(req.user);
  const formPerm = getFormPermission(contractRole, row.contract_status);
  if (formPerm === 'locked' || formPerm === 'view_only') {
    return error(res, 403, '当前状态不允许编辑（' + contractRole + '在' + row.contract_status + '状态仅可查看）');
  }
  // 超级管理员禁止直接编辑
  if (contractRole === '系统超级管理员') {
    return error(res, 403, '超级管理员不可直接编辑业务单据，请通过变更流程');
  }
  // 经办人仅能编辑本人创建的合同
  if (contractRole === '经办人' && String(row.created_by_id) !== String(req.user.id)) {
    return error(res, 403, '仅可编辑本人创建的合同');
  }
  const b = req.body;
  const duration = calcDuration(b.start_date || row.start_date, b.end_date || row.end_date);
  db.prepare(`UPDATE t_contract_main SET
    contract_type=?, contract_name=?, partner_company=?, social_credit_code=?, contact_person=?, contact_phone=?,
    sign_location=?, amount=?, currency=?, tax_rate=?, tax_inclusive=?, payment_method=?, payment_milestones=?,
    start_date=?, end_date=?, duration=?, budget_department=?, handler=?, handler_id=?,
    external_remark=?, internal_risk_remark=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime')
    WHERE id=?`)
    .run(
      b.contract_type ?? row.contract_type, b.contract_name ?? row.contract_name, b.partner_company ?? row.partner_company,
      b.social_credit_code ?? row.social_credit_code, b.contact_person ?? row.contact_person, b.contact_phone ?? row.contact_phone,
      b.sign_location ?? row.sign_location, b.amount ?? row.amount, b.currency ?? row.currency,
      b.tax_rate ?? row.tax_rate, b.tax_inclusive ?? row.tax_inclusive, b.payment_method ?? row.payment_method, b.payment_milestones ?? row.payment_milestones,
      b.start_date ?? row.start_date, b.end_date ?? row.end_date, duration,
      b.budget_department ?? row.budget_department, b.handler ?? row.handler, b.handler_id ?? row.handler_id,
      b.external_remark ?? row.external_remark, b.internal_risk_remark ?? row.internal_risk_remark,
      req.user.name, req.user.id, req.params.id
    );
  logFormAction(req.params.id, '编辑草稿', req.user, '修改合同草稿内容');
  success(res, { id: req.params.id }, '草稿更新成功');
});

/**
 * POST /:id/submit — 提交审批（调用合同新签审批流程 flow_contract_new）
 * 已迁移至 /api/flow-contract-new/start/:contractId
 * 保留此端点用于向后兼容，内部转发到新流程
 */
router.post('/:id/submit', (req, res) => {
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  if (row.contract_status !== '草稿') return error(res, 400, '仅草稿状态可提交审批');
  if (!row.contract_name) return error(res, 400, '合同名称为必填项');
  if (!row.partner_company) return error(res, 400, '合作方单位为必填项');
  if (!row.amount) return error(res, 400, '合同金额为必填项');

  // 生成合同编号
  const contractNo = genContractNo();
  // 生成审批流程（新流程引擎）
  const flow = buildFlowNew({ ...row, contract_no: contractNo }, req.user);
  const flowInstance = genId('FIN');
  db.prepare('INSERT INTO t_flow_instances (id, flow_id, contract_id, contract_no, flow_data, status, current_node, started_by, started_by_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(flowInstance, 'flow_contract_new', req.params.id, contractNo, JSON.stringify(flow), '进行中', flow.current_node, req.user.name, req.user.id);
  db.prepare(`UPDATE t_contract_main SET
    contract_no=?, contract_status='审批中', current_approval_node=?,
    approval_flow_id=?, flow=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime')
    WHERE id=?`)
    .run(contractNo, flow.current_node, flowInstance, JSON.stringify(flow), req.user.name, req.user.id, req.params.id);
  logFormAction(req.params.id, '提交审批', req.user, '生成合同编号: ' + contractNo + '，启动合同新签审批流程');
  success(res, { id: req.params.id, contract_no: contractNo, flow_instance_id: flowInstance }, '已提交审批，合同编号: ' + contractNo);
});

/**
 * POST /:id/approve — 审批通过当前节点（使用新流程引擎）
 */
router.post('/:id/approve', (req, res) => {
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  if (row.contract_status !== '审批中') return error(res, 400, '合同不在审批中状态');

  // 优先使用新流程引擎（t_flow_instances）
  if (row.approval_flow_id) {
    const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(row.approval_flow_id);
    if (instance) {
      const flow = safeParse(instance.flow_data, {});
      if (flow.status !== '进行中') return error(res, 400, '流程不在进行中状态');
      const comment = req.body.comment || '审批通过';
      const current = findCurrentStepNew(flow);
      if (!current) return error(res, 400, '没有待审批的节点');

      // 处理不同类型节点
      if (current.type === 'serial') {
        if (!canApproveNodeNew(req.user, current.step)) {
          return error(res, 403, '您无权审批此节点: ' + current.step.name + '（禁止越级审批）');
        }
        current.step.status = 'done';
        current.step.approver = req.user.name;
        current.step.approver_id = req.user.id;
        current.step.time = now();
        current.step.comment = comment;
      } else if (current.type === 'parallel') {
        if (!canApproveNodeNew(req.user, current.child)) {
          return error(res, 403, '您无权审批此节点: ' + current.child.name + '（禁止越级审批）');
        }
        current.child.status = 'done';
        current.child.approver = req.user.name;
        current.child.approver_id = req.user.id;
        current.child.time = now();
        current.child.comment = comment;
        const allChildrenDone = current.step.children.every(c => c.status === 'done');
        if (allChildrenDone) current.step.status = 'done';
      } else if (current.type === 'conditional_init') {
        const branch = evaluateConditionalNew(current.step);
        if (branch.nodes.length === 0) current.step.status = 'done';
      } else if (current.type === 'conditional_node') {
        if (!canApproveNodeNew(req.user, current.node)) {
          return error(res, 403, '您无权审批此节点: ' + current.node.name + '（禁止越级审批）');
        }
        current.node.status = 'done';
        current.node.approver = req.user.name;
        current.node.approver_id = req.user.id;
        current.node.time = now();
        current.node.comment = comment;
        const allNodesDone = current.branch.nodes.every(n => n.status === 'done');
        if (allNodesDone) current.step.status = 'done';
      } else if (current.type === 'conditional_complete') {
        current.step.status = 'done';
      }

      flow.current_node = getCurrentNodeNameNew(flow);

      if (isFlowCompleteNew(flow)) {
        flow.status = '已完成';
        flow.current_node = '已完成';
        flow.completed_at = now();
        db.prepare("UPDATE t_contract_main SET contract_status='已生效', current_approval_node='已完成', flow=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
          .run(JSON.stringify(flow), req.user.name, req.user.id, req.params.id);
        autoCCNew({ ...flow, id: instance.id }, { ...flow, created_by: flow.initiator });
        logFormAction(req.params.id, '审批完成', req.user, '合同新签审批流程全部完成，合同已生效。已自动抄送经办人、财务、合同管理员');
      } else {
        db.prepare("UPDATE t_contract_main SET flow=?, current_approval_node=?, updated_at=datetime('now','localtime') WHERE id=?")
          .run(JSON.stringify(flow), flow.current_node, req.params.id);
        logFormAction(req.params.id, '审批通过', req.user, '通过节点: ' + (current.step ? current.step.name : '') + '，下一节点: ' + flow.current_node);
      }

      db.prepare("UPDATE t_flow_instances SET flow_data=?, status=?, current_node=?, completed_at=? WHERE id=?")
        .run(JSON.stringify(flow), flow.status, flow.current_node, flow.completed_at || '', instance.id);

      return success(res, { id: req.params.id, flow }, flow.status === '已完成' ? '审批流程全部完成，合同已生效' : '已通过当前节点');
    }
  }

  // 向后兼容：旧流程（数组格式）
  const flow = safeParse(row.flow, []);
  if (!Array.isArray(flow)) return error(res, 400, '流程数据格式异常');
  const idx = flow.findIndex(s => !s.done);
  if (idx === -1) return error(res, 400, '审批流程已完成');
  const canApproveStep = (user, stepName) => {
    if (user.role === '超级管理员') return true;
    if (user.role === '总经理') return true;
    if (stepName.includes('副总') && user.role === '副总') return true;
    if (stepName.includes('行政部负责人') && user.dept === '行政部') return true;
    if (stepName.includes('财务') && user.dept === '财务部') return true;
    if (stepName.includes('销售总监') && user.role === '销售总监') return true;
    return false;
  };
  if (!canApproveStep(req.user, flow[idx].step)) return error(res, 403, '您无权审批此节点: ' + flow[idx].step);
  flow[idx].done = true;
  flow[idx].user = req.user.name;
  flow[idx].time = now();
  const allDone = flow.every(s => s.done);
  if (allDone) {
    db.prepare(`UPDATE t_contract_main SET flow=?, contract_status='已生效', current_approval_node='已完成', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(JSON.stringify(flow), req.user.name, req.user.id, req.params.id);
    logFormAction(req.params.id, '审批通过', req.user, '全部审批节点通过，合同已生效');
  } else {
    const nextStep = flow[idx + 1];
    db.prepare(`UPDATE t_contract_main SET flow=?, current_approval_node=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(JSON.stringify(flow), nextStep.step, req.user.name, req.user.id, req.params.id);
    logFormAction(req.params.id, '审批通过', req.user, '通过节点: ' + flow[idx].step + '，下一节点: ' + nextStep.step);
  }
  success(res, { id: req.params.id }, allDone ? '合同审批通过，已生效' : '已通过当前节点');
});

/**
 * POST /:id/reject — 驳回审批（使用新流程引擎）
 * 约束2: 驳回必须填写审核意见
 */
router.post('/:id/reject', (req, res) => {
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  if (row.contract_status !== '审批中') return error(res, 400, '合同不在审批中状态');
  const comment = req.body.comment;
  if (!comment || comment.trim() === '') {
    return error(res, 400, '驳回必须填写审核意见');
  }

  // 优先使用新流程引擎
  if (row.approval_flow_id) {
    const instance = db.prepare('SELECT * FROM t_flow_instances WHERE id = ?').get(row.approval_flow_id);
    if (instance) {
      const flow = safeParse(instance.flow_data, {});
      if (flow.status !== '进行中') return error(res, 400, '流程不在进行中状态');
      const current = findCurrentStepNew(flow);
      if (!current) return error(res, 400, '没有待审批的节点');

      let rejectedNodeName = '';
      if (current.type === 'serial') {
        if (!canApproveNodeNew(req.user, current.step)) {
          return error(res, 403, '您无权驳回此节点: ' + current.step.name);
        }
        rejectedNodeName = current.step.name;
        current.step.status = 'rejected';
        current.step.approver = req.user.name;
        current.step.approver_id = req.user.id;
        current.step.time = now();
        current.step.comment = comment;
      } else if (current.type === 'parallel') {
        if (!canApproveNodeNew(req.user, current.child)) {
          return error(res, 403, '您无权驳回此节点: ' + current.child.name);
        }
        rejectedNodeName = current.child.name;
        current.child.status = 'rejected';
        current.child.approver = req.user.name;
        current.child.approver_id = req.user.id;
        current.child.time = now();
        current.child.comment = comment;
        current.step.status = 'rejected';
      } else if (current.type === 'conditional_node') {
        if (!canApproveNodeNew(req.user, current.node)) {
          return error(res, 403, '您无权驳回此节点: ' + current.node.name);
        }
        rejectedNodeName = current.node.name;
        current.node.status = 'rejected';
        current.node.approver = req.user.name;
        current.node.approver_id = req.user.id;
        current.node.time = now();
        current.node.comment = comment;
        current.step.status = 'rejected';
      } else {
        return error(res, 400, '当前节点不支持驳回');
      }

      flow.status = '已驳回';
      flow.current_node = '已驳回（退回经办人）';

      db.prepare("UPDATE t_contract_main SET contract_status='草稿', current_approval_node='已驳回', flow=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?")
        .run(JSON.stringify(flow), req.user.name, req.user.id, req.params.id);
      db.prepare("UPDATE t_flow_instances SET flow_data=?, status='已驳回', current_node='已驳回（退回经办人）' WHERE id=?")
        .run(JSON.stringify(flow), instance.id);

      logFormAction(req.params.id, '审批驳回', req.user, '节点: ' + rejectedNodeName + ' 驳回原因: ' + comment);
      return success(res, { id: req.params.id, flow, rejected_node: rejectedNodeName }, '已驳回，合同退回经办人草稿状态');
    }
  }

  // 向后兼容：旧流程
  const flow = safeParse(row.flow, []);
  if (!Array.isArray(flow)) return error(res, 400, '流程数据格式异常');
  const idx = flow.findIndex(s => !s.done);
  if (idx === -1) return error(res, 400, '审批流程已完成');
  db.prepare(`UPDATE t_contract_main SET contract_status='草稿', current_approval_node='', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(req.user.name, req.user.id, req.params.id);
  logFormAction(req.params.id, '审批驳回', req.user, '节点: ' + flow[idx].step + ' 驳回原因: ' + comment);
  success(res, { id: req.params.id }, '已驳回，合同退回草稿状态');
});

/**
 * POST /:id/archive — 归档（锁定全部字段）
 */
router.post('/:id/archive', (req, res) => {
  // 权限检查：仅合同档案管理员和超级管理员可归档
  if (!canArchive(req.user, { contract_status: '已生效' })) {
    // 先检查是否是有归档权限的角色
    const contractRole = getContractRole(req.user);
    if (contractRole !== '合同档案管理员' && contractRole !== '系统超级管理员') {
      return error(res, 403, '仅合同档案管理员可执行归档操作');
    }
  }
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  // 使用 canArchive 检查合同状态
  if (!canArchive(req.user, row)) return error(res, 400, '仅已生效/执行中的合同可归档');
  const { archive_no, archive_location, archive_remark, retention_period } = req.body;
  db.prepare(`UPDATE t_contract_main SET contract_status='已归档', current_approval_node='归档完成', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(req.user.name, req.user.id, req.params.id);
  logFormAction(req.params.id, '合同归档', req.user, `归档编号:${archive_no||''}, 位置:${archive_location||''}, 期限:${retention_period||''}, 备注:${archive_remark||''}`);
  // 写入审计日志
  logAudit(db, req.user.id, req.user.name, req.user.dept, req.params.id, '归档', `归档编号:${archive_no||''}`);
  success(res, { id: req.params.id }, '合同已归档，全部字段已锁定');
});

/**
 * POST /:id/void — 作废
 */
router.post('/:id/void', validateVoidOperation, (req, res) => {
  // 权限检查：合同档案管理员、超级管理员可作废
  const contractRole = getContractRole(req.user);
  if (contractRole !== '合同档案管理员' && contractRole !== '系统超级管理员' && !canCreateContract(req.user)) {
    return error(res, 403, '仅合同档案管理员或管理员可作废合同');
  }
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  const reason = req.body.reason || '';
  db.prepare(`UPDATE t_contract_main SET contract_status='已作废', updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(req.user.name, req.user.id, req.params.id);
  logFormAction(req.params.id, '合同作废', req.user, '作废原因: ' + reason);
  logAudit(db, req.user.id, req.user.name, req.user.dept, req.params.id, '作废', '作废原因: ' + reason);
  success(res, { id: req.params.id }, '合同已作废');
});

/**
 * POST /:id/attachment — 上传附件（记录上传日志）
 * file_category: 合同草案 / 相关资质 / 报价资料 / 合同定稿
 */
router.post('/:id/attachment', upload.single('file'), (req, res) => {
  const row = db.prepare('SELECT id FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  if (!req.file) return error(res, 400, '请选择文件');
  const fileCategory = req.body.file_category || '合同草案';
  const filePath = '/uploads/contracts/' + req.file.filename;
  const fileSize = req.file.size;

  // 写入附件日志表
  const info = db.prepare('INSERT INTO t_contract_attachments (contract_id, file_name, file_category, file_path, file_size, uploader, uploader_id) VALUES (?,?,?,?,?,?,?)')
    .run(req.params.id, req.file.originalname, fileCategory, filePath, fileSize, req.user.name, req.user.id);

  // 更新合同的 attachment_group JSON
  const contract = db.prepare('SELECT attachment_group FROM t_contract_main WHERE id = ?').get(req.params.id);
  const group = safeParse(contract.attachment_group, []);
  group.push({
    att_id: info.lastInsertRowid,
    name: req.file.originalname,
    path: filePath,
    category: fileCategory,
    size: fileSize,
    uploader: req.user.name,
    uploaded_at: now()
  });
  db.prepare('UPDATE t_contract_main SET attachment_group=?, updated_at=datetime("now","localtime") WHERE id=?')
    .run(JSON.stringify(group), req.params.id);

  logFormAction(req.params.id, '上传附件', req.user, '上传文件: ' + req.file.originalname + ' (分类: ' + fileCategory + ')');
  logAudit(db, req.user.id, req.user.name, req.user.dept, req.params.id, '上传附件', '上传文件: ' + req.file.originalname);
  success(res, { att_id: info.lastInsertRowid, path: filePath, name: req.file.originalname }, '附件上传成功');
});

/**
 * DELETE /:id/attachment/:attId — 软删除附件（保留审计记录）
 */
router.delete('/:id/attachment/:attId', (req, res) => {
  const att = db.prepare('SELECT * FROM t_contract_attachments WHERE id=? AND contract_id=? AND is_deleted=0').get(req.params.attId, req.params.id);
  if (!att) return error(res, 404, '附件不存在或已删除');

  // 软删除（保留审计记录）
  db.prepare('UPDATE t_contract_attachments SET is_deleted=1, deleted_by=?, deleted_at=datetime("now","localtime") WHERE id=?')
    .run(req.user.name, req.params.attId);

  // 从合同 attachment_group 中移除
  const contract = db.prepare('SELECT attachment_group FROM t_contract_main WHERE id = ?').get(req.params.id);
  let group = safeParse(contract.attachment_group, []);
  group = group.filter(a => String(a.att_id) !== String(req.params.attId));
  db.prepare('UPDATE t_contract_main SET attachment_group=?, updated_at=datetime("now","localtime") WHERE id=?')
    .run(JSON.stringify(group), req.params.id);

  logFormAction(req.params.id, '删除附件', req.user, '删除文件: ' + att.file_name + ' (软删除，保留审计记录)');
  logAudit(db, req.user.id, req.user.name, req.user.dept, req.params.id, '删除附件', '删除文件: ' + att.file_name);
  success(res, {}, '附件已删除（审计记录保留）');
});

/**
 * GET /:id/attachments — 获取附件列表（含历史删除记录）
 */
router.get('/:id/attachments', (req, res) => {
  const row = db.prepare('SELECT id FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  const attachments = db.prepare('SELECT * FROM t_contract_attachments WHERE contract_id = ? ORDER BY uploaded_at DESC').all(req.params.id);
  success(res, { list: attachments });
});

/**
 * POST /:id/final-pdf — 上传合同定稿PDF（审批通过盖章后）
 */
router.post('/:id/final-pdf', upload.single('file'), (req, res) => {
  // 权限检查：行政部/管理员/印章管理员可上传定稿PDF
  const contractRole = getContractRole(req.user);
  if (contractRole !== '印章管理员' && !canCreateContract(req.user)) {
    return error(res, 403, '仅行政部、管理员或印章管理员可上传定稿PDF');
  }
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  if (!req.file) return error(res, 400, '请选择PDF文件');
  if (!req.file.originalname.toLowerCase().endsWith('.pdf')) return error(res, 400, '定稿文件必须为PDF格式');

  const filePath = '/uploads/contracts/' + req.file.filename;

  // 写入附件日志表
  db.prepare('INSERT INTO t_contract_attachments (contract_id, file_name, file_category, file_path, file_size, uploader, uploader_id) VALUES (?,?,?,?,?,?,?)')
    .run(req.params.id, req.file.originalname, '合同定稿', filePath, req.file.size, req.user.name, req.user.id);

  db.prepare(`UPDATE t_contract_main SET final_pdf=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(filePath, req.user.name, req.user.id, req.params.id);

  logFormAction(req.params.id, '上传定稿PDF', req.user, '上传合同定稿: ' + req.file.originalname);
  logAudit(db, req.user.id, req.user.name, req.user.dept, req.params.id, '上传定稿', '上传合同定稿: ' + req.file.originalname);
  success(res, { path: filePath }, '合同定稿PDF已上传');
});

/**
 * POST /:id/signed-pdf — 上传签字盖章版PDF
 * 支持多次上传，保留历史版本
 */
router.post('/:id/signed-pdf', upload.single('file'), (req, res) => {
  // 权限检查：行政部/管理员/印章管理员可上传
  const contractRole = getContractRole(req.user);
  if (contractRole !== '印章管理员' && !canCreateContract(req.user)) {
    return error(res, 403, '仅行政部、管理员或印章管理员可上传签字盖章版');
  }
  const row = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  if (!req.file) return error(res, 400, '请选择PDF文件');
  if (!req.file.originalname.toLowerCase().endsWith('.pdf')) return error(res, 400, '签字盖章版文件必须为PDF格式');

  const filePath = '/uploads/contracts/' + req.file.filename;
  const ts = now();

  // 写入附件日志表（category=签字盖章版，保留历史版本）
  const info = db.prepare('INSERT INTO t_contract_attachments (contract_id, file_name, file_category, file_path, file_size, uploader, uploader_id) VALUES (?,?,?,?,?,?,?)')
    .run(req.params.id, req.file.originalname, '签字盖章版', filePath, req.file.size, req.user.name, req.user.id);

  // 更新合同主表 signed_pdf 字段（指向最新版本）
  db.prepare(`UPDATE t_contract_main SET signed_pdf=?, signed_pdf_at=?, signed_pdf_by=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(filePath, ts, req.user.name, req.user.name, req.user.id, req.params.id);

  logFormAction(req.params.id, '上传签字盖章版', req.user, '上传签字盖章版PDF: ' + req.file.originalname);
  logAudit(db, req.user.id, req.user.name, req.user.dept, req.params.id, '上传签字盖章版', '上传签字盖章版PDF: ' + req.file.originalname);
  success(res, { path: filePath, att_id: info.lastInsertRowid, uploaded_at: ts }, '签字盖章版PDF已上传');
});

/**
 * GET /:id/signed-pdf — 获取签字盖章版PDF信息及历史版本
 */
router.get('/:id/signed-pdf', (req, res) => {
  const row = db.prepare('SELECT id, signed_pdf, signed_pdf_at, signed_pdf_by FROM t_contract_main WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  // 获取所有签字盖章版历史记录
  const history = db.prepare("SELECT * FROM t_contract_attachments WHERE contract_id = ? AND file_category = '签字盖章版' AND is_deleted = 0 ORDER BY uploaded_at DESC").all(req.params.id);
  success(res, { current: row.signed_pdf, uploaded_at: row.signed_pdf_at, uploaded_by: row.signed_pdf_by, history });
});

/**
 * GET /stats — 合同统计
 */
router.get('/stats', (req, res) => {
  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM t_contract_main').get().c,
    draft: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='草稿'").get().c,
    approving: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='审批中'").get().c,
    active: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='已生效'").get().c,
    changing: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='变更中'").get().c,
    terminating: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='终止中'").get().c,
    terminated: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='已终止'").get().c,
    archived: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='已归档'").get().c,
    voided: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status='已作废'").get().c,
    confidential: db.prepare("SELECT COUNT(*) as c FROM t_contract_main WHERE is_confidential=1").get().c,
    borrowing: db.prepare("SELECT COUNT(*) as c FROM t_contract_borrow_form WHERE borrow_status='审批中'").get().c,
    borrowed: db.prepare("SELECT COUNT(*) as c FROM t_contract_borrow_form WHERE borrow_status='已批准'").get().c,
    overdueBorrows: db.prepare("SELECT COUNT(*) as c FROM t_contract_borrow_form WHERE borrow_status='已批准' AND is_overdue=1").get().c,
    totalAmount: db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM t_contract_main WHERE contract_status IN ('已生效','已归档')").get().s,
  };
  success(res, stats);
});

module.exports = router;
