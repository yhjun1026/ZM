/**
 * 出差模块路由 (PRD: OA智能办公平台-出差模块 V1.0)
 * 4类出差自动判定 / AI时长核算+时间冲突检测 / 分级审批 / 销差闭环 / 行政统一归档
 * 数据统计仅行政部可查看
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, genId, now } = require('../../compat/helpers');
const att = require('../../compat/att_common');

router.use(authMiddleware);

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
  if (!['超级管理员', '总经理', '副总'].includes(u.role) && u.dept !== '行政部') return error(res, 403, '出差数据统计仅行政部可查看');
  const month = att.normMonth(req.query.month || now());
  const M = att.mon('created_at');
  const kpi = {
    month,
    total: db.prepare(`SELECT COUNT(*) n FROM t_tr_forms WHERE ${M}=?`).get(month).n,
    pending: db.prepare(`SELECT COUNT(*) n FROM t_tr_forms WHERE status IN ('待审批','审批中')`).get().n,
    approved: db.prepare(`SELECT COUNT(*) n FROM t_tr_forms WHERE status IN ('审批通过','已销差','已归档')`).get().n,
    settle_wait: db.prepare(`SELECT COUNT(*) n FROM t_tr_forms WHERE status='审批通过'`).get().n,
    settled: db.prepare(`SELECT COUNT(*) n FROM t_tr_forms WHERE status IN ('已销差','已归档')`).get().n,
    days_month: db.prepare(`SELECT IFNULL(SUM(days),0) n FROM t_tr_forms WHERE ${M}=? AND status IN ('审批通过','已销差','已归档')`).get(month).n,
    trips_active: db.prepare(`SELECT COUNT(*) n FROM t_tr_forms WHERE status='审批通过' AND date(start_date) <= date('now','localtime') AND date(end_date) >= date('now','localtime')`).get().n
  };
  const byType = db.prepare(`SELECT trip_type t, COUNT(*) n, IFNULL(SUM(days),0) d FROM t_tr_forms GROUP BY trip_type`).all();
  const byDept = db.prepare(`SELECT dept t, COUNT(*) n, IFNULL(SUM(days),0) d FROM t_tr_forms GROUP BY dept ORDER BY n DESC`).all();
  const byStatus = db.prepare(`SELECT status t, COUNT(*) n FROM t_tr_forms GROUP BY status`).all();
  const byPerson = db.prepare(`SELECT applicant t, dept, COUNT(*) n, IFNULL(SUM(days),0) d FROM t_tr_forms
    GROUP BY applicant ORDER BY d DESC LIMIT 10`).all();
  const trendRaw = db.prepare(`SELECT created_at m, COUNT(*) n, IFNULL(SUM(days),0) d FROM t_tr_forms
    WHERE created_at >= datetime('now','localtime','-6 month') GROUP BY ${M}`).all();
  const norm = (m) => att.normMonth(String(m).slice(0, 7));
  const tmap = {};
  trendRaw.forEach(x => { const k = norm(String(x.m).slice(0, 7)); if (!tmap[k]) tmap[k] = { month: k, n: 0, d: 0 }; tmap[k].n += x.n; tmap[k].d += x.d; });
  const trend = Object.values(tmap).sort((a, b) => a.month < b.month ? -1 : 1);
  return success(res, { kpi, byType, byDept, byStatus, byPerson, trend });
});

/* 列表 (数据范围隔离) */
router.get('/', (req, res) => {
  const u = req.user;
  const scope = att.listScopeAtt(u);
  const where = []; const args = [];
  if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
  if (req.query.type) { where.push('trip_type = ?'); args.push(req.query.type); }
  if (req.query.dept) { where.push('dept = ?'); args.push(req.query.dept); }
  if (req.query.name) { where.push("applicant LIKE '%' || ? || '%'"); args.push(req.query.name); }
  if (req.query.month) { where.push(att.mon('created_at') + ' = ?'); args.push(att.normMonth(req.query.month)); }
  if (scope === 'self') { where.push('applicant_id = ?'); args.push(u.id); }
  else if (scope === 'dept') { where.push('dept = ?'); args.push(u.dept); }
  const rows = db.prepare(`SELECT * FROM t_tr_forms ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT 500`).all(...args);
  const today = now().slice(0, 10);
  rows.forEach(r => {
    r.flow = safeParse(r.flow, []);
    r.ai_check = safeParse(r.ai_check, {});
    r.attachments = safeParse(r.attachments, []);
    // 状态扩展: 审批通过且行程已结束 → 已完成出差(待销差)
    r.trip_phase = (r.status === '审批通过' && String(r.end_date).slice(0, 10) < today) ? '已完成出差' : '';
    r._scope = scope;
  });
  return success(res, rows);
});

/* 详情 */
router.get('/:id', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_tr_forms WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '申请单不存在');
  const scope = att.listScopeAtt(u);
  if (scope === 'self' && row.applicant_id !== u.id) return error(res, 403, '仅可查看本人单据');
  if (scope === 'dept' && row.dept !== u.dept) return error(res, 403, '仅可查看本部门单据');
  row.flow = safeParse(row.flow, []);
  row.ai_check = safeParse(row.ai_check, {});
  row.attachments = safeParse(row.attachments, []);
  const arc = db.prepare('SELECT archive_no, status a_status, filed_by, filed_at FROM t_att_archive WHERE form_type=? AND form_id=?').get('trip', row.id);
  if (arc) row.archive = arc;
  return success(res, row);
});

