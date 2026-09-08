/**
 * 企业微信路由（迁移自参考项目 routes/qywx.js）
 * 挂在 /api/qywx 下（routes/index.js 已注册，勿改 index.js）
 * 注意：枚举类路由（/status /stats /config /oauth-url /binds /push-logs）必须放在具体资源之前
 *
 * ⚠️ 当前环境无企微网络凭据：不提供 /callback 回调（无真实 code 可换），
 *    所有接口均为「配置管理 + 绑定管理 + 推送留痕」，不真实调用企微 API。
 */
const router = require('express').Router();
const ctrl = require('../controllers/qywx.controller');
const asyncHandler = require('../utils/asyncHandler');

router.get('/status', asyncHandler(ctrl.status));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/oauth-url', asyncHandler(ctrl.oauthUrl));

// 配置（管理员；secret 脱敏返回）
router.get('/config', asyncHandler(ctrl.config));
router.post('/config', asyncHandler(ctrl.saveConfig));

// 绑定 / 解绑 / 绑定列表
router.post('/bind', asyncHandler(ctrl.bind));
router.post('/unbind', asyncHandler(ctrl.unbind));
router.get('/binds', asyncHandler(ctrl.binds));

// 消息推送与推送日志
router.post('/send', asyncHandler(ctrl.send));
router.get('/push-logs', asyncHandler(ctrl.pushLogs));

module.exports = router;
