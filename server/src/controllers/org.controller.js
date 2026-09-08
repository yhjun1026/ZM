/**
 * 组织架构控制器（迁移自参考项目 routes/auth.js 的 /org/* 段 + routes/hr.js 的 org-profile 段）
 *
 * 对齐参考项目业务逻辑：
 *  - 组织层级：HQ 总部 / PRODUCT 产品线 / BRANCH 分公司 / DEPT 部门（org_units.type，parent_id 自关联）
 *  - 部门设置：编码唯一、负责人（manager_emp_id，须在职）、部门职责 func、编制 headcount、在编人数实时统计
 *  - 单位信息 org_profile：全员可读；行政人事负责人提交变更 → 写 org_profile_history（审批中）
 *    → 副总/总经理审批通过后才覆盖生效行（参考项目走「经营公司资料变更审批」）
 *  - 组织树 / 员工列表：员工按 org_id 归属部门，双线汇报（report1 实线 / report2 虚线）
 *
 * 与参考项目的差异（受当前项目角色体系约束，已在注释中标注）：
 *  1) 参考项目用角色码（ADM/GM/VP…）鉴权，当前项目 users.role 为中文、部门在 users.dept，
 *     故按 role + dept 判定行政人事线与公司领导（见 isHr / isGM）。
 *  2) 参考项目部门新增/编辑/撤销一律走「组织变更审批」（routes/orgchange.js），当前 /orgchange 模块
 *     提供两级审批版本；本模块的部门 CRUD 为行政人事线日常维护入口（落审计、超编/在编校验一致保留）。
 *
 * 数据表：org_units / employees / org_profile / org_profile_history / approvals / approval_steps（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量（对齐参考项目） ==================== */
/** 组织层级（org_units.type） */
const UNIT_TYPES = ['HQ', 'PRODUCT', 'BRANCH', 'DEPT'];
const UNIT_TYPE_NAME = { HQ: '总部', PRODUCT: '产品线', BRANCH: '分公司', DEPT: '部门' };
/** 单位状态 */
const UNIT_STATUS = ['启用', '停用'];
/** org_profile 可维护字段（对齐参考项目 hr.js /org-profile 的 F 列表） */
const PROFILE_FIELDS = [
  'unit_name', 'short_name', 'credit_code', 'legal_person', 'reg_capital', 'established_date',
  'company_type', 'reg_authority', 'reg_address', 'office_address', 'industry', 'biz_scope',
  'employee_count', 'contact_person', 'contact_phone', 'email', 'website', 'bank_name',
  'bank_account', 'oa_start', 'company_intro', 'remark',
];

/** 公司领导（总经理终审） */
const GM_ROLES = ['总经理', '超级管理员'];
/** 副总及以上（终审链） */
const VP_ROLES = ['副总', '总经理', '超级管理员'];
/** 行政人事线部门（参考项目 ADM/HR2） */
const HR_DEPTS = ['行政人事部', '人事行政部', '行政部', '人力资源部'];

const isGM = (u) => !!u && GM_ROLES.includes(u.role);
const isVP = (u) => !!u && VP_ROLES.includes(u.role);
/** 行政人事线 / 管理层可见人事组织数据（参考项目 HR_VIEW = GM/VP/ADM/HR2） */
const isHr = (u) => !!u && (GM_ROLES.includes(u.role) || VP_ROLES.includes(u.role)
  || HR_DEPTS.includes(u.dept) || u.role === '超级管理员');

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

/** users.id（'28' / 'ZM001'）→ employees 行 */
function empOf(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (/^\d+$/.test(s)) {
    const e = db.prepare('SELECT * FROM employees WHERE id=?').get(Number(s));
    if (e) return e;
  }
  return db.prepare('SELECT * FROM employees WHERE emp_no=? OR emp_no=?').get(s, 'ZM' + s) || null;
}

