const db = require('../db');
const { success, fail } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const allDepts = db.prepare('SELECT * FROM departments ORDER BY id').all();
  const roots = allDepts.filter((d) => !d.parent_id).map((d) => ({ ...d, children: [] }));
  allDepts
    .filter((d) => d.parent_id)
    .forEach((d) => {
      const parent = roots.find((r) => r.id === d.parent_id);
      if (parent) parent.children.push({ ...d, children: [] });
    });
  return res.json(success(roots));
}

function create(req, res) {
  const { name, head, color, icon, parentId } = req.body;
  try {
    const info = db.prepare('INSERT INTO departments (name,head,count,color,icon,parent_id) VALUES (?,?,?,?,?,?)')
      .run(name, head || '-', 0, color || '#2563eb', icon || 'folder', parentId || null);
    auditLog('ADD_DEPT', req.userId, String(info.lastInsertRowid), name);
    return res.json(success({ id: info.lastInsertRowid }, '部门添加成功'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function update(req, res) {
  const { name, head, color, icon, count } = req.body;
  const sets = [];
  const vals = [];
  if (name !== undefined) { sets.push('name=?'); vals.push(name); }
  if (head !== undefined) { sets.push('head=?'); vals.push(head); }
  if (color !== undefined) { sets.push('color=?'); vals.push(color); }
  if (icon !== undefined) { sets.push('icon=?'); vals.push(icon); }
  if (count !== undefined) { sets.push('count=?'); vals.push(count); }
  if (sets.length === 0) return res.json(fail('无更新字段'));
  vals.push(req.params.id);
  try {
    db.prepare(`UPDATE departments SET ${sets.join(',')} WHERE id=?`).run(...vals);
    return res.json(success({}, '部门信息更新成功'));
  } catch (e) {
    return res.json(fail('更新失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_DEPT', req.userId, req.params.id, null);
    db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
    return res.json(success({}, '部门已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

module.exports = { list, create, update, remove };
