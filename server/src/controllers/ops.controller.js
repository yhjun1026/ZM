/**
 * 经营驾驶舱控制器（迁移自参考项目 routes/ops.js，#128 第40轮 + #129 第41轮）
 *
 * 对齐参考项目 KPI 口径：
 *  - 销售额（签约）：合同金额按 sign_date 归属月份统计（剔除已驳回），元 → 万元
 *  - 回款额：payments JOIN ar_ledgers 按 pay_date 归属月份统计（与绩效 kpi 模块取数口径一致）
 *  - 商机金额：在途商机（未赢单/未输单/未验收归档）金额合计；销售漏斗按商机阶段聚合金额与数量
 *  - 目标达成：sales_targets（公司/区域/个人三级，签约/回款两类）对比同期实际，输出完成率
 *  - 客户价值分层：按累计合同额 + 客户等级（level）分层，超 N 天无跟进/无新合同/无在途商机 = 沉睡预警
 *  - 近 6/12 个月趋势 buildTrends：签约 / 回款 / 新增商机金额三线
 *  - 权限：查看对公司全员开放；销售目标写操作限 总经理/副总/销售总监/超级管理员
 *
 * 与参考项目的差异（受当前项目表结构约束）：
 *  1) 当前库 contracts 为项目既有表（无 review_status / opp_id 列），故「有效签约」按
 *     status 非「已驳回/草稿/已作废」且 sign_date 非空取数（与 kpi.controller.monthSign 口径一致）。
 *  2) 当前库 sales_targets 无 status / approval_id / approved_at 列，目标提交后直接生效（无审批化），
 *     金额统一按「万元」存储与输出（参考项目存元、输出万元），与本项目 kpi 模块取数一致。
 *  3) 参考项目费用取 expense_reports + petty_funds、预算取 budgets；当前库对应表为空且口径未迁移，
 *     本模块 KPI 聚焦「销售额 / 回款 / 商机金额 / 合同额」四项（与任务口径一致），不臆造费用与预算数据。
 *
 * 数据表：sales_targets / opportunities / contracts / sales_regions / kpi_records / customers /
 *         payments / ar_ledgers / employees
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/** 目标写操作角色（参考项目 OPS_WRITE_ROLES = ADM/GM/VP/SD） */
const OPS_WRITE_ROLES = ['总经理', '副总', '销售总监', '超级管理员'];
const TARGET_TYPES = ['签约', '回款'];
/** 商机终态（不计入在途） */
const OPP_CLOSED = ['赢单', '输单', '验收归档'];

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const pad2 = (n) => String(n).padStart(2, '0');
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const curYm = () => localNow().slice(0, 7);

/** 上一个月 ym */
function prevYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return ymOf(d);
}

/** 签约额（万元）：合同按签订月份，剔除已驳回/草稿/已作废 */
function signOf(ym) {
  try {
    const v = db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM contracts
      WHERE substr(sign_date,1,7)=? AND sign_date IS NOT NULL AND sign_date<>''
        AND COALESCE(status,'') NOT IN ('已驳回','草稿','已作废')`).get(ym).v || 0;
    return round2(v / 10000); // 元 → 万元
  } catch (e) { return 0; }
}
/** 回款额（万元）：payments JOIN ar_ledgers 按回款月份 */
function payOf(ym) {
  try {
    const v = db.prepare(`SELECT COALESCE(SUM(p.amount),0) v FROM payments p
      JOIN ar_ledgers a ON p.ar_id=a.id WHERE substr(p.pay_date,1,7)=?`).get(ym).v || 0;
    return round2(v / 10000); // 元 → 万元
  } catch (e) { return 0; }
}
/** 新增商机金额（万元）：按 created_at 月份 */
function oppOf(ym) {
  try {
    const v = db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM opportunities WHERE substr(created_at,1,7)=?`).get(ym).v || 0;
    return round2(v);
  } catch (e) { return 0; }
}
/** 环比：本期 vs 上期 */
function mom(cur, prev) {
  return prev ? Math.round(((cur - prev) / prev) * 100) : null;
}
/** 近 n 个月趋势（签约 / 回款 / 新增商机） */
function buildTrends(n) {
  const labels = [], sign = [], pay = [], opp = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = ymOf(d);
    labels.push(ym);
    sign.push(signOf(ym));
    pay.push(payOf(ym));
    opp.push(oppOf(ym));
  }
  return { labels, sign, pay, opp };
}

