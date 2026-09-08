/**
 * 经营驾驶舱路由（迁移自参考项目 routes/ops.js）
 * 挂在 /api/ops 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举类路由（/overview /funnel /trends /targets/yearly /customers /kpi）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/ops.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/overview', asyncHandler(ctrl.overview));
router.get('/funnel', asyncHandler(ctrl.funnel));
router.get('/trends', asyncHandler(ctrl.trends));
router.get('/customers', asyncHandler(ctrl.customers));
router.get('/kpi', asyncHandler(ctrl.kpiList));

// 销售目标（公司/区域/个人三级）
router.get('/targets', asyncHandler(ctrl.listTargets));
router.get('/targets/yearly', asyncHandler(ctrl.yearlyTargets));
router.post('/targets', asyncHandler(ctrl.createTarget));
router.delete('/targets/:id', asyncHandler(ctrl.removeTarget));

module.exports = router;
