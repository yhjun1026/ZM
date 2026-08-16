/**
 * 请假模块路由 (PRD: OA智能办公平台-请假模块 V1.0)
 * 8类假期 / AI天数核算(0.5天精度,剔除周末节假日) / 额度校验 / 分级审批 / 销假闭环 / 行政统一归档
 * 数据统计仅行政部可查看
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, genId, now } = require('../../compat/helpers');
const att = require('../../compat/att_common');

router.use(authMiddleware);

/* 我的假期额度 */
router.get('/quota', (req, res) => {
  const u = req.user;
  const quota = {};
  Object.keys(att.DEFAULT_QUOTA || { 年假: 5, 事假: 10, 病假: 15, 调休假: 5 }).forEach(t => {
    quota[t] = att.getQuotaLeft(u.id, u.name, t);
  });
  ['婚假', '产假', '陪产假', '丧假'].forEach(t => { quota[t] = { unlimited: true }; });
  return success(res, quota);
});

/* 风险预警 (行政部+高管可看) */
router.get('/alerts', (req, res) => {
  const u = req.user;
  if (!(u.dept === '行政部' || ['总经理', '副总', '超级管理员'].includes(u.role))) {
    return error(res, 403, '风险预警仅行政部与公司管理层可查看');
  }
  return success(res, att.scanAttAlerts());
});

/* 统计报表 — 仅行政部 (PRD: 请假出差数据统计只能由行政部完成) */
router.get('/stats', (req, res) => {
  const u = req.user;
  if (!['超级管理员', '总经理', '副总'].includes(u.role) && u.dept !== '行政部') return error(res, 403, '请假数据统计仅行政部可查看');
  const month = att.normMonth(req.query.month || now());
  const M = att.mon('created_at');
  const kpi = {
    month,
    total: db.prepare(`SELECT COUNT(*) n FROM t_lv_forms WHERE ${M}=?`).get(month).n,
    pending: db.prepare(`SELECT COUNT(*) n FROM t_lv_forms WHERE status IN ('待审批','审批中')`).get().n,
    approved: db.prepare(`SELECT COUNT(*) n FROM t_lv_forms WHERE status IN ('审批通过','已销假','已归档')`).get().n,
    settle_wait: db.prepare(`SELECT COUNT(*) n FROM t_lv_forms WHERE status='审批通过'`).get().n,
    settled: db.prepare(`SELECT COUNT(*) n FROM t_lv_forms WHERE status IN ('已销假','已归档')`).get().n,
    diff_cnt: db.prepare(`SELECT COUNT(*) n FROM t_lv_forms WHERE actual_days > 0 AND actual_days <> days`).get().n,
    days_month: db.prepare(`SELECT IFNULL(SUM(days),0) n FROM t_lv_forms WHERE ${M}=? AND status IN ('审批通过','已销假','已归档')`).get(month).n
  };
  const byType = db.prepare(`SELECT leave_type t, COUNT(*) n, IFNULL(SUM(days),0) d FROM t_lv_forms GROUP BY leave_type ORDER BY n DESC`).all();
  const byDept = db.prepare(`SELECT dept t, COUNT(*) n, IFNULL(SUM(days),0) d FROM t_lv_forms GROUP BY dept ORDER BY n DESC`).all();
  const byStatus = db.prepare(`SELECT status t, COUNT(*) n FROM t_lv_forms GROUP BY status`).all();
  const trendRaw = db.prepare(`SELECT created_at m, COUNT(*) n, IFNULL(SUM(days),0) d FROM t_lv_forms
    WHERE created_at >= datetime('now','localtime','-6 month') GROUP BY ${M}`).all();
  const tmap = {};
  trendRaw.forEach(x => { const k = att.normMonth(String(x.m).slice(0, 7)); if (!tmap[k]) tmap[k] = { month: k, n: 0, d: 0 }; tmap[k].n += x.n; tmap[k].d += x.d; });
  const trend = Object.values(tmap).sort((a, b) => a.month < b.month ? -1 : 1);
  return success(res, { kpi, byType, byDept, byStatus, trend });
});

