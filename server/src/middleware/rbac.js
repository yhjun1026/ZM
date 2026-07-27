const db = require('../db');
const { fail } = require('../utils/response');

/**
 * RBAC：以 roles 表 can_create/can_edit/can_delete/can_approve 标志位为准（精确）。
 * 角色名未收录于 roles 表时，按名称启发式分级兜底（roles 表目前只收 6 个标准角色，
 * 种子用户中存在"销售总监/技术总监/财务经理"等未收录角色，故保留兜底）。
 */

// ===== roles 表标志位缓存（角色很少变，进程级缓存 60s） =====
let roleFlagCache = null;
let roleFlagCacheAt = 0;
function loadRoleFlags() {
  const now = Date.now();
  if (roleFlagCache && now - roleFlagCacheAt < 60000) return roleFlagCache;
  try {
    const rows = db.prepare('SELECT name, can_create, can_edit, can_delete, can_approve FROM roles').all();
    roleFlagCache = {};
    rows.forEach((r) => { roleFlagCache[r.name] = r; });
    roleFlagCacheAt = now;
  } catch {
    roleFlagCache = {};
  }
  return roleFlagCache;
}

// ===== 名称启发式分级（仅用于未收录角色的兜底） =====
function roleRank(name) {
  if (!name) return 0;
  if (name.includes('超级管理员')) return 100;
  if (name.includes('总监')) return 80;
  if (name.includes('区域经理')) return 50;
  if (name.includes('经理') || name.includes('主管')) return 60;
  if (name.includes('专员')) return 40;
  return 10;
}

/** 判断角色是否拥有某操作权限（can_create/can_edit/can_delete/can_approve） */
function hasAction(roleName, flag) {
  const roles = loadRoleFlags();
  const role = roles[roleName];
  if (role) return !!role[flag]; // 精确：以 roles 表标志位为准
  // 兜底：未收录角色按等级推断
  const rank = roleRank(roleName);
  switch (flag) {
    case 'can_delete': return rank >= 80; // 总监及以上
    case 'can_approve': return rank >= 50; // 区域经理及以上
    case 'can_edit': return rank >= 40; // 专员及以上
    case 'can_create': return rank >= 10; // 全员
    default: return false;
  }
}

/** 要求角色具备某操作权限 */
function requireAction(flag) {
  return (req, res, next) => {
    if (hasAction(req.userRole, flag)) return next();
    return res.status(403).json(fail('无权限执行此操作'));
  };
}

/** 要求角色等级 >= min（兜底用，新代码建议用 requireAction） */
function requireMinRank(min) {
  return (req, res, next) => (roleRank(req.userRole) >= min ? next() : res.status(403).json(fail('无权限执行此操作')));
}

/** 要求角色名在指定集合内 */
function requireRole(...names) {
  const set = new Set(names);
  return (req, res, next) => (set.has(req.userRole) ? next() : res.status(403).json(fail('无权限执行此操作')));
}

module.exports = { roleRank, hasAction, requireAction, requireMinRank, requireRole };
