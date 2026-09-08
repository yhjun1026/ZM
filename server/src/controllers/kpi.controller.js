/**
 * 绩效管理控制器（迁移自参考项目 routes/performance.js 第48轮 #229）
 *
 * 对齐参考项目的取数口径与权限：
 *  - 生成范围：销售序列员工（销售总监 / 区域经理 / 销售部员工）
 *  - collection_amount 回款额：payments JOIN ar_ledgers（按 sales_id + 回款日期月份）
 *  - sales_amount 签约额：contracts（按合同创建人 + 签订日期月份，元→万元）
 *  - target_amount 目标：sales_targets 当月个人目标 → 回落薪酬档案 commission_target
 *  - completion_rate = 回款 / 目标 ×100（上限 150）
 *  - score = 完成率×0.7 + 最近一次「通过」的员工评价分×0.3（无评价默认 85），管理层可人工调分
 *  - 合规一票否决：置 compliance_veto=1 后 score 归零且不可调分，撤销后恢复
 *  - 权限：管理层（总经理 / 副总 / 销售总监 / 超级管理员）可生成与调分、否决；其他人仅查看（部门经理限本部门、员工限本人）
 *
 * 数据表：kpi_records / employees / sales_targets / salary_profiles / employee_evaluations /
 *         payments / ar_ledgers / contracts / opportunities
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); };
const YM_RE = /^\d{4}-\d{2}$/;
const curYm = () => localNow().slice(0, 7);

/** 生成绩效的岗位范围（销售序列，对齐参考项目 PERF_ROLES） */
const PERF_ROLES = ['销售总监', '区域经理', '销售专员', '销售员', '大客户经理'];
/** 管理层：可生成 / 调分 / 否决 */
const MGR_ROLES = ['总经理', '副总', '销售总监', '超级管理员'];
/** 可查看全公司 */
const HQ_ROLES = ['总经理', '副总', '销售总监', '超级管理员'];

function isMgr(u) { return !!u && MGR_ROLES.includes(u.role); }
function isHq(u) { return !!u && (HQ_ROLES.includes(u.role) || u.dept === '财务部'); }

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

/** 当月回款到账（万元） */
function monthCollection(empId, period) {
  try {
    return db.prepare(`SELECT COALESCE(SUM(p.amount),0) v FROM payments p
      JOIN ar_ledgers a ON p.ar_id=a.id
      WHERE a.sales_id=? AND substr(p.pay_date,1,7)=?`).get(empId, period).v || 0;
  } catch (e) { return 0; }
}
/**
 * 当月签约额（万元）
 * 参考项目走 contracts JOIN opportunities（o.sales_id），当前库 contracts 无 opp_id，
 * 按合同创建人（creator=员工姓名 或 CAST(creator_id AS INTEGER)=员工id）+ 签订月份取数。
 */
function monthSign(empId, period) {
  try {
    const emp = db.prepare('SELECT id,name FROM employees WHERE id=?').get(empId);
    if (!emp) return 0;
    const v = db.prepare(`SELECT COALESCE(SUM(ct.amount),0) v FROM contracts ct
      WHERE (ct.creator=? OR CAST(ct.creator_id AS INTEGER)=?) AND substr(ct.sign_date,1,7)=?`)
      .get(emp.name, emp.id, period).v || 0;
    return round2(v / 10000); // 元 → 万元
  } catch (e) { return 0; }
}
/** 当月新增商机数 */
function monthOpps(empId, period) {
  try {
    return db.prepare('SELECT COUNT(*) n FROM opportunities WHERE sales_id=? AND substr(created_at,1,7)=?').get(empId, period).n || 0;
  } catch (e) { return 0; }
}
/** 当月个人目标（万元）：sales_targets → 薪酬档案 commission_target 兜底 */
function monthTarget(empId, period) {
  try {
    const [y, m] = period.split('-').map(Number);
    const t = db.prepare('SELECT amount FROM sales_targets WHERE year=? AND month=? AND emp_id=? AND amount>0 ORDER BY id DESC LIMIT 1').get(y, m, empId);
    if (t && t.amount > 0) return Number(t.amount);
  } catch (e) { /* 表/列未就绪 */ }
  try {
    const p = db.prepare('SELECT commission_target FROM salary_profiles WHERE emp_id=?').get(empId);
    if (p && p.commission_target > 0) return Number(p.commission_target);
  } catch (e) { /* 未建档 */ }
  return 0;
}
/** 最近一次「通过」的员工评价分（无则 85） */
function recentEval(empId) {
  try {
    const ev = db.prepare("SELECT score FROM employee_evaluations WHERE emp_id=? AND status='通过' AND score>0 ORDER BY id DESC LIMIT 1").get(empId);
    if (ev) return Math.max(0, Math.min(100, Number(ev.score)));
  } catch (e) { /* 表未就绪 */ }
  return 85;
}
/** 绩效员工集合（在职 + 销售序列） */
function perfEmps() {
  return db.prepare(`SELECT e.*, (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM employees e WHERE e.status='在职' ORDER BY e.emp_no`).all()
    .filter((e) => PERF_ROLES.includes(e.role) || String(e.dept_name || '').includes('销售'));
}
/** 销售序列过滤片段（薪酬模块的财务序列考核也写 kpi_records，绩效模块只展示销售序列） */
function perfScopeSql() {
  return {
    sql: ` AND (e.role IN (${PERF_ROLES.map(() => '?').join(',')})
            OR (SELECT name FROM org_units o WHERE o.id=e.org_id) LIKE '%销售%')`,
    params: PERF_ROLES.slice(),
  };
}
/** 默认期间：最近一个 YYYY-MM */
function latestPeriod() {
  const m = db.prepare("SELECT MAX(period) p FROM kpi_records WHERE period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'").get();
  return (m && m.p) || curYm();
}

