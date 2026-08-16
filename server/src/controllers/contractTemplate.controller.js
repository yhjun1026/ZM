const db = require('../db');
const { success, fail } = require('../utils/response');

// 获取模板列表
async function list(req, res) {
  try {
    const { category, status } = req.query;
    let sql = 'SELECT * FROM contract_templates WHERE 1=1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const templates = db.prepare(sql).all(...params);
    return res.json(success(templates));
  } catch (e) {
    return res.json(fail('获取模板列表失败: ' + e.message));
  }
}

// 获取模板分类
async function getCategories(req, res) {
  try {
    const categories = db.prepare('SELECT DISTINCT category FROM contract_templates WHERE category IS NOT NULL').all();
    return res.json(success(categories.map(c => c.category)));
  } catch (e) {
    return res.json(fail('获取分类失败: ' + e.message));
  }
}

// 获取模板详情
async function get(req, res) {
  try {
    const { id } = req.params;
    const template = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(id);
    if (!template) {
      return res.json(fail('模板不存在'));
    }
    return res.json(success(template));
  } catch (e) {
    return res.json(fail('获取模板详情失败: ' + e.message));
  }
}

// 创建模板
async function create(req, res) {
  try {
    if (req.user.dept !== '行政部' && req.user.role !== '超级管理员') {
      return res.json(fail('仅行政部可创建模板', 403));
    }

    const { name, category, content, applicable_dept } = req.body;
    const id = 'TPL-' + Date.now();

    db.prepare(`
      INSERT INTO contract_templates (id, name, category, content, status, applicable_dept, creator, created_at)
      VALUES (?, ?, ?, ?, '启用', ?, ?, datetime('now'))
    `).run(id, name, category, content, applicable_dept || '', req.user.name);

    return res.json(success({ id }, '模板创建成功'));
  } catch (e) {
    return res.json(fail('创建模板失败: ' + e.message));
  }
}

// 更新模板
async function update(req, res) {
  try {
    if (req.user.dept !== '行政部' && req.user.role !== '超级管理员') {
      return res.json(fail('仅行政部可修改模板', 403));
    }

    const { id } = req.params;
    const { name, category, content, applicable_dept } = req.body;

    db.prepare(`
      UPDATE contract_templates 
      SET name = ?, category = ?, content = ?, applicable_dept = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, category, content, applicable_dept || '', id);

    return res.json(success({}, '模板更新成功'));
  } catch (e) {
    return res.json(fail('更新模板失败: ' + e.message));
  }
}

// 切换模板状态
async function toggleStatus(req, res) {
  try {
    if (req.user.dept !== '行政部' && req.user.role !== '超级管理员') {
      return res.json(fail('仅行政部可切换状态', 403));
    }

    const { id } = req.params;
    const { status } = req.body;

    db.prepare('UPDATE contract_templates SET status = ?, updated_at = datetime("now") WHERE id = ?')
      .run(status, id);

    return res.json(success({}, '状态已更新'));
  } catch (e) {
    return res.json(fail('切换状态失败: ' + e.message));
  }
}

// 删除模板
async function remove(req, res) {
  try {
    if (req.user.role !== '超级管理员') {
      return res.json(fail('仅超级管理员可删除模板', 403));
    }

    const { id } = req.params;
    const template = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(id);

    if (!template) {
      return res.json(fail('模板不存在'));
    }

    if (template.status === '启用') {
      return res.json(fail('请先禁用模板再删除'));
    }

    db.prepare('DELETE FROM contract_templates WHERE id = ?').run(id);
    return res.json(success({}, '模板已删除'));
  } catch (e) {
    return res.json(fail('删除模板失败: ' + e.message));
  }
}

// 获取审批列表
async function getApprovals(req, res) {
  try {
    const approvals = db.prepare('SELECT * FROM contract_template_approvals ORDER BY created_at DESC').all();
    return res.json(success(approvals));
  } catch (e) {
    return res.json(fail('获取审批列表失败: ' + e.message));
  }
}

// 审批通过
async function approve(req, res) {
  try {
    const { id } = req.params;
    const { remark } = req.body;

    db.prepare(`
      UPDATE contract_template_approvals 
      SET status = '已通过', approver = ?, approve_date = datetime('now'), remark = ?
      WHERE id = ?
    `).run(req.user.name, remark || '', id);

    return res.json(success({}, '审批通过'));
  } catch (e) {
    return res.json(fail('审批失败: ' + e.message));
  }
}

// 审批驳回
async function reject(req, res) {
  try {
    const { id } = req.params;
    const { remark } = req.body;

    db.prepare(`
      UPDATE contract_template_approvals 
      SET status = '已驳回', approver = ?, approve_date = datetime('now'), remark = ?
      WHERE id = ?
    `).run(req.user.name, remark || '', id);

    return res.json(success({}, '已驳回'));
  } catch (e) {
    return res.json(fail('驳回失败: ' + e.message));
  }
}

module.exports = {
  list,
  getCategories,
  get,
  create,
  update,
  toggleStatus,
  remove,
  getApprovals,
  approve,
  reject
};
