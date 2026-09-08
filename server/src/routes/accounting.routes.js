// 对齐参考项目 /api/accounting/* 路径别名（参考 accounting.js）
const router = require('express').Router();
const ctrl = require('../controllers/bizflow.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/rules', asyncHandler(ctrl.rules));

module.exports = router;
