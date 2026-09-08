/**
 * 员工培训路由（迁移自参考项目 routes/training.js）
 * 挂在 /api/training 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举类路由（/meta /stats）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/training.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.update));

// 审批终审（副总/总经理）
router.post('/:id/approve', asyncHandler(ctrl.approve));
// 培训结果登记（附件快照）
router.post('/:id/result', asyncHandler(ctrl.result));
// 报名 / 签到
router.post('/:id/signup', asyncHandler(ctrl.signup));
router.delete('/:id/signup', asyncHandler(ctrl.cancelSignup));
router.post('/:id/signin', asyncHandler(ctrl.signin));
// 培训评价（employee_evaluations）
router.post('/:id/evaluate', asyncHandler(ctrl.evaluate));

module.exports = router;
