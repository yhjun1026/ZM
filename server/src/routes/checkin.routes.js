const router = require('express').Router();
const ctrl = require('../controllers/checkin.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.doCheckin));
// 第 10 轮：补齐日常办公缺口 — 考勤设置 / 汇总 / 记录 / 导出
router.get('/settings', asyncHandler(ctrl.getSettings));
router.put('/settings', asyncHandler(ctrl.saveSettings));
router.get('/summary', asyncHandler(ctrl.summary));
router.get('/records', asyncHandler(ctrl.records));
router.get('/export', asyncHandler(ctrl.export));

module.exports = router;
