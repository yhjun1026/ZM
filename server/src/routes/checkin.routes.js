const router = require('express').Router();
const ctrl = require('../controllers/checkin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.doCheckin));

module.exports = router;