/* ==================== 选项 ==================== */
async function options(req, res) {
  const periods = db.prepare("SELECT DISTINCT period FROM kpi_records WHERE period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' ORDER BY period DESC LIMIT 24").all().map((x) => x.period);
  const depts = db.prepare('SELECT name FROM org_units ORDER BY name').all().map((x) => x.name).filter(Boolean);
  return res.json(ok({
    periods, depts,
    perf_roles: PERF_ROLES,
    mgr_roles: MGR_ROLES,
    can_manage: isMgr(req.user),
    current_period: curYm(),
    rules: {
      collection: '回款到账（payments + ar_ledgers，按 sales_id 与回款月份）',
      sales: '已签合同额（按合同创建人与签订月份，元→万元）',
      target: '当月个人销售目标（sales_targets，缺省回落薪酬档案回款目标）',
      score: '完成率×0.7 + 最近一次通过评价分×0.3（管理层可调分，范围 0~150）',
    },
  }));
}

/* ==================== 列表（含统计） ==================== */
async function list(req, res) {
  const q = req.query || {};
  const period = YM_RE.test(String(q.period || '').trim()) ? String(q.period).trim() : latestPeriod();
  // 数据范围：管理层/财务部 全公司；部门经理/区域经理 本部门；其余仅本人
  const emp = empOf(req.userId);
  const scope = perfScopeSql();
  let sql = `SELECT k.*, e.name emp_name, e.emp_no, e.role, e.region, e.title,
      (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM kpi_records k JOIN employees e ON k.emp_id=e.id WHERE 1=1` + scope.sql;
  const p = scope.params.slice();
  if (q.all !== '1') { sql += ' AND k.period=?'; p.push(period); }
  if (q.emp_no) { sql += ' AND e.emp_no LIKE ?'; p.push(`%${String(q.emp_no).trim()}%`); }
  if (q.q) { sql += ' AND (e.name LIKE ? OR e.emp_no LIKE ?)'; p.push(`%${q.q}%`, `%${q.q}%`); }
  if (q.dept) { sql += ' AND (SELECT name FROM org_units o WHERE o.id=e.org_id)=?'; p.push(q.dept); }
  if (!isHq(req.user)) {
    if (['部门经理', '区域经理'].includes(req.user && req.user.role)) {
      sql += ' AND (SELECT name FROM org_units o WHERE o.id=e.org_id)=?'; p.push((req.user && req.user.dept) || '');
    } else {
      sql += ' AND k.emp_id=?'; p.push(emp ? emp.id : 0);
    }
  }
  sql += ' ORDER BY k.completion_rate DESC, e.emp_no';
  const rows = db.prepare(sql).all(...p);
  rows.forEach((x) => { x.role_name = x.role; x.veto = x.compliance_veto === 1; });
  const stats = rows.length ? {
    total: rows.length,
    sales_amount: round2(rows.reduce((s, x) => s + (x.sales_amount || 0), 0)),
    collection_amount: round2(rows.reduce((s, x) => s + (x.collection_amount || 0), 0)),
    target_amount: round2(rows.reduce((s, x) => s + (x.target_amount || 0), 0)),
    avg_completion: round2(rows.reduce((s, x) => s + (x.completion_rate || 0), 0) / rows.length),
    avg_score: round2(rows.reduce((s, x) => s + (x.score || 0), 0) / rows.length),
    reached: rows.filter((x) => (x.completion_rate || 0) >= 100).length,
    over60: rows.filter((x) => (x.score || 0) >= 60).length,
    vetoed: rows.filter((x) => x.compliance_veto === 1).length,
  } : { total: 0, sales_amount: 0, collection_amount: 0, target_amount: 0, avg_completion: 0, avg_score: 0, reached: 0, over60: 0, vetoed: 0 };
  return res.json(ok({ period, rows, stats, can_manage: isMgr(req.user) }));
}

