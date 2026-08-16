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
