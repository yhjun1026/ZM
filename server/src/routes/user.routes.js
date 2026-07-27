const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/', asyncHandler(ctrl.list));
router.post('/', requireAction('can_edit'), asyncHandler(ctrl.create));
router.put('/:id', requireAction('can_edit'), asyncHandler(ctrl.update));
router.delete('/:id', requireAction('can_delete'), asyncHandler(ctrl.remove));
// 改密：靠原密码校验把关，不限角色（与原实现一致）
router.put('/:id/password', asyncHandler(ctrl.changePassword));

module.exports = router;
