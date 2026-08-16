const router = require('express').Router();
const ctrl = require('../controllers/tradeCustomer.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.get('/stats', asyncHandler(ctrl.stats));
router.post('/applies', asyncHandler(ctrl.createApply));

module.exports = router;
