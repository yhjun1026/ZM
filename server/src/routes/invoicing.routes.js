const router = require('express').Router();
const ctrl = require('../controllers/invoicing.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举与统计必须放在 /:id 之前
router.get('/meta', asyncHandler(ctrl.meta));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/ap-uninvoiced', asyncHandler(ctrl.apUninvoiced));
router.get('/ar-uninvoiced', asyncHandler(ctrl.arUninvoiced));
router.get('/ar-returnable', asyncHandler(ctrl.arReturnable));
router.get('/tax-summary', asyncHandler(ctrl.taxSummary));
router.get('/aging', asyncHandler(ctrl.aging));

// 进项发票
router.get('/purchase-invoices', asyncHandler(ctrl.purchaseInvoices));
router.post('/purchase-invoices', asyncHandler(ctrl.createPurchaseInvoice));
router.put('/purchase-invoices/:id', asyncHandler(ctrl.updatePurchaseInvoice));
router.post('/purchase-invoices/:id/void', asyncHandler(ctrl.voidPurchaseInvoice));
router.post('/purchase-invoices/:id/deduct', asyncHandler(ctrl.deductPurchaseInvoice));

// 销项发票
router.get('/sale-invoices', asyncHandler(ctrl.saleInvoices));
router.post('/sale-invoices/apply', asyncHandler(ctrl.applySaleInvoice));
router.post('/sale-invoices', asyncHandler(ctrl.createSaleInvoice));
router.post('/sale-invoices/:id/approve', asyncHandler(ctrl.approveSaleInvoice));
router.post('/sale-invoices/:id/register', asyncHandler(ctrl.registerSaleInvoice));
router.post('/sale-invoices/:id/void', asyncHandler(ctrl.voidSaleInvoice));
router.post('/sale-invoices/:id/red', asyncHandler(ctrl.redSaleInvoice));

// 采购退货（红字冲销）
router.get('/purchase-returns/calc', asyncHandler(ctrl.purchaseReturnCalc));
router.get('/purchase-returns', asyncHandler(ctrl.purchaseReturns));
router.post('/purchase-returns', asyncHandler(ctrl.createPurchaseReturn));
router.post('/purchase-returns/:id/approve', asyncHandler(ctrl.approvePurchaseReturn));

// 销售退货（红字冲销）
router.get('/sale-returns', asyncHandler(ctrl.saleReturns));
router.post('/sale-returns', asyncHandler(ctrl.createSaleReturn));
router.post('/sale-returns/:id/approve', asyncHandler(ctrl.approveSaleReturn));

// 应付 / 应收
router.get('/ap-ledgers', asyncHandler(ctrl.apLedgers));
router.post('/ap-ledgers/:id/pay', asyncHandler(ctrl.payAp));
router.get('/ar-ledgers', asyncHandler(ctrl.arLedgers));

module.exports = router;
