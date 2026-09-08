/**
 * 组织架构路由（迁移自参考项目 routes/auth.js 的 /org/* 段 + hr.js 的 org-profile 段）
 * 挂在 /api/org 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举类路由（/meta /stats /tree /depts /employees /profile…）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/org.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/tree', asyncHandler(ctrl.tree));
router.get('/dept-stats', asyncHandler(ctrl.deptStats));
router.get('/employees', asyncHandler(ctrl.employees));

// 部门设置 CRUD
router.get('/depts', asyncHandler(ctrl.depts));
router.post('/depts', asyncHandler(ctrl.createDept));
router.put('/depts/:id', asyncHandler(ctrl.updateDept));
router.delete('/depts/:id', asyncHandler(ctrl.disableDept));

// 单位信息（org_profile）与变更历史
router.get('/profile', asyncHandler(ctrl.profile));
router.put('/profile', asyncHandler(ctrl.updateProfile));
router.get('/profile/history', asyncHandler(ctrl.profileHistory));
router.post('/profile/history/:id/approve', asyncHandler(ctrl.approveProfile));

module.exports = router;
