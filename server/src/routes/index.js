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

module.exports = router;
