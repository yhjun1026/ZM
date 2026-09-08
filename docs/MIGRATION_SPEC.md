# ZM 参考项目迁移规范（所有新模块必须严格遵守）

## 0. 背景

- 参考项目（单体 SPA）：`/Users/yanghongjun/Downloads/ZM/源代码`
  - 后端路由：`routes/*.js`（36 个模块，共约 2 万行）
  - 前端：`public/index.html`（979 KB 单文件 SPA，113 个页面）
  - 数据库：`db.js`（131 张表 DDL）
  - 公共库：`lib.js`（RBAC / 审批链 / 审计 / 模块名与菜单分组）
- 当前项目（目标）：`/Users/yanghongjun/code/ZM`
  - 后端：`server/src/`（Express + better-sqlite3，controller / routes 分层）
  - 前端：`web/src/`（Vite + Vue3 + Element Plus）
- 迁移原则：**以当前项目框架为准**，把参考项目的功能逻辑改造落地，不照搬代码结构。

## 1. 已完成的基建（不要重复做、不要修改）

1. **数据库表已全部建好**：迁移 `server/src/db/migrations/009_ref_schema_full.js` 已补齐参考项目 120 张表
   （`opportunities` / `bids` / `distributors` / `payroll_records` / `kpi_records` / `qualifications` /
   `official_tpl` / `messages` / `seals` / `user_todos` / `warehouse_stock` …）。
   **不要再写 CREATE TABLE**，直接用现有表。建表语句可查 `server/src/db/migrations/009_ref_schema_full.js`
   或参考项目 `db.js`。
2. **路由已在 `server/src/routes/index.js` 注册**（`/dealer`、`/bid`、`/payroll` …）。**不要修改 index.js**。
3. **前端菜单已在 `web/src/config/modules.js` 注册**（含分组、图标、视图懒加载映射）。**不要修改 modules.js**。
4. **响应工具**：`server/src/utils/resp.js`（`ok/bad/notfound/forbidden/buildWhere/pager/makeNo`）。

## 2. 你要创建的文件（每个模块 3 个）

以 `dealer` 模块为例：

| 文件 | 说明 |
|---|---|
| `server/src/controllers/dealer.controller.js` | 业务逻辑 |
| `server/src/routes/dealer.routes.js` | 路由定义 |
| `web/src/views/Dealer.vue` | 前端页面（文件名 = 模块首字母大写，与 modules.js 中的映射一致） |

**后端路由文件必须 `module.exports = router`**，否则 `routes/index.js` 的 require 会失败导致整个服务起不来。

## 3. 后端范式

### controller

```js
/**
 * 模块说明（迁移自参考项目 routes/xxx.js）
 * 数据表：xxx / yyy（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, buildWhere } = require('../utils/resp');

async function list(req, res) {
  const rows = db.prepare('SELECT * FROM xxx ORDER BY id DESC').all();
  return res.json(ok(rows));
}

module.exports = { list };
```

要点：
- 每个函数签名 `async function (req, res)`，用 `res.json(ok(...))` / `res.json(bad('原因'))` 返回。
- 当前用户：`req.userId`（字符串 id，来自 users）、`req.user`（`{id,name,dept,role,status,phone,email}`）、`req.userRole`。
  `req.user.id` 是 TEXT（如 `'28'`），参考项目表里的 `emp_id` 是 INTEGER（employees.id），
  需要 `Number(req.userId)` 转换后再写入。
- 权限：需要按角色限制时用 `if (!['总经理','超级管理员'].includes(req.user.role)) return res.json(forbidden('...'))`。
  当前项目角色是中文（`users.role`，如 `总经理` / `销售员` / `行政部` / `超级管理员`）。
- 数据隔离：销售类数据按 `created_by` / `sales_id` 过滤；找不到记录用 `notfound()`。
- 写操作记得落审计：`require('../utils/audit')`（先读该文件确认签名再用）。
- 所有 SQL 一律用 `?` 占位符，禁止字符串拼接。

### routes

```js
const router = require('express').Router();
const ctrl = require('../controllers/dealer.controller');
const asyncHandler = require('../utils/asyncHandler');

// 枚举类路由（/stats、/types、/options…）必须放在 /:id 之前
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.detail));
router.put('/:id', asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
```

## 4. 前端范式（Vue SFC）

严格照抄 `web/src/views/Opportunity.vue` 的结构与写法（这是标准样板，先读它）：

