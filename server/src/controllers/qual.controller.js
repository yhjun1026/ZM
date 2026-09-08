/**
 * 资质合规控制器（迁移自参考项目 routes/qual.js）
 * 对齐参考项目业务逻辑：
 *  - 到期预警引擎：按 expire_date 与 warn_days 动态分级（已过期 / 紧急≤30天 / 预警≤warn_days(默认90) / 正常）
 *  - 证照类型必须与其资料归属（公司资质/厂家资料/供应商资料/客户资料）匹配
 *  - 资质登记与续证须走审批链，审批通过后入册生效；在途审批不允许重复发起
 *  - 主体资质核验：营业执照经营范围 vs 申报业务范围 双向包含比对，输出覆盖率/匹配状态/风险等级
 * 数据表：qualifications / qual_verify / qual_renewal_pending（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目库表与角色体系约束，已在下方逐处注明）：
 *  1) 009 迁移的 qualifications 无 data_side 列 → 资料归属由 category 反查（CATEGORY_SIDE）动态派生，
 *     前端级联下拉与归属分布统计保持与参考项目一致；
 *  2) 009 迁移的 qualifications 无 last_warn_at / warn_count 列 → 预警推送不做「按天去重计数」，
 *     改为每次触发都产生一条待办/站内信，由接收人自行处理（messages 表落痕）；
 *  3) 参考项目资质编辑仅市场部（MKT），当前项目 users.role 为中文且无「市场部」角色，
 *     故按 dept==='市场部' + 管理层（总经理/副总/超级管理员）判定。
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量（对齐参考项目 qual.js） ==================== */
// 资料归属（区分明确）
const QUAL_SIDES = ['公司资质', '厂家资料', '供应商资料', '客户资料'];
// 每类归属下的具体资料类型
const SIDE_CATEGORIES = {
  公司资质: ['营业执照', '医疗器械经营许可证', '质量管理体系认证', '其他'],
  厂家资料: ['厂家营业执照', '厂家生产许可证', '产品注册证', '厂家授权书', 'CE认证', 'ISO13485', '自由销售证书', '其他'],
  供应商资料: ['供应商营业执照', '供应商经营许可证', '供应商授权书', '质量保证协议', '检验报告', '其他'],
  客户资料: ['客户营业执照', '医疗机构执业许可证', '客户开票资料', '客户资质备案', '其他'],
};
// 类型 → 归属（反查表，替代不存在的 data_side 列）
const CATEGORY_SIDE = {};
Object.entries(SIDE_CATEGORIES).forEach(([side, list]) => list.forEach((c) => {
  // 『其他』在四类下重名，优先保留首次登记（公司资质）
  if (!CATEGORY_SIDE[c]) CATEGORY_SIDE[c] = side;
}));
const sideOf = (category) => CATEGORY_SIDE[category] || '公司资质';

// 资质登记审批链（参考项目：市场部负责人 → 销售总监 → 质量负责人 → 副总 → 总经理）
const QUAL_CHAIN = ['市场部负责人', '销售总监', '质量负责人', '副总', '总经理'];
// 可维护资质的部门/角色
const MGMT_ROLES = ['总经理', '副总', '超级管理员'];

// 主营体核验：类型 → 档案表（当前项目仅 suppliers 有 business_scope 字段）
const VERIFY_TABLES = { supplier: 'suppliers', factory: 'factories', channel: 'channels', distributor: 'distributors' };
const VERIFY_TYPES = { supplier: '供应商', factory: '厂家', channel: '渠道商', distributor: '经销商' };

/* ==================== 工具函数 ==================== */
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const ts = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

