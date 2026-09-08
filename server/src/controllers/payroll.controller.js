/**
 * 薪酬管理控制器（迁移自参考项目 routes/payroll.js 第43轮 + routes/finpay.js 第46轮「薪酬考核」）
 *
 * 对齐参考项目的核心口径：
 *  - 薪酬组成方案 payroll_scheme：按岗位配置 基本/岗位/绩效基数/提成率/回款目标/社保代扣，财务部可调整并一键应用到在职档案
 *  - 薪酬档案 salary_profiles：按 emp_id 唯一，销售序列 / 职能序列
 *  - 月度核算 payroll_records + payroll_items：
 *      应发 = 基本工资 + 岗位工资 + 绩效基数×绩效系数 + 业绩提成 + 补贴
 *      提成（销售序列）= 当月回款到账(万)×10000×提成率 + 超出目标部分×10000×提成率×超额加成系数
 *      绩效系数 = 最近一次「通过」的员工评价分/100（无则 1.0）
 *      扣款 = 社保代扣 + 请假扣款（事假全扣 / 病假半扣，日薪=(基本+岗位)/21.75）
 *      个税 = 7 级超额累进（起征 5000）；实发 = 应发 − 社保 − 请假扣款 − 个税
 *  - 已发布批次不可重算/不可删除；草稿可覆盖重算
 *  - 工资条：发布后员工本人在 /mine 可查（仅本人）
 *
 * 【财务序列薪酬考核（finpay）落库说明 —— 与参考项目的差异】
 *  参考项目使用 fin_pay_scheme / fin_salary_profiles / fin_pay_records 三张表，当前 009 迁移未建这三张表且禁止建表，
 *  故按「同语义替代」落库：
 *      ① 组成方案 + 个人科目调整 → kv_store（key: finpay.scheme / finpay.profiles）
 *      ② 月度考核评分（5 项指标 / 综合分 / 评级 / 系数）→ kpi_records（emp_id + period 唯一，remark 存明细 JSON）
 *      ③ 月度核算金额快照（应发/社保/公积金/个税/实发/状态）→ salary_records（month = 期间）
 *  计算口径（应发 = 基本+岗位+绩效基数×考核系数+交通补贴+餐补+工龄津贴+职称津贴；
 *  实发 = 应发 − 社保 − 公积金 − 个税；评分档位 S/A/B/C/D）与参考项目 finpay.js 完全一致。
 *
 * 数据表：salary_profiles / payroll_scheme / payroll_records / payroll_items / kpi_records /
 *         salary_records / employee_evaluations / leave_requests / payments / ar_ledgers / kv_store
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); };
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const curYm = () => localNow().slice(0, 7);
const curYear = () => localNow().slice(0, 4);
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

const SEQ_TYPES = ['销售序列', '职能序列'];
const REC_STATUS = ['草稿', '已发布'];
/** 销售序列岗位（参考项目 SALES_SEQ） */
const SALES_ROLES = ['销售总监', '区域经理', '销售专员', '销售员', '大客户经理'];
/** 岗位默认薪酬组成模板（元/月）—— 对齐参考项目 PAY_DEFAULT */
const PAY_DEFAULT = {
  总经理: { seq: '职能序列', b: 20000, p1: 10000, p2: 10000, r: 0, t: 0, s: 1200 },
  副总: { seq: '职能序列', b: 16000, p1: 8000, p2: 8000, r: 0, t: 0, s: 1100 },
  销售总监: { seq: '销售序列', b: 9000, p1: 3000, p2: 4000, r: 0.005, t: 200, s: 800 },
  区域经理: { seq: '销售序列', b: 6000, p1: 2000, p2: 2500, r: 0.01, t: 60, s: 700 },
  销售专员: { seq: '销售序列', b: 3500, p1: 1000, p2: 1500, r: 0.03, t: 20, s: 500 },
  部门经理: { seq: '职能序列', b: 7000, p1: 3000, p2: 3000, r: 0, t: 0, s: 800 },
  法务专员: { seq: '职能序列', b: 7000, p1: 3000, p2: 3000, r: 0, t: 0, s: 800 },
  印章管理员: { seq: '职能序列', b: 5000, p1: 2000, p2: 2000, r: 0, t: 0, s: 600 },
  合同档案管理员: { seq: '职能序列', b: 5000, p1: 2000, p2: 2000, r: 0, t: 0, s: 600 },
  财务负责人: { seq: '职能序列', b: 6500, p1: 2500, p2: 2500, r: 0, t: 0, s: 700 },
  财务专员: { seq: '职能序列', b: 4500, p1: 1500, p2: 1500, r: 0, t: 0, s: 500 },
  超级管理员: { seq: '职能序列', b: 6000, p1: 2500, p2: 2000, r: 0, t: 0, s: 700 },
  普通员工: { seq: '职能序列', b: 3500, p1: 1000, p2: 1500, r: 0, t: 0, s: 500 },
};

/* ==================== 通用 ==================== */
/** users.id（'28' 或 'ZM001'）→ employees 行 */
function empOf(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (/^\d+$/.test(s)) {
    const e = db.prepare('SELECT * FROM employees WHERE id=?').get(Number(s));
    if (e) return e;
  }
  return db.prepare('SELECT * FROM employees WHERE emp_no=? OR emp_no=?').get(s, 'ZM' + s) || null;
}
function deptNameOf(emp) {
  if (!emp || !emp.org_id) return '';
  const o = db.prepare('SELECT name FROM org_units WHERE id=?').get(emp.org_id);
  return o ? o.name : '';
}
/** 薪酬可写（建档/核算/发布/方案调整）：财务部 + 总经理 + 超级管理员（参考项目 requirePerm('payroll',1)） */
function payWrite(u) { return !!u && (u.dept === '财务部' || ['总经理', '超级管理员'].includes(u.role)); }
/** 薪酬可读（全量工资数据）：可写者 + 副总 */
function payRead(u) { return payWrite(u) || (!!u && u.role === '副总'); }