/* 列表 (数据范围隔离: 员工本人 / 负责人本部门 / 高管与行政全公司) */
router.get('/', (req, res) => {
  const u = req.user;
  const scope = att.listScopeAtt(u);
  const where = []; const args = [];
  if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
  if (req.query.type) { where.push('leave_type = ?'); args.push(req.query.type); }
  if (req.query.dept) { where.push('dept = ?'); args.push(req.query.dept); }
  if (req.query.name) { where.push("applicant LIKE '%' || ? || '%'"); args.push(req.query.name); }
  if (req.query.month) { where.push(att.mon('created_at') + ' = ?'); args.push(att.normMonth(req.query.month)); }
  if (scope === 'self') { where.push('applicant_id = ?'); args.push(u.id); }
  else if (scope === 'dept') { where.push('dept = ?'); args.push(u.dept); }
  const rows = db.prepare(`SELECT * FROM t_lv_forms ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT 500`).all(...args);
  rows.forEach(r => {
    r.flow = safeParse(r.flow, []);
    r.ai_check = safeParse(r.ai_check, {});
    r.attachments = safeParse(r.attachments, []);
    r._scope = scope;
  });
  return success(res, rows);
});

/* 详情 */
router.get('/:id', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_lv_forms WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '申请单不存在');
  const scope = att.listScopeAtt(u);
  if (scope === 'self' && row.applicant_id !== u.id) return error(res, 403, '仅可查看本人单据');
  if (scope === 'dept' && row.dept !== u.dept) return error(res, 403, '仅可查看本部门单据');
  row.flow = safeParse(row.flow, []);
  row.ai_check = safeParse(row.ai_check, {});
  row.attachments = safeParse(row.attachments, []);
  const arc = db.prepare('SELECT archive_no, status a_status, filed_by, filed_at FROM t_att_archive WHERE form_type=? AND form_id=?').get('leave', row.id);
  if (arc) row.archive = arc;
  return success(res, row);
});

