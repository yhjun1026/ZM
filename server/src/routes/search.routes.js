const router = require('express').Router();
const ctrl = require('../controllers/search.controller');
const asyncHandler = require('../utils/asyncHandler');

// 检索范围（当前用户权限口径）需在通配路由之前
router.get('/scope', asyncHandler(ctrl.scope));
router.get('/', asyncHandler(ctrl.search));

module.exports = router;