/** 简易个税（月）：起征 5000，7 级超额累进（对齐参考项目） */
function taxOf(gross, social) {
  const taxable = Math.max(0, gross - social - 5000);
  if (taxable <= 0) return 0;
  if (taxable <= 3000) return round2(taxable * 0.03);
  if (taxable <= 12000) return round2(taxable * 0.10 - 210);
  if (taxable <= 25000) return round2(taxable * 0.20 - 1410);
  if (taxable <= 35000) return round2(taxable * 0.25 - 2660);
  if (taxable <= 55000) return round2(taxable * 0.30 - 4410);
  if (taxable <= 80000) return round2(taxable * 0.35 - 7160);
  return round2(taxable * 0.45 - 15160);
}
/** 事假/病假折算天数：事假×1、病假×0.5 */
function leaveDeduction(empId, period) {
  try {
    const [y, m] = period.split('-').map(Number);
    const mStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const mEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay(period)).padStart(2, '0')}`;
    const leaves = db.prepare("SELECT * FROM leave_requests WHERE emp_id=? AND status='通过' AND leave_type IN ('事假','病假')").all(empId);
    let days = 0;
    leaves.forEach((lv) => {
      const s = lv.start_date || ''; const e = lv.end_date || lv.start_date || '';
      if (s > mEnd || e < mStart) return;
      const a = s < mStart ? mStart : s; const b = e > mEnd ? mEnd : e;
      const d = Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
      if (d > 0) days += d * (lv.leave_type === '病假' ? 0.5 : 1);
    });
    return round2(days);
  } catch (e) { return 0; }
}
/** 绩效系数：最近一次「通过」的员工评价 score/100，缺省 1.0 */
function perfCoef(empId) {
  try {
    const ev = db.prepare("SELECT score FROM employee_evaluations WHERE emp_id=? AND status='通过' AND score>0 ORDER BY id DESC LIMIT 1").get(empId);
    if (ev) return round2(Number(ev.score) / 100);
  } catch (e) { /* 表未就绪 */ }
  return 1.0;
}
/** 当月回款到账（万元）—— 与 KPI 提成核算口径一致 */
function monthCollection(empId, period) {
  try {
    return db.prepare(`SELECT COALESCE(SUM(p.amount),0) v FROM payments p
      JOIN ar_ledgers a ON p.ar_id=a.id
      WHERE a.sales_id=? AND substr(p.pay_date,1,7)=?`).get(empId, period).v || 0;
  } catch (e) { return 0; }
}

/* ==================== 薪酬组成方案 ==================== */
function ensureScheme() {
  try {
    if (db.prepare('SELECT COUNT(*) c FROM payroll_scheme').get().c > 0) return;
    const ins = db.prepare(`INSERT INTO payroll_scheme(role,role_name,seq_type,base_salary,post_salary,perf_base,commission_rate,commission_target,social_amount,updated_by_name,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    Object.entries(PAY_DEFAULT).forEach(([role, v]) => {
      ins.run(role, role, v.seq, v.b, v.p1, v.p2, v.r, v.t, v.s, '系统初始化', localNow());
    });
  } catch (e) { /* 表未就绪忽略 */ }
}
function schemeRows() {
  ensureScheme();
  return db.prepare('SELECT * FROM payroll_scheme ORDER BY role').all();
}
function schemeOf(role) {
  try {
    const s = db.prepare('SELECT * FROM payroll_scheme WHERE role=?').get(role);
    if (s) return s;
  } catch (e) { /* 忽略 */ }
  const v = PAY_DEFAULT[role];
  return v
    ? { seq_type: v.seq, base_salary: v.b, post_salary: v.p1, perf_base: v.p2, commission_rate: v.r, commission_target: v.t, social_amount: v.s }
    : { seq_type: '职能序列', base_salary: 0, post_salary: 0, perf_base: 0, commission_rate: 0, commission_target: 0, social_amount: 0 };
}
/** 员工所属序列：销售部或销售岗 → 销售序列 */
function seqOfEmp(e, deptName, tpl) {
  if (SALES_ROLES.includes(e.role)) return '销售序列';
  if (String(deptName || '').includes('销售')) return '销售序列';
  return tpl.seq_type || '职能序列';
}
/** 员工建档模板：普通员工在销售部 → 套用销售专员模板 */
function tplOfEmp(e, deptName) {
  const isSales = SALES_ROLES.includes(e.role) || String(deptName || '').includes('销售');
  const role = e.role === '普通员工' && isSales ? '销售专员' : e.role;
  return schemeOf(role);
}

/* ==================== 选项（前端下拉，避免硬编码） ==================== */
async function options(req, res) {
  const emps = db.prepare(`SELECT e.id, e.emp_no, e.name, e.role,
      (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM employees e WHERE e.status='在职' ORDER BY e.emp_no`).all();
  const depts = [...new Set(emps.map((x) => x.dept_name).filter(Boolean))];
  const periods = db.prepare('SELECT period FROM payroll_records ORDER BY period DESC LIMIT 24').all().map((x) => x.period);
  return res.json(ok({
    employees: emps, depts, periods,
    seq_types: SEQ_TYPES,
    sales_roles: SALES_ROLES,
    record_status: REC_STATUS,
    rules: {
      commission_by: '回款到账金额（万元）',
      overtime_bonus: '超出月度回款目标部分提成×(1+加成系数)',
      perf_coef: '最近一次通过的评价分/100 → 1.0',
      tax: '个税（起征5000，7级超额累进）',
      leave: '事假全扣 / 病假半扣，日薪=(基本+岗位)/21.75',
    },
  }));
}

/* ==================== 统计 ==================== */
async function stats(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看薪酬统计'));
  const year = String(req.query.year || curYear());
  const profiles = db.prepare('SELECT COUNT(*) c FROM salary_profiles').get().c;
  const emps = db.prepare("SELECT COUNT(*) c FROM employees WHERE status='在职'").get().c;
  const latest = db.prepare('SELECT * FROM payroll_records ORDER BY period DESC LIMIT 1').get() || null;
  const months = db.prepare(`SELECT period, status, total_emps emps, total_gross gross, total_net net, total_commission commission, published_at
    FROM payroll_records WHERE substr(period,1,4)=? ORDER BY period`).all(year);
  const byDept = db.prepare(`SELECT pi.dept_name dept, COUNT(*) emps, ROUND(SUM(pi.gross_amount),2) gross,
      ROUND(SUM(pi.net_amount),2) net, ROUND(SUM(pi.commission_amount),2) commission
    FROM payroll_items pi JOIN payroll_records pr ON pi.record_id=pr.id
    WHERE substr(pr.period,1,4)=? GROUP BY pi.dept_name ORDER BY net DESC`).all(year);
  const bySeq = db.prepare(`SELECT pi.seq_type, COUNT(*) emps, ROUND(SUM(pi.gross_amount),2) gross,
      ROUND(SUM(pi.net_amount),2) net, ROUND(SUM(pi.commission_amount),2) commission
    FROM payroll_items pi JOIN payroll_records pr ON pi.record_id=pr.id
    WHERE substr(pr.period,1,4)=? GROUP BY pi.seq_type`).all(year);
  const pub = months.filter((m) => m.status === '已发布');
  const sum = (arr, k) => round2(arr.reduce((s, x) => s + (x[k] || 0), 0));
  return res.json(ok({
    year,
    profiles, employees: emps,
    batches: months.length, published: pub.length,
    latest_period: latest ? latest.period : '',
    latest_emps: latest ? latest.total_emps : 0,
    latest_gross: latest ? latest.total_gross : 0,
    latest_net: latest ? latest.total_net : 0,
    latest_commission: latest ? latest.total_commission : 0,
    months, byDept, bySeq,
    total: { gross: sum(pub, 'gross'), net: sum(pub, 'net'), commission: sum(pub, 'commission') },
  }));
}

