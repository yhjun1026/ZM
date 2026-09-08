/**
 * 车辆申请 controller（参考 daily.js /vehicles 段，2 端点 + 车辆台账走 logistics.vehicles）
 * 数据表（010 迁移建立）：vehicle_apps
 */
const db = require('../db');
const { ok, okWith, bad, notfound, empId } = require('../utils/resp');

function apply(req, res) {
  const { vehicle_id, vehicle_plate, start_at, end_at, destination, reason } = req.body;
  if (!start_at || !end_at) return res.json(bad('起止时间必填'));
  const no = 'VA' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9000 + 1000);
  const r = db.prepare(`INSERT INTO vehicle_apps (app_no, vehicle_id, vehicle_plate, applicant_id, applicant_name, start_at, end_at, destination, reason)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(no, vehicle_id || null, vehicle_plate || '', empId(req), req.user?.name || '', start_at, end_at, destination || '', reason || '');
  return res.json(ok({ id: r.lastInsertRowid, app_no: no }, '已申请'));
}
function list(req, res) {
  const { status, applicant_id } = req.query;
  // logistics 表只有 id/type/title/... 不含 plate/model，这里只 JOIN 拿标题作为冗余展示
  let sql = `SELECT v.*, lv.title AS vehicle_title FROM vehicle_apps v
    LEFT JOIN logistics lv ON lv.id=v.vehicle_id WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND v.status=?'; p.push(status); }
  if (applicant_id) { sql += ' AND v.applicant_id=?'; p.push(Number(applicant_id)); }
  sql += ' ORDER BY v.id DESC';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function approve(req, res) {
  const { action, mileage } = req.body;
  if (!['通过', '驳回', '已出车', '已归还'].includes(action)) return res.json(bad('动作非法'));
  const r = db.prepare('SELECT * FROM vehicle_apps WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound());
  db.prepare('UPDATE vehicle_apps SET status=?, mileage=COALESCE(?,mileage) WHERE id=?').run(action, mileage, r.id);
  return res.json(ok({}, '已' + action));
}

module.exports = { apply, list, approve };
