const router = require('express').Router();
const ctrl = require('../controllers/contractAnalytics.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/overview', asyncHandler(ctrl.overview));
router.get('/expiring', asyncHandler(ctrl.expiring));
router.get('/department-stats', asyncHandler(ctrl.departmentStats));
router.get('/monthly-trend', asyncHandler(ctrl.monthlyTrend));

module.exports = router;
