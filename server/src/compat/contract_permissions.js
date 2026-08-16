/**
 * 合同权限规则集配置文件
 * 
 * 定义9个合同角色的权限规则：
 * 经办人、部门负责人、法务专员、财务审核、分管领导、总经理、
 * 印章管理员、合同档案管理员、系统超级管理员
 * 
 * 通用权限约束：
 * 1. 合同归档状态所有角色前端表单锁定
 * 2. 涉密合同数据权限隔离（可配置开关）
 * 3. 下载权限控制：普通人员仅预览，档案管理员/法务/财务开放原件下载
 * 4. 所有查看、下载操作写入审计日志
 */

'use strict';

// ============================================================
// 1. 合同角色定义
// ============================================================
const CONTRACT_ROLES = [
  '经办人',
  '部门负责人',
  '法务专员',
  '财务审核',
  '分管领导',
  '总经理',
  '印章管理员',
  '合同档案管理员',
  '系统超级管理员'
];

// 系统角色 → 合同角色 映射（当用户未显式设置 contract_role 时作为回退）
const ROLE_MAPPING = {
  '超级管理员': '系统超级管理员',
  '总经理': '总经理',
  '副总': '分管领导',
  '销售总监': '分管领导',
  '部门经理': '部门负责人',
  '普通员工': '经办人'
};

// ============================================================
// 2. 角色权限规则定义
// ============================================================
const PERMISSION_RULES = {
  // 【经办人】
  '经办人': {
    formDataScope: 'self',
    formPermissions: {
      '草稿': 'full_edit',
      '审批中': 'view_only',
      '已驳回': 'edit_and_resubmit',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['initiate', 'withdraw_draft', 'upload_attachment'],
    forbiddenActions: ['edit_after_approval', 'delete_submitted', 'view_others', 'export_archive'],
    businessLimits: [],
    description: '草稿全编辑；审批流转中仅可查看、收到驳回后修改重新提交'
  },

  // 【部门负责人】
  '部门负责人': {
    formDataScope: 'dept',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_and_comment',
      '已驳回': 'view_only',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['approve', 'reject', 'add_countersign'],
    forbiddenActions: ['edit_contract_text'],
    businessLimits: [],
    description: '只读，仅可填写审核意见；本部门全部合同'
  },

  // 【法务专员】
  '法务专员': {
    formDataScope: 'all',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_and_upload_legal_opinion',
      '已驳回': 'view_only',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['approve', 'reject', 'mark_risk'],
    forbiddenActions: ['edit_contract_text'],
    businessLimits: [],
    description: '只读，可上传法律审核意见附件；公司全部合同'
  },

  // 【财务审核】
  '财务审核': {
    formDataScope: 'all',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_and_fill_finance_opinion',
      '已驳回': 'view_only',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['approve', 'reject'],
    forbiddenActions: ['edit_contract_text'],
    businessLimits: ['visible_fields:合同金额,付款条款'],
    description: '只读，填写财务审核意见；公司全部合同，可见金额、付款条款'
  },

  // 【分管领导】
  '分管领导': {
    formDataScope: 'authorized',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_and_final_opinion',
      '已驳回': 'view_only',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['approve', 'reject'],
    forbiddenActions: ['edit_contract_text'],
    businessLimits: [],
    description: '只读，终审意见；授权范围内全部合同'
  },

  // 【总经理】
  '总经理': {
    formDataScope: 'authorized',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_and_final_opinion',
      '已驳回': 'view_only',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['approve', 'reject'],
    forbiddenActions: ['edit_contract_text'],
    businessLimits: [],
    description: '只读，终审意见；授权范围内全部合同'
  },

  // 【印章管理员】
  '印章管理员': {
    formDataScope: 'all',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_and_upload_seal_scan',
      '已驳回': 'view_only',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['upload_seal_scan'],
    forbiddenActions: ['edit_contract_text'],
    businessLimits: ['seal_button_only_when_all_approved'],
    description: '只读，仅允许上传盖章扫描件；全部合同；用印登记按钮需全部审批通过'
  },

  // 【合同档案管理员】
  '合同档案管理员': {
    formDataScope: 'all',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_only',
      '已驳回': 'view_only',
      '已归档': 'archive_edit',
      '已作废': 'locked'
    },
    allowedActions: ['archive', 'maintain_ledger', 'expire_warning', 'handle_borrow', 'update_version_after_change'],
    forbiddenActions: ['modify_active_contract_without_approval'],
    businessLimits: [],
    description: '归档节点可完善归档信息；仅变更流程审批通过后允许更新合同版本'
  },

  // 【系统超级管理员】
  '系统超级管理员': {
    formDataScope: 'all',
    formPermissions: {
      '草稿': 'view_only',
      '审批中': 'view_only',
      '已驳回': 'view_only',
      '已归档': 'locked',
      '已作废': 'locked'
    },
    allowedActions: ['view_all', 'query_logs'],
    forbiddenActions: ['direct_edit_business_document'],
    businessLimits: ['force_change_flow_for_modification'],
    description: '数据全部可见；禁止直接修改业务单据，仅支持后台查询日志；调整合同须走变更流程'
  }
};

