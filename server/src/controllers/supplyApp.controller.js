/**
 * 用品申领 controller（参考 daily.js /supplies 段，6 端点）
 * 数据表（010 迁移建立）：supplies / supply_apps
 */
const db = require('../db');
const { ok, okWith, bad, notfound, buildWhere, empId } = require('../utils/resp');

function listSupplies(req, res) {
  const { keyword, category, status } = req.query;
  let sql = 'SELECT * FROM supplies WHERE 1=1';
  const p = [];
  if (keyword) { sql += ' AND name LIKE ?'; p.push('%' + keyword + '%'); }
  if (category) { sql += ' AND category=?'; p.push(category); }
  if (status) { sql += ' AND status=?'; p.push(status); }
  sql += ' ORDER BY id DESC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function createSupply(req, res) {
  const { name, category, unit, stock, warn_qty } = req.body;
  if (!name) return res.json(bad('名称必填'));
  const r = db.prepare(`INSERT INTO supplies (name, category, unit, stock, warn_qty) VALUES (?,?,?,?,?)`)
    .run(name, category || '办公耗材', unit || '件', Number(stock) || 0, Number(warn_qty) || 0);
  return res.json(ok({ id: r.lastInsertRowid }, '已创建'));
}
function updateSupply(req, res) {
  const { name, category, unit, stock, warn_qty, status } = req.body;
  const r = db.prepare(`UPDATE supplies SET name=COALESCE(?,name), category=COALESCE(?,category), unit=COALESCE(?,unit),
    stock=COALESCE(?,stock), warn_qty=COALESCE(?,warn_qty), status=COALESCE(?,status) WHERE id=?`)
    .run(name, category, unit, stock, warn_qty, status, req.params.id);
  return res.json(okWith({ changes: r.changes }, r.changes ? '已更新' : '无需更新'));
}
function applySupply(req, res) {
  const { supply_id, qty, reason } = req.body;
  if (!supply_id || !qty) return res.json(bad('物品/数量必填'));
  const s = db.prepare('SELECT * FROM supplies WHERE id=?').get(supply_id);
  if (!s) return res.json(notfound('物品不存在'));
  if (s.stock < qty) return res.json(bad('库存不足'));
  const no = 'SA' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000);
  const r = db.prepare(`INSERT INTO supply_apps (app_no, supply_id, supply_name, qty, reason, applicant_id, applicant_name) VALUES (?,?,?,?,?,?,?)`)
    .run(no, supply_id, s.name, qty, reason || '', empId(req), req.user?.name || '');
  return res.json(ok({ id: r.lastInsertRowid, app_no: no }, '已申请'));
}
function listApps(req, res) {
  const { status, applicant_id } = req.query;
  let sql = 'SELECT * FROM supply_apps WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (applicant_id) { sql += ' AND applicant_id=?'; p.push(Number(applicant_id)); }
  sql += ' ORDER BY id DESC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function approveApp(req, res) {
  const { action } = req.body;
  if (!['通过', '驳回', '已发放'].includes(action)) return res.json(bad('动作非法'));
  const r = db.prepare('SELECT * FROM supply_apps WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  if (action === '通过' && r.status === '待审批') {
    // 扣减库存
    db.prepare('UPDATE supplies SET stock=stock-? WHERE id=?').run(r.qty, r.supply_id);
  }
  db.prepare('UPDATE supply_apps SET status=? WHERE id=?').run(action, r.id);
  return res.json(ok({}, '已' + action));
}

module.exports = { listSupplies, createSupply, updateSupply, applySupply, listApps, approveApp };
