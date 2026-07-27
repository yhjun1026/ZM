const router = require('express').Router();
const ctrl = require('../controllers/permission.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/', asyncHandler(ctrl.list));
router.post('/approvals', asyncHandler(ctrl.apply));
router.put('/approvals/:id', requireAction('can_approve'), asyncHandler(ctrl.approve));

module.exports = router;
