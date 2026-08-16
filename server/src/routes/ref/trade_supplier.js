/**
 * 供应商管理模块路由 (PRD 5.x)
 * 生命周期: 准入备案 → 合作/备选 → 年审评级 → 待整改/停用/淘汰
 * 审批: 准入(五级) / 变更(账户变更加财务) / 年审 / 评级 / 停用淘汰(财务未结账款核对)
 * AI: 查重防重复备案 / 自动评分(抓取采购订单+入库+退货) / 资质到期+年审到期+评级过低预警
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now, safeParse } = require('../../compat/helpers');
const { buildPartnerFlow, approveApply, rejectApply, recalcSupplier, scanPartnerAlerts, listScope } = require('../../compat/partner_common');
const { canAccess } = require('../../compat/rbac');

router.use(authMiddleware);

/* ===== 供应商台账列表 ===== */
router.get('/', (req, res) => {
  const u = req.user;
  const { keyword, status, rating, category } = req.query;
  let sql = `SELECT * FROM t_sm_suppliers WHERE 1=1`;
  const args = [];
  if (keyword) { sql += ` AND (name LIKE ? OR contact LIKE ? OR phone LIKE ? OR credit_code LIKE ? OR category LIKE ?)`; const k = '%' + keyword + '%'; args.push(k, k, k, k, k); }
  if (status) { sql += ` AND status = ?`; args.push(status); }
  if (rating) { sql += ` AND rating = ?`; args.push(rating); }
  if (category) { sql += ` AND category LIKE ?`; args.push('%' + category + '%'); }
  const scope = listScope(u);
  if (scope === 'dept') { sql += ` AND owner_dept = ?`; args.push(u.dept); }
  else if (scope === 'self') { sql += ` AND owner_name = ?`; args.push(u.name); }
  sql += ` ORDER BY created_at DESC`;
  return success(res, db.prepare(sql).all(...args));
});

/* ===== KPI 统计 ===== */
router.get('/stats', (req, res) => {
  scanPartnerAlerts();
  const all = db.prepare('SELECT * FROM t_sm_suppliers').all();
  const ratings = { 优质: 0, 合格: 0, 待整改: 0, 不合格: 0 };
  all.forEach(s => { if (ratings[s.rating] != null) ratings[s.rating]++; });
  const alerts = db.prepare(`SELECT COUNT(*) n FROM t_cm_alerts WHERE target_type='supplier' AND status='待处理'`).get().n;
  const pending = db.prepare(`SELECT COUNT(*) n FROM t_cm_applies WHERE target_type='supplier' AND status='审批中'`).get().n;
  const month = now().slice(0, 7);
  return success(res, {
    total: all.length,
    cooperating: all.filter(s => s.status === '合作中').length,
    standby: all.filter(s => s.status === '备选').length,
    rectify: all.filter(s => s.status === '待整改').length,
    frozen: all.filter(s => ['已停用', '已淘汰'].includes(s.status)).length,
    ratings, alerts, pending,
    month_new: all.filter(s => (s.created_at || '').slice(0, 7) === month).length,
    po_amount: all.reduce((a, s) => a + (s.po_amount || 0), 0),
    review_due: all.filter(s => s.next_review_date && s.next_review_date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) && !['已停用', '已淘汰'].includes(s.status)).length
  });
});

/* ===== 风险预警 ===== */
router.get('/alerts', (req, res) => {
  const n = scanPartnerAlerts();
  const rows = db.prepare(`SELECT * FROM t_cm_alerts WHERE target_type='supplier' ORDER BY status, id DESC`).all();
  return success(res, { rows, scanned: n });
});

