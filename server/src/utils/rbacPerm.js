/**
 * RBAC 权限基础（适配当前项目中文角色体系 + role_permissions / emp_permissions 表）
 * 参考项目 routes/auth.js 的 RBAC 段：角色权限矩阵 + 员工级覆盖，权限设置归口超级管理员。
 *
 * 生效优先级：员工覆盖(emp_permissions) > 角色矩阵(role_permissions) > 静态矩阵兜底(PERM_MATRIX)
 */
const db = require('../db');

// ===== 模块 key → 中文名（与前端菜单对齐） =====
const MODULE_KEYS = [
  'checkin', 'workreport', 'leave', 'expense', 'contract', 'purchase', 'project',
  'trip', 'customer', 'sales', 'supplier', 'hr', 'dept', 'permission', 'finance',
  'setting', 'announcement', 'report', 'approval', 'daily', 'budget', 'payout',
  'datasvc', 'asset',
];
const MODULE_NAME = {
  checkin: '考勤管理', workreport: '工作报告', leave: '请假管理', expense: '费用报销',
  contract: '合同管理', purchase: '采购管理', project: '项目管理', trip: '出差管理',
  customer: '客户管理', sales: '销售管理', supplier: '供应商管理', hr: '人事管理',
  dept: '部门管理', permission: '权限管理', finance: '财务管理', setting: '系统设置',
  announcement: '公司公告', report: '报表中心', approval: '审批中心', daily: '日常办公',
  budget: '预算管理', payout: '支付分成', datasvc: '数据服务', asset: '资产台账',
};

// ===== 静态权限矩阵兜底：[view, edit, approve] =====
// 顺序与 MODULE_KEYS 对齐；1=允许 0=禁止
const STATIC_RBAC = {
  '超级管理员': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  '总经理':       [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  '副总':         [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  '销售总监':     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  '部门经理':     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  '区域经理':     [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1],
  '普通员工':     [1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0],
  '人事专员':     [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
  '财务专员':     [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0],
  '法务专员':     [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  '印章管理员':   [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  '合同档案管理员': [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
};

// ===== 权限设置归口角色（参考项目 ADM = 行政人事部负责人；当前项目归超级管理员） =====
const PERM_ADMIN_ROLES = ['超级管理员'];

function staticPerm(role, moduleKey) {
  const arr = STATIC_RBAC[role];
  const idx = MODULE_KEYS.indexOf(moduleKey);
  if (!arr || idx < 0) return null;
  const v = arr[idx];
  if (v == null) return null;
  // v 为 1 表示 [1,1,1]；0 表示 [0,0,0]（简化：不区分 view/edit/approve 细分）
  return v ? { can_view: 1, can_edit: 1, can_approve: 1 } : { can_view: 0, can_edit: 0, can_approve: 0 };
}

// 员工生效基线：员工覆盖 > 角色矩阵 > 静态矩阵兜底
function empBasePerm(role, moduleKey, empId) {
  const ov = db.prepare('SELECT can_view,can_edit,can_approve FROM emp_permissions WHERE emp_id=? AND module=?').get(empId, moduleKey);
  if (ov) return ov;
  const rp = db.prepare('SELECT can_view,can_edit,can_approve FROM role_permissions WHERE role=? AND module=?').get(role, moduleKey);
  if (rp) return rp;
  return staticPerm(role, moduleKey);
}

// 返回员工/角色的完整权限映射 { module: [view, edit, approve] }
function getEmpPerms(role, empId) {
  const roleRows = db.prepare('SELECT module, can_view, can_edit, can_approve FROM role_permissions WHERE role=?').all(role);
  const empRows = empId ? db.prepare('SELECT module, can_view, can_edit, can_approve FROM emp_permissions WHERE emp_id=?').all(empId) : [];
  const map = {};
  for (const m of MODULE_KEYS) map[m] = staticPerm(role, m) ? [staticPerm(role, m).can_view, staticPerm(role, m).can_edit, staticPerm(role, m).can_approve] : [0, 0, 0];
  for (const r of roleRows) map[r.module] = [r.can_view, r.can_edit, r.can_approve];
  for (const r of empRows) map[r.module] = [r.can_view, r.can_edit, r.can_approve];
  return map;
}

// 幂等 seed：把静态矩阵写入 role_permissions（供权限编辑器展示/调整）
function seedRolePermissions() {
  const existing = db.prepare('SELECT COUNT(*) n FROM role_permissions').get().n;
  if (existing > 0) return existing;
  let n = 0;
  for (const role of Object.keys(STATIC_RBAC)) {
    for (const m of MODULE_KEYS) {
      const p = staticPerm(role, m);
      if (!p) continue;
      db.prepare('INSERT INTO role_permissions (role, module, can_view, can_edit, can_approve) VALUES (?,?,?,?,?)')
        .run(role, m, p.can_view, p.can_edit, p.can_approve);
      n++;
    }
  }
  return n;
}

module.exports = { MODULE_KEYS, MODULE_NAME, STATIC_RBAC, PERM_ADMIN_ROLES, staticPerm, empBasePerm, getEmpPerms, seedRolePermissions };
