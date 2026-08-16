const router = require('express').Router();
const ctrl = require('../controllers/partnerCredit.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/stats', asyncHandler(ctrl.stats));
router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));
router.post('/auto-sync', asyncHandler(ctrl.autoSync));

module.exports = router;
