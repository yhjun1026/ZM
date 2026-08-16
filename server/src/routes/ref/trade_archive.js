/**
 * 行政归档中心路由 (PRD 6.x 归档专项)
 * 客户/供应商模块所有完结审批单自动归集; 行政部专属归档确认/编号/借阅/月度汇总
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now, safeParse } = require('../../compat/helpers');

router.use(authMiddleware);

// 归档列表 (全员可查, 行政可操作)
router.get('/', (req, res) => {
  const { target_type, biz_type, status, keyword } = req.query;
  let sql = `SELECT * FROM t_cm_archive WHERE 1=1`;
  const args = [];
  if (target_type) { sql += ` AND target_type = ?`; args.push(target_type); }
  if (biz_type) { sql += ` AND biz_type = ?`; args.push(biz_type); }
  if (status) { sql += ` AND status = ?`; args.push(status); }
  if (keyword) { sql += ` AND (target_name LIKE ? OR apply_no LIKE ? OR archive_no LIKE ?)`; const k = '%' + keyword + '%'; args.push(k, k, k); }
  sql += ` ORDER BY id DESC`;
  const rows = db.prepare(sql).all(...args);
  rows.forEach(x => { x.snapshot = safeParse(x.snapshot, {}); x.borrow_log = safeParse(x.borrow_log, []); });
  return success(res, rows);
});

// 归档统计
router.get('/stats', (req, res) => {
  const all = db.prepare('SELECT * FROM t_cm_archive').all();
  return success(res, {
    total: all.length,
    pending: all.filter(x => x.status === '待归档').length,
    filed: all.filter(x => x.status === '已归档').length,
    borrowed: all.filter(x => x.status === '借阅中').length,
    customers: all.filter(x => x.target_type === 'customer').length,
    suppliers: all.filter(x => x.target_type === 'supplier').length
  });
});

// 月度归档汇总报表 (每月末核对确认)
router.get('/monthly', (req, res) => {
  const rows = db.prepare(`SELECT substr(created_at, 1, 7) m, target_type, COUNT(*) n
    FROM t_cm_archive GROUP BY m, target_type ORDER BY m DESC`).all();
  const norm = (m) => { // now()为非补零格式(如2026-8-16), substr截取为'2026-8-', 统一规范化为YYYY-MM
    const mt = String(m || '').match(/^(\d{4})-(\d{1,2})/);
    return mt ? mt[1] + '-' + String(mt[2]).padStart(2, '0') : String(m || '');
  };
  const map = {};
  rows.forEach(x => {
    const key = norm(x.m);
    if (!map[key]) map[key] = { month: key, customer: 0, supplier: 0, total: 0 };
    map[key][x.target_type] = x.n;
    map[key].total += x.n;
  });
  return success(res, Object.values(map));
});

// 行政归档确认 (编制档案编号) — 仅行政部
router.post('/:id/file', (req, res) => {
  const u = req.user;
  if (!(u.dept === '行政部' || u.role === '超级管理员')) return error(res, 403, '归档确认为行政部专属权限');
  const row = db.prepare('SELECT * FROM t_cm_archive WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '归档记录不存在');
  if (row.status === '已归档') return error(res, 400, '该档案已归档');
  const no = genId(row.target_type === 'customer' ? 'KHGD' : 'GYSGD');
  db.prepare(`UPDATE t_cm_archive SET archive_no=?, status='已归档', filed_by=?, filed_at=? WHERE id=?`)
    .run(no, u.name, now(), row.id);
  return success(res, { archive_no: no }, `归档完成，档案编号 ${no}`);
});

// 借阅申请登记 (其他部门申请借阅查看)
router.post('/:id/borrow', (req, res) => {
  const u = req.user;
  const row = db.prepare('SELECT * FROM t_cm_archive WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '归档记录不存在');
  if (row.status === '待归档') return error(res, 400, '档案尚未完成归档，不可借阅');
  if (row.status === '借阅中') return error(res, 400, '档案借阅中，请稍后再试');
  const log = safeParse(row.borrow_log, []);
  log.push({ borrower: u.name, dept: u.dept, time: now(), purpose: req.body.purpose || '业务查阅' });
  db.prepare(`UPDATE t_cm_archive SET status='借阅中', borrow_log=? WHERE id=?`).run(JSON.stringify(log), row.id);
  return success(res, null, '借阅登记成功，档案仅可查阅不可修改');
});

// 归还
router.post('/:id/return', (req, res) => {
  const row = db.prepare('SELECT * FROM t_cm_archive WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '归档记录不存在');
  if (row.status !== '借阅中') return error(res, 400, '该档案不在借阅中');
  const log = safeParse(row.borrow_log, []);
  if (log.length) log[log.length - 1].returned_at = now();
  db.prepare(`UPDATE t_cm_archive SET status='已归档', borrow_log=? WHERE id=?`).run(JSON.stringify(log), row.id);
  return success(res, null, '档案已归还');
});

module.exports = router;
