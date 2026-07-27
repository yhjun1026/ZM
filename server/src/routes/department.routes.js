const router = require('express').Router();
const ctrl = require('../controllers/department.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/', asyncHandler(ctrl.list));
router.post('/', requireAction('can_edit'), asyncHandler(ctrl.create));
router.put('/:id', requireAction('can_edit'), asyncHandler(ctrl.update));
router.delete('/:id', requireAction('can_delete'), asyncHandler(ctrl.remove));

module.exports = router;
