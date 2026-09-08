const router = require('express').Router();
const ctrl = require('../controllers/message.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举/统计类路由必须在 /:id 之前
router.get('/types', asyncHandler(ctrl.types));
router.get('/unread-count', asyncHandler(ctrl.unreadCount));
router.get('/stats', asyncHandler(ctrl.stats));
router.put('/read-all', asyncHandler(ctrl.readAll));
router.post('/read-batch', asyncHandler(ctrl.readBatch));
router.post('/read-by-biz-type', asyncHandler(ctrl.readByBizType));
router.post('/cleanup', asyncHandler(ctrl.cleanup));
router.post('/push', asyncHandler(ctrl.push)); // 供其它模块写消息的推送接口

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.put('/:id/read', asyncHandler(ctrl.markRead));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