/* ===== 审批工单列表 ===== */
router.get('/applies', (req, res) => {
  const { status, biz_type } = req.query;
  let sql = `SELECT * FROM t_cm_applies WHERE target_type='supplier'`;
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
  // 权限检查: 仅行政部可发起供应商申请
  if (!canAccess(u.role, u.dept, 'createSupplierApplication')) {
    return error(res, 403, '仅行政部可发起供应商申请');
  }
  const { biz_type, target_id, form = {}, reason } = req.body;
  const t = now();
  if (!biz_type) return error(res, 400, '业务类型不能为空');

  if (biz_type === 'supp_new') {
    if (!form.name || !form.name.trim()) return error(res, 400, '供应商名称不能为空');
    // AI查重: 同一企业仅允许一条有效备案
    const dup1 = db.prepare(`SELECT id FROM t_sm_suppliers WHERE name = ?`).get(form.name.trim());
    if (dup1) return error(res, 400, `查重失败: 供应商「${form.name.trim()}」已备案，禁止重复准入`);
    if (form.credit_code) {
      const dup2 = db.prepare(`SELECT id FROM t_sm_suppliers WHERE credit_code = ? AND credit_code != ''`).get(form.credit_code.trim());
      if (dup2) return error(res, 400, '查重失败: 统一社会信用代码已备案');
    }
    const dup3 = db.prepare(`SELECT id FROM t_cm_applies WHERE target_type='supplier' AND biz_type='supp_new' AND status='审批中' AND json_extract(form_data,'$.name') = ?`).get(form.name.trim());
    if (dup3) return error(res, 400, '查重失败: 该供应商准入申请正在审批中');
    if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone.trim())) return error(res, 400, '联系电话格式不正确(11位手机号)');
    // AI资质预警: 准入时资质已过期
    if (form.license_expiry) {
      try {
        const dl = Math.ceil((new Date(form.license_expiry + 'T00:00:00') - new Date()) / 86400000);
        if (dl < 0) return error(res, 400, `AI资质校验失败: 营业执照已过期 ${-dl} 天，不可准入`);
      } catch { }
    }
  } else {
    if (!target_id) return error(res, 400, '缺少目标供应商');
    const s = db.prepare('SELECT * FROM t_sm_suppliers WHERE id = ?').get(target_id);
    if (!s) return error(res, 404, '供应商不存在');
    if (['已停用', '已淘汰'].includes(s.status)) return error(res, 400, `供应商已${s.status}，不可发起该业务`);
    if (biz_type === 'supp_review') {
      // 年审仅业务中心/管理层/超管发起
      const u2 = req.user;
      if (!(u2.role === '超级管理员' || ['总经理', '副总'].includes(u2.role) || (u2.role === '部门经理' && u2.dept === '市场部') || u2.role === '销售总监')) {
        return error(res, 403, '年审仅采购业务管理员可发起');
      }
      if (!form.rating || !['优质', '合格', '待整改', '不合格'].includes(form.rating)) return error(res, 400, '请选择年审评定结果');
    }
    if (biz_type === 'supp_rating' && !form.rating) return error(res, 400, '请选择目标评级');
    if (biz_type === 'supp_disable' && !['停用', '淘汰'].includes(form.disable_type)) return error(res, 400, '请选择停用或淘汰类型');
  }

  const steps = buildPartnerFlow(biz_type, { bankChange: !!(form.bank || form.account) });
  if (!steps.length) return error(res, 400, '未知业务类型');
  const id = genId('GA');
  db.prepare(`INSERT INTO t_cm_applies (id,target_type,biz_type,target_id,target_name,form_data,reason,current_step,steps,status,applicant_id,applicant_name,applicant_dept,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, 'supplier', biz_type, target_id || '', form.name || '', JSON.stringify(form), reason || '', 1,
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

/* ===== 台账CSV导出 ===== */
router.get('/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_sm_suppliers ORDER BY created_at DESC').all();
  const head = ['供应商编号', '名称', '信用代码', '法人', '联系人', '电话', '开户行', '账号', '品类', '合作类型', '状态', '评级', 'AI评分', '资质到期', '下次年审', '采购额', '采购单数', '入库额', '退货额', '建档时间'];
  const body = rows.map(s => [s.id, s.name, s.credit_code, s.legal_person, s.contact, s.phone, s.bank, s.account, s.category, s.coop_type, s.status, s.rating, s.score, s.license_expiry, s.next_review_date, s.po_amount, s.po_count, s.grn_amount, s.return_amount, s.created_at]);
  const csv = '\ufeff' + [head, ...body].map(l => l.map(x => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=suppliers.csv');
  return res.send(csv);
});

/* ===== 供应商详情 (含工单/关联采购订单/AI评分) ===== */
router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM t_sm_suppliers WHERE id = ?').get(req.params.id);
  if (!s) return error(res, 404, '供应商不存在');
  const applies = db.prepare(`SELECT * FROM t_cm_applies WHERE target_type='supplier' AND (target_id = ? OR target_name = ?) ORDER BY created_at DESC`).all(s.id, s.name);
  applies.forEach(a => { a.steps = safeParse(a.steps, []); a.form_data = safeParse(a.form_data, {}); });
  const orders = db.prepare(`SELECT id, po_no, total_with_tax, status, pay_status, created_at FROM t_tr_po WHERE supplier_name = ? ORDER BY created_at DESC LIMIT 20`).all(s.name);
  const grns = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total_with_tax),0) amt FROM t_tr_grn WHERE supplier_name = ? AND status='已生效'`).get(s.name);
  const ai = recalcSupplier(s.id);
  return success(res, { supplier: s, applies, orders, grns, ai });
});

/* ===== AI评分重算 ===== */
router.post('/:id/recalc', (req, res) => {
  const r = recalcSupplier(req.params.id);
  if (!r) return error(res, 404, '供应商不存在');
  return success(res, r, `AI评分 ${r.score} 分，建议评级: ${r.suggest_rating}`);
});

module.exports = router;