// ============================================================
// 3. 通用权限约束
// ============================================================
const UNIVERSAL_CONSTRAINTS = {
  // 1. 归档锁定：合同归档状态所有角色前端表单锁定
  archive_lock: true,
  // 2. 涉密隔离：可配置开关，涉密合同单独数据权限隔离
  confidential_isolation: true,
  // 3. 下载控制：普通人员仅预览，档案管理员/法务/财务开放原件下载
  download_control: true,
  // 4. 审计日志：所有查看、下载操作写入审计日志
  audit_log: true
};

// ============================================================
// 4. 下载权限白名单
// ============================================================
const DOWNLOAD_ALLOWED_ROLES = [
  '合同档案管理员',
  '法务专员',
  '财务审核',
  '系统超级管理员'
];

// ============================================================
// 5. 涉密合同访问配置
// ============================================================
const CONFIDENTIAL_ACCESS_CONFIG = {
  enabled: true,
  defaultRoles: [
    '系统超级管理员',
    '总经理',
    '法务专员',
    '合同档案管理员'
  ]
};

// ============================================================
// 6. 辅助函数
// ============================================================

/**
 * 获取用户的合同角色
 * 优先使用显式设置的 contract_role，否则根据系统角色映射
 * @param {Object} user - 用户对象（含 role, dept, contract_role 属性）
 * @returns {string} 合同角色名称
 */
function getContractRole(user) {
  if (!user) return '经办人';
  // 优先使用显式设置的合同角色
  if (user.contract_role && user.contract_role.trim()) {
    return user.contract_role.trim();
  }
  // 回退到系统角色映射
  const systemRole = user.role || '';
  // 财务部部门经理 → 财务审核（而非部门负责人）
  if (systemRole === '部门经理' && user.dept === '财务部') {
    return '财务审核';
  }
  return ROLE_MAPPING[systemRole] || '经办人';
}

/**
 * 获取用户的数据查看范围
 * @param {string} contractRole - 合同角色
 * @returns {string} 数据范围：self | dept | all | authorized
 */
function getDataScope(contractRole) {
  const rules = PERMISSION_RULES[contractRole];
  if (!rules) return 'self';
  return rules.formDataScope;
}

/**
 * 获取用户对特定合同状态的表单权限
 * @param {string} contractRole - 合同角色
 * @param {string} contractStatus - 合同状态
 * @returns {string} 表单权限级别
 */
function getFormPermission(contractRole, contractStatus) {
  const rules = PERMISSION_RULES[contractRole];
  if (!rules) return 'locked';
  // 通用约束1：归档状态所有角色锁定
  if (contractStatus === '已归档' || contractStatus === '已作废') {
    return 'locked';
  }
  return rules.formPermissions[contractStatus] || 'locked';
}

