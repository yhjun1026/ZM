/* 009_ref_schema_full - 补齐参考项目业务表（与现有表并存，不改动既有结构）
 * 自动生成：scripts/gen_009.js
 * 策略：
 *   - 仅 CREATE TABLE IF NOT EXISTS 当前项目缺失的参考项目表（120 张）
 *   - 已存在的表一律不动（现有 contracts / users / departments 等保持原样）
 *   - 新模块（商机/招投标/经销商/薪酬/绩效/资质/培训…）统一读写这些新表
 */
module.exports = {
  id: '009_ref_schema_full',

  up(db) {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS announcement_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id INTEGER NOT NULL,
  emp_id INTEGER NOT NULL,
  read_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(announcement_id, emp_id)
);`,
      `CREATE TABLE IF NOT EXISTS ap_ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ap_no TEXT NOT NULL UNIQUE,           -- 应付单号 AP+时间戳
  source_type TEXT,                     -- 采购入库/其他
  source_no TEXT,                       -- 关联单号（RC/PO）
  supplier_id INTEGER,
  supplier_name TEXT,
  total_amount REAL,                    -- 应付总额（万元）
  paid_amount REAL DEFAULT 0,           -- 已付金额（万元）
  due_date TEXT,                        -- 到期日（按账期自动推算）
  status TEXT DEFAULT '未支付',          -- 未支付/部分支付/已支付
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS ap_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ap_id INTEGER NOT NULL,
  ap_no TEXT,
  amount REAL,
  pay_date TEXT,
  method TEXT,
  operator_id INTEGER,
  operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS approval_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no TEXT NOT NULL,               -- 归属人工号
  content TEXT NOT NULL,              -- 常用意见内容
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS approval_favs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,           -- 收藏人 id
  approval_id INTEGER NOT NULL,       -- 审批单 id
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(user_id, approval_id)
);`,
      `CREATE TABLE IF NOT EXISTS approval_flow_cfg (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,               -- 审批类型（与 approvals.type 对应）
  nodes TEXT NOT NULL,                     -- 自定义链节点 JSON：[{"step_name":"...","role":"SD"},...]
  enabled INTEGER DEFAULT 1,               -- 1=启用自定义 0=停用（回退内置）
  remark TEXT,
  updated_by INTEGER,
  updated_by_name TEXT,
  updated_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS approval_flow_change (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                      -- 审批类型
  action TEXT NOT NULL,                    -- 编制/修改/停用/启用/恢复内置
  nodes TEXT,                              -- 目标节点 JSON（编制/修改时必填）
  remark TEXT,
  status TEXT NOT NULL DEFAULT '待审批',   -- 待审批/通过/驳回/已撤回
  approval_id INTEGER,                     -- 关联的「审批流程变更审批」单
  submitted_by INTEGER,
  submitted_by_name TEXT,
  submitted_at TEXT,
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  review_remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS approval_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  step_name TEXT,
  approver_id INTEGER,
  approver_name TEXT,
  action TEXT DEFAULT '待审批',    -- 待审批/通过/驳回/跳过
  comment TEXT,
  acted_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  approval_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,             -- 报价审批/特价审批/合同评审/市场费用审批
  title TEXT,
  ref_id INTEGER,                 -- 关联业务对象
  amount REAL,
  discount REAL,
  applicant_id INTEGER NOT NULL,
  applicant_name TEXT,
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER,
  status TEXT DEFAULT '待审批',    -- 待审批/通过/驳回
  region TEXT,
  remind_count INTEGER DEFAULT 0,  -- 催办次数
  cc_emp_ids TEXT,                 -- 抄送人id列表（逗号分隔）
  created_at TEXT DEFAULT (datetime('now','localtime')),
  finished_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS ar_ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ar_no TEXT NOT NULL UNIQUE,
  contract_no TEXT,
  customer_name TEXT,
  distributor_id INTEGER,
  sales_id INTEGER,
  region TEXT,
  total_amount REAL,
  received_amount REAL DEFAULT 0,
  due_date TEXT,
  status TEXT DEFAULT '未到期',   -- 未到期/逾期/部分回款/已结清
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS archive_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_type TEXT NOT NULL,               -- customer/factory/supplier/channel/distributor
  ref_id INTEGER NOT NULL,               -- 对应档案 id
  file_name TEXT NOT NULL,               -- 原始文件名（含 .pdf）
  file_path TEXT NOT NULL,               -- 服务器相对路径
  file_size INTEGER DEFAULT 0,
  uploader_id INTEGER,
  uploader_name TEXT,
  remark TEXT,
  pending_id INTEGER DEFAULT 0,          -- 第43轮：随档案变更/续期单上传时记录 pending 单 id（0=直接挂档案）
  status TEXT DEFAULT '有效',              -- 第43轮：有效(已入档)/随单待审(变更单审批中)/已作废(驳回清理)
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS archive_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pend_no TEXT NOT NULL UNIQUE,          -- PG+时间戳
  data_type TEXT NOT NULL,               -- customer/factory/supplier/channel/distributor
  ref_id INTEGER NOT NULL,               -- 对应档案表 id
  unit_name TEXT,                        -- 单位名称快照
  change_type TEXT DEFAULT '修改',        -- 修改/续期
  reason TEXT,                           -- 变更事由（必填）
  payload TEXT,                          -- JSON：变更字段 {col:newVal,...}
  old_snapshot TEXT,                     -- JSON：变更前关键字段快照
  expire_date TEXT,                      -- 申请后档案有效期至
  status TEXT DEFAULT '待审批',           -- 待审批/已通过/已驳回
  approval_id INTEGER,
  operator_id INTEGER,
  operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  applied_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS asset_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_no TEXT NOT NULL,                -- 资产编号（暂存，审批通过写入 fixed_assets，与台账同源生成规则）
  name TEXT NOT NULL,
  category TEXT,                        -- 电子设备/办公家具/医疗器械/交通工具/仪器仪表/其他
  brand TEXT, model TEXT, sn TEXT,
  dept_name TEXT,
  custodian_id INTEGER,
  custodian_name TEXT,                  -- 保管人
  location TEXT,
  purchase_date TEXT,
  purchase_price REAL DEFAULT 0,
  applicant_id INTEGER NOT NULL,
  applicant_name TEXT,
  approval_id INTEGER,                  -- 联动审批单id
  status TEXT DEFAULT '审批中',          -- 审批中/通过/驳回
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL,
  emp_name TEXT,
  work_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT DEFAULT '正常',         -- 正常/迟到/早退/缺卡/请假
  remark TEXT,
  photo_in TEXT,                      -- 上班打卡现场照片（uploads/attendance/相对路径）
  photo_out TEXT,                     -- 下班打卡现场照片
  lat TEXT, lng TEXT,                 -- GPS经纬度
  addr TEXT,                          -- 定位地址
  is_field INTEGER DEFAULT 0,         -- 第24轮：外勤打卡标记（1=外勤，免除实时实地范围校验，强制拍照）
  field_reason TEXT,                  -- 外勤事由
  UNIQUE(emp_id, work_date)
);`,
      `CREATE TABLE IF NOT EXISTS attendance_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  work_start TEXT DEFAULT '09:00',   -- 上班时间（迟到判定基准）
  work_end TEXT DEFAULT '18:00',     -- 下班时间（早退判定基准）
  grace INTEGER DEFAULT 0,           -- 迟到宽限分钟（0=不宽限）
  photo_required INTEGER DEFAULT 1,  -- 是否启用拍照打卡（1=必须现场拍照）
  gps_lat TEXT, gps_lng TEXT,        -- 考勤地点中心坐标（实时实地范围圆心）
  gps_range INTEGER DEFAULT 0,       -- 打卡范围半径（米，0=不限制范围）
  range_addr TEXT,                   -- 考勤地点名称（如：公司总部）
  allow_field INTEGER DEFAULT 1,     -- 第24轮：是否允许外勤打卡（1=允许，外勤免除范围校验但强制拍照+事由）
  updated_by TEXT,
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS audit_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT UNIQUE,
  from_date TEXT, to_date TEXT,
  rows INTEGER DEFAULT 0,
  size_bytes INTEGER DEFAULT 0,
  sha256 TEXT,
  archived_by TEXT, archived_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no TEXT, emp_name TEXT, role TEXT,
  module TEXT,
  action TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS bid_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_id INTEGER NOT NULL,               -- 关联投标项目
  doc_no TEXT NOT NULL UNIQUE,           -- 标书任务编号 BD+时间戳
  doc_type TEXT NOT NULL,                -- 商务标/技术标/报价标/资质标/服务承诺
  owner_id INTEGER,                      -- 编制负责人（商务部/CAE）
  owner_name TEXT,
  due_date TEXT,                         -- 完成截止
  status TEXT DEFAULT '待启动',           -- 待启动/编写中/内部评审/已定稿
  progress INTEGER DEFAULT 0,            -- 进度0-100
  remark TEXT,
  updated_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS bid_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_id INTEGER NOT NULL,               -- 关联投标项目
  doc_id INTEGER,                        -- 关联标书制作任务（bid_docs，可空=整体标书）
  file_no TEXT NOT NULL UNIQUE,          -- BF+时间戳
  file_name TEXT NOT NULL,               -- 标书文件名
  doc_type TEXT,                         -- 整体标书/商务标/技术标/报价标/资质标/服务承诺
  version INTEGER DEFAULT 1,             -- 整改重传版本号
  content TEXT,                          -- 标书正文（在线查看内容）
  status TEXT DEFAULT '待审阅',           -- 待审阅/已通过/需整改
  review_comment TEXT,                   -- 整改意见反馈
  reviewer_id INTEGER, reviewer_name TEXT, reviewed_at TEXT,
  uploaded_id INTEGER, uploaded_name TEXT, uploaded_at TEXT,
  approval_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS bid_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,                  -- 货物/工程/服务
  topic TEXT,                              -- 要点主题
  title TEXT NOT NULL,
  content TEXT NOT NULL,                   -- 内容（正文模板/要点）
  tags TEXT,                               -- 标签（逗号分隔）
  builtin INTEGER DEFAULT 0,               -- 系统预置（可改不可删? 可覆盖）
  created_by INTEGER, created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS bid_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_id INTEGER NOT NULL,               -- 投标项目
  file_id INTEGER,                       -- 可选关联标书文件
  reviewer_id INTEGER, reviewer_name TEXT, reviewer_role TEXT,
  comment TEXT NOT NULL,                 -- 审查意见
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS bid_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_id INTEGER NOT NULL,
  parent_id INTEGER DEFAULT 0,             -- 0=顶级章节
  seq INTEGER DEFAULT 1,
  section_no TEXT,                         -- 如 6.1
  title TEXT NOT NULL,
  content TEXT DEFAULT '',                 -- 正文（在线编辑）
  sec_type TEXT DEFAULT '商务',            -- 商务/技术/报价/资格/售后实施/其他
  ref_knowledge INTEGER,                   -- 引用知识库条目
  updated_by INTEGER, updated_by_name TEXT, updated_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS bid_view_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_id INTEGER NOT NULL,
  emp_id INTEGER NOT NULL, emp_name TEXT,
  reason TEXT,
  approval_id INTEGER,
  active INTEGER DEFAULT 0,              -- 0=审批在途 1=审批通过已生效
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bid_no TEXT NOT NULL UNIQUE,
  opp_id INTEGER NOT NULL,
  amount REAL,
  bid_date TEXT,
  result TEXT DEFAULT '待开标',    -- 待开标/中标/未中标
  remark TEXT
);`,
      `CREATE TABLE IF NOT EXISTS budget_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_id INTEGER,                    -- 关联预算行
  year INTEGER, quarter INTEGER, month INTEGER,
  category TEXT,
  amount REAL,                          -- 本次执行金额（万元）
  source_type TEXT,                     -- 采购订单/市场费用/工资/固定开支/客情/产品开发
  source_no TEXT,                       -- 关联单号
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,                -- 预算年度
  quarter INTEGER DEFAULT 0,            -- 0=全年汇总 1-4=季度
  month INTEGER DEFAULT 0,              -- 0=年度/整季 1-12=月份
  category TEXT NOT NULL,               -- 采购/固定开支/工资/市场开发/客情维护/产品开发
  amount REAL NOT NULL,                 -- 预算金额（万元）
  actual REAL DEFAULT 0,                -- 实际执行金额（万元，业务联动）
  note TEXT,                            -- 编制说明
  approval_id INTEGER,                  -- 联动预算审批单
  approval_no TEXT,
  status TEXT DEFAULT '草稿',            -- 草稿/生效/已驳回
  created_by INTEGER,
  created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS cardfix_reqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cf_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL, emp_name TEXT, dept_name TEXT,
  work_date TEXT, fix_type TEXT DEFAULT '上班补卡',   -- 上班补卡/下班补卡
  expect_time TEXT, reason TEXT,
  approval_id INTEGER,
  status TEXT DEFAULT '待审批',          -- 待审批/已通过/驳回/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime')),
  applied_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,                  -- 渠道编号 CHxxx（录入后自动生成）
  name TEXT NOT NULL,                -- 渠道名称
  type TEXT,                         -- 类型：省级代理/区域代理/分销商/线上渠道/其他
  region TEXT,                       -- 覆盖区域
  product_spec TEXT,                 -- 产品规格（代理/分销的产品，可多行）
  contact_name TEXT,                 -- 联系人
  contact_phone TEXT,                -- 联系电话
  address TEXT,                      -- 地址
  status TEXT DEFAULT '有效',         -- 有效/停用
  created_by INTEGER,
  created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distributor_id INTEGER NOT NULL,
  complainant TEXT,
  region TEXT,                    -- 窜货发生地
  product TEXT,
  description TEXT,
  status TEXT DEFAULT '待处理',   -- 待处理/处理中/已处理
  penalty TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  title TEXT,                     -- 职务
  dept TEXT,                      -- 科室
  role_type TEXT,                 -- 角色：决策人/使用者/采购/影响者/技术把关/财务
  influence TEXT DEFAULT 'C',     -- 影响力 A/B/C/D
  is_key INTEGER DEFAULT 0,       -- 关键决策人
  phone TEXT,
  email TEXT,
  wechat TEXT,
  birthday TEXT,
  remark TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS contract_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_no TEXT NOT NULL UNIQUE,
  contract_no TEXT,                   -- 关联销售合同号
  contract_name TEXT NOT NULL,
  customer_name TEXT,
  amount REAL DEFAULT 0,
  sign_date TEXT,
  expire_date TEXT,                   -- 到期日（预警依据）
  status TEXT DEFAULT '履行中',        -- 履行中/即将到期/已到期/已归档/已终止
  approval_id INTEGER,                -- 关联评审审批id
  owner_dept TEXT,
  owner_name TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS contract_mgmt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cm_no TEXT UNIQUE NOT NULL,              -- 合同编号 CM+时间戳+随机
  title TEXT NOT NULL,                     -- 合同名称
  category TEXT NOT NULL,                  -- 合同类别：销售合同/采购合同/渠道经销合同/市场推广合同/服务售后合同/技术研发合同/其他合同
  party_a TEXT DEFAULT '四川卓盟科技有限公司', -- 我方主体
  party_b TEXT NOT NULL,                   -- 相对方（对方单位）
  party_b_type TEXT,                       -- 相对方类型：客户/供应商/经销商/厂家/渠道商/其他
  opp_id INTEGER,                          -- 可关联商机
  region TEXT,                             -- 大区/归属（销售合同按客户区域）
  amount REAL DEFAULT 0,                   -- 合同金额（万元）
  sign_date TEXT,                          -- 拟签订日期
  start_date TEXT, end_date TEXT,          -- 合同期限
  payment_terms TEXT,                      -- 付款方式/条件
  content TEXT,                            -- 合同主要内容（在线起草/条款）
  terms TEXT,                              -- 特殊条款/违约责任
  drafter_id INTEGER, drafter_name TEXT,   -- 起草人（商务部）
  status TEXT DEFAULT '草稿',              -- 草稿/审批中/已通过/已驳回/履行中/已归档/已废止
  approval_id INTEGER,                     -- 当前/最近一次审批单
  version INTEGER DEFAULT 1,               -- 版本（驳回修改重提 +1）
  opinion TEXT, opinion_by TEXT, opinion_at TEXT,   -- 审批人修改意见（驳回时写入）
  reply TEXT, reply_at TEXT,               -- 起草人对意见的回复/修订说明
  file_path TEXT,                          -- 合同正文附件（PDF/Word）
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS coord_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule TEXT,                 -- 联动规则编码
  rule_name TEXT,            -- 规则名称（中文）
  src_module TEXT,           -- 来源模块
  dst_module TEXT,           -- 目标模块
  src_no TEXT,               -- 来源单据号
  dst_no TEXT,               -- 目标单据号
  result TEXT,               -- 执行结果描述
  auto INTEGER DEFAULT 0,    -- 1=自动联动(定时/跑批) 0=人工触发
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS customer_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  visit_date TEXT NOT NULL,
  visitor_id INTEGER,             -- 拜访人（销售/CAE等）
  visit_type TEXT DEFAULT '常规拜访', -- 初次拜访/常规拜访/技术交流/商务谈判/回访/售后巡检/学术活动
  contact_id INTEGER,             -- 拜访对象(联系人)
  purpose TEXT,                   -- 拜访目的
  content TEXT,                   -- 沟通内容
  result TEXT,                    -- 拜访结果/结论
  next_plan TEXT,                 -- 下一步计划
  cost REAL DEFAULT 0,            -- 差旅费用(元)
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS datasvc_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_no TEXT,                   -- 调用人工号
  caller_name TEXT,
  caller_role TEXT,
  api_name TEXT,                    -- 接口名（如 get_customer_list）
  filters TEXT,                     -- 行权限过滤条件 JSON
  record_count INTEGER DEFAULT 0,   -- 返回行数
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS delegations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_emp_id INTEGER NOT NULL,
  from_emp_name TEXT,
  to_emp_id INTEGER NOT NULL,
  to_emp_name TEXT,
  start_date TEXT,
  end_date TEXT,
  scope TEXT DEFAULT '全部',           -- 全部/仅审批
  status TEXT DEFAULT '生效',          -- 生效/已停用
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS distributor_admissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distributor_id INTEGER NOT NULL,
  item TEXT,                      -- 证照核验/质量体系/资金实力/渠道能力/合规审查
  score REAL, conclusion TEXT,
  reviewer_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS distributor_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distributor_id INTEGER NOT NULL,
  period TEXT NOT NULL,           -- 2026Q3 / 2026年度
  sales_amount REAL DEFAULT 0,
  task_rate REAL DEFAULT 0,       -- 任务达成率%
  credit_score REAL DEFAULT 0,    -- 回款信用
  channel_score REAL DEFAULT 0,   -- 渠道秩序
  total_score REAL DEFAULT 0,
  grade TEXT,                     -- 优秀/良好/合格/不合格
  suggestion TEXT,                -- 维持/升级/降级/淘汰
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS distributor_pls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distributor_id INTEGER NOT NULL,
  product_line TEXT NOT NULL,
  auth_from TEXT, auth_to TEXT,
  status TEXT DEFAULT '授权中',
  UNIQUE(distributor_id, product_line)
);`,
      `CREATE TABLE IF NOT EXISTS distributors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier TEXT DEFAULT '观察',        -- 核心/普通/观察
  region TEXT,
  contact_name TEXT, contact_phone TEXT,
  license_no TEXT,                -- 医疗器械经营许可证
  credit_limit REAL DEFAULT 0,    -- 信用额度（万元）
  credit_used REAL DEFAULT 0,     -- 已用额度
  admission_status TEXT DEFAULT '准入评审中', -- 准入评审中/合格/暂停合作/淘汰
  status TEXT DEFAULT '启用',
  identity TEXT DEFAULT '下游经销商',  -- 下游经销商/省级代理/地市级代理/区域代理/直销终端
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS dms_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  distributor_id INTEGER NOT NULL,
  product_line TEXT,
  product TEXT,
  qty REAL,
  amount REAL,
  status TEXT DEFAULT '待确认',   -- 待确认/已确认/已发货/已完成/已拒绝(超信用)
  sales_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS doc_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,             -- 制度SOP/产品资料/培训材料/业务模板/质量文档
  folder TEXT,                        -- 目录路径
  version TEXT DEFAULT 'V1.0',
  tags TEXT,                          -- 标签（逗号分隔，全文检索用）
  keywords TEXT,                      -- 关键词
  content TEXT,                       -- 正文/摘要
  file_name TEXT,
  file_size INTEGER DEFAULT 0,
  secret_level TEXT DEFAULT '内部',    -- 内部/秘密/涉密
  uploader_id INTEGER,
  uploader_name TEXT,
  download_count INTEGER DEFAULT 0,
  status TEXT DEFAULT '启用',          -- 启用/停用/归档
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS doc_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  change_note TEXT,
  content TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS emp_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL,
  module TEXT NOT NULL,
  can_view INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_approve INTEGER DEFAULT 0,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(emp_id, module)
);`,
      `CREATE TABLE IF NOT EXISTS employee_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eva_no TEXT NOT NULL UNIQUE,          -- 评价单号 EVA+时间戳
  emp_id INTEGER NOT NULL,              -- 被评价员工
  emp_name TEXT,
  eval_type TEXT NOT NULL,              -- 试用期转正/半年度绩效/年度绩效/专项评价
  score REAL,                           -- 评分（0-100）
  comment TEXT,                         -- 评价意见
  suggestion TEXT,                      -- 建议与改进方向
  operator_id INTEGER,                  -- 发起人
  operator_name TEXT,
  approval_id INTEGER,                  -- 联动审批单
  status TEXT DEFAULT '待审批',          -- 待审批/通过/驳回
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS employee_onboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onb_no TEXT NOT NULL UNIQUE,          -- 入职登记单号 ONB+时间戳
  name TEXT NOT NULL,                   -- 姓名
  gender TEXT,                          -- 性别
  phone TEXT,                           -- 手机号
  email TEXT,                           -- 邮箱
  title TEXT,                           -- 拟任职位
  role TEXT NOT NULL,                   -- 拟分配角色（RBAC角色）
  org_id INTEGER,                       -- 所属部门
  dept_name TEXT,                       -- 部门名称（冗余）
  region TEXT,                          -- 所属大区（销售线）
  hire_date TEXT,                       -- 拟入职日期
  salary REAL,                          -- 拟定薪资
  remark TEXT,                          -- 备注
  operator_id INTEGER,                  -- 登记人（行政人事）
  operator_name TEXT,
  approval_id INTEGER,                  -- 联动审批单
  emp_id INTEGER,                       -- 审批通过后写入的员工id
  status TEXT DEFAULT '待审批',          -- 待审批/通过/驳回
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  title TEXT,
  role TEXT NOT NULL,
    -- GM总经理/VP副总/SD销售总监/RM区域负责人/SALES销售员/CHAN渠道经理/CAE应用工程师/COMM商务主管
    -- FIN财务负责人/FIN2财务专员/MKT市场部经理/DIS经销商
    -- ADM行政人事部经理/HR2人事专员/LEG法务/QA质量注册/RD研发/PUR供应链采购/SVC售后服务/IT信息管理/KAM大客户经理
  org_id INTEGER,
  branch_id INTEGER,              -- 所属分公司（总部人员为空）
  product_line TEXT,              -- 所属产品线
  report1_id INTEGER,             -- 实线汇报上级
  report2_id INTEGER,             -- 虚线汇报上级（矩阵）
  region TEXT,
  phone TEXT,
  hire_date TEXT,                 -- 入职日期
  email TEXT,
  wechat TEXT,
  degree TEXT,                    -- 学历
  address TEXT,
  status TEXT DEFAULT '在职',
  is_distributor INTEGER DEFAULT 0,
  distributor_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS expense_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL,
  emp_name TEXT,
  dept_name TEXT,
  expense_type TEXT NOT NULL,          -- 差旅费/交通费/招待费/办公费/通讯费/其他
  amount REAL NOT NULL,                -- 报销金额（元）
  expense_date TEXT,                   -- 费用发生日期
  reason TEXT,                         -- 费用事由
  invoice_no TEXT,                     -- 发票号
  approval_id INTEGER,                 -- 联动审批单id
  status TEXT DEFAULT '审批中',         -- 审批中/通过/驳回/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS factories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,                  -- 厂家编号 Fxxx（录入后自动生成）
  name TEXT NOT NULL,                -- 厂家名称
  type TEXT,                         -- 类型：设备厂家/耗材厂家/试剂厂家/服务商/其他
  category TEXT,                     -- 主营品类
  product_spec TEXT,                 -- 产品规格（型号/规格/性能参数，可多行）
  contact_name TEXT,                 -- 联系人
  contact_phone TEXT,                -- 联系电话
  license_no TEXT,                   -- 营业执照号
  address TEXT,                      -- 地址
  credit_grade TEXT DEFAULT '良',     -- 信用等级：优/良/一般
  identity TEXT DEFAULT '品牌厂家',   -- 品牌厂家/OEM厂家/代工厂/授权合作厂/其他
  status TEXT DEFAULT '有效',         -- 有效/停用
  created_by INTEGER,
  created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS field_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,             -- 数据域：asset/procurement/customer...
  field_name TEXT NOT NULL,         -- 敏感字段名（表列名）
  field_label TEXT,                 -- 中文名（提示用）
  visible_roles TEXT NOT NULL,      -- 可见角色，逗号分隔；* = 全部可见
  updated_at TEXT,
  UNIQUE(module, field_name)
);`,
      `CREATE TABLE IF NOT EXISTS finance_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pay_no TEXT NOT NULL UNIQUE,           -- FP+时间戳
  pay_type TEXT NOT NULL,                -- 员工报销付款/采购付款/市场推广费用/工资薪酬/税费/固定开支/其他支出
  source_table TEXT,                     -- 来源表：expense_reports/purchase_orders/market_activities（自动抓取）
  source_id INTEGER,
  source_no TEXT,                        -- 关联单号（报销单/采购订单/活动编号）
  amount REAL NOT NULL,                  -- 支出金额（万元）
  payee TEXT,                            -- 收款方
  pay_date TEXT,
  method TEXT DEFAULT '银行转账',
  voucher_path TEXT,                     -- 转账凭证（手动上传，图片/PDF）
  attachments_json TEXT,                 -- 自动抓取附件快照 [{name,type,url|content}]
  operator_id INTEGER, operator_name TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS finance_vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_no TEXT NOT NULL UNIQUE,         -- VZ+日期+序号
  period TEXT,                             -- YYYY-MM
  biz_date TEXT,
  source_type TEXT NOT NULL,               -- 采购入库/应付付款/销售发货/合同验收/回款/支出
  source_table TEXT, source_id INTEGER, source_no TEXT,
  summary TEXT,
  debit_total REAL DEFAULT 0, credit_total REAL DEFAULT 0,
  status TEXT DEFAULT '待审核',             -- 待审核/已审核
  maker_id INTEGER, maker_name TEXT,
  auditor_id INTEGER, auditor_name TEXT, audited_at TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS fixed_dep_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  asset_no TEXT, asset_name TEXT,
  period TEXT NOT NULL,                    -- YYYY-MM 计提期间
  dep_amount REAL DEFAULT 0,               -- 本月折旧（万元，入账口径）
  acc_dep REAL DEFAULT 0,                  -- 计提后累计折旧（万元）
  net_value REAL DEFAULT 0,                -- 计提后净值（万元）
  status TEXT DEFAULT '待审核',             -- 待审核/已审核（联动凭证审核）
  voucher_id INTEGER,
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(asset_id, period)
);`,
      `CREATE TABLE IF NOT EXISTS hr_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hc_no TEXT UNIQUE NOT NULL,              -- 人事合同编号 HRL+时间戳+随机
  emp_id INTEGER NOT NULL,                 -- 员工
  emp_name TEXT NOT NULL, emp_no TEXT,
  dept_name TEXT,                          -- 所在部门
  title TEXT,                              -- 岗位/职位
  contract_type TEXT DEFAULT '新签',        -- 新签/续签/变更
  start_date TEXT, end_date TEXT,          -- 合同期限
  probation_months INTEGER DEFAULT 0,      -- 试用期（月）
  salary_base REAL DEFAULT 0,              -- 月基本工资（元）
  salary_other TEXT,                       -- 其它薪酬构成/绩效说明
  workplace TEXT,                          -- 工作地点
  content TEXT,                            -- 合同主要条款/岗位职责约定
  drafter_id INTEGER, drafter_name TEXT,   -- 起草人（行政人事部）
  status TEXT DEFAULT '草稿',              -- 草稿/审批中/已通过/已驳回/已归档
  approval_id INTEGER,
  version INTEGER DEFAULT 1,
  opinion TEXT, opinion_by TEXT, opinion_at TEXT,  -- 审批人修改意见
  reply TEXT, reply_at TEXT,
  file_path TEXT,                          -- 聘用合同 PDF（电子签/扫描件）
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS hr_resignations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rs_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL, emp_name TEXT, emp_no TEXT, emp_title TEXT, emp_dept TEXT,
  resign_type TEXT NOT NULL,            -- 主动辞职/协商解除/合同到期不续签/辞退
  last_work_date TEXT, reason TEXT,
  handover_json TEXT,                   -- [{item,to,note}] 工作交接清单
  asset_json TEXT,                      -- [{asset,status}] 资产核验清单
  approval_id INTEGER,
  status TEXT DEFAULT '待审批',          -- 待审批/待离职(审批通过)/已离职(办理完成)/驳回/已撤销
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  applied_at TEXT, finished_at TEXT, finished_by TEXT
);`,
      `CREATE TABLE IF NOT EXISTS hr_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tf_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL, emp_name TEXT, emp_no TEXT,
  tf_type TEXT NOT NULL,                -- 岗位调动/晋升/降职/调岗/调薪/综合调整
  src_org_id INTEGER, src_dept TEXT, src_title TEXT, src_role TEXT,
  dst_org_id INTEGER, dst_dept TEXT, dst_title TEXT, dst_role TEXT,
  dst_region TEXT,
  old_salary REAL DEFAULT 0, new_salary REAL DEFAULT 0,   -- 0=不变
  effective_date TEXT, reason TEXT,
  approval_id INTEGER,
  status TEXT DEFAULT '待审批',          -- 待审批/已生效/驳回/已撤销（通过后即生效）
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  applied_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS kpi_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  sales_amount REAL DEFAULT 0,    -- 销售额（合同+回款口径）
  collection_amount REAL DEFAULT 0, -- 回款额
  opp_entry_rate REAL DEFAULT 0,  -- 商机录入率%
  target_amount REAL DEFAULT 0,
  completion_rate REAL DEFAULT 0,
  score REAL DEFAULT 0,
  compliance_veto INTEGER DEFAULT 0, -- 合规一票否决
  veto_reason TEXT,
  remark TEXT,
  UNIQUE(emp_id, period)
);`,
      `CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  leave_code TEXT NOT NULL,             -- 与 leave_types.code 对应（annual 年假 / comp 调休）
  leave_name TEXT,
  total REAL DEFAULT 0,                 -- 当年总额（年假按工龄，调休随加班结转累加）
  used REAL DEFAULT 0,                  -- 已用（请假审批通过后累加）
  remain REAL DEFAULT 0,                -- 剩余
  source TEXT DEFAULT '自动',            -- 自动/加班结转/手动调整
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(emp_id, year, leave_code)
);`,
      `CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leave_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL,
  emp_name TEXT,
  dept_name TEXT,
  leave_type TEXT NOT NULL,           -- 年假/事假/病假/婚假/产假/陪产假/调休
  start_date TEXT, end_date TEXT,
  days REAL DEFAULT 1,
  reason TEXT,
  approval_id INTEGER,                -- 联动审批单id
  status TEXT DEFAULT '审批中',        -- 审批中/通过/驳回/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                   -- 展示名（与请假申请 leave_type 一致）
  annual_rule INTEGER DEFAULT 0,        -- 0=不自动发放 / 1=按工龄自动核算（年假）/ 2=加班调休自动结转
  pay_type TEXT DEFAULT '带薪',          -- 带薪/无薪
  remark TEXT,
  enabled INTEGER DEFAULT 1
);`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
  emp_no TEXT PRIMARY KEY,
  fail_count INTEGER DEFAULT 0,       -- 连续失败次数
  locked_until TEXT,                  -- 锁定截止时间（YYYY-MM-DD HH:MM:SS，未锁定时为 NULL）
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS market_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  act_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                  -- 活动名称
  type TEXT NOT NULL,                  -- 学术会议/展会/科室会/线上推广/学术赞助/KOL拜访
  region TEXT,                         -- 覆盖大区（RM/SALES 行权限过滤）
  start_date TEXT NOT NULL,
  end_date TEXT,
  budget REAL DEFAULT 0,               -- 预算（万元）
  actual_cost REAL,                    -- 实际费用（万元，复盘登记）
  target TEXT,                         -- 目标客户群/预期人次
  owner_id INTEGER NOT NULL,           -- 发起人id
  owner_name TEXT,
  approval_id INTEGER,                 -- 审批单id
  status TEXT DEFAULT '审批中',         -- 审批中/通过/驳回/已撤销/进行中/已结束
  leads INTEGER,                       -- 活动产出线索数（复盘）
  deal_amount REAL,                    -- 活动关联成交额（万元，复盘）
  summary TEXT,                        -- 活动复盘总结
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS market_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fee_no TEXT NOT NULL UNIQUE,             -- 费用单号 MF+时间戳
  title TEXT NOT NULL,                     -- 费用事项（如：华西区域学术推广会议费用）
  category TEXT DEFAULT '学术推广',         -- 学术推广/会议/样品/科室会/线上推广/赞助/KOL/其他
  fee_period TEXT,                        -- 费用所属期间（如 2026-Q1）
  amount REAL DEFAULT 0,                   -- 费用金额（万元）
  region TEXT,                            -- 覆盖大区（行权限过滤）
  owner_id INTEGER NOT NULL,
  owner_name TEXT,
  purpose TEXT,                           -- 费用用途说明
  items_json TEXT,                        -- 费用明细（JSON 数组：[{name,amount,note}]）
  approval_id INTEGER,                    -- 联动审批单
  status TEXT DEFAULT '审批中',            -- 审批中/通过/驳回/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS meeting_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER,             -- 关联会议室预约
  subject TEXT NOT NULL,
  meeting_date TEXT,
  organizer_id INTEGER,
  organizer_name TEXT,
  attendees TEXT,
  content TEXT,                       -- 纪要内容
  decisions TEXT,                     -- 会议决议
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS meeting_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  reserve_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  organizer_id INTEGER NOT NULL,
  organizer_name TEXT,
  attendees TEXT,                     -- 参会人（逗号分隔）
  status TEXT DEFAULT '已预约',        -- 已预约/已取消/已结束
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS meeting_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 10,
  location TEXT,
  equipment TEXT,                     -- 投影/视频会议/白板/音响
  status TEXT DEFAULT '可用'          -- 可用/维护中
);`,
      `CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  msg_type TEXT NOT NULL,             -- 待办/已办/抄送/系统/站内信
  title TEXT NOT NULL,
  content TEXT,
  biz_type TEXT,                      -- 关联业务类型：审批/请假/公告/会议/任务/汇报
  biz_id INTEGER,                     -- 关联业务id
  from_emp_id INTEGER,
  from_name TEXT,
  to_emp_id INTEGER NOT NULL,
  to_name TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS official_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL UNIQUE,        -- 编号：收文SW/发文FW/请示QS + 年月 + 序号
  doc_type TEXT NOT NULL,             -- 收文/发文/内部请示
  title TEXT NOT NULL,
  category TEXT,                      -- 制度/通知/请示/报告/函
  from_org TEXT,                      -- 来文单位（收文）
  to_org TEXT,                        -- 主送单位
  urgent TEXT DEFAULT '普通',          -- 普通/加急/特急
  secret_level TEXT DEFAULT '内部',    -- 内部/秘密/机密
  summary TEXT,                       -- 内容摘要
  content TEXT,                       -- 正文
  issuer_id INTEGER,
  issuer_name TEXT,
  sign_status TEXT DEFAULT '待会签',   -- 待会签/会签中/已签发/已归档
  sign_emp_ids TEXT,                  -- 会签人id列表
  archive_no TEXT,                    -- 归档编号
  status TEXT DEFAULT '有效',          -- 有效/归档/废止
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS official_tpl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tpl_no TEXT, kind TEXT NOT NULL, cat TEXT NOT NULL, title TEXT NOT NULL,
  scope TEXT, fmt TEXT, structure TEXT, norms TEXT, template TEXT, tips TEXT, basis TEXT,
  builtin INTEGER DEFAULT 1, use_count INTEGER DEFAULT 0,
  created_by INTEGER DEFAULT 0, created_by_name TEXT, created_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS opp_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opp_id INTEGER NOT NULL,
  emp_id INTEGER,
  content TEXT NOT NULL,
  next_action TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opp_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  customer_id INTEGER NOT NULL,   -- 强制绑定客户
  sales_id INTEGER NOT NULL,      -- 强制绑定销售
  distributor_id INTEGER,         -- 绑定经销商（终端报备必填）
  product_line TEXT,
  terminal TEXT,                  -- 终端医院/科室
  amount REAL NOT NULL,           -- 预计金额（万元）
  discount_approved REAL DEFAULT 0,-- 特价审批通过后的批准折扣（%），#303 特价审批通过自动级联落库
  stage TEXT NOT NULL DEFAULT '商机录入',
    -- 商机录入/终端报备/项目立项/价格审批/投标管理/合同评审/验收归档/赢单/输单
  probability INTEGER DEFAULT 30,
  expected_date TEXT,
  region TEXT,
  sales_mode TEXT DEFAULT '直销',   -- 销售模式：直销/分销/代理（主营医疗器械代理及直销、分销）
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS org_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_no TEXT UNIQUE,
  change_type TEXT NOT NULL,   -- permission_role / permission_emp / permission_emp_clear / unit_add / unit_edit / unit_disable / dept_add / dept_edit / dept_disable / emp_edit / emp_disable / region_manager
  title TEXT NOT NULL,         -- 变更标题（审批单标题）
  summary TEXT DEFAULT '',     -- 变更内容摘要（审批详情展示）
  payload TEXT NOT NULL,       -- JSON 变更内容（审批通过后由执行器应用）
  status TEXT DEFAULT '待审批',-- 待审批 / 已通过 / 已驳回
  approval_id INTEGER,
  operator_id INTEGER,
  operator_name TEXT,
  applied_at TEXT,
  applied_by TEXT,
  reject_reason TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS org_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  unit_name TEXT,                           -- 经营公司名称（单位全称）
  short_name TEXT,                          -- 公司简称
  credit_code TEXT,                         -- 统一社会信用代码
  legal_person TEXT,                        -- 法定代表人
  reg_capital TEXT,                         -- 注册资本（万元）
  established_date TEXT,                    -- 成立日期
  company_type TEXT,                        -- 企业类型
  reg_authority TEXT,                       -- 登记机关
  reg_address TEXT,                         -- 注册地址
  office_address TEXT,                      -- 办公地址
  industry TEXT,                            -- 所属行业
  biz_scope TEXT,                           -- 经营范围
  employee_count TEXT,                      -- 员工规模（人）
  contact_person TEXT,                      -- 系统管理员/联系人
  contact_phone TEXT,                       -- 联系电话
  email TEXT,                               -- 电子邮箱
  website TEXT,                             -- 公司网址
  bank_name TEXT,                           -- 开户银行
  bank_account TEXT,                        -- 银行账号
  oa_start TEXT,                            -- 系统启用日期
  company_intro TEXT,                       -- 公司简介
  remark TEXT,
  status TEXT DEFAULT '已生效',             -- 已生效/审批中（当前生效版本）
  approval_id INTEGER,                      -- 最近一次生效的审批单id
  history_id INTEGER,                       -- 指向当前待审批/已生效的历史版本
  updated_by INTEGER,
  updated_by_name TEXT,
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS org_profile_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_name TEXT, short_name TEXT, credit_code TEXT, legal_person TEXT,
  reg_capital TEXT, established_date TEXT, company_type TEXT, reg_authority TEXT,
  reg_address TEXT, office_address TEXT, industry TEXT, biz_scope TEXT,
  employee_count TEXT, contact_person TEXT, contact_phone TEXT, email TEXT, website TEXT,
  bank_name TEXT, bank_account TEXT, oa_start TEXT, company_intro TEXT, remark TEXT,
  status TEXT DEFAULT '审批中',             -- 审批中/已通过/已驳回
  approval_id INTEGER,
  submitted_by INTEGER,
  submitted_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  effective_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS org_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,             -- HQ总部 / PRODUCT产品线 / BRANCH分公司 / DEPT部门
  parent_id INTEGER,
  region TEXT,                    -- 分公司所属大区
  manager_emp_id INTEGER,         -- 部门负责人
  func TEXT,                      -- 部门职责（细化）
  headcount INTEGER DEFAULT 0,    -- 编制人数
  status TEXT DEFAULT '启用',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS overtime_reqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ot_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL, emp_name TEXT, dept_name TEXT,
  ot_date TEXT, start_time TEXT, end_time TEXT, hours REAL DEFAULT 1,
  ot_type TEXT DEFAULT '工作日',         -- 工作日/休息日/法定节假日
  comp_type TEXT DEFAULT '调休',         -- 调休/加班工资
  reason TEXT,
  approval_id INTEGER,
  status TEXT DEFAULT '待审批',          -- 待审批/已通过/驳回/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime')),
  applied_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pay_no TEXT NOT NULL UNIQUE,
  ar_id INTEGER NOT NULL,
  amount REAL,
  pay_date TEXT,
  method TEXT,                    -- 银行转账/承兑/现金
  operator_id INTEGER,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS payroll_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL,              -- 核算批次
  emp_id INTEGER NOT NULL, emp_no TEXT, emp_name TEXT,
  role TEXT, role_name TEXT, dept_name TEXT,
  seq_type TEXT,                           -- 销售序列/职能序列
  base_salary REAL DEFAULT 0, post_salary REAL DEFAULT 0,
  perf_base REAL DEFAULT 0, perf_coef REAL DEFAULT 1,
  perf_salary REAL DEFAULT 0,              -- 绩效工资=基数×系数
  commission_amount REAL DEFAULT 0,        -- 业绩提成（销售）
  collection_amount REAL DEFAULT 0,        -- 当月回款基数（万元）
  allowance REAL DEFAULT 0,
  social_amount REAL DEFAULT 0,            -- 社保代扣
  deduction REAL DEFAULT 0,                -- 其他扣款（请假/违规等）
  tax_amount REAL DEFAULT 0,               -- 个税（简化）
  gross_amount REAL DEFAULT 0,             -- 应发
  net_amount REAL DEFAULT 0,               -- 实发
  items_json TEXT,                         -- 明细快照（绩效来源/评价/超额等说明）
  UNIQUE(record_id, emp_id)
);`,
      `CREATE TABLE IF NOT EXISTS payroll_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL UNIQUE,             -- 核算月份 YYYY-MM
  total_emps INTEGER DEFAULT 0,
  total_gross REAL DEFAULT 0, total_net REAL DEFAULT 0,
  total_commission REAL DEFAULT 0,
  status TEXT DEFAULT '草稿',               -- 草稿/已发布
  operator_id INTEGER, operator_name TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS payroll_scheme (
  role TEXT PRIMARY KEY,                    -- 角色（GM/VP/SD/RM/SALES/KAM/FIN...）
  role_name TEXT,
  seq_type TEXT DEFAULT '职能序列',          -- 销售序列/职能序列
  base_salary REAL DEFAULT 0,               -- 基本工资（元/月）
  post_salary REAL DEFAULT 0,               -- 岗位工资
  perf_base REAL DEFAULT 0,                 -- 绩效基数
  commission_rate REAL DEFAULT 0,           -- 回款提成率（0~1）
  commission_target REAL DEFAULT 0,         -- 月度回款目标（万元）
  social_amount REAL DEFAULT 0,             -- 社保代扣
  updated_by INTEGER, updated_by_name TEXT,
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS petty_funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL,
  emp_name TEXT,
  dept_name TEXT,                    -- 申请人部门
  region TEXT,                       -- 申请人所属大区（RM 行权限过滤）
  purpose TEXT NOT NULL,             -- 备用金用途说明
  amount REAL NOT NULL,              -- 申请金额（元）
  expect_return_date TEXT,           -- 预计核销/退回日期
  approval_id INTEGER,               -- 联动审批单id
  status TEXT DEFAULT '审批中',       -- 审批中/待放款/使用中/待核销/已核销/已驳回/已撤销
  paid_at TEXT,                      -- 财务放款时间
  paid_by_id INTEGER,                -- 放款登记人（财务）
  paid_by_name TEXT,
  pay_type TEXT,                     -- 放款方式：银行转账/现金/支票
  used_amount REAL,                  -- 实际使用金额（元，核销登记）
  return_amount REAL,                -- 未用完退回金额（元，退回财务）
  settle_type TEXT,                  -- 用完核销/部分使用退回
  voucher_path TEXT,                 -- 使用凭证附件（图片/PDF）
  settle_note TEXT,                  -- 核销说明（申请人）
  settle_at TEXT,                    -- 核销申请时间
  confirmed_at TEXT,                 -- 财务确认核销时间（闭环）
  confirmed_by_id INTEGER,
  confirmed_by_name TEXT,
  confirm_note TEXT,                 -- 财务登记备注（含退回到账确认）
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS print_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  req_no TEXT NOT NULL,                 -- 申请单号 PR+时间戳
  biz_type TEXT NOT NULL,               -- approval_print审批单 / voucher_dl凭证 / document_dl知识文档 / archive_export审批档案
  biz_id TEXT NOT NULL,                 -- 对象id或凭证路径
  biz_name TEXT,                        -- 对象描述（展示用）
  purpose TEXT,                         -- 用途说明
  applicant_id INTEGER,                 -- 申请人（仅部门负责人/公司领导）
  applicant_name TEXT,
  approval_id INTEGER,                  -- 联动审批单
  approval_no TEXT,
  token TEXT,                           -- 审批通过后发放的一次性令牌
  token_expires_at TEXT,                -- 令牌有效期（24小时）
  used_count INTEGER DEFAULT 0,         -- 令牌使用次数（留痕审计）
  status TEXT DEFAULT '待审批',          -- 待审批/通过/驳回
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pi_no TEXT NOT NULL UNIQUE,              -- 进项登记单号 PI+时间戳
  invoice_no TEXT NOT NULL,                -- 发票号码（供应商开具）
  invoice_code TEXT DEFAULT '',            -- 发票代码
  inv_type TEXT DEFAULT '专票',            -- 专票/普票/电子发票/其他
  supplier_id INTEGER, supplier_name TEXT,
  ap_id INTEGER, ap_no TEXT,               -- 勾稽应付单（采购入库自动生成）
  rc_no TEXT, po_no TEXT,                  -- 关联入库单/订单（冗余展示）
  amount REAL DEFAULT 0,                   -- 价税合计（万元）
  tax_amount REAL DEFAULT 0,               -- 进项税额（万元）
  pre_amount REAL DEFAULT 0,               -- 不含税金额（万元）
  invoice_date TEXT,                       -- 开票日期
  deduct_status TEXT DEFAULT '未认证',      -- 未认证/已认证/已抵扣
  status TEXT DEFAULT '登记',              -- 登记/作废
  remark TEXT,
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_no TEXT NOT NULL UNIQUE,           -- 采购订单号 PO+时间戳
  pr_id INTEGER,                        -- 来源采购申请
  pr_no TEXT,
  supplier_id INTEGER,
  supplier_name TEXT,
  category TEXT,
  item_name TEXT,
  spec TEXT,
  qty REAL,
  unit TEXT,
  amount REAL,                          -- 订单金额（万元）
  order_date TEXT,                      -- 下单日期
  delivery_date TEXT,                   -- 约定交期
  payment_terms TEXT,                   -- 付款条件
  status TEXT DEFAULT '已下单',          -- 已下单/部分到货/已到货/已关闭
  received_amount REAL DEFAULT 0,       -- 已到货金额（万元）
  created_by INTEGER,
  created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS purchase_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rc_no TEXT NOT NULL UNIQUE,           -- 入库单号 RC+时间戳
  po_id INTEGER,                        -- 关联采购订单
  po_no TEXT,
  supplier_id INTEGER,
  supplier_name TEXT,
  category TEXT,
  item_name TEXT,
  qty REAL,
  unit TEXT,
  amount REAL,                          -- 本次入库金额（万元）
  receipt_date TEXT,                    -- 入库日期
  warehouse TEXT,                       -- 入库仓库
  operator_id INTEGER,
  operator_name TEXT,
  status TEXT DEFAULT '已入库',
  model TEXT,                           -- 型号（#98 入库产品细化）
  manufacturer TEXT,                    -- 生产厂家
  prod_date TEXT,                       -- 生产日期
  expiry_date TEXT,                     -- 有效期至
  unit_price REAL,                      -- 单价（元/单位）
  batch_no TEXT,                        -- 批次号（默认=入库单号，同批多单可填同一批次）
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_no TEXT NOT NULL UNIQUE,           -- 采购申请单号 PR+时间戳
  applicant_id INTEGER,
  applicant_name TEXT,
  dept TEXT,                            -- 申请部门
  supplier_id INTEGER,                  -- 意向供应商（可空，先走审批再定供应商）
  supplier_name TEXT,
  category TEXT,                        -- 品类：设备/耗材/服务/原材料
  item_name TEXT NOT NULL,              -- 物料/服务名称
  spec TEXT,                            -- 规格型号
  qty REAL DEFAULT 1,
  unit TEXT DEFAULT '批',
  amount REAL NOT NULL,                 -- 金额（万元）
  need_date TEXT,                       -- 需求日期
  purpose TEXT,                         -- 用途说明
  budget_type TEXT DEFAULT '采购预算',   -- 关联预算类型
  approval_id INTEGER,                  -- 联动采购审批单
  approval_no TEXT,
  po_id INTEGER,                        -- 审批通过后生成的采购订单
  status TEXT DEFAULT '待审批',          -- 待审批/通过/驳回/已转订单/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rt_no TEXT NOT NULL UNIQUE,              -- 采购退货单号 PRT+时间戳
  rc_id INTEGER, rc_no TEXT,               -- 原入库单
  po_id INTEGER, po_no TEXT,
  supplier_id INTEGER, supplier_name TEXT,
  item_name TEXT, model TEXT, warehouse TEXT, unit TEXT,
  qty REAL DEFAULT 1,                      -- 退货数量（退给供应商）
  amount REAL DEFAULT 0,                   -- 红冲金额（万元）
  reason TEXT DEFAULT '质量问题',            -- 质量问题/多收货/其他
  return_date TEXT,
  approval_id INTEGER,
  status TEXT DEFAULT '待审批',             -- 待审批/已生效(审批通过已冲销)/驳回/已撤销
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS qual_renewal_pending (
  qual_id INTEGER PRIMARY KEY,
  new_expire_date TEXT NOT NULL,
  note TEXT
);`,
      `CREATE TABLE IF NOT EXISTS qual_verify (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verify_no TEXT NOT NULL UNIQUE,
  data_type TEXT NOT NULL,                 -- supplier/factory/channel/distributor
  ref_id INTEGER NOT NULL,
  unit_name TEXT,
  credit_code TEXT, license_no TEXT,
  category TEXT,                           -- 申报分类/类型
  required_scope TEXT,                     -- 申报业务范围（产品/服务类别）
  scope_text TEXT,                         -- 营业执照经营范围原文
  matched_items TEXT,                      -- JSON 数组：覆盖条目
  missing_items TEXT,                      -- JSON 数组：未覆盖条目
  coverage REAL DEFAULT 0,                 -- 覆盖率 0-100
  match_status TEXT DEFAULT '未核验',       -- 完全匹配/部分匹配/不匹配/未核验
  risk_level TEXT DEFAULT '低',            -- 低/中/高
  verifier_id INTEGER, verifier_name TEXT,
  verify_date TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS qualifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qual_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                  -- 证照名称
  category TEXT NOT NULL,              -- 营业执照/医疗器械经营许可证/产品注册证/生产许可证/厂家授权书/CE认证/ISO13485/其他
  cert_no TEXT,                        -- 证照编号
  issuer TEXT,                         -- 发证机构
  owner_dept TEXT,                     -- 责任部门
  owner_id INTEGER,                    -- 责任人id
  owner_name TEXT,                     -- 责任人姓名
  issue_date TEXT,                     -- 发证日期
  expire_date TEXT NOT NULL,           -- 到期日期（预警引擎核心字段）
  warn_days INTEGER DEFAULT 90,        -- 预警提前天数
  scope TEXT,                          -- 适用范围（如某产品线/全国）
  status TEXT DEFAULT '审批中',         -- 审批中/有效/驳回/续证中/已过期（已过期由引擎动态判定）
  approval_id INTEGER,                 -- 登记审批单id
  renewal_approval_id INTEGER,         -- 续证审批单id
  renewal_note TEXT,                   -- 续证进展备注
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS qywx_bind (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL UNIQUE,
  emp_no TEXT NOT NULL,
  qywx_userid TEXT NOT NULL UNIQUE,
  bind_at TEXT NOT NULL
);`,
      `CREATE TABLE IF NOT EXISTS qywx_config (
  id INTEGER PRIMARY KEY CHECK (id=1),
  corp_id TEXT,
  agent_id INTEGER,
  secret TEXT,
  base_url TEXT,
  updated_by TEXT,
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS qywx_push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_no TEXT, title TEXT, description TEXT,
  source TEXT DEFAULT '业务',          -- 业务联动 / 手工
  sent INTEGER DEFAULT 0, reason TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS recruit_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cand_no TEXT NOT NULL UNIQUE,
  req_id INTEGER, req_title TEXT,
  name TEXT NOT NULL, gender TEXT, phone TEXT, email TEXT,
  source TEXT DEFAULT '招聘网站',        -- 招聘网站/内推/猎头/校招/其他
  resume_note TEXT,                     -- 简历摘要/作品说明
  stage TEXT DEFAULT '初筛',            -- 初筛/面试/复试/待录用/已录用/淘汰/放弃
  score REAL, evaluation TEXT,
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS recruit_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_no TEXT NOT NULL UNIQUE,
  req_id INTEGER, cand_id INTEGER NOT NULL, cand_name TEXT, cand_phone TEXT, cand_gender TEXT,
  title TEXT NOT NULL, role TEXT NOT NULL, dept_id INTEGER, dept_name TEXT, region TEXT,
  hire_date TEXT, salary_base REAL DEFAULT 0, probation_months INTEGER DEFAULT 3, remark TEXT,
  approval_id INTEGER, onboard_id INTEGER,     -- 自动建档的入职登记单 id
  status TEXT DEFAULT '待审批',          -- 待审批/已通过/已入职/驳回/已撤销
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  applied_at TEXT, onboard_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS recruit_reqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  req_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,                  -- 招聘岗位
  dept_id INTEGER, dept_name TEXT,
  headcount INTEGER DEFAULT 1,          -- 需求人数
  req_type TEXT DEFAULT '新增',          -- 新增/补员/储备
  job_duty TEXT, requirement TEXT, salary_range TEXT, need_date TEXT,
  headcount_filled INTEGER DEFAULT 0,   -- 已录用人数（offer 入职后累计）
  approval_id INTEGER,
  status TEXT DEFAULT '待审批',          -- 待审批/招聘中(通过)/已关闭/驳回/已撤销
  created_by INTEGER, created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS report_cc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,            -- 关联 work_reports.id
  emp_id INTEGER NOT NULL,               -- 被抄送人
  emp_name TEXT,
  read_at TEXT,                          -- 已读时间（未读为 NULL）
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS report_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tpl_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                    -- 模板名称（如：日报模板）
  report_type TEXT NOT NULL,             -- 日报/周报/月报/季度报/年报
  guide TEXT,                            -- 填报指引/模板说明（填报向导提示）
  field_flags TEXT DEFAULT 'summary,plan,issues', -- 启用字段（summary 工作总结/plan 下期计划/issues 问题求助）
  score_enabled INTEGER DEFAULT 1,       -- 批阅是否评分评级
  deadline_time TEXT DEFAULT '20:00',    -- 每周期截止时间 HH:MM
  period_rule TEXT DEFAULT '每日',       -- 周期规则说明（展示用：每日/每周（周日截止）等）
  applicable_roles TEXT DEFAULT '',      -- 适用范围（空=全员；逗号分隔角色）
  status TEXT DEFAULT '启用',            -- 启用/停用
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  module TEXT NOT NULL,           -- org/dept/doc/customer/opp/dms/finance/kpi/approval/report/audit/hr/service/supply
  can_view INTEGER DEFAULT 1,
  can_edit INTEGER DEFAULT 0,
  can_approve INTEGER DEFAULT 0,
  UNIQUE(role, module)
);`,
      `CREATE TABLE IF NOT EXISTS salary_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL UNIQUE,          -- 员工id
  emp_no TEXT, emp_name TEXT,
  role TEXT,                               -- 员工角色（RBAC）
  seq_type TEXT DEFAULT '职能',            -- 销售序列/职能序列（按 role 派生，可手改）
  base_salary REAL DEFAULT 0,              -- 基本工资（元）
  post_salary REAL DEFAULT 0,              -- 岗位工资（元）
  perf_base REAL DEFAULT 0,                -- 绩效工资基数（元）
  commission_rate REAL DEFAULT 0,          -- 业绩提成率（0-1，如 0.03=3%，按回款到账计提）
  commission_target REAL DEFAULT 0,        -- 月度回款目标（万元，超出部分加成）
  commission_bonus REAL DEFAULT 0.5,       -- 超额加成系数（超出目标部分提成×（1+加成））
  allowance REAL DEFAULT 0,                -- 固定补贴（元）
  social_amount REAL DEFAULT 0,            -- 社保/公积金等固定代扣（元）
  manager_by REAL DEFAULT 0,               -- 管理岗按团队业绩提成比例(0=无)
  effective_month TEXT,                    -- 生效月份 YYYY-MM
  remark TEXT,
  created_by INTEGER, created_by_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS sale_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sin_no TEXT NOT NULL UNIQUE,             -- 开票登记单号 SI+时间戳
  invoice_no TEXT DEFAULT '',              -- 实际发票号码（财务补录后置已开票）
  invoice_code TEXT DEFAULT '',
  inv_type TEXT DEFAULT '专票',
  ar_id INTEGER, ar_no TEXT,               -- 勾稽应收单
  customer_name TEXT, distributor_id INTEGER, sales_id INTEGER, region TEXT,
  amount REAL DEFAULT 0,                   -- 开票金额（万元，冲抵应收口径）
  tax_amount REAL DEFAULT 0,               -- 销项税额（万元）
  pre_amount REAL DEFAULT 0,               -- 不含税金额（万元）
  invoice_date TEXT,
  source TEXT DEFAULT '开票申请',           -- 开票申请（走审批）/直接登记
  approval_id INTEGER,
  status TEXT DEFAULT '待开票',             -- 待开票（审批已过）/已开票（补录发票号）/作废
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS sale_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rt_no TEXT NOT NULL UNIQUE,              -- 销售退货单号 SRT+时间戳
  ar_id INTEGER, ar_no TEXT,               -- 原应收单
  customer_name TEXT, distributor_id INTEGER, sales_id INTEGER, region TEXT,
  item_name TEXT, model TEXT, warehouse TEXT, unit TEXT,
  qty REAL DEFAULT 1,                      -- 退货回仓数量
  amount REAL DEFAULT 0,                   -- 红冲应收金额（万元，售价口径）
  reason TEXT DEFAULT '质量问题',            -- 质量问题/客户拒收/其他
  return_date TEXT,
  approval_id INTEGER,
  status TEXT DEFAULT '待审批',             -- 待审批/已生效(审批通过已冲销)/驳回/已撤销
  operator_id INTEGER, operator_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS sales_regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,                 -- CQ1/CQ2/CQ3/CQ4/SN1
  name TEXT UNIQUE,                 -- 重庆主城/重庆渝西/重庆渝东北/重庆渝东南/遂宁
  city TEXT,                        -- 重庆 / 遂宁
  coverage TEXT,                    -- 覆盖区县
  manager_emp_id INTEGER,
  manager_name TEXT,
  status TEXT DEFAULT '启用',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS sales_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  region TEXT DEFAULT '',
  emp_id INTEGER,
  target_type TEXT NOT NULL DEFAULT '签约',   -- 签约 / 回款
  amount REAL NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL,
  emp_name TEXT,
  title TEXT NOT NULL,
  sched_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  type TEXT DEFAULT '个人',            -- 个人/会议/拜访/培训
  location TEXT,
  remind INTEGER DEFAULT 0,           -- 提前提醒（分钟）
  attendees TEXT,                     -- 共享/参会人（逗号分隔）
  remark TEXT,
  status TEXT DEFAULT '正常',          -- 正常/已取消/已完成
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS seal_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no TEXT NOT NULL UNIQUE,
  seal_id INTEGER NOT NULL,
  seal_name TEXT,
  emp_id INTEGER NOT NULL,
  emp_name TEXT,
  dept_name TEXT,
  purpose TEXT,                       -- 用印事由
  file_desc TEXT,                     -- 用印文件说明
  copies INTEGER DEFAULT 1,           -- 份数
  approval_id INTEGER,                -- 联动审批单
  status TEXT DEFAULT '审批中',        -- 审批中/通过/驳回/已撤销
  used_at TEXT,                       -- 实际用印时间
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS seals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seal_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                 -- 公章/合同章/财务章/发票章/法人章
  keeper_id INTEGER,
  keeper_name TEXT,
  location TEXT,
  status TEXT DEFAULT '在库',          -- 在库/在用/停用
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adj_no TEXT NOT NULL UNIQUE,
  stock_id INTEGER NOT NULL,
  item_name TEXT, model TEXT, warehouse TEXT, unit TEXT,
  old_qty REAL DEFAULT 0, new_qty REAL DEFAULT 0, diff REAL DEFAULT 0, amount REAL DEFAULT 0,
  avg_cost REAL DEFAULT 0,
  reason TEXT, status TEXT DEFAULT '审批中',
  approval_id INTEGER, created_by INTEGER, created_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  move_no TEXT NOT NULL UNIQUE,
  move_type TEXT NOT NULL,                 -- 采购入库/销售出库/盘点调整/期初
  ref_table TEXT, ref_id INTEGER, ref_no TEXT,
  item_name TEXT, model TEXT, warehouse TEXT, unit TEXT,
  qty REAL,                                -- +入库 / -出库
  unit_cost REAL DEFAULT 0, amount REAL DEFAULT 0,
  operator_id INTEGER, operator_name TEXT,
  biz_date TEXT, remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS supply_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no TEXT NOT NULL UNIQUE,
  item_id INTEGER NOT NULL,
  item_name TEXT,
  qty INTEGER DEFAULT 1,
  applicant_id INTEGER NOT NULL,
  applicant_name TEXT,
  dept_name TEXT,
  reason TEXT,
  approval_id INTEGER,
  status TEXT DEFAULT '审批中',        -- 审批中/通过/驳回/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS supply_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,                      -- 办公文具/打印耗材/清洁用品/后勤保障
  spec TEXT,
  unit TEXT DEFAULT '个',
  stock INTEGER DEFAULT 0,
  warn_level INTEGER DEFAULT 10,      -- 库存预警线
  status TEXT DEFAULT '在库'          -- 在库/停用
);`,
      `CREATE TABLE IF NOT EXISTS supply_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,                        -- 办公文具/打印耗材/清洁用品/IT耗材/劳保用品/其他
  spec TEXT,
  unit TEXT DEFAULT '个',
  stock INTEGER DEFAULT 0,
  warn_level INTEGER DEFAULT 10,        -- 库存预警线
  applicant_id INTEGER NOT NULL,
  applicant_name TEXT,
  approval_id INTEGER,                  -- 联动审批单id
  status TEXT DEFAULT '审批中',          -- 审批中/通过/驳回
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS sys_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL UNIQUE,    -- 制度编号
  title TEXT NOT NULL,
  category TEXT NOT NULL,         -- 组织人事/销售管理/经销商管理/财务管理/合同法务/质量合规/行政后勤/信息安全
  version TEXT DEFAULT 'V1.0',
  issuer_dept TEXT,               -- 发布部门
  issuer TEXT,                    -- 发布人
  issue_date TEXT,                -- 发布日期
  status TEXT DEFAULT '现行有效',  -- 现行有效/修订中/已废止
  content TEXT,                   -- 制度正文
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  descr TEXT,
  assigner_id INTEGER,
  assigner_name TEXT,
  assignee_id INTEGER NOT NULL,
  assignee_name TEXT,
  priority TEXT DEFAULT '普通',        -- 高/中/低
  due_date TEXT,
  progress INTEGER DEFAULT 0,         -- 0-100
  status TEXT DEFAULT '待开始',        -- 待开始/进行中/已完成/已逾期
  biz_type TEXT,                      -- 关联业务类型（商机/客户/会议/审批…）
  biz_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS training_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_no TEXT NOT NULL UNIQUE,          -- 培训计划编号 TP20260830xxxx
  title TEXT NOT NULL,                   -- 培训主题
  category TEXT NOT NULL,                -- 医疗器械专业知识/法律法规/产品专项培训/公司统一培训/销售专项培训/其他
  owner_dept TEXT NOT NULL,              -- 负责部门（质量管理部/市场部/行政人事部/销售部）
  owner_role TEXT NOT NULL,              -- 归口角色 QA/MKT/ADM/SD
  stage TEXT DEFAULT '月',               -- 年度/季度/月
  plan_date TEXT,                        -- 计划培训日期
  trainer TEXT,                          -- 讲师
  target TEXT,                           -- 参训对象
  duration TEXT,                         -- 时长
  location TEXT,                         -- 地点
  budget REAL DEFAULT 0,                 -- 预算（万元）
  content TEXT,                          -- 培训内容大纲
  status TEXT DEFAULT '待审批',          -- 待审批/已通过/已执行/已驳回
  approval_id INTEGER,                   -- 关联审批单
  result_json TEXT,                      -- 培训结果附件快照 [{"file_name","file_path","uploaded_at"}]
  result_note TEXT,                      -- 结果说明（出勤率/考核情况/参训人数）
  exec_date TEXT,                        -- 实际执行日期
  exec_by TEXT,                          -- 执行登记人
  created_by INTEGER,
  created_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS user_todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL,            -- 归属员工 id
  content TEXT NOT NULL,              -- 待办内容
  priority TEXT DEFAULT '普通',        -- 高/中/普通
  due_date TEXT,                      -- 截止日（YYYY-MM-DD，可为空）
  done INTEGER DEFAULT 0,             -- 0=未完成 1=已完成
  created_at TEXT DEFAULT (datetime('now','localtime')),
  finished_at TEXT
);`,
      `CREATE TABLE IF NOT EXISTS vehicle_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no TEXT NOT NULL UNIQUE,
  emp_id INTEGER NOT NULL,
  emp_name TEXT,
  purpose TEXT,                       -- 出车事由
  destination TEXT,                   -- 目的地
  use_date TEXT,                      -- 用车日期
  passengers TEXT,                    -- 随行人员
  approval_id INTEGER,
  status TEXT DEFAULT '审批中',        -- 审批中/通过/驳回/已撤销
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
      `CREATE TABLE IF NOT EXISTS voucher_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL,
  seq INTEGER DEFAULT 1,
  direction TEXT NOT NULL,                 -- 借/贷
  account_code TEXT, account_name TEXT,
  amount REAL DEFAULT 0,
  summary TEXT
);`,
      `CREATE TABLE IF NOT EXISTS warehouse_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT NOT NULL,                 -- 物料/商品名（与采购入库物项、经销商订单产品对齐）
  model TEXT DEFAULT '',                   -- 型号
  warehouse TEXT DEFAULT '总部仓库',
  unit TEXT DEFAULT '件',
  qty REAL DEFAULT 0,
  avg_cost REAL DEFAULT 0,                 -- 平均成本（万元/单位，加权）
  amount REAL DEFAULT 0,                   -- 库存金额（万元）
  nearest_expiry TEXT,
  updated_at TEXT,
  UNIQUE(item_name, model, warehouse)
);`,
      `CREATE TABLE IF NOT EXISTS work_report_guidance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  emp_id INTEGER, emp_name TEXT, role TEXT,
  comment TEXT NOT NULL,                 -- 工作指导意见批复
  created_at TEXT DEFAULT (datetime('now','localtime'))
);`,
    ];
    let ok = 0, bad = 0;
    for (const s of stmts) {
      try { db.exec(s); ok++; } catch (e) { bad++; console.error('[009] DDL 失败:', e.message.slice(0, 120)); }
    }
    console.log(`[009] 建表完成: 成功 ${ok} / 失败 ${bad}`);
  },

  seed(db) {
    const done = db.prepare("SELECT value FROM kv_store WHERE key='seed_009_done'").get();
    if (done) { console.log('[009] 已执行过，跳过'); return; }

    // 组织人事基础数据：从现有 users/departments 同步到 employees/org_units（幂等，仅空表时写入）
    try {
      const hasEmp = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'").get();
      const hasOrg = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='org_units'").get();

      // 1) departments -> org_units（保留原 id，便于 employees.org_id 对齐）
      if (hasOrg) {
        const n = db.prepare('SELECT COUNT(*) c FROM org_units').get().c;
        if (n === 0) {
          const depts = db.prepare('SELECT * FROM departments').all();
          const ins = db.prepare(`INSERT OR IGNORE INTO org_units (id, code, name, type, parent_id, region, func, headcount, status)
            VALUES (?,?,?,?,?,?,?,?,?)`);
          db.transaction((rows) => {
            for (const d of rows) {
              ins.run(d.id, d.code || ('D' + d.id), d.name, 'DEPT', d.parent_id || null, '',
                d.description || '', d.headcount || d.count || 0, d.status || '启用');
            }
          })(depts);
          console.log(`[009] org_units 同步 ${depts.length} 条`);
        }
      }

      // 2) users -> employees（dept 名映射 org_id；role 保留中文原值）
      if (hasEmp) {
        const n = db.prepare('SELECT COUNT(*) c FROM employees').get().c;
        if (n === 0) {
          const deptId = new Map();
          db.prepare('SELECT id, name FROM org_units').all().forEach((r) => deptId.set(r.name, r.id));
          const users = db.prepare('SELECT * FROM users').all();
          const ins = db.prepare(`INSERT OR IGNORE INTO employees
            (id, emp_no, name, password_hash, title, role, org_id, phone, hire_date, email, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
          db.transaction((rows) => {
            for (const u of rows) {
              ins.run(Number(u.id) || null, u.emp_id || u.id, u.name,
                u.password || '', '', u.role || 'SALES', deptId.get(u.dept) || null,
                u.phone || '', u.join_date || null, u.email || '', u.status || '在职');
            }
          })(users);
          console.log(`[009] employees 同步 ${users.length} 条`);
        }
      }
    } catch (e) {
      console.error('[009] 基础数据同步失败:', e.message);
    }

    db.prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES ('seed_009_done','1')").run();
    console.log('[009] 种子完成');
  },
};
