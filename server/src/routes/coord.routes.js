const router = require('express').Router();
const ctrl = require('../controllers/coord.controller');
const asyncHandler = require('../utils/asyncHandler');

// 概览/留痕需在通配路由之前
router.get('/overview', asyncHandler(ctrl.overview));
router.get('/breaks', asyncHandler(ctrl.breaks));
router.get('/actions', asyncHandler(ctrl.actions));

// 一键联动
router.post('/link/bid-win', asyncHandler(ctrl.linkBidWinApi));
router.post('/link/contract-ar', asyncHandler(ctrl.linkContractAr));
router.post('/link/ar-urge', asyncHandler(ctrl.linkArUrge));
router.post('/auto/run', asyncHandler(ctrl.autoRun));

module.exports = router;
