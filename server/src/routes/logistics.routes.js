const router = require('express').Router();
const ctrl = require('../controllers/logistics.controller');
const asyncHandler = require('../utils/asyncHandler');
const { requireAction } = require('../middleware/rbac');

// 后勤工单路由
router.get('/items', asyncHandler(ctrl.listItems));
router.get('/items/:id', asyncHandler(ctrl.getItem));
router.post('/items', asyncHandler(ctrl.createItem));
router.put('/items/:id', asyncHandler(ctrl.updateItem));

// 车辆管理路由
router.get('/vehicles', asyncHandler(ctrl.listVehicles));
router.get('/vehicles/:id', asyncHandler(ctrl.getVehicle));
router.post('/vehicles', asyncHandler(ctrl.createVehicle));
router.put('/vehicles/:id', asyncHandler(ctrl.updateVehicle));

module.exports = router;