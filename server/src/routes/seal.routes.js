/**
 * 印章管理路由（迁移自参考项目 routes/collab.js 印章管理段）
 * 挂在 /api/seal 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举/集合类路由（/meta /stats /applications /prints）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/seal.controller');
const asyncHandler = require('../utils/asyncHandler');

// 元数据与台账统计
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));

// 印章登记
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id', asyncHandler(ctrl.update));

// 用印申请（联动用印审批）
router.get('/applications', asyncHandler(ctrl.listApplications));
router.post('/applications', asyncHandler(ctrl.createApplication));
router.put('/applications/:id', asyncHandler(ctrl.updateApplication));

// 用印文件打印/下载留痕（print_requests）
router.get('/prints', asyncHandler(ctrl.listPrints));
router.post('/prints', asyncHandler(ctrl.createPrint));
router.put('/prints/:id', asyncHandler(ctrl.updatePrint));

module.exports = router;
