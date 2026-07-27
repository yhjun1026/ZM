const db = require('../db');
const { success, fail } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const userId = req.userId; // 修复：原默认 'ZM001'
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY id DESC').all(userId);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  return res.json(success({ notifications, unreadCount }));
}

function read(req, res) {
  try {
    db.prepare('UPDATE notifications SET is_read=1 WHERE id=?').run(req.params.id);
    return res.json(success({}, '已标记为已读'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function readAll(req, res) {
  const userId = req.userId; // 修复：原从 req.body 读 userId 默认 'ZM001'
  try {
    db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=? OR user_id IS NULL').run(userId);
    return res.json(success({}, '全部已读'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_NOTIF', req.userId, req.params.id, null);
    db.prepare('DELETE FROM notifications WHERE id=?').run(req.params.id);
    return res.json(success({}, '通知已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

module.exports = { list, read, readAll, remove };
