const router = require('express').Router();
const ctrl = require('../controllers/tradeFinance.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/dashboard', asyncHandler(ctrl.dashboard));
router.get('/ap', asyncHandler(ctrl.ap));
router.get('/ar', asyncHandler(ctrl.ar));

module.exports = router;
