const router = require('express').Router();
const ctrl = require('../controllers/audit.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举/聚合类路由必须在 /:id 之前
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/modules', asyncHandler(ctrl.modules));
router.get('/actions', asyncHandler(ctrl.actions));
router.get('/logs', asyncHandler(ctrl.logs));

// 审计归档（JSONL + SHA256 存证）
router.get('/archives', asyncHandler(ctrl.archives));
router.get('/archive/preview', asyncHandler(ctrl.archivePreview));
router.post('/archive/run', asyncHandler(ctrl.archiveRun));
router.post('/archive/verify', asyncHandler(ctrl.archiveVerify));

module.exports = router;