/* ==================== 薪酬档案 ==================== */
async function listProfiles(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看薪酬档案'));
  const { q, role, seq_type, dept } = req.query;
  let sql = `SELECT p.*, e.title, e.region, e.product_line,
      (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name,
      (SELECT COUNT(*) n FROM payroll_items pi JOIN payroll_records pr ON pi.record_id=pr.id
        WHERE pi.emp_id=p.emp_id AND pr.status='已发布') pays_count
    FROM salary_profiles p JOIN employees e ON p.emp_id=e.id WHERE 1=1`;
  const p = [];
  if (q) { sql += ' AND (p.emp_name LIKE ? OR p.emp_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  if (role) { sql += ' AND p.role=?'; p.push(role); }
  if (seq_type) { sql += ' AND p.seq_type=?'; p.push(seq_type); }
  if (dept) { sql += ' AND (SELECT name FROM org_units o WHERE o.id=e.org_id)=?'; p.push(dept); }
  sql += ' ORDER BY p.emp_no';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 一键按岗位模板为在职未建档员工初始化档案 */
async function initProfiles(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可维护薪酬档案'));
  ensureScheme();
  const emps = db.prepare(`SELECT e.* FROM employees e LEFT JOIN salary_profiles p ON p.emp_id=e.id
    WHERE e.status='在职' AND p.id IS NULL ORDER BY e.emp_no`).all();
  const ins = db.prepare(`INSERT INTO salary_profiles(emp_id,emp_no,emp_name,role,seq_type,base_salary,post_salary,perf_base,commission_rate,commission_target,commission_bonus,allowance,social_amount,effective_month,created_by,created_by_name,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let made = 0;
  for (const e of emps) {
    const dept = deptNameOf(e);
    const tpl = tplOfEmp(e, dept);
    const seq = seqOfEmp(e, dept, tpl);
    ins.run(e.id, e.emp_no, e.name, e.role, seq, tpl.base_salary, tpl.post_salary, tpl.perf_base,
      seq === '销售序列' ? tpl.commission_rate : 0,
      seq === '销售序列' ? tpl.commission_target : 0,
      0.5, 0, tpl.social_amount, curYm(), req.userId, (req.user && req.user.name) || '', localNow());
    made++;
  }
  audit('薪酬档案初始化', req.userId, curYm(), `按组成方案为 ${made} 名在职员工初始化薪酬档案`);
  return res.json(ok({ made, total: emps.length }, `已初始化 ${made} 份薪酬档案`));
}

/** 新增/更新薪酬档案（按 emp_id upsert） */
async function saveProfile(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可维护薪酬档案'));
  const emp = db.prepare("SELECT * FROM employees WHERE id=? AND status='在职'").get(req.params.empId);
  if (!emp) return res.json(notfound('员工不存在或已停用'));
  const b = req.body || {};
  const dept = deptNameOf(emp);
  const tpl = tplOfEmp(emp, dept);
  const seq = SEQ_TYPES.includes(b.seq_type) ? b.seq_type : seqOfEmp(emp, dept, tpl);
  const vals = {
    seq_type: seq,
    base_salary: round2(b.base_salary !== undefined ? b.base_salary : tpl.base_salary || 0),
    post_salary: round2(b.post_salary !== undefined ? b.post_salary : tpl.post_salary || 0),
    perf_base: round2(b.perf_base !== undefined ? b.perf_base : tpl.perf_base || 0),
    commission_rate: Number(b.commission_rate !== undefined ? b.commission_rate : (seq === '销售序列' ? tpl.commission_rate || 0 : 0)),
    commission_target: Number(b.commission_target !== undefined ? b.commission_target : (seq === '销售序列' ? tpl.commission_target || 0 : 0)),
    commission_bonus: Number(b.commission_bonus !== undefined ? b.commission_bonus : 0.5),
    allowance: round2(b.allowance !== undefined ? b.allowance : 0),
    social_amount: round2(b.social_amount !== undefined ? b.social_amount : tpl.social_amount || 0),
    effective_month: b.effective_month || curYm(),
    remark: b.remark || '',
  };
  if (vals.commission_rate < 0 || vals.commission_rate > 1) return res.json(bad('提成率须在 0~1 之间（如 0.03=3%）'));
  const old = db.prepare('SELECT * FROM salary_profiles WHERE emp_id=?').get(emp.id);
  if (old) {
    db.prepare(`UPDATE salary_profiles SET seq_type=?, base_salary=?, post_salary=?, perf_base=?, commission_rate=?, commission_target=?,
      commission_bonus=?, allowance=?, social_amount=?, effective_month=?, remark=?, updated_at=? WHERE emp_id=?`)
      .run(vals.seq_type, vals.base_salary, vals.post_salary, vals.perf_base, vals.commission_rate, vals.commission_target,
        vals.commission_bonus, vals.allowance, vals.social_amount, vals.effective_month, vals.remark, localNow(), emp.id);
  } else {
    db.prepare(`INSERT INTO salary_profiles(emp_id,emp_no,emp_name,role,seq_type,base_salary,post_salary,perf_base,commission_rate,commission_target,commission_bonus,allowance,social_amount,effective_month,remark,created_by,created_by_name,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(emp.id, emp.emp_no, emp.name, emp.role, vals.seq_type, vals.base_salary, vals.post_salary, vals.perf_base,
        vals.commission_rate, vals.commission_target, vals.commission_bonus, vals.allowance, vals.social_amount,
        vals.effective_month, vals.remark, req.userId, (req.user && req.user.name) || '', localNow());
  }
  audit('保存薪酬档案', req.userId, emp.emp_no, `${emp.name} 薪酬档案[${vals.seq_type}] 基本${vals.base_salary} 提成率${vals.commission_rate}`);
  return res.json(ok({ emp_id: emp.id, ...vals }, '薪酬档案已保存'));
}

async function removeProfile(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可维护薪酬档案'));
  const p = db.prepare('SELECT * FROM salary_profiles WHERE emp_id=?').get(req.params.empId);
  if (!p) return res.json(notfound('薪酬档案不存在'));
  db.prepare('DELETE FROM salary_profiles WHERE emp_id=?').run(req.params.empId);
  audit('删除薪酬档案', req.userId, p.emp_no, `删除 ${p.emp_name}(${p.emp_no}) 薪酬档案`);
  return res.json(ok(null, '薪酬档案已删除'));
}

/* ==================== 薪酬组成方案 ==================== */
async function getScheme(req, res) {
  const rows = schemeRows();
  const last = rows.reduce((m, s) => (!m || (s.updated_at || '') > (m.updated_at || '') ? s : m), null);
  return res.json(ok({
    total_roles: rows.length,
    updated_at: last ? last.updated_at : null,
    updated_by_name: last ? last.updated_by_name : null,
    roles: rows.map((s) => ({
      role: s.role, role_name: s.role_name || s.role, seq_type: s.seq_type,
      base_salary: s.base_salary, post_salary: s.post_salary, perf_base: s.perf_base,
      commission_rate: s.commission_rate, commission_target: s.commission_target, social_amount: s.social_amount,
    })),
  }));
}

/** 财务部制定/调整组成方案（逐角色 upsert） */
async function putScheme(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可调整薪酬组成方案'));
  const list = (req.body || {}).rows;
  if (!Array.isArray(list) || !list.length) return res.json(bad('请提交组成方案行（rows:[{role,...}]）'));
  ensureScheme();
  const upd = db.prepare(`INSERT INTO payroll_scheme(role,role_name,seq_type,base_salary,post_salary,perf_base,commission_rate,commission_target,social_amount,updated_by_name,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(role) DO UPDATE SET role_name=excluded.role_name, seq_type=excluded.seq_type, base_salary=excluded.base_salary,
      post_salary=excluded.post_salary, perf_base=excluded.perf_base, commission_rate=excluded.commission_rate,
      commission_target=excluded.commission_target, social_amount=excluded.social_amount,
      updated_by_name=excluded.updated_by_name, updated_at=excluded.updated_at`);
  const t = localNow();
  const name = (req.user && req.user.name) || '';
  for (const it of list) {
    const role = String(it.role || '').trim();
    const cur = db.prepare('SELECT * FROM payroll_scheme WHERE role=?').get(role);
    const def = PAY_DEFAULT[role];
    if (!cur && !def) return res.json(bad(`岗位 ${role} 不在薪酬组成方案中`));
    const base = cur || { seq_type: def.seq, base_salary: def.b, post_salary: def.p1, perf_base: def.p2, commission_rate: def.r, commission_target: def.t, social_amount: def.s };
    const seq = SEQ_TYPES.includes(it.seq_type) ? it.seq_type : base.seq_type;
    const rate = Number(it.commission_rate !== undefined ? it.commission_rate : base.commission_rate);
    if (rate < 0 || rate > 1) return res.json(bad(`${role} 提成率须在 0~1 之间`));
    upd.run(role, role, seq,
      round2(it.base_salary !== undefined ? it.base_salary : base.base_salary),
      round2(it.post_salary !== undefined ? it.post_salary : base.post_salary),
      round2(it.perf_base !== undefined ? it.perf_base : base.perf_base),
      rate,
      Number(it.commission_target !== undefined ? it.commission_target : base.commission_target),
      round2(it.social_amount !== undefined ? it.social_amount : base.social_amount),
      name, t);
  }
  audit('制定薪酬组成方案', req.userId, 'payroll_scheme', `调整 ${list.length} 个岗位薪酬组成方案`);
  return res.json(ok({ updated: list.length }, `已更新 ${list.length} 个岗位的薪酬组成方案`));
}

/** 将当前组成方案应用到全体在职员工薪酬档案 */
async function applyScheme(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可应用薪酬组成方案'));
  ensureScheme();
  const emps = db.prepare("SELECT * FROM employees WHERE status='在职'").all();
  const upd = db.prepare(`UPDATE salary_profiles SET seq_type=?, base_salary=?, post_salary=?, perf_base=?,
    commission_rate=?, commission_target=?, social_amount=?, updated_at=? WHERE emp_id=?`);
  let applied = 0;
  for (const e of emps) {
    const dept = deptNameOf(e);
    const tpl = tplOfEmp(e, dept);
    const seq = seqOfEmp(e, dept, tpl);
    upd.run(seq, tpl.base_salary, tpl.post_salary, tpl.perf_base,
      seq === '销售序列' ? tpl.commission_rate : 0,
      seq === '销售序列' ? tpl.commission_target : 0,
      tpl.social_amount, localNow(), e.id);
    applied++;
  }
  audit('应用薪酬组成方案', req.userId, 'salary_profiles', `最新组成方案已应用到 ${applied} 份在职薪酬档案`);
  return res.json(ok({ applied }, `已应用到 ${applied} 份薪酬档案`));
}

/* ==================== 月度核算 ==================== */
async function calc(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可执行工资核算'));
  const { period, force } = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(String(period || ''))) return res.json(bad('核算月份格式须为 YYYY-MM'));
  const exist = db.prepare('SELECT * FROM payroll_records WHERE period=?').get(period);
  if (exist && exist.status === '已发布') return res.json(bad(`${period} 工资核算已发布，不能重算`));
  if (exist && !force) return res.json(bad(`${period} 已有${exist.status}核算批次（id=${exist.id}），请勾选覆盖后重算`));

  const emps = db.prepare(`SELECT e.*, (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM employees e JOIN salary_profiles p ON p.emp_id=e.id WHERE e.status='在职' ORDER BY e.emp_no`).all();
  if (!emps.length) return res.json(bad('尚无在职员工的薪酬档案，请先「一键建档」'));

  const items = [];
  let totalGross = 0; let totalNet = 0; let totalComm = 0;
  for (const e of emps) {
    const p = db.prepare('SELECT * FROM salary_profiles WHERE emp_id=?').get(e.id);
    if (!p) continue;
    const isSales = p.seq_type === '销售序列';
    const collection = isSales ? monthCollection(e.id, period) : 0; // 万元
    let commission = 0;
    const note = [];
    if (isSales && p.commission_rate > 0) {
      const collYuan = round2(collection * 10000);
      commission = round2(collYuan * p.commission_rate);
      if (p.commission_target > 0 && collection > p.commission_target) {
        const over = round2((collection - p.commission_target) * 10000 * p.commission_rate * (p.commission_bonus || 0));
        commission = round2(commission + over);
        note.push(`超额 ${round2(collection - p.commission_target)}万×${Math.round(p.commission_rate * 1000) / 10}%×(1+${p.commission_bonus || 0})=${over}元`);
      }
      note.push(`回款 ${round2(collection)}万×${Math.round(p.commission_rate * 1000) / 10}%=${commission}元`);
    }
    const coef = perfCoef(e.id);
    const perf = round2((p.perf_base || 0) * coef);
    const leaveDays = leaveDeduction(e.id, period);
    const daySalary = round2(((p.base_salary || 0) + (p.post_salary || 0)) / 21.75);
    const leaveCut = round2(leaveDays * daySalary);
    const gross = round2((p.base_salary || 0) + (p.post_salary || 0) + perf + commission + (p.allowance || 0));
    const social = p.social_amount || 0;
    const tax = taxOf(gross, social + leaveCut);
    const net = round2(gross - social - leaveCut - tax);
    totalGross += gross; totalNet += net; totalComm += commission;
    items.push({
      emp_id: e.id, emp_no: e.emp_no, emp_name: e.name, role: e.role, role_name: e.role,
      dept_name: e.dept_name || '', seq_type: p.seq_type,
      base_salary: p.base_salary || 0, post_salary: p.post_salary || 0, perf_base: p.perf_base || 0,
      perf_coef: coef, perf_salary: perf, commission_amount: commission, collection_amount: round2(collection),
      allowance: p.allowance || 0, social_amount: social, deduction: leaveCut, tax_amount: tax,
      gross_amount: gross, net_amount: net,
      items_json: JSON.stringify({ coef_src: note.join('；'), leave_days: leaveDays }),
    });
  }
  // 先清旧草稿，再落新批次
  if (exist) db.prepare('DELETE FROM payroll_items WHERE record_id=?').run(exist.id);
  db.prepare('DELETE FROM payroll_records WHERE period=?').run(period);
  const rec = db.prepare(`INSERT INTO payroll_records(period,total_emps,total_gross,total_net,total_commission,status,operator_id,operator_name,created_at)
    VALUES(?,?,?,?,?,'草稿',?,?,?)`)
    .run(period, items.length, round2(totalGross), round2(totalNet), round2(totalComm),
      req.userId, (req.user && req.user.name) || '', localNow());
  const insItem = db.prepare(`INSERT INTO payroll_items(record_id,emp_id,emp_no,emp_name,role,role_name,dept_name,seq_type,base_salary,post_salary,perf_base,perf_coef,perf_salary,commission_amount,collection_amount,allowance,social_amount,deduction,tax_amount,gross_amount,net_amount,items_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const it of items) {
    insItem.run(rec.lastInsertRowid, it.emp_id, it.emp_no, it.emp_name, it.role, it.role_name, it.dept_name, it.seq_type,
      it.base_salary, it.post_salary, it.perf_base, it.perf_coef, it.perf_salary, it.commission_amount, it.collection_amount,
      it.allowance, it.social_amount, it.deduction, it.tax_amount, it.gross_amount, it.net_amount, it.items_json);
  }
  audit('月度工资核算', req.userId, period, `${period} 核算 ${items.length} 人，应发合计${round2(totalGross)}元，实发${round2(totalNet)}元，提成${round2(totalComm)}元`);
  return res.json(ok({
    record_id: rec.lastInsertRowid, period, status: '草稿', total_emps: items.length,
    total_gross: round2(totalGross), total_net: round2(totalNet), total_commission: round2(totalComm),
  }, `${period} 核算完成，共 ${items.length} 人`));
}

/* ==================== 核算批次与明细 ==================== */
async function listRecords(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看工资核算'));
  let sql = `SELECT pr.*, (SELECT COUNT(*) FROM payroll_items pi WHERE pi.record_id=pr.id) emps FROM payroll_records pr WHERE 1=1`;
  const p = [];
  if (req.query.period) { sql += ' AND pr.period=?'; p.push(req.query.period); }
  if (req.query.status) { sql += ' AND pr.status=?'; p.push(req.query.status); }
  sql += ' ORDER BY pr.period DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function recordDetail(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看工资核算'));
  const rec = db.prepare('SELECT * FROM payroll_records WHERE id=?').get(req.params.id);
  if (!rec) return res.json(notfound('核算批次不存在'));
  const items = db.prepare('SELECT * FROM payroll_items WHERE record_id=? ORDER BY emp_no').all(req.params.id);
  items.forEach((x) => { try { x.items = x.items_json ? JSON.parse(x.items_json) : {}; } catch (e) { x.items = {}; } delete x.items_json; });
  return res.json(ok({ ...rec, items }));
}

async function publishRecord(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可发布工资单'));
  const rec = db.prepare('SELECT * FROM payroll_records WHERE id=?').get(req.params.id);
  if (!rec) return res.json(notfound('核算批次不存在'));
  if (rec.status === '已发布') return res.json(bad('该批次已发布'));
  db.prepare("UPDATE payroll_records SET status='已发布', published_at=? WHERE id=?").run(localNow(), rec.id);
  audit('发布工资单', req.userId, rec.period, `${rec.period} 工资核算发布（${rec.total_emps}人，实发合计${rec.total_net}元）`);
  return res.json(ok({ period: rec.period }, `${rec.period} 工资单已发布，员工可查看`));
}

async function removeRecord(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可删除核算批次'));
  const rec = db.prepare('SELECT * FROM payroll_records WHERE id=?').get(req.params.id);
  if (!rec) return res.json(notfound('核算批次不存在'));
  if (rec.status === '已发布') return res.json(bad('已发布批次不可删除'));
  db.prepare('DELETE FROM payroll_items WHERE record_id=?').run(rec.id);
  db.prepare('DELETE FROM payroll_records WHERE id=?').run(rec.id);
  audit('删除核算批次', req.userId, rec.period, `删除 ${rec.period} 草稿核算批次`);
  return res.json(ok(null, '草稿批次已删除'));
}

/** 全员工资条查询（已发布；按工号/姓名/部门/月份） */
async function payslips(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查询工资条'));
  const q = String(req.query.q || '').trim();
  const period = String(req.query.period || '').trim();
  const dept = String(req.query.dept || '').trim();
  let sql = `SELECT pi.*, pr.period, pr.published_at, pr.status FROM payroll_items pi
    JOIN payroll_records pr ON pi.record_id=pr.id WHERE pr.status='已发布'`;
  const p = [];
  if (period) { sql += ' AND pr.period=?'; p.push(period); }
  if (dept) { sql += ' AND pi.dept_name=?'; p.push(dept); }
  if (q) { sql += ' AND (pi.emp_no LIKE ? OR pi.emp_name LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY pr.period DESC, pi.dept_name, pi.emp_no LIMIT 800';
  const rows = db.prepare(sql).all(...p);
  rows.forEach((x) => { try { x.items = x.items_json ? JSON.parse(x.items_json) : {}; } catch (e) { x.items = {}; } delete x.items_json; });
  return res.json(ok(rows));
}

/** 汇总（部门 × 序列） */
async function summary(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看薪酬汇总'));
  const period = /^\d{4}-\d{2}$/.test(String(req.query.period || '')) ? req.query.period : '';
  const where = period
    ? 'WHERE pi.record_id=(SELECT id FROM payroll_records WHERE period=?)'
    : 'WHERE pi.record_id=(SELECT id FROM payroll_records ORDER BY period DESC LIMIT 1)';
  const args = period ? [period] : [];
  const byDept = db.prepare(`SELECT pi.dept_name dept, pi.seq_type, COUNT(*) emps, ROUND(SUM(pi.gross_amount),2) gross,
      ROUND(SUM(pi.net_amount),2) net, ROUND(SUM(pi.commission_amount),2) commission
    FROM payroll_items pi ${where} GROUP BY pi.dept_name, pi.seq_type ORDER BY pi.dept_name`).all(...args);
  const bySeq = db.prepare(`SELECT pi.seq_type, COUNT(*) emps, ROUND(SUM(pi.gross_amount),2) gross,
      ROUND(SUM(pi.net_amount),2) net, ROUND(SUM(pi.commission_amount),2) commission
    FROM payroll_items pi ${where} GROUP BY pi.seq_type`).all(...args);
  const tot = db.prepare(`SELECT COUNT(*) emps, ROUND(SUM(pi.gross_amount),2) gross, ROUND(SUM(pi.net_amount),2) net,
      ROUND(SUM(pi.commission_amount),2) commission FROM payroll_items pi ${where}`).get(...args);
  return res.json(ok({ period, byDept, bySeq, total: tot }));
}

/** 我的工资条（全员，仅本人工号、仅已发布） */
async function mine(req, res) {
  const emp = empOf(req.userId);
  if (!emp) return res.json(ok({ latest: null, list: [] }));
  const rows = db.prepare(`SELECT pi.*, pr.period, pr.status, pr.published_at FROM payroll_items pi
    JOIN payroll_records pr ON pi.record_id=pr.id
    WHERE pi.emp_id=? AND pr.status='已发布' ORDER BY pr.period DESC LIMIT 24`).all(emp.id);
  rows.forEach((x) => { try { x.items = x.items_json ? JSON.parse(x.items_json) : {}; } catch (e) { x.items = {}; } delete x.items_json; });
  return res.json(ok({ latest: rows[0] || null, list: rows }));
}

/* ==========================================================
 *  财务序列薪酬考核（迁移自参考项目 routes/finpay.js）
 * ========================================================== */
const FIN_KV = 'finpay.scheme';
const FIN_PROFILE_KV = 'finpay.profiles';
const FIN_DEFAULT = {
  scheme_name: '财务序列薪酬组成方案',
  seniority_per_month: 50,
  kpi: [
    { key: 'acc', label: '核算准确性' }, { key: 'time', label: '凭证与结账及时性' },
    { key: 'comp', label: '合规执行' }, { key: 'serve', label: '跨部门服务' }, { key: 'improv', label: '学习改进' },
  ],
  kpi_desc: {
    acc: '当月账务/报表核算差错率与返工', time: '凭证录入、月结/对账时效', comp: '预算与报销合规、审计配合',
    serve: '跨部门单据对接服务评价', improv: '新政策/新准则学习与改进',
  },
  bands: [
    { min: 90, grade: 'S优秀', coef: 1.2 }, { min: 80, grade: 'A良好', coef: 1.1 },
    { min: 70, grade: 'B合格', coef: 1.0 }, { min: 60, grade: 'C待改进', coef: 0.85 }, { min: 0, grade: 'D不合格', coef: 0.6 },
  ],
  roles: {
    FIN: { label: '财务负责人', base: 6500, post: 2500, perf: 2500, traffic: 300, meal: 400, title_allow: 800, social: 900, housing: 800 },
    FIN2: { label: '财务专员', base: 4500, post: 1500, perf: 1500, traffic: 200, meal: 300, title_allow: 300, social: 600, housing: 500 },
  },
};
function getKV(key) {
  try {
    const row = db.prepare('SELECT value FROM kv_store WHERE key=?').get(key);
    if (!row) return null;
    return JSON.parse(row.value);
  } catch (e) { return null; }
}
function setKV(key, val) {
  db.prepare('DELETE FROM kv_store WHERE key=?').run(key);
  db.prepare('INSERT INTO kv_store(key,value,updated_at) VALUES(?,?,?)').run(key, JSON.stringify(val), localNow());
}
function finCfg() {
  const c = getKV(FIN_KV);
  return c && c.roles && c.bands && c.kpi ? c : FIN_DEFAULT;
}
function finProfilesKV() { return getKV(FIN_PROFILE_KV) || {}; }
/** 评分 → 评级 → 系数（取首个 min≤score 的档位） */
function gradeOf(score, bands) {
  const s = Number(score) || 0;
  const bs = Array.isArray(bands) && bands.length ? bands : FIN_DEFAULT.bands;
  for (const b of bs) { if (s >= (Number(b.min) || 0)) return { grade: String(b.grade || '合格'), coef: round2(Number(b.coef) || 0) }; }
  const last = bs[bs.length - 1];
  return { grade: last ? String(last.grade) : 'D不合格', coef: round2(last ? Number(last.coef) : 0.6) };
}
/** 财务序列在职员工（财务部或财务岗） */
function finEmps() {
  return db.prepare(`SELECT e.*, (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM employees e WHERE e.status='在职' ORDER BY e.emp_no`).all()
    .filter((e) => String(e.dept_name || '').includes('财务') || ['财务负责人', '财务专员'].includes(e.role));
}
/** 岗位模板：部门经理（财务部负责人）→ FIN，其余 → FIN2 */
function finTplOf(e, cfg) {
  return (e.role === '部门经理' || e.role === '财务负责人') ? cfg.roles.FIN : cfg.roles.FIN2;
}
/** 工龄月数（按入职日期折算，可在档案里覆盖） */
function seniorityMonths(e) {
  if (!e.hire_date) return 0;
  const d = new Date(String(e.hire_date).replace(/-/g, '/'));
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000 / 30.5));
}
/** 单个财务员工的组成（方案模板 + 个人覆盖） */
function finComposeOf(e, cfg) {
  const t = finTplOf(e, cfg);
  const ov = finProfilesKV()[String(e.id)] || {};
  const months = ov.seniority_months !== undefined ? Math.max(0, Math.round(Number(ov.seniority_months) || 0)) : seniorityMonths(e);
  const num = (k, dv) => round2(ov[k] !== undefined ? Number(ov[k]) || 0 : dv);
  const base = num('base', t.base);
  const post = num('post', t.post);
  const perf_base = num('perf', t.perf);
  const traffic = num('traffic', t.traffic);
  const meal = num('meal', t.meal);
  const title_allow = num('title_allow', t.title_allow);
  const social = num('social', t.social);
  const housing = num('housing', t.housing);
  return { base, post, perf_base, traffic, meal, title_allow, social, housing, seniority_months: months };
}
/** 按组成 + 评分算金额（对齐 finpay.js） */
function finCalcOf(c, score, cfg) {
  const g = gradeOf(score, cfg.bands);
  const perf_salary = round2(c.perf_base * g.coef);
  const seniority_salary = round2((c.seniority_months || 0) * (Number(cfg.seniority_per_month) || 0));
  const allowance = round2(c.traffic + c.meal + seniority_salary + c.title_allow);
  const gross = round2(c.base + c.post + perf_salary + c.traffic + c.meal + seniority_salary + c.title_allow);
  const deduction = round2(c.social + c.housing);
  const tax = taxOf(gross, deduction);
  const net = round2(gross - deduction - tax);
  return { grade: g.grade, coef: g.coef, perf_salary, seniority_salary, allowance, gross, deduction, tax, net };
}

async function finScheme(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看财务薪酬方案'));
  const cfg = finCfg();
  const tpl = cfg.roles.FIN;
  const compose = ['基本工资（岗位职级固定部分）', '岗位工资（岗位价值部分）', '绩效工资（绩效基数×考核系数）', '交通补贴', '餐补'];
  if (Number(cfg.seniority_per_month) > 0) compose.push(`工龄津贴（工龄月数×${cfg.seniority_per_month}元/月）`);
  if (Number(tpl.title_allow) > 0) compose.push('职称津贴');
  return res.json(ok({
    scheme_name: cfg.scheme_name, compose,
    deduction: ['社保代扣', '住房公积金', '个人所得税（起征5000 · 7级超额累进）'],
    formula: '应发 = ' + compose.map((c) => c.split('（')[0]).join('+') + '；实发 = 应发 − 社保 − 公积金 − 个税',
    kpi: cfg.kpi, kpi_desc: cfg.kpi_desc || {}, bands: cfg.bands,
    seniority_per_month: cfg.seniority_per_month,
    roles: Object.entries(cfg.roles).map(([role, v]) => ({ role, ...v })),
  }));
}

async function finPutScheme(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可调整财务薪酬组成方案'));
  const b = req.body || {};
  const cur = finCfg();
  const num = (v, dv, max) => Math.max(0, Math.min(max === undefined ? 1e9 : max, round2(Number(v === undefined ? dv : v) || 0)));
  const roles = {};
  ['FIN', 'FIN2'].forEach((role) => {
    const src = (b.roles && b.roles[role]) || cur.roles[role] || FIN_DEFAULT.roles[role];
    roles[role] = {
      label: String(src.label || FIN_DEFAULT.roles[role].label).slice(0, 12),
      base: num(src.base, 0), post: num(src.post, 0), perf: num(src.perf, 0),
      traffic: num(src.traffic, 0), meal: num(src.meal, 0), title_allow: num(src.title_allow, 0),
      social: num(src.social, 0), housing: num(src.housing, 0),
    };
  });
  const seniority_per_month = Math.max(0, Math.min(1000, num(b.seniority_per_month, cur.seniority_per_month, 1000)));
  let bands = (Array.isArray(b.bands) && b.bands.length ? b.bands : cur.bands)
    .map((x) => ({ min: Math.max(0, Math.round(Number(x.min) || 0)), grade: String(x.grade || '合格').slice(0, 6), coef: Math.max(0.1, Math.min(3, round2(Number(x.coef) || 0))) }))
    .sort((a, z) => z.min - a.min);
  if (!bands.length || bands[bands.length - 1].min !== 0) bands.push({ min: 0, grade: '不合格', coef: 0.6 });
  bands = bands.slice(0, 7);
  const kpi = FIN_DEFAULT.kpi.map((k) => {
    const src = (Array.isArray(b.kpi) ? b.kpi.find((x) => x && x.key === k.key) : null) || cur.kpi.find((x) => x.key === k.key) || {};
    return { key: k.key, label: String(src.label || k.label).slice(0, 12) };
  });
  const next = {
    scheme_name: String(b.scheme_name || cur.scheme_name || FIN_DEFAULT.scheme_name).slice(0, 30),
    seniority_per_month, kpi, bands, roles, kpi_desc: cur.kpi_desc || FIN_DEFAULT.kpi_desc,
  };
  setKV(FIN_KV, next);
  audit('调整财务薪酬方案', req.userId, 'finpay.scheme', `工龄单价${seniority_per_month}元/月 · 分档${bands.length}档`);
  return res.json(ok({ scheme_name: next.scheme_name }, '财务序列薪酬组成方案已更新'));
}

async function finProfiles(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看财务薪酬档案'));
  const cfg = finCfg();
  const kv = finProfilesKV();
  const rows = finEmps().map((e) => {
    const c = finComposeOf(e, cfg);
    return {
      emp_id: e.id, emp_no: e.emp_no, emp_name: e.name, role: e.role, dept_name: e.dept_name || '财务部',
      hire_date: e.hire_date || '', tpl: finTplOf(e, cfg) === cfg.roles.FIN ? 'FIN' : 'FIN2',
      customized: !!kv[String(e.id)], ...c,
    };
  });
  return res.json(ok(rows));
}

async function finSaveProfile(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可维护财务薪酬档案'));
  const emp = db.prepare("SELECT * FROM employees WHERE id=? AND status='在职'").get(req.params.empId);
  if (!emp) return res.json(notfound('员工不存在或已停用'));
  const cfg = finCfg();
  const t = finTplOf(emp, cfg);
  const b = req.body || {};
  const kv = finProfilesKV();
  kv[String(emp.id)] = {
    base: round2(b.base !== undefined ? b.base : t.base),
    post: round2(b.post !== undefined ? b.post : t.post),
    perf: round2(b.perf !== undefined ? b.perf : t.perf),
    traffic: round2(b.traffic !== undefined ? b.traffic : t.traffic),
    meal: round2(b.meal !== undefined ? b.meal : t.meal),
    title_allow: round2(b.title_allow !== undefined ? b.title_allow : t.title_allow),
    social: round2(b.social !== undefined ? b.social : t.social),
    housing: round2(b.housing !== undefined ? b.housing : t.housing),
    seniority_months: Math.max(0, Math.round(b.seniority_months !== undefined ? b.seniority_months : seniorityMonths(emp))),
  };
  setKV(FIN_PROFILE_KV, kv);
  audit('保存财务薪酬档案', req.userId, emp.emp_no, `${emp.name} 财务薪酬组成更新（基本${kv[String(emp.id)].base} 绩效基数${kv[String(emp.id)].perf}）`);
  return res.json(ok({ emp_id: emp.id, ...kv[String(emp.id)] }, '财务薪酬档案已保存'));
}

/** 财务序列月度核算记录（salary_records 金额快照 + kpi_records 评分明细） */
async function finRecords(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看财务薪酬考核'));
  let period = /^\d{4}-\d{2}$/.test(String(req.query.period || '')) ? req.query.period : '';
  if (!period) {
    const m = db.prepare("SELECT MAX(month) m FROM salary_records WHERE level IN ('FIN','FIN2')").get();
    period = (m && m.m) || curYm();
  }
  const rows = db.prepare(`SELECT sr.*, k.score kpi_score, k.remark kpi_remark
    FROM salary_records sr LEFT JOIN kpi_records k ON k.emp_id=sr.emp_id AND k.period=sr.month
    WHERE sr.month=? AND sr.level IN ('FIN','FIN2') ORDER BY sr.emp_id`).all(period);
  const list = rows.map((x) => {
    let dims = {}; let detail = {};
    try { const p = JSON.parse(x.kpi_remark || '{}'); dims = p.dims || {}; detail = p; } catch (e) { /* 忽略 */ }
    return {
      id: x.id, emp_id: x.emp_id, emp_name: x.emp_name, dept: x.dept, level: x.level, period: x.month,
      score: x.performance_score, grade: x.performance_grade, coef: detail.coef || 0,
      base_salary: x.base_salary, perf_salary: x.performance_bonus, allowance: x.allowance,
      social_ins: x.social_ins, housing_fund: x.housing_fund, tax: x.tax,
      gross_pay: x.gross_pay, net_pay: x.net_pay, status: x.status,
      dims, detail,
    };
  });
  return res.json(ok({ period, rows: list }));
}

async function finCalc(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可执行财务薪酬核算'));
  const period = String((req.body || {}).period || '').trim();
  if (!/^\d{4}-\d{2}$/.test(period)) return res.json(bad('核算月份格式须为 YYYY-MM'));
  const cfg = finCfg();
  const published = db.prepare("SELECT COUNT(*) c FROM salary_records WHERE month=? AND level IN ('FIN','FIN2') AND status='已发布'").get(period).c;
  if (published) return res.json(bad(`${period} 财务薪酬核算已发布，不可覆盖重算`));
  const emps = finEmps();
  if (!emps.length) return res.json(bad('未找到财务序列在职员工（财务部/财务岗）'));
  db.prepare("DELETE FROM salary_records WHERE month=? AND level IN ('FIN','FIN2') AND COALESCE(status,'草稿')<>'已发布'").run(period);
  const ins = db.prepare(`INSERT INTO salary_records(id,emp_id,emp_name,dept,level,month,base_salary,performance_score,performance_grade,performance_bonus,allowance,social_ins,housing_fund,tax,gross_pay,net_pay,status,approver,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'草稿',?,?)`);
  const upsertKpi = db.prepare(`INSERT INTO kpi_records(emp_id,period,score,remark) VALUES(?,?,?,?)
    ON CONFLICT(emp_id,period) DO UPDATE SET score=excluded.score, remark=excluded.remark`);
  const rows = [];
  for (const e of emps) {
    const c = finComposeOf(e, cfg);
    const last = db.prepare("SELECT k.score, k.remark FROM kpi_records k WHERE k.emp_id=? ORDER BY k.period DESC LIMIT 1").get(e.id);
    let score = 85; let dims = {};
    if (last && last.score) {
      score = Number(last.score);
      try { dims = (JSON.parse(last.remark || '{}') || {}).dims || {}; } catch (err) { dims = {}; }
    }
    const r = finCalcOf(c, score, cfg);
    const level = finTplOf(e, cfg) === cfg.roles.FIN ? 'FIN' : 'FIN2';
    const rid = `FIN${period.replace('-', '')}-${e.id}`;
    const info = ins.run(rid, String(e.id), e.name, e.dept_name || '财务部', level, period,
      c.base + c.post, score, r.grade, r.perf_salary, r.allowance,
      c.social, c.housing, r.tax, r.gross, r.net, (req.user && req.user.name) || '', localNow());
    upsertKpi.run(e.id, period, score, JSON.stringify({
      dims, coef: r.coef, grade: r.grade, seq: '财务序列',
      detail: { ...c, ...r }, src: last ? `沿用最近评分` : '默认良好(85分)',
    }));
    rows.push({ emp_id: e.id, emp_name: e.name, level, score, grade: r.grade, coef: r.coef, gross_pay: r.gross, net_pay: r.net, id: info.lastInsertRowid });
  }
  audit('财务薪酬月度核算', req.userId, period, `${period} 财务序列核算 ${rows.length} 人`);
  return res.json(ok({ period, count: rows.length, rows }, `${period} 财务薪酬核算已生成 ${rows.length} 人`));
}

/** 逐人评分复核（5 项指标 → 综合分 → 系数/应发/实发联动重算） */
async function finAssess(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可评分'));
  const rec = db.prepare('SELECT * FROM salary_records WHERE id=?').get(req.params.id);
  if (!rec) return res.json(notfound('核算记录不存在'));
  if (rec.status === '已发布') return res.json(bad('已发布记录不可再改评分'));
  const cfg = finCfg();
  const b = req.body || {};
  const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(rec.emp_id) || {};
  const c = finComposeOf(emp, cfg);
  const old = db.prepare('SELECT score, remark FROM kpi_records WHERE emp_id=? AND period=?').get(rec.emp_id, rec.month);
  const oldDims = (() => { try { return (JSON.parse((old && old.remark) || '{}') || {}).dims || {}; } catch (e) { return {}; } })();
  const dims = {};
  cfg.kpi.forEach((k) => {
    const v = b[k.key] !== undefined ? Number(b[k.key]) : Number(oldDims[k.key] || 0);
    dims[k.key] = Math.max(0, Math.min(100, v || 0));
  });
  const score = Math.round((Object.values(dims).reduce((s, x) => s + x, 0)) / Math.max(1, cfg.kpi.length) * 10) / 10;
  const r = finCalcOf(c, score, cfg);
  db.prepare(`UPDATE salary_records SET performance_score=?, performance_grade=?, performance_bonus=?, allowance=?,
    social_ins=?, housing_fund=?, tax=?, gross_pay=?, net_pay=? WHERE id=?`)
    .run(score, r.grade, r.perf_salary, r.allowance, c.social, c.housing, r.tax, r.gross, r.net, rec.id);
  db.prepare(`INSERT INTO kpi_records(emp_id,period,score,remark) VALUES(?,?,?,?)
    ON CONFLICT(emp_id,period) DO UPDATE SET score=excluded.score, remark=excluded.remark`)
    .run(rec.emp_id, rec.month, score, JSON.stringify({ dims, coef: r.coef, grade: r.grade, seq: '财务序列', detail: { ...c, ...r } }));
  audit('财务序列考核评分', req.userId, rec.emp_name, `${rec.month} ${rec.emp_name} 评分${score} → ${r.grade}（系数${r.coef}）`);
  return res.json(ok({ emp_name: rec.emp_name, period: rec.month, score, grade: r.grade, coef: r.coef, gross_pay: r.gross, net_pay: r.net }, `评分 ${score} 分，评级 ${r.grade}`));
}

async function finPublish(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可发布'));
  const period = String((req.body || {}).period || '').trim();
  const n = db.prepare("SELECT COUNT(*) c FROM salary_records WHERE month=? AND level IN ('FIN','FIN2') AND status='草稿'").get(period).c;
  if (!n) return res.json(bad(`${period} 无草稿核算可发布`));
  db.prepare("UPDATE salary_records SET status='已发布', sign_time=? WHERE month=? AND level IN ('FIN','FIN2') AND status='草稿'")
    .run(localNow(), period);
  audit('发布财务薪酬单', req.userId, period, `${period} 财务序列薪酬核算发布（${n}人）`);
  return res.json(ok({ period, count: n }, `${period} 已发布 ${n} 人`));
}

async function finRemove(req, res) {
  if (!payWrite(req.user)) return res.json(forbidden('仅财务部/总经理可删除核算记录'));
  const rec = db.prepare('SELECT * FROM salary_records WHERE id=?').get(req.params.id);
  if (!rec) return res.json(notfound('记录不存在'));
  if (rec.status === '已发布') return res.json(bad('已发布记录不可删除'));
  db.prepare('DELETE FROM salary_records WHERE id=?').run(rec.id);
  db.prepare('DELETE FROM kpi_records WHERE emp_id=? AND period=?').run(rec.emp_id, rec.month);
  audit('删除财务薪酬核算', req.userId, rec.emp_name, `${rec.month} ${rec.emp_name} 应发${rec.gross_pay} 实发${rec.net_pay}`);
  return res.json(ok(null, '草稿核算记录已删除'));
}

async function finSummary(req, res) {
  if (!payRead(req.user)) return res.json(forbidden('仅财务部/总经理/副总可查看汇总'));
  let period = /^\d{4}-\d{2}$/.test(String(req.query.period || '')) ? req.query.period : '';
  if (!period) {
    const m = db.prepare("SELECT MAX(month) m FROM salary_records WHERE level IN ('FIN','FIN2')").get();
    period = (m && m.m) || curYm();
  }
  const rows = db.prepare("SELECT * FROM salary_records WHERE month=? AND level IN ('FIN','FIN2')").all(period);
  const tot = rows.reduce((s, x) => ({
    n: s.n + 1,
    gross: round2(s.gross + (x.gross_pay || 0)),
    net: round2(s.net + (x.net_pay || 0)),
    deduction: round2(s.deduction + (x.social_ins || 0) + (x.housing_fund || 0)),
    perf: round2(s.perf + (x.performance_bonus || 0)),
  }), { n: 0, gross: 0, net: 0, deduction: 0, perf: 0 });
  return res.json(ok({ period, ...tot, published: rows.filter((x) => x.status === '已发布').length }));
}

module.exports = {
  options, stats,
  listProfiles, initProfiles, saveProfile, removeProfile,
  getScheme, putScheme, applyScheme,
  calc, listRecords, recordDetail, publishRecord, removeRecord,
  payslips, summary, mine,
  finScheme, finPutScheme, finProfiles, finSaveProfile, finRecords, finCalc, finAssess, finPublish, finRemove, finSummary,
};
