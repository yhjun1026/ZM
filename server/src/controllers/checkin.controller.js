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
