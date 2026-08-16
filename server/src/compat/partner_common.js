/**
 * 客户管理&供应商管理 公共引擎 (PRD: 客户管理&供应商管理模块)
 * 职责:
 *  1. t_cm_* / t_sm_* 表族迁移
 *  2. 审批流构造 buildPartnerFlow + 角色匹配 matchPartnerRole (越级拦截)
 *  3. 审批工单通用流转 approveApply/rejectApply + applyEffect 生效处理器
 *  4. 行政归档台账 (自动归集 + 档案编号 + 借阅 + 月度汇总)
 *  5. AI智能能力: 自动评级/评分(抓取 t_tr_so/t_tr_po 合作数据) + 风险预警扫描
 *  6. 与采购/销售模块数据互通: guardSupplier/guardCustomer 自动抓取捕捉建档
 */
const { db } = require('./database');
const { genId, now, safeParse } = require('./helpers');

/* ===== 表迁移 ===== */
function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS t_cm_customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, credit_code TEXT DEFAULT '', address TEXT DEFAULT '',
    contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '',
    industry TEXT DEFAULT '', source TEXT DEFAULT '',
    status TEXT DEFAULT '意向', level TEXT DEFAULT 'C',
    expected_amount REAL DEFAULT 0, license_expiry TEXT DEFAULT '',
    bank TEXT DEFAULT '', account TEXT DEFAULT '',
    owner_id TEXT DEFAULT '', owner_name TEXT DEFAULT '', owner_dept TEXT DEFAULT '',
    last_follow_at TEXT DEFAULT '',
    so_amount REAL DEFAULT 0, so_count INTEGER DEFAULT 0,
    disable_reason TEXT DEFAULT '',
    remark TEXT DEFAULT '', created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_cm_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cust_id TEXT NOT NULL, cust_name TEXT DEFAULT '',
    follow_time TEXT, method TEXT DEFAULT '', content TEXT DEFAULT '',
    contact_person TEXT DEFAULT '', next_plan TEXT DEFAULT '', next_time TEXT DEFAULT '',
    creator_name TEXT DEFAULT '', created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_sm_suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL, credit_code TEXT DEFAULT '', address TEXT DEFAULT '',
    legal_person TEXT DEFAULT '', contact TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '',
    bank TEXT DEFAULT '', account TEXT DEFAULT '',
    category TEXT DEFAULT '', coop_type TEXT DEFAULT '合作',
    status TEXT DEFAULT '合作中', rating TEXT DEFAULT '合格', score REAL DEFAULT 60,
    license_expiry TEXT DEFAULT '', next_review_date TEXT DEFAULT '', last_review_at TEXT DEFAULT '',
    po_amount REAL DEFAULT 0, po_count INTEGER DEFAULT 0,
    grn_amount REAL DEFAULT 0, return_amount REAL DEFAULT 0,
    source TEXT DEFAULT '准入申请',
    owner_name TEXT DEFAULT '', owner_dept TEXT DEFAULT '',
    disable_reason TEXT DEFAULT '',
    remark TEXT DEFAULT '', created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_cm_applies (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL, biz_type TEXT NOT NULL,
    target_id TEXT DEFAULT '', target_name TEXT DEFAULT '',
    form_data TEXT DEFAULT '{}', reason TEXT DEFAULT '',
    current_step INTEGER DEFAULT 1, steps TEXT DEFAULT '[]',
    status TEXT DEFAULT '审批中',
    applicant_id TEXT DEFAULT '', applicant_name TEXT DEFAULT '', applicant_dept TEXT DEFAULT '',
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_cm_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apply_no TEXT NOT NULL, archive_no TEXT DEFAULT '',
    target_type TEXT NOT NULL, target_name TEXT DEFAULT '', biz_type TEXT DEFAULT '',
    snapshot TEXT DEFAULT '{}',
    status TEXT DEFAULT '待归档', filed_by TEXT DEFAULT '', filed_at TEXT DEFAULT '',
    borrow_log TEXT DEFAULT '[]',
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_cm_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL, target_id TEXT DEFAULT '', target_name TEXT DEFAULT '',
    alert_type TEXT, level TEXT DEFAULT '中', msg TEXT,
    status TEXT DEFAULT '待处理', created_at TEXT
  );
  `);
}
migrate();

/* ===== 角色匹配 (越级拦截) ===== */
function matchPartnerRole(u, role, creatorDept) {
  if (u.role === '超级管理员') return true;
  switch (role) {
    case 'deptLeader':
      return (u.role === '部门经理' && u.dept === creatorDept) ||
             (u.role === '销售总监' && creatorDept === '销售部');
    case 'bizCenter': // 业务中心/采购复核(市场部经理兼任, 销售总监备位)
      return (u.role === '部门经理' && u.dept === '市场部') || u.role === '销售总监';
    case 'finance':
      return u.dept === '财务部';
    case 'deputy':
      return u.role === '副总';
    case 'gm_only':
      return u.role === '总经理';
    case 'mgmt': // 向后兼容：允许总经理或副总（旧数据）
      return ['总经理', '副总'].includes(u.role);
    default:
      return false;
  }
}

/* ===== 审批流构造 (AI流程推荐: 按业务类型/金额等级/合作等级自动匹配) ===== */
function buildPartnerFlow(bizType, opts = {}) {
  const t = now();
  const done = { user: '', time: t, done: true, opinion: '' };
  const todo = (step, role) => ({ step, role, user: '', time: '—', done: false, opinion: '' });
  const bigCust = (Number(opts.expected_amount) || 0) >= 500000 || ['S', 'A'].includes(opts.level);
  const bankChange = opts.bankChange === true;
  switch (bizType) {
    case 'cust_new': // 客户新增: 大额/重点客户加管理层终审
      return [{ step: '提交申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('业务中心复核', 'bizCenter'),
        ...(bigCust ? [todo('副总审批', 'deputy')] : []),
        todo('系统生效并归档', 'system')];
    case 'cust_change':
      return [{ step: '提交变更申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('业务中心复核', 'bizCenter'),
        todo('数据更新并归档', 'system')];
    case 'cust_level': // 评级变更必须管理层
      return [{ step: '提交评级申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('业务中心复核', 'bizCenter'),
        todo('副总审批', 'deputy'),
        todo('等级生效并归档', 'system')];
    case 'cust_disable': // 停用/注销需财务核对账款
      return [{ step: '提交停用/注销申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('财务账款核对', 'finance'),
        todo('副总审批', 'deputy'),
        todo('状态变更并归档', 'system')];
    case 'supp_new': // 准入备案固定四级
      return [{ step: '提交准入申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('采购业务复核', 'bizCenter'),
        todo('财务资质及账户核验', 'finance'),
        todo('副总审批', 'deputy'),
        todo('准入备案生效并归档', 'system')];
    case 'supp_change': // 账户变更加财务核验
      return [{ step: '提交变更申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('采购业务复核', 'bizCenter'),
        ...(bankChange ? [todo('财务账户核验', 'finance')] : []),
        todo('副总审批', 'deputy'),
        todo('数据更新并归档', 'system')];
    case 'supp_review': // 年审: 使用部门意见+财务复核+管理层
      return [{ step: '发起年审', ...done },
        todo('使用部门意见征集', 'deptLeader'),
        todo('财务复核', 'finance'),
        todo('副总审批', 'deputy'),
        todo('评级生效并归档', 'system')];
    case 'supp_rating':
      return [{ step: '提交评级调整申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('采购业务复核', 'bizCenter'),
        todo('副总审批', 'deputy'),
        todo('评级生效并归档', 'system')];
    case 'supp_disable': // 停用/淘汰需财务核对未结账款
      return [{ step: '提交停用/淘汰申请', ...done },
        todo('部门负责人审核', 'deptLeader'),
        todo('采购业务复核', 'bizCenter'),
        todo('财务未结账款核对', 'finance'),
        todo('副总审批', 'deputy'),
        todo('状态冻结并归档', 'system')];
    default:
      return [];
  }
}

/* ===== AI智能评级/评分 (自动抓取进销存合作数据) ===== */
function recalcCustomer(idOrName, byName = false) {
  const c = byName
    ? db.prepare('SELECT * FROM t_cm_customers WHERE name = ?').get(idOrName)
    : db.prepare('SELECT * FROM t_cm_customers WHERE id = ?').get(idOrName);
  if (!c) return null;
  const agg = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) amt, COUNT(*) cnt, MIN(created_at) first_at
    FROM t_tr_so WHERE customer_name = ? AND status NOT IN ('草稿','已驳回','已作废')`).get(c.name);
  const rt = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) ramt FROM t_tr_sreturn WHERE customer_name = ? AND status = '已生效'`).get(c.name);
  const net = (agg.amt || 0) - (rt.ramt || 0);
  // AI评级: 净合作额 S≥100万 A≥30万 B≥5万 C其他
  let suggest = 'C';
  if (net >= 1000000) suggest = 'S';
  else if (net >= 300000) suggest = 'A';
  else if (net >= 50000) suggest = 'B';
  db.prepare(`UPDATE t_cm_customers SET so_amount=?, so_count=?, updated_at=? WHERE id=?`)
    .run(net, agg.cnt || 0, now(), c.id);
  return { id: c.id, name: c.name, level: c.level, suggest_level: suggest, so_amount: net, so_count: agg.cnt || 0, first_at: agg.first_at || '' };
}

function recalcSupplier(idOrName, byName = false) {
  const s = byName
    ? db.prepare('SELECT * FROM t_sm_suppliers WHERE name = ?').get(idOrName)
    : db.prepare('SELECT * FROM t_sm_suppliers WHERE id = ?').get(idOrName);
  if (!s) return null;
  const po = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) amt, COUNT(*) cnt FROM t_tr_po WHERE supplier_name = ? AND status NOT IN ('草稿','已驳回','已作废')`).get(s.name);
  const grn = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) amt FROM t_tr_grn WHERE supplier_name = ? AND status = '已生效'`).get(s.name);
  const rt = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) amt FROM t_tr_preturn WHERE supplier_name = ? AND status = '已生效'`).get(s.name);
  const poAmt = po.amt || 0, grnAmt = grn.amt || 0, rtAmt = rt.amt || 0;
  const grnRate = poAmt > 0 ? Math.min(1, grnAmt / poAmt) : 0;
  const rtRate = poAmt > 0 ? Math.min(1, rtAmt / poAmt) : 0;
  // AI评分: 基础60 + 规模分(≤20) + 入库率分(≤15) - 退货率惩罚(≤30)
  let score = 60 + Math.min(20, poAmt / 100000) + grnRate * 15 - rtRate * 30;
  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  let rating = '不合格';
  if (score >= 85) rating = '优质';
  else if (score >= 70) rating = '合格';
  else if (score >= 55) rating = '待整改';
  db.prepare(`UPDATE t_sm_suppliers SET po_amount=?, po_count=?, grn_amount=?, return_amount=?, score=?, updated_at=? WHERE id=?`)
    .run(poAmt, po.cnt || 0, grnAmt, rtAmt, score, now(), s.id);
  return { id: s.id, name: s.name, rating: s.rating, suggest_rating: rating, score, po_amount: poAmt, po_count: po.cnt || 0, grn_amount: grnAmt, return_amount: rtAmt };
}