/** 到期预警引擎：返回 { level, days_left }（对齐参考项目 warnLevel） */
function warnLevel(row, today) {
  if (!row.expire_date) return { level: '正常', days_left: null };
  const days = Math.ceil(
    (new Date(String(row.expire_date).slice(0, 10) + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
  );
  if (days < 0) return { level: '已过期', days_left: days };
  if (days <= 30) return { level: '紧急', days_left: days };
  if (days <= (Number(row.warn_days) || 90)) return { level: '预警', days_left: days };
  return { level: '正常', days_left: days };
}

/**  decorate：附加资料归属与预警分级 */
function decorate(row, today) {
  return { ...row, data_side: sideOf(row.category), ...warnLevel(row, today) };
}

/** 权限：市场部 + 管理层可维护资质台账（对齐参考项目 requireMkt） */
function canEdit(user) {
  return !!user && (user.dept === '市场部' || MGMT_ROLES.includes(user.role));
}

/** 创建审批单 + 审批步骤（当前项目 approvals / approval_steps 表） */
function createApproval(user, type, title, refId, amount, chain) {
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  const approvalNo = 'AP' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(n).padStart(4, '0');
  const info = db.prepare(`INSERT INTO approvals
    (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, type, title, refId || 0, Number(amount) || 0,
      Number(user.id) || 0, user.name || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/* ==================== 经营范围比对引擎（对齐参考项目 lib.qualVerify） ==================== */
function splitScope(text) {
  if (!text) return [];
  return String(text)
    .replace(/（/g, '(').replace(/）/g, ')')
    .split(/[;；,，、/|]+/)
    .map((s) => s.trim().replace(/^\([^)]*\)\s*/, '').replace(/^经营范围[:：]?\s*/, '').trim())
    .filter((s) => s && s.length >= 2 && !/^(含|包括|不含|经营|服务|销售|生产|批发|零售|许可项目|一般项目)$/.test(s));
}
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
// 身份/分类停用词：type 多为身份标识，不参与经营范围比对，避免「设备厂家/区域代理」误报缺失
const ID_STOP = ['设备厂家', '耗材厂家', '试剂厂家', '服务商', '其他', '区域代理', '省级代理', '地市级代理',
  '分销商', '线上渠道', '上游供应商', '下游经销商', 'OEM厂家', 'OEM厂商', '代工厂', '授权合作厂',
  '原材料商', '直销终端', '品牌厂家', '综合', '一类', '二类', '三类'];

function qualVerify(unit) {
  const res = { matched: [], missing: [], coverage: 0, status: '未核验', risk: '低' };
  try {
    const scopeText = (unit.business_scope || '').trim();
    if (!scopeText) return res;
    const reqRaw = [unit.product_spec, unit.type, unit.category].filter(Boolean).join('|');
    const reqItems = [...new Set(splitScope(reqRaw)
      .map((s) => s.replace(/^供应|^生产|^销售|^代理|^经营/, '').trim())
      .filter((s) => s.length >= 2 && !ID_STOP.includes(s)))];
    if (!reqItems.length) {
      res.matched = splitScope(scopeText);
      res.coverage = 100;
      return res;
    }
    const scopeItems = splitScope(scopeText);
    const scopeNorm = norm(scopeText);
    reqItems.forEach((req) => {
      const rn = norm(req);
      const hit = scopeItems.some((s) => {
        const sn = norm(s);
        return sn && (sn.includes(rn) || rn.includes(sn));
      }) || (rn && scopeNorm.includes(rn));
      if (hit) res.matched.push(req); else res.missing.push(req);
    });
    res.coverage = Math.round((res.matched.length / reqItems.length) * 100);
    res.status = res.missing.length === 0 ? '完全匹配' : (res.coverage >= 60 ? '部分匹配' : '不匹配');
    res.risk = res.missing.length === 0 ? '低' : (res.coverage >= 60 ? '中' : '高');
  } catch (e) { /* 核验失败降级为未核验 */ }
  return res;
}

/** 执行核验并落库 qual_verify（对齐参考项目 lib.runQualVerify） */
function runQualVerify(user, unit) {
  const r = qualVerify(unit);
  const no = 'QV' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + Math.floor(Math.random() * 900 + 100);
  const info = db.prepare(`INSERT INTO qual_verify
    (verify_no,data_type,ref_id,unit_name,credit_code,license_no,category,required_scope,scope_text,
     matched_items,missing_items,coverage,match_status,risk_level,verifier_id,verifier_name,verify_date,remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, unit.data_type, unit.id, unit.name, unit.credit_code || '', unit.license_no || '',
      [unit.type, unit.category].filter(Boolean).join('/') || '',
      [unit.product_spec, unit.type, unit.category].filter(Boolean).join('|') || '',
      unit.business_scope || '', JSON.stringify(r.matched), JSON.stringify(r.missing),
      r.coverage, r.status, r.risk, Number(user && user.id) || null, (user && user.name) || '系统',
      new Date().toISOString().slice(0, 10), unit.remark || '');
  return { id: info.lastInsertRowid, verify_no: no, ...r };
}

/** 按当前项目档案表实际字段加载核验主体 */
function loadUnit(dataType, id) {
  const tbl = VERIFY_TABLES[dataType];
  if (!tbl) return null;
  const row = db.prepare(`SELECT * FROM ${tbl} WHERE id=?`).get(id);
  if (!row) return null;
  // 当前项目 suppliers 无 product_spec，用 products 代替；其余表无 business_scope 时返回空串（引擎降级为未核验）
  return {
    data_type: dataType,
    id: row.id,
    name: row.name,
    type: row.type || '',
    category: row.category || '',
    product_spec: row.product_spec || row.products || '',
    credit_code: row.credit_code || '',
    license_no: row.license_no || '',
    business_scope: row.business_scope || '',
  };
}

function parseItems(row) {
  const out = { ...row };
  try { out.matched = JSON.parse(row.matched_items || '[]'); } catch (e) { out.matched = []; }
  try { out.missing = JSON.parse(row.missing_items || '[]'); } catch (e) { out.missing = []; }
  delete out.matched_items;
  delete out.missing_items;
  return out;
}

/* ==================== 1. 枚举元数据 ==================== */
async function meta(req, res) {
  return res.json(ok({
    sides: QUAL_SIDES,
    sideCategories: SIDE_CATEGORIES,
    categories: Object.keys(CATEGORY_SIDE),
    levels: ['已过期', '紧急', '预警', '正常'],
    statuses: ['有效', '审批中', '续证中', '驳回'],
    verify_types: VERIFY_TYPES,
    chain: QUAL_CHAIN,
  }));
}

/* ==================== 2. 资质台账列表 ==================== */
async function list(req, res) {
  const { category, level, side, status, keyword } = req.query;
  let sql = 'SELECT * FROM qualifications WHERE 1=1';
  const p = [];
  if (category) { sql += ' AND category=?'; p.push(category); }
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (keyword) { sql += ' AND (name LIKE ? OR qual_no LIKE ? OR cert_no LIKE ? OR issuer LIKE ?)'; p.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY expire_date ASC';
  const t = todayStr();
  let rows = db.prepare(sql).all(...p).map((x) => decorate(x, t));
  if (side) rows = rows.filter((x) => x.data_side === side);
  if (level) rows = rows.filter((x) => x.level === level);
  return res.json(ok(rows));
}

/* ==================== 3. 合规看板统计 ==================== */
async function stats(req, res) {
  // 在册资质：有效 / 续证中 / 审批中（驳回不入册）
  const rows = db.prepare("SELECT * FROM qualifications WHERE status IN ('有效','续证中','审批中')").all();
  const t = todayStr();
  let valid = 0, warn = 0, urgent = 0, expired = 0, renewing = 0, pending = 0;
  let d30 = 0, d60 = 0, d90 = 0;
  const bySide = { 公司资质: 0, 厂家资料: 0, 供应商资料: 0, 客户资料: 0 };
  rows.forEach((x) => {
    bySide[sideOf(x.category)] = (bySide[sideOf(x.category)] || 0) + 1;
    if (x.status === '审批中') { pending++; return; }
    if (x.status === '续证中') renewing++;
    const lv = warnLevel(x, t);
    if (lv.level === '已过期') expired++;
    else if (lv.level === '紧急') urgent++;
    else if (lv.level === '预警') warn++;
    else if (x.status === '有效') valid++;
    // 30/60/90 天到期口径（含已过期不计）
    if (lv.days_left !== null && lv.days_left >= 0) {
      if (lv.days_left <= 30) d30++;
      if (lv.days_left <= 60) d60++;
      if (lv.days_left <= 90) d90++;
    }
  });
  return res.json(ok({
    total: rows.length, valid, warn, urgent, expired, renewing, pending,
    expiring: urgent + warn,                       // 即将到期（紧急 + 预警）
    windows: { d30, d60, d90 },
    bySide,
  }));
}

/* ==================== 4. 到期预警清单 ==================== */
async function warnings(req, res) {
  const rows = db.prepare(`SELECT id,qual_no,name,category,cert_no,issuer,owner_dept,owner_name,
    issue_date,expire_date,warn_days,scope,status,renewal_note
    FROM qualifications WHERE status IN ('有效','续证中') ORDER BY expire_date ASC`).all();
  const t = todayStr();
  return res.json(ok(rows.map((x) => decorate(x, t)).filter((x) => x.level !== '正常')));
}

/* ==================== 5. 详情 ==================== */
async function detail(req, res) {
  const row = db.prepare('SELECT * FROM qualifications WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('资质不存在'));
  return res.json(ok(decorate(row, todayStr())));
}

/* ==================== 6. 证照登记（对齐参考项目：类型与归属匹配 + 审批链） ==================== */
async function create(req, res) {
  const b = req.body || {};
  if (!b.name || !b.category || !b.expire_date) return res.json(bad('证照名称、类型、到期日期为必填项'));
  const side = QUAL_SIDES.includes(b.data_side) ? b.data_side : sideOf(b.category);
  if (!SIDE_CATEGORIES[side].includes(b.category)) {
    return res.json(bad(`类型「${b.category}」与资料归属「${side}」不匹配`));
  }
  if (!canEdit(req.user)) {
    return res.json(forbidden('资质登记、续证等操作由市场部完成（全员可在线查看资质台账），入库须走市场部负责人→销售总监→质量负责人→副总→总经理审批'));
  }
  const no = 'QL' + ts().replace(/[-: ]/g, '').slice(0, 14) + Math.floor(Math.random() * 90 + 10);
  const info = db.prepare(`INSERT INTO qualifications
    (qual_no,name,category,cert_no,issuer,owner_dept,owner_id,owner_name,issue_date,expire_date,warn_days,scope,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'审批中',?)`)
    .run(no, b.name, b.category, b.cert_no || '', b.issuer || '', b.owner_dept || '质量部',
      empId(req) || null, b.owner_name || (req.user && req.user.name) || '',
      b.issue_date || '', b.expire_date, Number(b.warn_days) || 90, b.scope || '', ts());
  const ap = createApproval(req.user, '资质登记审批', `资质登记：${b.name}`, info.lastInsertRowid, 0, QUAL_CHAIN);
  db.prepare('UPDATE qualifications SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('QUAL_CREATE', req.userId, `资质${no}`, `${b.name}（${b.category}）到期 ${b.expire_date}`);
  return res.json(ok({ id: info.lastInsertRowid, qual_no: no, approval_id: ap.id, approval_no: ap.approval_no, data_side: side }, '资质已登记，审批通过后入册生效'));
}

/* ==================== 7. 续证登记（对齐参考项目：在途审批互斥 + 新到期日暂存） ==================== */
async function renew(req, res) {
  const q0 = db.prepare('SELECT * FROM qualifications WHERE id=?').get(req.params.id);
  if (!q0) return res.json(notfound('资质不存在'));
  if (!canEdit(req.user)) return res.json(forbidden('续证操作由市场部完成'));
  if (q0.status === '审批中') return res.json(bad('该资质已有登记审批在途', 409));
  if (q0.renewal_approval_id) {
    const ap = db.prepare('SELECT status FROM approvals WHERE id=?').get(q0.renewal_approval_id);
    if (ap && ap.status === '待审批') return res.json(bad('该资质已有续证审批在途', 409));
  }
  const b = req.body || {};
  if (!b.expire_date) return res.json(bad('新到期日期为必填项'));
  const ap = createApproval(req.user, '资质续证审批', `资质续证：${q0.name}`, q0.id, 0, QUAL_CHAIN);
  db.prepare(`UPDATE qualifications SET renewal_approval_id=?, renewal_note=?, status='续证中', updated_at=? WHERE id=?`)
    .run(ap.id, b.renewal_note || '续证办理中', ts(), q0.id);
  // 暂存新到期日，审批通过后写入 expire_date
  db.prepare('INSERT OR REPLACE INTO qual_renewal_pending (qual_id,new_expire_date,note) VALUES (?,?,?)')
    .run(q0.id, b.expire_date, b.renewal_note || '');
  audit('QUAL_RENEW', req.userId, `资质${q0.qual_no}`, `${q0.name} 续证，新到期 ${b.expire_date}`);
  return res.json(ok({ approval_id: ap.id, approval_no: ap.approval_no }, '续证申请已提交，审批通过后更新到期日'));
}

/* ==================== 8. 续期待办清单 ==================== */
async function renewals(req, res) {
  const rows = db.prepare(`SELECT p.qual_id, p.new_expire_date, p.note, q.qual_no, q.name, q.category,
      q.owner_name, q.owner_dept, q.expire_date, q.status, q.renewal_approval_id, a.approval_no, a.status ap_status
    FROM qual_renewal_pending p
    LEFT JOIN qualifications q ON q.id = p.qual_id
    LEFT JOIN approvals a ON a.id = q.renewal_approval_id
    ORDER BY p.new_expire_date ASC`).all();
  return res.json(ok(rows.map((x) => ({ ...x, data_side: sideOf(x.category) }))));
}

/* ==================== 9. 维护责任人 / 预警天数 / 适用范围 ==================== */
async function update(req, res) {
  const q0 = db.prepare('SELECT * FROM qualifications WHERE id=?').get(req.params.id);
  if (!q0) return res.json(notfound('资质不存在'));
  if (!canEdit(req.user)) return res.json(forbidden('资质维护由市场部或公司领导完成'));
  const b = req.body || {};
  db.prepare(`UPDATE qualifications SET owner_name=?, owner_dept=?, warn_days=?, scope=?, updated_at=? WHERE id=?`)
    .run(
      b.owner_name !== undefined ? b.owner_name : q0.owner_name,
      b.owner_dept !== undefined ? b.owner_dept : q0.owner_dept,
      b.warn_days !== undefined ? Number(b.warn_days) : q0.warn_days,
      b.scope !== undefined ? b.scope : q0.scope,
      ts(), q0.id
    );
  audit('QUAL_UPDATE', req.userId, `资质${q0.qual_no}`, `维护资质信息 ${q0.name}`);
  return res.json(ok(null, '已保存'));
}

/* ==================== 10. 资质审批终审（对齐参考项目：审批通过入册生效 / 续证通过更新到期日） ==================== */
// 参考项目由 approvals.js 统一回调生效；当前项目审批中心未接入 qual 回调，故模块内置终审入口（副总/总经理/超管）
async function approve(req, res) {
  const q0 = db.prepare('SELECT * FROM qualifications WHERE id=?').get(req.params.id);
  if (!q0) return res.json(notfound('资质不存在'));
  if (!MGMT_ROLES.includes(req.user && req.user.role)) return res.json(forbidden('资质终审由副总/总经理完成'));
  const { result, comment } = req.body || {};
  if (!['通过', '驳回'].includes(result)) return res.json(bad('审批结果须为 通过 / 驳回'));
  const apId = q0.renewal_approval_id || q0.approval_id;
  if (q0.status !== '审批中' && q0.status !== '续证中') {
    return res.json(bad(`当前状态「${q0.status}」无需审批`));
  }
  if (result === '驳回') {
    db.prepare(`UPDATE qualifications SET status='驳回', updated_at=? WHERE id=?`).run(ts(), q0.id);
    if (apId) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(ts(), apId);
    db.prepare('DELETE FROM qual_renewal_pending WHERE qual_id=?').run(q0.id);
    audit('QUAL_REJECT', req.userId, `资质${q0.qual_no}`, `驳回：${comment || ''}`);
    return res.json(ok(null, '已驳回'));
  }
  // 通过：登记入册生效；续证通过则采用暂存的新到期日
  const pending = db.prepare('SELECT * FROM qual_renewal_pending WHERE qual_id=?').get(q0.id);
  if (pending) {
    db.prepare(`UPDATE qualifications SET status='有效', expire_date=?, updated_at=? WHERE id=?`)
      .run(pending.new_expire_date, ts(), q0.id);
    db.prepare('DELETE FROM qual_renewal_pending WHERE qual_id=?').run(q0.id);
  } else {
    db.prepare(`UPDATE qualifications SET status='有效', updated_at=? WHERE id=?`).run(ts(), q0.id);
  }
  if (apId) db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(ts(), apId);
  audit('QUAL_APPROVE', req.userId, `资质${q0.qual_no}`, `${q0.name} 审批通过，已入册生效`);
  return res.json(ok(null, '审批通过，资质已生效'));
}

/* ==================== 11. 预警推送（对齐参考项目 /expirations/check） ==================== */
async function pushWarnings(req, res) {
  const t = todayStr();
  const rows = db.prepare(`SELECT id,qual_no,name,category,owner_id,owner_name,expire_date,warn_days,status
    FROM qualifications WHERE status IN ('有效','续证中')`).all();
  const targets = rows.map((x) => ({ ...x, ...warnLevel(x, t) })).filter((x) => x.level !== '正常');
  // 接收人：责任人 + 管理层（参考项目：GM/VP/ADM/QA/MKT）
  const recipients = new Set();
  targets.forEach((x) => { if (x.owner_id) recipients.add(x.owner_id); });
  db.prepare("SELECT id,name FROM users WHERE role IN ('总经理','副总','超级管理员') OR dept='市场部'")
    .all().forEach((u) => recipients.add(u.id));
  let sent = 0;
  targets.forEach((x) => {
    const title = `资质到期${x.level === '已过期' ? '已过期' : '预警'}：${x.name}`;
    const content = `【${x.level}】${sideOf(x.category)} · ${x.category} · 到期日 ${x.expire_date}（剩余 ${x.days_left} 天），责任人：${x.owner_name || '未分配'}。请及时办理续证。`;
    recipients.forEach((uid) => {
      try {
        db.prepare(`INSERT INTO messages (msg_type,title,content,biz_type,biz_id,from_emp_id,from_name,to_emp_id,to_name)
          VALUES ('站内信',?,?,?,?,?,?,?,?)`)
          .run(title, content, '资质到期', x.id, empId(req) || 0,
            (req.user && req.user.name) || '系统', String(uid), '');
        sent++;
      } catch (e) { /* 单条失败不影响整体 */ }
    });
  });
  audit('QUAL_WARN_PUSH', req.userId, '资质到期预警', `触发 ${targets.length} 条资质预警，发送 ${sent} 条站内信`);
  return res.json(ok({ checked: targets.length, sent }));
}

/* ==================== 12. 主体资质核验：列表 / 待核验 / 详情 / 触发 / 试算 ==================== */
async function verifyList(req, res) {
  let sql = 'SELECT q.* FROM qual_verify q WHERE 1=1';
  const args = [];
  if (req.query.data_type) { sql += ' AND q.data_type=?'; args.push(req.query.data_type); }
  if (req.query.match_status) { sql += ' AND q.match_status=?'; args.push(req.query.match_status); }
  if (req.query.risk) { sql += ' AND q.risk_level=?'; args.push(req.query.risk); }
  if (req.query.q) { sql += ' AND q.unit_name LIKE ?'; args.push(`%${req.query.q}%`); }
  sql += ' ORDER BY q.id DESC LIMIT 300';
  const rows = db.prepare(sql).all(...args).map(parseItems);
  const sums = db.prepare('SELECT match_status, COUNT(*) n FROM qual_verify GROUP BY match_status').all();
  return res.json(ok({ rows, sums }));
}

async function verifyPending(req, res) {
  const list = [];
  Object.entries(VERIFY_TABLES).forEach(([dataType, tbl]) => {
    let rows = [];
    try {
      rows = db.prepare(`SELECT * FROM ${tbl} WHERE business_scope IS NOT NULL AND TRIM(business_scope)<>''`).all();
    } catch (e) { rows = []; }
    rows.forEach((row) => {
      const has = db.prepare('SELECT COUNT(*) n FROM qual_verify WHERE data_type=? AND ref_id=?').get(dataType, row.id).n;
      if (!has) {
        const unit = loadUnit(dataType, row.id);
        list.push({
          data_type: dataType, data_type_name: VERIFY_TYPES[dataType], ref_id: row.id, unit_name: row.name,
          credit_code: unit.credit_code, category: unit.category,
          required_scope: [unit.product_spec, unit.type, unit.category].filter(Boolean).join('|'),
          scope_text: unit.business_scope,
        });
      }
    });
  });
  return res.json(ok(list));
}

async function verifyDetail(req, res) {
  const x = db.prepare('SELECT * FROM qual_verify WHERE id=?').get(req.params.id);
  if (!x) return res.json(notfound('核验记录不存在'));
  return res.json(ok(parseItems(x)));
}

async function verifyRun(req, res) {
  const unit = loadUnit(req.params.dataType, req.params.id);
  if (!unit) return res.json(notfound('档案主体不存在'));
  if (!unit.business_scope || !unit.business_scope.trim()) {
    return res.json(bad(`「${unit.name}」尚未录入营业执照经营范围（请在资料档案中维护后重试）`));
  }
  const rec = runQualVerify(req.user, unit);
  if (!rec) return res.json(bad('核验引擎执行失败', 500));
  audit('QUAL_VERIFY', req.userId, `主体核验#${unit.id}`,
    `${VERIFY_TYPES[req.params.dataType]}「${unit.name}」核验：${rec.status}（覆盖${rec.coverage}%）缺失[${rec.missing.join('、')}]`);
  return res.json(ok(rec, `核验完成：${rec.status}`));
}

async function verifyPreview(req, res) {
  const { business_scope, product_spec, type, category } = req.body || {};
  return res.json(ok(qualVerify({ business_scope: business_scope || '', product_spec: product_spec || '', type: type || '', category: category || '' })));
}

module.exports = {
  meta, list, stats, warnings, detail, create, renew, renewals, update, approve, pushWarnings,
  verifyList, verifyPending, verifyDetail, verifyRun, verifyPreview,
  QUAL_SIDES, SIDE_CATEGORIES,
};