/**
 * 检查用户是否可以查看某份合同
 * @param {Object} user - 用户对象
 * @param {Object} contract - 合同对象
 * @param {Object} options - 额外选项 { confidentialAccess: boolean }
 * @returns {boolean}
 */
function canViewContract(user, contract, options) {
  options = options || {};
  const contractRole = getContractRole(user);
  const dataScope = getDataScope(contractRole);

  // 涉密合同隔离检查
  if (contract && contract.is_confidential === 1) {
    const hasConfidentialAccess = options.confidentialAccess || false;
    if (!hasConfidentialAccess) {
      // 检查角色是否在涉密访问默认角色中
      if (!CONFIDENTIAL_ACCESS_CONFIG.defaultRoles.includes(contractRole)) {
        return false;
      }
    }
  }

  // 根据数据范围判断
  switch (dataScope) {
    case 'all':
      return true;
    case 'self':
      return contract && String(contract.created_by_id) === String(user.id);
    case 'dept':
      return contract && contract.created_dept === user.dept;
    case 'authorized':
      // 分管领导/总经理：授权范围内全部合同（暂等同于全部可见）
      return true;
    default:
      return false;
  }
}

/**
 * 检查用户是否可以编辑合同的某个字段
 * @param {Object} user - 用户对象
 * @param {Object} contract - 合同对象
 * @param {string} field - 字段名
 * @returns {boolean}
 */
function canEditField(user, contract, field) {
  const contractRole = getContractRole(user);
  const contractStatus = contract ? contract.contract_status : '草稿';
  const formPerm = getFormPermission(contractRole, contractStatus);

  switch (formPerm) {
    case 'full_edit':
      return true;
    case 'edit_and_resubmit':
      // 经办人在驳回状态可编辑
      return true;
    case 'archive_edit':
      // 档案管理员在归档节点可完善归档信息
      // 仅允许归档相关字段
      const archiveFields = ['archive_no', 'archive_location', 'archive_remark', 'retention_period'];
      return archiveFields.includes(field);
    case 'view_and_comment':
    case 'view_and_upload_legal_opinion':
    case 'view_and_fill_finance_opinion':
    case 'view_and_upload_seal_scan':
    case 'view_and_final_opinion':
      // 特定角色在审批中可填写意见字段
      const opinionFields = ['approval_comment', 'legal_opinion', 'finance_opinion', 'seal_scan_file', 'final_opinion'];
      return opinionFields.includes(field);
    case 'view_only':
    case 'locked':
    default:
      return false;
  }
}

/**
 * 检查用户是否可以下载合同原件
 * @param {Object} user - 用户对象
 * @returns {boolean}
 */
function canDownload(user) {
  const contractRole = getContractRole(user);
  return DOWNLOAD_ALLOWED_ROLES.includes(contractRole);
}

/**
 * 检查印章管理员是否可以使用用印登记功能
 * 业务限制：仅当流程全部审批通过时才开放用印按钮
 * @param {Object} user - 用户对象
 * @param {Object} contract - 合同对象
 * @param {Array} approvalSteps - 审批步骤列表
 * @returns {boolean}
 */
function canSeal(user, contract, approvalSteps) {
  const contractRole = getContractRole(user);
  if (contractRole !== '印章管理员') return false;

  // 检查合同状态：仅已生效合同可用印
  if (!contract) return false;
  if (contract.contract_status === '已归档' || contract.contract_status === '已作废') return false;
  if (contract.contract_status === '草稿' || contract.contract_status === '审批中') return false;

  // 检查所有审批步骤是否全部通过
  if (approvalSteps && approvalSteps.length > 0) {
    const allApproved = approvalSteps.every(step => step.status === 'approved' || step.status === '已通过');
    if (!allApproved) return false;
  }

  return true;
}

/**
 * 检查用户是否可以归档合同
 * @param {Object} user - 用户对象
 * @param {Object} contract - 合同对象
 * @returns {boolean}
 */
