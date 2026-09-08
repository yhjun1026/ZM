const router = require('express').Router();
const c = require('../controllers/contractArchive.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };

router.get('/contract-archives', wrap(c.list));
router.get('/contract-archives/expiring', wrap(c.expiring));
router.post('/contract-archives', wrap(c.create));
router.put('/contract-archives/:id', wrap(c.update));

module.exports = router;
