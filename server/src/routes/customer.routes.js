const router = require('express').Router();
const ctrl = require('../controllers/customer.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/', asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));
router.post('/:id/followup', asyncHandler(ctrl.followup));
router.delete('/:id', requireAction('can_delete'), asyncHandler(ctrl.remove));

module.exports = router;