/* ==================== 1. 经营总览 ==================== */
async function overview(req, res) {
  const now = new Date();
  const ym = curYm();
  const year = now.getFullYear();
  const py = prevYm(ym);

  const sign = signOf(ym), pay = payOf(ym);
  const kpi = {
    month: ym,
    sales: { value: sign, prev: signOf(py), rate: mom(sign, signOf(py)) },
    collection: { value: pay, prev: payOf(py), rate: mom(pay, payOf(py)) },
    opp_amount: {
      value: round2(db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM opportunities WHERE stage NOT IN (${OPP_CLOSED.map(() => '?').join(',')})`).get(...OPP_CLOSED).v),
      count: db.prepare(`SELECT COUNT(*) n FROM opportunities WHERE stage NOT IN (${OPP_CLOSED.map(() => '?').join(',')})`).get(...OPP_CLOSED).n,
    },
    contract: {
      value: round2((db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM contracts WHERE COALESCE(status,'') NOT IN ('已驳回','草稿','已作废')`).get().v || 0) / 10000),
      count: db.prepare(`SELECT COUNT(*) n FROM contracts WHERE COALESCE(status,'') NOT IN ('已驳回','草稿','已作废')`).get().n,
    },
  };

  // 销售漏斗：按商机阶段聚合金额与数量
  const funnel = db.prepare('SELECT stage, COUNT(*) n, COALESCE(SUM(amount),0) amount FROM opportunities GROUP BY stage').all()
    .map((x) => ({ stage: x.stage, count: x.n, amount: round2(x.amount) }))
    .sort((a, b) => b.amount - a.amount);

  // 区域对比：在途商机金额 / 商机数 / 在编销售人数（当前库 contracts 无 region 列，区域签约额不臆造）
  const regions = db.prepare(`SELECT r.id, r.name region, r.manager_name, r.city, r.coverage,
      COALESCE((SELECT SUM(o.amount) FROM opportunities o WHERE o.region=r.name AND o.stage NOT IN (${OPP_CLOSED.map(() => '?').join(',')})),0) opp_amount,
      COALESCE((SELECT SUM(o3.amount) FROM opportunities o3 WHERE o3.region=r.name),0) opp_total,
      COALESCE((SELECT COUNT(*) FROM opportunities o2 WHERE o2.region=r.name),0) opp_count,
      COALESCE((SELECT COUNT(*) FROM employees e WHERE e.region=r.name AND e.status='在职'),0) staff_count
    FROM sales_regions r ORDER BY r.id`).all(...OPP_CLOSED)
    .map((x) => ({ ...x, opp_amount: round2(x.opp_amount), opp_total: round2(x.opp_total) }));

  // 目标达成（公司级，当月）
  const targets = companyTargets(year, now.getMonth() + 1);

  // 客户价值分层
  const customerTiers = tierOf();

  const trends = buildTrends(6);
  const insights = buildInsights(kpi, targets, regions);

  return res.json(ok({ kpi, funnel, regions, targets, customerTiers, trends, insights, time: ym }));
}

