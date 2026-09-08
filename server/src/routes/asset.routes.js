const router = require('express').Router();
const c = require('../controllers/asset.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };
router.get('/', wrap(c.list));
router.post('/', wrap(c.create));
router.put('/:id', wrap(c.update));
module.exports = router;
