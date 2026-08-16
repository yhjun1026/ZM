const router = require('express').Router();
const ctrl = require('../controllers/permission.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/', asyncHandler(ctrl.list));
router.post('/approvals', asyncHandler(ctrl.apply));
router.put('/approvals/:id', requireAction('can_approve'), asyncHandler(ctrl.approve));

// 新增路由：角色列表和审计日志
router.get('/roles', asyncHandler(ctrl.listRoles));
router.get('/audit-logs', asyncHandler(ctrl.listAuditLogs));

module.exports = router;
