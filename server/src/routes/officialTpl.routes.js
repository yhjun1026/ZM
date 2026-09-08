/**
 * 公文书写规范及模板库路由（迁移自参考项目 routes/office.js /doc-templates 段，第71轮）
 * 挂在 /api/official-tpl 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举/集合类路由（/meta /stats /seed）必须放在 /:id 之前
 */
const router = require('express').Router();
const ctrl = require('../controllers/officialTpl.controller');
const asyncHandler = require('../utils/asyncHandler');

// 元数据与统计
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));

// 模板查阅与维护
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

// 套用生成草稿 / 调用留痕（use_count 累加）
router.post('/:id/use', asyncHandler(ctrl.useTpl));
router.post('/:id/copy', asyncHandler(ctrl.copyTpl));

// 内置 30 种规范与模板幂等补种（按 kind+title 判重）
router.post('/seed', asyncHandler(ctrl.seed));

module.exports = router;
