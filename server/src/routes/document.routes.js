const router = require('express').Router();
const ctrl = require('../controllers/document.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

// 公司文件管理路由
router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/', asyncHandler(ctrl.create));
router.post('/:id/submit', asyncHandler(ctrl.submit));
router.post('/:id/approve', requireAction('can_approve'), asyncHandler(ctrl.approve));
router.post('/:id/reject', requireAction('can_approve'), asyncHandler(ctrl.reject));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', requireAction('can_delete'), asyncHandler(ctrl.remove));

module.exports = router;