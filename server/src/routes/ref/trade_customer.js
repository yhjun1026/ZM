/**
 * 客户管理模块路由 (PRD 4.x)
 * 生命周期: 意向 → 合作家 → 已停用/已注销
 * 审批: 新增(大额/重点加终审) / 变更 / 评级 / 停用注销(财务账款核对)
 * AI: 智能查重 / 自动评级(抓取销售订单) / 跟进超期+资质到期预警 / 台账统计
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now, safeParse } = require('../../compat/helpers');
const { buildPartnerFlow, approveApply, rejectApply, recalcCustomer, scanPartnerAlerts, listScope, syncPartnerToTrade, archiveApply } = require('../../compat/partner_common');

router.use(authMiddleware);

/* ===== 客户台账列表 (数据权限: 本人/本部门/全量) ===== */
router.get('/', (req, res) => {
  const u = req.user;
  const { keyword, status, level } = req.query;
  let sql = `SELECT * FROM t_cm_customers WHERE 1=1`;
  const args = [];
  if (keyword) { sql += ` AND (name LIKE ? OR contact LIKE ? OR phone LIKE ? OR credit_code LIKE ?)`; const k = '%' + keyword + '%'; args.push(k, k, k, k); }
  if (status) { sql += ` AND status = ?`; args.push(status); }
  if (level) { sql += ` AND level = ?`; args.push(level); }
  const scope = listScope(u);
  if (scope === 'dept') { sql += ` AND owner_dept = ?`; args.push(u.dept); }
  else if (scope === 'self') { sql += ` AND owner_id = ?`; args.push(u.id); }
  sql += ` ORDER BY created_at DESC`;
  const rows = db.prepare(sql).all(...args);
  return success(res, rows);
});

/* ===== KPI 统计 ===== */
router.get('/stats', (req, res) => {
  scanPartnerAlerts();
  const all = db.prepare('SELECT * FROM t_cm_customers').all();
  const month = now().slice(0, 7);
  const levels = { S: 0, A: 0, B: 0, C: 0 };
  all.forEach(c => { if (levels[c.level] != null) levels[c.level]++; });
  const alerts = db.prepare(`SELECT COUNT(*) n FROM t_cm_alerts WHERE target_type='customer' AND status='待处理'`).get().n;
  const pending = db.prepare(`SELECT COUNT(*) n FROM t_cm_applies WHERE target_type='customer' AND status='审批中'`).get().n;
  const soAgg = db.prepare(`SELECT COALESCE(SUM(so_amount),0) amt FROM t_cm_customers`).get().amt;
  return success(res, {
    total: all.length,
    cooperating: all.filter(c => c.status === '合作中').length,
    intending: all.filter(c => c.status === '意向').length,
    disabled: all.filter(c => ['已停用', '已注销'].includes(c.status)).length,
    levels, alerts, pending,
    month_new: all.filter(c => (c.created_at || '').slice(0, 7) === month).length,
    so_amount: soAgg
  });
});

/* ===== 风险预警列表 ===== */
router.get('/alerts', (req, res) => {
  const n = scanPartnerAlerts();
  const rows = db.prepare(`SELECT * FROM t_cm_alerts WHERE target_type='customer' ORDER BY status, id DESC`).all();
  return success(res, { rows, scanned: n });
});

/* ===== 审批工单列表 ===== */
router.get('/applies', (req, res) => {
  const { status, biz_type } = req.query;
  let sql = `SELECT * FROM t_cm_applies WHERE target_type='customer'`;
  const args = [];
  if (status) { sql += ` AND status = ?`; args.push(status); }
  if (biz_type) { sql += ` AND biz_type = ?`; args.push(biz_type); }
  const scope = listScope(req.user);
  if (scope === 'dept') { sql += ` AND applicant_dept = ?`; args.push(req.user.dept); }
  else if (scope === 'self') { sql += ` AND applicant_id = ?`; args.push(req.user.id); }
  sql += ` ORDER BY created_at DESC`;
  const rows = db.prepare(sql).all(...args);
  rows.forEach(r => { r.steps = safeParse(r.steps, []); r.form_data = safeParse(r.form_data, {}); });
  return success(res, rows);
});

