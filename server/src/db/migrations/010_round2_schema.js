/* 010_round2_schema - 第二轮迁移：补齐 4 大缺口 + 中缺口所需的业务表
 * 表来源：参考项目 db.js 已有但 009 未补齐的（supplies / supply_apps / vehicle_apps / assets / work_reports 家族）
 *         + 当前项目尚未存在的字段权限 / 字段审计类辅助表
 * 策略：与 009 一样，纯 IF NOT EXISTS，不影响现有表
 */
module.exports = {
  id: '010_round2_schema',

  up(db) {
    const stmts = [
      // ===== 日常办公：用品申领 =====
      `CREATE TABLE IF NOT EXISTS supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,                       -- 办公耗材/IT 设备/印刷品/礼品/其他
  unit TEXT,                           -- 件/盒/包
  stock INTEGER DEFAULT 0,
  warn_qty INTEGER DEFAULT 0,
  status TEXT DEFAULT '在用',           -- 在用/停用
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS supply_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no TEXT NOT NULL UNIQUE,         -- SA+yyyymmdd+序号
  supply_id INTEGER,
  supply_name TEXT,
  qty INTEGER,
  reason TEXT,
  applicant_id INTEGER,
  applicant_name TEXT,
  status TEXT DEFAULT '待审批',         -- 待审批/通过/驳回/已发放
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,

      // ===== 日常办公：车辆申请 =====
      `CREATE TABLE IF NOT EXISTS vehicle_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no TEXT NOT NULL UNIQUE,         -- VA+yyyymmdd+序号
  vehicle_id INTEGER,                  -- 关联 logistics.vehicles
  vehicle_plate TEXT,
  applicant_id INTEGER,
  applicant_name TEXT,
  start_at TEXT,
  end_at TEXT,
  destination TEXT,
  reason TEXT,
  status TEXT DEFAULT '待审批',         -- 待审批/通过/驳回/已出车/已归还
  mileage INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,

      // ===== 日常办公：资产台账（区别于 bizflow 的财务固定资产） =====
      `CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_no TEXT NOT NULL UNIQUE,       -- A+yyyymmdd+序号
  name TEXT NOT NULL,
  category TEXT,                       -- 办公设备/电子设备/家具/其他
  brand TEXT,
  model TEXT,
  serial_no TEXT,
  purchase_date TEXT,
  purchase_amount REAL,
  location TEXT,
  custodian_id INTEGER,                -- 保管人
  custodian_name TEXT,
  dept_id INTEGER,
  dept_name TEXT,
  status TEXT DEFAULT '在用',           -- 在用/闲置/已报废/已调拨
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,

      // ===== 日常办公：工作报告家族 =====
      `CREATE TABLE IF NOT EXISTS work_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_no TEXT NOT NULL UNIQUE,      -- WR+yyyymmdd+序号
  type TEXT DEFAULT '日报',             -- 日报/周报/月报
  period TEXT,                         -- 期间（日报=YYYY-MM-DD，周报=起止）
  title TEXT,
  content TEXT,
  issues TEXT,                         -- 需上级支持/问题
  plan_tomorrow TEXT,                  -- 次日计划
  emp_id INTEGER,
  emp_name TEXT,
  dept_id INTEGER,
  dept_name TEXT,
  template_id INTEGER,                 -- 使用的模板
  status TEXT DEFAULT '待提交',          -- 待提交/已提交/已批阅/已驳回
  submit_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS work_report_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT,                           -- 日报/周报/月报
  fields TEXT,                         -- 字段定义 JSON
  built_in INTEGER DEFAULT 0,
  creator_id INTEGER,
  creator_name TEXT,
  status TEXT DEFAULT '启用',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS work_report_cc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  cc_emp_id INTEGER NOT NULL,
  cc_emp_name TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS work_report_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  reviewer_id INTEGER,
  reviewer_name TEXT,
  action TEXT,                         -- 通过/驳回/指导
  comment TEXT,
  reviewed_at TEXT DEFAULT (datetime('now','localtime'))
);`,

      // ===== 字段级权限 =====
      `CREATE TABLE IF NOT EXISTS field_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,                -- 模块/表名
  field TEXT NOT NULL,                 -- 字段名
  role TEXT NOT NULL,                  -- 角色
  perm TEXT DEFAULT '可见',             -- 可见/脱敏/隐藏
  UNIQUE(module, field, role)
);`,

      // ===== 数据服务：审计 =====
      `CREATE TABLE IF NOT EXISTS datasvc_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  emp_id INTEGER,
  emp_name TEXT,
  params TEXT,
  result_count INTEGER,
  cost_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,

      // ===== 预算（复用已有 budgets/budget_executions；补一个分类表） =====
      `CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id INTEGER,
  remark TEXT
);`,

      // ===== 支付/分成（复用已有 finance_payouts；补一个来源表） =====
      `CREATE TABLE IF NOT EXISTS payout_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                  -- 销售收入/报销退款/佣金
  enabled INTEGER DEFAULT 1
);`,
    ];
    for (const sql of stmts) {
      try { db.exec(sql); } catch (e) { console.error('[010] 失败:', e.message); }
    }
    console.log(`[010] 已补建 ${stmts.length} 张缺口业务表`);
  },

  down() { /* 不可逆 */ }
};