function canArchive(user, contract) {
  const contractRole = getContractRole(user);
  if (contractRole !== '合同档案管理员' && contractRole !== '系统超级管理员') return false;

  if (!contract) return false;
  // 只有已生效的合同才能归档
  if (contract.contract_status !== '已生效' && contract.contract_status !== '执行中') return false;

  return true;
}

/**
 * 检查用户是否可以直接修改合同（超级管理员禁止直接编辑）
 * @param {Object} user - 用户对象
 * @param {Object} contract - 合同对象
 * @returns {boolean}
 */
function canDirectEdit(user, contract) {
  const contractRole = getContractRole(user);
  // 超级管理员禁止直接修改业务单据
  if (contractRole === '系统超级管理员') return false;
  return canEditField(user, contract, 'contract_name');
}

/**
 * 获取用户在合同列表中的SQL过滤条件
 * @param {Object} user - 用户对象
 * @returns {{ where: string, params: Array }}
 */
function getListFilter(user) {
  const contractRole = getContractRole(user);
  const dataScope = getDataScope(contractRole);

  switch (dataScope) {
    case 'self':
      return { where: ' AND created_by_id = ?', params: [user.id] };
    case 'dept':
      return { where: ' AND created_dept = ?', params: [user.dept] };
    case 'all':
    case 'authorized':
      return { where: '', params: [] };
    default:
      return { where: ' AND created_by_id = ?', params: [user.id] };
  }
}

/**
 * 写入审计日志
 * @param {Object} db - 数据库实例
 * @param {number} userId - 用户ID
 * @param {string} userName - 用户姓名
 * @param {string} userDept - 用户部门
 * @param {number} contractId - 合同ID
 * @param {string} actionType - 操作类型（查看/下载/归档/用印等）
 * @param {string} detail - 操作详情
 */
function logAudit(db, userId, userName, userDept, contractId, actionType, detail) {
  try {
    if (!db) return;
    db.prepare(`
      INSERT INTO t_contract_audit_log (contract_id, user_id, user_name, user_dept, action_type, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `).run(contractId, userId, userName, userDept, actionType, detail || '');
  } catch (e) {
    console.error('[contract_permissions] logAudit error:', e.message);
  }
}

/**
 * 检查用户是否有涉密合同访问权限
 * @param {Object} db - 数据库实例
 * @param {Object} user - 用户对象
 * @returns {Promise<boolean>}
 */
function checkConfidentialAccess(db, user) {
  const contractRole = getContractRole(user);
  // 默认角色直接放行
  if (CONFIDENTIAL_ACCESS_CONFIG.defaultRoles.includes(contractRole)) {
    return true;
  }
  // 检查白名单表
  if (!db) return false;
  try {
    const row = db.prepare('SELECT id FROM t_contract_confidential_access WHERE user_id = ? AND status = 1').get(user.id);
    return !!row;
  } catch (e) {
    return false;
  }
}

/**
 * 获取角色权限规则摘要（供API返回）
 * @param {string} contractRole - 合同角色
 * @returns {Object} 权限规则摘要
 */
function getRoleRuleSummary(contractRole) {
  const rules = PERMISSION_RULES[contractRole];
  if (!rules) return null;
  return {
    role: contractRole,
    dataScope: rules.formDataScope,
    formPermissions: rules.formPermissions,
    allowedActions: rules.allowedActions,
    forbiddenActions: rules.forbiddenActions,
    businessLimits: rules.businessLimits,
    description: rules.description,
    canDownload: DOWNLOAD_ALLOWED_ROLES.includes(contractRole)
  };
}

// ============================================================
// 7. 导出
// ============================================================
module.exports = {
  CONTRACT_ROLES,
  ROLE_MAPPING,
  PERMISSION_RULES,
  UNIVERSAL_CONSTRAINTS,
  DOWNLOAD_ALLOWED_ROLES,
  CONFIDENTIAL_ACCESS_CONFIG,
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
  getRoleRuleSummary
};
