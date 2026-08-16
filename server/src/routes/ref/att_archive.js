/**
 * 请假&出差 统一归档管理路由 (PRD 6.x: 行政部为唯一归档管理部门)
 * 完结单据自动归集 / 归档确认+档案编号 / 台账查询筛选 / 月度汇总 / CSV导出 / 归档标记
 * 行政部可操作(查看/确认/导出)，总经理/超级管理员可查看归档详情
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, genId, now } = require('../../compat/helpers');
const att = require('../../compat/att_common');

router.use(authMiddleware);

// 行政部 或 总经理/副总/超级管理员 可查看
function canView(u) {
  return u.dept === '行政部' || ['总经理', '副总', '超级管理员'].includes(u.role);
}
// 仅行政部可操作(确认/标记/导出)
function canManage(u) {
  return u.dept === '行政部';
}

/* 归档台账列表 (行政部 + 总经理/超管可查看) */
router.get('/', (req, res) => {
  const u = req.user;
  if (!canView(u)) return error(res, 403, '归档台账仅行政部及总经理/副总可查看');
  const where = []; const args = [];
  if (req.query.status) { where.push('a.status = ?'); args.push(req.query.status); }
  if (req.query.form_type) { where.push('a.form_type = ?'); args.push(req.query.form_type); }
  if (req.query.dept) { where.push('a.dept = ?'); args.push(req.query.dept); }
  if (req.query.name) { where.push("a.applicant LIKE '%' || ? || '%'"); args.push(req.query.name); }
  if (req.query.month) { where.push(att.mon('a.created_at') + '=?'); args.push(att.normMonth(req.query.month)); }
  const rows = db.prepare(`SELECT a.* FROM t_att_archive a ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.created_at DESC LIMIT 500`).all(...args);
  rows.forEach(r => { r.snapshot = safeParse(r.snapshot, {}); });
  return success(res, rows);
});

/* 归档统计 (行政部 + 总经理/超管可查看) */
router.get('/stats', (req, res) => {
  const u = req.user;
  if (!canView(u)) return error(res, 403, '归档统计仅行政部及总经理可查看');
  const kpi = {
    total: db.prepare(`SELECT COUNT(*) n FROM t_att_archive`).get().n,
    pending: db.prepare(`SELECT COUNT(*) n FROM t_att_archive WHERE status='待归档'`).get().n,
    filed: db.prepare(`SELECT COUNT(*) n FROM t_att_archive WHERE status='已归档'`).get().n,
    abnormal: db.prepare(`SELECT COUNT(*) n FROM t_att_archive WHERE status='异常'`).get().n,
    leave_cnt: db.prepare(`SELECT COUNT(*) n FROM t_att_archive WHERE form_type='leave'`).get().n,
    trip_cnt: db.prepare(`SELECT COUNT(*) n FROM t_att_archive WHERE form_type='trip'`).get().n
  };
  const byDept = db.prepare(`SELECT dept t, COUNT(*) n FROM t_att_archive GROUP BY dept ORDER BY n DESC`).all();
  const alerts = att.scanAttAlerts();
  return success(res, { kpi, byDept, alerts });
});

/* 月度归档汇总报表 (行政部 + 总经理/超管可查看) */
router.get('/monthly', (req, res) => {
  const u = req.user;
  if (!canView(u)) return error(res, 403, '月度汇总仅行政部及总经理可查看');
  const rows = db.prepare(`SELECT created_at m, form_type, COUNT(*) n FROM t_att_archive GROUP BY ${att.mon('created_at')}, form_type`).all();
  const norm = (m) => att.normMonth(String(m).slice(0, 7));
  const map = {};
  rows.forEach(x => {
    const k = norm(String(x.m).slice(0, 7));
    if (!map[k]) map[k] = { month: k, leave: 0, trip: 0, total: 0 };
    map[k][x.form_type] = (map[k][x.form_type] || 0) + x.n;
    map[k].total += x.n;
  });
  return success(res, Object.values(map).sort((a, b) => a.month < b.month ? -1 : 1));
});

