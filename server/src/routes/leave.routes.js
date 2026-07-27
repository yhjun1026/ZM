const router = require('express').Router();
const ctrl = require('../controllers/leave.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.apply));
router.put('/:id/approve', requireAction('can_approve'), asyncHandler(ctrl.approve));

module.exports = router;
