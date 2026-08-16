const router = require('express').Router();
const ctrl = require('../controllers/announcement.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/:id/approve', asyncHandler(ctrl.approve));
router.post('/:id/reject', asyncHandler(ctrl.reject));

module.exports = router;
