/**
 * 组织变更审批路由（迁移自参考项目 routes/orgchange.js）
 * 挂在 /api/orgchange 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举类路由（/meta /stats /changes/preview）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/orgchange.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));
router.post('/changes/preview', asyncHandler(ctrl.preview));

router.get('/changes', asyncHandler(ctrl.list));
router.post('/changes', asyncHandler(ctrl.create));
router.get('/changes/:id', asyncHandler(ctrl.detail));
router.post('/changes/:id/approve', asyncHandler(ctrl.approve));

module.exports = router;
