# 卓盟智办公 - 方案 B（前后端分离）

前后端分离架构：**Vite + Vue3 + Element Plus 前端**（`web/`）+ **Express 纯 API 后端**（`server/`），开发期 Vite 代理 `/api`，生产期 nginx 分流。

## 目录结构

```
卓盟智办公-重构/
├── web/                        # 前端：Vite + Vue3 + Element Plus
│   ├── src/
│   │   ├── main.js  App.vue
│   │   ├── config/modules.js   # 18 模块单一数据源（路由+菜单）
│   │   ├── router/             # Vue Router + 登录守卫
│   │   ├── stores/auth.js      # Pinia 鉴权
│   │   ├── api/                # axios + JWT 拦截器 + 各模块 API
│   │   ├── layouts/MainLayout  # 侧栏(18模块) + 顶栏 + router-view
│   │   └── views/              # Login/Dashboard/Customers/Leave/Placeholder
│   ├── vite.config.js          # dev 代理 /api -> :8080
│   ├── Dockerfile  nginx.conf  # 构建产物 + nginx 托管
│   └── package.json
├── server/                     # 后端：Express 纯 API（分层架构）
│   ├── src/{config,db,middleware,routes,controllers,services,utils}
│   ├── tests/  Dockerfile  ecosystem.config.js
│   └── package.json
├── public/                     # 旧裸 SPA（保留备份，不再被服务）
├── deploy/nginx.conf           # 裸机部署 nginx 参考
├── docker-compose.yml          # web + api 双服务
└── .gitignore  .editorconfig
```

## 本地开发启动

### 方式一：一键启动（推荐）

在**根目录**依次执行（首次需要前三步，之后只需 `npm run dev`）：

```bash
npm install            # 首次：安装根工具（concurrently）
npm run install:all    # 首次：安装 server + web 全部依赖
npm run init-db        # 首次：初始化后端数据库
npm run dev            # 一键同时启动前后端
```

`npm run dev` 用 `concurrently` 同时拉起两个服务，日志带前缀区分：

| 前缀 | 服务 | 地址 |
|------|------|------|
| `[api]`（蓝） | Express 纯 API | http://localhost:8080 |
| `[web]`（绿） | Vite 开发服务器 | http://localhost:5173 **← 浏览器开这个** |

`Ctrl+C` 一次性停掉两个服务。前端代码改动 Vite 热更新，后端改动 nodemon 自动重启。

### 方式二：分两个终端（需单独看日志时用）

```bash
# 终端1：后端纯 API
cd server && npm run dev      # http://localhost:8080
# 终端2：前端 Vite（代理 /api 到 8080）
cd web && npm run dev         # http://localhost:5173  <- 浏览器开这个
```

默认账号 `ZM001` / `123456`。Vite 把 `/api/**` 代理到 Express，开发期同源、无需 CORS。

### 根目录脚本一览

| 命令 | 作用 |
|------|------|
| `npm run dev` | 一键启动前后端（开发） |
| `npm run install:all` | 安装根 + server + web 全部依赖 |
| `npm run init-db` | 初始化后端数据库（建表+种子） |
| `npm run build:web` | 构建前端到 `web/dist` |
| `npm test` | 跑后端测试 |
| `npm run lint` | 后端 ESLint |

## 模块迁移状态

已迁移为 Vue 视图（3）：**工作台**（卡片+ECharts）、**客户管理**（el-table+CRUD+跟进）、**假期申请**（申请+审批）。
其余 15 个模块在侧栏显示"待迁"占位，按已迁移模块的模式逐步迁入即可（路由表见 `web/src/config/modules.js`，加一行 + 建视图文件即生效）。

## 部署

### Docker Compose（双服务，推荐）

```bash
cp server/.env.example server/.env   # 编辑 JWT_SECRET 等
docker compose up -d --build         # web(80) + api(8080)
# 访问 http://localhost
```

- `web` 容器：Vite 构建 → nginx 托管 `dist/`，`/api` 反代到 `api` 容器
- `api` 容器：Express 纯 API，数据持久化 `./server/data`

### 裸机（nginx + PM2）

```bash
# 前端构建
cd web && npm install && npm run build      # 产物 web/dist
# 后端
cd ../server && npm install --omit=dev && npm run init-db
pm2 start ecosystem.config.js --env production
# nginx 按 deploy/nginx.conf 配置：dist 直出 + /api 反代 127.0.0.1:8080
```

## 后端脚本（server/）

| 命令 | 作用 |
|------|------|
| `npm run dev` | nodemon 热重载 |
| `npm start` | 生产启动 |
| `npm run init-db` | 建表 + 种子（幂等） |
| `npm run migrate:reset` | 清空重建 |
| `npm test` | jest 冒烟（13 例） |
| `npm run lint` | ESLint |

## 前端脚本（web/）

| 命令 | 作用 |
|------|------|
| `npm run dev` | Vite 开发（5173，代理 /api） |
| `npm run build` | 生产构建到 dist/ |
| `npm run preview` | 预览构建产物 |

## 架构要点

- **前后端代码彻底分离**：`web/` 与 `server/` 互不引用，仅通过 HTTP `/api` 通信
- **后端纯 API**：已移除 `express.static` 与 SPA 回退，只服务 `/api`
- **前端工程化**：Vue Router（真路由，替代原 `currentView` 假路由）、Pinia 状态、Vite 构建、Element Plus 组件、ECharts 图表
- **鉴权**：JWT，前端 localStorage + axios 拦截器，401 自动跳登录
- **部署可分可合**：docker-compose 双容器；或 nginx 直出前端 + PM2 跑后端
