/**
 * RBAC 权限中间件
 * 基于角色 + 部门的块列表权限模型
 * 
 * 角色体系: 超级管理员 / 总经理 / 副总 / 销售总监 / 部门经理 / 区域经理 / 普通员工 / 人事专员
 * 审批规则: 所有需总经理审批的流程，必须先经副总审批（副总→总经理链）
 */
const { db } = require('./database');

// ===== 模块定义（与导航菜单名称一致） =====
const MODULES = [
  '考勤管理', '工作汇报', '请假管理', '费用报销', '合同管理',
  '采购管理', '项目管理', '出差管理', '客户管理', '销售订单管理',
  '供应商管理', '人事管理', '部门管理', '权限管理', '财务管理',
  '系统设置', '公司公告'
];

// ===== 角色定义（8个角色，已移除"财务专员"） =====
const ROLES = [
  '超级管理员', '总经理', '副总', '销售总监', '部门经理',
  '区域经理', '普通员工', '人事专员'
];

// ===== 权限矩阵 PERM_MATRIX[roleIdx][modIdx]: 0=无, 0.5=部分, 1=完全 =====
const PERM_MATRIX = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],            // 超级管理员 - 全部权限
  [1,1,1,1,1,1,1,1,1,1,1,1,1,0.5,1,1,1],            // 总经理 - 权限管理半权限
  [1,1,1,1,1,1,1,1,1,1,1,0.5,1,0,1,0,0.5],           // 副总 - 协管全局但不创建
  [1,1,1,1,1,1,1,1,1,1,0.5,0.5,0.5,0,0.5,0,0],        // 销售总监 - 专注销售/客户/合同
  [1,1,1,1,1,1,1,1,1,1,0.5,0.5,0.5,0,0.5,0,0.5],       // 部门经理 - 管理本部门
  [1,1,1,1,0.5,0.5,1,1,1,1,0,0,0,0,0.5,0,0],          // 区域经理 - 区域销售/客户
  [1,1,1,1,0,0.5,0.5,1,0.5,0,0,0,0,0,0.5,0,0.5],      // 普通员工 - 基础功能+财务部分
  [1,0.5,0.5,0.5,0,0,0.5,0.5,0,0,0,1,1,0,0.5,0,0],  // 人事专员 - 人事+部门管理
];

// ===== 财务部负责人（部门经理+财务部）模块级完全权限覆盖 =====
const FINANCE_HEAD_FULL_MODULES = [
  '财务管理', '费用报销', '采购管理', '合同管理', '供应商管理',
  '项目管理', '客户管理', '销售订单管理', '公司公告'
];

function getEffectiveLevel(role, dept, moduleName) {
  const roleIdx = ROLES.indexOf(role);
  if (roleIdx === -1) return 0;
  const modIdx = MODULES.indexOf(moduleName);
  if (modIdx === -1) return 0;
  // 财务部部门经理 → 财务负责人: 完全财务权限
  if (role === '部门经理' && dept === '财务部' && FINANCE_HEAD_FULL_MODULES.indexOf(moduleName) !== -1) return 1;
  return PERM_MATRIX[roleIdx][modIdx];
}

// ===== 块列表权限模型 (canAccess) — 已移除"财务专员" =====
const ACTION_BLOCKS = {
  '副总': ['create','createContract','createPurchase','createProject','createCustomer','createSupplier','createSale','createEmployee','createDept','addTeamMember','financeAsset','financeExpense','financeReview','createFinanceRecord','approveProject','approveProjectProgress','createAnnouncement','approveAnnouncement','createHrApplication','approveHrApplication','createFixedAsset','approveFixedAsset','createCustomerApplication','approveCustomerApplication','createSupplierApplication','approveSupplierApplication','approveReport'],
  '销售总监': ['createPurchase','createSupplier','createEmployee','createDept','addTeamMember','financeSalary','financeExpense','financeReview','createFinanceRecord','financeDataEntry','approveProject','approveProjectProgress','createAnnouncement','approveAnnouncement','createHrApplication','approveHrApplication','createFixedAsset','approveFixedAsset','createCustomerApplication','createSupplierApplication','approveReport'],
  '区域经理': ['createEmployee','addTeamMember','createProject','createFinanceRecord','approveProject','approveProjectProgress','createAnnouncement','approveAnnouncement','createHrApplication','approveHrApplication','createFixedAsset','approveFixedAsset','createCustomerApplication','approveCustomerApplication','createSupplierApplication','approveSupplierApplication','approveReport'],
  '普通员工': ['create','createContract','createPurchase','createProject','createCustomer','createSupplier','createSale','createEmployee','createDept','addTeamMember','financeAsset','financeExpense','financeReview','financeSalary','createFinanceRecord','approveProject','approveProjectProgress','createAnnouncement','approveAnnouncement','createHrApplication','approveHrApplication','createFixedAsset','approveFixedAsset','createCustomerApplication','approveCustomerApplication','createSupplierApplication','approveSupplierApplication','approveReport']
};

