const router = require('express').Router();
const ctrl = require('../controllers/tradeArchive.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.get('/stats', asyncHandler(ctrl.stats));

module.exports = router;
