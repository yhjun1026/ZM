const router = require('express').Router();
const ctrl = require('../controllers/opportunity.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举需放在 /:id 之前，否则会被详情路由吃掉
router.get('/stages', asyncHandler(ctrl.stages));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id/stage', asyncHandler(ctrl.updateStage));
router.get('/:id/follows', asyncHandler(ctrl.follows));
router.post('/:id/follows', asyncHandler(ctrl.addFollow));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
