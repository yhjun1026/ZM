const router = require('express').Router();
const ctrl = require('../controllers/attArchive.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.get('/stats', asyncHandler(ctrl.stats));
router.post('/:id/file', asyncHandler(ctrl.file));

module.exports = router;
