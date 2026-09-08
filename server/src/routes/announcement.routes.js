const router = require('express').Router();
const ctrl = require('../controllers/announcement.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/unread', asyncHandler(ctrl.unread));
router.get('/:id', asyncHandler(ctrl.get));
router.post('/:id/approve', asyncHandler(ctrl.approve));
router.post('/:id/reject', asyncHandler(ctrl.reject));
router.post('/:id/read', asyncHandler(ctrl.markRead));
router.get('/:id/readers', asyncHandler(ctrl.readers));
router.post('/:id/remind-unread', asyncHandler(ctrl.remindUnread));

module.exports = router;
