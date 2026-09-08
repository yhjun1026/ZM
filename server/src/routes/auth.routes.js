const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');

router.post('/login', asyncHandler(ctrl.login));
router.post('/logout', asyncHandler(ctrl.logout));
router.get('/verify-token', asyncHandler(ctrl.verifyToken));

// 密码安全
router.put('/password', asyncHandler(ctrl.changePassword));
router.put('/admin/password', asyncHandler(ctrl.adminResetPassword));

// 会话 / 菜单
router.get('/me', asyncHandler(ctrl.me));
router.get('/menu', asyncHandler(ctrl.menu));

// RBAC 权限矩阵（角色级）
router.get('/org/rbac', asyncHandler(ctrl.listRbac));
router.put('/org/rbac/:role/:module', asyncHandler(ctrl.updateRbac));

// 销售区域
router.get('/regions', asyncHandler(ctrl.listRegions));
router.put('/regions/:id/manager', asyncHandler(ctrl.setRegionManager));

// 员工级权限覆盖
router.get('/org/rbac/emps', asyncHandler(ctrl.listRbacEmps));
router.get('/org/rbac/emp/:id', asyncHandler(ctrl.getEmpPerm));
router.put('/org/rbac/emp/:id/:module', asyncHandler(ctrl.setEmpPerm));
router.delete('/org/rbac/emp/:id/:module', asyncHandler(ctrl.clearEmpPerm));

module.exports = router;
