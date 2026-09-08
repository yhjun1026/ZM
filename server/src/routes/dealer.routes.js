const router = require('express').Router();
const ctrl = require('../controllers/dealer.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计必须放在 /:id 之前，否则会被详情路由吃掉
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/assessments', asyncHandler(ctrl.assessments));
router.post('/assessments', asyncHandler(ctrl.addAssessment));
router.put('/pls/:plId', asyncHandler(ctrl.updatePl));

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));
router.put('/:id/tier', asyncHandler(ctrl.updateTier));
router.put('/:id/admission', asyncHandler(ctrl.updateAdmission));
router.put('/:id/approve', asyncHandler(ctrl.approve));
router.get('/:id/admissions', asyncHandler(ctrl.admissions));
router.post('/:id/admissions', asyncHandler(ctrl.addAdmission));
router.get('/:id/pls', asyncHandler(ctrl.pls));
router.post('/:id/pls', asyncHandler(ctrl.addPl));

module.exports = router;
