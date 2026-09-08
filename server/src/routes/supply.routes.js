const router = require('express').Router();
const ctrl = require('../controllers/supply.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计必须放在 /:id 之前
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));

// 明细台账
router.get('/items', asyncHandler(ctrl.items));
router.put('/items/:id', asyncHandler(ctrl.updateItem));

// 供货登记
router.get('/registrations', asyncHandler(ctrl.registrations));
router.post('/registrations', asyncHandler(ctrl.createRegistration));
router.put('/registrations/:id/status', asyncHandler(ctrl.setRegistrationStatus));

// 供货申请
router.get('/applications', asyncHandler(ctrl.applications));
router.post('/applications', asyncHandler(ctrl.createApplication));
router.put('/applications/:id/status', asyncHandler(ctrl.setApplicationStatus));

// DMS 订单（只读）
router.get('/orders', asyncHandler(ctrl.orders));

module.exports = router;
