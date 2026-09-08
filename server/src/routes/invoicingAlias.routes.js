// 对齐参考项目 /api/invoicing/* 路径别名 + 参考项目零散端点
const router = require('express').Router();
const ctrl = require('../controllers/bizflow.controller');
const asyncHandler = require('../utils/asyncHandler');

// 库存预警（参考 invoicing.js 的 /stock-warn）
router.get('/stock-warn', asyncHandler(ctrl.lowStock));
// 固定资产台账（参考 invoicing.js 的 /fixed-assets）
router.get('/fixed-assets', asyncHandler(ctrl.assets));

module.exports = router;
