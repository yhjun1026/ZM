/**
 * 资料档案中心路由（迁移自参考项目 routes/archive.js）
 * 挂在 /api/archive 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举/集合类路由（/meta /summary /directory /pendings /files /borrows）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/archive.controller');
const asyncHandler = require('../utils/asyncHandler');

// 元数据与统计
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/summary', asyncHandler(ctrl.summary));
router.get('/directory', asyncHandler(ctrl.directory));

// 厂家档案（审批准入制）
router.get('/factories', asyncHandler(ctrl.listFactories));
router.post('/factories', asyncHandler(ctrl.createFactory));
router.put('/factories/:id', asyncHandler(ctrl.updateFactory));

// 渠道档案（审批准入制）
router.get('/channels', asyncHandler(ctrl.listChannels));
router.post('/channels', asyncHandler(ctrl.createChannel));
router.put('/channels/:id', asyncHandler(ctrl.updateChannel));

// 归档文件登记
router.get('/files', asyncHandler(ctrl.listFiles));
router.post('/files', asyncHandler(ctrl.createFile));
router.delete('/files/:id', asyncHandler(ctrl.removeFile));

// 待归档 / 档案变更单
router.get('/pendings', asyncHandler(ctrl.listPendings));
router.post('/pendings', asyncHandler(ctrl.createPending));
router.post('/pendings/:id/approve', asyncHandler(ctrl.approvePending));

// 资料准入审批（厂家/渠道草稿 → 生效）
router.post('/admissions/approve', asyncHandler(ctrl.approveAdmission));

// 借阅留痕
router.get('/borrows', asyncHandler(ctrl.listBorrows));
router.post('/borrows', asyncHandler(ctrl.borrowFile));
router.post('/borrows/:id/return', asyncHandler(ctrl.returnFile));

// 第42轮补缺：统一录入/变更/草稿/到期/详情
router.get('/drafts', asyncHandler(ctrl.listDrafts));
router.get('/expiring', asyncHandler(ctrl.listExpiring));
router.get('/detail', asyncHandler(ctrl.getDetail));
router.post('/records', asyncHandler(ctrl.createRecord));
router.post('/records/:type/:id/change', asyncHandler(ctrl.submitChange));

module.exports = router;
