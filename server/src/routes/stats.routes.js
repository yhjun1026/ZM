const router = require('express').Router();
const ctrl = require('../controllers/stats.controller');
const asyncHandler = require('../utils/asyncHandler');

// 这些端点直接挂在 /api 下
router.get('/dashboard', asyncHandler(ctrl.dashboard));
router.get('/cockpit', asyncHandler(ctrl.cockpit));
router.get('/sales', asyncHandler(ctrl.sales));
router.get('/finance', asyncHandler(ctrl.finance));
router.get('/statistics', asyncHandler(ctrl.statistics));
router.get('/customerLevels', asyncHandler(ctrl.customerLevels));
router.get('/customerLifecycle', asyncHandler(ctrl.customerLifecycle));
router.get('/checkinRecords', asyncHandler(ctrl.checkinRecords));
router.get('/teamMembers', asyncHandler(ctrl.teamMembers));
router.get('/projectStats', asyncHandler(ctrl.projectStats));
router.get('/reportsList', asyncHandler(ctrl.reportsList));

module.exports = router;
