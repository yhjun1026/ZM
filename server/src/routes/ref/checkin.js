/**
 * 考勤管理路由 — 按《公司OA自主研发系统》第五部分 考勤管理PRD
 * 功能：实时打卡（含照片）、签退、作息时间设置、考勤统计报表
 * 增强规则：
 *  - 内勤打卡定位校验：距公司坐标 ≤ 100 米，超出拒绝
 *  - 人脸活体校验（Stub）：活体分数 ≥ 85% 方可通过
 *  - 照片水印：时间/经纬度/工号（前端叠加，后端留存坐标与分数）
 *  - 外勤打卡：免100米围栏，但强制实时照片+人脸+定位，轨迹每5分钟记录一次
 *  - 异常处理流程：迟到/早退/缺卡自动生成异常记录，行政部处理（补卡通过/驳回）
 *  - 统计报表增强：部门/异常维度 + CSV导出（BOM）
 * 权限：打卡功能全员可用；管理功能仅行政部
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error } = require('../../compat/helpers');

router.use(authMiddleware);

/* ===== 数据库迁移（幂等） ===== */
(function migrate() {
  const cols = db.prepare('PRAGMA table_info(checkins)').all().map(c => c.name);
  if (!cols.includes('lat')) db.exec("ALTER TABLE checkins ADD COLUMN lat TEXT DEFAULT ''");
  if (!cols.includes('lng')) db.exec("ALTER TABLE checkins ADD COLUMN lng TEXT DEFAULT ''");
  if (!cols.includes('face_score')) db.exec("ALTER TABLE checkins ADD COLUMN face_score INTEGER DEFAULT 0");
  if (!cols.includes('is_field')) db.exec("ALTER TABLE checkins ADD COLUMN is_field INTEGER DEFAULT 0");
  if (!cols.includes('distance')) db.exec("ALTER TABLE checkins ADD COLUMN distance INTEGER DEFAULT 0");
  db.exec(`CREATE TABLE IF NOT EXISTS t_attend_config (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  )`);
  const latCfg = db.prepare('SELECT value FROM t_attend_config WHERE key = ?').get('company_lat');
  if (!latCfg) {
    db.prepare('INSERT INTO t_attend_config (key,value) VALUES (?,?)').run('company_lat', '30.659842');
    db.prepare('INSERT INTO t_attend_config (key,value) VALUES (?,?)').run('company_lng', '104.065738');
    db.prepare('INSERT INTO t_attend_config (key,value) VALUES (?,?)').run('geofence_radius', '100');
    db.prepare('INSERT INTO t_attend_config (key,value) VALUES (?,?)').run('face_threshold', '85');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS t_field_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_name TEXT DEFAULT '',
    dept TEXT DEFAULT '',
    lat TEXT DEFAULT '',
    lng TEXT DEFAULT '',
    recorded_at TEXT DEFAULT (datetime('now','localtime')),
    date TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_attend_exceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkin_id INTEGER DEFAULT 0,
    user_id INTEGER DEFAULT 0,
    user_name TEXT DEFAULT '',
    dept TEXT DEFAULT '',
    date TEXT DEFAULT '',
    type TEXT NOT NULL,
    detail TEXT DEFAULT '',
    status TEXT DEFAULT '待处理',
    handler TEXT DEFAULT '',
    handle_remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    handled_at TEXT DEFAULT ''
  )`);
})();

// 获取当前精确时间（含秒）
function getNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function cfg(key, fallback) {
  const r = db.prepare('SELECT value FROM t_attend_config WHERE key = ?').get(key);
  return r && r.value !== '' ? r.value : fallback;
}
// 是否行政部管理权限
function isAdminMgr(u) {
  return u.role === '超级管理员' || u.role === '总经理' || u.role === '副总' ||
    (u.dept === '行政部' && (u.role === '普通员工' || u.role === '部门经理' || u.role === '超级管理员'));
}
// Haversine 距离（米）
function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}
function addException(checkinId, userId, userName, dept, date, type, detail) {
  const dup = db.prepare('SELECT id FROM t_attend_exceptions WHERE user_id = ? AND date = ? AND type = ?').get(userId, date, type);
  if (dup) return;
  db.prepare('INSERT INTO t_attend_exceptions (checkin_id,user_id,user_name,dept,date,type,detail) VALUES (?,?,?,?,?,?,?)')
    .run(checkinId || 0, userId, userName, dept, date, type, detail || '');
}

/* ===== 考勤参数配置（行政部） ===== */
router.get('/config', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_attend_config').all();
  const map = {};
  rows.forEach(r => map[r.key] = r.value);
  return success(res, map);
});
router.post('/config', (req, res) => {
  if (!isAdminMgr(req.user)) return error(res, 403, '考勤参数设置仅行政部可操作');
  const { company_lat, company_lng, geofence_radius, face_threshold } = req.body;
  const upd = db.prepare('UPDATE t_attend_config SET value = ? WHERE key = ?');
  if (company_lat !== undefined) upd.run(String(company_lat), 'company_lat');
  if (company_lng !== undefined) upd.run(String(company_lng), 'company_lng');
  if (geofence_radius !== undefined) upd.run(String(parseInt(geofence_radius, 10) || 100), 'geofence_radius');
  if (face_threshold !== undefined) upd.run(String(parseInt(face_threshold, 10) || 85), 'face_threshold');
  return success(res, null, '考勤参数已更新');
});

/* ===== 今日打卡状态 ===== */
router.get('/today', (req, res) => {
  const today = getToday();
  const record = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date = ?').get(req.user.id, today);
  if (record) {
    return success(res, {
      checkInTime: record.check_in_time,
      checkInLoc: record.check_in_loc,
      checkInPhoto: record.check_in_photo || '',
      checkOutTime: record.check_out_time,
      checkOutPhoto: record.check_out_photo || '',
      status: record.status,
      isField: !!record.is_field,
      lat: record.lat, lng: record.lng, faceScore: record.face_score
    });
  }
  const tracks = db.prepare('SELECT COUNT(*) n FROM t_field_tracks WHERE user_id = ? AND date = ?').get(req.user.id, today).n;
  return success(res, { checkInTime: null, checkInLoc: '', checkInPhoto: '', checkOutTime: null, checkOutPhoto: '', status: 'not_signed', isField: false, lat: '', lng: '', faceScore: 0, trackCount: tracks });
});

/* ===== 实时打卡（含照片+定位围栏+人脸活体Stub） ===== */
router.post('/checkin', (req, res) => {
  const { location, photo, lat, lng, face_score, field } = req.body;
  if (!photo) {
    return error(res, 400, '打卡必须实时拍摄照片（强制）');
  }
  const threshold = parseInt(cfg('face_threshold', '85'), 10);
  const fs = parseInt(face_score, 10) || 0;
  if (fs < threshold) {
    return error(res, 400, `人脸活体校验未通过（${fs}% < ${threshold}%），请正对镜头重试`);
  }
  const isField = !!field;
  let distance = 0;
  if (!isField) {
    // 内勤打卡：定位围栏校验（≤100米，可配置）
    if (lat === undefined || lng === undefined || lat === '' || lng === '') {
      return error(res, 400, '内勤打卡必须获取定位（用于100米围栏校验）');
    }
    const cLat = parseFloat(cfg('company_lat', '30.659842'));
    const cLng = parseFloat(cfg('company_lng', '104.065738'));
    const radius = parseInt(cfg('geofence_radius', '100'), 10);
    distance = distMeters(parseFloat(lat), parseFloat(lng), cLat, cLng);
    if (distance > radius) {
      return error(res, 400, `定位超出公司围栏范围（距公司${distance}米 > ${radius}米），请使用外勤打卡`);
    }
  } else if (lat === undefined || lng === '' ) {
    return error(res, 400, '外勤打卡必须上报定位坐标');
  }
  const today = getToday();
  const now = getNow();
  const existing = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date = ?').get(req.user.id, today);
  if (existing) {
    return error(res, 400, '今日已打卡');
  }
  // 照片大小限制（base64 约 2MB 以内）
  const photoData = photo.length > 2000000 ? photo.substring(0, 2000000) : photo;
  const info = db.prepare('INSERT INTO checkins (user_id,user_name,dept,check_in_time,check_in_loc,check_in_photo,status,date,lat,lng,face_score,is_field,distance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, req.user.name, req.user.dept, now, location || (isField ? '外勤·' + (lat + ',' + lng) : ''), photoData, 'signed_in', today, String(lat || ''), String(lng || ''), fs, isField ? 1 : 0, distance);
  // 迟到自动生成异常记录（09:00后）
  const timePart = now.split(' ')[1] || '';
  if (timePart > '09:00:00') {
    addException(info.lastInsertRowid, req.user.id, req.user.name, req.user.dept, today, '迟到', `签到时间 ${now}（09:00后）${isField ? ' · 外勤' : ''}`);
  }
  return success(res, { id: info.lastInsertRowid, checkInTime: now, checkInLoc: location, distance, isField }, isField ? '外勤打卡成功（轨迹已开启）' : '打卡成功');
});

/* ===== 签退（含照片+人脸活体Stub） ===== */
router.post('/checkout', (req, res) => {
  const { photo, face_score } = req.body;
  if (!photo) {
    return error(res, 400, '签退必须实时拍摄照片（强制）');
  }
  const threshold = parseInt(cfg('face_threshold', '85'), 10);
  const fs = parseInt(face_score, 10) || 0;
  if (fs < threshold) {
    return error(res, 400, `人脸活体校验未通过（${fs}% < ${threshold}%）`);
  }
  const today = getToday();
  const now = getNow();
  const record = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date = ?').get(req.user.id, today);
  if (!record) {
    return error(res, 400, '今日未打卡，请先打卡');
  }
  const photoData = photo.length > 2000000 ? photo.substring(0, 2000000) : photo;
  db.prepare('UPDATE checkins SET check_out_time=?, check_out_photo=?, status=? WHERE user_id=? AND date=?')
    .run(now, photoData, 'signed_out', req.user.id, today);
  // 早退自动生成异常记录（17:30前）
  const timePart = now.split(' ')[1] || '';
  if (timePart < '17:30:00') {
    addException(record.id, req.user.id, req.user.name, req.user.dept, today, '早退', `签退时间 ${now}（17:30前）`);
  }
  return success(res, { checkOutTime: now }, '签退成功');
});

/* ===== 外勤轨迹记录（每5分钟一次） ===== */
router.post('/field-track', (req, res) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined || lat === '' || lng === '') {
    return error(res, 400, '轨迹记录必须上报经纬度');
  }
  const today = getToday();
  const last = db.prepare('SELECT * FROM t_field_tracks WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1').get(req.user.id, today);
  if (last) {
    const diffMs = new Date(getNow()) - new Date(last.recorded_at.replace(' ', 'T'));
    if (!isNaN(diffMs) && diffMs < 5 * 60 * 1000 - 5000) {
      const wait = Math.ceil((5 * 60 * 1000 - diffMs) / 60000);
      return error(res, 400, `轨迹记录间隔须≥5分钟，请${wait}分钟后再记录`);
    }
  }
  const info = db.prepare('INSERT INTO t_field_tracks (user_id,user_name,dept,lat,lng,date) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, req.user.name, req.user.dept, String(lat), String(lng), today);
  return success(res, { id: info.lastInsertRowid, time: getNow() }, '外勤轨迹已记录');
});

/* ===== 我的今日轨迹 ===== */
router.get('/my-tracks', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_field_tracks WHERE user_id = ? AND date = ? ORDER BY id').all(req.user.id, getToday());
  return success(res, rows);
});

/* ===== 考勤记录列表（行政部管理） ===== */
router.get('/records', (req, res) => {
  if (!isAdminMgr(req.user)) {
    return error(res, 403, '考勤管理仅行政部可查看');
  }
  const { date, dept, name } = req.query;
  let sql = 'SELECT * FROM checkins WHERE 1=1';
  const params = [];
  if (date) { sql += ' AND date = ?'; params.push(date); }
  if (dept) { sql += ' AND dept = ?'; params.push(dept); }
  if (name) { sql += ' AND user_name LIKE ?'; params.push('%' + name + '%'); }
  sql += ' ORDER BY date DESC, check_in_time DESC';
  const rows = db.prepare(sql).all(...params);
  return success(res, rows);
});

/* ===== 异常处理流程（行政部） ===== */
router.get('/exceptions', (req, res) => {
  if (!isAdminMgr(req.user)) return error(res, 403, '异常处理仅行政部可查看');
  const { status, type, date } = req.query;
  let sql = 'SELECT * FROM t_attend_exceptions WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  sql += ' ORDER BY status = \'待处理\' DESC, created_at DESC LIMIT 300';
  return success(res, db.prepare(sql).all(...params));
});

router.post('/exceptions/:id/handle', (req, res) => {
  if (!isAdminMgr(req.user)) return error(res, 403, '异常处理仅行政部可操作');
  const ex = db.prepare('SELECT * FROM t_attend_exceptions WHERE id = ?').get(req.params.id);
  if (!ex) return error(res, 404, '异常记录不存在');
  if (ex.status !== '待处理') return error(res, 400, '该异常已处理（' + ex.status + '）');
  const { action, remark } = req.body;
  if (!['补卡通过', '驳回'].includes(action)) return error(res, 400, '处理动作须为「补卡通过」或「驳回」');
  if (action === '驳回' && (!remark || !remark.trim())) return error(res, 400, '驳回必须填写说明');
  db.prepare("UPDATE t_attend_exceptions SET status=?, handler=?, handle_remark=?, handled_at=datetime('now','localtime') WHERE id=?")
    .run(action === '补卡通过' ? '已补卡' : '已驳回', req.user.name, remark || '', ex.id);
  return success(res, null, action === '补卡通过' ? '异常已处理：补卡通过' : '异常已处理：驳回');
});

/* ===== 考勤统计（行政部管理，含异常维度） ===== */
router.get('/statistics', (req, res) => {
  if (!isAdminMgr(req.user)) {
    return error(res, 403, '考勤管理仅行政部可查看');
  }
  const { month } = req.query;
  const targetMonth = month || getToday().slice(0, 7);
  // 当月打卡统计
  const rows = db.prepare("SELECT * FROM checkins WHERE date LIKE ? ORDER BY date DESC, check_in_time DESC").all(targetMonth + '%');
  // 按人员统计
  const byPerson = {};
  rows.forEach(r => {
    if (!byPerson[r.user_id]) {
      byPerson[r.user_id] = { name: r.user_name, dept: r.dept, total: 0, signedIn: 0, signedOut: 0, late: 0, early: 0, field: 0 };
    }
    const p = byPerson[r.user_id];
    p.total++;
    if (r.check_in_time) p.signedIn++;
    if (r.check_out_time) p.signedOut++;
    if (r.is_field) p.field++;
    // 迟到判定（09:00后）
    if (r.check_in_time && r.check_in_time.split(' ')[1] && r.check_in_time.split(' ')[1] > '09:00:00') p.late++;
    // 早退判定（18:00前签退，夏令；17:30前，冬令）
    if (r.check_out_time && r.check_out_time.split(' ')[1] && r.check_out_time.split(' ')[1] < '17:30:00') p.early++;
  });
  // 部门统计
  const byDept = {};
  rows.forEach(r => {
    if (!byDept[r.dept]) byDept[r.dept] = { dept: r.dept, total: 0, signedIn: 0, late: 0, field: 0 };
    byDept[r.dept].total++;
    if (r.check_in_time) byDept[r.dept].signedIn++;
    if (r.is_field) byDept[r.dept].field++;
    if (r.check_in_time && r.check_in_time.split(' ')[1] && r.check_in_time.split(' ')[1] > '09:00:00') byDept[r.dept].late++;
  });
  // 异常统计
  const exc = db.prepare('SELECT * FROM t_attend_exceptions WHERE date LIKE ?').all(targetMonth + '%');
  const byExcType = {};
  exc.forEach(e => { byExcType[e.type] = (byExcType[e.type] || 0) + 1; });
  const pendingExc = exc.filter(e => e.status === '待处理').length;
  // 外勤轨迹统计
  const tracks = db.prepare('SELECT COUNT(*) n, COUNT(DISTINCT user_id) p FROM t_field_tracks WHERE date LIKE ?').get(targetMonth + '%');
  return success(res, {
    month: targetMonth,
    totalRecords: rows.length,
    totalPersons: Object.keys(byPerson).length,
    byPerson: Object.values(byPerson),
    byDept: Object.values(byDept),
    exceptions: { total: exc.length, pending: pendingExc, byType: byExcType, list: exc.slice(0, 50) },
    fieldTracks: { total: tracks.n, persons: tracks.p },
    records: rows
  });
});

/* ===== 考勤统计CSV导出（BOM） ===== */
router.get('/export', (req, res) => {
  if (!isAdminMgr(req.user)) return error(res, 403, '考勤导出仅行政部可操作');
  const { month } = req.query;
  const targetMonth = month || getToday().slice(0, 7);
  const rows = db.prepare("SELECT * FROM checkins WHERE date LIKE ? ORDER BY date DESC, check_in_time DESC").all(targetMonth + '%');
  const header = ['日期', '姓名', '部门', '签到时间', '签退时间', '状态', '类型', '签到定位', '距公司(米)', '人脸分数'];
  const lines = [header.join(',')];
  rows.forEach(r => {
    const vals = [r.date, r.user_name, r.dept, r.check_in_time, r.check_out_time || '', r.status, r.is_field ? '外勤' : '内勤', (r.lat && r.lng) ? r.lat + ',' + r.lng : '', r.distance || 0, r.face_score || 0];
    lines.push(vals.map(v => { const s = String(v || ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance_' + targetMonth + '.csv"');
  return res.send('\ufeff' + lines.join('\n'));
});

/* ===== 作息时间设置 ===== */
router.get('/schedule', (req, res) => {
  const schedules = db.prepare('SELECT * FROM attendance_schedules ORDER BY id').all();
  return success(res, schedules);
});

router.post('/schedule', (req, res) => {
  if (!isAdminMgr(req.user)) {
    return error(res, 403, '作息时间设置仅行政部可操作');
  }
  const { season, work_start, work_end, lunch_start, lunch_end, active } = req.body;
  if (!season) {
    return error(res, 400, '请指定季节');
  }
  const existing = db.prepare('SELECT * FROM attendance_schedules WHERE season = ?').get(season);
  if (existing) {
    db.prepare('UPDATE attendance_schedules SET work_start=?, work_end=?, lunch_start=?, lunch_end=?, updated_by=?, updated_at=datetime(\'now\',\'localtime\') WHERE season=?')
      .run(work_start || existing.work_start, work_end || existing.work_end, lunch_start || existing.lunch_start, lunch_end || existing.lunch_end, req.user.name, season);
  } else {
    db.prepare('INSERT INTO attendance_schedules (season,work_start,work_end,lunch_start,lunch_end,active) VALUES (?,?,?,?,?,?)')
      .run(season, work_start || '09:00', work_end || '18:00', lunch_start || '12:00', lunch_end || '13:30', 0);
  }
  // 激活某个作息
  if (active) {
    db.prepare('UPDATE attendance_schedules SET active=0').run();
    db.prepare('UPDATE attendance_schedules SET active=1 WHERE season=?').run(season);
  }
  return success(res, { season, active: !!active }, '作息时间设置成功');
});

module.exports = router;
