# 卓盟智办公 - 后端服务

Express + better-sqlite3 分层架构。详见根目录 `README.md`。

## 开发

```bash
npm install
npm run init-db     # 首次：建表 + 种子
npm run dev         # nodemon 热重载 http://localhost:8080
```

默认账号 `ZM001` / `123456`。健康检查 `GET /api/health`。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | nodemon 热重载 |
| `npm start` | 生产启动 `node src/server.js` |
| `npm run init-db` | 建表 + 种子（幂等） |
| `npm run migrate` / `seed` / `migrate:reset` | 迁移控制 |
| `npm test` | jest 冒烟测试（独立测试库，不污染开发数据） |
| `npm run lint` / `format` | 代码规范 |

## 环境变量

复制 `.env.example` 为 `.env` 并按需修改：

| 变量 | 默认 | 说明 |
|------|------|------|
| `NODE_ENV` | development | production 时强制要求 JWT_SECRET |
| `PORT` | 8080 | 监听端口 |
| `JWT_SECRET` | — | 生产必填，开发未设用占位密钥 |
| `JWT_EXPIRES` | 8h | Token 有效期 |
| `DB_PATH` | server/data/zhuomeng.db | SQLite 文件路径 |
| `PUBLIC_DIR` | ../public | 前端静态根 |
| `CORS_ORIGINS` | localhost:8080 | CORS 白名单（逗号分隔） |
| `RATE_LIMIT_GLOBAL` / `RATE_LIMIT_LOGIN` | 60 / 5 | 限速阈值 |

## 结构

```
src/
├── app.js              # express 实例 + 中间件装配（不 listen，便于测试）
├── server.js           # 入口：listen + 优雅关闭 + 密码升级
├── config/index.js     # dotenv + 集中导出 + 启动校验
├── db/
│   ├── index.js        # 连接单例（WAL）+ audit_log 表
│   ├── migrate.js      # 迁移运行器 up/seed/reset/status
│   └── migrations/     # 001_init / 002_trips
├── middleware/         # auth rbac error validate security rateLimit
├── routes/             # 按模块分文件 + index 总装
├── controllers/        # 按模块分文件
├── services/           # approval.service（审批流推进）
└── utils/              # logger response jwt audit kv asyncHandler
```

请求流：`route -> (rbac) -> controller -> service/db`。SQL 仅出现在 controllers/services，统一经 `src/db` 单例；错误经 `asyncHandler` 汇聚到 `middleware/error`。

## API 概览（约 60 个端点，均挂 /api）

认证 `login`/`logout`/`verify-token`/`health`；工作台 `dashboard`/`cockpit`；用户/部门/客户/合同/项目/假期/费用/采购/出差/打卡/汇报/权限/通知 各自 CRUD+审批；`sales`/`finance`/`statistics`；`search`/`export/:module`/`allData`/`settings`/`audit-log`；KV 取值 `customerLevels`/`customerLifecycle`/`checkinRecords`/`teamMembers`/`projectStats`/`reportsList`。

除 `login`/`logout`/`health` 外均需 `Authorization: Bearer <token>`。

## 测试

`npm test` 使用 `tests/test.db` 独立库，覆盖：健康检查、登录、鉴权守卫(401)、全量数据、KV 缺键修复、实时统计、审批流推进、RBAC 拒绝。

## 部署

- Docker：根目录 `docker compose up -d --build`
- PM2：`pm2 start ecosystem.config.js --env production`（单实例 fork，SQLite 单写者）
- Nginx：参考 `../deploy/nginx.conf` 反代 8080
