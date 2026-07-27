const express = require('express');
const path = require('path');
const fs = require('fs');
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

// 业务路由
app.use('/api', routes);

// 生产源码部署：前端已构建(web/dist 存在)时，由后端托管静态资源 + SPA 回退
// （一个进程同时提供前端+API；dist 不存在时为纯 API，前端走 Vite 代理）
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(config.webDist, 'index.html'));
  });
}

// 404 + 统一错误处理
app.use(notFound);
app.use(errorHandler);

module.exports = app;
