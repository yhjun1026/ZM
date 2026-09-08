/**
 * 内部通讯录路由（迁移自参考项目 routes/hr.js 的 /directory 段）
 * 挂在 /api/directory 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举/统计类路由（/meta /stats）必须放在 /:id 之前
 * 只读为默认，PUT 编制接口在 controller 内做角色校验
 */
const router = require('express').Router();
const ctrl = require('../controllers/directory.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));

router.get('/', asyncHandler(ctrl.list));
router.put('/:id', asyncHandler(ctrl.update));

module.exports = router;