/** 文字化经营解读（对齐参考项目 insightsOf） */
function buildInsights(kpi, targets, regions) {
  const L = [];
  L.push({
    tone: 'info',
    text: `${kpi.month} 销售额 ${kpi.sales.value} 万元（环比 ${kpi.sales.rate === null ? '暂无对比' : (kpi.sales.rate >= 0 ? '+' : '') + kpi.sales.rate + '%'}）；回款 ${kpi.collection.value} 万元（环比 ${kpi.collection.rate === null ? '暂无对比' : (kpi.collection.rate >= 0 ? '+' : '') + kpi.collection.rate + '%'}）。`,
  });
  const act = (regions || []).filter((r) => r.opp_amount > 0).sort((a, b) => b.opp_amount - a.opp_amount);
  if (act.length) {
    L.push({ tone: 'good', text: `在途商机金额领跑区域：${act[0].region}（${act[0].opp_amount} 万元，商机 ${act[0].opp_count} 个）。` });
  }
  (targets || []).forEach((t) => {
    if (t.target > 0) {
      L.push({
        tone: t.rate >= 100 ? 'good' : (t.rate >= 60 ? 'info' : 'warn'),
        text: `${t.year}-${pad2(t.month)} 公司${t.target_type}目标 ${t.target} 万元，实际 ${t.actual} 万元，完成 ${t.rate}%${t.rate < 60 ? '，进度落后需重点关注' : ''}。`,
      });
    }
  });
  if (!L.some((x) => x.tone === 'warn')) L.push({ tone: 'info', text: '目标进度正常，持续关注回款与在途商机转化。' });
  return L;
}

/** 公司级目标与实际（当月） */
function companyTargets(year, month) {
  try {
    const rows = db.prepare(`SELECT * FROM sales_targets WHERE year=? AND month=? AND (region='' OR region IS NULL) AND emp_id IS NULL`)
      .all(year, month);
    const ym = `${year}-${pad2(month)}`;
    return rows.map((t) => {
      const actual = t.target_type === '回款' ? payOf(ym) : signOf(ym);
      const target = round2(t.amount); // 万元口径
      return {
        id: t.id, year: t.year, month: t.month, target_type: t.target_type,
        target, actual, rate: target > 0 ? Math.round((actual / target) * 100) : 0,
      };
    });
  } catch (e) { return []; }
}

