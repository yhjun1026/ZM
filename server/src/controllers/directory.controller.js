/**
 * 内部通讯录控制器（迁移自参考项目 routes/hr.js 的 /directory 段，第64轮 + 第65轮编制）
 *
 * 对齐参考项目业务逻辑：
 *  - 全员只读：除行政人事部外，其他部门只能【查看】员工清单（不做任何操作）—— 以通讯录呈现
 *  - 展示字段：工号、姓名、部门、部门职位、联系方式、邮箱、工龄、上级、工作范围
 *  - 仅行政人事部（ADM 负责人 / HR2 人事专员）可维护通讯录字段（第65轮 PUT /directory/:id）
 *  - 编制范围限定：仅在职员工可维护；未提交任何变更则 400；变更逐项记录并落审计
 *
 * 与参考项目的差异（受当前项目库表约束）：
 *  1) 009 迁移的 employees 无 gender / work_scope 列，故「性别」「主要工作范围和权限」不展示，
 *     以 部门职责（org_units.func）作为「工作范围」来源；
 *  2) 009 迁移的 employees 无分机（extension）列，接口保留 extension 字段返回空串，前端展示「—」；
 *  3) 参考项目角色为 ADM/HR2，当前项目 users/employees.role 为中文角色名，
 *     故可编辑角色取 行政人事部负责人 / 人事专员（对应 ADM / HR2）+ 超级管理员。
 *
 * 数据表：employees / org_units（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const auditLog = require('../utils/audit');

/** 通讯录可编辑角色（对齐参考 DIRECTORY_EDIT_ROLES = ['ADM','HR2']） */
const DIRECTORY_EDIT_ROLES = ['行政人事部负责人', '人事专员', '超级管理员'];
/** 可编制字段白名单（防注入：列名只能来自白名单） */
const EDIT_FIELDS = ['title', 'phone', 'email', 'wechat', 'degree', 'address', 'region'];
const FIELD_LABEL = {
  title: '部门职位', phone: '联系方式', email: '邮箱', wechat: '微信号',
  degree: '学历', address: '住址', region: '大区',
};

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

/** 当前登录用户对应的 employee 记录 */
function empOf(req) {
  try {
    const u = db.prepare('SELECT emp_id, name FROM users WHERE id = ?').get(req.userId);
    if (!u) return null;
    return db.prepare('SELECT * FROM employees WHERE emp_no = ? OR name = ?').get(u.emp_id || '', u.name) || null;
  } catch (e) {
    return null;
  }
}
/** 可编辑判定：角色命中，或所关联员工角色命中（兼容两套角色命名） */
const canEdit = (req) => {
  const role = req.user && req.user.role;
  if (DIRECTORY_EDIT_ROLES.includes(role)) return true;
  const e = empOf(req);
  return !!e && DIRECTORY_EDIT_ROLES.includes(e.role);
};

/** 工龄（年，1 位小数，对齐参考 hr.js 计算口径） */
function seniority(hireDate) {
  if (!hireDate) return null;
  const days = (Date.now() - new Date(hireDate + 'T00:00:00').getTime()) / 864e5;
  return days < 0 ? 0 : Math.floor((days / 365.25) * 10) / 10;
}

/* ==================== 1. 元数据 / 统计 ==================== */

/** 部门列表（供筛选下拉）+ 当前用户是否可编辑 */
async function meta(req, res) {
  const depts = db.prepare("SELECT id,name,type,func FROM org_units WHERE status='启用' ORDER BY id").all();
  return res.json(ok({
    departments: depts,
    edit_fields: EDIT_FIELDS,
    field_labels: FIELD_LABEL,
    can_edit: canEdit(req),
  }));
}

