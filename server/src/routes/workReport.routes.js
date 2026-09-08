const router = require('express').Router();
const c = require('../controllers/workReport.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };

// 模板
router.get('/templates', wrap(c.listTemplates));
router.post('/templates', wrap(c.createTemplate));
router.put('/templates/:id', wrap(c.updateTemplate));

// 报告
router.get('/', wrap(c.list));
router.post('/', wrap(c.create));
router.get('/:id', wrap(c.detail));
router.put('/:id', wrap(c.update));
router.post('/:id/submit', wrap(c.submit));

// 批阅 / 指导
router.put('/:id/review', wrap(c.review));
router.post('/batch-review', wrap(c.batchReview));
router.post('/:id/guide', wrap(c.guide));
router.get('/:id/guidance', wrap(c.getGuidance));

// 统计
router.get('/stats', wrap(c.stats));
router.get('/dept-summary', wrap(c.deptSummary));
router.get('/issues-top', wrap(c.issuesTop));

// 抄送
router.get('/cc', wrap(c.listCc));
router.put('/cc/:id/read', wrap(c.readCc));

// 流程
router.get('/schedule', wrap(c.getSchedule));
router.get('/pending', wrap(c.getPending));
router.get('/prev', wrap(c.getPrev));
router.get('/export', wrap(c.exportAll));
router.post('/remind', wrap(c.remind));

module.exports = router;
