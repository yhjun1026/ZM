const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

/**
 * 获取文件列表
 */
function list(req, res) {
  const rows = db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
  const documents = rows.map((r) => ({
    ...r,
    doc_flow: parseJSON(r.doc_flow) || [],
  }));
  return res.json(success(documents));
}

/**
 * 获取单个文件详情
 */
function get(req, res) {
  const r = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (!r) return res.json(fail('文件不存在'));
  return res.json(success({
    ...r,
    doc_flow: parseJSON(r.doc_flow) || [],
  }));
}

/**
 * 创建文件
 * 权限：行政部普通员工及以上角色
 */
function create(req, res) {
  const user = req.user;

  // 权限检查：普通员工仅行政部可创建文件
  if (user.role === '普通员工' && user.dept !== '行政部') {
    return res.json(fail('无权创建公司文件'));
  }

  const { title, type, content, distributeScope } = req.body;
  if (!title) return res.json(fail('文件标题不能为空'));

  // 生成文件ID
  const count = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
  const id = `DOC${String(count + 1).padStart(3, '0')}`;

  // 生成审批流程（公司文件审批流程：编写 → 行政部负责人审批 → 总经理签署）
  const docFlow = [
    { step: 1, action: '编写', user: user.name, done: true, time: new Date().toISOString() },
    { step: 2, action: '行政部负责人审批', user: '', done: false },
    { step: 3, action: '总经理签署', user: '', done: false }
  ];

  try {
    db.prepare(`
      INSERT INTO documents (
        id, title, type, author, author_id, dept, date, status, distribute_scope, content, read_count, doc_flow
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, title, type || '通知公告', user.name, user.id, user.dept,
      new Date().toISOString().slice(0, 10), '草稿', distributeScope || '全体员工', content || '', 0, JSON.stringify(docFlow)
    );

    auditLog('ADD_DOCUMENT', req.userId, id, title);
    return res.json(success({ id }, '文件创建成功'));
  } catch (e) {
    console.error('创建文件失败:', e);
    return res.json(fail('操作失败'));
  }
}

/**
 * 提交审批
 */
function submit(req, res) {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
    if (!doc) return res.json(fail('文件不存在'));

    const flow = parseJSON(doc.doc_flow) || [];

    // 标记第一步完成
    if (flow[0] && !flow[0].done) {
      flow[0].done = true;
      flow[0].user = req.user.name;
      flow[0].time = new Date().toISOString();
    }

    db.prepare(`
      UPDATE documents SET doc_flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?
    `).run(JSON.stringify(flow), '审批中', req.params.id);

    return res.json(success({}, '文件已提交审批'));
  } catch (e) {
    console.error('提交审批失败:', e);
    return res.json(fail('操作失败'));
  }
}

/**
 * 审批通过
 */
function approve(req, res) {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
    if (!doc) return res.json(fail('文件不存在'));

    const flow = parseJSON(doc.doc_flow) || [];
    const pending = flow.find(f => !f.done);

    if (pending) {
      pending.done = true;
      pending.user = req.user.name;
      pending.time = new Date().toISOString();
      if (req.body.remark) pending.remark = req.body.remark;
    }

    const allDone = flow.every(f => f.done);

    db.prepare(`
      UPDATE documents SET doc_flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?
    `).run(JSON.stringify(flow), allDone ? '已下发' : doc.status, req.params.id);

    auditLog('APPROVE_DOCUMENT', req.userId, req.params.id, doc.title);
    return res.json(success({}, '审批通过'));
  } catch (e) {
    console.error('审批失败:', e);
    return res.json(fail('操作失败'));
  }
}

/**
 * 驳回文件
 */
function reject(req, res) {
  try {
    const doc = db.prepare('SELECT title FROM documents WHERE id=?').get(req.params.id);
    if (!doc) return res.json(fail('文件不存在'));

    db.prepare(`
      UPDATE documents SET status=?, updated_at=datetime('now','localtime') WHERE id=?
    `).run('已驳回', req.params.id);

    auditLog('REJECT_DOCUMENT', req.userId, req.params.id, doc.title);
    return res.json(success({}, '已驳回'));
  } catch (e) {
    console.error('驳回失败:', e);
    return res.json(fail('操作失败'));
  }
}

/**
 * 更新文件
 */
function update(req, res) {
  const fields = ['title', 'type', 'content', 'distribute_scope'];
  const sets = [];
  const vals = [];

  fields.forEach((f) => {
    const bodyKey = f.replace(/_./g, (m) => m[1].toUpperCase());
    if (req.body[bodyKey] !== undefined || req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(req.body[bodyKey] !== undefined ? req.body[bodyKey] : req.body[f]);
    }
  });

  if (sets.length === 0) return res.json(fail('无更新字段'));
  vals.push(req.params.id);

  try {
    db.prepare(`UPDATE documents SET ${sets.join(',')}, updated_at=datetime('now','localtime') WHERE id=?`).run(...vals);
    return res.json(success({}, '文件更新成功'));
  } catch (e) {
    console.error('更新文件失败:', e);
    return res.json(fail('更新失败'));
  }
}

/**
 * 删除文件
 */
function remove(req, res) {
  try {
    const doc = db.prepare('SELECT title FROM documents WHERE id=?').get(req.params.id);
    if (!doc) return res.json(fail('文件不存在'));

    auditLog('DELETE_DOCUMENT', req.userId, req.params.id, doc.title);
    db.prepare('DELETE FROM documents WHERE id=?').run(req.params.id);
    return res.json(success({}, '文件已删除'));
  } catch (e) {
    console.error('删除文件失败:', e);
    return res.json(fail('删除失败'));
  }
}

module.exports = { list, get, create, submit, approve, reject, update, remove };