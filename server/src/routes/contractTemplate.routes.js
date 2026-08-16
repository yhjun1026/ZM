const router = require('express').Router();
const ctrl = require('../controllers/contractTemplate.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.get('/categories', asyncHandler(ctrl.getCategories));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));
router.put('/:id/status', asyncHandler(ctrl.toggleStatus));
router.delete('/:id', asyncHandler(ctrl.remove));
router.get('/approvals/list', asyncHandler(ctrl.getApprovals));
router.post('/approvals/:id/approve', asyncHandler(ctrl.approve));
router.post('/approvals/:id/reject', asyncHandler(ctrl.reject));

module.exports = router;
