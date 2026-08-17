const path = require('path');

// server/src/config -> server/
const SERVER_DIR = path.resolve(__dirname, '../..');
// server/src/config -> 项目根
const PROJECT_DIR = path.resolve(__dirname, '../../..');

require('dotenv').config({ path: path.join(SERVER_DIR, '.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '8080', 10),
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES || '8h',
  },
  db: {
    path: process.env.DB_PATH || path.join(SERVER_DIR, 'data', 'zhuomeng.db'),
  },
  publicDir: process.env.PUBLIC_DIR || path.join(PROJECT_DIR, 'public'),
  webDist: process.env.WEB_DIST || path.join(PROJECT_DIR, 'web', 'dist'),
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:8080')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  rateLimit: {
    // 开发环境放宽（页面一次并行拉多个接口），生产可用环境变量收紧
    global: parseInt(process.env.RATE_LIMIT_GLOBAL || (process.env.NODE_ENV === 'production' ? '300' : '2000'), 10),
    login: parseInt(process.env.RATE_LIMIT_LOGIN || '5', 10),
  },
};

// 启动校验：JWT_SECRET 必须显式设置
if (!config.jwt.secret) {
  if (config.isProd) {
    console.error('[CONFIG] 生产环境未设置 JWT_SECRET，拒绝启动。请在 .env 中配置 JWT_SECRET。');
    process.exit(1);
  } else {
    config.jwt.secret = 'dev-only-insecure-secret-do-not-use-in-production';
    console.warn('[CONFIG] JWT_SECRET 未设置，使用开发占位密钥（请勿用于生产）。');
  }
}

module.exports = config;