```
<template>
  <div class="模块名">
    <div class="page-header"> 标题 + 一句话流程/说明 </div>
    <div class="kpi-grid">  统计卡（icon + title + value + sub） </div>
    <div class="tab-toolbar"> 左侧筛选（el-select / el-input / el-date-picker）+ 右侧操作按钮 </div>
    <el-table> 数据表格，最后一列「操作」放按钮，空态用 <template #empty> </el-table>
    <el-dialog> 新增/编辑/详情 弹窗 </el-dialog>
  </div>
</template>
<script setup>
  import { ref, reactive, computed, onMounted } from 'vue';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import { Xxx } from '@element-plus/icons-vue';
  import request from '../api/request';
  // 1) 常量映射（状态→el-tag type、枚举→中文）
  // 2) 响应式数据 rows/stats/loading/filter
  // 3) kpis computed
  // 4) loadStats / loadList
  // 5) onMounted 并行加载
  // 6) 各弹窗的 open/submit
</script>
<style scoped> 复用 Opportunity.vue 的 .kpi-grid / .kpi-card / .tab-toolbar 等样式 </style>
```

要点：
- 直接 `import request from '../api/request'`，用 `request.get('/dealer', { params })`，
  判断 `if (r.code === 200)`（后端 `ok()` 同时返回 `code:200` 和 `success:true`，两种写法都行，统一用 `code`）。
- 不要用未安装的依赖。可用：vue、element-plus、@element-plus/icons-vue、axios（封装在 request）、echarts（Cockpit 用过）。
- 图标只从 `@element-plus/icons-vue` 导入，且必须确认存在（不确定的用通用图标如 `Document` / `List` / `Setting`）。
- 不要引入中文命名变量以外的奇怪写法；日期格式化统一 `.slice(0,16)` 或 `.slice(0,10)`。
- 页面必须能在无数据时优雅显示（空态文案），不能白屏报错。

## 5. 数据/枚举来源

- **枚举不要硬编码**：优先从参考项目源码里读真实取值（如商机阶段、经销商层级、投标状态），
  必要时在后端加一个 `/options` 或 `/meta` 接口返回枚举，前端从接口取。
- **表字段以 009 迁移的 DDL 为准**，不确定就查：
  ```
  cd /Users/yanghongjun/code/ZM/server && ~/.nvm/versions/node/v24.14.0/bin/node -e "
  const db=require('./src/db');
  console.log(db.prepare(\"SELECT sql FROM sqlite_master WHERE name='表名'\").get().sql);
  console.log(db.prepare('PRAGMA table_info(表名)').all().map(c=>c.name).join(','));
  "
  ```
  ⚠️ 必须用 `~/.nvm/versions/node/v24.14.0/bin/node`（better-sqlite3 是按 Node 24 编译的，用 22 会报 NODE_MODULE_VERSION 错误）。

## 6. 质量红线

1. **不要修改这些共享文件**：`server/src/routes/index.js`、`web/src/config/modules.js`、
   `server/src/db/migrations/*`、`server/src/utils/resp.js`。
2. **不要新建数据库表**，用已有的（009 已建 120 张）。
3. 每个模块完成后自查：后端 `node -e "require('./src/routes/xxx.routes.js')"` 不报错；
   前端 Vue 文件语法正确（无未闭合标签、无未定义变量）。
4. 页面要有真实的业务操作（新增/审核/推进/统计），不能只做一个只读列表。
5. 参考项目里该模块有的核心业务规则（状态流转顺序、必填校验、权限约束、金额换算）都要保留，
   在 controller 注释里注明「对齐参考项目 xxx.js」。

## 7. 参考项目源码位置速查

| 你的模块 | 参考项目文件 |
|---|---|
| 商机 opp | `routes/crm.js` 的 `/opps` 段 |
| 经销商 dms / 渠道履约 supply | `routes/dms.js` |
| 招投标 bid / 标书 bidgen | `routes/bid.js`、`routes/bidgen.js` |
| 薪酬 payroll / finpay | `routes/payroll.js`、`routes/finpay.js` |
| 绩效 kpi | `routes/performance.js` |
| 资质 qual | `routes/qual.js` |
| 资料档案 archive | `routes/archive.js` |
| 培训 training | `routes/training.js` |
| 市场 market | `routes/market.js` |
| 售后 service | `routes/crm.js` 的 service 段、`routes/coord.js` |
| 业财一体化 bizflow | `routes/accounting.js` |
| 进销项发票 invoicing | `routes/invoicing.js` |
| 制度/知识库 doclib | `routes/office.js`（doc_items / kb_seed） |
| 公文模板 official-tpl | `routes/office.js` + `official_tpl_seed.js`（第71轮） |
| 印章 seal | `routes/office.js` 的 seal 段 |
| 通讯录 directory | `routes/hr.js` 的 directory 段 |
| 协同 collab（会议/日程/任务/待办） | `routes/collab.js`、`routes/todo.js` |
| 消息 message | `routes/message.js` |
| 搜索 search | `routes/search.js` |
| 审计 audit | `routes/audit.js` |
| 业务协调 coord | `routes/coord.js` |
| 组织架构 org | `routes/auth.js` 的 `/org/*` 段 + `lib.js` |
| 人事扩展 hr-ext | `routes/hr.js` |
| 组织变更 orgchange | `routes/orgchange.js` |
| 经营驾驶舱 ops | `routes/ops.js` |
| 企业微信 qywx | `routes/qywx.js` |
