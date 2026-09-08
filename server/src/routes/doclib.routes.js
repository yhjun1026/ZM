/**
 * 制度与知识库路由（迁移自参考项目 routes/company.js 制度中心 + routes/office.js 知识库段）
 * 挂在 /api/doclib 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举/集合类路由（/meta /stats /seed）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/doclib.controller');
const asyncHandler = require('../utils/asyncHandler');

// 元数据与统计
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));

// 制度中心（sys_docs）
router.get('/docs', asyncHandler(ctrl.listDocs));
router.post('/docs', asyncHandler(ctrl.createDoc));
router.get('/docs/:id', asyncHandler(ctrl.docDetail));
router.put('/docs/:id', asyncHandler(ctrl.updateDoc));
router.put('/docs/:id/revoke', asyncHandler(ctrl.revokeDoc));
router.post('/docs/:id/read', asyncHandler(ctrl.readDoc));

// 知识库（doc_items）
router.get('/items', asyncHandler(ctrl.listItems));
router.post('/items', asyncHandler(ctrl.createItem));
router.get('/items/:id', asyncHandler(ctrl.itemDetail));
router.put('/items/:id', asyncHandler(ctrl.updateItem));
router.post('/items/:id/download', asyncHandler(ctrl.downloadItem));

// 内置知识库幂等补种（按 title 去重）
router.post('/seed', asyncHandler(ctrl.seed));

module.exports = router;
