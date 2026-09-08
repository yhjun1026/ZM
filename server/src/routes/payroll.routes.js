/**
 * 薪酬管理路由（迁移自参考项目 routes/payroll.js + routes/finpay.js）
 * 说明：/fin/* 为财务部专属的「财务序列薪酬考核」段（参考项目 finpay 模块），合并进薪酬管理「考核」页签。
 */
const router = require('express').Router();
const ctrl = require('../controllers/payroll.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举/统计类路由必须放在 /:id 之前
router.get('/options', asyncHandler(ctrl.options));
router.get('/stats', asyncHandler(ctrl.stats));

// 薪酬组成方案
router.get('/scheme', asyncHandler(ctrl.getScheme));
router.put('/scheme', asyncHandler(ctrl.putScheme));
router.post('/scheme/apply', asyncHandler(ctrl.applyScheme));

// 薪酬档案
router.get('/profiles', asyncHandler(ctrl.listProfiles));
router.post('/profiles/init', asyncHandler(ctrl.initProfiles));
router.put('/profiles/:empId', asyncHandler(ctrl.saveProfile));
router.delete('/profiles/:empId', asyncHandler(ctrl.removeProfile));

// 月度核算与批次
router.post('/calc', asyncHandler(ctrl.calc));
router.get('/records', asyncHandler(ctrl.listRecords));
router.get('/records/:id', asyncHandler(ctrl.recordDetail));
router.post('/records/:id/publish', asyncHandler(ctrl.publishRecord));
router.delete('/records/:id', asyncHandler(ctrl.removeRecord));

// 工资条与汇总
router.get('/payslips', asyncHandler(ctrl.payslips));
router.get('/summary', asyncHandler(ctrl.summary));
router.get('/mine', asyncHandler(ctrl.mine));

// ===== 财务序列薪酬考核（finpay） =====
router.get('/fin/scheme', asyncHandler(ctrl.finScheme));
router.put('/fin/scheme', asyncHandler(ctrl.finPutScheme));
router.get('/fin/profiles', asyncHandler(ctrl.finProfiles));
router.put('/fin/profiles/:empId', asyncHandler(ctrl.finSaveProfile));
router.get('/fin/summary', asyncHandler(ctrl.finSummary));
router.get('/fin/records', asyncHandler(ctrl.finRecords));
router.post('/fin/calc', asyncHandler(ctrl.finCalc));
router.post('/fin/publish', asyncHandler(ctrl.finPublish));
router.put('/fin/records/:id/assess', asyncHandler(ctrl.finAssess));
router.delete('/fin/records/:id', asyncHandler(ctrl.finRemove));

module.exports = router;