/* ===== 发起审批申请 ===== */
router.post('/applies', (req, res) => {
  const u = req.user;
  const { biz_type, target_id, form = {}, reason } = req.body;
  const t = now();
  if (!biz_type) return error(res, 400, '业务类型不能为空');

  if (biz_type === 'cust_new') {
    if (!form.name || !form.name.trim()) return error(res, 400, '客户名称不能为空');
    // AI智能查重: 名称/信用代码 与已建档及审批中申请均不可重复
    const dup1 = db.prepare(`SELECT id FROM t_cm_customers WHERE name = ?`).get(form.name.trim());
    if (dup1) return error(res, 400, `查重失败: 客户「${form.name.trim()}」已建档，禁止重复录入`);
    if (form.credit_code) {
      const dup2 = db.prepare(`SELECT id FROM t_cm_customers WHERE credit_code = ? AND credit_code != ''`).get(form.credit_code.trim());
      if (dup2) return error(res, 400, `查重失败: 统一社会信用代码已存在，禁止重复备案`);
    }
    const dup3 = db.prepare(`SELECT id FROM t_cm_applies WHERE target_type='customer' AND biz_type='cust_new' AND status='审批中' AND json_extract(form_data,'$.name') = ?`).get(form.name.trim());
    if (dup3) return error(res, 400, `查重失败: 该客户新增申请正在审批中，请勿重复提交`);
    // AI格式校验: 手机号
    if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone.trim())) return error(res, 400, '联系电话格式不正确(11位手机号)');
  } else {
    if (!target_id) return error(res, 400, '缺少目标客户');
    const c = db.prepare('SELECT * FROM t_cm_customers WHERE id = ?').get(target_id);
    if (!c) return error(res, 404, '客户不存在');
    if (['已停用', '已注销'].includes(c.status) && biz_type !== 'cust_change') return error(res, 400, `客户已${c.status}，不可发起该业务`);
    if (biz_type === 'cust_level' && !form.level) return error(res, 400, '请选择目标客户等级');
    if (biz_type === 'cust_disable' && !['停用', '注销'].includes(form.disable_type)) return error(res, 400, '请选择停用或注销类型');
  }

  const steps = buildPartnerFlow(biz_type, { expected_amount: form.expected_amount, level: form.level });
  if (!steps.length) return error(res, 400, '未知业务类型');
  const id = genId('KA');
  db.prepare(`INSERT INTO t_cm_applies (id,target_type,biz_type,target_id,target_name,form_data,reason,current_step,steps,status,applicant_id,applicant_name,applicant_dept,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, 'customer', biz_type, target_id || '', form.name || '', JSON.stringify(form), reason || '', 1,
      JSON.stringify(steps), '审批中', u.id, u.name, u.dept, t, t);
  return success(res, { id }, '申请已提交，AI已按业务类型自动匹配审批流程');
});

/* ===== 审批/驳回 ===== */
router.post('/applies/:id/approve', (req, res) => {
  const r = approveApply(req.params.id, req.user, req.body.opinion);
  if (!r.ok) return error(res, r.code, r.msg);
  return success(res, { steps: r.steps, status: r.status }, r.msg);
});
router.post('/applies/:id/reject', (req, res) => {
  const r = rejectApply(req.params.id, req.user, req.body.remark);
  if (!r.ok) return error(res, r.code, r.msg);
  return success(res, { steps: r.steps, status: r.status }, r.msg);
});

/* ===== 存量客户一键备案 ===== */
router.post('/import-legacy', (req, res) => {
  const u = req.user;
  if (!(u.role === '超级管理员' || (u.role === '部门经理' && u.dept === '市场部') || u.role === '销售总监')) {
    return error(res, 403, '仅业务中心管理员或超级管理员可执行存量导入');
  }
  const { importLegacy } = require('../../compat/partner_common');
  const r = importLegacy(u.name);
  return success(res, r, `存量导入完成: 客户 ${r.customers} 家、供应商 ${r.suppliers} 家`);
});

/* ===== 台账CSV导出 ===== */
router.get('/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_cm_customers ORDER BY created_at DESC').all();
  const head = ['客户编号', '客户名称', '信用代码', '联系人', '电话', '行业', '来源', '状态', '等级', '预计合作额', '归属人', '归属部门', '销售订单额', '订单数', '建档时间'];
  const body = rows.map(c => [c.id, c.name, c.credit_code, c.contact, c.phone, c.industry, c.source, c.status, c.level, c.expected_amount, c.owner_name, c.owner_dept, c.so_amount, c.so_count, c.created_at]);
  const csv = '\ufeff' + [head, ...body].map(l => l.map(x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
  return res.send(csv);
});

/* ===== 客户详情 (含跟进/工单/AI评级/关联销售订单) ===== */
router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM t_cm_customers WHERE id = ?').get(req.params.id);
  if (!c) return error(res, 404, '客户不存在');
  const followups = db.prepare('SELECT * FROM t_cm_followups WHERE cust_id = ? ORDER BY follow_time DESC').all(c.id);
  const applies = db.prepare(`SELECT * FROM t_cm_applies WHERE target_type='customer' AND (target_id = ? OR target_name = ?) ORDER BY created_at DESC`).all(c.id, c.name);
  applies.forEach(a => { a.steps = safeParse(a.steps, []); a.form_data = safeParse(a.form_data, {}); });
  const orders = db.prepare(`SELECT id, so_no, total_with_tax, status, receive_status, created_at FROM t_tr_so WHERE customer_name = ? ORDER BY created_at DESC LIMIT 20`).all(c.name);
  const ai = recalcCustomer(c.id);
  return success(res, { customer: c, followups, applies, orders, ai });
});

/* ===== 跟进记录 ===== */
router.get('/:id/followups', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_cm_followups WHERE cust_id = ? ORDER BY follow_time DESC').all(req.params.id);
  return success(res, rows);
});

router.post('/:id/followups', (req, res) => {
  const u = req.user;
  const c = db.prepare('SELECT * FROM t_cm_customers WHERE id = ?').get(req.params.id);
  if (!c) return error(res, 404, '客户不存在');
  const scope = listScope(u);
  const isOwner = c.owner_id === u.id || c.owner_name === u.name;
  const canAll = scope === 'all';
  if (!isOwner && !canAll) return error(res, 403, '仅客户归属人或全量权限角色可提交跟进记录');
  const { follow_time, method, content, contact_person, next_plan, next_time } = req.body;
  if (!content || !content.trim()) return error(res, 400, '跟进内容不能为空');
  const t = now();
  const ft = follow_time || t.slice(0, 16);
  db.prepare(`INSERT INTO t_cm_followups (cust_id,cust_name,follow_time,method,content,contact_person,next_plan,next_time,creator_name,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(c.id, c.name, ft, method || '电话', content.trim(), contact_person || c.contact, next_plan || '', next_time || '', u.name, t);
  db.prepare(`UPDATE t_cm_customers SET last_follow_at = ?, updated_at = ? WHERE id = ?`).run(ft, t, c.id);
  db.prepare(`UPDATE t_cm_alerts SET status='已处理' WHERE target_type='customer' AND target_id=? AND alert_type='跟进超期' AND status='待处理'`).run(c.id);
  return success(res, null, '跟进记录已保存并关联客户台账');
});

/* ===== AI评级建议 (手动触发重算) ===== */
router.post('/:id/recalc', (req, res) => {
  const r = recalcCustomer(req.params.id);
  if (!r) return error(res, 404, '客户不存在');
  return success(res, r, r.so_count > 0 ? `AI建议等级: ${r.suggest_level}` : '暂无合作订单数据，维持人工评定');
});

module.exports = router;
