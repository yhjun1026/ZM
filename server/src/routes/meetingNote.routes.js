const router = require('express').Router();
const c = require('../controllers/meetingNote.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };

router.get('/meeting-notes', wrap(c.list));
router.post('/meeting-notes', wrap(c.create));

module.exports = router;
