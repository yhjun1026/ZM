/**
 * 请假&出差模块 公共引擎 (PRD: OA智能办公平台-请假、出差模块)
 * 职责:
 *  1. t_lv_forms / t_tr_forms / t_att_archive / t_lv_quota / t_lv_holidays 表迁移
 *  2. 角色解析 resolveRole + 审批流构造 buildAttFlow (直属上级→部门负责人→高管, 部门负责人及以上规避自审)
 *  3. 审批流转 attApprove / attReject (越级403拦截)
 *  4. AI智能: calcLeaveDays(工作日核算0.5天精度+法定节假日剔除) / aiCheckLeave / aiCheckTrip(类型自动判定+时间冲突)
 *  5. 假期额度管理 ensureQuota / getQuotaLeft
 *  6. 销假/销差闭环 settleAttForm (实际天数对比标注)
 *  7. 行政部统一归档 archiveAttForm + 档案编号 + scanAttAlerts(超时审批/超期未销假销差预警)
 */
const { db } = require('./database');
const { genId, now, safeParse } = require('./helpers');

/* ===== 表迁移 ===== */
function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS t_lv_forms (
    id TEXT PRIMARY KEY,
    applicant TEXT NOT NULL, applicant_id TEXT NOT NULL, dept TEXT NOT NULL, position TEXT DEFAULT '',
    leave_type TEXT NOT NULL,
    start_date TEXT NOT NULL, start_half TEXT DEFAULT '全天', end_date TEXT NOT NULL, end_half TEXT DEFAULT '全天',
    days REAL DEFAULT 0, reason TEXT DEFAULT '',
    contact TEXT DEFAULT '', emergency_contact TEXT DEFAULT '', handover TEXT DEFAULT '',
    attachments TEXT DEFAULT '[]',
    quota_left REAL DEFAULT 0, ai_check TEXT DEFAULT '{}',
    status TEXT DEFAULT '待审批', flow TEXT DEFAULT '[]',
    actual_days REAL DEFAULT 0, settle_note TEXT DEFAULT '', settle_at TEXT DEFAULT '', settle_by TEXT DEFAULT '',
    archive_no TEXT DEFAULT '', archived_at TEXT DEFAULT '',
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_forms (
    id TEXT PRIMARY KEY,
    applicant TEXT NOT NULL, applicant_id TEXT NOT NULL, dept TEXT NOT NULL, position TEXT DEFAULT '',
    trip_type TEXT NOT NULL, destination TEXT NOT NULL, is_local INTEGER DEFAULT 0, cross_province INTEGER DEFAULT 0,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, days REAL DEFAULT 0,
    purpose TEXT DEFAULT '', task TEXT DEFAULT '', counterpart TEXT DEFAULT '',
    contact TEXT DEFAULT '', companions TEXT DEFAULT '', itinerary TEXT DEFAULT '', budget_note TEXT DEFAULT '',
    remark TEXT DEFAULT '', attachments TEXT DEFAULT '[]',
    ai_check TEXT DEFAULT '{}',
    status TEXT DEFAULT '待审批', flow TEXT DEFAULT '[]',
    actual_days REAL DEFAULT 0, summary TEXT DEFAULT '', feedback TEXT DEFAULT '', settle_at TEXT DEFAULT '', settle_by TEXT DEFAULT '',
    archive_no TEXT DEFAULT '', archived_at TEXT DEFAULT '',
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_att_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_type TEXT NOT NULL, form_id TEXT NOT NULL, form_no TEXT DEFAULT '',
    applicant TEXT DEFAULT '', dept TEXT DEFAULT '',
    snapshot TEXT DEFAULT '{}',
    status TEXT DEFAULT '待归档', archive_no TEXT DEFAULT '', filed_by TEXT DEFAULT '', filed_at TEXT DEFAULT '',
    remark TEXT DEFAULT '', created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_lv_quota (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_id TEXT NOT NULL, emp_name TEXT DEFAULT '', year INTEGER NOT NULL, leave_type TEXT NOT NULL,
    total REAL DEFAULT 0, used REAL DEFAULT 0,
    UNIQUE(emp_id, year, leave_type)
  );
  CREATE TABLE IF NOT EXISTS t_lv_holidays (
    day TEXT PRIMARY KEY, name TEXT DEFAULT ''
  );
  `);
  // 内置2026年法定节假日(可由系统管理员维护)
  const H2026 = [
    ['2026-01-01', '元旦'], ['2026-01-02', '元旦'], ['2026-01-03', '元旦'],
    ['2026-02-15', '春节'], ['2026-02-16', '春节'], ['2026-02-17', '春节(除夕)'], ['2026-02-18', '春节'],
    ['2026-02-19', '春节'], ['2026-02-20', '春节'], ['2026-02-21', '春节'], ['2026-02-22', '春节'], ['2026-02-23', '春节'],
    ['2026-04-04', '清明'], ['2026-04-05', '清明'], ['2026-04-06', '清明'],
    ['2026-05-01', '劳动节'], ['2026-05-02', '劳动节'], ['2026-05-03', '劳动节'], ['2026-05-04', '劳动节'], ['2026-05-05', '劳动节'],
    ['2026-06-19', '端午'], ['2026-06-20', '端午'], ['2026-06-21', '端午'],
    ['2026-09-25', '中秋'], ['2026-09-26', '中秋'],
    ['2026-10-01', '国庆'], ['2026-10-02', '国庆'], ['2026-10-03', '国庆'], ['2026-10-04', '国庆'],
    ['2026-10-05', '国庆'], ['2026-10-06', '国庆'], ['2026-10-07', '国庆'], ['2026-10-08', '国庆']
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO t_lv_holidays (day, name) VALUES (?, ?)');
  H2026.forEach(d => ins.run(d[0], d[1]));
}
migrate();

/* ===== 常量 ===== */
const LEAVE_TYPES = ['事假', '病假', '年假', '婚假', '产假', '陪产假', '丧假', '调休假'];
const LEGAL_TYPES = ['婚假', '产假', '陪产假', '丧假']; // 法定长假 → 需佐证 + 行政核验
// 默认年额度(天); 未列出的法定假(婚/产/陪产/丧)不设额度限制
const DEFAULT_QUOTA = { '年假': 5, '事假': 10, '病假': 15, '调休假': 5 };
const LEADER_ROLES = ['部门经理', '销售总监', '副总', '总经理', '超级管理员']; // 部门负责人及以上职级

function isLeader(u) { return LEADER_ROLES.includes(u.role); }

/* ===== 角色解析 (直属上级/部门负责人/高管/行政核验) ===== */
function resolveRole(role, dept) {
  try {
    if (role === 'deptLeader') {
      // 直属上级: 销售部→销售总监(备位区域经理); 其他部门→本部门部门经理
      if (dept === '销售部') {
        return db.prepare(`SELECT name FROM users WHERE dept='销售部' AND role='销售总监' AND status='在职' LIMIT 1`).get()?.name ||
               db.prepare(`SELECT name FROM users WHERE dept='销售部' AND role='区域经理' AND status='在职' LIMIT 1`).get()?.name || '';
      }
      return db.prepare(`SELECT name FROM users WHERE dept=? AND role='部门经理' AND status='在职' LIMIT 1`).get(dept)?.name || '';
    }
    if (role === 'deptHead') {
      // 部门负责人: 销售部→销售总监; 其他部门→分管副总
      if (dept === '销售部') {
        return db.prepare(`SELECT name FROM users WHERE role='销售总监' AND status='在职' LIMIT 1`).get()?.name || '';
      }
      return db.prepare(`SELECT name FROM users WHERE role='副总' AND status='在职' LIMIT 1`).get()?.name || '';
    }
    if (role === 'mgmt') return db.prepare(`SELECT name FROM users WHERE role='总经理' AND status='在职' LIMIT 1`).get()?.name || '';
    if (role === 'deputy') return db.prepare(`SELECT name FROM users WHERE role='副总' AND status='在职' LIMIT 1`).get()?.name || '';
    if (role === 'gm_only') return db.prepare(`SELECT name FROM users WHERE role='总经理' AND status='在职' LIMIT 1`).get()?.name || '';
    if (role === 'adminVerify') return '行政部核验'; // 行政部任意在职人员可核验
  } catch (e) { console.error('resolveRole fail', e.message); }
  return '';
}

// 步骤级权限校验(越级403)
function matchAttRole(u, role, formDept) {
  if (u.role === '超级管理员') return true;
  switch (role) {
    case 'deptLeader':
      return (u.role === '部门经理' && u.dept === formDept) ||
             (formDept === '销售部' && ['销售总监', '区域经理'].includes(u.role));
    case 'deptHead':
      return u.role === '副总' || (u.role === '销售总监' && formDept === '销售部');
    case 'mgmt':
      return u.role === '总经理' || u.role === '副总';
    case 'deputy':
      return u.role === '副总';
    case 'gm_only':
      return u.role === '总经理';
    case 'adminVerify':
      return u.dept === '行政部';
    default:
      return false;
  }
}

/* ===== 审批流构造 ===== */
// step: {step:显示名, role:角色标识, assignee:预设审批人, user:'', time:'', remark:'', done:false}
function buildAttFlow(kind, form) {
  const steps = [];
  const push = (role, label) => {
    const assignee = resolveRole(role, form.dept);
    steps.push({ step: label, role, assignee, user: '', time: '', remark: '', done: false });
  };
  if (isLeader(form)) {
    // 部门负责人及以上: 本人发起 → 副总审批 → 总经理审批 (规避自审自察漏洞)
    // 副总/总经理本人发起时直接到总经理审批(副总自审无意义)
    if (form.role === '副总' || form.role === '总经理' || form.role === '超级管理员') {
      push('gm_only', '总经理审批');
    } else {
      // 部门经理/销售总监/区域经理发起: 需副总审批后再由总经理审批
      push('deputy', '副总审批');
      push('gm_only', '总经理审批');
    }
  } else if (kind === 'leave') {
    const days = Number(form.days) || 0;
    if (LEGAL_TYPES.includes(form.leave_type)) {
      // 法定长假: 直属上级 → 部门负责人 → 副总审批 → 总经理审批 → 行政部核验材料
      push('deptLeader', '直属上级审批');
      push('deptHead', '部门负责人审批');
      push('deputy', '副总审批');
      push('gm_only', '总经理审批');
      push('adminVerify', '行政部核验材料');
    } else if (days > 3) {
      push('deptLeader', '直属上级审批');
      push('deptHead', '部门负责人审批');
      push('deputy', '副总审批');
      push('gm_only', '总经理审批');
    } else if (days > 1) { // 2-3天
      push('deptLeader', '直属上级审批');
      push('deptHead', '部门负责人审批');
    } else { // 0.5-1天
      push('deptLeader', '直属上级审批');
    }
  } else { // trip
    const days = Number(form.days) || 0;
    if (days > 3 || form.cross_province) {
      push('deptLeader', '直属上级审批');
      push('deptHead', '部门负责人审批');
      push('deputy', '副总审批');
      push('gm_only', '总经理审批');
    } else if (days > 1) { // 2-3天异地
      push('deptLeader', '直属上级审批');
      push('deptHead', '部门负责人审批');
    } else { // 本地/1天内
      push('deptLeader', '直属上级审批');
    }
  }
  // 同一人出现在相邻节点时自动去重(如销售部直属上级与部门负责人同为销售总监)
  // 注意: assignee为空(未匹配到在岗人员)的步骤必须保留，不能静默删除
  const seen = new Set();
  const dedup = steps.filter(s => {
    if (!s.assignee) return true; // 保留未分配审批人的步骤
    if (seen.has(s.assignee)) return false; // 同一人去重
    seen.add(s.assignee);
    return true;
  });
  const flow = dedup.length ? dedup : steps;
  if (!flow.length) push('gm_only', '总经理审批'); // 兜底
  return flow;
}

/* ===== AI: 请假天数核算 (剔除周末+法定节假日, 0.5天精度) ===== */
function calcLeaveDays(start_date, start_half, end_date, end_half) {
  const days = (d) => { const p = String(d).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const fmt = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  let s, e;
  try { s = days(start_date); e = days(end_date); } catch { return { ok: false, msg: '日期格式不正确' }; }
  if (isNaN(s) || isNaN(e)) return { ok: false, msg: '日期格式不正确' };
  if (s > e) return { ok: false, msg: '结束时间不能早于开始时间' };
  const holidaySet = new Set(db.prepare('SELECT day FROM t_lv_holidays').all().map(x => x.day));
  let workdays = 0, weekends = 0, holidays = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    const key = fmt(cur);
    if (holidaySet.has(key)) holidays++;
    else if (dow === 0 || dow === 6) weekends++;
    else workdays++;
    cur.setDate(cur.getDate() + 1);
  }
  let total = workdays;
  if (total > 0) {
    if (start_half === '下午') total -= 0.5;
    if (end_half === '上午') total -= 0.5;
  }
  if (total <= 0) return { ok: false, msg: '核算后请假天数不足0.5天, 请检查日期与半天设置' };
  return { ok: true, days: total, detail: { workdays, weekends, holidays } };
}

/* ===== AI: 假期额度管理 ===== */
function ensureQuota(emp_id, emp_name, year, leave_type) {
  const total = DEFAULT_QUOTA[leave_type];
  if (total === undefined) return null; // 法定假不设额度限制
  db.prepare(`INSERT OR IGNORE INTO t_lv_quota (emp_id, emp_name, year, leave_type, total, used)
    VALUES (?, ?, ?, ?, ?, 0)`).run(emp_id, emp_name, year, leave_type, total);
  return db.prepare(`SELECT * FROM t_lv_quota WHERE emp_id=? AND year=? AND leave_type=?`).get(emp_id, year, leave_type);
}
function getQuotaLeft(emp_id, emp_name, leave_type, at) {
  const year = new Date(at || Date.now()).getFullYear();
  const q = ensureQuota(emp_id, emp_name, year, leave_type);
  if (!q) return { unlimited: true, total: null, used: null, left: null };
  return { unlimited: false, total: q.total, used: q.used, left: Math.round((q.total - q.used) * 2) / 2 };
}
function addQuotaUsed(emp_id, leave_type, at, n) {
  const year = new Date(at || Date.now()).getFullYear();
  ensureQuota(emp_id, '', year, leave_type);
  db.prepare(`UPDATE t_lv_quota SET used = used + ? WHERE emp_id=? AND year=? AND leave_type=?`).run(n, emp_id, year, leave_type);
}

/* ===== AI: 请假申请校验 (拦截+预警) ===== */
function aiCheckLeave(u, form, excludeId) {
  const warnings = [];
  // 1. 天数核算
  const calc = calcLeaveDays(form.start_date, form.start_half, form.end_date, form.end_half);
  if (!calc.ok) return { ok: false, msg: calc.msg };
  // 2. 事假必填事由
  if (form.leave_type === '事假' && !String(form.reason || '').trim()) return { ok: false, msg: '事假必须填写请假事由' };
  // 3. 病假/婚产丧需佐证材料
  if ((form.leave_type === '病假' || LEGAL_TYPES.includes(form.leave_type)) &&
      !Array.isArray(form.attachments) && !String(form.attachments || '').trim().startsWith('[')) {
    // 允许前端传数组或JSON字符串
  }
  const atts = Array.isArray(form.attachments) ? form.attachments : safeParse(form.attachments, []);
  if (form.leave_type === '病假' && atts.length === 0) return { ok: false, msg: '病假需上传病历/就医凭证等佐证材料' };
  if (LEGAL_TYPES.includes(form.leave_type) && atts.length === 0) return { ok: false, msg: form.leave_type + '需上传对应证明材料' };
  // 4. 额度校验
  const quota = getQuotaLeft(u.id, u.name, form.leave_type);
  if (!quota.unlimited && calc.days > quota.left) {
    return { ok: false, msg: `申请${calc.days}天超过剩余额度, 当前${form.leave_type}剩余可用${quota.left}天` };
  }
  // 5. 时间冲突: 同一时间段已有生效/审批中请假单
  const overlap = db.prepare(`SELECT id FROM t_lv_forms WHERE applicant_id=? AND status IN ('待审批','审批中','审批通过')
    AND NOT (end_date < ? OR start_date > ?) ${excludeId ? 'AND id <> ' + JSON.stringify(excludeId) : ''}`)
    .get(u.id, String(form.start_date).slice(0, 10), String(form.end_date).slice(0, 10));
  if (overlap) return { ok: false, msg: '检测到同一时间段已有请假申请, 请勿重复申请' };
  // 6. 异常预警: 30天内频繁请假 / 跨月超长请假
  const recent = db.prepare(`SELECT COUNT(*) n FROM t_lv_forms WHERE applicant_id=? AND created_at >= datetime('now','localtime','-30 day')`).get(u.id).n;
  if (recent >= 2) warnings.push(`近30天内已提交${recent}次请假申请, 存在频繁请假风险, 请审批人重点关注`);
  if (calc.days > 5) warnings.push(`单次请假超过5天(${calc.days}天), 属超长请假, 请审批人核实`);
  return {
    ok: true, days: calc.days,
    check: {
      days_detail: calc.detail,
      quota, warnings,
      checked_at: now()
    }
  };
}

/* ===== AI: 出差申请校验 (类型自动判定+冲突检测) ===== */
function classifyTrip(form) {
  const days = Number(form.days) || 0;
  if (form.is_local) return '本地出差';
  if (form.cross_province && days > 7) return '跨省市长期出差';
  if (days > 3) return '异地长途出差';
  return '异地短途出差';
}
function aiCheckTrip(u, form, excludeId) {
  const warnings = [];
  const days = Number(form.days) || 0;
  if (!String(form.destination || '').trim()) return { ok: false, msg: '请填写出差地点' };
  if (days <= 0) return { ok: false, msg: '出差天数必须大于0' };
  // 类型自动判定
  const trip_type = classifyTrip(form);
  // 条件必填校验
  if ((trip_type === '异地长途出差' || trip_type === '跨省市长期出差') && !String(form.itinerary || '').trim())
    return { ok: false, msg: '长途出差必须填写行程安排' };
  if (!form.is_local && !String(form.budget_note || '').trim())
    return { ok: false, msg: '异地出差必须填写预算说明' };
  if (String(form.companion_count || '') === '多人' && !String(form.companions || '').trim())
    return { ok: false, msg: '多人出差必须填写随行人员' };
  // 时间冲突: 同一时段重复出差拦截
  const overlap = db.prepare(`SELECT id FROM t_tr_forms WHERE applicant_id=? AND status IN ('待审批','审批中','审批通过')
    AND NOT (end_date < ? OR start_date > ?) ${excludeId ? 'AND id <> ' + JSON.stringify(excludeId) : ''}`)
    .get(u.id, String(form.start_date).slice(0, 10), String(form.end_date).slice(0, 10));
  if (overlap) return { ok: false, msg: '检测到同一时间段已有出差申请, 请勿重复申请' };
  // 出差与已通过请假重叠 → 预警
  const lvOverlap = db.prepare(`SELECT id, leave_type FROM t_lv_forms WHERE applicant_id=? AND status='审批通过'
    AND NOT (end_date < ? OR start_date > ?)`).get(u.id, String(form.start_date).slice(0, 10), String(form.end_date).slice(0, 10));
  if (lvOverlap) warnings.push(`出差期间与已批准的${lvOverlap.leave_type}重叠, 请核实行程`);
  if (days > 10) warnings.push(`单次出差超过10天(${days}天), 属长期出差, 请审批人重点核实任务安排`);
  return { ok: true, trip_type, check: { warnings, checked_at: now() } };
}

/* ===== 通用审批流转 ===== */
function attApprove(res, req, table, id, afterDone) {
  const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!item) return { code: 404, msg: '申请单不存在' };
  if (!['待审批', '审批中'].includes(item.status)) return { code: 400, msg: '该申请单当前状态不可审批' };
  const flow = safeParse(item.flow, []);
  const idx = flow.findIndex(f => !f.done);
  if (idx === -1) return { code: 400, msg: '审批流程已完成' };
  const u = req.user;
  if (!matchAttRole(u, flow[idx].role, item.dept)) {
    return { code: 403, msg: `当前节点为「${flow[idx].step}」, 您无权审批此节点(禁止越级审批)` };
  }
  flow[idx].done = true;
  flow[idx].user = u.name;
  flow[idx].time = now();
  flow[idx].remark = String(req.body.remark || '').trim();
  const allDone = flow.every(f => f.done);
  db.prepare(`UPDATE ${table} SET flow=?, status=?, updated_at=? WHERE id=?`)
    .run(JSON.stringify(flow), allDone ? '审批通过' : '审批中', now(), id);
  if (allDone && typeof afterDone === 'function') {
    try { afterDone(item); } catch (e) { console.error('attApprove afterDone fail', e.message); }
  }
  return { code: 200, msg: allDone ? '审批流程已完成, 申请通过' : `「${flow[idx].step}」已通过` };
}

function attReject(res, req, table, id, formType) {
  const remark = String(req.body.remark || '').trim();
  if (!remark) return { code: 400, msg: '驳回必须填写审批意见' };
  const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!item) return { code: 404, msg: '申请单不存在' };
  if (!['待审批', '审批中'].includes(item.status)) return { code: 400, msg: '该申请单当前状态不可驳回' };
  const flow = safeParse(item.flow, []);
  const idx = flow.findIndex(f => !f.done);
  if (idx === -1) return { code: 400, msg: '审批流程已完成' };
  const u = req.user;
  if (!matchAttRole(u, flow[idx].role, item.dept)) {
    return { code: 403, msg: `当前节点为「${flow[idx].step}」, 您无权驳回此节点(禁止越级审批)` };
  }
  flow[idx].done = true;
  flow[idx].rejected = true;
  flow[idx].user = u.name;
  flow[idx].time = now();
  flow[idx].remark = remark;
  db.prepare(`UPDATE ${table} SET flow=?, status=?, updated_at=? WHERE id=?`)
    .run(JSON.stringify(flow), '已驳回', now(), id);
  // 驳回单据同样纳入归档范围 (PRD 6.2)
  const fresh = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  archiveAttForm(formType, fresh, '驳回归档');
  return { code: 200, msg: '已驳回并转入行政归档台账' };
}

/* ===== 销假/销差闭环 ===== */
function settleAttForm(formType, item, body, by) {
  const actual_days = Number(body.actual_days);
  if (!(actual_days > 0)) return { code: 400, msg: '实际天数必须大于0' };
  const diff = Math.round((actual_days - Number(item.days)) * 2) / 2;
  if (formType === 'leave') {
    db.prepare(`UPDATE t_lv_forms SET status='已销假', actual_days=?, settle_note=?, settle_at=?, settle_by=?, updated_at=? WHERE id=?`)
      .run(actual_days, String(body.settle_note || ''), now(), by.name, now(), item.id);
    // 额度按实际休假天数扣减
    addQuotaUsed(item.applicant_id, item.leave_type, item.settle_at || now(), actual_days);
  } else {
    db.prepare(`UPDATE t_tr_forms SET status='已销差', actual_days=?, summary=?, feedback=?, settle_at=?, settle_by=?, updated_at=? WHERE id=?`)
      .run(actual_days, String(body.summary || ''), String(body.feedback || ''), now(), by.name, now(), item.id);
  }
  const fresh = db.prepare(`SELECT * FROM ${formType === 'leave' ? 't_lv_forms' : 't_tr_forms'} WHERE id=?`).get(item.id);
  archiveAttForm(formType, fresh, '闭环归档');
  return { code: 200, msg: '销' + (formType === 'leave' ? '假' : '差') + '完成, 流程闭环并转入行政归档', diff };
}

/* ===== 行政部统一归档 (PRD 6.x) ===== */
function archiveAttForm(formType, form, reason) {
  const ex = db.prepare(`SELECT id FROM t_att_archive WHERE form_type=? AND form_id=?`).get(formType, form.id);
  if (ex) return false; // 幂等
  db.prepare(`INSERT INTO t_att_archive (form_type, form_id, form_no, applicant, dept, snapshot, status, remark, created_at)
    VALUES (?,?,?,?,?,?, '待归档', ?, ?)`)
    .run(formType, form.id, form.id, form.applicant, form.dept,
      JSON.stringify({ reason: reason || '', status: form.status, days: form.days, actual_days: form.actual_days || 0,
        flow: safeParse(form.flow, []), ai_check: safeParse(form.ai_check, {}) }),
      reason || '', now());
  return true;
}

/* ===== 数据查看范围隔离 (PRD 7.2) ===== */
function listScopeAtt(u) {
  if (u.dept === '行政部') return 'all';            // 行政归档管理员: 全公司
  if (['总经理', '副总', '超级管理员'].includes(u.role)) return 'all'; // 高管: 全公司汇总
  if (['部门经理', '销售总监', '区域经理'].includes(u.role)) return 'dept'; // 部门负责人: 本部门
  return 'self';                                     // 普通员工: 仅本人
}

/* ===== 预警扫描 (实时计算) ===== */
function scanAttAlerts() {
  const alerts = [];
  // 超时审批: 待审批/审批中超过24小时
  db.prepare(`SELECT id, applicant, dept, created_at FROM t_lv_forms WHERE status IN ('待审批','审批中')
    AND created_at <= datetime('now','localtime','-24 hour')`).all().forEach(x =>
    alerts.push({ form_type: 'leave', form_id: x.id, alert_type: '超时审批', level: '中',
      msg: `${x.applicant}的请假单${x.id}超24小时未完成审批, 请处理` }));
  db.prepare(`SELECT id, applicant, dept, created_at FROM t_tr_forms WHERE status IN ('待审批','审批中')
    AND created_at <= datetime('now','localtime','-24 hour')`).all().forEach(x =>
    alerts.push({ form_type: 'trip', form_id: x.id, alert_type: '超时审批', level: '中',
      msg: `${x.applicant}的出差单${x.id}超24小时未完成审批, 请处理` }));
  // 超期未销假: 审批通过且假期结束超过1天仍未销假
  db.prepare(`SELECT id, applicant, end_date FROM t_lv_forms WHERE status='审批通过'
    AND date(end_date) <= date('now','localtime','-2 day')`).all().forEach(x =>
    alerts.push({ form_type: 'leave', form_id: x.id, alert_type: '超期未销假', level: '高',
      msg: `${x.applicant}的请假单${x.id}假期已于${x.end_date}结束, 超期未销假, 行政部可介入核实登记` }));
  // 超期未销差: 审批通过且出差结束超过1个工作日仍未销差
  db.prepare(`SELECT id, applicant, end_date FROM t_tr_forms WHERE status='审批通过'
    AND date(end_date) <= date('now','localtime','-2 day')`).all().forEach(x =>
    alerts.push({ form_type: 'trip', form_id: x.id, alert_type: '超期未销差', level: '高',
      msg: `${x.applicant}的出差单${x.id}行程已于${x.end_date}结束, 超期未销差, 行政部台账已标记待处理` }));
  // 销假差异: 已销假但实际天数≠申请天数
  db.prepare(`SELECT id, applicant, days, actual_days FROM t_lv_forms WHERE status='已销假' AND actual_days <> days`).all().forEach(x =>
    alerts.push({ form_type: 'leave', form_id: x.id, alert_type: '销假差异', level: '中',
      msg: `${x.applicant}的请假单${x.id}申请${x.days}天/实际${x.actual_days}天, 存在差异已标注` }));
  // 待归档积压
  const pend = db.prepare(`SELECT COUNT(*) n FROM t_att_archive WHERE status='待归档'`).get().n;
  if (pend > 0) alerts.push({ form_type: 'all', form_id: '', alert_type: '归档待处理', level: '低',
    msg: `行政归档台账有${pend}条单据待归档确认, 请行政部及时整理` });
  return alerts;
}

/* ===== 月份规范化 ===== */
// now()生成非补零日期(如2026-8-16), SQLite datetime()生成补零(2026-08-16)
// mon(col) 返回统一为YYYY-MM的SQL表达式; normMonth() 为JS侧规范化
function mon(col) {
  return `substr(${col},1,4)||'-'||printf('%02d',cast(substr(${col},6,2) as integer))`;
}
function normMonth(m) {
  const mt = String(m || '').match(/^(\d{4})-(\d{1,2})/);
  return mt ? mt[1] + '-' + String(mt[2]).padStart(2, '0') : String(m || '');
}

module.exports = {
  LEAVE_TYPES, LEGAL_TYPES, LEADER_ROLES, DEFAULT_QUOTA,
  mon, normMonth,
  isLeader, resolveRole, matchAttRole, buildAttFlow,
  calcLeaveDays, getQuotaLeft, aiCheckLeave, classifyTrip, aiCheckTrip,
  attApprove, attReject, settleAttForm, archiveAttForm, listScopeAtt, scanAttAlerts
};
