/* 007_reference_schema - 对齐参考项目完整表结构
 * 由 scripts/gen_007.js 自动生成:
 *   - 新建当前缺失的表（CREATE TABLE IF NOT EXISTS,幂等)
 *   - 已有表补齐缺失列（ALTER TABLE ADD COLUMN,PRAGMA 守卫,幂等)
 */
module.exports = {
  id: '007_reference_schema',

  up(db) {
    const createStmts = [
      `CREATE TABLE IF NOT EXISTS users (

      id          TEXT PRIMARY KEY,
      emp_id      TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      avatar      TEXT DEFAULT '',
      avatar_color TEXT DEFAULT '#6366f1',
      dept        TEXT NOT NULL,
      role        TEXT NOT NULL,
      phone       TEXT DEFAULT '',
      status      TEXT DEFAULT '在职',
      join_date   TEXT,
      level       TEXT DEFAULT 'P3',
      education   TEXT DEFAULT '',
      age         INTEGER DEFAULT 0,
      salary      TEXT DEFAULT '—',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS departments (

      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      head        TEXT DEFAULT '',
      count       INTEGER DEFAULT 0,
      headcount   INTEGER DEFAULT 0,
      color       TEXT DEFAULT '#6366f1',
      icon        TEXT DEFAULT 'folder',
      parent_id   INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS roles (

      id          INTEGER PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      desc        TEXT DEFAULT '',
      color       TEXT DEFAULT '#6366f1',
      user_count  INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS permissions (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      role        TEXT NOT NULL,
      module      TEXT NOT NULL,
      level       REAL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(role, module)
  )`,
      `CREATE TABLE IF NOT EXISTS customers (

      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      contact     TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      email       TEXT DEFAULT '',
      address     TEXT DEFAULT '',
      level       TEXT DEFAULT 'C',
      industry    TEXT DEFAULT '',
      source      TEXT DEFAULT '',
      status      TEXT DEFAULT '潜在',
      owner       TEXT DEFAULT '',
      owner_dept  TEXT DEFAULT '',
      submitter   TEXT DEFAULT '',
      submitter_id TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      approval_flow TEXT DEFAULT '[]',
      remark      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contracts (

      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      customer    TEXT DEFAULT '',
      type        TEXT DEFAULT '',
      amount      REAL DEFAULT 0,
      start_date  TEXT,
      end_date    TEXT,
      status      TEXT DEFAULT '待审批',
      progress    INTEGER DEFAULT 0,
      creator     TEXT DEFAULT '',
      creator_id  TEXT DEFAULT '',
      creator_dept TEXT DEFAULT '',
      approver    TEXT DEFAULT '',
      sign_date   TEXT,
      execution_status TEXT DEFAULT '未执行',
      execution_desc  TEXT DEFAULT '',
      flow        TEXT DEFAULT '[]',
      content     TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contract_changes (

      id          TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      contract_name TEXT DEFAULT '',
      change_type TEXT DEFAULT '',
      reason      TEXT DEFAULT '',
      before_desc TEXT DEFAULT '',
      after_desc  TEXT DEFAULT '',
      applicant   TEXT DEFAULT '',
      applicant_id TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contract_terminations (

      id          TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      contract_name TEXT DEFAULT '',
      term_type   TEXT DEFAULT '终止',
      reason      TEXT DEFAULT '',
      settle_amount REAL DEFAULT 0,
      settle_desc TEXT DEFAULT '',
      effective_date TEXT,
      applicant   TEXT DEFAULT '',
      applicant_id TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contract_borrows (

      id          TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      contract_name TEXT DEFAULT '',
      borrower    TEXT DEFAULT '',
      borrower_id TEXT DEFAULT '',
      borrower_dept TEXT DEFAULT '',
      borrow_date TEXT,
      expected_return TEXT,
      actual_return TEXT,
      purpose     TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contract_templates (

      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      category        TEXT DEFAULT '',
      content         TEXT DEFAULT '',
      fields          TEXT DEFAULT '[]',
      creator         TEXT DEFAULT '',
      creator_id      TEXT DEFAULT '',
      status          TEXT DEFAULT '启用',
      applicable_dept TEXT DEFAULT '',           -- 适用部门(逗号分隔，空=全部)
      template_file   TEXT DEFAULT '',           -- 模板文件路径
      file_type       TEXT DEFAULT '',           -- 文件类型: PDF/Word
      version         INTEGER DEFAULT 1,         -- 当前版本号
      parent_id       TEXT DEFAULT '',           -- 父模板ID(版本链根)
      is_latest       INTEGER DEFAULT 1,         -- 1=最新版, 0=历史版
      is_deleted      INTEGER DEFAULT 0,         -- 软删除(0正常/1已删)
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contract_template_versions (

      id              TEXT PRIMARY KEY,
      template_id     TEXT NOT NULL,             -- 模板ID(指向最新版)
      version_num     INTEGER NOT NULL,           -- 版本号
      name            TEXT DEFAULT '',             -- 模板名称快照
      category        TEXT DEFAULT '',             -- 合同类型快照
      content         TEXT DEFAULT '',             -- 内容快照
      fields          TEXT DEFAULT '[]',           -- 字段快照
      template_file   TEXT DEFAULT '',             -- 文件路径快照
      file_type       TEXT DEFAULT '',             -- 文件类型快照
      applicable_dept TEXT DEFAULT '',             -- 适用部门快照
      status          TEXT DEFAULT '启用',          -- 状态快照
      operator        TEXT DEFAULT '',             -- 操作人
      operator_id     TEXT DEFAULT '',             -- 操作人ID
      change_desc     TEXT DEFAULT '',             -- 变更说明
      created_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_template_approval (

      id              TEXT PRIMARY KEY,
      template_id     TEXT DEFAULT '',             -- 目标模板ID(新建时为空)
      template_name   TEXT DEFAULT '',             -- 模板名称
      change_type     TEXT NOT NULL,               -- create/modify/delete/status_toggle
      change_data     TEXT DEFAULT '{}',           -- 变更内容JSON(新值)
      snapshot_data   TEXT DEFAULT '{}',           -- 变更前快照JSON(修改/删除时)
      reason          TEXT DEFAULT '',             -- 申请说明
      status          TEXT DEFAULT '审批中',       -- 审批中/已通过/已驳回
      current_step    INTEGER DEFAULT 1,
      steps           TEXT DEFAULT '[]',           -- 审批流程JSON
      applicant_id    TEXT DEFAULT '',
      applicant_name  TEXT DEFAULT '',
      applicant_dept  TEXT DEFAULT '',
      approver_log    TEXT DEFAULT '[]',           -- 审批记录JSON
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contract_logs (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT DEFAULT '',
      action      TEXT DEFAULT '',
      operator    TEXT DEFAULT '',
      operator_id TEXT DEFAULT '',
      operator_dept TEXT DEFAULT '',
      detail      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS contract_versions (

      id          TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      version_num INTEGER DEFAULT 1,
      snapshot    TEXT DEFAULT '',
      change_desc TEXT DEFAULT '',
      operator    TEXT DEFAULT '',
      operator_id TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_main (

      id              TEXT PRIMARY KEY,
      contract_no     TEXT DEFAULT '',          -- 合同编号(审批后生成: HT-YYYYMM-NNN)
      contract_type   TEXT DEFAULT '',          -- 合同类型(下拉)
      contract_name   TEXT NOT NULL,            -- 合同名称(必填)
      partner_company TEXT DEFAULT '',          -- 合作方单位(必填)
      social_credit_code TEXT DEFAULT '',       -- 统一社会信用代码
      contact_person  TEXT DEFAULT '',          -- 联系人
      contact_phone   TEXT DEFAULT '',          -- 联系电话
      sign_location   TEXT DEFAULT '',          -- 合同签订地点
      amount          REAL DEFAULT 0,           -- 合同金额(2位小数)
      currency        TEXT DEFAULT '人民币',     -- 币种
      tax_rate        TEXT DEFAULT '',          -- 税率
      tax_inclusive   TEXT DEFAULT '含税',      -- 含税/不含税
      payment_method  TEXT DEFAULT '',          -- 付款方式
      payment_milestones TEXT DEFAULT '',       -- 付款节点
      start_date      TEXT DEFAULT '',          -- 合同起始日期
      end_date        TEXT DEFAULT '',          -- 合同到期日期
      duration        TEXT DEFAULT '',          -- 履行期限(自动计算)
      budget_department TEXT DEFAULT '',        -- 预算归属部门
      handler         TEXT DEFAULT '',          -- 经办人
      handler_id      TEXT DEFAULT '',          -- 经办人ID
      attachment_group TEXT DEFAULT '[]',       -- 附件组(JSON数组)
      final_pdf       TEXT DEFAULT '',          -- 合同定稿PDF路径
      signed_pdf      TEXT DEFAULT '',          -- 签字盖章版PDF路径
      signed_pdf_at   TEXT DEFAULT '',          -- 签字盖章版上传时间
      signed_pdf_by   TEXT DEFAULT '',          -- 签字盖章版上传人
      external_remark TEXT DEFAULT '',          -- 外部备注
      internal_risk_remark TEXT DEFAULT '',     -- 内部风险备注
      -- 系统内置状态字段(不可前端编辑)
      contract_status TEXT DEFAULT '草稿',       -- 草稿/审批中/已生效/变更中/已终止/已归档/已作废
      current_approval_node TEXT DEFAULT '',    -- 当前审批节点
      approval_flow_id TEXT DEFAULT '',         -- 审批流程实例ID
      flow            TEXT DEFAULT '[]',        -- 审批流程JSON
      created_by      TEXT DEFAULT '',          -- 创建人
      created_by_id   TEXT DEFAULT '',          -- 创建人ID
      created_dept    TEXT DEFAULT '',          -- 创建部门
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_by      TEXT DEFAULT '',          -- 更新人
      updated_by_id   TEXT DEFAULT '',          -- 更新人ID
      updated_at     TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_attachments (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id     TEXT NOT NULL,             -- 关联合同ID
      file_name       TEXT NOT NULL,             -- 文件名
      file_category   TEXT DEFAULT '',           -- 分类: 合同草案/相关资质/报价资料/合同定稿
      file_path       TEXT DEFAULT '',           -- 存储路径
      file_size       INTEGER DEFAULT 0,         -- 文件大小(字节)
      uploader        TEXT DEFAULT '',           -- 上传人
      uploader_id     TEXT DEFAULT '',           -- 上传人ID
      uploaded_at     TEXT DEFAULT (datetime('now','localtime')),
      is_deleted      INTEGER DEFAULT 0,         -- 软删除(0正常/1已删,保留审计记录)
      deleted_by      TEXT DEFAULT '',           -- 删除人
      deleted_at     TEXT DEFAULT ''
  )`,
      `CREATE TABLE IF NOT EXISTS t_flow_instances (

      id              TEXT PRIMARY KEY,
      flow_id         TEXT NOT NULL,           -- flow_contract_new
      contract_id     TEXT NOT NULL,           -- 关联合同ID
      contract_no     TEXT DEFAULT '',
      flow_data       TEXT DEFAULT '{}',       -- 完整流程JSON（含所有节点状态）
      status          TEXT DEFAULT '进行中',    -- 进行中/已完成/已驳回
      current_node    TEXT DEFAULT '',          -- 当前待审批节点名称
      started_by      TEXT DEFAULT '',
      started_by_id   TEXT DEFAULT '',
      started_at      TEXT DEFAULT (datetime('now','localtime')),
      completed_at    TEXT DEFAULT ''
  )`,
      `CREATE TABLE IF NOT EXISTS t_flow_reject_attachments (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_instance_id TEXT NOT NULL,
      contract_id     TEXT NOT NULL,
      node_id         TEXT DEFAULT '',
      file_name       TEXT NOT NULL,
      file_path       TEXT DEFAULT '',
      file_size       INTEGER DEFAULT 0,
      uploader        TEXT DEFAULT '',
      uploader_id     TEXT DEFAULT '',
      uploaded_at     TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_flow_cc_records (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_instance_id TEXT NOT NULL,
      contract_id     TEXT NOT NULL,
      contract_no     TEXT DEFAULT '',
      cc_target       TEXT DEFAULT '',         -- 抄送目标角色/部门
      cc_target_name  TEXT DEFAULT '',          -- 抄送目标名称
      cc_reason       TEXT DEFAULT '',          -- 抄送原因
      sent_at         TEXT DEFAULT (datetime('now','localtime')),
      is_read         INTEGER DEFAULT 0
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_change_form (

      id                TEXT PRIMARY KEY,
      contract_id       TEXT NOT NULL,           -- 关联原合同ID
      contract_no       TEXT DEFAULT '',          -- 原合同编号
      contract_name     TEXT DEFAULT '',          -- 原合同名称
      change_content    TEXT DEFAULT '',          -- 变更内容描述
      change_reason     TEXT DEFAULT '',          -- 变更原因
      changed_terms     TEXT DEFAULT '',          -- 变更后的条款（JSON或文本）
      change_attachment TEXT DEFAULT '',          -- 变更附件路径
      effective_date    TEXT DEFAULT '',          -- 变更生效日期
      version_num       INTEGER DEFAULT 0,        -- 变更版本号（从1开始）
      -- 流程关联
      flow_instance_id  TEXT DEFAULT '',          -- 关联流程实例ID
      change_status     TEXT DEFAULT '草稿',      -- 草稿/审批中/已驳回/已生效
      current_node      TEXT DEFAULT '',          -- 当前审批节点
      -- 原终审领导信息（用于确定最终审批人）
      original_amount   REAL DEFAULT 0,           -- 原合同金额
      original_final_approver TEXT DEFAULT '',     -- 原终审领导角色
      -- 申请人信息
      applicant         TEXT DEFAULT '',
      applicant_id      TEXT DEFAULT '',
      applicant_dept    TEXT DEFAULT '',
      -- 审批完成后的归档信息
      archived_by       TEXT DEFAULT '',
      archived_by_id   TEXT DEFAULT '',
      archived_at       TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      updated_at        TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_change_versions (

      id                TEXT PRIMARY KEY,
      contract_id       TEXT NOT NULL,           -- 关联合同ID
      contract_no       TEXT DEFAULT '',          -- 合同编号
      change_form_id    TEXT DEFAULT '',          -- 关联变更表单ID
      version_num       INTEGER NOT NULL,         -- 版本号（0=原始版本，1=第一次变更...）
      version_type      TEXT DEFAULT 'original',  -- original/change
      -- 变更前快照（JSON完整快照，不可覆盖）
      before_snapshot   TEXT DEFAULT '{}',
      -- 变更后快照（JSON完整快照，不可覆盖）
      after_snapshot    TEXT DEFAULT '{}',
      -- 变更摘要
      change_summary    TEXT DEFAULT '',          -- 变更摘要说明
      changed_fields    TEXT DEFAULT '[]',        -- 变更的字段列表（JSON数组）
      -- 操作人
      operator          TEXT DEFAULT '',
      operator_id       TEXT DEFAULT '',
      operator_dept     TEXT DEFAULT '',
      -- 关联信息
      flow_instance_id  TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_end_form (

      id                TEXT PRIMARY KEY,
      contract_id       TEXT NOT NULL,           -- 关联原合同ID
      contract_no       TEXT DEFAULT '',          -- 原合同编号
      contract_name     TEXT DEFAULT '',          -- 原合同名称
      end_type          TEXT DEFAULT '终止',      -- 解除/终止
      end_reason        TEXT DEFAULT '',          -- 终止原因
      end_description   TEXT DEFAULT '',          -- 详细说明
      end_date          TEXT DEFAULT '',          -- 终止生效日期
      settle_amount     REAL DEFAULT 0,           -- 结算金额
      settle_desc       TEXT DEFAULT '',          -- 结算说明
      attachment_path   TEXT DEFAULT '',          -- 附件路径
      -- 流程关联
      flow_instance_id  TEXT DEFAULT '',          -- 关联流程实例ID
      end_status        TEXT DEFAULT '草稿',      -- 草稿/审批中/已驳回/已生效
      current_node      TEXT DEFAULT '',          -- 当前审批节点
      -- 对应领导信息（根据原合同金额确定）
      original_amount   REAL DEFAULT 0,           -- 原合同金额
      original_final_approver TEXT DEFAULT '',     -- 对应领导角色
      -- 申请人信息
      applicant         TEXT DEFAULT '',
      applicant_id      TEXT DEFAULT '',
      applicant_dept    TEXT DEFAULT '',
      -- 审批完成后的归档信息
      archived_by       TEXT DEFAULT '',
      archived_by_id   TEXT DEFAULT '',
      archived_at       TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      updated_at        TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_void_form (

      id                TEXT PRIMARY KEY,
      contract_id       TEXT NOT NULL,           -- 关联原合同ID
      contract_no       TEXT DEFAULT '',          -- 原合同编号
      contract_name     TEXT DEFAULT '',          -- 原合同名称
      void_reason       TEXT DEFAULT '',          -- 作废原因
      void_description  TEXT DEFAULT '',          -- 详细说明
      void_type         TEXT DEFAULT '主动作废',  -- 主动作废/违约作废/法律作废
      attachment_path   TEXT DEFAULT '',          -- 附件路径
      -- 流程关联
      flow_instance_id  TEXT DEFAULT '',          -- 关联流程实例ID
      void_status       TEXT DEFAULT '草稿',      -- 草稿/审批中/已驳回/已完成
      current_node      TEXT DEFAULT '',          -- 当前审批节点
      -- 申请人信息
      applicant         TEXT DEFAULT '',
      applicant_id      TEXT DEFAULT '',
      applicant_dept    TEXT DEFAULT '',
      created_at        TEXT DEFAULT (datetime('now','localtime')),
      updated_at        TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_borrow_form (

      id                TEXT PRIMARY KEY,
      contract_id       TEXT NOT NULL,           -- 关联合同ID
      contract_no       TEXT DEFAULT '',          -- 合同编号
      contract_name     TEXT DEFAULT '',          -- 合同名称
      borrow_purpose    TEXT DEFAULT '',          -- 借阅用途
      borrow_period      TEXT DEFAULT '',          -- 借阅期限(天数)
      expected_return    TEXT DEFAULT '',          -- 预计归还日期
      allow_download     INTEGER DEFAULT 0,       -- 是否允许下载原件(0否/1是)
      is_confidential    INTEGER DEFAULT 0,       -- 是否涉密合同(0否/1是)
      -- 流程关联
      flow_instance_id  TEXT DEFAULT '',          -- 关联流程实例ID
      borrow_status      TEXT DEFAULT '草稿',      -- 草稿/审批中/已驳回/已批准/已归还/已逾期
      current_node       TEXT DEFAULT '',          -- 当前审批节点
      -- 申请人信息
      applicant          TEXT DEFAULT '',
      applicant_id       TEXT DEFAULT '',
      applicant_dept     TEXT DEFAULT '',
      borrow_date        TEXT DEFAULT '',          -- 借阅日期
      -- 审批信息
      approved_by        TEXT DEFAULT '',
      approved_by_id     TEXT DEFAULT '',
      approved_at        TEXT DEFAULT '',
      -- 归还信息
      returned_by        TEXT DEFAULT '',
      returned_by_id     TEXT DEFAULT '',
      returned_at        TEXT DEFAULT '',
      return_remark      TEXT DEFAULT '',          -- 归还备注
      -- 逾期提醒
      is_overdue         INTEGER DEFAULT 0,       -- 是否逾期(0否/1是)
      overdue_reminded   INTEGER DEFAULT 0,       -- 是否已发送逾期提醒
      created_at         TEXT DEFAULT (datetime('now','localtime')),
      updated_at         TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_audit_log (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id     TEXT NOT NULL,             -- 关联合同ID
      user_id         TEXT DEFAULT '',            -- 操作人ID
      user_name       TEXT DEFAULT '',            -- 操作人姓名
      user_dept       TEXT DEFAULT '',            -- 操作人部门
      action_type     TEXT DEFAULT '',            -- 操作类型：查看/下载/归档/用印/编辑/删除等
      detail          TEXT DEFAULT '',            -- 操作详情
      ip_address      TEXT DEFAULT '',            -- 操作IP
      created_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_confidential_access (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         TEXT NOT NULL,             -- 用户ID
      user_name       TEXT DEFAULT '',            -- 用户姓名
      user_dept       TEXT DEFAULT '',            -- 用户部门
      contract_role   TEXT DEFAULT '',            -- 合同角色
      status          INTEGER DEFAULT 1,          -- 1=有效, 0=禁用
      granted_by      TEXT DEFAULT '',            -- 授权人
      granted_at      TEXT DEFAULT (datetime('now','localtime')),
      remark          TEXT DEFAULT '',
      UNIQUE(user_id)
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_risk_scores (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id     TEXT NOT NULL,               -- 关联合同ID
      contract_no     TEXT DEFAULT '',              -- 合同编号
      contract_name   TEXT DEFAULT '',              -- 合同名称
      risk_score      INTEGER DEFAULT 0,            -- 风险总分(0-100, 越高越危险)
      risk_level      TEXT DEFAULT '低',             -- 风险等级: 低/中/高/极高
      factor_amount   INTEGER DEFAULT 0,            -- 金额风险因子分
      factor_duration INTEGER DEFAULT 0,            -- 期限风险因子分
      factor_status   INTEGER DEFAULT 0,            -- 状态风险因子分
      factor_expiry   INTEGER DEFAULT 0,            -- 到期临近风险因子分
      factor_missing  INTEGER DEFAULT 0,            -- 缺失字段风险因子分
      factor_risk_remark INTEGER DEFAULT 0,         -- 内部风险备注因子分
      factor_confidential INTEGER DEFAULT 0,        -- 机密性风险因子分
      evaluated_at    TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(contract_id, evaluated_at)
  )`,
      `CREATE TABLE IF NOT EXISTS t_contract_alerts (

      id              TEXT PRIMARY KEY,
      contract_id     TEXT NOT NULL,               -- 关联合同ID
      contract_no     TEXT DEFAULT '',              -- 合同编号
      contract_name   TEXT DEFAULT '',              -- 合同名称
      alert_type      TEXT NOT NULL,                -- 预警类型: expiring/expired/stale_draft/high_risk/missing_info
      severity        TEXT DEFAULT '中',             -- 紧急程度: 低/中/高/紧急
      title           TEXT DEFAULT '',               -- 预警标题
      description     TEXT DEFAULT '',               -- 预警描述
      status          TEXT DEFAULT '待处理',          -- 状态: 待处理/已处理/已忽略
      handled_by      TEXT DEFAULT '',               -- 处理人
      handled_by_id   TEXT DEFAULT '',               -- 处理人ID
      handled_at      TEXT DEFAULT '',               -- 处理时间
      handled_remark  TEXT DEFAULT '',               -- 处理备注
      created_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_partner_credit (

      id                  TEXT PRIMARY KEY,
      partner_name        TEXT NOT NULL,              -- 合作方名称
      social_credit_code  TEXT DEFAULT '',             -- 统一社会信用代码
      contact_person      TEXT DEFAULT '',             -- 联系人
      contact_phone       TEXT DEFAULT '',             -- 联系电话
      credit_rating       TEXT DEFAULT 'B',            -- 信用评级: A/B/C/D
      total_contracts     INTEGER DEFAULT 0,           -- 合同总数
      total_amount        REAL DEFAULT 0,              -- 合同总金额
      on_time_rate        REAL DEFAULT 100,             -- 履约准时率(%)
      risk_level          TEXT DEFAULT '低',            -- 风险等级: 低/中/高
      remark              TEXT DEFAULT '',             -- 备注
      creator             TEXT DEFAULT '',             -- 创建人
      creator_id          TEXT DEFAULT '',             -- 创建人ID
      created_at          TEXT DEFAULT (datetime('now','localtime')),
      updated_at          TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS asset_requisitions (

      id          TEXT PRIMARY KEY,
      asset_id    TEXT NOT NULL,
      asset_name  TEXT DEFAULT '',
      category    TEXT DEFAULT '',
      requisitioner TEXT DEFAULT '',
      requisitioner_id TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      req_date    TEXT,
      purpose     TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      submitter   TEXT DEFAULT '',
      submitter_id TEXT DEFAULT '',
      approval_flow TEXT DEFAULT '[]',
      remark      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS purchases (

      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      category    TEXT DEFAULT '',
      amount      REAL DEFAULT 0,
      qty         INTEGER DEFAULT 0,
      unit        TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      applicant   TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      date        TEXT,
      vendor      TEXT DEFAULT '',
      desc        TEXT DEFAULT '',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS projects (

      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      customer    TEXT DEFAULT '',
      manager     TEXT DEFAULT '',
      budget      REAL DEFAULT 0,
      start_date  TEXT,
      end_date    TEXT,
      status      TEXT DEFAULT '待审批',
      progress    INTEGER DEFAULT 0,
      type        TEXT DEFAULT '',
      desc        TEXT DEFAULT '',
      nodes       TEXT DEFAULT '[]',
      approval_flow TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS project_progress (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  TEXT NOT NULL,
      phase       TEXT DEFAULT '',
      content     TEXT DEFAULT '',
      progress_pct INTEGER DEFAULT 0,
      submitter   TEXT DEFAULT '',
      submitter_id TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      approval_flow TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS suppliers (

      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      short_name  TEXT DEFAULT '',
      category    TEXT DEFAULT '',
      level       TEXT DEFAULT 'C',
      contact     TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      email       TEXT DEFAULT '',
      address     TEXT DEFAULT '',
      bank        TEXT DEFAULT '',
      account     TEXT DEFAULT '',
      business_scope TEXT DEFAULT '',
      total_orders INTEGER DEFAULT 0,
      total_amount REAL DEFAULT 0,
      rating      REAL DEFAULT 0,
      status      TEXT DEFAULT '待审批',
      coop_date   TEXT,
      remark      TEXT DEFAULT '',
      qualifications TEXT DEFAULT '[]',
      products    TEXT DEFAULT '[]',
      timeline    TEXT DEFAULT '[]',
      submitter      TEXT DEFAULT '',
      submitter_id   TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      approval_flow  TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS leaves (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant   TEXT NOT NULL,
      applicant_id TEXT,
      dept        TEXT DEFAULT '',
      type        TEXT DEFAULT '',
      start_date  TEXT,
      end_date    TEXT,
      days        REAL DEFAULT 0,
      reason      TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      approver    TEXT DEFAULT '',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS expenses (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant   TEXT NOT NULL,
      applicant_id TEXT,
      dept        TEXT DEFAULT '',
      category    TEXT DEFAULT '',
      amount      REAL DEFAULT 0,
      date        TEXT,
      desc        TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      receipts    INTEGER DEFAULT 0,
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS documents (

      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      type        TEXT DEFAULT '通知公告',
      author      TEXT DEFAULT '',
      author_id   TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      date        TEXT,
      status      TEXT DEFAULT '草稿',
      distribute_scope TEXT DEFAULT '',
      content     TEXT DEFAULT '',
      read_count  INTEGER DEFAULT 0,
      doc_flow    TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS finance_records (

      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      category    TEXT DEFAULT '',
      amount      REAL DEFAULT 0,
      date        TEXT,
      dept        TEXT DEFAULT '',
      desc        TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      related_id  TEXT DEFAULT '',
      submitter   TEXT DEFAULT '',
      submitter_id TEXT DEFAULT '',
      approval_flow TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS fixed_assets (

      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      user        TEXT DEFAULT '',
      purchase_date TEXT,
      original_value REAL DEFAULT 0,
      salvage_rate REAL DEFAULT 0.05,
      useful_life INTEGER DEFAULT 36,
      accumulated_dep REAL DEFAULT 0,
      net_value   REAL DEFAULT 0,
      status      TEXT DEFAULT '使用中',
      submitter   TEXT DEFAULT '',
      submitter_id TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      approval_flow TEXT DEFAULT '[]',
      remark      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS salary_records (

      id          TEXT PRIMARY KEY,
      emp_id      TEXT NOT NULL,
      emp_name    TEXT NOT NULL,
      dept        TEXT DEFAULT '',
      level       TEXT DEFAULT '',
      month       TEXT NOT NULL,
      base_salary REAL DEFAULT 0,
      performance_score INTEGER DEFAULT 0,
      performance_grade TEXT DEFAULT 'B',
      performance_bonus REAL DEFAULT 0,
      allowance   REAL DEFAULT 0,
      overtime    REAL DEFAULT 0,
      social_ins  REAL DEFAULT 0,
      housing_fund REAL DEFAULT 0,
      tax         REAL DEFAULT 0,
      gross_pay   REAL DEFAULT 0,
      net_pay     REAL DEFAULT 0,
      status      TEXT DEFAULT '待审核',
      approver    TEXT DEFAULT '',
      sign_time   TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS salary_templates (

      level          TEXT PRIMARY KEY,
      level_name     TEXT DEFAULT '',
      base_salary    REAL DEFAULT 0,
      performance_ratio REAL DEFAULT 0,
      allowance      REAL DEFAULT 0,
      social_ins_base REAL DEFAULT 0,
      housing_fund_rate REAL DEFAULT 0.12,
      desc           TEXT DEFAULT ''
  )`,
      `CREATE TABLE IF NOT EXISTS checkins (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      user_name   TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      check_in_time TEXT,
      check_in_loc TEXT DEFAULT '',
      check_in_photo TEXT DEFAULT '',
      check_out_time TEXT,
      check_out_photo TEXT DEFAULT '',
      status      TEXT DEFAULT 'signed_in',
      date        TEXT,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS attendance_schedules (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      season      TEXT NOT NULL DEFAULT 'summer',
      work_start  TEXT DEFAULT '09:00',
      work_end    TEXT DEFAULT '18:00',
      lunch_start TEXT DEFAULT '12:00',
      lunch_end   TEXT DEFAULT '13:30',
      active      INTEGER DEFAULT 0,
      updated_by  TEXT DEFAULT '',
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS work_reports (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      user_name   TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      type        TEXT DEFAULT '日报',
      date        TEXT,
      month       TEXT DEFAULT '',
      content     TEXT DEFAULT '',
      plan        TEXT DEFAULT '',
      summary     TEXT DEFAULT '',
      next_plan   TEXT DEFAULT '',
      status      TEXT DEFAULT '已提交',
      approval_flow TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS sales_records (

      id          TEXT PRIMARY KEY,
      date        TEXT,
      salesperson TEXT DEFAULT '',
      customer    TEXT DEFAULT '',
      product     TEXT DEFAULT '',
      amount      REAL DEFAULT 0,
      region      TEXT DEFAULT '',
      status      TEXT DEFAULT '待确认',
      remark      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS business_trips (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant   TEXT NOT NULL,
      applicant_id TEXT,
      dept        TEXT DEFAULT '',
      destination TEXT DEFAULT '',
      start_date  TEXT,
      end_date    TEXT,
      days        REAL DEFAULT 0,
      purpose     TEXT DEFAULT '',
      budget      REAL DEFAULT 0,
      status      TEXT DEFAULT '待审批',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS logistics (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT DEFAULT '',
      title       TEXT DEFAULT '',
      applicant   TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      status      TEXT DEFAULT '待处理',
      date        TEXT,
      detail      TEXT DEFAULT '',
      cost        REAL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS vehicles (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      plate       TEXT DEFAULT '',
      model       TEXT DEFAULT '',
      driver      TEXT DEFAULT '',
      status      TEXT DEFAULT '可用',
      last_maintenance TEXT,
      next_maintenance TEXT,
      mileage     INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS approval_flows (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      name        TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      steps       TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS perm_audit_logs (

      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      time        TEXT,
      operator    TEXT DEFAULT '',
      action      TEXT DEFAULT '',
      target      TEXT DEFAULT '',
      detail      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS announcements (

      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      category    TEXT DEFAULT '',
      content     TEXT DEFAULT '',
      author      TEXT DEFAULT '',
      author_dept TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      flow        TEXT DEFAULT '[]',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS hr_applications (

      id          TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      emp_id      TEXT DEFAULT '',
      emp_name    TEXT DEFAULT '',
      dept        TEXT DEFAULT '',
      role        TEXT DEFAULT '',
      level       TEXT DEFAULT '',
      education   TEXT DEFAULT '',
      join_date   TEXT DEFAULT '',
      password    TEXT DEFAULT '',
      phone       TEXT DEFAULT '',
      status      TEXT DEFAULT '待审批',
      applicant   TEXT DEFAULT '',
      applicant_dept TEXT DEFAULT '',
      flow        TEXT DEFAULT '[]',
      remark      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now','localtime')),
      updated_at  TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_expense (

      id              TEXT PRIMARY KEY,
      form_no         TEXT UNIQUE NOT NULL,          -- 报销单号 BX-YYYYMMDD-NNN
      applicant       TEXT NOT NULL,                 -- 申请人姓名
      applicant_id    TEXT DEFAULT '',               -- 申请人工号
      applicant_dept  TEXT DEFAULT '',               -- 申请部门
      expense_type    TEXT DEFAULT '普通报销',        -- 类型: 普通报销/差旅报销
      status          TEXT DEFAULT '草稿',            -- 草稿/待审批/审批中/已通过/已驳回/已付款
      total_amount    REAL DEFAULT 0,                -- 报销总金额
      travel_days     INTEGER DEFAULT 0,             -- 出差天数(差旅用)
      travel_subsidy  REAL DEFAULT 0,                -- 差旅补贴金额
      loan_deduct     REAL DEFAULT 0,                -- 借款抵扣金额
      actual_amount   REAL DEFAULT 0,                -- 实付金额 = total - loan_deduct
      bank_account    TEXT DEFAULT '',               -- 收款银行账号
      bank_name       TEXT DEFAULT '',               -- 开户行
      reimburse_date  TEXT DEFAULT '',               -- 报销日期
      settle_date     TEXT DEFAULT '',               -- 付款日期
      attachments     TEXT DEFAULT '[]',             -- 附件JSON
      remark          TEXT DEFAULT '',
      approval_flow   TEXT DEFAULT '[]',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_expense_detail (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id      TEXT NOT NULL,                 -- 关联报销单ID
      category        TEXT DEFAULT '',                -- 费用类别: 交通费/住宿费/餐饮费/办公用品/通讯费/其他
      amount          REAL DEFAULT 0,                -- 金额
      occur_date      TEXT DEFAULT '',               -- 发生日期
      desc            TEXT DEFAULT '',                -- 摘要说明
      is_over_standard INTEGER DEFAULT 0,            -- 是否超标 0/1
      standard_amount REAL DEFAULT 0,                -- 标准金额
      over_amount     REAL DEFAULT 0,                -- 超标金额
      invoice_ids     TEXT DEFAULT '[]',             -- 关联发票ID JSON
      created_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_voucher (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id      TEXT NOT NULL,                 -- 关联报销单ID
      voucher_type    TEXT DEFAULT '',               -- 凭证类型: 发票/收据/银行回单/电子凭证/其他
      voucher_no      TEXT DEFAULT '',               -- 凭证号码
      amount          REAL DEFAULT 0,                -- 凭证金额
      voucher_date    TEXT DEFAULT '',               -- 凭证日期
      description     TEXT DEFAULT '',               -- 摘要说明
      file_path       TEXT DEFAULT '',               -- 附件路径(照片/扫描件)
      file_name       TEXT DEFAULT '',               -- 附件文件名
      uploaded_by     TEXT DEFAULT '',               -- 上传人
      uploaded_by_id  TEXT DEFAULT '',               -- 上传人ID
      created_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_company_info (

      id                  INTEGER PRIMARY KEY CHECK (id = 1),
      company_name        TEXT DEFAULT '',               -- 公司名称
      short_name          TEXT DEFAULT '',               -- 公司简称
      credit_code         TEXT DEFAULT '',               -- 统一社会信用代码
      legal_person        TEXT DEFAULT '',               -- 法定代表人
      registered_capital  TEXT DEFAULT '',               -- 注册资本
      established_date    TEXT DEFAULT '',               -- 成立日期
      registered_address  TEXT DEFAULT '',               -- 注册地址
      office_address      TEXT DEFAULT '',               -- 办公地址
      phone               TEXT DEFAULT '',               -- 联系电话
      fax                 TEXT DEFAULT '',               -- 传真号码
      email               TEXT DEFAULT '',               -- 电子邮箱
      website             TEXT DEFAULT '',               -- 公司网址
      business_scope      TEXT DEFAULT '',               -- 经营范围
      bank_name           TEXT DEFAULT '',               -- 开户银行
      bank_account        TEXT DEFAULT '',               -- 银行账号
      tax_number          TEXT DEFAULT '',               -- 税务登记号
      invoice_title       TEXT DEFAULT '',               -- 发票抬头
      remark              TEXT DEFAULT '',               -- 备注说明
      updated_by          TEXT DEFAULT '',               -- 最后修改人
      updated_by_id       TEXT DEFAULT '',               -- 最后修改人ID
      updated_at          TEXT DEFAULT ''                -- 最后修改时间
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_loan (

      id                  TEXT PRIMARY KEY,
      form_no             TEXT UNIQUE NOT NULL,       -- 借款单号 JK-YYYYMMDD-NNN
      applicant           TEXT NOT NULL,
      applicant_id        TEXT DEFAULT '',
      applicant_dept      TEXT DEFAULT '',
      loan_type           TEXT DEFAULT '备用金',       -- 备用金/差旅借款/采购借款/其他
      amount              REAL DEFAULT 0,             -- 借款金额
      purpose             TEXT DEFAULT '',             -- 借款事由
      expected_repay_date TEXT DEFAULT '',             -- 预计还款日期
      actual_repay_date   TEXT DEFAULT '',             -- 实际还款日期
      repaid_amount       REAL DEFAULT 0,             -- 已还金额
      outstanding_amount  REAL DEFAULT 0,             -- 未还金额
      status              TEXT DEFAULT '草稿',          -- 草稿/待审批/审批中/已通过/已驳回/已还款/已逾期
      settle_type         TEXT DEFAULT '',            -- 还款方式: 报销冲抵/现金归还/银行转账
      approval_flow       TEXT DEFAULT '[]',
      remark              TEXT DEFAULT '',
      created_at          TEXT DEFAULT (datetime('now','localtime')),
      updated_at          TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_payment (

      id              TEXT PRIMARY KEY,
      form_no         TEXT UNIQUE NOT NULL,           -- 付款单号 FK-YYYYMMDD-NNN
      applicant       TEXT NOT NULL,
      applicant_id    TEXT DEFAULT '',
      applicant_dept  TEXT DEFAULT '',
      payment_type    TEXT DEFAULT '供应商付款',       -- 供应商付款/合同付款/预付款/其他
      payee_name      TEXT DEFAULT '',                -- 收款方名称
      payee_account   TEXT DEFAULT '',                -- 收款方账号
      payee_bank      TEXT DEFAULT '',                -- 收款方开户行
      contract_id    TEXT DEFAULT '',                -- 关联合同ID
      contract_name  TEXT DEFAULT '',                -- 关联合同名称
      supplier_id    TEXT DEFAULT '',                -- 关联供应商ID
      total_amount    REAL DEFAULT 0,                -- 付款总金额
      paid_amount     REAL DEFAULT 0,                -- 已付金额
      this_amount     REAL DEFAULT 0,                -- 本次付款金额
      payment_stage   TEXT DEFAULT '全款',           -- 首付款/进度款/尾款/全款
      payment_method  TEXT DEFAULT '银行转账',        -- 银行转账/支票/承兑汇票
      purpose         TEXT DEFAULT '',               -- 付款用途
      status          TEXT DEFAULT '草稿',            -- 草稿/待审批/审批中/已通过/已驳回/已付款
      pay_date        TEXT DEFAULT '',               -- 付款日期
      approval_flow   TEXT DEFAULT '[]',
      remark          TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_invoice (

      id                  TEXT PRIMARY KEY,
      invoice_code        TEXT DEFAULT '',            -- 发票代码
      invoice_no          TEXT DEFAULT '',            -- 发票号码
      invoice_type        TEXT DEFAULT '',            -- 类型: 增值税专用发票/增值税普通发票/全电发票/其他
      title               TEXT DEFAULT '',            -- 发票抬头
      seller              TEXT DEFAULT '',            -- 销方名称
      buyer              TEXT DEFAULT '',             -- 买方名称
      amount              REAL DEFAULT 0,             -- 不含税金额
      tax_amount          REAL DEFAULT 0,             -- 税额
      total_amount        REAL DEFAULT 0,             -- 价税合计
      tax_rate            TEXT DEFAULT '',            -- 税率
      invoice_date        TEXT DEFAULT '',            -- 开票日期
      check_code          TEXT DEFAULT '',            -- 校验码
      status              TEXT DEFAULT '正常',        -- 正常/作废/异常
      source              TEXT DEFAULT '手动录入',     -- 手动录入/AI OCR识别/批量导入
      ocr_raw             TEXT DEFAULT '',            -- OCR原始识别结果JSON
      ocr_confidence      REAL DEFAULT 0,             -- OCR置信度
      verified            TEXT DEFAULT '未校验',       -- 未校验/已校验/存疑
      verified_result     TEXT DEFAULT '',            -- 校验结果
      verified_date       TEXT DEFAULT '',            -- 校验日期
      related_expense_id  TEXT DEFAULT '',            -- 关联报销单ID
      related_payment_id  TEXT DEFAULT '',            -- 关联付款单ID
      operator            TEXT DEFAULT '',            -- 录入人
      operator_id         TEXT DEFAULT '',            -- 录入人ID
      remark              TEXT DEFAULT '',
      created_at          TEXT DEFAULT (datetime('now','localtime')),
      updated_at          TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_budget (

      id              TEXT PRIMARY KEY,
      budget_no      TEXT UNIQUE NOT NULL,            -- 预算编号 YS-YYYY-NNN
      year            INTEGER NOT NULL,               -- 年度
      dept            TEXT DEFAULT '',                -- 部门
      project_id     TEXT DEFAULT '',                -- 项目ID(可选)
      project_name   TEXT DEFAULT '',                -- 项目名称
      category       TEXT DEFAULT '',                -- 类别: 人员成本/办公费用/差旅费用/采购费用/营销费用/其他
      total_amount    REAL DEFAULT 0,                -- 预算总额
      used_amount     REAL DEFAULT 0,                -- 已使用金额
      occupied_amount REAL DEFAULT 0,                -- 占用中金额
      available_amount REAL DEFAULT 0,               -- 可用金额 = total - used - occupied
      status          TEXT DEFAULT '草稿',            -- 草稿/待审批/已审批/已执行/已冻结
      approval_flow   TEXT DEFAULT '[]',
      creator         TEXT DEFAULT '',
      creator_id      TEXT DEFAULT '',
      remark          TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_budget_occupy (

      id              TEXT PRIMARY KEY,
      budget_id      TEXT NOT NULL,                   -- 关联预算ID
      occupy_type    TEXT DEFAULT '',                -- 占用类型: 报销/付款/借款
      related_id     TEXT DEFAULT '',                -- 关联单据ID
      related_form_no TEXT DEFAULT '',                -- 关联单号
      amount          REAL DEFAULT 0,                -- 占用金额
      status          TEXT DEFAULT '占用中',          -- 占用中/已确认/已释放/已回滚
      operator        TEXT DEFAULT '',
      operator_id    TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_hook_log (

      id              TEXT PRIMARY KEY,
      log_no          TEXT DEFAULT '',                -- 日志编号
      sync_type       TEXT DEFAULT '手动',            -- 自动/手动
      direction       TEXT DEFAULT '推送',            -- 推送/回调
      source_type     TEXT DEFAULT '',                -- 源单据类型: 报销/付款/借款
      source_id       TEXT DEFAULT '',                -- 源单据ID
      source_form_no  TEXT DEFAULT '',                -- 源单号
      target_system   TEXT DEFAULT '',                -- 目标系统: ERP/金蝶/用友
      field_mapping   TEXT DEFAULT '{}',             -- 字段映射JSON
      payload         TEXT DEFAULT '{}',             -- 推送数据JSON
      response        TEXT DEFAULT '{}',             -- 响应数据JSON
      status          TEXT DEFAULT '待推送',          -- 待推送/推送中/成功/失败/重试中
      retry_count     INTEGER DEFAULT 0,             -- 重试次数
      error_msg       TEXT DEFAULT '',                -- 错误信息
      voucher_no      TEXT DEFAULT '',                -- 凭证号回写
      operator        TEXT DEFAULT '',
      operator_id     TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_config (

      id              TEXT PRIMARY KEY,
      config_key      TEXT UNIQUE NOT NULL,           -- 配置键
      config_value    TEXT DEFAULT '',                -- 配置值
      config_type     TEXT DEFAULT '参数',            -- 参数/标准/流程/编码/模板/接口
      category        TEXT DEFAULT '',                -- 分类
      description     TEXT DEFAULT '',
      is_system       INTEGER DEFAULT 0,             -- 是否系统内置 0/1
      status          TEXT DEFAULT '启用',            -- 启用/禁用
      updated_by      TEXT DEFAULT '',
      updated_by_id   TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_seal (

      id              TEXT PRIMARY KEY,
      seal_no         TEXT DEFAULT '',                -- 签章编号
      source_type     TEXT DEFAULT '',                -- 源单据类型: 报销/付款/合同
      source_id       TEXT DEFAULT '',                -- 源单据ID
      source_form_no  TEXT DEFAULT '',                -- 源单号
      pdf_path        TEXT DEFAULT '',                -- 定稿PDF路径
      seal_type       TEXT DEFAULT '公章',            -- 公章/财务章/法人章
      seal_position   TEXT DEFAULT '正文',            -- 正文/骑缝
      seal_image      TEXT DEFAULT '',                -- 签章图片路径
      timestamp_server TEXT DEFAULT '',               -- 时间戳服务器
      timestamp_token  TEXT DEFAULT '',               -- 时间戳令牌
      hash_value      TEXT DEFAULT '',                -- 防篡改哈希
      seal_status     TEXT DEFAULT '待签章',          -- 待签章/已签章/已作废
      seal_date       TEXT DEFAULT '',
      operator        TEXT DEFAULT '',
      operator_id     TEXT DEFAULT '',
      remark          TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_payee (

      id              TEXT PRIMARY KEY,
      payee_name      TEXT NOT NULL,                 -- 收款方名称
      payee_type      TEXT DEFAULT '供应商',          -- 供应商/员工/其他
      bank_account    TEXT DEFAULT '',                -- 银行账号
      bank_name       TEXT DEFAULT '',                -- 开户行
      bank_branch     TEXT DEFAULT '',                -- 支行名称
      related_id      TEXT DEFAULT '',                -- 关联ID(供应商ID/员工ID)
      status          TEXT DEFAULT '正常',            -- 正常/已停用
      creator         TEXT DEFAULT '',
      creator_id      TEXT DEFAULT '',
      remark          TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
      `CREATE TABLE IF NOT EXISTS t_finance_invoice_check (

      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_code    TEXT DEFAULT '',
      invoice_no      TEXT DEFAULT '',
      invoice_id      TEXT DEFAULT '',                -- 首次出现的发票ID
      duplicate_invoice_id TEXT DEFAULT '',           -- 重复发票ID
      operator        TEXT DEFAULT '',
      operator_id     TEXT DEFAULT '',
      created_at      TEXT DEFAULT (datetime('now','localtime'))
  )`,
    ];
    for (const sql of createStmts) {
      try { db.exec(sql); } catch (e) { console.log('[Migration 007] 建表跳过/失败:', e.message); }
    }

    const alterStmts = [
      { table: 'users', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'users', col: 'emp_id', def: "emp_id      TEXT DEFAULT ''" },
      { table: 'users', col: 'password', def: "password    TEXT DEFAULT ''" },
      { table: 'users', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'users', col: 'avatar', def: "avatar      TEXT DEFAULT ''" },
      { table: 'users', col: 'avatar_color', def: "avatar_color TEXT DEFAULT '#6366f1'" },
      { table: 'users', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'users', col: 'role', def: "role        TEXT DEFAULT ''" },
      { table: 'users', col: 'phone', def: "phone       TEXT DEFAULT ''" },
      { table: 'users', col: 'status', def: "status      TEXT DEFAULT '在职'" },
      { table: 'users', col: 'join_date', def: "join_date   TEXT" },
      { table: 'users', col: 'level', def: "level       TEXT DEFAULT 'P3'" },
      { table: 'users', col: 'education', def: "education   TEXT DEFAULT ''" },
      { table: 'users', col: 'age', def: "age         INTEGER DEFAULT 0" },
      { table: 'users', col: 'salary', def: "salary      TEXT DEFAULT '—'" },
      { table: 'users', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'users', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'departments', col: 'id', def: "id          INTEGER PRIMARY KEY" },
      { table: 'departments', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'departments', col: 'head', def: "head        TEXT DEFAULT ''" },
      { table: 'departments', col: 'count', def: "count       INTEGER DEFAULT 0" },
      { table: 'departments', col: 'headcount', def: "headcount   INTEGER DEFAULT 0" },
      { table: 'departments', col: 'color', def: "color       TEXT DEFAULT '#6366f1'" },
      { table: 'departments', col: 'icon', def: "icon        TEXT DEFAULT 'folder'" },
      { table: 'departments', col: 'parent_id', def: "parent_id   INTEGER DEFAULT 0" },
      { table: 'departments', col: 'description', def: "description TEXT DEFAULT ''" },
      { table: 'departments', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'roles', col: 'id', def: "id          INTEGER PRIMARY KEY" },
      { table: 'roles', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'roles', col: 'desc', def: "desc        TEXT DEFAULT ''" },
      { table: 'roles', col: 'color', def: "color       TEXT DEFAULT '#6366f1'" },
      { table: 'roles', col: 'user_count', def: "user_count  INTEGER DEFAULT 0" },
      { table: 'roles', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'permissions', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'permissions', col: 'role', def: "role        TEXT DEFAULT ''" },
      { table: 'permissions', col: 'module', def: "module      TEXT DEFAULT ''" },
      { table: 'permissions', col: 'level', def: "level       REAL DEFAULT 0" },
      { table: 'permissions', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'customers', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'customers', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'customers', col: 'contact', def: "contact     TEXT DEFAULT ''" },
      { table: 'customers', col: 'phone', def: "phone       TEXT DEFAULT ''" },
      { table: 'customers', col: 'email', def: "email       TEXT DEFAULT ''" },
      { table: 'customers', col: 'address', def: "address     TEXT DEFAULT ''" },
      { table: 'customers', col: 'level', def: "level       TEXT DEFAULT 'C'" },
      { table: 'customers', col: 'industry', def: "industry    TEXT DEFAULT ''" },
      { table: 'customers', col: 'source', def: "source      TEXT DEFAULT ''" },
      { table: 'customers', col: 'status', def: "status      TEXT DEFAULT '潜在'" },
      { table: 'customers', col: 'owner', def: "owner       TEXT DEFAULT ''" },
      { table: 'customers', col: 'owner_dept', def: "owner_dept  TEXT DEFAULT ''" },
      { table: 'customers', col: 'submitter', def: "submitter   TEXT DEFAULT ''" },
      { table: 'customers', col: 'submitter_id', def: "submitter_id TEXT DEFAULT ''" },
      { table: 'customers', col: 'applicant_dept', def: "applicant_dept TEXT DEFAULT ''" },
      { table: 'customers', col: 'approval_flow', def: "approval_flow TEXT DEFAULT '[]'" },
      { table: 'customers', col: 'remark', def: "remark      TEXT DEFAULT ''" },
      { table: 'customers', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'customers', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'contracts', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'contracts', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'contracts', col: 'customer', def: "customer    TEXT DEFAULT ''" },
      { table: 'contracts', col: 'type', def: "type        TEXT DEFAULT ''" },
      { table: 'contracts', col: 'amount', def: "amount      REAL DEFAULT 0" },
      { table: 'contracts', col: 'start_date', def: "start_date  TEXT" },
      { table: 'contracts', col: 'end_date', def: "end_date    TEXT" },
      { table: 'contracts', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'contracts', col: 'progress', def: "progress    INTEGER DEFAULT 0" },
      { table: 'contracts', col: 'creator', def: "creator     TEXT DEFAULT ''" },
      { table: 'contracts', col: 'creator_id', def: "creator_id  TEXT DEFAULT ''" },
      { table: 'contracts', col: 'creator_dept', def: "creator_dept TEXT DEFAULT ''" },
      { table: 'contracts', col: 'approver', def: "approver    TEXT DEFAULT ''" },
      { table: 'contracts', col: 'sign_date', def: "sign_date   TEXT" },
      { table: 'contracts', col: 'execution_status', def: "execution_status TEXT DEFAULT '未执行'" },
      { table: 'contracts', col: 'execution_desc', def: "execution_desc  TEXT DEFAULT ''" },
      { table: 'contracts', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'contracts', col: 'content', def: "content     TEXT DEFAULT ''" },
      { table: 'contracts', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'contracts', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'contract_changes', col: 'contract_id', def: "contract_id TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'contract_name', def: "contract_name TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'change_type', def: "change_type TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'reason', def: "reason      TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'before_desc', def: "before_desc TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'after_desc', def: "after_desc  TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'applicant_id', def: "applicant_id TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'applicant_dept', def: "applicant_dept TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'contract_changes', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'contract_changes', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'contract_changes', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'contract_terminations', col: 'contract_id', def: "contract_id TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'contract_name', def: "contract_name TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'term_type', def: "term_type   TEXT DEFAULT '终止'" },
      { table: 'contract_terminations', col: 'reason', def: "reason      TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'settle_amount', def: "settle_amount REAL DEFAULT 0" },
      { table: 'contract_terminations', col: 'settle_desc', def: "settle_desc TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'effective_date', def: "effective_date TEXT" },
      { table: 'contract_terminations', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'applicant_id', def: "applicant_id TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'applicant_dept', def: "applicant_dept TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'contract_terminations', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'contract_terminations', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'contract_terminations', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'contract_borrows', col: 'contract_id', def: "contract_id TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'contract_name', def: "contract_name TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'borrower', def: "borrower    TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'borrower_id', def: "borrower_id TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'borrower_dept', def: "borrower_dept TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'borrow_date', def: "borrow_date TEXT" },
      { table: 'contract_borrows', col: 'expected_return', def: "expected_return TEXT" },
      { table: 'contract_borrows', col: 'actual_return', def: "actual_return TEXT" },
      { table: 'contract_borrows', col: 'purpose', def: "purpose     TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'contract_borrows', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'contract_borrows', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'contract_borrows', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 'contract_templates', col: 'name', def: "name            TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'category', def: "category        TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'content', def: "content         TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'fields', def: "fields          TEXT DEFAULT '[]'" },
      { table: 'contract_templates', col: 'creator', def: "creator         TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'creator_id', def: "creator_id      TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'status', def: "status          TEXT DEFAULT '启用'" },
      { table: 'contract_templates', col: 'applicable_dept', def: "applicable_dept TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'template_file', def: "template_file   TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'file_type', def: "file_type       TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'version', def: "version         INTEGER DEFAULT 1" },
      { table: 'contract_templates', col: 'parent_id', def: "parent_id       TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'is_latest', def: "is_latest       INTEGER DEFAULT 1" },
      { table: 'contract_templates', col: 'is_deleted', def: "is_deleted      INTEGER DEFAULT 0" },
      { table: 'contract_templates', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 'contract_templates', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 'contract_template_versions', col: 'template_id', def: "template_id     TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'version_num', def: "version_num     INTEGER DEFAULT ''" },
      { table: 'contract_template_versions', col: 'name', def: "name            TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'category', def: "category        TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'content', def: "content         TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'fields', def: "fields          TEXT DEFAULT '[]'" },
      { table: 'contract_template_versions', col: 'template_file', def: "template_file   TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'file_type', def: "file_type       TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'applicable_dept', def: "applicable_dept TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'status', def: "status          TEXT DEFAULT '启用'" },
      { table: 'contract_template_versions', col: 'operator', def: "operator        TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'operator_id', def: "operator_id     TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'change_desc', def: "change_desc     TEXT DEFAULT ''" },
      { table: 'contract_template_versions', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_template_approval', col: 'template_id', def: "template_id     TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'template_name', def: "template_name   TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'change_type', def: "change_type     TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'change_data', def: "change_data     TEXT DEFAULT '{}'" },
      { table: 't_template_approval', col: 'snapshot_data', def: "snapshot_data   TEXT DEFAULT '{}'" },
      { table: 't_template_approval', col: 'reason', def: "reason          TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'status', def: "status          TEXT DEFAULT '审批中'" },
      { table: 't_template_approval', col: 'current_step', def: "current_step    INTEGER DEFAULT 1" },
      { table: 't_template_approval', col: 'steps', def: "steps           TEXT DEFAULT '[]'" },
      { table: 't_template_approval', col: 'applicant_id', def: "applicant_id    TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'applicant_name', def: "applicant_name  TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'applicant_dept', def: "applicant_dept  TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'approver_log', def: "approver_log    TEXT DEFAULT '[]'" },
      { table: 't_template_approval', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_template_approval', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 'contract_logs', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'contract_logs', col: 'contract_id', def: "contract_id TEXT DEFAULT ''" },
      { table: 'contract_logs', col: 'action', def: "action      TEXT DEFAULT ''" },
      { table: 'contract_logs', col: 'operator', def: "operator    TEXT DEFAULT ''" },
      { table: 'contract_logs', col: 'operator_id', def: "operator_id TEXT DEFAULT ''" },
      { table: 'contract_logs', col: 'operator_dept', def: "operator_dept TEXT DEFAULT ''" },
      { table: 'contract_logs', col: 'detail', def: "detail      TEXT DEFAULT ''" },
      { table: 'contract_logs', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'contract_versions', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'contract_versions', col: 'contract_id', def: "contract_id TEXT DEFAULT ''" },
      { table: 'contract_versions', col: 'version_num', def: "version_num INTEGER DEFAULT 1" },
      { table: 'contract_versions', col: 'snapshot', def: "snapshot    TEXT DEFAULT ''" },
      { table: 'contract_versions', col: 'change_desc', def: "change_desc TEXT DEFAULT ''" },
      { table: 'contract_versions', col: 'operator', def: "operator    TEXT DEFAULT ''" },
      { table: 'contract_versions', col: 'operator_id', def: "operator_id TEXT DEFAULT ''" },
      { table: 'contract_versions', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_contract_main', col: 'contract_no', def: "contract_no     TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'contract_type', def: "contract_type   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'contract_name', def: "contract_name   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'partner_company', def: "partner_company TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'social_credit_code', def: "social_credit_code TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'contact_person', def: "contact_person  TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'contact_phone', def: "contact_phone   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'sign_location', def: "sign_location   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'amount', def: "amount          REAL DEFAULT 0" },
      { table: 't_contract_main', col: 'currency', def: "currency        TEXT DEFAULT '人民币'" },
      { table: 't_contract_main', col: 'tax_rate', def: "tax_rate        TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'tax_inclusive', def: "tax_inclusive   TEXT DEFAULT '含税'" },
      { table: 't_contract_main', col: 'payment_method', def: "payment_method  TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'payment_milestones', def: "payment_milestones TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'start_date', def: "start_date      TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'end_date', def: "end_date        TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'duration', def: "duration        TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'budget_department', def: "budget_department TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'handler', def: "handler         TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'handler_id', def: "handler_id      TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'attachment_group', def: "attachment_group TEXT DEFAULT '[]'" },
      { table: 't_contract_main', col: 'final_pdf', def: "final_pdf       TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'signed_pdf', def: "signed_pdf      TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'signed_pdf_at', def: "signed_pdf_at   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'signed_pdf_by', def: "signed_pdf_by   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'external_remark', def: "external_remark TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'internal_risk_remark', def: "internal_risk_remark TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'contract_status', def: "contract_status TEXT DEFAULT '草稿'" },
      { table: 't_contract_main', col: 'current_approval_node', def: "current_approval_node TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'approval_flow_id', def: "approval_flow_id TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'flow', def: "flow            TEXT DEFAULT '[]'" },
      { table: 't_contract_main', col: 'created_by', def: "created_by      TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'created_by_id', def: "created_by_id   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'created_dept', def: "created_dept    TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'updated_by', def: "updated_by      TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'updated_by_id', def: "updated_by_id   TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'updated_at', def: "updated_at     TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_contract_attachments', col: 'contract_id', def: "contract_id     TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'file_name', def: "file_name       TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'file_category', def: "file_category   TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'file_path', def: "file_path       TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'file_size', def: "file_size       INTEGER DEFAULT 0" },
      { table: 't_contract_attachments', col: 'uploader', def: "uploader        TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'uploader_id', def: "uploader_id     TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'uploaded_at', def: "uploaded_at     TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'is_deleted', def: "is_deleted      INTEGER DEFAULT 0" },
      { table: 't_contract_attachments', col: 'deleted_by', def: "deleted_by      TEXT DEFAULT ''" },
      { table: 't_contract_attachments', col: 'deleted_at', def: "deleted_at     TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_flow_instances', col: 'flow_id', def: "flow_id         TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'contract_id', def: "contract_id     TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'contract_no', def: "contract_no     TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'flow_data', def: "flow_data       TEXT DEFAULT '{}'" },
      { table: 't_flow_instances', col: 'status', def: "status          TEXT DEFAULT '进行中'" },
      { table: 't_flow_instances', col: 'current_node', def: "current_node    TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'started_by', def: "started_by      TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'started_by_id', def: "started_by_id   TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'started_at', def: "started_at      TEXT DEFAULT ''" },
      { table: 't_flow_instances', col: 'completed_at', def: "completed_at    TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_flow_reject_attachments', col: 'flow_instance_id', def: "flow_instance_id TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'contract_id', def: "contract_id     TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'node_id', def: "node_id         TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'file_name', def: "file_name       TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'file_path', def: "file_path       TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'file_size', def: "file_size       INTEGER DEFAULT 0" },
      { table: 't_flow_reject_attachments', col: 'uploader', def: "uploader        TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'uploader_id', def: "uploader_id     TEXT DEFAULT ''" },
      { table: 't_flow_reject_attachments', col: 'uploaded_at', def: "uploaded_at     TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_flow_cc_records', col: 'flow_instance_id', def: "flow_instance_id TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'contract_id', def: "contract_id     TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'contract_no', def: "contract_no     TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'cc_target', def: "cc_target       TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'cc_target_name', def: "cc_target_name  TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'cc_reason', def: "cc_reason       TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'sent_at', def: "sent_at         TEXT DEFAULT ''" },
      { table: 't_flow_cc_records', col: 'is_read', def: "is_read         INTEGER DEFAULT 0" },
      { table: 't_contract_change_form', col: 'id', def: "id                TEXT PRIMARY KEY" },
      { table: 't_contract_change_form', col: 'contract_id', def: "contract_id       TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'contract_no', def: "contract_no       TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'contract_name', def: "contract_name     TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'change_content', def: "change_content    TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'change_reason', def: "change_reason     TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'changed_terms', def: "changed_terms     TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'change_attachment', def: "change_attachment TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'effective_date', def: "effective_date    TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'version_num', def: "version_num       INTEGER DEFAULT 0" },
      { table: 't_contract_change_form', col: 'flow_instance_id', def: "flow_instance_id  TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'change_status', def: "change_status     TEXT DEFAULT '草稿'" },
      { table: 't_contract_change_form', col: 'current_node', def: "current_node      TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'original_amount', def: "original_amount   REAL DEFAULT 0" },
      { table: 't_contract_change_form', col: 'original_final_approver', def: "original_final_approver TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'applicant', def: "applicant         TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'applicant_id', def: "applicant_id      TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'applicant_dept', def: "applicant_dept    TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'archived_by', def: "archived_by       TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'archived_by_id', def: "archived_by_id   TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'archived_at', def: "archived_at       TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'created_at', def: "created_at        TEXT DEFAULT ''" },
      { table: 't_contract_change_form', col: 'updated_at', def: "updated_at        TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'id', def: "id                TEXT PRIMARY KEY" },
      { table: 't_contract_change_versions', col: 'contract_id', def: "contract_id       TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'contract_no', def: "contract_no       TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'change_form_id', def: "change_form_id    TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'version_num', def: "version_num       INTEGER DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'version_type', def: "version_type      TEXT DEFAULT 'original'" },
      { table: 't_contract_change_versions', col: 'before_snapshot', def: "before_snapshot   TEXT DEFAULT '{}'" },
      { table: 't_contract_change_versions', col: 'after_snapshot', def: "after_snapshot    TEXT DEFAULT '{}'" },
      { table: 't_contract_change_versions', col: 'change_summary', def: "change_summary    TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'changed_fields', def: "changed_fields    TEXT DEFAULT '[]'" },
      { table: 't_contract_change_versions', col: 'operator', def: "operator          TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'operator_id', def: "operator_id       TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'operator_dept', def: "operator_dept     TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'flow_instance_id', def: "flow_instance_id  TEXT DEFAULT ''" },
      { table: 't_contract_change_versions', col: 'created_at', def: "created_at        TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'id', def: "id                TEXT PRIMARY KEY" },
      { table: 't_contract_end_form', col: 'contract_id', def: "contract_id       TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'contract_no', def: "contract_no       TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'contract_name', def: "contract_name     TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'end_type', def: "end_type          TEXT DEFAULT '终止'" },
      { table: 't_contract_end_form', col: 'end_reason', def: "end_reason        TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'end_description', def: "end_description   TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'end_date', def: "end_date          TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'settle_amount', def: "settle_amount     REAL DEFAULT 0" },
      { table: 't_contract_end_form', col: 'settle_desc', def: "settle_desc       TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'attachment_path', def: "attachment_path   TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'flow_instance_id', def: "flow_instance_id  TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'end_status', def: "end_status        TEXT DEFAULT '草稿'" },
      { table: 't_contract_end_form', col: 'current_node', def: "current_node      TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'original_amount', def: "original_amount   REAL DEFAULT 0" },
      { table: 't_contract_end_form', col: 'original_final_approver', def: "original_final_approver TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'applicant', def: "applicant         TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'applicant_id', def: "applicant_id      TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'applicant_dept', def: "applicant_dept    TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'archived_by', def: "archived_by       TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'archived_by_id', def: "archived_by_id   TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'archived_at', def: "archived_at       TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'created_at', def: "created_at        TEXT DEFAULT ''" },
      { table: 't_contract_end_form', col: 'updated_at', def: "updated_at        TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'id', def: "id                TEXT PRIMARY KEY" },
      { table: 't_contract_void_form', col: 'contract_id', def: "contract_id       TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'contract_no', def: "contract_no       TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'contract_name', def: "contract_name     TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'void_reason', def: "void_reason       TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'void_description', def: "void_description  TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'void_type', def: "void_type         TEXT DEFAULT '主动作废'" },
      { table: 't_contract_void_form', col: 'attachment_path', def: "attachment_path   TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'flow_instance_id', def: "flow_instance_id  TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'void_status', def: "void_status       TEXT DEFAULT '草稿'" },
      { table: 't_contract_void_form', col: 'current_node', def: "current_node      TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'applicant', def: "applicant         TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'applicant_id', def: "applicant_id      TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'applicant_dept', def: "applicant_dept    TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'created_at', def: "created_at        TEXT DEFAULT ''" },
      { table: 't_contract_void_form', col: 'updated_at', def: "updated_at        TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'id', def: "id                TEXT PRIMARY KEY" },
      { table: 't_contract_borrow_form', col: 'contract_id', def: "contract_id       TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'contract_no', def: "contract_no       TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'contract_name', def: "contract_name     TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'borrow_purpose', def: "borrow_purpose    TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'borrow_period', def: "borrow_period      TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'expected_return', def: "expected_return    TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'allow_download', def: "allow_download     INTEGER DEFAULT 0" },
      { table: 't_contract_borrow_form', col: 'is_confidential', def: "is_confidential    INTEGER DEFAULT 0" },
      { table: 't_contract_borrow_form', col: 'flow_instance_id', def: "flow_instance_id  TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'borrow_status', def: "borrow_status      TEXT DEFAULT '草稿'" },
      { table: 't_contract_borrow_form', col: 'current_node', def: "current_node       TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'applicant', def: "applicant          TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'applicant_id', def: "applicant_id       TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'applicant_dept', def: "applicant_dept     TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'borrow_date', def: "borrow_date        TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'approved_by', def: "approved_by        TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'approved_by_id', def: "approved_by_id     TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'approved_at', def: "approved_at        TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'returned_by', def: "returned_by        TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'returned_by_id', def: "returned_by_id     TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'returned_at', def: "returned_at        TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'return_remark', def: "return_remark      TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'is_overdue', def: "is_overdue         INTEGER DEFAULT 0" },
      { table: 't_contract_borrow_form', col: 'overdue_reminded', def: "overdue_reminded   INTEGER DEFAULT 0" },
      { table: 't_contract_borrow_form', col: 'created_at', def: "created_at         TEXT DEFAULT ''" },
      { table: 't_contract_borrow_form', col: 'updated_at', def: "updated_at         TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_contract_audit_log', col: 'contract_id', def: "contract_id     TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'user_id', def: "user_id         TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'user_name', def: "user_name       TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'user_dept', def: "user_dept       TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'action_type', def: "action_type     TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'detail', def: "detail          TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'ip_address', def: "ip_address      TEXT DEFAULT ''" },
      { table: 't_contract_audit_log', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_contract_confidential_access', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_contract_confidential_access', col: 'user_id', def: "user_id         TEXT DEFAULT ''" },
      { table: 't_contract_confidential_access', col: 'user_name', def: "user_name       TEXT DEFAULT ''" },
      { table: 't_contract_confidential_access', col: 'user_dept', def: "user_dept       TEXT DEFAULT ''" },
      { table: 't_contract_confidential_access', col: 'contract_role', def: "contract_role   TEXT DEFAULT ''" },
      { table: 't_contract_confidential_access', col: 'status', def: "status          INTEGER DEFAULT 1" },
      { table: 't_contract_confidential_access', col: 'granted_by', def: "granted_by      TEXT DEFAULT ''" },
      { table: 't_contract_confidential_access', col: 'granted_at', def: "granted_at      TEXT DEFAULT ''" },
      { table: 't_contract_confidential_access', col: 'remark', def: "remark          TEXT DEFAULT ''" },
      { table: 't_contract_risk_scores', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_contract_risk_scores', col: 'contract_id', def: "contract_id     TEXT DEFAULT ''" },
      { table: 't_contract_risk_scores', col: 'contract_no', def: "contract_no     TEXT DEFAULT ''" },
      { table: 't_contract_risk_scores', col: 'contract_name', def: "contract_name   TEXT DEFAULT ''" },
      { table: 't_contract_risk_scores', col: 'risk_score', def: "risk_score      INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'risk_level', def: "risk_level      TEXT DEFAULT '低'" },
      { table: 't_contract_risk_scores', col: 'factor_amount', def: "factor_amount   INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'factor_duration', def: "factor_duration INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'factor_status', def: "factor_status   INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'factor_expiry', def: "factor_expiry   INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'factor_missing', def: "factor_missing  INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'factor_risk_remark', def: "factor_risk_remark INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'factor_confidential', def: "factor_confidential INTEGER DEFAULT 0" },
      { table: 't_contract_risk_scores', col: 'evaluated_at', def: "evaluated_at    TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_contract_alerts', col: 'contract_id', def: "contract_id     TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'contract_no', def: "contract_no     TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'contract_name', def: "contract_name   TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'alert_type', def: "alert_type      TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'severity', def: "severity        TEXT DEFAULT '中'" },
      { table: 't_contract_alerts', col: 'title', def: "title           TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'description', def: "description     TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'status', def: "status          TEXT DEFAULT '待处理'" },
      { table: 't_contract_alerts', col: 'handled_by', def: "handled_by      TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'handled_by_id', def: "handled_by_id   TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'handled_at', def: "handled_at      TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'handled_remark', def: "handled_remark  TEXT DEFAULT ''" },
      { table: 't_contract_alerts', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'id', def: "id                  TEXT PRIMARY KEY" },
      { table: 't_partner_credit', col: 'partner_name', def: "partner_name        TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'social_credit_code', def: "social_credit_code  TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'contact_person', def: "contact_person      TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'contact_phone', def: "contact_phone       TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'credit_rating', def: "credit_rating       TEXT DEFAULT 'B'" },
      { table: 't_partner_credit', col: 'total_contracts', def: "total_contracts     INTEGER DEFAULT 0" },
      { table: 't_partner_credit', col: 'total_amount', def: "total_amount        REAL DEFAULT 0" },
      { table: 't_partner_credit', col: 'on_time_rate', def: "on_time_rate        REAL DEFAULT 100" },
      { table: 't_partner_credit', col: 'risk_level', def: "risk_level          TEXT DEFAULT '低'" },
      { table: 't_partner_credit', col: 'remark', def: "remark              TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'creator', def: "creator             TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'creator_id', def: "creator_id          TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'created_at', def: "created_at          TEXT DEFAULT ''" },
      { table: 't_partner_credit', col: 'updated_at', def: "updated_at          TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'asset_requisitions', col: 'asset_id', def: "asset_id    TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'asset_name', def: "asset_name  TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'category', def: "category    TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'requisitioner', def: "requisitioner TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'requisitioner_id', def: "requisitioner_id TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'req_date', def: "req_date    TEXT" },
      { table: 'asset_requisitions', col: 'purpose', def: "purpose     TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'asset_requisitions', col: 'submitter', def: "submitter   TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'submitter_id', def: "submitter_id TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'approval_flow', def: "approval_flow TEXT DEFAULT '[]'" },
      { table: 'asset_requisitions', col: 'remark', def: "remark      TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'asset_requisitions', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'purchases', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'purchases', col: 'title', def: "title       TEXT DEFAULT ''" },
      { table: 'purchases', col: 'category', def: "category    TEXT DEFAULT ''" },
      { table: 'purchases', col: 'amount', def: "amount      REAL DEFAULT 0" },
      { table: 'purchases', col: 'qty', def: "qty         INTEGER DEFAULT 0" },
      { table: 'purchases', col: 'unit', def: "unit        TEXT DEFAULT ''" },
      { table: 'purchases', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'purchases', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'purchases', col: 'applicant_dept', def: "applicant_dept TEXT DEFAULT ''" },
      { table: 'purchases', col: 'date', def: "date        TEXT" },
      { table: 'purchases', col: 'vendor', def: "vendor      TEXT DEFAULT ''" },
      { table: 'purchases', col: 'desc', def: "desc        TEXT DEFAULT ''" },
      { table: 'purchases', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'purchases', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'purchases', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'projects', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'projects', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'projects', col: 'customer', def: "customer    TEXT DEFAULT ''" },
      { table: 'projects', col: 'manager', def: "manager     TEXT DEFAULT ''" },
      { table: 'projects', col: 'budget', def: "budget      REAL DEFAULT 0" },
      { table: 'projects', col: 'start_date', def: "start_date  TEXT" },
      { table: 'projects', col: 'end_date', def: "end_date    TEXT" },
      { table: 'projects', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'projects', col: 'progress', def: "progress    INTEGER DEFAULT 0" },
      { table: 'projects', col: 'type', def: "type        TEXT DEFAULT ''" },
      { table: 'projects', col: 'desc', def: "desc        TEXT DEFAULT ''" },
      { table: 'projects', col: 'nodes', def: "nodes       TEXT DEFAULT '[]'" },
      { table: 'projects', col: 'approval_flow', def: "approval_flow TEXT DEFAULT '[]'" },
      { table: 'projects', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'projects', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'project_progress', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'project_progress', col: 'project_id', def: "project_id  TEXT DEFAULT ''" },
      { table: 'project_progress', col: 'phase', def: "phase       TEXT DEFAULT ''" },
      { table: 'project_progress', col: 'content', def: "content     TEXT DEFAULT ''" },
      { table: 'project_progress', col: 'progress_pct', def: "progress_pct INTEGER DEFAULT 0" },
      { table: 'project_progress', col: 'submitter', def: "submitter   TEXT DEFAULT ''" },
      { table: 'project_progress', col: 'submitter_id', def: "submitter_id TEXT DEFAULT ''" },
      { table: 'project_progress', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'project_progress', col: 'approval_flow', def: "approval_flow TEXT DEFAULT '[]'" },
      { table: 'project_progress', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'project_progress', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'suppliers', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'short_name', def: "short_name  TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'category', def: "category    TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'level', def: "level       TEXT DEFAULT 'C'" },
      { table: 'suppliers', col: 'contact', def: "contact     TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'phone', def: "phone       TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'email', def: "email       TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'address', def: "address     TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'bank', def: "bank        TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'account', def: "account     TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'business_scope', def: "business_scope TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'total_orders', def: "total_orders INTEGER DEFAULT 0" },
      { table: 'suppliers', col: 'total_amount', def: "total_amount REAL DEFAULT 0" },
      { table: 'suppliers', col: 'rating', def: "rating      REAL DEFAULT 0" },
      { table: 'suppliers', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'suppliers', col: 'coop_date', def: "coop_date   TEXT" },
      { table: 'suppliers', col: 'remark', def: "remark      TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'qualifications', def: "qualifications TEXT DEFAULT '[]'" },
      { table: 'suppliers', col: 'products', def: "products    TEXT DEFAULT '[]'" },
      { table: 'suppliers', col: 'timeline', def: "timeline    TEXT DEFAULT '[]'" },
      { table: 'suppliers', col: 'submitter', def: "submitter      TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'submitter_id', def: "submitter_id   TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'applicant_dept', def: "applicant_dept TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'approval_flow', def: "approval_flow  TEXT DEFAULT '[]'" },
      { table: 'suppliers', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'suppliers', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'leaves', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'leaves', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'leaves', col: 'applicant_id', def: "applicant_id TEXT" },
      { table: 'leaves', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'leaves', col: 'type', def: "type        TEXT DEFAULT ''" },
      { table: 'leaves', col: 'start_date', def: "start_date  TEXT" },
      { table: 'leaves', col: 'end_date', def: "end_date    TEXT" },
      { table: 'leaves', col: 'days', def: "days        REAL DEFAULT 0" },
      { table: 'leaves', col: 'reason', def: "reason      TEXT DEFAULT ''" },
      { table: 'leaves', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'leaves', col: 'approver', def: "approver    TEXT DEFAULT ''" },
      { table: 'leaves', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'leaves', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'leaves', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'expenses', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'expenses', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'expenses', col: 'applicant_id', def: "applicant_id TEXT" },
      { table: 'expenses', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'expenses', col: 'category', def: "category    TEXT DEFAULT ''" },
      { table: 'expenses', col: 'amount', def: "amount      REAL DEFAULT 0" },
      { table: 'expenses', col: 'date', def: "date        TEXT" },
      { table: 'expenses', col: 'desc', def: "desc        TEXT DEFAULT ''" },
      { table: 'expenses', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'expenses', col: 'receipts', def: "receipts    INTEGER DEFAULT 0" },
      { table: 'expenses', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'expenses', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'expenses', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'documents', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'documents', col: 'title', def: "title       TEXT DEFAULT ''" },
      { table: 'documents', col: 'type', def: "type        TEXT DEFAULT '通知公告'" },
      { table: 'documents', col: 'author', def: "author      TEXT DEFAULT ''" },
      { table: 'documents', col: 'author_id', def: "author_id   TEXT DEFAULT ''" },
      { table: 'documents', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'documents', col: 'date', def: "date        TEXT" },
      { table: 'documents', col: 'status', def: "status      TEXT DEFAULT '草稿'" },
      { table: 'documents', col: 'distribute_scope', def: "distribute_scope TEXT DEFAULT ''" },
      { table: 'documents', col: 'content', def: "content     TEXT DEFAULT ''" },
      { table: 'documents', col: 'read_count', def: "read_count  INTEGER DEFAULT 0" },
      { table: 'documents', col: 'doc_flow', def: "doc_flow    TEXT DEFAULT '[]'" },
      { table: 'documents', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'documents', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'finance_records', col: 'type', def: "type        TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'category', def: "category    TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'amount', def: "amount      REAL DEFAULT 0" },
      { table: 'finance_records', col: 'date', def: "date        TEXT" },
      { table: 'finance_records', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'desc', def: "desc        TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'finance_records', col: 'related_id', def: "related_id  TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'submitter', def: "submitter   TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'submitter_id', def: "submitter_id TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'approval_flow', def: "approval_flow TEXT DEFAULT '[]'" },
      { table: 'finance_records', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'finance_records', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'fixed_assets', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'category', def: "category    TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'user', def: "user        TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'purchase_date', def: "purchase_date TEXT" },
      { table: 'fixed_assets', col: 'original_value', def: "original_value REAL DEFAULT 0" },
      { table: 'fixed_assets', col: 'salvage_rate', def: "salvage_rate REAL DEFAULT 0.05" },
      { table: 'fixed_assets', col: 'useful_life', def: "useful_life INTEGER DEFAULT 36" },
      { table: 'fixed_assets', col: 'accumulated_dep', def: "accumulated_dep REAL DEFAULT 0" },
      { table: 'fixed_assets', col: 'net_value', def: "net_value   REAL DEFAULT 0" },
      { table: 'fixed_assets', col: 'status', def: "status      TEXT DEFAULT '使用中'" },
      { table: 'fixed_assets', col: 'submitter', def: "submitter   TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'submitter_id', def: "submitter_id TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'applicant_dept', def: "applicant_dept TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'approval_flow', def: "approval_flow TEXT DEFAULT '[]'" },
      { table: 'fixed_assets', col: 'remark', def: "remark      TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'fixed_assets', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'salary_records', col: 'emp_id', def: "emp_id      TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'emp_name', def: "emp_name    TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'level', def: "level       TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'month', def: "month       TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'base_salary', def: "base_salary REAL DEFAULT 0" },
      { table: 'salary_records', col: 'performance_score', def: "performance_score INTEGER DEFAULT 0" },
      { table: 'salary_records', col: 'performance_grade', def: "performance_grade TEXT DEFAULT 'B'" },
      { table: 'salary_records', col: 'performance_bonus', def: "performance_bonus REAL DEFAULT 0" },
      { table: 'salary_records', col: 'allowance', def: "allowance   REAL DEFAULT 0" },
      { table: 'salary_records', col: 'overtime', def: "overtime    REAL DEFAULT 0" },
      { table: 'salary_records', col: 'social_ins', def: "social_ins  REAL DEFAULT 0" },
      { table: 'salary_records', col: 'housing_fund', def: "housing_fund REAL DEFAULT 0" },
      { table: 'salary_records', col: 'tax', def: "tax         REAL DEFAULT 0" },
      { table: 'salary_records', col: 'gross_pay', def: "gross_pay   REAL DEFAULT 0" },
      { table: 'salary_records', col: 'net_pay', def: "net_pay     REAL DEFAULT 0" },
      { table: 'salary_records', col: 'status', def: "status      TEXT DEFAULT '待审核'" },
      { table: 'salary_records', col: 'approver', def: "approver    TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'sign_time', def: "sign_time   TEXT DEFAULT ''" },
      { table: 'salary_records', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'salary_templates', col: 'level', def: "level          TEXT PRIMARY KEY" },
      { table: 'salary_templates', col: 'level_name', def: "level_name     TEXT DEFAULT ''" },
      { table: 'salary_templates', col: 'base_salary', def: "base_salary    REAL DEFAULT 0" },
      { table: 'salary_templates', col: 'performance_ratio', def: "performance_ratio REAL DEFAULT 0" },
      { table: 'salary_templates', col: 'allowance', def: "allowance      REAL DEFAULT 0" },
      { table: 'salary_templates', col: 'social_ins_base', def: "social_ins_base REAL DEFAULT 0" },
      { table: 'salary_templates', col: 'housing_fund_rate', def: "housing_fund_rate REAL DEFAULT 0.12" },
      { table: 'salary_templates', col: 'desc', def: "desc           TEXT DEFAULT ''" },
      { table: 'checkins', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'checkins', col: 'user_id', def: "user_id     TEXT DEFAULT ''" },
      { table: 'checkins', col: 'user_name', def: "user_name   TEXT DEFAULT ''" },
      { table: 'checkins', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'checkins', col: 'status', def: "status      TEXT DEFAULT 'signed_in'" },
      { table: 'checkins', col: 'date', def: "date        TEXT" },
      { table: 'checkins', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'attendance_schedules', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'attendance_schedules', col: 'season', def: "season      TEXT NOT NULL DEFAULT 'summer'" },
      { table: 'attendance_schedules', col: 'work_start', def: "work_start  TEXT DEFAULT '09:00'" },
      { table: 'attendance_schedules', col: 'work_end', def: "work_end    TEXT DEFAULT '18:00'" },
      { table: 'attendance_schedules', col: 'lunch_start', def: "lunch_start TEXT DEFAULT '12:00'" },
      { table: 'attendance_schedules', col: 'lunch_end', def: "lunch_end   TEXT DEFAULT '13:30'" },
      { table: 'attendance_schedules', col: 'active', def: "active      INTEGER DEFAULT 0" },
      { table: 'attendance_schedules', col: 'updated_by', def: "updated_by  TEXT DEFAULT ''" },
      { table: 'attendance_schedules', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'work_reports', col: 'user_id', def: "user_id     TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'user_name', def: "user_name   TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'type', def: "type        TEXT DEFAULT '日报'" },
      { table: 'work_reports', col: 'date', def: "date        TEXT" },
      { table: 'work_reports', col: 'month', def: "month       TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'content', def: "content     TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'plan', def: "plan        TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'summary', def: "summary     TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'next_plan', def: "next_plan   TEXT DEFAULT ''" },
      { table: 'work_reports', col: 'status', def: "status      TEXT DEFAULT '已提交'" },
      { table: 'work_reports', col: 'approval_flow', def: "approval_flow TEXT DEFAULT '[]'" },
      { table: 'work_reports', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'sales_records', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'sales_records', col: 'date', def: "date        TEXT" },
      { table: 'sales_records', col: 'salesperson', def: "salesperson TEXT DEFAULT ''" },
      { table: 'sales_records', col: 'customer', def: "customer    TEXT DEFAULT ''" },
      { table: 'sales_records', col: 'product', def: "product     TEXT DEFAULT ''" },
      { table: 'sales_records', col: 'amount', def: "amount      REAL DEFAULT 0" },
      { table: 'sales_records', col: 'region', def: "region      TEXT DEFAULT ''" },
      { table: 'sales_records', col: 'status', def: "status      TEXT DEFAULT '待确认'" },
      { table: 'sales_records', col: 'remark', def: "remark      TEXT DEFAULT ''" },
      { table: 'sales_records', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'business_trips', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'business_trips', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'business_trips', col: 'applicant_id', def: "applicant_id TEXT" },
      { table: 'business_trips', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'business_trips', col: 'destination', def: "destination TEXT DEFAULT ''" },
      { table: 'business_trips', col: 'start_date', def: "start_date  TEXT" },
      { table: 'business_trips', col: 'end_date', def: "end_date    TEXT" },
      { table: 'business_trips', col: 'days', def: "days        REAL DEFAULT 0" },
      { table: 'business_trips', col: 'purpose', def: "purpose     TEXT DEFAULT ''" },
      { table: 'business_trips', col: 'budget', def: "budget      REAL DEFAULT 0" },
      { table: 'business_trips', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'business_trips', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'business_trips', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'business_trips', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'logistics', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'logistics', col: 'type', def: "type        TEXT DEFAULT ''" },
      { table: 'logistics', col: 'title', def: "title       TEXT DEFAULT ''" },
      { table: 'logistics', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'logistics', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'logistics', col: 'status', def: "status      TEXT DEFAULT '待处理'" },
      { table: 'logistics', col: 'date', def: "date        TEXT" },
      { table: 'logistics', col: 'detail', def: "detail      TEXT DEFAULT ''" },
      { table: 'logistics', col: 'cost', def: "cost        REAL DEFAULT 0" },
      { table: 'logistics', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'vehicles', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'vehicles', col: 'plate', def: "plate       TEXT DEFAULT ''" },
      { table: 'vehicles', col: 'model', def: "model       TEXT DEFAULT ''" },
      { table: 'vehicles', col: 'driver', def: "driver      TEXT DEFAULT ''" },
      { table: 'vehicles', col: 'status', def: "status      TEXT DEFAULT '可用'" },
      { table: 'vehicles', col: 'last_maintenance', def: "last_maintenance TEXT" },
      { table: 'vehicles', col: 'next_maintenance', def: "next_maintenance TEXT" },
      { table: 'vehicles', col: 'mileage', def: "mileage     INTEGER DEFAULT 0" },
      { table: 'vehicles', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'approval_flows', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'approval_flows', col: 'type', def: "type        TEXT DEFAULT ''" },
      { table: 'approval_flows', col: 'name', def: "name        TEXT DEFAULT ''" },
      { table: 'approval_flows', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'approval_flows', col: 'steps', def: "steps       TEXT DEFAULT '[]'" },
      { table: 'approval_flows', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'perm_audit_logs', col: 'id', def: "id          INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 'perm_audit_logs', col: 'time', def: "time        TEXT" },
      { table: 'perm_audit_logs', col: 'operator', def: "operator    TEXT DEFAULT ''" },
      { table: 'perm_audit_logs', col: 'action', def: "action      TEXT DEFAULT ''" },
      { table: 'perm_audit_logs', col: 'target', def: "target      TEXT DEFAULT ''" },
      { table: 'perm_audit_logs', col: 'detail', def: "detail      TEXT DEFAULT ''" },
      { table: 'perm_audit_logs', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'announcements', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'announcements', col: 'title', def: "title       TEXT DEFAULT ''" },
      { table: 'announcements', col: 'category', def: "category    TEXT DEFAULT ''" },
      { table: 'announcements', col: 'content', def: "content     TEXT DEFAULT ''" },
      { table: 'announcements', col: 'author', def: "author      TEXT DEFAULT ''" },
      { table: 'announcements', col: 'author_dept', def: "author_dept TEXT DEFAULT ''" },
      { table: 'announcements', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'announcements', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'announcements', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'announcements', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'id', def: "id          TEXT PRIMARY KEY" },
      { table: 'hr_applications', col: 'action_type', def: "action_type TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'emp_id', def: "emp_id      TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'emp_name', def: "emp_name    TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'dept', def: "dept        TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'role', def: "role        TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'level', def: "level       TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'education', def: "education   TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'join_date', def: "join_date   TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'password', def: "password    TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'phone', def: "phone       TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'status', def: "status      TEXT DEFAULT '待审批'" },
      { table: 'hr_applications', col: 'applicant', def: "applicant   TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'applicant_dept', def: "applicant_dept TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'flow', def: "flow        TEXT DEFAULT '[]'" },
      { table: 'hr_applications', col: 'remark', def: "remark      TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'created_at', def: "created_at  TEXT DEFAULT ''" },
      { table: 'hr_applications', col: 'updated_at', def: "updated_at  TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_expense', col: 'form_no', def: "form_no         TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'applicant', def: "applicant       TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'applicant_id', def: "applicant_id    TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'applicant_dept', def: "applicant_dept  TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'expense_type', def: "expense_type    TEXT DEFAULT '普通报销'" },
      { table: 't_finance_expense', col: 'status', def: "status          TEXT DEFAULT '草稿'" },
      { table: 't_finance_expense', col: 'total_amount', def: "total_amount    REAL DEFAULT 0" },
      { table: 't_finance_expense', col: 'travel_days', def: "travel_days     INTEGER DEFAULT 0" },
      { table: 't_finance_expense', col: 'travel_subsidy', def: "travel_subsidy  REAL DEFAULT 0" },
      { table: 't_finance_expense', col: 'loan_deduct', def: "loan_deduct     REAL DEFAULT 0" },
      { table: 't_finance_expense', col: 'actual_amount', def: "actual_amount   REAL DEFAULT 0" },
      { table: 't_finance_expense', col: 'bank_account', def: "bank_account    TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'bank_name', def: "bank_name       TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'reimburse_date', def: "reimburse_date  TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'settle_date', def: "settle_date     TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'attachments', def: "attachments     TEXT DEFAULT '[]'" },
      { table: 't_finance_expense', col: 'remark', def: "remark          TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'approval_flow', def: "approval_flow   TEXT DEFAULT '[]'" },
      { table: 't_finance_expense', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_expense', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_expense_detail', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_finance_expense_detail', col: 'expense_id', def: "expense_id      TEXT DEFAULT ''" },
      { table: 't_finance_expense_detail', col: 'category', def: "category        TEXT DEFAULT ''" },
      { table: 't_finance_expense_detail', col: 'amount', def: "amount          REAL DEFAULT 0" },
      { table: 't_finance_expense_detail', col: 'occur_date', def: "occur_date      TEXT DEFAULT ''" },
      { table: 't_finance_expense_detail', col: 'desc', def: "desc            TEXT DEFAULT ''" },
      { table: 't_finance_expense_detail', col: 'is_over_standard', def: "is_over_standard INTEGER DEFAULT 0" },
      { table: 't_finance_expense_detail', col: 'standard_amount', def: "standard_amount REAL DEFAULT 0" },
      { table: 't_finance_expense_detail', col: 'over_amount', def: "over_amount     REAL DEFAULT 0" },
      { table: 't_finance_expense_detail', col: 'invoice_ids', def: "invoice_ids     TEXT DEFAULT '[]'" },
      { table: 't_finance_expense_detail', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_finance_voucher', col: 'expense_id', def: "expense_id      TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'voucher_type', def: "voucher_type    TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'voucher_no', def: "voucher_no      TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'amount', def: "amount          REAL DEFAULT 0" },
      { table: 't_finance_voucher', col: 'voucher_date', def: "voucher_date    TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'description', def: "description     TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'file_path', def: "file_path       TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'file_name', def: "file_name       TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'uploaded_by', def: "uploaded_by     TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'uploaded_by_id', def: "uploaded_by_id  TEXT DEFAULT ''" },
      { table: 't_finance_voucher', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'id', def: "id                  INTEGER PRIMARY KEY CHECK (id = 1)" },
      { table: 't_company_info', col: 'company_name', def: "company_name        TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'short_name', def: "short_name          TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'credit_code', def: "credit_code         TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'legal_person', def: "legal_person        TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'registered_capital', def: "registered_capital  TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'established_date', def: "established_date    TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'registered_address', def: "registered_address  TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'office_address', def: "office_address      TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'phone', def: "phone               TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'fax', def: "fax                 TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'email', def: "email               TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'website', def: "website             TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'business_scope', def: "business_scope      TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'bank_name', def: "bank_name           TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'bank_account', def: "bank_account        TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'tax_number', def: "tax_number          TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'invoice_title', def: "invoice_title       TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'remark', def: "remark              TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'updated_by', def: "updated_by          TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'updated_by_id', def: "updated_by_id       TEXT DEFAULT ''" },
      { table: 't_company_info', col: 'updated_at', def: "updated_at          TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'id', def: "id                  TEXT PRIMARY KEY" },
      { table: 't_finance_loan', col: 'form_no', def: "form_no             TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'applicant', def: "applicant           TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'applicant_id', def: "applicant_id        TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'applicant_dept', def: "applicant_dept      TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'loan_type', def: "loan_type           TEXT DEFAULT '备用金'" },
      { table: 't_finance_loan', col: 'amount', def: "amount              REAL DEFAULT 0" },
      { table: 't_finance_loan', col: 'purpose', def: "purpose             TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'expected_repay_date', def: "expected_repay_date TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'actual_repay_date', def: "actual_repay_date   TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'repaid_amount', def: "repaid_amount       REAL DEFAULT 0" },
      { table: 't_finance_loan', col: 'outstanding_amount', def: "outstanding_amount  REAL DEFAULT 0" },
      { table: 't_finance_loan', col: 'status', def: "status              TEXT DEFAULT '草稿'" },
      { table: 't_finance_loan', col: 'settle_type', def: "settle_type         TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'approval_flow', def: "approval_flow       TEXT DEFAULT '[]'" },
      { table: 't_finance_loan', col: 'remark', def: "remark              TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'created_at', def: "created_at          TEXT DEFAULT ''" },
      { table: 't_finance_loan', col: 'updated_at', def: "updated_at          TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_payment', col: 'form_no', def: "form_no         TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'applicant', def: "applicant       TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'applicant_id', def: "applicant_id    TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'applicant_dept', def: "applicant_dept  TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'payment_type', def: "payment_type    TEXT DEFAULT '供应商付款'" },
      { table: 't_finance_payment', col: 'payee_name', def: "payee_name      TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'payee_account', def: "payee_account   TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'payee_bank', def: "payee_bank      TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'contract_id', def: "contract_id    TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'contract_name', def: "contract_name  TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'supplier_id', def: "supplier_id    TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'total_amount', def: "total_amount    REAL DEFAULT 0" },
      { table: 't_finance_payment', col: 'paid_amount', def: "paid_amount     REAL DEFAULT 0" },
      { table: 't_finance_payment', col: 'this_amount', def: "this_amount     REAL DEFAULT 0" },
      { table: 't_finance_payment', col: 'payment_stage', def: "payment_stage   TEXT DEFAULT '全款'" },
      { table: 't_finance_payment', col: 'payment_method', def: "payment_method  TEXT DEFAULT '银行转账'" },
      { table: 't_finance_payment', col: 'purpose', def: "purpose         TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'status', def: "status          TEXT DEFAULT '草稿'" },
      { table: 't_finance_payment', col: 'pay_date', def: "pay_date        TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'approval_flow', def: "approval_flow   TEXT DEFAULT '[]'" },
      { table: 't_finance_payment', col: 'remark', def: "remark          TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_payment', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'id', def: "id                  TEXT PRIMARY KEY" },
      { table: 't_finance_invoice', col: 'invoice_code', def: "invoice_code        TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'invoice_no', def: "invoice_no          TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'invoice_type', def: "invoice_type        TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'title', def: "title               TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'seller', def: "seller              TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'buyer', def: "buyer              TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'amount', def: "amount              REAL DEFAULT 0" },
      { table: 't_finance_invoice', col: 'tax_amount', def: "tax_amount          REAL DEFAULT 0" },
      { table: 't_finance_invoice', col: 'total_amount', def: "total_amount        REAL DEFAULT 0" },
      { table: 't_finance_invoice', col: 'tax_rate', def: "tax_rate            TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'invoice_date', def: "invoice_date        TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'status', def: "status              TEXT DEFAULT '正常'" },
      { table: 't_finance_invoice', col: 'source', def: "source              TEXT DEFAULT '手动录入'" },
      { table: 't_finance_invoice', col: 'ocr_raw', def: "ocr_raw             TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'ocr_confidence', def: "ocr_confidence      REAL DEFAULT 0" },
      { table: 't_finance_invoice', col: 'verified', def: "verified            TEXT DEFAULT '未校验'" },
      { table: 't_finance_invoice', col: 'verified_result', def: "verified_result     TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'verified_date', def: "verified_date       TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'related_expense_id', def: "related_expense_id  TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'related_payment_id', def: "related_payment_id  TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'operator', def: "operator            TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'operator_id', def: "operator_id         TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'remark', def: "remark              TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'created_at', def: "created_at          TEXT DEFAULT ''" },
      { table: 't_finance_invoice', col: 'updated_at', def: "updated_at          TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_budget', col: 'budget_no', def: "budget_no      TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'year', def: "year            INTEGER DEFAULT ''" },
      { table: 't_finance_budget', col: 'dept', def: "dept            TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'project_id', def: "project_id     TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'project_name', def: "project_name   TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'category', def: "category       TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'total_amount', def: "total_amount    REAL DEFAULT 0" },
      { table: 't_finance_budget', col: 'used_amount', def: "used_amount     REAL DEFAULT 0" },
      { table: 't_finance_budget', col: 'occupied_amount', def: "occupied_amount REAL DEFAULT 0" },
      { table: 't_finance_budget', col: 'available_amount', def: "available_amount REAL DEFAULT 0" },
      { table: 't_finance_budget', col: 'status', def: "status          TEXT DEFAULT '草稿'" },
      { table: 't_finance_budget', col: 'approval_flow', def: "approval_flow   TEXT DEFAULT '[]'" },
      { table: 't_finance_budget', col: 'creator', def: "creator         TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'creator_id', def: "creator_id      TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'remark', def: "remark          TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_budget', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_budget_occupy', col: 'budget_id', def: "budget_id      TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'occupy_type', def: "occupy_type    TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'related_id', def: "related_id     TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'related_form_no', def: "related_form_no TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'amount', def: "amount          REAL DEFAULT 0" },
      { table: 't_finance_budget_occupy', col: 'status', def: "status          TEXT DEFAULT '占用中'" },
      { table: 't_finance_budget_occupy', col: 'operator', def: "operator        TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'operator_id', def: "operator_id    TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_budget_occupy', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_hook_log', col: 'log_no', def: "log_no          TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'sync_type', def: "sync_type       TEXT DEFAULT '手动'" },
      { table: 't_finance_hook_log', col: 'direction', def: "direction       TEXT DEFAULT '推送'" },
      { table: 't_finance_hook_log', col: 'source_type', def: "source_type     TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'source_id', def: "source_id       TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'source_form_no', def: "source_form_no  TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'target_system', def: "target_system   TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'field_mapping', def: "field_mapping   TEXT DEFAULT '{}'" },
      { table: 't_finance_hook_log', col: 'payload', def: "payload         TEXT DEFAULT '{}'" },
      { table: 't_finance_hook_log', col: 'response', def: "response        TEXT DEFAULT '{}'" },
      { table: 't_finance_hook_log', col: 'status', def: "status          TEXT DEFAULT '待推送'" },
      { table: 't_finance_hook_log', col: 'retry_count', def: "retry_count     INTEGER DEFAULT 0" },
      { table: 't_finance_hook_log', col: 'error_msg', def: "error_msg       TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'voucher_no', def: "voucher_no      TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'operator', def: "operator        TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'operator_id', def: "operator_id     TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_hook_log', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_config', col: 'config_key', def: "config_key      TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'config_value', def: "config_value    TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'config_type', def: "config_type     TEXT DEFAULT '参数'" },
      { table: 't_finance_config', col: 'category', def: "category        TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'description', def: "description     TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'is_system', def: "is_system       INTEGER DEFAULT 0" },
      { table: 't_finance_config', col: 'status', def: "status          TEXT DEFAULT '启用'" },
      { table: 't_finance_config', col: 'updated_by', def: "updated_by      TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'updated_by_id', def: "updated_by_id   TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_config', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_seal', col: 'seal_no', def: "seal_no         TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'source_type', def: "source_type     TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'source_id', def: "source_id       TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'source_form_no', def: "source_form_no  TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'pdf_path', def: "pdf_path        TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'seal_type', def: "seal_type       TEXT DEFAULT '公章'" },
      { table: 't_finance_seal', col: 'seal_position', def: "seal_position   TEXT DEFAULT '正文'" },
      { table: 't_finance_seal', col: 'seal_image', def: "seal_image      TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'timestamp_server', def: "timestamp_server TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'timestamp_token', def: "timestamp_token  TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'hash_value', def: "hash_value      TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'seal_status', def: "seal_status     TEXT DEFAULT '待签章'" },
      { table: 't_finance_seal', col: 'seal_date', def: "seal_date       TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'operator', def: "operator        TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'operator_id', def: "operator_id     TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'remark', def: "remark          TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_seal', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'id', def: "id              TEXT PRIMARY KEY" },
      { table: 't_finance_payee', col: 'payee_name', def: "payee_name      TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'payee_type', def: "payee_type      TEXT DEFAULT '供应商'" },
      { table: 't_finance_payee', col: 'bank_account', def: "bank_account    TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'bank_name', def: "bank_name       TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'bank_branch', def: "bank_branch     TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'related_id', def: "related_id      TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'status', def: "status          TEXT DEFAULT '正常'" },
      { table: 't_finance_payee', col: 'creator', def: "creator         TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'creator_id', def: "creator_id      TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'remark', def: "remark          TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_finance_payee', col: 'updated_at', def: "updated_at      TEXT DEFAULT ''" },
      { table: 't_finance_invoice_check', col: 'id', def: "id              INTEGER PRIMARY KEY AUTOINCREMENT" },
      { table: 't_finance_invoice_check', col: 'invoice_code', def: "invoice_code    TEXT DEFAULT ''" },
      { table: 't_finance_invoice_check', col: 'invoice_no', def: "invoice_no      TEXT DEFAULT ''" },
      { table: 't_finance_invoice_check', col: 'invoice_id', def: "invoice_id      TEXT DEFAULT ''" },
      { table: 't_finance_invoice_check', col: 'duplicate_invoice_id', def: "duplicate_invoice_id TEXT DEFAULT ''" },
      { table: 't_finance_invoice_check', col: 'operator', def: "operator        TEXT DEFAULT ''" },
      { table: 't_finance_invoice_check', col: 'operator_id', def: "operator_id     TEXT DEFAULT ''" },
      { table: 't_finance_invoice_check', col: 'created_at', def: "created_at      TEXT DEFAULT ''" },
      { table: 't_contract_main', col: 'is_confidential', def: "is_confidential INTEGER DEFAULT 0" },
      { table: 'checkins', col: 'check_in_photo', def: "check_in_photo TEXT DEFAULT \"\"" },
      { table: 'checkins', col: 'check_out_photo', def: "check_out_photo TEXT DEFAULT \"\"" },
    ];
    for (const a of alterStmts) {
      try {
        const cols = db.prepare('PRAGMA table_info(' + a.table + ')').all().map((c) => c.name);
        if (!cols.includes(a.col)) {
          db.exec('ALTER TABLE ' + a.table + ' ADD COLUMN ' + a.def);
          console.log('[Migration 007] 补列: ' + a.table + '.' + a.col);
        }
      } catch (e) { console.log('[Migration 007] 补列跳过/失败 ' + a.table + '.' + a.col + ':', e.message); }
    }
    console.log('[Migration 007] 参考项目表结构对齐完成: 建表 ' + createStmts.length + ' 个, 补列 ' + alterStmts.length + ' 处');
  },
};