// 部门级普通员工豁免
const DEPT_EXEMPTS = {
  '行政部': ['createEmployee','createDept','addTeamMember','createAnnouncement','createHrApplication','createContract','createCustomerApplication','createSupplierApplication'],
  '市场部': [],
  '财务部': ['financeAsset','financeExpense','financeSalary','createFinanceRecord','financeDataEntry','createFixedAsset']
};

/**
 * 检查模块访问权限
 */
function hasPermission(role, dept, moduleName) {
  const roleIdx = ROLES.indexOf(role);
  if (roleIdx === -1) return false;
  const modIdx = MODULES.indexOf(moduleName);
  if (modIdx === -1) return false;

  // 部门级普通员工覆盖
  if (role === '普通员工') {
    if (dept === '行政部' && (moduleName === '人事管理' || moduleName === '部门管理' || moduleName === '公司公告')) return true;
    if (dept === '财务部' && moduleName === '财务管理') return true;
    if (dept === '财务部' && moduleName === '采购管理') return true;
    if (dept === '技术部' && moduleName === '采购管理') return true;
    if (dept === '市场部' && moduleName === '采购管理') return true;
    // 合同管理：市场部、销售部、技术部、财务部普通员工可查看
    if (['市场部', '销售部', '技术部', '财务部'].indexOf(dept) !== -1 && moduleName === '合同管理') return true;
  }

  return getEffectiveLevel(role, dept, moduleName) > 0;
}

/**
 * 检查操作权限 (canAccess)
 */
