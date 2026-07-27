const router = require('express').Router();
const ctrl = require('../controllers/system.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

// 这些端点直接挂在 /api 下
router.get('/search', asyncHandler(ctrl.search));
router.get('/export/:module', asyncHandler(ctrl.exportData));
router.get('/allData', asyncHandler(ctrl.allData));
router.get('/settings', asyncHandler(ctrl.getSettings));
router.put('/settings', requireAction('can_edit'), asyncHandler(ctrl.saveSettings));
router.get('/audit-log', requireAction('can_edit'), asyncHandler(ctrl.auditLogList));
router.get('/health', asyncHandler(ctrl.health));

module.exports = router;