/* 提交申请 (AI校验拦截; draft=1 存草稿) */
router.post('/', (req, res) => {
  const u = req.user;
  const b = req.body || {};
  if (!att.LEAVE_TYPES.includes(b.leave_type)) return error(res, 400, '请假类型不合法');
  if (!b.start_date || !b.end_date) return error(res, 400, '请填写请假起止时间');
  if (!String(b.contact || '').trim()) return error(res, 400, '请填写联系方式');
  if (!String(b.handover || '').trim()) return error(res, 400, '请填写工作交接说明');
  const form = {
    ...b,
    applicant: u.name, dept: u.dept,
    position: u.level || '',
    role: u.role
  };
  if (b.draft) {
    const calc = att.calcLeaveDays(b.start_date, b.start_half, b.end_date, b.end_half);
    const id = genId('QJ');
    db.prepare(`INSERT INTO t_lv_forms (id, applicant, applicant_id, dept, position, leave_type,
      start_date, start_half, end_date, end_half, days, reason, contact, emergency_contact, handover,
      attachments, quota_left, ai_check, status, flow, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, '草稿', '[]', ?, ?)`)
      .run(id, u.name, u.id, u.dept, form.position, b.leave_type,
        b.start_date, b.start_half || '全天', b.end_date, b.end_half || '全天',
        calc.ok ? calc.days : 0, b.reason || '', b.contact || '', b.emergency_contact || '', b.handover || '',
        JSON.stringify(Array.isArray(b.attachments) ? b.attachments : []), 0, '{}', now(), now());
    return success(res, { id }, '草稿已保存, 请在确认后正式提交');
  }
  // AI智能校验
  const check = att.aiCheckLeave(u, b);
  if (!check.ok) return error(res, 400, check.msg);
  const quota = check.check.quota;
  const id = genId('QJ');
  const flow = att.buildAttFlow('leave', { ...form, days: check.days });
  db.prepare(`INSERT INTO t_lv_forms (id, applicant, applicant_id, dept, position, leave_type,
    start_date, start_half, end_date, end_half, days, reason, contact, emergency_contact, handover,
    attachments, quota_left, ai_check, status, flow, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, u.name, u.id, u.dept, form.position, b.leave_type,
      b.start_date, b.start_half || '全天', b.end_date, b.end_half || '全天',
      check.days, b.reason || '', b.contact || '', b.emergency_contact || '', b.handover || '',
      JSON.stringify(Array.isArray(b.attachments) ? b.attachments : []),
      quota.unlimited ? -1 : quota.left, JSON.stringify(check.check),
      '待审批', JSON.stringify(flow), now(), now());
  return success(res, { id, days: check.days, flow, warnings: check.check.warnings }, '请假申请已提交, AI核算' + check.days + '个工作日');
});

/* 提交草稿(正式) */
router.post('/:id/submit', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_lv_forms WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '申请单不存在');
  if (row.applicant_id !== u.id) return error(res, 403, '仅申请人可提交');
  if (row.status !== '草稿') return error(res, 400, '仅草稿状态可提交');
  const check = att.aiCheckLeave(u, row);
  if (!check.ok) return error(res, 400, check.msg);
  const flow = att.buildAttFlow('leave', { ...row, days: check.days, role: u.role });
  db.prepare(`UPDATE t_lv_forms SET days=?, ai_check=?, status='待审批', flow=?, updated_at=? WHERE id=?`)
    .run(check.days, JSON.stringify(check.check), JSON.stringify(flow), now(), row.id);
  return success(res, { id: row.id }, '请假申请已提交');
});

/* 作废 (本人, 草稿/待审批) */
router.post('/:id/void', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_lv_forms WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '申请单不存在');
  if (row.applicant_id !== u.id) return error(res, 403, '仅申请人可作废');
  if (!['草稿', '待审批'].includes(row.status)) return error(res, 400, '当前状态不可作废');
  db.prepare(`UPDATE t_lv_forms SET status='已作废', updated_at=? WHERE id=?`).run(now(), row.id);
  const fresh = db.prepare('SELECT * FROM t_lv_forms WHERE id = ?').get(row.id);
  att.archiveAttForm('leave', fresh, '作废归档');
  return success(res, null, '申请单已作废并转入行政归档台账');
});

/* 审批通过 (越级403) */
router.post('/:id/approve', (req, res) => {
  const r = att.attApprove(res, req, 't_lv_forms', req.params.id);
  if (r.code !== 200) return error(res, r.code, r.msg);
  return success(res, null, r.msg);
});

/* 驳回 (意见必填, 驳回归档) */
router.post('/:id/reject', (req, res) => {
  const r = att.attReject(res, req, 't_lv_forms', req.params.id, 'leave');
  if (r.code !== 200) return error(res, r.code, r.msg);
  return success(res, null, r.msg);
});

/* 销假 (本人或行政部代登记; AI对比差异标注) */
router.post('/:id/settle', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_lv_forms WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '申请单不存在');
  if (row.applicant_id !== u.id && u.dept !== '行政部') return error(res, 403, '仅申请人可销假, 行政部可介入代登记');
  if (row.status !== '审批通过') return error(res, 400, '仅审批通过的请假单可销假');
  const r = att.settleAttForm('leave', row, req.body || {}, u);
  if (r.code !== 200) return error(res, r.code, r.msg);
  return success(res, { diff: r.diff }, r.msg + (r.diff !== 0 ? `(申请${row.days}天/实际${req.body.actual_days}天, 差异已标注)` : ''));
});

/* AI重算天数 (表单实时预览用) */
router.post('/calc-days', (req, res) => {
  const b = req.body || {};
  const r = att.calcLeaveDays(b.start_date, b.start_half, b.end_date, b.end_half);
  if (!r.ok) return error(res, 400, r.msg);
  return success(res, r);
});

module.exports = router;
