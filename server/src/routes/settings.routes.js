const router = require('express').Router();
const ctrl = require('../controllers/settings.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/company-info', asyncHandler(ctrl.getCompanyInfo));
router.put('/company-info', asyncHandler(ctrl.updateCompanyInfo));
router.post('/change-password', asyncHandler(ctrl.changePassword));

module.exports = router;
