const router = require('express').Router();
const ctrl = require('../controllers/supplier.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

// 供应商管理路由
router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', requireAction('can_delete'), asyncHandler(ctrl.remove));
router.post('/:id/products', asyncHandler(ctrl.addProduct));

module.exports = router;