function canAccess(role, dept, action) {
  // 权限分配 — 仅行政部负责人（超级管理员+行政部）可操作
  if (action === 'editPermission') {
    return role === '超级管理员' && dept === '行政部';
  }

  if (role === '超级管理员') return true;
  if (role === '总经理') return true;

  // 公司文件管理特殊处理
  if (action === 'manageDoc') {
    if (role === '普通员工' && dept !== '行政部') return false;
  }

  // 部门编辑权限
  if (action === 'editDept') {
    if (role === '人事专员') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    if (role === '普通员工' && dept === '行政部') return true;
    return false;
  }

  // 项目审批权限 — 仅总经理/超管/副总可审批
  if (action === 'approveProject' || action === 'approveProjectProgress') {
    if (role !== '总经理' && role !== '超级管理员' && role !== '副总') return false;
  }

  // 项目创建权限 — 销售总监/技术部负责人/总经理/超管可创建
  if (action === 'createProject') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '销售总监') return true;
    if (role === '部门经理' && dept === '技术部') return true;
    return false;
  }

  // 合同创建权限 — 仅行政部+超管+总经理
  if (action === 'createContract') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '普通员工' && dept === '行政部') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    return false;
  }

  // 合同审批权限 — 副总/总经理/超管/行政部负责人/财务部负责人/销售总监
  if (action === 'approveContract') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '销售总监') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    if (role === '部门经理' && dept === '财务部') return true;
    return false;
  }

  // 采购创建权限 — 各部门可创建采购
  if (action === 'createPurchase') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '部门经理') return true;
    if (role === '普通员工' && dept === '市场部') return true;
    if (role === '普通员工' && (dept === '财务部' || dept === '技术部')) return true;
    return false;
  }

  // 采购审批权限 — 部门经理/销售总监/财务部负责人/副总/总经理/超管
  if (action === 'approvePurchase') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '部门经理') return true;
    if (role === '销售总监') return true;
    return false;
  }

  // 财务数据录入权限 — 仅财务部人员+总经理+超管
  if (action === 'createFinanceRecord' || action === 'financeDataEntry') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '部门经理' && dept === '财务部') return true;
    if (role === '普通员工' && dept === '财务部') return true;
    return false;
  }

  // 公告创建权限 — 行政部+总经理+超管
  if (action === 'createAnnouncement') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '普通员工' && dept === '行政部') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    return false;
  }

  // 公告审批权限 — 行政部负责人+副总+总经理+超管
  if (action === 'approveAnnouncement') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    return false;
  }

  // 人事审批创建权限 — 行政部+超管+总经理
  if (action === 'createHrApplication') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '普通员工' && dept === '行政部') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    return false;
  }

  // 人事审批权限 — 行政部负责人+副总+总经理+超管
  if (action === 'approveHrApplication') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    return false;
  }

  // 固定资产录入权限 — 财务部+超管+总经理
  if (action === 'createFixedAsset') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '普通员工' && dept === '财务部') return true;
    if (role === '部门经理' && dept === '财务部') return true;
    return false;
  }

  // 固定资产审批权限 — 财务负责人+副总+总经理+超管
  if (action === 'approveFixedAsset') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '部门经理' && dept === '财务部') return true;
    return false;
  }

  // 客户录入审批权限 — 行政部+超管+总经理
  if (action === 'createCustomerApplication') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '普通员工' && dept === '行政部') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    return false;
  }

  // 客户审批权限 — 行政部负责人+销售总监+副总+总经理+超管
  if (action === 'approveCustomerApplication') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    if (role === '销售总监') return true;
    return false;
  }

  // 供应商录入审批权限 — 行政部+超管+总经理
  if (action === 'createSupplierApplication') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '普通员工' && dept === '行政部') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    return false;
  }

  // 供应商审批权限 — 行政部负责人+销售总监+副总+总经理+超管
  if (action === 'approveSupplierApplication') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '部门经理' && dept === '行政部') return true;
    if (role === '销售总监') return true;
    return false;
  }

  // 工作汇报审批权限 — 部门负责人+副总+总经理+超管
  if (action === 'approveReport') {
    if (role === '总经理' || role === '超级管理员') return true;
    if (role === '副总') return true;
    if (role === '部门经理') return true;
    return false;
  }

  // 市场部部门经理特殊处理
  if (role === '部门经理' && dept === '市场部') {
    const marketMgrBlocks = ['addTeamMember','createEmployee','createDept','financeSalary','financeExpense','financeReview','financeAsset','createSale','createAnnouncement','approveAnnouncement','createCustomerApplication','approveCustomerApplication','approveReport'];
    if (marketMgrBlocks.indexOf(action) !== -1) return false;
  }

  // 技术部部门经理特殊处理
  if (role === '部门经理' && dept === '技术部') {
    const techMgrBlocks = ['create','createContract','createPurchase','createProject','createCustomer','createSupplier','createSale','createEmployee','createDept','addTeamMember','financeAsset','financeExpense','financeReview','createAnnouncement','approveAnnouncement','createCustomerApplication','approveCustomerApplication','createSupplierApplication','approveSupplierApplication','approveReport'];
    if (techMgrBlocks.indexOf(action) !== -1) return false;
  }

  // 角色级块列表
  let blocks = ACTION_BLOCKS[role] || [];

  // 普通员工部门级豁免
  if (role === '普通员工') {
    const exempt = DEPT_EXEMPTS[dept] || [];
    blocks = blocks.filter(a => exempt.indexOf(a) === -1);
  }

  if (blocks.indexOf(action) !== -1) return false;
  return true;
}

/**
 * 检查审批权限 (canApprove)
 */
function canApprove(role) {
  if (role === '普通员工') return false;
  return true;
}

/**
 * 检查添加团队成员权限 (canAddTeamMember)
 */
function canAddTeamMember(role, dept) {
  if (role === '超级管理员' || role === '总经理') return true;
  if (role === '副总') return false;
  if (role === '销售总监') return false;
  if (role === '区域经理') return false;
  if (role === '部门经理' && dept === '技术部') return false;
  if (role === '部门经理' && dept === '市场部') return false;
  if (role === '部门经理') return true;
  if (role === '普通员工' && dept === '行政部') return true;
  return false;
}

// ===== Express 中间件 =====

/**
 * 要求指定模块权限
 */
function requireModule(moduleName) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, msg: '请先登录' });
    if (!hasPermission(req.user.role, req.user.dept, moduleName)) {
      return res.status(403).json({ code: 403, msg: '无权访问此模块' });
    }
    next();
  };
}

/**
 * 要求指定操作权限
 */
function requireAction(action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, msg: '请先登录' });
    if (!canAccess(req.user.role, req.user.dept, action)) {
      return res.status(403).json({ code: 403, msg: '无权执行此操作' });
    }
    next();
  };
}

/**
 * 要求审批权限
 */
function requireApprove() {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, msg: '请先登录' });
    if (!canApprove(req.user.role)) {
      return res.status(403).json({ code: 403, msg: '您无审批权限' });
    }
    next();
  };
}

module.exports = {
  MODULES, ROLES, PERM_MATRIX, ACTION_BLOCKS, DEPT_EXEMPTS,
  FINANCE_HEAD_FULL_MODULES, getEffectiveLevel,
  hasPermission, canAccess, canApprove, canAddTeamMember,
  requireModule, requireAction, requireApprove
};
