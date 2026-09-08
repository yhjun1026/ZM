const db = require('../db');
const { success, fail } = require('../utils/response');

// 获取列表
async function list(req, res) {
  try {
    const announcements = db.prepare(`
      SELECT * FROM announcements 
      WHERE status IN ('已发布', '待审批', '已驳回')
      ORDER BY created_at DESC
    `).all();
    return res.json(success(announcements));
  } catch (e) {
    return res.json(fail('获取公告列表失败: ' + e.message));
  }
}

// 创建公告
async function create(req, res) {
  try {
    if (req.user.dept !== '行政部') {
      return res.json(fail('仅行政部可创建公告', 403));
    }

    const { title, category, content } = req.body;
    const id = 'ANN-' + Date.now();

    db.prepare(`
      INSERT INTO announcements (id, title, category, content, author, author_id, dept, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '待审批', datetime('now'))
    `).run(id, title, category, content, req.user.name, req.user.id, req.user.dept);

    return res.json(success({ id }, '公告创建成功，等待审批'));
  } catch (e) {
    return res.json(fail('创建公告失败: ' + e.message));
  }
}

// 审批通过
async function approve(req, res) {
  try {
    if (req.user.role !== '行政部经理' && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return res.json(fail('权限不足', 403));
    }

    const { id } = req.params;
    const { remark } = req.body;

    db.prepare(`
      UPDATE announcements 
      SET status = '已发布', published_at = datetime('now'), approver = ?, approve_remark = ?
      WHERE id = ?
    `).run(req.user.name, remark || '', id);

    return res.json(success({}, '公告已发布'));
  } catch (e) {
    return res.json(fail('审批失败: ' + e.message));
  }
}

// 审批驳回
async function reject(req, res) {
  try {
    if (req.user.role !== '行政部经理' && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return res.json(fail('权限不足', 403));
    }

    const { id } = req.params;
    const { remark } = req.body;

    db.prepare(`
      UPDATE announcements 
      SET status = '已驳回', approver = ?, approve_remark = ?
      WHERE id = ?
    `).run(req.user.name, remark || '', id);

    return res.json(success({}, '公告已驳回'));
  } catch (e) {
    return res.json(fail('驳回失败: ' + e.message));
  }
}

// 获取详情
async function get(req, res) {
  try {
    const { id } = req.params;
    const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    if (!announcement) {
      return res.json(fail('公告不存在'));
    }
    return res.json(success(announcement));
  } catch (e) {
    return res.json(fail('获取公告详情失败: ' + e.message));
  }
}

module.exports = {
  list,
  create,
  approve,
  reject,
  get
};

function unread(req, res) {
  try {
    const rows = db.prepare(`SELECT * FROM announcements WHERE status='已发布' AND id NOT IN
      (SELECT announcement_id FROM announcement_reads WHERE emp_id=?) ORDER BY id DESC LIMIT 50`).all(req.userId);
    return res.json(success(rows));
  } catch (e) { return res.json(fail('查询失败: ' + e.message)); }
}

function markRead(req, res) {
  try {
    db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id, emp_id) VALUES (?,?)').run(req.params.id, req.userId);
    return res.json(success({}, '已读'));
  } catch (e) { return res.json(fail('操作失败')); }
}

function readers(req, res) {
  try {
    const rows = db.prepare(`SELECT r.emp_id, r.read_at, u.name, u.dept FROM announcement_reads r
      LEFT JOIN users u ON u.id=r.emp_id WHERE r.announcement_id=? ORDER BY r.read_at DESC`).all(req.params.id);
    return res.json(success({ list: rows, count: rows.length }));
  } catch (e) { return res.json(fail('查询失败')); }
}

function remindUnread(req, res) {
  try {
    const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(req.params.id);
    if (!a) return res.json(fail('公告不存在'));
    const unreads = db.prepare(`SELECT u.id, u.name FROM users u WHERE u.status!='离职' AND u.id NOT IN
      (SELECT emp_id FROM announcement_reads WHERE announcement_id=?)`).all(req.params.id);
    for (const u of unreads) {
      db.prepare(`INSERT INTO messages (biz_type, biz_id, to_emp_id, title, content, msg_type, created_at)
        VALUES ('公告', ?, ?, '公告阅读提醒', ?, '待办', datetime('now','localtime'))`).run(a.id, u.id, `请查阅公告「${a.title}」`);
    }
    return res.json(success({ count: unreads.length }, '已提醒 ' + unreads.length + ' 人'));
  } catch (e) { return res.json(fail('操作失败: ' + e.message)); }
}

module.exports = { list, create, approve, reject, get, unread, markRead, readers, remindUnread };
