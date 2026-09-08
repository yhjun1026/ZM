const router = require('express').Router();
const ctrl = require('../controllers/bizflow.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计类路由必须放在 /:id 之前
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/rules', asyncHandler(ctrl.rules));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/flow', asyncHandler(ctrl.flow));
router.get('/trace', asyncHandler(ctrl.trace));
router.get('/low-stock', asyncHandler(ctrl.lowStock));
router.post('/low-stock/to-pr', asyncHandler(ctrl.lowStockToPr));

// 库存台账与出入库流水
router.get('/stock', asyncHandler(ctrl.stockList));
router.put('/stock/:id/warn', asyncHandler(ctrl.setWarnLine));
router.get('/movements', asyncHandler(ctrl.movements));
router.post('/movements', asyncHandler(ctrl.createMovement));
router.post('/transfer', asyncHandler(ctrl.transfer));

// 库存调整（盘点，审批后生效）
router.get('/adjustments', asyncHandler(ctrl.adjustments));
router.post('/adjustments', asyncHandler(ctrl.createAdjustment));
router.post('/adjustments/:id/approve', asyncHandler(ctrl.approveAdjustment));

// 记账凭证
router.get('/vouchers', asyncHandler(ctrl.vouchers));
router.post('/vouchers', asyncHandler(ctrl.createVoucherManually));
router.get('/vouchers/:id', asyncHandler(ctrl.voucherDetail));
router.post('/vouchers/:id/verify', asyncHandler(ctrl.verifyVoucher));

// 固定资产与折旧
router.get('/assets', asyncHandler(ctrl.assets));
router.post('/assets', asyncHandler(ctrl.createAsset));
router.post('/assets/:id/approve', asyncHandler(ctrl.approveAsset));
router.put('/assets/:id/dep', asyncHandler(ctrl.setDepParams));
router.post('/dep/run', asyncHandler(ctrl.runDepreciation));
router.get('/dep/records', asyncHandler(ctrl.depRecords));

module.exports = router;
