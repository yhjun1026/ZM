/**
 * 工作汇报路由 — 按《公司OA自主研发系统-工作汇报模块功能及流程规范方案》改造
 * 6大类型：日报/周报/月报/季度总结/半年总结/年度总结
 * 闭环流程：员工填报自查 → 直属上级初审(通过/驳回/暂存) → 副总复核 → 总经理终审 → 归档(生成唯一归档编号锁定)
 * 支持：驳回整改重提(版本留存) / 逾期管控 / 模板自定义 / 评论互动 / 统计导出
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, now } = require('../../compat/helpers');

router.use(authMiddleware);

/* ===== 数据库迁移（幂等） ===== */
(function migrate() {
  const cols = ['report_no', 'version', 'highlights', 'problems', 'resources', 'self_check', 'attachments', 'reject_count', 'reject_reason', 'is_overdue', 'deadline', 'archived_at'];
  const exist = db.prepare('PRAGMA table_info(work_reports)').all().map(c => c.name);
  const addMap = {
    report_no: "ALTER TABLE work_reports ADD COLUMN report_no TEXT DEFAULT ''",
    version: "ALTER TABLE work_reports ADD COLUMN version INTEGER DEFAULT 1",
    highlights: "ALTER TABLE work_reports ADD COLUMN highlights TEXT DEFAULT ''",
    problems: "ALTER TABLE work_reports ADD COLUMN problems TEXT DEFAULT ''",
    resources: "ALTER TABLE work_reports ADD COLUMN resources TEXT DEFAULT ''",
    self_check: "ALTER TABLE work_reports ADD COLUMN self_check TEXT DEFAULT '1'",
    attachments: "ALTER TABLE work_reports ADD COLUMN attachments TEXT DEFAULT '[]'",
    reject_count: "ALTER TABLE work_reports ADD COLUMN reject_count INTEGER DEFAULT 0",
    reject_reason: "ALTER TABLE work_reports ADD COLUMN reject_reason TEXT DEFAULT ''",
    is_overdue: "ALTER TABLE work_reports ADD COLUMN is_overdue INTEGER DEFAULT 0",
    deadline: "ALTER TABLE work_reports ADD COLUMN deadline TEXT DEFAULT ''",
    archived_at: "ALTER TABLE work_reports ADD COLUMN archived_at TEXT DEFAULT ''"
  };
  cols.forEach(c => { if (!exist.includes(c)) { try { db.exec(addMap[c]); } catch (e) { /* 已存在 */ } } });
  db.exec(`CREATE TABLE IF NOT EXISTS t_report_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT DEFAULT '',
    content_template TEXT DEFAULT '',
    required_fields TEXT DEFAULT '[]',
    status TEXT DEFAULT '启用',
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_report_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    snapshot TEXT DEFAULT '{}',
    action TEXT DEFAULT '',
    operator TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_report_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    user_id TEXT DEFAULT '',
    user_name TEXT DEFAULT '',
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
})();

/* ===== 预置汇报模板（首次启动自动填充） ===== */
(function seedTemplates() {
  const cnt = db.prepare('SELECT COUNT(*) n FROM t_report_templates').get().n;
  if (cnt > 0) return; // 已有模板则跳过
  const seeds = [
    { name: '标准日报模板', type: '日报', description: '适用于每日工作汇报，简洁记录当日工作与明日计划',
      content: '一、今日完成工作\n1. \n2. \n3. \n二、未完成事项及原因\n三、明日工作计划\n1. \n2. \n' },
    { name: '标准周报模板', type: '周报', description: '适用于每周工作汇报，总结本周成果并规划下周',
      content: '一、本周工作完成情况\n1. \n2. \n3. \n二、主要成果与亮点\n1. \n三、存在问题与需协调事项\n四、下周工作计划\n1. \n2. \n' },
    { name: '标准月报模板', type: '月报', description: '适用于每月工作汇报，全面总结本月工作',
      content: '一、本月主要工作内容\n1. \n2. \n3. \n二、本月工作总结\n（从完成情况、质量效果、团队协作等方面总结）\n三、数据指标完成情况\n四、存在问题与改进措施\n五、下月工作计划\n1. \n2. \n' },
    { name: '季度总结模板', type: '季度总结', description: '适用于季度工作复盘，聚焦目标达成与差距分析',
      content: '一、本季度主要工作\n1. \n2. \n3. \n二、季度总结与复盘\n1. 目标完成情况：\n2. 亮点工作：\n3. 不足与差距：\n三、经验教训与改进措施\n四、下季度工作计划\n1. \n2. \n' },
    { name: '半年总结模板', type: '半年总结', description: '适用于半年度工作总结，系统回顾半年工作',
      content: '一、本半年度主要工作\n1. \n2. \n3. \n二、半年总结与复盘\n1. 重点工作完成情况：\n2. 创新与突破：\n3. 不足与反思：\n三、下半年工作目标与计划\n1. \n2. \n' },
    { name: '年度总结模板', type: '年度总结', description: '适用于年度工作总结，全面回顾全年工作',
      content: '一、本年度主要工作\n1. \n2. \n3. \n二、年度总结与复盘\n1. 年度目标完成情况：\n2. 重点工作回顾：\n3. 创新成果：\n4. 不足与教训：\n三、明年工作规划\n1. 工作目标：\n2. 重点任务：\n3. 改进方向：\n' },
    { name: '专项工作汇报模板', type: '专项汇报', description: '适用于专项任务完成后的工作汇报',
      content: '一、专项任务概述\n（任务名称、背景、目标）\n二、执行情况与成效\n1. 执行过程：\n2. 完成情况：\n3. 取得成效：\n三、经验总结\n四、后续跟进计划\n1. \n2. \n' },
    { name: '项目进展汇报模板', type: '项目汇报', description: '适用于项目里程碑节点的进展汇报',
      content: '一、项目进展概述\n（项目名称、当前阶段、总体进度）\n二、已完成工作\n1. \n2. \n三、问题与风险分析\n1. 存在问题：\n2. 风险评估：\n3. 应对措施：\n四、下一阶段计划\n1. \n2. \n' },
    { name: '年度述职报告模板', type: '述职报告', description: '适用于年度述职，全面汇报履职情况',
      content: '一、履职情况概述\n（岗位职责、任职情况）\n二、主要工作成效\n1. \n2. \n3. \n三、工作不足与反思\n1. \n2. \n四、改进方向与目标\n1. 能力提升计划：\n2. 工作改进目标：\n3. 职业发展规划：\n' },
    { name: '销售周报模板', type: '周报', description: '适用于销售岗位每周业绩汇报',
      content: '一、本周销售完成情况\n1. 新增客户：\n2. 签约金额：\n3. 回款情况：\n二、客户跟进情况\n1. 重点客户进展：\n2. 意向客户名单：\n三、市场动态与竞品分析\n四、下周销售计划\n1. \n2. \n' },
    { name: '技术周报模板', type: '周报', description: '适用于技术岗位每周工作汇报',
      content: '一、本周开发任务完成情况\n1. \n2. \n二、技术问题与解决方案\n1. 问题：\n2. 方案：\n三、代码质量与测试情况\n四、下周技术计划\n1. \n2. \n' }
  ];
  const ins = db.prepare('INSERT INTO t_report_templates (name,type,description,content_template,required_fields,status,created_by) VALUES (?,?,?,?,?,?,?)');
  seeds.forEach(s => ins.run(s.name, s.type, s.description, s.content, '[]', '启用', '系统预置'));
  console.log(`[reports] 预置 ${seeds.length} 个汇报模板`);
})();

/* ===== 类型规范配置 ===== */
const REPORT_TYPES = {
  '日报': {
    deadlineDesc: '当日 24:00',
    labels: { content: '今日工作内容', plan: '明日工作计划' },
    required: ['content', 'plan']
  },
  '周报': {
    deadlineDesc: '本周五 18:00',
    labels: { content: '本周工作内容', plan: '下周工作计划', highlights: '主要成果与亮点' },
    required: ['content', 'highlights', 'plan']
  },
  '月报': {
    deadlineDesc: '当月最后一日 20:00',
    labels: { content: '本月主要工作', summary: '本月工作总结', next_plan: '下月工作计划' },
    required: ['content', 'summary', 'next_plan']
  },
  '季度总结': {
    deadlineDesc: '季度结束后 3 个工作日内（次季度首月 3 日 18:00）',
    labels: { content: '本季度主要工作', summary: '季度总结与复盘', next_plan: '下季度工作计划' },
    required: ['content', 'summary', 'next_plan']
  },
  '半年总结': {
    deadlineDesc: '上半年 7 月 3 日 18:00 / 下半年次年 1 月 5 日 18:00',
    labels: { content: '本半年度主要工作', summary: '半年总结与复盘', next_plan: '下阶段工作计划' },
    required: ['content', 'summary', 'next_plan']
  },
  '年度总结': {
    deadlineDesc: '次年 1 月 5 日 18:00 前归档',
    labels: { content: '本年度主要工作', summary: '年度总结与复盘', next_plan: '明年工作计划' },
    required: ['content', 'summary', 'next_plan']
  },
  '专项汇报': {
    deadlineDesc: '专项任务结束后 3 个工作日内',
    labels: { content: '专项任务概述', summary: '执行情况与成效', next_plan: '后续跟进计划' },
    required: ['content', 'summary', 'next_plan']
  },
  '项目汇报': {
    deadlineDesc: '项目里程碑节点后 5 个工作日内',
    labels: { content: '项目进展概述', summary: '问题与风险分析', next_plan: '下一阶段计划' },
    required: ['content', 'summary', 'next_plan']
  },
  '述职报告': {
    deadlineDesc: '次年 1 月 10 日 18:00 前归档',
    labels: { content: '履职情况概述', summary: '工作成效与不足', next_plan: '改进方向与目标' },
    required: ['content', 'summary', 'next_plan']
  }
};

// 计算提交截止时间（基于当前时间与类型）
function computeDeadline(type, dateStr) {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (isNaN(base.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (type === '日报') return fmt(base) + ' 23:59:59';
  if (type === '周报') {
    const d = new Date(base);
    const day = d.getDay() === 0 ? 7 : d.getDay(); // 周一=1
    d.setDate(d.getDate() + (5 - day)); // 本周五
    if (day > 5) d.setDate(d.getDate() + 7); // 周末提交则顺延下周五
    return fmt(d) + ' 18:00:00';
  }
  if (type === '月报') {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, 0); // 月末
    return fmt(d) + ' 20:00:00';
  }
  if (type === '季度总结') {
    // 季度首月3日18:00（覆盖"季度结束后3个工作日"）
    const qStartMonth = Math.floor(base.getMonth() / 3) * 3;
    const d = new Date(base.getFullYear(), qStartMonth + 3, 3); // 下一季度首月3日
    return fmt(d) + ' 18:00:00';
  }
  if (type === '半年总结') {
    return base.getMonth() < 6
      ? `${base.getFullYear()}-07-03 18:00:00`
      : `${base.getFullYear() + 1}-01-05 18:00:00`;
  }
  if (type === '年度总结') return `${base.getFullYear() + 1}-01-05 18:00:00`;
  if (type === '专项汇报') {
    const d = new Date(base);
    d.setDate(d.getDate() + 3); // 3个工作日内
    return fmt(d) + ' 18:00:00';
  }
  if (type === '项目汇报') {
    const d = new Date(base);
    d.setDate(d.getDate() + 5); // 5个工作日内
    return fmt(d) + ' 18:00:00';
  }
  if (type === '述职报告') return `${base.getFullYear() + 1}-01-10 18:00:00`;
  return '';
}

function fmtDateTime(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 生成5节点闭环审批流程
function buildReportFlow() {
  const nowStr = now();
  return [
    { step: '员工填报自查', user: '', time: nowStr, done: true, remark: '提交时自查确认' },
    { step: '部门负责人初审', user: '', time: '—', done: false, remark: '' },
    { step: '副总复核', user: '', time: '—', done: false, remark: '' },
    { step: '总经理终审', user: '', time: '—', done: false, remark: '' },
    { step: '归档', user: '', time: '—', done: false, remark: '' }
  ];
}

// 步骤权限检查
function canActStep(u, stepName) {
  if (u.role === '超级管理员') return true;
  if (stepName.includes('部门负责人')) return u.role === '部门经理';
  if (stepName.includes('副总')) return u.role === '副总' || u.role === '总经理';
  if (stepName.includes('总经理')) return u.role === '总经理';
  return false;
}

// 生成唯一归档编号 BG-YYYYMM-NNN
function genReportNo() {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const row = db.prepare("SELECT COUNT(*) n FROM work_reports WHERE report_no LIKE ?").all(`BG-${ym}-%`)[0];
  return `BG-${ym}-${String((row.n || 0) + 1).padStart(3, '0')}`;
}

function scopeFilter(u) {
  // 数据查看范围：超管/总经理/副总=全部；部门经理/销售总监=本部门；其他=本人
  if (['超级管理员', '总经理', '副总'].includes(u.role)) return null;
  if (['部门经理', '销售总监'].includes(u.role)) return { dept: u.dept };
  return { user_id: String(u.id) };
}

function versionSnapshot(r) {
  return JSON.stringify({
    type: r.type, date: r.date, month: r.month, content: r.content, plan: r.plan,
    summary: r.summary, next_plan: r.next_plan, highlights: r.highlights,
    problems: r.problems, resources: r.resources, attachments: r.attachments
  });
}

/* ===== 汇报列表（权限分级 + 筛选） ===== */
router.get('/', (req, res) => {
  const { type, status, overdue, dept, mine, keyword } = req.query;
  const scope = mine === '1' ? { user_id: String(req.user.id) } : scopeFilter(req.user);
  let sql = 'SELECT * FROM work_reports WHERE 1=1';
  const args = [];
  if (type && type !== '全部') { sql += ' AND type = ?'; args.push(type); }
  if (status && status !== '全部') { sql += ' AND status = ?'; args.push(status); }
  if (overdue === '1') sql += ' AND is_overdue = 1';
  if (dept) { sql += ' AND dept = ?'; args.push(dept); }
  if (scope && scope.dept) { sql += ' AND dept = ?'; args.push(scope.dept); }
  if (scope && scope.user_id) { sql += ' AND user_id = ?'; args.push(scope.user_id); }
  if (keyword) { sql += ' AND (user_name LIKE ? OR content LIKE ?)'; args.push(`%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...args);
  rows.forEach(r => {
    r.approval_flow = safeParse(r.approval_flow, []);
    r.attachments = safeParse(r.attachments, []);
  });
  return success(res, rows);
});