/* ==================== 统计（达成率分布 / 部门分布 / 月度趋势） ==================== */
async function stats(req, res) {
  const year = String(req.query.year || localNow().slice(0, 4));
  const scope = perfScopeSql();
  let sql = `SELECT k.*, e.name emp_name, (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM kpi_records k JOIN employees e ON k.emp_id=e.id WHERE substr(k.period,1,4)=?` + scope.sql;
  const p = [year].concat(scope.params);
  if (req.query.dept) { sql += ' AND (SELECT name FROM org_units o WHERE o.id=e.org_id)=?'; p.push(req.query.dept); }
  const rows = db.prepare(sql).all(...p);
  const byDept = {};
  const byPeriod = {};
  rows.forEach((x) => {
    const d = x.dept_name || '未分配';
    byDept[d] = byDept[d] || { dept: d, emps: 0, target: 0, collection: 0, sales: 0, completion: 0, score: 0, reached: 0 };
    const b = byDept[d];
    b.emps += 1; b.target += x.target_amount || 0; b.collection += x.collection_amount || 0; b.sales += x.sales_amount || 0;
    b.completion += x.completion_rate || 0; b.score += x.score || 0;
    if ((x.completion_rate || 0) >= 100) b.reached += 1;
    const m = byPeriod[x.period] = byPeriod[x.period] || { period: x.period, emps: 0, target: 0, collection: 0, completion: 0, score: 0 };
    m.emps += 1; m.target += x.target_amount || 0; m.collection += x.collection_amount || 0;
    m.completion += x.completion_rate || 0; m.score += x.score || 0;
  });
  const avg = (o) => {
    o.completion = round2(o.completion / Math.max(1, o.emps));
    o.score = round2(o.score / Math.max(1, o.emps));
    o.target = round2(o.target); o.collection = round2(o.collection);
    o.rate = o.target > 0 ? round2(o.collection / o.target * 100) : 0;
    return o;
  };
  const dist = [
    { label: '未达标(<60%)', n: rows.filter((x) => (x.completion_rate || 0) < 60).length },
    { label: '追赶(60~90%)', n: rows.filter((x) => (x.completion_rate || 0) >= 60 && (x.completion_rate || 0) < 90).length },
    { label: '接近(90~100%)', n: rows.filter((x) => (x.completion_rate || 0) >= 90 && (x.completion_rate || 0) < 100).length },
    { label: '达标(100~120%)', n: rows.filter((x) => (x.completion_rate || 0) >= 100 && (x.completion_rate || 0) < 120).length },
    { label: '超额(≥120%)', n: rows.filter((x) => (x.completion_rate || 0) >= 120).length },
  ];
  return res.json(ok({
    year,
    total: rows.length,
    byDept: Object.values(byDept).map(avg).sort((a, b) => b.collection - a.collection),
    byPeriod: Object.values(byPeriod).map(avg).sort((a, b) => String(a.period).localeCompare(String(b.period))),
    dist,
  }));
}

