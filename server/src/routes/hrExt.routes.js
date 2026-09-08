/**
 * 人事业务路由（迁移自参考项目 routes/hr.js）
 * 挂在 /api/hr-ext 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举类路由（/meta /dashboard /orgs /staff）必须放在具体资源之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/hrExt.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/meta', asyncHandler(ctrl.meta));
router.get('/dashboard', asyncHandler(ctrl.dashboard));
router.get('/orgs', asyncHandler(ctrl.orgs));
router.get('/staff', asyncHandler(ctrl.staff));

// 1. 入职建档
router.get('/onboards', asyncHandler(ctrl.listOnboards));
router.post('/onboards', asyncHandler(ctrl.createOnboard));
router.post('/onboards/:id/approve', asyncHandler(ctrl.approveOnboard));
router.post('/onboards/:id/activate', asyncHandler(ctrl.activateOnboard));

// 2. 转正评估 / 绩效评价
router.get('/evaluations', asyncHandler(ctrl.listEvaluations));
router.post('/evaluations', asyncHandler(ctrl.createEvaluation));
router.post('/evaluations/:id/approve', asyncHandler(ctrl.approveEvaluation));

// 3. 调岗异动
router.get('/transfers', asyncHandler(ctrl.listTransfers));
router.post('/transfers', asyncHandler(ctrl.createTransfer));
router.post('/transfers/:id/approve', asyncHandler(ctrl.approveTransfer));

// 4. 离职（含交接清单）
router.get('/resignations', asyncHandler(ctrl.listResignations));
router.post('/resignations', asyncHandler(ctrl.createResignation));
router.post('/resignations/:id/approve', asyncHandler(ctrl.approveResignation));
router.put('/resignations/:id/handover', asyncHandler(ctrl.updateHandover));
router.post('/resignations/:id/finish', asyncHandler(ctrl.finishResignation));

// 5. 人事合同
router.get('/contracts', asyncHandler(ctrl.listContracts));
router.post('/contracts', asyncHandler(ctrl.createContract));
router.post('/contracts/:id/approve', asyncHandler(ctrl.approveContract));
router.post('/contracts/:id/archive', asyncHandler(ctrl.archiveContract));

// 6. 招聘三件套
router.get('/recruit/reqs', asyncHandler(ctrl.listReqs));
router.post('/recruit/reqs', asyncHandler(ctrl.createReq));
router.post('/recruit/reqs/:id/approve', asyncHandler(ctrl.approveReq));
router.post('/recruit/reqs/:id/close', asyncHandler(ctrl.closeReq));

router.get('/recruit/candidates', asyncHandler(ctrl.listCandidates));
router.post('/recruit/candidates', asyncHandler(ctrl.createCandidate));
router.put('/recruit/candidates/:id/stage', asyncHandler(ctrl.updateCandidateStage));

router.get('/recruit/offers', asyncHandler(ctrl.listOffers));
router.post('/recruit/offers', asyncHandler(ctrl.createOffer));
router.post('/recruit/offers/:id/approve', asyncHandler(ctrl.approveOffer));

// 7. 员工权限
router.get('/permissions', asyncHandler(ctrl.listPermissions));
router.put('/permissions/:emp_id/:module', asyncHandler(ctrl.setPermission));
router.delete('/permissions/:emp_id/:module', asyncHandler(ctrl.clearPermission));

module.exports = router;
