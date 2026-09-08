/**
 * 经销商管理控制器（迁移自参考项目 routes/dms.js 的 /dms 段）
 * 对齐参考项目业务逻辑：
 *  - 新增经销商必须走准入审批：先落「草稿 / 准入评审中」，审批通过后生成正式编号并启用
 *  - 层级只允许 核心/普通/观察；准入状态 准入评审中/合格/暂停合作/淘汰
 *  - 准入评审五项（证照核验/质量体系/资金实力/渠道能力/合规审查）全部「通过」且均分 >= 85 → 准入合格
 *  - 周期考核：总分 = 达成率*0.4 + 信用分*0.3 + 渠道分*0.3；等级 90/80/60 分档；建议 维持/升级/降级/淘汰
 *  - 产品线授权：准入未合格不允许授权
 * 数据表：distributors / distributor_admissions / distributor_assessments / distributor_pls（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const auditLog = require('../utils/audit');

/** 经销商层级（排序：核心 → 普通 → 观察） */
const TIERS = ['核心', '普通', '观察'];
/** 经销商身份 */
const IDENTITIES = ['下游经销商', '省级代理', '地市级代理', '区域代理', '直销终端'];
/** 准入状态 */
const ADMISSION_STATUS = ['准入评审中', '合格', '暂停合作', '淘汰'];
/** 档案状态 */
const STATUS = ['启用', '草稿', '停用'];
/** 准入评审五项（固定顺序） */
const ADMISSION_ITEMS = ['证照核验', '质量体系', '资金实力', '渠道能力', '合规审查'];
/** 考核等级与建议 */
const GRADES = ['优秀', '良好', '合格', '不合格'];
/** 管理层：可执行建档审批/分级/淘汰等管控动作（对齐参考 requirePerm('dms',1)】 */
const MANAGE_ROLES = ['超级管理员', '总经理', '副总', '销售总监', '部门经理'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 当前登录用户对应的 employee 记录（users.emp_id 是工号，employees.emp_no 同值） */
function empOf(req) {
  try {
    const u = db.prepare('SELECT emp_id, name FROM users WHERE id = ?').get(req.userId);
    if (!u) return null;
    return db.prepare('SELECT * FROM employees WHERE emp_no = ? OR name = ?').get(u.emp_id || '', u.name) || null;
  } catch (e) {
    return null;
  }
}

/** 数据范围：对齐参考项目 dataScope（区域经理看本区域；经销商账号只看自己） */
function scopeOf(req) {
  const e = empOf(req);
  if (!e) return null;
  if (e.is_distributor && e.distributor_id) return { distributor_id: e.distributor_id };
  if (e.region) return { region: e.region };
  return null;
}

/** 经销商是否在调用方数据范围内 */
function viewable(req, d) {
  if (!d) return false;
  const scope = scopeOf(req);
  if (!scope) return true;
  if (scope.region) return d.region === scope.region;
  if (scope.distributor_id) return Number(d.id) === Number(scope.distributor_id);
  return true;
}

const canManage = (req) => MANAGE_ROLES.includes(req.user && req.user.role);

/** 枚举：供前端下拉使用，避免硬编码 */
async function meta(req, res) {
  return res.json(ok({
    tiers: TIERS,
    identities: IDENTITIES,
    admission_status: ADMISSION_STATUS,
    admission_items: ADMISSION_ITEMS,
    status: STATUS,
    grades: GRADES,
  }));
}

/** 档案列表：默认只显示已启用（对齐参考），带授权产品线数量 */
async function list(req, res) {
  const { tier, identity, admission_status, status, keyword } = req.query;
  let sql = `SELECT d.*,
      (SELECT COUNT(*) FROM distributor_pls p WHERE p.distributor_id = d.id AND p.status = '授权中') pl_count
    FROM distributors d WHERE 1 = 1`;
  const p = [];
  const st = status || '启用';
  if (st !== '全部') { sql += ' AND d.status = ?'; p.push(st); }
  if (tier) { sql += ' AND d.tier = ?'; p.push(tier); }
  if (identity) { sql += ' AND d.identity = ?'; p.push(identity); }
  if (admission_status) { sql += ' AND d.admission_status = ?'; p.push(admission_status); }
  if (keyword) { sql += ' AND (d.name LIKE ? OR d.code LIKE ? OR d.region LIKE ? OR d.contact_name LIKE ?)'; p.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  const scope = scopeOf(req);
  if (scope && scope.region) { sql += ' AND d.region = ?'; p.push(scope.region); }
  if (scope && scope.distributor_id) { sql += ' AND d.id = ?'; p.push(scope.distributor_id); }
  // 对齐参考项目排序：核心 → 普通 → 观察
  sql += " ORDER BY CASE d.tier WHEN '核心' THEN 1 WHEN '普通' THEN 2 ELSE 3 END, d.id DESC";
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 统计：总数 / 层级分布 / 准入状态分布 / 信用额度 */
async function stats(req, res) {
  const scope = scopeOf(req);
  const where = scope && scope.region ? ' WHERE region = ?' : (scope && scope.distributor_id ? ' WHERE id = ?' : '');
  const p = scope ? [scope.region || scope.distributor_id] : [];
  const total = db.prepare(`SELECT COUNT(*) c FROM distributors${where}`).get(...p).c;
  const tiers = TIERS.map((t) => ({
    tier: t,
    count: db.prepare(`SELECT COUNT(*) c FROM distributors${where}${where ? ' AND' : ' WHERE'} tier = ?`).get(...p, t).c,
  }));
  const admissions = ADMISSION_STATUS.map((s) => ({
    status: s,
    count: db.prepare(`SELECT COUNT(*) c FROM distributors${where}${where ? ' AND' : ' WHERE'} admission_status = ?`).get(...p, s).c,
  }));
  const credit = db.prepare(`SELECT COALESCE(SUM(credit_limit),0) limit_sum, COALESCE(SUM(credit_used),0) used_sum FROM distributors${where}`).get(...p);
  return res.json(ok({
    total,
    tiers,
    admissions,
    credit_limit: round2(credit.limit_sum),
    credit_used: round2(credit.used_sum),
    credit_usage: credit.limit_sum > 0 ? Math.round((credit.used_sum / credit.limit_sum) * 100) : 0,
  }));
}

/** 新增经销商：资料录入后为「草稿 / 准入评审中」，审批通过才正式建档 */
async function create(req, res) {
  const b = req.body || {};
  const { name, region, contact_name, contact_phone, license_no, credit_limit, identity } = b;
  if (!name || !region) return res.json(bad('经销商名称与所属大区必填'));
  const dup = db.prepare("SELECT id FROM distributors WHERE name = ? AND status IN ('启用','草稿')").get(name);
  if (dup) return res.json(bad(`经销商「${name}」已存在（含待审批草稿），请勿重复录入`));

  const iden = IDENTITIES.includes(identity) ? identity : '下游经销商';
  const tmpCode = 'TMP' + Date.now() + Math.floor(Math.random() * 90 + 10); // 草稿临时编号，审批通过后生成正式编号
  const info = db.prepare(`INSERT INTO distributors
      (code,name,tier,region,contact_name,contact_phone,license_no,credit_limit,admission_status,status,identity)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(tmpCode, name, '观察', region, contact_name || '', contact_phone || '',
      license_no || '', Number(credit_limit) || 0, '准入评审中', '草稿', iden);
  auditLog('DEALER_CREATE', req.userId, `经销商#${info.lastInsertRowid}`, `录入经销商 ${name}（${region}），待建档审批`);
  return res.json(ok({ id: info.lastInsertRowid, code: tmpCode, status: '草稿' }, '经销商资料已提交，审批通过后正式建档'));
}

/** 详情 */
async function detail(req, res) {
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  if (!viewable(req, d)) return res.json(forbidden('无权查看其他经销商/区域的档案'));
  const admissions = db.prepare('SELECT * FROM distributor_admissions WHERE distributor_id = ? ORDER BY id').all(d.id);
  const pls = db.prepare('SELECT * FROM distributor_pls WHERE distributor_id = ? ORDER BY id').all(d.id);
  const assessments = db.prepare('SELECT * FROM distributor_assessments WHERE distributor_id = ? ORDER BY id DESC').all(d.id);
  return res.json(ok({ ...d, admissions, pls, assessments }));
}

/** 编辑档案（联系人/证照/额度等；不在此处改层级与准入状态） */
async function update(req, res) {
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  if (!viewable(req, d)) return res.json(forbidden('无权修改其他经销商/区域的档案'));
  const b = req.body || {};
  db.prepare(`UPDATE distributors SET region=?, contact_name=?, contact_phone=?, license_no=?,
      credit_limit=?, identity=? WHERE id=?`)
    .run(b.region || d.region, b.contact_name ?? d.contact_name, b.contact_phone ?? d.contact_phone,
      b.license_no ?? d.license_no, b.credit_limit === undefined ? d.credit_limit : Number(b.credit_limit) || 0,
      IDENTITIES.includes(b.identity) ? b.identity : d.identity, d.id);
  auditLog('DEALER_UPDATE', req.userId, `经销商#${d.id}`, `更新档案 ${d.name}`);
  return res.json(ok(null, '档案已更新'));
}

/** 分级管理：核心 / 普通 / 观察 */
async function updateTier(req, res) {
  const { tier } = req.body || {};
  if (!TIERS.includes(tier)) return res.json(bad('分级须为 核心/普通/观察'));
  if (!canManage(req)) return res.json(forbidden('仅管理层可调整经销商分级'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  db.prepare('UPDATE distributors SET tier = ? WHERE id = ?').run(tier, d.id);
  auditLog('DEALER_TIER', req.userId, `经销商#${d.id}`, `${d.name} 分级调整为[${tier}]`);
  return res.json(ok({ tier }, `分级已调整为 ${tier}`));
}

/** 准入状态调整：准入评审中 / 合格 / 暂停合作 / 淘汰 */
async function updateAdmission(req, res) {
  const { admission_status } = req.body || {};
  if (!ADMISSION_STATUS.includes(admission_status)) return res.json(bad('准入状态非法'));
  if (!canManage(req)) return res.json(forbidden('仅管理层可调整准入状态'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  db.prepare('UPDATE distributors SET admission_status = ? WHERE id = ?').run(admission_status, d.id);
  auditLog('DEALER_ADMISSION', req.userId, `经销商#${d.id}`, `${d.name} 准入状态调整为[${admission_status}]`);
  return res.json(ok({ admission_status }, `准入状态已调整为 ${admission_status}`));
}

/** 建档审批通过：生成正式编号并启用（对齐参考 createApproval 通过后的正式建档） */
async function approve(req, res) {
  if (!canManage(req)) return res.json(forbidden('仅管理层可审批经销商建档'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  if (d.status === '启用') return res.json(bad('该经销商已正式建档'));
  const n = db.prepare("SELECT COUNT(*) c FROM distributors WHERE code NOT LIKE 'TMP%'").get().c + 1;
  const code = 'DIS' + new Date().getFullYear() + String(n).padStart(4, '0');
  db.prepare("UPDATE distributors SET code=?, status='启用' WHERE id=?").run(code, d.id);
  auditLog('DEALER_APPROVE', req.userId, `经销商#${d.id}`, `${d.name} 建档审批通过，正式编号 ${code}`);
  return res.json(ok({ code }, `建档审批通过，正式编号 ${code}`));
}

/** 停用（软删，保留历史档案与考核数据） */
async function remove(req, res) {
  if (!canManage(req)) return res.json(forbidden('仅管理层可停用经销商'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  db.prepare("UPDATE distributors SET status='停用' WHERE id=?").run(d.id);
  auditLog('DEALER_DISABLE', req.userId, `经销商#${d.id}`, `停用经销商 ${d.name}`);
  return res.json(ok(null, '经销商已停用'));
}

/** 准入评审记录 */
async function admissions(req, res) {
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!viewable(req, d)) return res.json(forbidden('无权查看其他经销商/区域的准入评审'));
  const rows = db.prepare(`SELECT a.*, e.name reviewer
    FROM distributor_admissions a LEFT JOIN employees e ON a.reviewer_id = e.id
    WHERE a.distributor_id = ? ORDER BY a.id`).all(req.params.id);
  return res.json(ok(rows));
}

/** 录入准入评审：五项全部「通过」且均分 >= 85 → 准入合格 */
async function addAdmission(req, res) {
  const { item, score, conclusion } = req.body || {};
  if (!item) return res.json(bad('评审项目必填'));
  if (!ADMISSION_ITEMS.includes(item)) return res.json(bad(`评审项目须为：${ADMISSION_ITEMS.join('/')}`));
  const s = Number(score) || 0;
  if (s < 0 || s > 100) return res.json(bad('评审得分须在 0-100 之间'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  if (!viewable(req, d)) return res.json(forbidden('无权为其他经销商/区域录入评审'));
  const emp = empOf(req);
  const ccl = conclusion || (s >= 85 ? '通过' : '待定');
  db.prepare('INSERT INTO distributor_admissions(distributor_id,item,score,conclusion,reviewer_id) VALUES(?,?,?,?,?)')
    .run(d.id, item, s, ccl, emp ? emp.id : null);
  auditLog('DEALER_ADMISSION_REVIEW', req.userId, `经销商#${d.id}`, `评审项[${item}] 得分${s} 结论${ccl}`);

  // 对齐参考：全部5项通过且均分 >= 85 → 合格
  const rows = db.prepare('SELECT item,score,conclusion FROM distributor_admissions WHERE distributor_id = ?').all(d.id);
  let passed = false;
  if (ADMISSION_ITEMS.every((i) => rows.some((x) => x.item === i && x.conclusion === '通过'))) {
    const avg = rows.reduce((sum, x) => sum + (Number(x.score) || 0), 0) / rows.length;
    if (avg >= 85) {
      db.prepare("UPDATE distributors SET admission_status='合格' WHERE id=?").run(d.id);
      auditLog('DEALER_ADMISSION_PASS', req.userId, `经销商#${d.id}`, `五项评审全部通过（均分${avg.toFixed(1)}），准入合格`);
      passed = true;
    }
  }
  return res.json(ok({ passed, admission_status: passed ? '合格' : d.admission_status },
    passed ? '五项评审全部通过且均分≥85，准入合格' : '评审已记录'));
}

/** 授权产品线列表 */
async function pls(req, res) {
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!viewable(req, d)) return res.json(forbidden('无权查看其他经销商/区域的产品线授权'));
  return res.json(ok(db.prepare('SELECT * FROM distributor_pls WHERE distributor_id = ? ORDER BY id').all(req.params.id)));
}

/** 授权产品线：准入未合格不允许授权（对齐参考） */
async function addPl(req, res) {
  const { product_line, auth_from, auth_to } = req.body || {};
  if (!product_line) return res.json(bad('产品线必填'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!d) return res.json(notfound('经销商不存在'));
  if (!viewable(req, d)) return res.json(forbidden('无权为其他经销商/区域授权产品线'));
  if (d.admission_status !== '合格') return res.json(bad('经销商准入未合格，不能授权产品线'));
  db.prepare(`INSERT INTO distributor_pls(distributor_id,product_line,auth_from,auth_to,status) VALUES(?,?,?,?,'授权中')
    ON CONFLICT(distributor_id,product_line) DO UPDATE SET auth_from=excluded.auth_from, auth_to=excluded.auth_to, status='授权中'`)
    .run(d.id, product_line, auth_from || '', auth_to || '');
  auditLog('DEALER_PL_GRANT', req.userId, `经销商#${d.id}`, `授权产品线[${product_line}]`);
  return res.json(ok(null, `已授权产品线 ${product_line}`));
}

/** 产品线授权调整：起止日期与状态（授权中/暂停/终止） */
async function updatePl(req, res) {
  const { auth_from, auth_to, status } = req.body || {};
  const pl = db.prepare('SELECT * FROM distributor_pls WHERE id = ?').get(req.params.plId);
  if (!pl) return res.json(notfound('授权记录不存在'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(pl.distributor_id);
  if (!viewable(req, d)) return res.json(forbidden('无权调整其他经销商/区域的授权'));
  const st = ['授权中', '暂停', '终止'].includes(status) ? status : pl.status;
  db.prepare('UPDATE distributor_pls SET auth_from=?, auth_to=?, status=? WHERE id=?')
    .run(auth_from ?? pl.auth_from, auth_to ?? pl.auth_to, st, pl.id);
  auditLog('DEALER_PL_UPDATE', req.userId, `经销商#${pl.distributor_id}`, `授权[${pl.product_line}] 状态${st}`);
  return res.json(ok(null, '授权已更新'));
}

/** 考核台账 */
async function assessments(req, res) {
  const { distributor_id, period } = req.query;
  let sql = `SELECT a.*, d.name distributor_name, d.tier, d.region
    FROM distributor_assessments a LEFT JOIN distributors d ON a.distributor_id = d.id WHERE 1=1`;
  const p = [];
  if (distributor_id) { sql += ' AND a.distributor_id = ?'; p.push(distributor_id); }
  if (period) { sql += ' AND a.period = ?'; p.push(period); }
  const scope = scopeOf(req);
  if (scope && scope.region) { sql += ' AND d.region = ?'; p.push(scope.region); }
  if (scope && scope.distributor_id) { sql += ' AND a.distributor_id = ?'; p.push(scope.distributor_id); }
  sql += ' ORDER BY a.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 录入考核：总分 = 达成率*0.4 + 信用分*0.3 + 渠道分*0.3；等级与升降级建议自动判定 */
async function addAssessment(req, res) {
  const b = req.body || {};
  const { distributor_id, period, sales_amount, task_rate, credit_score, channel_score } = b;
  if (!distributor_id || !period) return res.json(bad('经销商与考核周期必填'));
  const d = db.prepare('SELECT * FROM distributors WHERE id = ?').get(distributor_id);
  if (!d) return res.json(notfound('经销商不存在'));
  if (!viewable(req, d)) return res.json(forbidden('无权为其他经销商/区域录入考核'));

  const total = (Number(task_rate) || 0) * 0.4 + (Number(credit_score) || 0) * 0.3 + (Number(channel_score) || 0) * 0.3;
  const grade = total >= 90 ? '优秀' : total >= 80 ? '良好' : total >= 60 ? '合格' : '不合格';
  // 建议：优秀且非核心 → 建议升级；不合格 → 核心降级、其余淘汰
  let sug = '维持';
  if (grade === '优秀' && d.tier !== '核心') sug = '建议升级';
  if (grade === '不合格') sug = d.tier === '核心' ? '建议降级' : '建议淘汰';

  const info = db.prepare(`INSERT INTO distributor_assessments
      (distributor_id,period,sales_amount,task_rate,credit_score,channel_score,total_score,grade,suggestion)
      VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(distributor_id, period, Number(sales_amount) || 0, Number(task_rate) || 0,
      Number(credit_score) || 0, Number(channel_score) || 0, round2(total), grade, sug);
  auditLog('DEALER_ASSESS', req.userId, `经销商#${distributor_id}`, `${period} 考核：${grade}（${total.toFixed(1)}分）`);
  return res.json(ok({ id: info.lastInsertRowid, total_score: round2(total), grade, suggestion: sug },
    `考核已录入：${grade}`));
}

module.exports = {
  meta, list, stats, create, detail, update, updateTier, updateAdmission, approve, remove,
  admissions, addAdmission, pls, addPl, updatePl, assessments, addAssessment,
  TIERS, IDENTITIES, ADMISSION_STATUS, ADMISSION_ITEMS,
};
