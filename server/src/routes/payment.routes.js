const router = require('express').Router();
const c = require('../controllers/payment.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };

router.get('/finance/payments', wrap(c.list));
router.post('/finance/payments', wrap(c.create));
router.post('/finance/payments/:id/voucher', wrap(c.uploadVoucher));
router.delete('/finance/payments/:id/voucher', wrap(c.deleteVoucher));

module.exports = router;
