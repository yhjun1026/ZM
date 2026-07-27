const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const rows = db.prepare('SELECT * FROM customers ORDER BY id').all();
  const customers = rows.map((r) => ({
    ...r,
    tags: parseJSON(r.tags) || [],
    followUps: parseJSON(r.follow_ups) || [],
  }));
  return res.json(success(customers));
}

function get(req, res) {
  const r = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!r) return res.json(fail('客户不存在'));
  return res.json(success({ ...r, tags: parseJSON(r.tags) || [], followUps: parseJSON(r.follow_ups) || [] }));
}

function create(req, res) {
  const { name, shortName, contact, contactTitle, phone, email, address, level, lifecycle, status, industry, area, source, owner } = req.body;
  try {
    const info = db.prepare(
      `INSERT INTO customers (name,short_name,contact,contact_title,phone,email,address,level,lifecycle,status,industry,area,source,owner,credit_rating,satisfaction,contract_count,last_visit,deal_amount,visits,create_date,tags,follow_ups) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      name, shortName || '', contact || '', contactTitle || '', phone || '', email || '', address || '',
      level || 'D', lifecycle || '潜客', status || '待开发', industry || '', area || '', source || '', owner || '待分配',
      '未评估', 0, 0, new Date().toISOString().slice(0, 10), 0, 0, new Date().toISOString().slice(0, 10), '[]', '[]'
    );
    auditLog('ADD_CUSTOMER', req.userId, String(info.lastInsertRowid), name);
    return res.json(success({ id: info.lastInsertRowid }, '客户添加成功'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function update(req, res) {
  const fields = ['name', 'short_name', 'contact', 'contact_title', 'phone', 'email', 'address', 'level', 'lifecycle', 'status', 'industry', 'area', 'source', 'owner', 'credit_rating', 'satisfaction', 'contract_count', 'last_visit', 'deal_amount', 'visits'];
  const sets = [];
  const vals = [];
  fields.forEach((f) => {
    const bodyKey = f.replace(/_./g, (m) => m[1].toUpperCase());
    if (req.body[bodyKey] !== undefined || req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(req.body[bodyKey] !== undefined ? req.body[bodyKey] : req.body[f]);
    }
  });
  if (req.body.tags !== undefined) { sets.push('tags=?'); vals.push(JSON.stringify(req.body.tags)); }
  if (req.body.followUps !== undefined) { sets.push('follow_ups=?'); vals.push(JSON.stringify(req.body.followUps)); }
  if (sets.length === 0) return res.json(fail('无更新字段'));
  vals.push(req.params.id);
  try {
    db.prepare(`UPDATE customers SET ${sets.join(',')} WHERE id=?`).run(...vals);
    return res.json(success({}, '客户信息更新成功'));
  } catch (e) {
    return res.json(fail('更新失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_CUSTOMER', req.userId, req.params.id, null);
    db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
    return res.json(success({}, '客户已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

function followup(req, res) {
  const { date, type, content, operator } = req.body;
  const row = db.prepare('SELECT follow_ups FROM customers WHERE id=?').get(req.params.id);
  const followUps = parseJSON(row.follow_ups) || [];
  followUps.unshift({ date, type, content, operator });
  db.prepare('UPDATE customers SET follow_ups=?, last_visit=?, visits=visits+1 WHERE id=?')
    .run(JSON.stringify(followUps), date, req.params.id);
  return res.json(success({ followUps }, '跟进记录已添加'));
}

module.exports = { list, get, create, update, remove, followup };
