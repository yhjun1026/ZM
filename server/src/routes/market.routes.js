const router = require('express').Router();
const ctrl = require('../controllers/market.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计必须放在 /:id 之前
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/fees', asyncHandler(ctrl.fees));
router.post('/fees', asyncHandler(ctrl.createFee));
router.put('/fees/:id/status', asyncHandler(ctrl.setFeeStatus));
router.get('/fee-stats', asyncHandler(ctrl.feeStats));

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));
router.put('/:id/status', asyncHandler(ctrl.setStatus));
router.post('/:id/finish', asyncHandler(ctrl.finish));

module.exports = router;
