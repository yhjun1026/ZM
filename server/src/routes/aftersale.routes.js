/**
 * 售后服务路由（迁移自参考项目 crm.js 拜访段 + dms.js 投诉段 + collab.js 任务段）
 */
const router = require('express').Router();
const ctrl = require('../controllers/aftersale.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计路由必须放在 /:id 之前
router.get('/options', asyncHandler(ctrl.options));
router.get('/stats', asyncHandler(ctrl.stats));

// 客户投诉
router.get('/complaints', asyncHandler(ctrl.listComplaints));
router.post('/complaints', asyncHandler(ctrl.createComplaint));
router.put('/complaints/:id', asyncHandler(ctrl.updateComplaint));
router.delete('/complaints/:id', asyncHandler(ctrl.removeComplaint));

// 客户拜访
router.get('/visits', asyncHandler(ctrl.listVisits));
router.post('/visits', asyncHandler(ctrl.createVisit));
router.put('/visits/:id', asyncHandler(ctrl.updateVisit));

// 服务任务
router.get('/tasks', asyncHandler(ctrl.listTasks));
router.post('/tasks', asyncHandler(ctrl.createTask));
router.put('/tasks/:id/progress', asyncHandler(ctrl.updateProgress));
router.delete('/tasks/:id', asyncHandler(ctrl.removeTask));

// 客户联系人（拜访对象下拉）
router.get('/customers/:id/contacts', asyncHandler(ctrl.contacts));

module.exports = router;
