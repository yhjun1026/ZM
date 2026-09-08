const router = require('express').Router();
const c = require('../controllers/approval.controller');
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { res.status(500).json({ code: 500, success: false, message: e.message }); } };

// 配置
router.get('/types', wrap(c.listTypes));
router.get('/all-types', wrap(c.listAllTypes));
router.get('/flow-charts', wrap(c.getFlowCharts));
router.get('/flows', wrap(c.listFlows));
router.get('/flows/:type', wrap(c.getFlowByType));
router.get('/flow-changes', wrap(c.listFlowChanges));
router.post('/flow-changes/:id/cancel', wrap(c.cancelFlowChange));
router.put('/flows/:type', wrap(c.saveFlow));
router.delete('/flows/:type', wrap(c.deleteFlow));

// 列表
router.get('/', wrap(c.list));
router.get('/todo', wrap(c.listTodo));
router.get('/done', wrap(c.listDone));
router.get('/cc', wrap(c.listCc));

// 发起
router.post('/preview', wrap(c.preview));
router.post('/', wrap(c.create));

// 办理
router.put('/:id/act', wrap(c.act));
router.post('/:id/resync', wrap(c.resync));

// 运维
router.get('/stuck', wrap(c.listStuck));
router.get('/stale', wrap(c.listStale));
router.get('/efficiency', wrap(c.efficiency));
router.get('/health', wrap(c.health));
router.post('/health/fix-status', wrap(c.fixStatus));
router.post('/health/fix-dead-todos', wrap(c.fixDeadTodos));
router.post('/health/purge-quarantine', wrap(c.purgeQuarantine));

// 催办 + 批量
router.post('/batch-remind', wrap(c.batchRemind));
router.post('/:id/remind', wrap(c.remindOne));
router.post('/batch-act', wrap(c.batchAct));
router.get('/followups', wrap(c.followups));

// 流转增强
router.post('/:id/transfer', wrap(c.transfer));
router.post('/:id/addsign', wrap(c.addsign));
router.post('/:id/cc', wrap(c.addCc));
router.post('/:id/withdraw', wrap(c.withdraw));
router.post('/:id/retry', wrap(c.retry));
router.get('/:id/export', wrap(c.exportOne));

// 委托
router.get('/delegations', wrap(c.listDelegations));
router.post('/delegations', wrap(c.createDelegation));
router.delete('/delegations/:id', wrap(c.deleteDelegation));

// 评论
router.get('/comments', wrap(c.listComments));
router.post('/comments', wrap(c.createComment));
router.delete('/comments/:id', wrap(c.deleteComment));

// 收藏
router.get('/favs', wrap(c.listFavs));
router.post('/favs', wrap(c.createFav));
router.delete('/favs/:id', wrap(c.deleteFav));

// 打印
router.post('/print/request', wrap(c.printRequest));
router.get('/print/tokens', wrap(c.listPrintTokens));
router.post('/print/execute', wrap(c.printExecute));

// 统计 / 详情 / 跟踪
router.get('/stats', wrap(c.stats));
router.get('/done2', wrap(c.listDone)); // alias 防冲突
router.get('/:id/trace', wrap(c.trace));
router.get('/:id', wrap(c.detail));

module.exports = router;
