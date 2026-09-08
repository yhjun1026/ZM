/**
 * 绩效管理路由（迁移自参考项目 routes/performance.js）
 */
const router = require('express').Router();
const ctrl = require('../controllers/kpi.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计路由必须放在 /:id 之前
router.get('/options', asyncHandler(ctrl.options));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/mine', asyncHandler(ctrl.mine));
router.post('/generate', asyncHandler(ctrl.generate));
router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.adjust));
router.post('/:id/veto', asyncHandler(ctrl.veto));

module.exports = router;
