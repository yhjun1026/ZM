const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const rows = db.prepare('SELECT * FROM checkins WHERE user_id=? ORDER BY id DESC').all(req.userId);
  const today = new Date().toISOString().slice(0, 10);
  const today_ = db.prepare('SELECT * FROM checkins WHERE date=? AND user_id=?').get(today, req.userId);
  const weekCheckinData = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('weekCheckinData').value);
  return res.json(success({ today: today_, weekCheckinData, records: rows }));
}

function doCheckin(req, res) {
  const { userName, time, loc, type } = req.body;
  const uid = req.userId; // 修复：原硬编码 'ZM001'
  const today = new Date().toISOString().slice(0, 10);
  try {
    const existing = db.prepare('SELECT * FROM checkins WHERE date=? AND user_id=?').get(today, uid);
    if (type === 'in') {
      if (existing) {
        db.prepare('UPDATE checkins SET check_in_time=?, check_in_loc=?, status=? WHERE id=?').run(time, loc, 'signed_in', existing.id);
      } else {
        db.prepare('INSERT INTO checkins (user_id,user_name,check_in_time,check_in_loc,status,date) VALUES (?,?,?,?,?,?)')
          .run(uid, userName, time, loc, 'signed_in', today);
      }
      auditLog('CHECKIN_IN', uid, today, loc);
      return res.json(success({}, '签到成功'));
    } else {
      if (existing) {
        db.prepare('UPDATE checkins SET check_out_time=?, check_out_loc=?, status=? WHERE id=?').run(time, loc, 'signed_out', existing.id);
        auditLog('CHECKIN_OUT', uid, today, loc);
        return res.json(success({}, '签退成功'));
      }
      return res.json(fail('请先签到'));
    }
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

module.exports = { list, doCheckin };

// ===== 补齐：考勤设置 / 汇总 / 记录 / 导出 =====
const KV_KEY = 'attendance_settings';
function getDefaultSettings() {
  return {
    am_start: '09:00', am_end: '12:00', pm_start: '13:30', pm_end: '18:00',
    flexible_minutes: 30, work_days: '1,2,3,4,5',
    late_threshold_min: 5, early_leave_threshold_min: 5,
  };
}
function getSettings(req, res) {
  const row = db.prepare('SELECT value FROM kv_store WHERE key=?').get(KV_KEY);
  let s = getDefaultSettings();
  if (row) { try { s = { ...s, ...JSON.parse(row.value) }; } catch (e) {} }
  return res.json(success(s));
}
function saveSettings(req, res) {
  const v = JSON.stringify(req.body || {});
  const exists = db.prepare('SELECT key FROM kv_store WHERE key=?').get(KV_KEY);
  if (exists) db.prepare('UPDATE kv_store SET value=? WHERE key=?').run(v, KV_KEY);
  else db.prepare('INSERT INTO kv_store (key, value) VALUES (?,?)').run(KV_KEY, v);
  auditLog('SAVE_ATTENDANCE_SETTINGS', req.userId, null, v);
  return res.json(success({}, '已保存'));
}
function summary(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const todaySigned = db.prepare("SELECT COUNT(*) c FROM checkins WHERE date=? AND (check_in_time IS NOT NULL OR check_out_time IS NOT NULL)").get(today).c;
  const monthSigned = db.prepare("SELECT COUNT(*) c FROM checkins WHERE date>=? AND check_in_time IS NOT NULL").get(monthStart).c;
  const total = db.prepare("SELECT COUNT(*) c FROM users WHERE status!='离职'").get().c;
  return res.json(success({
    today_signed: todaySigned, month_signed: monthSigned,
    total_staff: total, rate: total > 0 ? +(todaySigned / total * 100).toFixed(1) : 0,
  }));
}
function records(req, res) {
  const { emp_id, from, to, page = 1, pageSize = 50 } = req.query;
  let sql = `SELECT c.*, u.name as emp_name_real, u.dept FROM checkins c
    LEFT JOIN users u ON u.id=c.user_id WHERE 1=1`;
  const p = [];
  if (emp_id) { sql += ' AND c.user_id=?'; p.push(emp_id); }
  if (from) { sql += ' AND c.date>=?'; p.push(from); }
  if (to) { sql += ' AND c.date<=?'; p.push(to); }
  sql += ' ORDER BY c.date DESC, c.id DESC LIMIT ? OFFSET ?';
  p.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  return res.json(success({ list: db.prepare(sql).all(...p) }));
}
function exportRec(req, res) {
  const { from, to } = req.query;
  let sql = 'SELECT user_id, date, check_in_time, check_in_loc, check_out_time, check_out_loc, status FROM checkins WHERE 1=1';
  const p = [];
  if (from) { sql += ' AND date>=?'; p.push(from); }
  if (to) { sql += ' AND date<=?'; p.push(to); }
  sql += ' ORDER BY date DESC';
  const rows = db.prepare(sql).all(...p);
  const lines = ['工号\t日期\t签到时间\t签到地点\t签退时间\t签退地点\t状态'];
  for (const r of rows) lines.push([r.user_id, r.date, r.check_in_time || '', r.check_in_loc || '', r.check_out_time || '', r.check_out_loc || '', r.status || ''].join('\t'));
  return res.json(success({ text: lines.join('\n'), count: rows.length }));
}

module.exports = { list, doCheckin, getSettings, saveSettings, summary, records, export: exportRec };
