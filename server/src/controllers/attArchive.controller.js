const db = require('../db');
const { success, fail } = require('../utils/response');

// 获取归档列表
async function list(req, res) {
  try {
    const archives = db.prepare(`
      SELECT a.*, 
        CASE WHEN a.form_type = 'leave' THEN '请假单' ELSE '出差单' END as form_type_name
      FROM att_archive a 
      ORDER BY a.created_at DESC
    `).all();
    return res.json(success(archives));
  } catch (e) {
    return res.json(fail('获取归档列表失败: ' + e.message));
  }
}

// 获取统计数据
async function stats(req, res) {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM att_archive').get().c;
    const pending = db.prepare("SELECT COUNT(*) as c FROM att_archive WHERE status = '待归档'").get().c;
    const filed = db.prepare("SELECT COUNT(*) as c FROM att_archive WHERE status = '已归档'").get().c;
    const leave_count = db.prepare("SELECT COUNT(*) as c FROM att_archive WHERE form_type = 'leave'").get().c;
    const trip_count = db.prepare("SELECT COUNT(*) as c FROM att_archive WHERE form_type = 'trip'").get().c;
    
    return res.json(success({
      total, pending, filed,
      leave_count, trip_count,
      abnormal: 0
    }));
  } catch (e) {
    return res.json(fail('获取统计失败: ' + e.message));
  }
}

// 归档确认
async function file(req, res) {
  try {
    if (req.user.dept !== '行政部') {
      return res.json(fail('仅行政部可进行归档操作', 403));
    }
    
    const { id } = req.params;
    const archive_no = 'ATT-' + Date.now();
    
    db.prepare(`
      UPDATE att_archive 
      SET status = '已归档', archive_no = ?, filed_by = ?, filed_at = datetime('now')
      WHERE id = ?
    `).run(archive_no, req.user.name, id);
    
    return res.json(success({ archive_no }, '归档成功'));
  } catch (e) {
    return res.json(fail('归档失败: ' + e.message));
  }
}

module.exports = { list, stats, file };
