const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');

router.post('/login', asyncHandler(ctrl.login));
router.post('/logout', asyncHandler(ctrl.logout));
router.get('/verify-token', asyncHandler(ctrl.verifyToken));

module.exports = router;