/* 归档台账CSV导出 (行政部专属) */
router.get('/export', (req, res) => {
  const u = req.user;
  if (!canManage(u)) return error(res, 403, '归档导出仅行政部可操作');
  const rows = db.prepare(`SELECT a.* FROM t_att_archive a ORDER BY a.created_at DESC LIMIT 2000`).all();
  const esc = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const head = ['档案编号', '单据类型', '单据号', '申请人', '部门', '单据状态', '归档状态', '归档人', '归档时间', '归档原因', '入台账时间'];
  const lines = [head.map(esc).join(',')];
  rows.forEach(r => lines.push([
    r.archive_no || '—', r.form_type === 'leave' ? '请假单' : '出差单', r.form_id, r.applicant, r.dept,
    (safeParse(r.snapshot, {}).status) || '', r.status, r.filed_by || '', r.filed_at || '',
    (safeParse(r.snapshot, {}).reason) || '', r.created_at || ''
  ].map(esc).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="att_archive_' + Date.now() + '.csv"');
  return res.send('\uFEFF' + lines.join('\r\n'));
});

/* 归档详情（含原始表单全部内容）— 行政部 + 总经理/超管可查看 */
router.get('/:id/detail', (req, res) => {
  const u = req.user;
  if (!canView(u)) return error(res, 403, '归档详情仅行政部及总经理可查看');
  const row = db.prepare('SELECT * FROM t_att_archive WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '归档记录不存在');
  row.snapshot = safeParse(row.snapshot, {});
  // 获取原始表单完整信息
  const tbl = row.form_type === 'leave' ? 't_lv_forms' : 't_tr_forms';
  const form = db.prepare(`SELECT * FROM ${tbl} WHERE id = ?`).get(row.form_id);
  if (form) {
    form.flow = safeParse(form.flow, []);
    form.ai_check = safeParse(form.ai_check, {});
    form.attachments = safeParse(form.attachments, []);
  }
  row.original_form = form;
  return success(res, row);
});

/* 归档确认: 生成档案编号 (行政专属, PRD 6.4) */
router.post('/:id/file', (req, res) => {
  const u = req.user;
  if (!canManage(u)) return error(res, 403, '归档确认仅行政部可操作');
  const row = db.prepare('SELECT * FROM t_att_archive WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '归档记录不存在');
  if (row.status === '已归档') return error(res, 400, '该单据已归档');
  const archive_no = genId(row.form_type === 'leave' ? 'QJGD' : 'CCGD');
  // 同步单据状态: 已销假/已销差 → 已归档
  const tbl = row.form_type === 'leave' ? 't_lv_forms' : 't_tr_forms';
  const form = db.prepare(`SELECT * FROM ${tbl} WHERE id = ?`).get(row.form_id);
  if (form && ['已销假', '已销差', '已驳回', '已作废'].includes(form.status)) {
    db.prepare(`UPDATE ${tbl} SET archive_no=?, archived_at=?, status='已归档', updated_at=? WHERE id=?`)
      .run(archive_no, now(), now(), row.form_id);
  }
  db.prepare(`UPDATE t_att_archive SET status='已归档', archive_no=?, filed_by=?, filed_at=?, remark=? WHERE id=?`)
    .run(archive_no, u.name, now(), String(req.body.remark || ''), row.id);
  return success(res, { archive_no }, `归档确认成功, 档案编号 ${archive_no}`);
});

/* 归档标记管理: 已归档/待归档/异常 (行政专属) */
router.post('/:id/mark', (req, res) => {
  const u = req.user;
  if (!canManage(u)) return error(res, 403, '归档标记仅行政部可操作');
  const st = req.body.status;
  if (!['待归档', '已归档', '异常'].includes(st)) return error(res, 400, '标记仅支持: 待归档/已归档/异常');
  const row = db.prepare('SELECT * FROM t_att_archive WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '归档记录不存在');
  db.prepare(`UPDATE t_att_archive SET status=?, remark=? WHERE id=?`).run(st, String(req.body.remark || ''), row.id);
  return success(res, null, '归档标记已更新为: ' + st);
});

module.exports = router;
