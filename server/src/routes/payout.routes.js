const router = require('express').Router();
const c = require('../controllers/payout.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };
router.get('/payouts', wrap(c.listPayouts));
router.get('/sources', wrap(c.listSources));
router.post('/payouts', wrap(c.createPayout));
router.get('/payouts/:id', wrap(c.detail));
module.exports = router;