/* ===== 统计分析（部门汇总复盘 + 公司层级统计） ===== */
router.get('/stats', (req, res) => {
  const scope = scopeFilter(req.user);
  let cond = '1=1'; const args = [];
  if (scope && scope.dept) { cond += ' AND dept = ?'; args.push(scope.dept); }
  if (scope && scope.user_id) { cond += ' AND user_id = ?'; args.push(scope.user_id); }
  const rows = db.prepare(`SELECT type, status, dept, user_name, is_overdue FROM work_reports WHERE ${cond}`).all(...args);
  const byType = {}, byStatus = {}, byDept = {};
  let overdue = 0, archived = 0, rejected = 0, pending = 0;
  const staff = new Set();
  rows.forEach(r => {
    byType[r.type] = (byType[r.type] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byDept[r.dept] = (byDept[r.dept] || 0) + 1;
    staff.add(r.dept + '|' + r.user_name);
    if (r.is_overdue) overdue++;
    if (r.status === '已归档') archived++;
    if (r.status === '已驳回') rejected++;
    if (['待初审', '待审阅', '审批中', '已提交', '暂存'].includes(r.status)) pending++;
  });
  return success(res, {
    total: rows.length, byType, byStatus, byDept, overdue, archived, rejected, pending,
    reporters: staff.size,
    types: Object.keys(REPORT_TYPES).map(t => ({ type: t, count: byType[t] || 0, deadline: REPORT_TYPES[t].deadlineDesc }))
  });
});

/* ===== CSV 导出 ===== */
router.get('/export', (req, res) => {
  const scope = scopeFilter(req.user);
  let sql = 'SELECT * FROM work_reports WHERE 1=1'; const args = [];
  if (req.query.type && req.query.type !== '全部') { sql += ' AND type = ?'; args.push(req.query.type); }
  if (scope && scope.dept) { sql += ' AND dept = ?'; args.push(scope.dept); }
  if (scope && scope.user_id) { sql += ' AND user_id = ?'; args.push(scope.user_id); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...args);
  const head = ['归档编号', '类型', '日期/期间', '姓名', '部门', '状态', '版本', '逾期', '驳回次数', '提交时间', '内容摘要'];
  const csv = [head.join(',')].concat(rows.map(r => [
    r.report_no || '', r.type, r.month || r.date || '', r.user_name, r.dept, r.status,
    r.version || 1, r.is_overdue ? '是' : '否', r.reject_count || 0, r.created_at || '',
    '"' + String(r.content || r.summary || '').replace(/"/g, '""').substring(0, 100) + '"'
  ].join(','))).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="reports_export.csv"');
  return res.send('\uFEFF' + csv);
});

/* ===== 模板管理 ===== */
router.get('/templates', (req, res) => {
  const rows = db.prepare("SELECT * FROM t_report_templates ORDER BY created_at DESC").all();
  rows.forEach(t => t.required_fields = safeParse(t.required_fields, []));
  return success(res, rows);
});

router.post('/templates', (req, res) => {
  if (!['超级管理员', '总经理', '副总', '部门经理'].includes(req.user.role)) return error(res, 403, '仅管理层可维护汇报模板');
  const { name, type, description, content_template, required_fields, status } = req.body;
  if (!name) return error(res, 400, '模板名称不能为空');
  if (!REPORT_TYPES[type]) return error(res, 400, '汇报类型不合法');
  const info = db.prepare('INSERT INTO t_report_templates (name,type,description,content_template,required_fields,status,created_by) VALUES (?,?,?,?,?,?,?)')
    .run(name, type, description || '', content_template || '', JSON.stringify(required_fields || []), status || '启用', req.user.name);
  return success(res, { id: info.lastInsertRowid }, '模板已创建');
});

router.put('/templates/:id', (req, res) => {
  if (!['超级管理员', '总经理', '副总', '部门经理'].includes(req.user.role)) return error(res, 403, '仅管理层可维护汇报模板');
  const t = db.prepare('SELECT * FROM t_report_templates WHERE id = ?').get(req.params.id);
  if (!t) return error(res, 404, '模板不存在');
  const { name, type, description, content_template, required_fields, status } = req.body;
  db.prepare("UPDATE t_report_templates SET name=?, type=?, description=?, content_template=?, required_fields=?, status=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(name || t.name, type || t.type, description !== undefined ? description : t.description,
      content_template !== undefined ? content_template : t.content_template,
      JSON.stringify(required_fields !== undefined ? required_fields : safeParse(t.required_fields, [])),
      status || t.status, req.params.id);
  return success(res, null, '模板已更新');
});

router.delete('/templates/:id', (req, res) => {
  if (!['超级管理员', '总经理', '副总', '部门经理'].includes(req.user.role)) return error(res, 403, '仅管理层可维护汇报模板');
  const info = db.prepare('DELETE FROM t_report_templates WHERE id = ?').run(req.params.id);
  if (!info.changes) return error(res, 404, '模板不存在');
  return success(res, null, '模板已删除');
});

/* ===== 类型规范查询（前端动态表单用） ===== */
router.get('/meta', (req, res) => {
  return success(res, Object.keys(REPORT_TYPES).map(t => ({
    type: t, deadline: REPORT_TYPES[t].deadlineDesc, labels: REPORT_TYPES[t].labels, required: REPORT_TYPES[t].required
  })));
});

/* ===== 创建汇报（填报自查 → 初审） ===== */
router.post('/', (req, res) => {
  const { type, content, plan, date, month, summary, next_plan, highlights, problems, resources, attachments, self_check, period } = req.body;
  const reportType = type || '日报';
  const cfg = REPORT_TYPES[reportType];
  if (!cfg) return error(res, 400, '汇报类型不合法，支持：' + Object.keys(REPORT_TYPES).join('/'));
  if (!content) return error(res, 400, '汇报内容不能为空');
  // 按类型必填校验
  const dataMap = { content, plan, summary, next_plan, highlights };
  for (const f of cfg.required) {
    if (!dataMap[f]) return error(res, 400, `${cfg.labels[f] || f}为必填项`);
  }
  if (self_check !== '1' && !self_check) return error(res, 400, '提交前须完成填报自查确认');
  if (reportType === '月报' && !month && !date) return error(res, 400, '月报必须选择汇报月份');

  const reportDate = date || new Date().toISOString().slice(0, 10);
  const deadline = computeDeadline(reportType, reportDate);
  const nowFull = fmtDateTime(new Date());
  const isOverdue = deadline && nowFull > deadline ? 1 : 0;
  const flow = buildReportFlow();

  const info = db.prepare(`INSERT INTO work_reports
    (user_id,user_name,dept,type,date,month,content,plan,summary,next_plan,highlights,problems,resources,attachments,self_check,status,approval_flow,version,deadline,is_overdue,reject_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(String(req.user.id), req.user.name, req.user.dept, reportType, reportDate,
      month || period || '', content, plan || '', summary || '', next_plan || '',
      highlights || '', problems || '', resources || '', JSON.stringify(attachments || []), '1',
      '待初审', JSON.stringify(flow), 1, deadline, isOverdue, 0);

  // 版本留存 V1
  const created = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(info.lastInsertRowid);
  db.prepare('INSERT INTO t_report_versions (report_id,version,snapshot,action,operator) VALUES (?,?,?,?,?)')
    .run(info.lastInsertRowid, 1, versionSnapshot(created), '提交', req.user.name);

  return success(res, { id: info.lastInsertRowid, deadline, is_overdue: isOverdue },
    isOverdue ? '汇报已提交（已超截止时间，标记为逾期）' : `汇报已提交，等待部门负责人初审（截止 ${deadline || '不限'}）`);
});

/* ===== 单条详情（含版本链+评论） ===== */
router.get('/:id(\\d+)', (req, res) => {
  const row = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '汇报不存在');
  const scope = scopeFilter(req.user);
  if (scope && scope.dept && row.dept !== scope.dept) return error(res, 403, '无权查看其他部门的汇报');
  if (scope && scope.user_id && String(row.user_id) !== scope.user_id) return error(res, 403, '无权查看他人汇报');
  row.approval_flow = safeParse(row.approval_flow, []);
  row.attachments = safeParse(row.attachments, []);
  const versions = db.prepare('SELECT id,version,action,operator,created_at,snapshot FROM t_report_versions WHERE report_id = ? ORDER BY version DESC').all(row.id);
  versions.forEach(v => v.snapshot = safeParse(v.snapshot, {}));
  row.versions = versions;
  row.comments = db.prepare('SELECT * FROM t_report_comments WHERE report_id = ? ORDER BY created_at DESC').all(row.id);
  return success(res, row);
});

/* ===== 修改（仅本人，未归档锁定） ===== */
router.put('/:id(\\d+)', (req, res) => {
  const r = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(req.params.id);
  if (!r) return error(res, 404, '汇报不存在');
  if (r.status === '已归档' || r.report_no) return error(res, 400, `该汇报已归档锁定（${r.report_no}），不可修改`);
  if (String(r.user_id) !== String(req.user.id) && req.user.role !== '超级管理员') return error(res, 403, '仅汇报人本人可修改');
  if (!['已驳回', '暂存', '待初审', '已提交', '待审阅'].includes(r.status)) return error(res, 400, '当前状态不可修改');
  const { content, plan, summary, next_plan, highlights, problems, resources, attachments, month } = req.body;
  db.prepare(`UPDATE work_reports SET content=?, plan=?, summary=?, next_plan=?, highlights=?, problems=?, resources=?, attachments=?, month=? WHERE id=?`)
    .run(content !== undefined ? content : r.content, plan !== undefined ? plan : r.plan,
      summary !== undefined ? summary : r.summary, next_plan !== undefined ? next_plan : r.next_plan,
      highlights !== undefined ? highlights : r.highlights, problems !== undefined ? problems : r.problems,
      resources !== undefined ? resources : r.resources,
      attachments !== undefined ? JSON.stringify(attachments) : r.attachments,
      month !== undefined ? month : r.month, req.params.id);
  return success(res, null, '汇报已保存');
});

/* ===== 驳回整改重提（版本+1，流程重置） ===== */
router.post('/:id(\\d+)/resubmit', (req, res) => {
  const r = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(req.params.id);
  if (!r) return error(res, 404, '汇报不存在');
  if (r.status !== '已驳回') return error(res, 400, '仅被驳回的汇报可整改重提');
  if (String(r.user_id) !== String(req.user.id)) return error(res, 403, '仅汇报人本人可重提');
  const { content, plan, summary, next_plan, highlights, problems } = req.body;
  const newVersion = (r.version || 1) + 1;
  const flow = buildReportFlow();
  // 保留逾期属性重新评估
  const nowFull = fmtDateTime(new Date());
  const isOverdue = r.deadline && nowFull > r.deadline ? 1 : 0;
  db.prepare(`UPDATE work_reports SET content=?, plan=?, summary=?, next_plan=?, highlights=?, problems=?, version=?, status='待初审', approval_flow=?, reject_reason='', is_overdue=? WHERE id=?`)
    .run(content || r.content, plan || r.plan, summary || r.summary, next_plan || r.next_plan,
      highlights || r.highlights, problems || r.problems, newVersion, JSON.stringify(flow), isOverdue, req.params.id);
  const updated = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(req.params.id);
  db.prepare('INSERT INTO t_report_versions (report_id,version,snapshot,action,operator) VALUES (?,?,?,?,?)')
    .run(req.params.id, newVersion, versionSnapshot(updated), '驳回整改重提', req.user.name);
  return success(res, { version: newVersion }, `整改重提成功（V${newVersion}），重新进入初审`);
});

/* ===== 审批（通过 pass / 暂存 hold） ===== */
router.post('/:id(\\d+)/approve', (req, res) => {
  const report = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(req.params.id);
  if (!report) return error(res, 404, '汇报不存在');
  if (['已归档', '已完成'].includes(report.status)) return error(res, 400, '该汇报已完成审阅');
  if (report.status === '已驳回') return error(res, 400, '该汇报已被驳回，请汇报人整改后重提');
  const action = (req.body.action || 'pass') === 'hold' ? 'hold' : 'pass';

  let flow = safeParse(report.approval_flow, []);
  if (!Array.isArray(flow) || flow.length === 0) return error(res, 400, '审批流程数据异常');
  const nextIdx = flow.findIndex(s => !s.done);
  if (nextIdx === -1) return error(res, 400, '所有步骤已完成');

  const stepName = flow[nextIdx].step;
  if (!canActStep(req.user, stepName)) return error(res, 403, `当前步骤「${stepName}」无权操作`);

  const nowStr = now();
  if (action === 'hold') {
    // 暂存：仅初审节点可用，流程暂停等待
    if (!stepName.includes('部门负责人')) return error(res, 400, '仅初审环节支持暂存');
    flow[nextIdx].remark = '暂存';
    db.prepare('UPDATE work_reports SET approval_flow=?, status=? WHERE id=?')
      .run(JSON.stringify(flow), '暂存', req.params.id);
    return success(res, { status: '暂存' }, '汇报已暂存（未进入下一环节）');
  }

  flow[nextIdx].done = true;
  flow[nextIdx].user = req.user.name;
  flow[nextIdx].time = nowStr;
  flow[nextIdx].remark = req.body.remark || '通过';

  let newStatus = '审批中';
  if (flow.filter(s => !s.step.includes('归档')).every(s => s.done)) {
    // 全部审批节点完成 → 自动归档
    const reportNo = genReportNo();
    const archiveIdx = flow.findIndex(s => s.step.includes('归档'));
    if (archiveIdx !== -1) { flow[archiveIdx].done = true; flow[archiveIdx].user = '系统'; flow[archiveIdx].time = nowStr; flow[archiveIdx].remark = reportNo; }
    newStatus = '已归档';
    db.prepare("UPDATE work_reports SET approval_flow=?, status=?, report_no=?, archived_at=datetime('now','localtime') WHERE id=?")
      .run(JSON.stringify(flow), newStatus, reportNo, req.params.id);
    return success(res, { status: newStatus, report_no: reportNo }, `终审通过，已自动归档（编号 ${reportNo}，内容锁定）`);
  }

  db.prepare('UPDATE work_reports SET approval_flow=?, status=? WHERE id=?')
    .run(JSON.stringify(flow), newStatus, req.params.id);
  return success(res, { status: newStatus }, newStatus === '审批中' ? `初审/复核通过，流转至「${flow[flow.findIndex(s => !s.done)] ? flow[flow.findIndex(s => !s.done)].step : ''}」` : '审阅通过');
});

/* ===== 驳回（必须填写意见） ===== */
router.post('/:id(\\d+)/reject', (req, res) => {
  const report = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(req.params.id);
  if (!report) return error(res, 404, '汇报不存在');
  if (['已归档', '已完成'].includes(report.status)) return error(res, 400, '该汇报已归档锁定，不可驳回');
  const { remark } = req.body;
  if (!remark || !remark.trim()) return error(res, 400, '驳回必须填写意见');

  let flow = safeParse(report.approval_flow, []);
  const nextIdx = flow.findIndex(s => !s.done);
  if (nextIdx === -1) return error(res, 400, '所有步骤已完成');
  if (!canActStep(req.user, flow[nextIdx].step)) return error(res, 403, `当前步骤「${flow[nextIdx].step}」无权操作`);

  flow[nextIdx].user = req.user.name;
  flow[nextIdx].time = now();
  flow[nextIdx].remark = '驳回：' + remark.trim();
  db.prepare('UPDATE work_reports SET approval_flow=?, status=?, reject_count=?, reject_reason=? WHERE id=?')
    .run(JSON.stringify(flow), '已驳回', (report.reject_count || 0) + 1, remark.trim(), req.params.id);
  return success(res, null, '汇报已驳回，待汇报人整改后重新提交');
});

/* ===== 评论互动 ===== */
router.post('/:id(\\d+)/comments', (req, res) => {
  const report = db.prepare('SELECT id FROM work_reports WHERE id = ?').get(req.params.id);
  if (!report) return error(res, 404, '汇报不存在');
  const { content } = req.body;
  if (!content || !content.trim()) return error(res, 400, '评论内容不能为空');
  db.prepare('INSERT INTO t_report_comments (report_id,user_id,user_name,content) VALUES (?,?,?,?)')
    .run(req.params.id, String(req.user.id), req.user.name, content.trim());
  return success(res, null, '评论已发布');
});

/* ===== 删除（仅本人未归档 / 超管） ===== */
router.delete('/:id(\\d+)', (req, res) => {
  const r = db.prepare('SELECT * FROM work_reports WHERE id = ?').get(req.params.id);
  if (!r) return error(res, 404, '汇报不存在');
  if (r.status === '已归档' || r.report_no) return error(res, 400, `已归档汇报（${r.report_no}）禁止删除`);
  if (String(r.user_id) !== String(req.user.id) && req.user.role !== '超级管理员') return error(res, 403, '仅汇报人本人可删除');
  db.prepare('DELETE FROM work_reports WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM t_report_versions WHERE report_id = ?').run(req.params.id);
  db.prepare('DELETE FROM t_report_comments WHERE report_id = ?').run(req.params.id);
  return success(res, null, '汇报已删除');
});

module.exports = router;
