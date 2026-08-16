const router = require('express').Router();
const ctrl = require('../controllers/contractRisk.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/risk-scores', asyncHandler(ctrl.getRiskScores));
router.get('/risk-score/:id', asyncHandler(ctrl.getRiskScoreDetail));
router.get('/alerts/stats', asyncHandler(ctrl.getAlertStats));
router.get('/alerts', asyncHandler(ctrl.getAlerts));
router.put('/alerts/:id/handle', asyncHandler(ctrl.handleAlert));
router.post('/refresh', asyncHandler(ctrl.refreshScores));
router.get('/trend', asyncHandler(ctrl.getRiskTrend));
router.get('/distribution', asyncHandler(ctrl.getRiskDistribution));
router.get('/factors', asyncHandler(ctrl.getRiskFactors));

module.exports = router;
