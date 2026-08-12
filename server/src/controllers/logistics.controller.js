const db = require('../db');
const { success, fail } = require('../utils/response');
const auditLog = require('../utils/audit');

/**
 * 获取后勤工单列表
 */
function listItems(req, res) {
  const rows = db.prepare('SELECT * FROM logistics ORDER BY created_at DESC').all();
  return res.json(success(rows));
}

/**
 * 获取单个工单详情
 */
function getItem(req, res) {
  const r = db.prepare('SELECT * FROM logistics WHERE id=?').get(req.params.id);
  if (!r) return res.json(fail('工单不存在'));
  return res.json(success(r));
}

/**
 * 创建后勤工单
 */
function createItem(req, res) {
  const { type, title, detail, cost } = req.body;
  if (!title) return res.json(fail('标题不能为空'));

  try {
    const info = db.prepare(`
      INSERT INTO logistics (type, title, applicant, applicant_id, dept, status, date, detail, cost)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      type || '维修', title, req.user.name, req.user.id, req.user.dept,
      '待处理', new Date().toISOString().slice(0, 10), detail || '', cost || 0
    );

    auditLog('ADD_LOGISTICS', req.userId, String(info.lastInsertRowid), title);
    return res.json(success({ id: info.lastInsertRowid }, '工单已创建'));
  } catch (e) {
    console.error('创建工单失败:', e);
    return res.json(fail('操作失败'));
  }
}

/**
 * 更新工单状态
 */
function updateItem(req, res) {
  const { status, detail, cost } = req.body;

  try {
    const item = db.prepare('SELECT title FROM logistics WHERE id=?').get(req.params.id);
    if (!item) return res.json(fail('工单不存在'));

    const updates = [];
    const vals = [];

    if (status) { updates.push('status=?'); vals.push(status); }
    if (detail !== undefined) { updates.push('detail=?'); vals.push(detail); }
    if (cost !== undefined) { updates.push('cost=?'); vals.push(cost); }

    if (updates.length === 0) return res.json(fail('无更新字段'));

    vals.push(req.params.id);
    db.prepare(`UPDATE logistics SET ${updates.join(',')} WHERE id=?`).run(...vals);

    auditLog('UPDATE_LOGISTICS', req.userId, req.params.id, item.title);
    return res.json(success({}, '工单已更新'));
  } catch (e) {
    console.error('更新工单失败:', e);
    return res.json(fail('更新失败'));
  }
}

/**
 * 获取车辆列表
 */
function listVehicles(req, res) {
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY id').all();
  return res.json(success(rows));
}

/**
 * 获取单个车辆详情
 */
function getVehicle(req, res) {
  const r = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);
  if (!r) return res.json(fail('车辆不存在'));
  return res.json(success(r));
}

/**
 * 添加车辆
 */
function createVehicle(req, res) {
  const { plate, model, driver, status, lastMaintenance, nextMaintenance, mileage } = req.body;
  if (!plate) return res.json(fail('车牌号不能为空'));

  try {
    const info = db.prepare(`
      INSERT INTO vehicles (plate, model, driver, status, last_maintenance, next_maintenance, mileage)
      VALUES (?,?,?,?,?,?,?)
    `).run(
      plate, model || '', driver || '', status || '可用',
      lastMaintenance || null, nextMaintenance || null, mileage || 0
    );

    auditLog('ADD_VEHICLE', req.userId, String(info.lastInsertRowid), plate);
    return res.json(success({ id: info.lastInsertRowid }, '车辆已添加'));
  } catch (e) {
    console.error('添加车辆失败:', e);
    return res.json(fail('操作失败'));
  }
}

/**
 * 更新车辆信息
 */
function updateVehicle(req, res) {
  const { plate, model, driver, status, lastMaintenance, nextMaintenance, mileage } = req.body;

  try {
    const vehicle = db.prepare('SELECT plate FROM vehicles WHERE id=?').get(req.params.id);
    if (!vehicle) return res.json(fail('车辆不存在'));

    const updates = [];
    const vals = [];

    if (plate) { updates.push('plate=?'); vals.push(plate); }
    if (model !== undefined) { updates.push('model=?'); vals.push(model); }
    if (driver !== undefined) { updates.push('driver=?'); vals.push(driver); }
    if (status !== undefined) { updates.push('status=?'); vals.push(status); }
    if (lastMaintenance !== undefined) { updates.push('last_maintenance=?'); vals.push(lastMaintenance); }
    if (nextMaintenance !== undefined) { updates.push('next_maintenance=?'); vals.push(nextMaintenance); }
    if (mileage !== undefined) { updates.push('mileage=?'); vals.push(mileage); }

    if (updates.length === 0) return res.json(fail('无更新字段'));

    vals.push(req.params.id);
    db.prepare(`UPDATE vehicles SET ${updates.join(',')} WHERE id=?`).run(...vals);

    auditLog('UPDATE_VEHICLE', req.userId, req.params.id, vehicle.plate);
    return res.json(success({}, '车辆信息已更新'));
  } catch (e) {
    console.error('更新车辆失败:', e);
    return res.json(fail('更新失败'));
  }
}

module.exports = {
  listItems, getItem, createItem, updateItem,
  listVehicles, getVehicle, createVehicle, updateVehicle
};