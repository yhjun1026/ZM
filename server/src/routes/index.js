const router = require('express').Router();

// 挂在 /api 根下的端点
router.use('/', require('./auth.routes'));
router.use('/', require('./stats.routes'));
router.use('/', require('./system.routes'));

// 按资源挂载的端点
router.use('/users', require('./user.routes'));
router.use('/departments', require('./department.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/contracts', require('./contract.routes'));
router.use('/projects', require('./project.routes'));
router.use('/leave', require('./leave.routes'));
router.use('/expense', require('./expense.routes'));
router.use('/purchases', require('./purchase.routes'));
router.use('/businessTrips', require('./trip.routes'));
router.use('/checkin', require('./checkin.routes'));
router.use('/reports', require('./report.routes'));
router.use('/permission', require('./permission.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/sales', require('./sales.routes'));
router.use('/suppliers', require('./supplier.routes'));
router.use('/documents', require('./document.routes'));
router.use('/logistics', require('./logistics.routes'));
router.use('/contract-analytics', require('./contractAnalytics.routes'));
router.use('/contract-risk', require('./contractRisk.routes'));
router.use('/contract-template', require('./contractTemplate.routes'));
router.use('/partner-credit', require('./partnerCredit.routes'));
router.use('/announcement', require('./announcement.routes'));
router.use('/att-archive', require('./attArchive.routes'));
router.use('/trade-customer', require('./tradeCustomer.routes'));
router.use('/trade-supplier', require('./tradeSupplier.routes'));
router.use('/trade-archive', require('./tradeArchive.routes'));
router.use('/trade-finance', require('./tradeFinance.routes'));
router.use('/settings', require('./settings.routes'));

module.exports = router;