/* ==================== 批量生成（管理层） ==================== */
async function generate(req, res) {
  if (!isMgr(req.user)) return res.json(forbidden('仅管理层（总经理/副总/销售总监）可生成绩效'));
  const period = String((req.body || {}).period || '').trim();
  if (!YM_RE.test(period)) return res.json(bad('绩效月份须为 YYYY-MM 格式'));
  const emps = perfEmps();
  if (!emps.length) return res.json(bad('未找到在职的销售序列员工'));
  const upsert = db.prepare(`INSERT INTO kpi_records(emp_id,period,sales_amount,collection_amount,opp_entry_rate,target_amount,completion_rate,score,remark)
    VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(emp_id,period) DO UPDATE SET sales_amount=excluded.sales_amount, collection_amount=excluded.collection_amount,
      opp_entry_rate=excluded.opp_entry_rate, target_amount=excluded.target_amount,
      completion_rate=excluded.completion_rate, score=excluded.score, remark=excluded.remark`);
  const rows = [];
  for (const e of emps) {
    const collection = round2(monthCollection(e.id, period));
    const sales = round2(monthSign(e.id, period));
    const oppN = monthOpps(e.id, period);
    const target = round2(monthTarget(e.id, period));
    const completion = target > 0 ? Math.min(150, round2(collection / target * 100)) : (collection > 0 ? 100 : 0);
    const old = db.prepare('SELECT compliance_veto FROM kpi_records WHERE emp_id=? AND period=?').get(e.id, period);
    let score = Math.min(100, Math.round(completion * 0.7 + recentEval(e.id) * 0.3));
    if (old && old.compliance_veto === 1) score = 0; // 已一票否决的保留 0 分
    upsert.run(e.id, period, sales, collection, oppN, target, completion, score,
      `系统生成：签约${sales}万/回款${collection}万/新增商机${oppN}个`);
    rows.push({ emp_id: e.id, emp_no: e.emp_no, emp_name: e.name, dept_name: e.dept_name, collection_amount: collection, sales_amount: sales, target_amount: target, completion_rate: completion, score });
  }
  audit('生成绩效', req.userId, period, `${period} 销售序列绩效批量生成/刷新 ${rows.length} 人`);
  return res.json(ok({ period, total: rows.length, rows }, `${period} 绩效已生成 ${rows.length} 人`));
}

/* ==================== 详情 ==================== */
async function detail(req, res) {
  const row = db.prepare(`SELECT k.*, e.name emp_name, e.emp_no, e.role,
      (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM kpi_records k JOIN employees e ON k.emp_id=e.id WHERE k.id=?`).get(req.params.id);
  if (!row) return res.json(notfound('绩效记录不存在'));
  row.veto = row.compliance_veto === 1;
  return res.json(ok(row));
}

/* ==================== 人工调分（管理层） ==================== */
async function adjust(req, res) {
  if (!isMgr(req.user)) return res.json(forbidden('仅管理层（总经理/副总/销售总监）可调整绩效分'));
  const k = db.prepare('SELECT * FROM kpi_records WHERE id=?').get(req.params.id);
  if (!k) return res.json(notfound('绩效记录不存在'));
  const score = Number((req.body || {}).score);
  if (!(score >= 0 && score <= 150)) return res.json(bad('绩效得分须在 0~150 之间'));
  if (k.compliance_veto === 1) return res.json(bad('该记录已合规一票否决（0 分），请先撤销否决再调分'));
  const remark = String((req.body || {}).remark || '').slice(0, 200);
  db.prepare('UPDATE kpi_records SET score=?, remark=? WHERE id=?').run(round2(score), remark || k.remark || '', k.id);
  audit('调整绩效分', req.userId, k.period, `${k.period} 员工#${k.emp_id} 绩效分调整为 ${score}${remark ? '（' + remark + '）' : ''}`);
  return res.json(ok({ id: k.id, score: round2(score) }, `绩效分已调整为 ${score}`));
}

/* ==================== 合规一票否决 / 撤销 ==================== */
async function veto(req, res) {
  if (!isMgr(req.user)) return res.json(forbidden('仅管理层（总经理/副总/销售总监）可执行合规否决'));
  const k = db.prepare('SELECT * FROM kpi_records WHERE id=?').get(req.params.id);
  if (!k) return res.json(notfound('绩效记录不存在'));
  const b = req.body || {};
  if (b.revoke) {
    db.prepare('UPDATE kpi_records SET compliance_veto=0, veto_reason=NULL WHERE id=?').run(k.id);
    audit('撤销绩效否决', req.userId, k.period, `${k.period} 员工#${k.emp_id} 合规否决已撤销`);
    return res.json(ok(null, '否决已撤销，请重新生成或调分'));
  }
  const reason = String(b.reason || '').trim();
  if (!reason) return res.json(bad('请填写否决原因'));
  db.prepare('UPDATE kpi_records SET compliance_veto=1, veto_reason=?, score=0 WHERE id=?').run(reason.slice(0, 300), k.id);
  audit('绩效合规否决', req.userId, k.period, `${k.period} 员工#${k.emp_id} 合规一票否决：${reason}`);
  return res.json(ok({ veto: true }, '已一票否决，绩效分归零'));
}

/* ==================== 我的绩效 ==================== */
async function mine(req, res) {
  const emp = empOf(req.userId);
  if (!emp) return res.json(ok({ rows: [], latest: null }));
  const rows = db.prepare('SELECT * FROM kpi_records WHERE emp_id=? ORDER BY period DESC LIMIT 24').all(emp.id);
  return res.json(ok({ rows, latest: rows[0] || null }));
}

module.exports = { options, list, stats, generate, detail, adjust, veto, mine };
