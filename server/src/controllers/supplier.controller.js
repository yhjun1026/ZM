const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

/**
 * 获取供应商列表
 */
function list(req, res) {
  const rows = db.prepare('SELECT * FROM suppliers ORDER BY created_at DESC').all();
  const suppliers = rows.map((r) => ({
    ...r,
    qualifications: parseJSON(r.qualifications) || [],
    products: parseJSON(r.products) || [],
    timeline: parseJSON(r.timeline) || [],
  }));
  return res.json(success(suppliers));
}

/**
 * 获取单个供应商详情
 */
function get(req, res) {
  const r = db.prepare('SELECT * FROM suppliers WHERE id=?').get(req.params.id);
  if (!r) return res.json(fail('供应商不存在'));
  return res.json(success({
    ...r,
    qualifications: parseJSON(r.qualifications) || [],
    products: parseJSON(r.products) || [],
    timeline: parseJSON(r.timeline) || [],
  }));
}

/**
 * 创建供应商
 */
function create(req, res) {
  const {
    name, shortName, category, level, contact, phone, email,
    address, bank, account, businessScope, remark
  } = req.body;

  if (!name) return res.json(fail('供应商名称不能为空'));

  // 生成供应商ID
  const count = db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count;
  const id = `SUP${String(count + 1).padStart(3, '0')}`;

  try {
    db.prepare(`
      INSERT INTO suppliers (
        id, name, short_name, category, level, contact, phone, email,
        address, bank, account, business_scope, remark, qualifications, products, timeline
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'[]','[]','[]')
    `).run(
      id, name, shortName || '', category || '', level || 'C',
      contact || '', phone || '', email || '', address || '',
      bank || '', account || '', businessScope || '', remark || ''
    );

    auditLog('ADD_SUPPLIER', req.userId, id, name);
    return res.json(success({ id }, '供应商创建成功'));
  } catch (e) {
    console.error('创建供应商失败:', e);
    return res.json(fail('操作失败'));
  }
}

/**
 * 更新供应商信息
 */
function update(req, res) {
  const fields = [
    'name', 'short_name', 'category', 'level', 'contact', 'phone', 'email',
    'address', 'bank', 'account', 'business_scope', 'status', 'rating', 'remark'
  ];

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
    db.prepare(`UPDATE suppliers SET ${sets.join(',')}, updated_at=datetime('now','localtime') WHERE id=?`).run(...vals);
    return res.json(success({}, '供应商信息更新成功'));
  } catch (e) {
    console.error('更新供应商失败:', e);
    return res.json(fail('更新失败'));
  }
}

/**
 * 删除供应商
 */
function remove(req, res) {
  try {
    const supplier = db.prepare('SELECT name FROM suppliers WHERE id=?').get(req.params.id);
    if (!supplier) return res.json(fail('供应商不存在'));

    auditLog('DELETE_SUPPLIER', req.userId, req.params.id, supplier.name);
    db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
    return res.json(success({}, '供应商已删除'));
  } catch (e) {
    console.error('删除供应商失败:', e);
    return res.json(fail('删除失败'));
  }
}

/**
 * 添加供应商产品
 */
function addProduct(req, res) {
  const { name, spec, price } = req.body;
  if (!name) return res.json(fail('产品名称不能为空'));

  try {
    const row = db.prepare('SELECT products FROM suppliers WHERE id=?').get(req.params.id);
    if (!row) return res.json(fail('供应商不存在'));

    const products = parseJSON(row.products) || [];
    products.push({ name, spec: spec || '', price: price || 0, addedAt: new Date().toISOString() });

    db.prepare('UPDATE suppliers SET products=?, updated_at=datetime("now","localtime") WHERE id=?')
      .run(JSON.stringify(products), req.params.id);

    return res.json(success({ products }, '产品添加成功'));
  } catch (e) {
    console.error('添加产品失败:', e);
    return res.json(fail('操作失败'));
  }
}

module.exports = { list, get, create, update, remove, addProduct };