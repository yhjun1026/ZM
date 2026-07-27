const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.put('/read-all', asyncHandler(ctrl.readAll));
router.put('/:id/read', asyncHandler(ctrl.read));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
