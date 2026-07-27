const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');
const { securityHeaders, sensitiveFileGuard, xssSanitize } = require('./middleware/security');
const { globalLimiter, loginLimiter } = require('./middleware/rateLimit');
const authMiddleware = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');

// 请求体大小限制
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// HTTP 访问日志（跳过健康检查，避免刷屏）
app.use(
  morgan(':method :url :status :response-time[0]ms', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.path === '/api/health',
  })
);

// CORS：白名单来源回写具体 Origin，与 credentials 兼容
app.use(cors({ origin: config.cors.origins, credentials: true }));

// 安全头 / 敏感文件防护 / XSS 消毒
app.use(securityHeaders);
app.use(sensitiveFileGuard);
app.use(xssSanitize);

// 限速
app.use('/api', globalLimiter);
app.use('/api/login', loginLimiter);

// 认证：除 login/logout/health 外，所有 /api 需 JWT
app.use('/api', (req, res, next) => {
  if (['/login', '/logout', '/health'].includes(req.path)) return next();
  authMiddleware(req, res, next);
});

// 业务路由（纯 API：前端由独立 Vite 工程提供，见 ../web）
app.use('/api', routes);

// 404 + 统一错误处理
app.use(notFound);
app.use(errorHandler);

module.exports = app;
