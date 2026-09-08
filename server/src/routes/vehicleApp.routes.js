const router = require('express').Router();
const c = require('../controllers/vehicleApp.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };
router.post('/apply', wrap(c.apply));
router.get('/', wrap(c.list));
router.put('/:id/approve', wrap(c.approve));
module.exports = router;