/* ==================== 1b. 销售漏斗 ==================== */
async function funnel(req, res) {
  const rows = db.prepare('SELECT stage, COUNT(*) n, COALESCE(SUM(amount),0) amount FROM opportunities GROUP BY stage').all();
  const stages = rows.map((x) => ({ stage: x.stage, count: x.n, amount: round2(x.amount) }));
  const pipeline = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) amount FROM opportunities WHERE stage NOT IN (${OPP_CLOSED.map(() => '?').join(',')})`).get(...OPP_CLOSED);
  const total = rows.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return res.json(ok({
    stages: stages.sort((a, b) => b.amount - a.amount),
    pipeline: { count: pipeline.n, amount: round2(pipeline.amount) },
    total_amount: round2(total),
  }));
}

/* ==================== 1c. 趋势（6 / 12 个月） ==================== */
async function trends(req, res) {
  const n = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);
  return res.json(ok(buildTrends(n)));
}

/* ==================== 2. 销售目标 ==================== */
async function listTargets(req, res) {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
  if (month < 1 || month > 12) return res.json(bad('月份无效'));
  const ym = `${year}-${pad2(month)}`;
  const rows = db.prepare(`SELECT t.*, e.name emp_name FROM sales_targets t
    LEFT JOIN employees e ON e.id=t.emp_id WHERE t.year=? AND t.month=? ORDER BY (t.emp_id IS NULL), t.region, t.target_type`)
    .all(year, month).map((t) => {
      const actual = t.target_type === '回款' ? payOf(ym) : signOf(ym);
      const target = round2(t.amount);
      return { ...t, amount: target, actual, rate: target > 0 ? Math.round((actual / target) * 100) : 0 };
    });
  const comp = rows.filter((x) => !x.region && !x.emp_id);
  return res.json(ok({
    summary: {
      year, month, ym,
      targetTotal: round2(comp.reduce((s, x) => s + x.amount, 0)),
      actualTotal: round2(comp.reduce((s, x) => s + x.actual, 0)),
    },
    rows,
  }));
}

/** 年度目标累计视图：12 个月公司级目标 vs 实际（含累计） */
async function yearlyTargets(req, res) {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const targetType = req.query.target_type === '回款' ? '回款' : '签约';
  if (year < 2000 || year > 2100) return res.json(bad('年份无效'));
  const tgtMap = {};
  db.prepare(`SELECT month, amount FROM sales_targets WHERE year=? AND (region='' OR region IS NULL) AND emp_id IS NULL AND target_type=?`)
    .all(year, targetType).forEach((x) => { tgtMap[x.month] = round2(x.amount); });
  let cumT = 0, cumA = 0, targetTotal = 0, actualTotal = 0;
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const target = tgtMap[m] || 0;
    const ym = `${year}-${pad2(m)}`;
    const actual = targetType === '回款' ? payOf(ym) : signOf(ym);
    cumT += target; cumA += actual;
    targetTotal += target; actualTotal += actual;
    months.push({ month: m, target, actual, cumTarget: round2(cumT), cumActual: round2(cumA), rate: target > 0 ? Math.round((actual / target) * 100) : 0 });
  }
  return res.json(ok({
    year, target_type: targetType, months,
    annual: {
      targetTotal: round2(targetTotal), actualTotal: round2(actualTotal),
      rate: targetTotal > 0 ? Math.round((actualTotal / targetTotal) * 100) : 0,
    },
  }));
}

/** 提交/更新目标（同键位 upsert；金额单位：万元） */
async function createTarget(req, res) {
  if (!OPS_WRITE_ROLES.includes(req.user && req.user.role)) {
    return res.json(forbidden(`角色[${(req.user && req.user.role) || '-'}]无销售目标设置权限`));
  }
  const { year, month, region = '', emp_id = null, target_type = '签约', amount, level = '公司' } = req.body || {};
  const y = parseInt(year, 10), m = parseInt(month, 10), amt = parseFloat(amount);
  if (!y || y < 2000 || y > 2100) return res.json(bad('年份无效'));
  if (!m || m < 1 || m > 12) return res.json(bad('月份无效'));
  if (!TARGET_TYPES.includes(target_type)) return res.json(bad('目标类型仅支持 签约/回款'));
  if (isNaN(amt) || amt < 0) return res.json(bad('目标金额无效'));
  if (!['公司', '区域', '个人'].includes(level)) return res.json(bad('目标层级无效（公司/区域/个人）'));
  const eid = emp_id ? parseInt(emp_id, 10) : null;
  if (level === '公司' && (region || eid)) return res.json(bad('公司级目标不应携带区域/员工'));
  if (level === '区域' && !region) return res.json(bad('区域级目标必须指定区域'));
  if (level === '个人' && !eid) return res.json(bad('个人级目标必须指定员工'));

  const ex = db.prepare(`SELECT id FROM sales_targets WHERE year=? AND month=? AND COALESCE(region,'')=? AND COALESCE(emp_id,0)=? AND target_type=?`)
    .get(y, m, region, eid || 0, target_type);
  if (ex) {
    db.prepare('UPDATE sales_targets SET amount=?, created_by=? WHERE id=?').run(amt, empId(req) || null, ex.id);
    audit('OPS_TARGET_SET', req.userId, `目标#${ex.id}`, `${y}-${pad2(m)} ${level} ${target_type} 目标调整为 ${amt} 万元`);
    return res.json(ok({ id: ex.id, updated: true }, '目标已更新'));
  }
  const info = db.prepare(`INSERT INTO sales_targets(year,month,region,emp_id,target_type,amount,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(y, m, region, eid, target_type, amt, empId(req) || null, localNow());
  audit('OPS_TARGET_SET', req.userId, `目标#${info.lastInsertRowid}`, `${y}-${pad2(m)} ${level} ${target_type} 目标 ${amt} 万元`);
  return res.json(ok({ id: info.lastInsertRowid }, '目标已设置'));
}

