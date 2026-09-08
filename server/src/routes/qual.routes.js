/**
 * 资质合规路由（迁移自参考项目 routes/qual.js）
 * 挂在 /api/qual 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举类路由（/meta /stats /warnings /renewals /verify/*）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/qual.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/warnings', asyncHandler(ctrl.warnings));
router.get('/renewals', asyncHandler(ctrl.renewals));
router.post('/warnings/push', asyncHandler(ctrl.pushWarnings));

// 主体资质核验
router.get('/verify/pending', asyncHandler(ctrl.verifyPending));
router.post('/verify/preview', asyncHandler(ctrl.verifyPreview));
router.get('/verify', asyncHandler(ctrl.verifyList));
router.post('/verify/:dataType/:id', asyncHandler(ctrl.verifyRun));
router.get('/verify/:id', asyncHandler(ctrl.verifyDetail));

// 资质台账
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.update));
router.post('/:id/renew', asyncHandler(ctrl.renew));
router.post('/:id/approve', asyncHandler(ctrl.approve));

module.exports = router;