/* ===== 往来单位同步 (客户/供应商 → t_tr_partners 财务往来台账) ===== */
function syncPartnerToTrade(type, rec) {
  const exist = db.prepare(`SELECT id FROM t_tr_partners WHERE partner_type=? AND ref_id=?`).get(type, rec.id);
  if (exist) {
    db.prepare(`UPDATE t_tr_partners SET name=?, credit_code=?, contact=?, phone=?, bank=?, account=?, status=?, synced_at=? WHERE id=?`)
      .run(rec.name, rec.credit_code || '', rec.contact || '', rec.phone || '', rec.bank || '', rec.account || '', rec.status || '合作中', now(), exist.id);
  } else {
    db.prepare(`INSERT INTO t_tr_partners (partner_type,ref_id,name,credit_code,contact,phone,bank,account,status,synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(type, rec.id, rec.name, rec.credit_code || '', rec.contact || '', rec.phone || '', rec.bank || '', rec.account || '', rec.status || '合作中', now());
  }
}

/* ===== 风险预警扫描 (AI风险预警) ===== */
function addPartnerAlert(target_type, target_id, target_name, alert_type, level, msg) {
  const dup = db.prepare(`SELECT id FROM t_cm_alerts WHERE target_type=? AND target_id=? AND alert_type=? AND status='待处理'`).get(target_type, target_id, alert_type);
  if (dup) return;
  db.prepare(`INSERT INTO t_cm_alerts (target_type,target_id,target_name,alert_type,level,msg,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(target_type, target_id, target_name, alert_type, level, msg, now());
}

function daysUntil(d) {
  if (!d) return 9999;
  try { return Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000); } catch { return 9999; }
}
/** 距某历史日期已过去多少天 */
function daysSince(d) {
  if (!d) return null;
  try { return Math.floor((Date.now() - new Date(String(d).slice(0, 10) + 'T00:00:00')) / 86400000); } catch { return null; }
}

function scanPartnerAlerts() {
  let n = 0;
  // 客户: 资质到期 / 长期未跟进
  db.prepare(`SELECT * FROM t_cm_customers WHERE status IN ('意向','合作中')`).all().forEach(c => {
    const dl = daysUntil(c.license_expiry);
    if (dl <= 30) { addPartnerAlert('customer', c.id, c.name, '资质到期', dl < 0 ? '高' : '中', dl < 0 ? `营业执照已过期 ${-dl} 天，请立即更新资质` : `营业执照将于 ${dl} 天后到期，请及时更新`); n++; }
    const fd = c.last_follow_at ? daysSince(c.last_follow_at) : daysSince(c.created_at);
    if (c.status === '合作中' && fd !== null && fd >= 30) { addPartnerAlert('customer', c.id, c.name, '跟进超期', '中', `合作中客户已 ${fd} 天未跟进，存在流失风险，请及时跟进`); n++; }
  });
  // 供应商: 资质到期 / 年审到期 / 评级过低
  db.prepare(`SELECT * FROM t_sm_suppliers WHERE status IN ('合作中','备选','待整改')`).all().forEach(s => {
    const dl = daysUntil(s.license_expiry);
    if (dl <= 30) { addPartnerAlert('supplier', s.id, s.name, '资质到期', dl < 0 ? '高' : '中', dl < 0 ? `资质证书已过期 ${-dl} 天，禁止继续合作` : `资质证书将于 ${dl} 天后到期，请提示补交`); n++; }
    const rd = daysUntil(s.next_review_date);
    if (s.next_review_date && rd <= 30) { addPartnerAlert('supplier', s.id, s.name, '年审到期', rd < 0 ? '高' : '中', rd < 0 ? `年审已逾期 ${-rd} 天，请立即发起年审` : `年审将于 ${rd} 天后到期，请及时发起`); n++; }
    if (s.rating === '不合格') { addPartnerAlert('supplier', s.id, s.name, '评级过低', '高', '供应商评级为不合格，已限制合作与新业务立项，请整改后申请恢复'); n++; }
  });
  return n;
}

/* ===== 归档写入 (审批完结自动归集) ===== */
function archiveApply(apply) {
  const steps = safeParse(apply.steps, []);
  const snapshot = {
    apply_no: apply.id, biz_type: apply.biz_type, target_name: apply.target_name,
    reason: apply.reason, form_data: safeParse(apply.form_data, {}),
    applicant: apply.applicant_name, dept: apply.applicant_dept,
    steps, final_status: apply.status, archived_at: now()
  };
  db.prepare(`INSERT INTO t_cm_archive (apply_no,target_type,target_name,biz_type,snapshot,status,created_at)
    VALUES (?,?,?,?,?,'待归档',?)`)
    .run(apply.id, apply.target_type, apply.target_name, apply.biz_type, JSON.stringify(snapshot), now());
}

/* ===== 生效处理器 ===== */
function applyEffect(apply) {
  const f = safeParse(apply.form_data, {});
  const t = now();
  let msg = '';
  if (apply.biz_type === 'cust_new') {
    const id = genId('KH');
    // AI初始评级: 预计金额 S≥100万 A≥30万 B≥5万
    let lv = f.level || '';
    const ea = Number(f.expected_amount) || 0;
    if (!lv) lv = ea >= 1000000 ? 'S' : ea >= 300000 ? 'A' : ea >= 50000 ? 'B' : 'C';
    db.prepare(`INSERT INTO t_cm_customers (id,name,credit_code,address,contact,phone,email,industry,source,status,level,expected_amount,license_expiry,bank,account,owner_id,owner_name,owner_dept,remark,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, f.name, f.credit_code || '', f.address || '', f.contact || '', f.phone || '', f.email || '', f.industry || '',
        f.source || '自主开发', ea > 0 ? '合作中' : '意向', lv, ea, f.license_expiry || '', f.bank || '', f.account || '',
        apply.applicant_id, f.owner_name || apply.applicant_name, apply.applicant_dept, f.remark || '', t, t);
    const r = recalcCustomer(id);
    if (r && r.so_count > 0) {
      db.prepare(`UPDATE t_cm_customers SET level=? WHERE id=?`).run(r.suggest_level, id);
    }
    const row = db.prepare('SELECT * FROM t_cm_customers WHERE id=?').get(id);
    syncPartnerToTrade('customer', row);
    db.prepare(`UPDATE t_cm_applies SET target_id=? WHERE id=?`).run(id, apply.id);
    apply.target_id = id;
    msg = '客户新增生效，已同步往来单位台账';
  } else if (apply.biz_type === 'cust_change') {
    db.prepare(`UPDATE t_cm_customers SET address=COALESCE(NULLIF(?,''),address),contact=COALESCE(NULLIF(?,''),contact),phone=COALESCE(NULLIF(?,''),phone),
      email=COALESCE(NULLIF(?,''),email),industry=COALESCE(NULLIF(?,''),industry),license_expiry=COALESCE(NULLIF(?,''),license_expiry),
      bank=COALESCE(NULLIF(?,''),bank),account=COALESCE(NULLIF(?,''),account),updated_at=? WHERE id=?`)
      .run(f.address || '', f.contact || '', f.phone || '', f.email || '', f.industry || '', f.license_expiry || '', f.bank || '', f.account || '', t, apply.target_id);
    const row = db.prepare('SELECT * FROM t_cm_customers WHERE id=?').get(apply.target_id);
    if (row) syncPartnerToTrade('customer', row);
    msg = '客户信息变更已生效，历史记录留存于审批工单';
  } else if (apply.biz_type === 'cust_level') {
    db.prepare(`UPDATE t_cm_customers SET level=?, remark = remark || CASE WHEN remark != '' THEN ' | ' ELSE '' END || ?, updated_at=? WHERE id=?`)
      .run(f.level || 'C', `评级调整为${f.level}(${apply.reason || '人工评定'})`, t, apply.target_id);
    msg = `客户等级已调整为 ${f.level}`;
  } else if (apply.biz_type === 'cust_disable') {
    const st = f.disable_type === '注销' ? '已注销' : '已停用';
    db.prepare(`UPDATE t_cm_customers SET status=?, disable_reason=?, updated_at=? WHERE id=?`)
      .run(st, apply.reason || '', t, apply.target_id);
    const row = db.prepare('SELECT * FROM t_cm_customers WHERE id=?').get(apply.target_id);
    if (row) syncPartnerToTrade('customer', { ...row, status: '已停用' });
    msg = `客户已${st}，往来单位同步冻结`;
  } else if (apply.biz_type === 'supp_new') {
    const id = genId('GYS');
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO t_sm_suppliers (id,name,credit_code,address,legal_person,contact,phone,email,bank,account,category,coop_type,status,rating,score,license_expiry,next_review_date,source,owner_name,owner_dept,remark,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, f.name, f.credit_code || '', f.address || '', f.legal_person || '', f.contact || '', f.phone || '', f.email || '',
        f.bank || '', f.account || '', f.category || '', f.coop_type || '合作',
        f.coop_type === '备选' ? '备选' : '合作中', '合格', 60, f.license_expiry || '', nextYear,
        '准入申请', f.owner_name || apply.applicant_name, apply.applicant_dept, f.remark || '', t, t);
    const r = recalcSupplier(id);
    const row = db.prepare('SELECT * FROM t_sm_suppliers WHERE id=?').get(id);
    syncPartnerToTrade('supplier', row);
    db.prepare(`UPDATE t_cm_applies SET target_id=? WHERE id=?`).run(id, apply.id);
    apply.target_id = id;
    msg = `供应商准入备案生效，年审周期至 ${nextYear}，已同步往来单位台账`;
  } else if (apply.biz_type === 'supp_change') {
    db.prepare(`UPDATE t_sm_suppliers SET address=COALESCE(NULLIF(?,''),address),legal_person=COALESCE(NULLIF(?,''),legal_person),
      contact=COALESCE(NULLIF(?,''),contact),phone=COALESCE(NULLIF(?,''),phone),email=COALESCE(NULLIF(?,''),email),
      bank=COALESCE(NULLIF(?,''),bank),account=COALESCE(NULLIF(?,''),account),category=COALESCE(NULLIF(?,''),category),
      license_expiry=COALESCE(NULLIF(?,''),license_expiry),updated_at=? WHERE id=?`)
      .run(f.address || '', f.legal_person || '', f.contact || '', f.phone || '', f.email || '', f.bank || '', f.account || '', f.category || '', f.license_expiry || '', t, apply.target_id);
    const row = db.prepare('SELECT * FROM t_sm_suppliers WHERE id=?').get(apply.target_id);
    if (row) syncPartnerToTrade('supplier', row);
    msg = '供应商信息变更已生效，变更记录永久留存';
  } else if (apply.biz_type === 'supp_review' || apply.biz_type === 'supp_rating') {
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const rating = f.rating || '合格';
    db.prepare(`UPDATE t_sm_suppliers SET rating=?, score=COALESCE(?,score), last_review_at=?, next_review_date=CASE WHEN ?='supp_review' THEN ? ELSE next_review_date END,
      status=CASE WHEN ? IN ('不合格','待整改') THEN '待整改' WHEN status='待整改' THEN '合作中' ELSE status END, updated_at=? WHERE id=?`)
      .run(rating, f.score != null ? Number(f.score) : null, t, apply.biz_type, nextYear, rating, t, apply.target_id);
    const row = db.prepare('SELECT * FROM t_sm_suppliers WHERE id=?').get(apply.target_id);
    if (row) syncPartnerToTrade('supplier', row);
    msg = `供应商评级已生效: ${rating}`;
  } else if (apply.biz_type === 'supp_disable') {
    const st = f.disable_type === '淘汰' ? '已淘汰' : '已停用';
    db.prepare(`UPDATE t_sm_suppliers SET status=?, rating=CASE WHEN ?='已淘汰' THEN '不合格' ELSE rating END, disable_reason=?, updated_at=? WHERE id=?`)
      .run(st, st, apply.reason || '', t, apply.target_id);
    const row = db.prepare('SELECT * FROM t_sm_suppliers WHERE id=?').get(apply.target_id);
    if (row) syncPartnerToTrade('supplier', { ...row, status: '已停用' });
    msg = `供应商已${st}，合作权限冻结，禁止新业务立项`;
  }
  return msg;
}

/* ===== 审批工单通用流转 ===== */
function approveApply(applyId, user, opinion) {
  const apply = db.prepare('SELECT * FROM t_cm_applies WHERE id = ?').get(applyId);
  if (!apply) return { ok: false, code: 404, msg: '审批工单不存在' };
  if (apply.status !== '审批中') return { ok: false, code: 400, msg: '该工单已完结' };
  const steps = safeParse(apply.steps, []);
  const idx = steps.findIndex(s => !s.done);
  if (idx === -1) return { ok: false, code: 400, msg: '已全部审批完成' };
  const step = steps[idx];
  if (step.role !== 'system' && !matchPartnerRole(user, step.role, apply.applicant_dept)) {
    return { ok: false, code: 403, msg: `禁止越级审批，当前节点「${step.step}」需对应审批人处理` };
  }
  const t = now();
  step.done = true; step.user = user.name; step.time = t; step.opinion = opinion || '同意';
  // 自动完成系统生效节点
  const next = steps.findIndex(s => !s.done);
  let effectMsg = '';
  if (next !== -1 && steps[next].role === 'system') {
    steps[next].done = true; steps[next].user = '系统自动'; steps[next].time = t;
    apply.status = '已通过';
    try { effectMsg = applyEffect(apply); } catch (e) {
      return { ok: false, code: 500, msg: '生效处理异常: ' + e.message };
    }
    steps[next].opinion = effectMsg;
  }
  if (steps.every(s => s.done) && apply.status === '审批中') apply.status = '已通过';
  db.prepare(`UPDATE t_cm_applies SET steps=?, status=?, current_step=?, updated_at=? WHERE id=?`)
    .run(JSON.stringify(steps), apply.status, steps.findIndex(s => !s.done) + 1, t, applyId);
  // 完结自动归档
  if (apply.status === '已通过') archiveApply(apply);
  return { ok: true, msg: effectMsg ? `审批通过，${effectMsg}` : '审批通过', steps, status: apply.status };
}

function rejectApply(applyId, user, remark) {
  const apply = db.prepare('SELECT * FROM t_cm_applies WHERE id = ?').get(applyId);
  if (!apply) return { ok: false, code: 404, msg: '审批工单不存在' };
  if (apply.status !== '审批中') return { ok: false, code: 400, msg: '该工单已完结' };
  if (!remark || !remark.trim()) return { ok: false, code: 400, msg: '驳回必须填写驳回原因' };
  const steps = safeParse(apply.steps, []);
  const idx = steps.findIndex(s => !s.done);
  if (idx === -1) return { ok: false, code: 400, msg: '已全部审批完成' };
  const step = steps[idx];
  if (step.role !== 'system' && !matchPartnerRole(user, step.role, apply.applicant_dept)) {
    return { ok: false, code: 403, msg: `禁止越级审批，当前节点「${step.step}」需对应审批人处理` };
  }
  step.done = true; step.user = user.name; step.time = now(); step.opinion = '驳回：' + remark.trim();
  apply.status = '已驳回';
  db.prepare(`UPDATE t_cm_applies SET steps=?, status=?, updated_at=? WHERE id=?`)
    .run(JSON.stringify(steps), '已驳回', now(), applyId);
  archiveApply(apply); // 驳回完结同样归档留痕
  return { ok: true, msg: '已驳回，工单归档留存', steps, status: '已驳回' };
}

/* ===== 互通: 采购/销售订单创建时的自动抓取捕捉 ===== */
/** 采购订单创建 → 校验供应商备案状态; 未建档自动捕捉建档(备选+资质待补录预警); 停用/淘汰拦截 */
function guardSupplier(name, operatorName, operatorDept) {
  if (!name) return { ok: true, msg: '' };
  const s = db.prepare('SELECT * FROM t_sm_suppliers WHERE name = ?').get(name);
  if (!s) {
    const id = genId('GYS');
    db.prepare(`INSERT INTO t_sm_suppliers (id,name,coop_type,status,rating,score,source,owner_name,owner_dept,remark,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, name, '备选', '备选', '待评级', 0, '采购订单自动抓取', operatorName || '系统', operatorDept || '', '由采购订单自动捕捉建档，资质资料待补录，请尽快发起准入备案', now(), now());
    addPartnerAlert('supplier', id, name, '资质待补录', '中', '供应商由采购订单自动捕捉建档，资质资料未备案，请尽快补充准入审批');
    return { ok: true, msg: '供应商未备案，系统已自动建档(备选)并发出资质补录预警', auto: true, id };
  }
  if (['已停用', '已淘汰'].includes(s.status)) {
    return { ok: false, code: 400, msg: `供应商「${name}」已${s.status}，禁止合作下单。如需恢复请先整改并申请重新准入` };
  }
  return { ok: true, msg: '', id: s.id };
}

/** 销售订单创建 → 校验客户状态; 未建档自动捕捉建档(意向+AI初始评级); 停用/注销拦截 */
function guardCustomer(name, amount, operatorName, operatorDept) {
  if (!name) return { ok: true, msg: '' };
  const c = db.prepare('SELECT * FROM t_cm_customers WHERE name = ?').get(name);
  if (!c) {
    const id = genId('KH');
    const amt = Number(amount) || 0;
    const lv = amt >= 1000000 ? 'S' : amt >= 300000 ? 'A' : amt >= 50000 ? 'B' : 'C';
    db.prepare(`INSERT INTO t_cm_customers (id,name,source,status,level,expected_amount,owner_name,owner_dept,remark,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, name, '销售订单自动抓取', '合作中', lv, amt, operatorName || '系统', operatorDept || '', '由销售订单自动捕捉建档，请补充完善客户资料', now(), now());
    return { ok: true, msg: '客户档案不存在，系统已自动建档并完成AI初始评级', auto: true, id };
  }
  if (['已停用', '已注销'].includes(c.status)) {
    return { ok: false, code: 400, msg: `客户「${name}」已${c.status}，禁止与其创建销售订单` };
  }
  return { ok: true, msg: '', id: c.id };
}

/* ===== 数据可见性范围 ===== */
function listScope(u) {
  if (['超级管理员', '总经理', '副总'].includes(u.role)) return 'all';
  if (u.dept === '财务部' || u.role === '销售总监' || (u.role === '部门经理' && u.dept === '市场部')) return 'all';
  if (u.role === '部门经理') return 'dept';
  return 'self';
}

/* ===== 存量数据一键备案 (旧 customers/suppliers → 新模块) ===== */
function importLegacy(operatorName) {
  let nC = 0, nS = 0;
  const t = now();
  db.prepare(`SELECT * FROM customers`).all().forEach(c => {
    if (db.prepare('SELECT id FROM t_cm_customers WHERE name = ? OR (credit_code != \'\' AND credit_code = ?)').get(c.name, c.credit_code || 'x')) return;
    const id = genId('KH');
    db.prepare(`INSERT INTO t_cm_customers (id,name,credit_code,address,contact,phone,email,industry,source,status,level,owner_name,owner_dept,remark,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, c.name, c.credit_code || '', c.address || '', c.contact || '', c.phone || '', c.email || '', c.industry || '',
        '存量数据导入', '合作中', ['S', 'A', 'B', 'C'].includes(c.level) ? c.level : 'C', c.owner || '系统', c.owner_dept || '', '存量客户一键备案导入', t, t);
    recalcCustomer(id);
    const row = db.prepare('SELECT * FROM t_cm_customers WHERE id=?').get(id);
    syncPartnerToTrade('customer', row);
    nC++;
  });
  db.prepare(`SELECT * FROM suppliers`).all().forEach(s => {
    if (db.prepare('SELECT id FROM t_sm_suppliers WHERE name = ?').get(s.name)) return;
    const id = genId('GYS');
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    db.prepare(`INSERT INTO t_sm_suppliers (id,name,credit_code,address,contact,phone,email,bank,account,category,coop_type,status,rating,score,next_review_date,source,owner_name,owner_dept,remark,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s.name, s.credit_code || '', s.address || '', s.contact || '', s.phone || '', s.email || '', s.bank || '', s.account || '',
        s.category || '', '合作', '合作中', ['优质', '合格', '待整改', '不合格'].includes(s.rating) ? s.rating : '合格', 60, nextYear, '存量数据导入', s.submitter || '系统', s.applicant_dept || '', '存量供应商一键备案导入', t, t);
    recalcSupplier(id);
    const row = db.prepare('SELECT * FROM t_sm_suppliers WHERE id=?').get(id);
    syncPartnerToTrade('supplier', row);
    nS++;
  });
  return { customers: nC, suppliers: nS };
}

module.exports = {
  migrate, matchPartnerRole, buildPartnerFlow,
  recalcCustomer, recalcSupplier, syncPartnerToTrade,
  addPartnerAlert, scanPartnerAlerts,
  archiveApply, applyEffect, approveApply, rejectApply,
  guardSupplier, guardCustomer, listScope, importLegacy
};