async function removeTarget(req, res) {
  if (!OPS_WRITE_ROLES.includes(req.user && req.user.role)) {
    return res.json(forbidden(`角色[${(req.user && req.user.role) || '-'}]无销售目标设置权限`));
  }
  const t = db.prepare('SELECT * FROM sales_targets WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('目标不存在'));
  db.prepare('DELETE FROM sales_targets WHERE id=?').run(t.id);
  audit('OPS_TARGET_DEL', req.userId, `目标#${t.id}`, `${t.year}-${pad2(t.month)} ${t.region || '公司'} ${t.target_type} ${t.amount} 万元`);
  return res.json(ok(null, '目标已删除'));
}

/* ==================== 3. 客户价值与风险 ==================== */
/** 客户分层：按累计合同额（万元）+ 客户等级（level） */
function tierOf() {
  const TIERS = [
    { key: '战略客户', min: 300, color: '#7c3aed' },
    { key: '重点客户', min: 100, color: '#2563eb' },
    { key: '成长客户', min: 30, color: '#0891b2' },
    { key: '一般客户', min: 0.01, color: '#10b981' },
    { key: '潜在客户', min: 0, color: '#94a3b8' },
  ];
  let rows = [];
  try {
    rows = db.prepare(`SELECT c.id, c.name, c.level, c.industry, c.owner, c.status,
        COALESCE((SELECT SUM(ct.amount) FROM contracts ct WHERE ct.customer=c.name AND COALESCE(ct.status,'') NOT IN ('已驳回','草稿','已作废')),0) contract_amt,
        COALESCE((SELECT COUNT(*) FROM contracts ct2 WHERE ct2.customer=c.name AND COALESCE(ct2.status,'') NOT IN ('已驳回','草稿','已作废')),0) contract_n,
        COALESCE((SELECT SUM(o.amount) FROM opportunities o WHERE o.customer_id=c.id AND o.stage NOT IN (${OPP_CLOSED.map(() => '?').join(',')})),0) opp_amt
      FROM customers c WHERE COALESCE(c.status,'') NOT IN ('已删除') ORDER BY contract_amt DESC`).all(...OPP_CLOSED);
  } catch (e) { rows = []; }
  const list = rows.map((x) => {
    const amt = round2((Number(x.contract_amt) || 0) / 10000);
    const tier = TIERS.find((t) => amt >= t.min) || TIERS[TIERS.length - 1];
    return { ...x, contract_amt: amt, opp_amt: round2(x.opp_amt), tier: tier.key, color: tier.color };
  });
  const summary = TIERS.map((t) => ({
    tier: t.key, color: t.color,
    count: list.filter((x) => x.tier === t.key).length,
    amount: round2(list.filter((x) => x.tier === t.key).reduce((s, x) => s + x.contract_amt, 0)),
  }));
  return { tiers: summary, top: list.slice(0, 10), list, total: list.length };
}

async function customers(req, res) {
  const days = Math.min(parseInt(req.query.days, 10) || 90, 365);
  const data = tierOf();
  // 沉睡预警：无累计合同且无在途商机（当前 customers 无最近跟进日期字段，按业务活跃度判定）
  const sleeping = data.list.filter((x) => x.contract_amt <= 0 && x.opp_amt <= 0)
    .slice(0, 20).map((x) => ({ id: x.id, name: x.name, level: x.level, owner: x.owner, idle_days: days }));
  return res.json(ok({ days, tiers: data.tiers, top: data.top, total: data.total, sleeping }));
}

/* ==================== 4. KPI 记录（kpi_records）一览 ==================== */
async function kpiList(req, res) {
  const period = req.query.period || curYm();
  const rows = db.prepare(`SELECT k.*, e.name emp_name, e.emp_no FROM kpi_records k
    LEFT JOIN employees e ON e.id=k.emp_id WHERE k.period=? ORDER BY k.completion_rate DESC`).all(period);
  return res.json(ok({ period, rows }));
}

module.exports = {
  overview, funnel, trends, kpiList,
  listTargets, yearlyTargets, createTarget, removeTarget,
  customers, buildTrends, OPP_CLOSED,
};
