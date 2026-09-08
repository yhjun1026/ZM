/**
 * 第三轮补缺路由：参考项目零散端点（44 端点一次性收口）
 * 挂在 /api 根 + 各模块根路径下
 */
const router = require('express').Router();
const ctrl = require('../controllers/round3.controller');
const asyncHandler = require('../utils/asyncHandler');

/* coord (1) */
router.post('/coord/link/receipt-stock', asyncHandler(ctrl.linkReceiptStock));

/* crm (4) */
router.get('/tier/rule', asyncHandler(ctrl.tierRule));
router.put('/opps/bids/:id/result', asyncHandler(ctrl.oppBidResult));
router.post('/opps/contracts/:id/review', asyncHandler(ctrl.oppContractReview));
router.put('/opps/contracts/:id/accept', asyncHandler(ctrl.oppContractAccept));

/* dms (2) */
router.put('/dms/orders/:id/confirm', asyncHandler(ctrl.dmsOrderConfirm));
router.put('/dms/orders/:id/ship', asyncHandler(ctrl.dmsOrderShip));

/* bid (1) */
router.post('/bid/:id/request-view', asyncHandler(ctrl.bidRequestView));

/* bidgen (6) */
router.post('/bidgen/bid/:bidId/apply-tpl', asyncHandler(ctrl.bidApplyTpl));
router.post('/bidgen/tender/import', asyncHandler(ctrl.bidTenderImport));
router.post('/bidgen/bid/:bidId/import-bidfile', asyncHandler(ctrl.bidImportFile));
router.post('/bidgen/bid/:bidId/sections/:sid/import-word', asyncHandler(ctrl.bidSectionImportWord));
router.post('/bidgen/bid/:bidId/sections/:sid/export-word', asyncHandler(ctrl.bidSectionExportWord));
router.post('/bidgen/bid/:bidId/import-docx', asyncHandler(ctrl.bidImportDocx));

/* contract (5) */
router.put('/contract/hr/:id', asyncHandler(ctrl.contractHrUpdate));
router.post('/contract/hr/:id/submit', asyncHandler(ctrl.contractHrSubmit));
router.post('/contract/hr/:id/file', asyncHandler(ctrl.contractHrFile));
router.post('/contract/hr/:id/status', asyncHandler(ctrl.contractHrStatus));
router.put('/contract/tpl/:id', asyncHandler(ctrl.contractTplUpdate));

/* daily (3) */
router.put('/attendance/settings', asyncHandler(ctrl.attendanceSettings));
router.put('/announcements/:id', asyncHandler(ctrl.announcementUpdate));
router.post('/attendance/checkout', asyncHandler(ctrl.attendanceCheckout));

/* freport (1) */
router.get('/freport/summary', asyncHandler(ctrl.freportSummary));

/* hr (7) */
router.get('/hr/leave/balances', asyncHandler(ctrl.hrLeaveBalances));
router.get('/hr/leave/ledger', asyncHandler(ctrl.hrLeaveLedger));
router.put('/hr/leave/balances/adjust', asyncHandler(ctrl.hrLeaveAdjust));
router.get('/hr/mine', asyncHandler(ctrl.hrMine));
router.get('/hr/dossier/:id', asyncHandler(ctrl.hrDossier));
router.put('/hr/employees/:id/activate', asyncHandler(ctrl.hrActivate));
router.put('/hr/employees/:id/deactivate', asyncHandler(ctrl.hrDeactivate));

/* ops (1) */
router.get('/ops/monthly-report', asyncHandler(ctrl.opsMonthlyReport));

/* payroll (1) */
router.get('/payroll/roles', asyncHandler(ctrl.payrollRoles));

/* performance (1) */
router.post('/performance/generate', asyncHandler(ctrl.perfGenerate));

/* procurement (3) */
router.post('/purchase/requests/:id/withdraw', asyncHandler(ctrl.purchaseWithdraw));
router.put('/purchase/orders/:id', asyncHandler(ctrl.purchaseOrderUpdate));
router.get('/ap-payments', asyncHandler(ctrl.apPayments));

/* qual (1) */
router.post('/qual/expirations/check', asyncHandler(ctrl.qualExpirationsCheck));

/* qywx (1) */
router.get('/qywx/callback', asyncHandler(ctrl.qywxCallback));

/* reports (2) */
router.get('/audit', asyncHandler(ctrl.reportsAudit));
router.get('/reports/export/:name', asyncHandler(ctrl.reportsExport));

module.exports = router;