/** 统计：在职总人数 / 部门数 / 各部门人数 */
async function stats(req, res) {
  const total = db.prepare("SELECT COUNT(*) c FROM employees WHERE status='在职'").get().c;
  const byDept = db.prepare(`SELECT o.id, o.name dept_name, COUNT(e.id) count
    FROM org_units o LEFT JOIN employees e ON e.org_id = o.id AND e.status = '在职'
    GROUP BY o.id ORDER BY count DESC, o.id`).all();
  return res.json(ok({
    total,
    dept_count: byDept.filter((d) => d.count > 0).length,
    by_dept: byDept,
  }));
}

/* ==================== 2. 通讯录列表 ==================== */

/** 全员通讯录：默认按部门+工号排序；支持部门与关键字（姓名/工号/手机/邮箱/岗位）检索 */
async function list(req, res) {
  const { dept_id, keyword } = req.query;
  let sql = `SELECT e.id, e.emp_no, e.name, e.title, e.role, e.phone, e.email, e.wechat,
      e.region, e.hire_date, e.degree, e.address, e.org_id,
      (SELECT name FROM org_units WHERE id = e.org_id) dept_name,
      (SELECT func FROM org_units o WHERE o.id = e.org_id) dept_func,
      (SELECT name FROM employees WHERE id = e.report1_id) report1_name
    FROM employees e WHERE e.status = '在职'`;
  const p = [];
  if (dept_id) { sql += ' AND e.org_id = ?'; p.push(dept_id); }
  if (keyword) {
    sql += ' AND (e.name LIKE ? OR e.emp_no LIKE ? OR e.phone LIKE ? OR e.email LIKE ? OR e.title LIKE ?)';
    p.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  sql += ' ORDER BY e.org_id, e.id';
  const rows = db.prepare(sql).all(...p);
  return res.json(ok(rows.map((e) => ({
    id: e.id,
    emp_no: e.emp_no,
    name: e.name,
    dept_id: e.org_id,
    dept_name: e.dept_name || '总部',
    title: e.title || '—',
    level: e.role || '—',
    phone: e.phone || '—',
    email: e.email || '—',
    wechat: e.wechat || '—',
    // 009 迁移的 employees 无分机列，保留字段返回空串（前端展示「—」）
    extension: '',
    work_scope: e.dept_func || '—',
    region: e.region || '—',
    hire_date: e.hire_date || '',
    seniority: seniority(e.hire_date),
    report1_name: e.report1_name || '—',
    degree: e.degree || '',
    address: e.address || '',
  }))));
}

/* ==================== 3. 通讯录编制（PUT，角色校验） ==================== */

/** 编制通讯录：仅行政人事部（ADM/HR2）可维护；仅在职员工；变更逐项留痕 */
async function update(req, res) {
  if (!canEdit(req)) return res.json(forbidden('内部通讯录编制仅行政人事部（负责人/人事专员）可操作，其他部门只读'));
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.json(notfound('员工不存在'));
  if (emp.status !== '在职') return res.json(bad('仅在职员工可维护通讯录信息'));
  const b = req.body || {};
  const sets = [];
  const vals = [];
  const chg = [];
  EDIT_FIELDS.forEach((k) => {
    if (b[k] === undefined) return;
    const nv = String(b[k] || '').trim();
    const ov = String(emp[k] || '').trim();
    if (nv === ov) return;
    sets.push(`${k} = ?`);
    vals.push(nv);
    chg.push(`${FIELD_LABEL[k] || k}：${ov || '空'} → ${nv || '空'}`);
  });
  if (!sets.length) return res.json(bad('未提交任何变更'));
  vals.push(emp.id);
  db.prepare(`UPDATE employees SET ${sets.join(',')} WHERE id = ?`).run(...vals);
  auditLog('DIRECTORY_UPDATE', req.userId, `员工#${emp.id}`,
    `编制内部通讯录 ${emp.name}(${emp.emp_no}) ${chg.join('；')}`);
  return res.json(ok({ changed: chg.length, detail: chg.join('；') }, `已更新 ${chg.length} 项`));
}

module.exports = { meta, stats, list, update, DIRECTORY_EDIT_ROLES, EDIT_FIELDS, FIELD_LABEL };