/* 提交申请 (AI类型判定+条件必填+冲突拦截; draft=1 存草稿) */
router.post('/', (req, res) => {
  const u = req.user;
  const b = req.body || {};
  if (!b.start_date || !b.end_date) return error(res, 400, '请填写出差起止时间');
  const days = Number(b.days) || 0;
  if (days <= 0) return error(res, 400, '出差天数必须大于0');
  if (!String(b.purpose || '').trim()) return error(res, 400, '请填写出差事由');
  if (!String(b.task || '').trim()) return error(res, 400, '请填写工作任务');
  if (!String(b.counterpart || '').trim()) return error(res, 400, '请填写对接单位/人员');
  if (!String(b.contact || '').trim()) return error(res, 400, '请填写联系方式');
  const form = { ...b, applicant: u.name, dept: u.dept, position: u.level || '', role: u.role };
  const trip_type0 = att.classifyTrip(form);
  if (b.draft) {
    const id = genId('CC');
    db.prepare(`INSERT INTO t_tr_forms (id, applicant, applicant_id, dept, position, trip_type,
      destination, is_local, cross_province, start_date, end_date, days, purpose, task, counterpart,
      contact, companions, itinerary, budget_note, remark, attachments, ai_check, status, flow, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, '{}', '草稿', '[]', ?, ?)`)
      .run(id, u.name, u.id, u.dept, form.position, trip_type0,
        b.destination || '', b.is_local ? 1 : 0, b.cross_province ? 1 : 0,
        b.start_date, b.end_date, days, b.purpose || '', b.task || '', b.counterpart || '',
        b.contact || '', b.companions || '', b.itinerary || '', b.budget_note || '', b.remark || '',
        JSON.stringify(Array.isArray(b.attachments) ? b.attachments : []), now(), now());
    return success(res, { id }, '草稿已保存');
  }
  // AI智能校验: 类型判定+条件必填+时间冲突
  const check = att.aiCheckTrip(u, b);
  if (!check.ok) return error(res, 400, check.msg);
  const id = genId('CC');
  const flow = att.buildAttFlow('trip', { ...form, days, cross_province: b.cross_province ? 1 : 0, trip_type: check.trip_type });
  db.prepare(`INSERT INTO t_tr_forms (id, applicant, applicant_id, dept, position, trip_type,
    destination, is_local, cross_province, start_date, end_date, days, purpose, task, counterpart,
    contact, companions, itinerary, budget_note, remark, attachments, ai_check, status, flow, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, u.name, u.id, u.dept, form.position, check.trip_type,
      String(b.destination).trim(), b.is_local ? 1 : 0, b.cross_province ? 1 : 0,
      b.start_date, b.end_date, days, b.purpose || '', b.task || '', b.counterpart || '',
      b.contact || '', b.companions || '', b.itinerary || '', b.budget_note || '', b.remark || '',
      JSON.stringify(Array.isArray(b.attachments) ? b.attachments : []),
      JSON.stringify(check.check), '待审批', JSON.stringify(flow), now(), now());
  return success(res, { id, trip_type: check.trip_type, flow, warnings: check.check.warnings }, `出差申请已提交, AI判定类型: ${check.trip_type}`);
});

/* 作废 (本人, 草稿/待审批) */
router.post('/:id/void', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_tr_forms WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '申请单不存在');
  if (row.applicant_id !== u.id) return error(res, 403, '仅申请人可作废');
  if (!['草稿', '待审批'].includes(row.status)) return error(res, 400, '当前状态不可作废');
  db.prepare(`UPDATE t_tr_forms SET status='已作废', updated_at=? WHERE id=?`).run(now(), row.id);
  const fresh = db.prepare('SELECT * FROM t_tr_forms WHERE id = ?').get(row.id);
  att.archiveAttForm('trip', fresh, '作废归档');
  return success(res, null, '申请单已作废并转入行政归档台账');
});

/* 审批通过 (越级403) */
router.post('/:id/approve', (req, res) => {
  const r = att.attApprove(res, req, 't_tr_forms', req.params.id);
  if (r.code !== 200) return error(res, r.code, r.msg);
  return success(res, null, r.msg);
});

/* 驳回 (意见必填, 驳回归档) */
router.post('/:id/reject', (req, res) => {
  const r = att.attReject(res, req, 't_tr_forms', req.params.id, 'trip');
  if (r.code !== 200) return error(res, r.code, r.msg);
  return success(res, null, r.msg);
});

/* 销差 (本人或行政部代登记; 实际天数+工作总结+成果反馈) */
router.post('/:id/settle', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_tr_forms WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '申请单不存在');
  if (row.applicant_id !== u.id && u.dept !== '行政部') return error(res, 403, '仅申请人可销差, 行政部可介入代登记');
  if (row.status !== '审批通过') return error(res, 400, '仅审批通过的出差单可销差');
  if (!String(req.body.summary || '').trim()) return error(res, 400, '销差必须填写出差工作总结');
  if (!String(req.body.feedback || '').trim()) return error(res, 400, '销差必须填写成果反馈');
  const r = att.settleAttForm('trip', row, req.body || {}, u);
  if (r.code !== 200) return error(res, r.code, r.msg);
  return success(res, { diff: r.diff }, r.msg);
});

module.exports = router;
