const router = require('express').Router();
const ctrl = require('../controllers/sales.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

router.get('/records', asyncHandler(ctrl.listRecords));
router.post('/records', asyncHandler(ctrl.addRecord));
router.delete('/records/:id', requireAction('can_delete'), asyncHandler(ctrl.deleteRecord));

module.exports = router;
