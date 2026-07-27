const router = require('express').Router();
const ctrl = require('../controllers/project.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));
router.put('/:id/approve', requireAction('can_approve'), asyncHandler(ctrl.approve));
router.delete('/:id', requireAction('can_delete'), asyncHandler(ctrl.remove));

module.exports = router;
