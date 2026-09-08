/**
 * 会议纪要（参考 collab.js meeting-notes 段，2 端点）
 * 数据表：meeting_notes（010 迁移已建）
 */
const db = require('../db');
const { ok, okWith, bad } = require('../utils/resp');

function list(req, res) {
  const { reservation_id } = req.query;
  const rows = reservation_id
    ? db.prepare('SELECT * FROM meeting_notes WHERE reservation_id=? ORDER BY id DESC').all(reservation_id)
    : db.prepare('SELECT * FROM meeting_notes ORDER BY id DESC LIMIT 60').all();
  return res.json(ok({ list: rows }));
}

function create(req, res) {
  const { reservation_id, subject, meeting_date, attendees, content, decisions } = req.body || {};
  if (!subject) return res.json(bad('会议主题必填'));
  const info = db.prepare(`INSERT INTO meeting_notes(reservation_id,subject,meeting_date,organizer_id,organizer_name,attendees,content,decisions)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(reservation_id || null, subject, meeting_date || null, req.empId || null, req.user?.name || '', attendees || '', content || '', decisions || '');
  return res.json(ok({ id: info.lastInsertRowid }, '已录入会议纪要'));
}

module.exports = { list, create };