/** 生成组织变更审批单（当前项目 approvals / approval_steps） */
function createApproval(user, type, title, refId, chain) {
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  // 单号带 3 位随机后缀（对齐参考项目 lib.createApproval），避免删行后序号回退导致撞号
  const approvalNo = 'AP' + new Date().toISOString().slice(0, 10).replace(/-/g, '')
    + String(n).padStart(4, '0') + Math.floor(Math.random() * 900 + 100);
  const info = db.prepare(`INSERT INTO approvals
    (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, type, title, refId || 0, 0,
      Number(user.id) || 0, user.name || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/* ==================== 1. 枚举 ==================== */
async function meta(req, res) {
  return res.json(ok({
    unit_types: UNIT_TYPES.map((t) => ({ value: t, label: UNIT_TYPE_NAME[t] })),
    unit_status: UNIT_STATUS,
    profile_fields: PROFILE_FIELDS,
    roles: db.prepare('SELECT DISTINCT role FROM employees ORDER BY role').all().map((x) => x.role),
  }));
}

/* ==================== 2. 组织统计 ==================== */
async function stats(req, res) {
  const units = db.prepare("SELECT COUNT(*) c FROM org_units WHERE status='启用'").get().c;
  const depts = db.prepare("SELECT COUNT(*) c FROM org_units WHERE type='DEPT' AND status='启用'").get().c;
  const staff = db.prepare("SELECT COUNT(*) c FROM employees WHERE status='在职'").get().c;
  const headcount = db.prepare("SELECT COALESCE(SUM(headcount),0) s FROM org_units WHERE type='DEPT' AND status='启用'").get().s;
  // 超编部门：在编人数 > 编制人数
  const over = db.prepare(`SELECT o.id,o.name,o.headcount,
      (SELECT COUNT(*) FROM employees e WHERE e.org_id=o.id AND e.status='在职') staff_count
    FROM org_units o WHERE o.type='DEPT' AND o.status='启用' AND o.headcount>0
      AND (SELECT COUNT(*) FROM employees e WHERE e.org_id=o.id AND e.status='在职') > o.headcount`).all();
  const noManager = db.prepare("SELECT COUNT(*) c FROM org_units WHERE type='DEPT' AND status='启用' AND (manager_emp_id IS NULL OR manager_emp_id=0)").get().c;
  return res.json(ok({
    units, depts, staff,
    headcount: Number(headcount) || 0,
    fill_rate: headcount > 0 ? Math.round((staff / headcount) * 100) : 0,
    over_count: over.length,
    over_list: over,
    no_manager: noManager,
  }));
}

/* ==================== 3. 组织树（含部门职责/编制/负责人/在编人数 + 部门下在职员工） ==================== */
async function tree(req, res) {
  const units = db.prepare(`SELECT o.*, (SELECT name FROM employees e WHERE e.id=o.manager_emp_id) manager
    FROM org_units o ORDER BY o.type, o.id`).all();
  const emps = db.prepare(`SELECT e.id, e.emp_no, e.name, e.title, e.role, e.org_id, e.branch_id, e.product_line,
      e1.name report1, e2.name report2, e.region, e.status, e.hire_date, e.phone, e.email
    FROM employees e
    LEFT JOIN employees e1 ON e.report1_id=e1.id LEFT JOIN employees e2 ON e.report2_id=e2.id
    WHERE e.status='在职' ORDER BY e.id`).all();

  const countMap = {};
  db.prepare("SELECT org_id, COUNT(*) n FROM employees WHERE status='在职' AND org_id IS NOT NULL GROUP BY org_id")
    .all().forEach((x) => { countMap[x.org_id] = x.n; });

  const nodes = units.map((u) => ({
    ...u,
    type_name: UNIT_TYPE_NAME[u.type] || u.type,
    staff_count: countMap[u.id] || 0,
    gap: (Number(u.headcount) || 0) - (countMap[u.id] || 0), // 编制缺口：正=缺编，负=超编
    employees: emps.filter((e) => e.org_id === u.id),
    children: [],
  }));
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const roots = [];
  nodes.forEach((n) => {
    if (n.parent_id && byId[n.parent_id]) byId[n.parent_id].children.push(n);
    else roots.push(n);
  });
  return res.json(ok({ units: nodes.map(({ children, ...rest }) => rest), tree: roots, emps }));
}

/* ==================== 4. 部门设置（CRUD） ==================== */
async function depts(req, res) {
  const { type, status, keyword } = req.query;
  let sql = `SELECT o.id, o.code, o.name, o.type, o.func, o.headcount, o.region, o.status, o.parent_id,
      (SELECT name FROM org_units p WHERE p.id=o.parent_id) parent_name,
      (SELECT name FROM employees e WHERE e.id=o.manager_emp_id) manager,
      o.manager_emp_id,
      (SELECT COUNT(*) FROM employees e WHERE e.org_id=o.id AND e.status='在职') staff_count
    FROM org_units o WHERE 1=1`;
  const p = [];
  if (type) { sql += ' AND o.type=?'; p.push(type); }
  if (status) { sql += ' AND o.status=?'; p.push(status); }
  if (keyword) { sql += ' AND (o.name LIKE ? OR o.code LIKE ? OR o.func LIKE ?)'; p.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY o.type, o.id';
  const rows = db.prepare(sql).all(...p).map((x) => ({ ...x, type_name: UNIT_TYPE_NAME[x.type] || x.type }));
  return res.json(ok(rows));
}

async function createDept(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('组织架构与部门设置由行政人事部负责人维护，须报副总、总经理审批'));
  const { code, name, type, parent_id, region, manager_emp_id, func, headcount } = req.body || {};
  if (!code || !name) return res.json(bad('部门编码与名称必填'));
  if (type && !UNIT_TYPES.includes(type)) return res.json(bad(`层级须为：${UNIT_TYPES.join('/')}`));
  if (db.prepare('SELECT id FROM org_units WHERE code=?').get(String(code).trim())) return res.json(bad(`编码 ${code} 已存在`));
  if (parent_id && !db.prepare('SELECT id FROM org_units WHERE id=?').get(parent_id)) return res.json(bad('上级单位不存在'));
  if (manager_emp_id) {
    const m = db.prepare("SELECT id,name FROM employees WHERE id=? AND status='在职'").get(manager_emp_id);
    if (!m) return res.json(bad('负责人不存在或已停用'));
  }
  const info = db.prepare(`INSERT INTO org_units (code,name,type,parent_id,region,manager_emp_id,func,headcount,status)
    VALUES (?,?,?,?,?,?,?,?,'启用')`)
    .run(String(code).trim(), String(name).trim(), type || 'DEPT', parent_id || null, region || null,
      manager_emp_id || null, func || '', Number(headcount) || 0);
  audit('ORG_DEPT_CREATE', req.userId, `部门${info.lastInsertRowid}`, `新增${UNIT_TYPE_NAME[type || 'DEPT']} ${name}（${code}），编制 ${Number(headcount) || 0} 人`);
  return res.json(ok({ id: info.lastInsertRowid }, '部门已创建'));
}

async function updateDept(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('组织架构与部门设置由行政人事部负责人维护，须报副总、总经理审批'));
  const u = db.prepare('SELECT * FROM org_units WHERE id=?').get(req.params.id);
  if (!u) return res.json(notfound('部门/单位不存在'));
  const b = req.body || {};
  if (b.code && b.code !== u.code && db.prepare('SELECT id FROM org_units WHERE code=? AND id<>?').get(b.code, u.id))
    return res.json(bad(`编码 ${b.code} 已存在`));
  if (b.manager_emp_id) {
    const m = db.prepare("SELECT id FROM employees WHERE id=? AND status='在职'").get(b.manager_emp_id);
    if (!m) return res.json(bad('负责人不存在或已停用'));
  }
  if (b.status && !UNIT_STATUS.includes(b.status)) return res.json(bad('状态须为 启用/停用'));
  db.prepare(`UPDATE org_units SET name=?, code=?, type=?, func=?, headcount=?, manager_emp_id=?, region=?, status=? WHERE id=?`)
    .run(b.name || u.name, b.code || u.code, b.type || u.type,
      b.func !== undefined ? b.func : u.func,
      b.headcount !== undefined ? (Number(b.headcount) || 0) : u.headcount,
      b.manager_emp_id !== undefined ? b.manager_emp_id : u.manager_emp_id,
      b.region !== undefined ? b.region : u.region,
      b.status || u.status, u.id);
  audit('ORG_DEPT_UPDATE', req.userId, `部门${u.id}`, `调整 ${u.name}（名称/职责/编制/负责人/区域）`);
  return res.json(ok(null, '部门信息已更新'));
}

/** 停用部门：有在职员工时拒绝（对齐参考项目：撤销部门前须先完成人员调整） */
async function disableDept(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('组织架构与部门设置由行政人事部负责人维护，须报副总、总经理审批'));
  const u = db.prepare('SELECT * FROM org_units WHERE id=?').get(req.params.id);
  if (!u) return res.json(notfound('部门/单位不存在'));
  if (u.status === '停用') return res.json(bad('该部门已停用', 409));
  const n = db.prepare("SELECT COUNT(*) c FROM employees WHERE org_id=? AND status='在职'").get(u.id).c;
  if (n > 0) return res.json(bad(`该部门仍有 ${n} 名在职员工，请先通过「组织变更 → 人员调整」完成分流后再停用`, 409));
  db.prepare("UPDATE org_units SET status='停用' WHERE id=?").run(u.id);
  audit('ORG_DEPT_DISABLE', req.userId, `部门${u.id}`, `停用部门 ${u.name}`);
  return res.json(ok(null, '部门已停用'));
}

/* ==================== 5. 员工列表（按部门/关键字） ==================== */
async function employees(req, res) {
  const { org_id, keyword, status } = req.query;
  let sql = `SELECT e.id, e.emp_no, e.name, e.title, e.role, e.region, e.product_line, e.status, e.hire_date, e.phone, e.email,
      (SELECT name FROM org_units WHERE id=e.branch_id) branch_name,
      (SELECT name FROM org_units WHERE id=e.org_id) dept_name,
      e1.name report1, e2.name report2
    FROM employees e
    LEFT JOIN employees e1 ON e.report1_id=e1.id LEFT JOIN employees e2 ON e.report2_id=e2.id
    WHERE 1=1`;
  const p = [];
  if (org_id) { sql += ' AND e.org_id=?'; p.push(org_id); }
  if (status) { sql += ' AND e.status=?'; p.push(status); }
  else { sql += " AND e.status='在职'"; }
  if (req.user && req.user.role === '区域经理') { sql += ' AND (e.region=? OR e.role IN (?,?))'; p.push(req.user.dept || '', '销售总监', '总经理'); }
  if (keyword) { sql += ' AND (e.name LIKE ? OR e.emp_no LIKE ? OR e.title LIKE ?)'; p.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY e.id';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 按部门统计人数（在职/编制/缺口） */
async function deptStats(req, res) {
  const rows = db.prepare(`SELECT o.id, o.name, o.type, o.headcount, o.manager_emp_id,
      (SELECT name FROM employees e WHERE e.id=o.manager_emp_id) manager,
      (SELECT COUNT(*) FROM employees e WHERE e.org_id=o.id AND e.status='在职') staff_count,
      (SELECT COUNT(*) FROM employees e WHERE e.org_id=o.id AND e.status<>'在职') inactive_count
    FROM org_units o WHERE o.status='启用' ORDER BY o.type, o.id`).all();
  return res.json(ok(rows.map((x) => ({ ...x, gap: (Number(x.headcount) || 0) - x.staff_count }))));
}

/* ==================== 6. 单位信息 org_profile ==================== */
async function profile(req, res) {
  let active = db.prepare('SELECT * FROM org_profile WHERE id=1').get() || {};
  let pending = null;
  if (active.history_id) {
    const h = db.prepare('SELECT * FROM org_profile_history WHERE id=?').get(active.history_id);
    if (h && h.status === '审批中') pending = h;
  }
  return res.json(ok({ ...active, pending: pending || undefined, can_edit: isHr(req.user) }));
}

/** 提交单位信息变更：写历史（审批中）→ 副总/总经理审批通过后覆盖生效行 */
async function updateProfile(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('经营公司资料仅行政人事部负责人可维护'));
  const b = req.body || {};
  const old = db.prepare('SELECT * FROM org_profile WHERE id=1').get() || {};
  if (old.history_id) {
    const ex = db.prepare('SELECT status FROM org_profile_history WHERE id=?').get(old.history_id);
    if (ex && ex.status === '审批中') return res.json(bad('当前已有一笔经营公司资料变更正在审批中，请等待审批完成后再提交', 409));
  }
  const v = {};
  PROFILE_FIELDS.forEach((k) => { v[k] = b[k] !== undefined ? String(b[k]).trim() : (old[k] || null); });
  if (!v.unit_name) return res.json(bad('经营公司名称（单位全称）必填'));

  const cols = PROFILE_FIELDS.join(',');
  const ph = PROFILE_FIELDS.map(() => '?').join(',');
  const info = db.prepare(`INSERT INTO org_profile_history(${cols},status,submitted_by,submitted_by_name,created_at)
    VALUES (${ph},'审批中',?,?,?)`)
    .run(...PROFILE_FIELDS.map((k) => v[k]), empId(req) || null, req.user.name || '', localNow());
  const hid = info.lastInsertRowid;

  // 创建审批单：行政人事部初审（本人为行政人事线时跳过，防自审）→ 副总 → 总经理终审
  const chain = ['行政人事部', '副总', '总经理'];
  if (isHr(req.user)) chain.shift();
  const ap = createApproval(req.user, '经营公司资料变更审批', `经营公司资料变更：${v.unit_name}`, hid, chain);
  db.prepare('UPDATE org_profile_history SET approval_id=? WHERE id=?').run(ap.id, hid);
  if (old.id) db.prepare("UPDATE org_profile SET history_id=?, status='审批中' WHERE id=1").run(hid);
  else db.prepare('INSERT INTO org_profile (id, history_id, status) VALUES (1,?,?)').run(hid, '审批中');
  const chg = PROFILE_FIELDS.filter((k) => String(old[k] || '') !== String(v[k] || ''));
  audit('ORG_PROFILE_SUBMIT', req.userId, `单位资料${hid}`, `提交经营公司资料变更（审批单 ${ap.approval_no}），变更 ${chg.length} 个字段：${chg.join('、')}`);
  return res.json(ok({ approval_id: ap.id, approval_no: ap.approval_no, history_id: hid, changed: chg, pending: v },
    '已提交审批，副总→总经理审批通过后生效'));
}

/** 变更历史：行政人事线/管理层看全部，其他员工仅看已通过 */
async function profileHistory(req, res) {
  const rows = isHr(req.user)
    ? db.prepare('SELECT * FROM org_profile_history ORDER BY id DESC').all()
    : db.prepare("SELECT * FROM org_profile_history WHERE status='已通过' ORDER BY id DESC").all();
  return res.json(ok(rows));
}

/** 单位资料变更审批（副总 → 总经理终审；通过则覆盖生效行） */
async function approveProfile(req, res) {
  if (!isVP(req.user)) return res.json(forbidden('经营公司资料变更由副总/总经理审批'));
  const h = db.prepare('SELECT * FROM org_profile_history WHERE id=?').get(req.params.id);
  if (!h) return res.json(notfound('变更记录不存在'));
  if (h.status !== '审批中') return res.json(bad(`该变更已${h.status}，无需重复审批`, 409));
  const { result, comment } = req.body || {};
  if (!['通过', '驳回'].includes(result)) return res.json(bad('审批结果须为 通过 / 驳回'));

  if (result === '驳回') {
    db.prepare("UPDATE org_profile_history SET status='已驳回' WHERE id=?").run(h.id);
    db.prepare("UPDATE org_profile SET status='已生效', history_id=NULL WHERE id=1").run();
    if (h.approval_id) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(localNow(), h.approval_id);
    audit('ORG_PROFILE_REJECT', req.userId, `单位资料${h.id}`, `经营公司资料变更驳回：${comment || ''}`);
    return res.json(ok(null, '已驳回，行政人事部可修正后重新提交'));
  }

  // 通过：覆盖生效行
  const exists = db.prepare('SELECT id FROM org_profile WHERE id=1').get();
  if (exists) {
    db.prepare(`UPDATE org_profile SET ${PROFILE_FIELDS.map((k) => `${k}=?`).join(',')},
      status='已生效', history_id=?, approval_id=?, updated_by=?, updated_by_name=?, updated_at=? WHERE id=1`)
      .run(...PROFILE_FIELDS.map((k) => h[k]), h.id, h.approval_id || null,
        empId(req) || null, req.user.name || '', localNow());
  } else {
    db.prepare(`INSERT INTO org_profile (id,${PROFILE_FIELDS.join(',')},status,history_id,approval_id,updated_by,updated_by_name,updated_at)
      VALUES (1,${PROFILE_FIELDS.map(() => '?').join(',')},'已生效',?,?,?,?,?)`)
      .run(...PROFILE_FIELDS.map((k) => h[k]), h.id, h.approval_id || null,
        empId(req) || null, req.user.name || '', localNow());
  }
  db.prepare("UPDATE org_profile_history SET status='已通过', approval_id=COALESCE(?,approval_id), effective_at=? WHERE id=?")
    .run(h.approval_id || null, localNow(), h.id);
  if (h.approval_id) {
    db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(localNow(), h.approval_id);
    db.prepare("UPDATE approval_steps SET action='通过', approver_name=?, comment=?, acted_at=? WHERE approval_id=?")
      .run(req.user.name || '', comment || '', localNow(), h.approval_id);
  }
  audit('ORG_PROFILE_APPROVE', req.userId, `单位资料${h.id}`, `经营公司资料变更审批通过，${h.unit_name || ''} 已生效`);
  return res.json(ok(null, '审批通过，单位资料已更新生效'));
}

module.exports = {
  meta, stats, tree, depts, createDept, updateDept, disableDept, employees, deptStats,
  profile, updateProfile, profileHistory, approveProfile,
  UNIT_TYPES, UNIT_TYPE_NAME, isHr, isGM, isVP, empOf, localNow, createApproval,
};
