const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const { toTrip, computeStats } = require('./trip.controller');

// 全局搜索（跨 5 张表，参数化 LIKE，无注入风险）
function search(req, res) {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 1) {
    return res.json(success({ customers: [], contracts: [], projects: [], users: [], trips: [] }));
  }
  const kw = '%' + q + '%';
  const results = {
    customers: db.prepare('SELECT id, name, contact, phone, level, status FROM customers WHERE name LIKE ? OR contact LIKE ? OR phone LIKE ? OR short_name LIKE ?').all(kw, kw, kw, kw),
    contracts: db.prepare('SELECT id, name, customer, type, amount, status FROM contracts WHERE id LIKE ? OR name LIKE ? OR customer LIKE ?').all(kw, kw, kw),
    projects: db.prepare('SELECT id, name, customer, status, manager FROM projects WHERE id LIKE ? OR name LIKE ? OR customer LIKE ? OR manager LIKE ?').all(kw, kw, kw, kw),
    users: db.prepare('SELECT id, name, dept, role FROM users WHERE id LIKE ? OR name LIKE ? OR dept LIKE ? OR role LIKE ?').all(kw, kw, kw, kw),
    trips: db.prepare('SELECT id, applicant, from_city, to_city, purpose, status FROM business_trips WHERE id LIKE ? OR applicant LIKE ? OR to_city LIKE ? OR purpose LIKE ?').all(kw, kw, kw, kw),
  };
  const total = Object.values(results).reduce((s, arr) => s + arr.length, 0);
  return res.json(success({ ...results, keyword: q, total }));
}

// 数据导出（JSON / CSV）
function exportData(req, res) {
  const module = req.params.module;
  const format = req.query.format || 'json';
  let data = [];
  let filename = module;

  switch (module) {
    case 'users':
      data = db.prepare('SELECT id,name,dept,role,status,join_date,level,phone,email FROM users ORDER BY id').all();
      filename = '员工名单'; break;
    case 'customers':
      data = db.prepare('SELECT id,name,short_name,contact,phone,level,lifecycle,status,owner,deal_amount FROM customers ORDER BY id').all();
      filename = '客户列表'; break;
    case 'contracts':
      data = db.prepare('SELECT id,name,customer,type,amount,start_date,end_date,status FROM contracts ORDER BY id').all();
      filename = '合同列表'; break;
    case 'projects':
      data = db.prepare('SELECT id,name,customer,status,priority,progress,budget,spent,manager FROM projects ORDER BY id').all();
      filename = '项目列表'; break;
    case 'leave':
      data = db.prepare('SELECT id,applicant,type,start_date,end_date,days,reason,status,approver FROM leave_records ORDER BY id DESC').all();
      filename = '假期记录'; break;
    case 'expense':
      data = db.prepare('SELECT id,applicant,category,amount,date,desc_text,status FROM expense_records ORDER BY id DESC').all();
      filename = '报销记录'; break;
    case 'trips':
      data = db.prepare('SELECT id,applicant,from_city,to_city,start_date,end_date,days,purpose,budget_total,actual_spent,status FROM business_trips ORDER BY id DESC').all();
      filename = '出差记录'; break;
    case 'purchases':
      data = db.prepare('SELECT id,title,category,amount,qty,unit,vendor,applicant,status FROM purchases ORDER BY id').all();
      filename = '采购记录'; break;
    default:
      return res.json(fail('不支持的数据模块: ' + module));
  }

  if (format === 'csv') {
    if (data.length === 0) return res.json(fail('无数据可导出'));
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row) => headers.map((h) => {
        const val = String(row[h] || '').replace(/"/g, '""');
        return /[",\n]/.test(val) ? `"${val}"` : val;
      }).join(',')),
    ];
    const asciiName = module + '_export';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}.csv"`);
    return res.send('﻿' + csvRows.join('\n'));
  }
  return res.json(success({ module, filename, count: data.length, data }));
}

// 全量数据（一次返回所有业务数据，减少前端请求次数）
function allData(req, res) {
  const allKV = db.prepare('SELECT key, value FROM kv_store').all();
  const kvMap = {};
  allKV.forEach((row) => { kvMap[row.key] = parseJSON(row.value); });

  const users = db.prepare('SELECT id,name,dept,role,status,join_date as joinDate,level,phone,education,age FROM users ORDER BY id').all();
  const departments = db.prepare('SELECT * FROM departments ORDER BY id').all();
  const roots = departments.filter((d) => !d.parent_id).map((d) => ({ ...d, children: [] }));
  departments.filter((d) => d.parent_id).forEach((d) => {
    const parent = roots.find((r) => r.id === d.parent_id);
    if (parent) parent.children.push({ ...d, children: [] });
  });
  const customers = db.prepare('SELECT * FROM customers ORDER BY id').all().map((r) => ({
    ...r, tags: parseJSON(r.tags) || [], followUps: parseJSON(r.follow_ups) || [],
  }));
  const contracts = db.prepare('SELECT * FROM contracts ORDER BY id').all().map((r) => ({ ...r, flow: parseJSON(r.flow) || [] }));
  const projects = db.prepare('SELECT * FROM projects ORDER BY id').all().map((r) => ({
    ...r, team: parseJSON(r.team) || [], milestones: parseJSON(r.milestones) || [], audits: parseJSON(r.audits) || [], flow: parseJSON(r.flow) || [],
  }));
  const leaveRecords = db.prepare('SELECT id,applicant,type,start_date as startDate,end_date as endDate,days,reason,status,approver FROM leave_records ORDER BY id DESC').all();
  const expenseRecords = db.prepare('SELECT id,applicant,category,amount,date,desc_text as `desc`,status,receipts FROM expense_records ORDER BY id DESC').all();
  const purchases = db.prepare('SELECT * FROM purchases ORDER BY id').all().map((r) => ({ ...r, flow: parseJSON(r.flow) || [] }));
  const roles = db.prepare('SELECT * FROM roles ORDER BY id').all().map((r) => ({ ...r, duties: parseJSON(r.duties) || [] }));
  const permApprovals = db.prepare('SELECT * FROM perm_approvals ORDER BY apply_date DESC').all().map((a) => ({
    ...a, target_modules: parseJSON(a.target_modules) || [],
  }));
  const permLogs = db.prepare('SELECT * FROM perm_logs ORDER BY log_date DESC').all();
  const workReports = db.prepare('SELECT * FROM work_reports ORDER BY id DESC').all();

  const tripRows = db.prepare('SELECT * FROM business_trips ORDER BY id DESC').all();
  const businessTrips = tripRows.map(toTrip);
  const tripStats = computeStats(businessTrips);

  const settingRows = db.prepare('SELECT key, value, category FROM system_settings').all();
  const settings = {};
  settingRows.forEach((r) => {
    if (!settings[r.category]) settings[r.category] = {};
    settings[r.category][r.key] = r.value;
  });

  const unreadNotifs = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read=0').get().c;

  return res.json(success({
    ...kvMap,
    users,
    departments: roots,
    customers,
    contracts,
    projects,
    leaveRecords,
    expenseRecords,
    purchases,
    roles,
    permApprovals,
    permLogs,
    workReports,
    businessTrips,
    tripStats,
    settings,
    unreadNotifs,
  }));
}

// 系统设置
function getSettings(req, res) {
  const rows = db.prepare('SELECT key, value, category FROM system_settings ORDER BY category, key').all();
  const settings = {};
  rows.forEach((r) => {
    if (!settings[r.category]) settings[r.category] = {};
    settings[r.category][r.key] = r.value;
  });
  return res.json(success(settings));
}

function saveSettings(req, res) {
  const updates = req.body;
  const stmt = db.prepare("UPDATE system_settings SET value=?, updated_at=datetime('now','localtime') WHERE key=?");
  const checkStmt = db.prepare('SELECT key FROM system_settings WHERE key=?');
  const insStmt = db.prepare('INSERT INTO system_settings (key,value,category) VALUES (?,?,?)');
  let updated = 0;
  try {
    const tx = db.transaction(() => {
      Object.entries(updates).forEach(([key, value]) => {
        if (checkStmt.get(key)) stmt.run(String(value), key);
        else insStmt.run(key, String(value), 'general');
        updated++;
      });
    });
    tx();
    return res.json(success({ updated }, '设置已保存'));
  } catch (e) {
    return res.json(fail('保存失败'));
  }
}

// 审计日志查询
function auditLogList(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const action = req.query.action || '';
  const logs = action
    ? db.prepare('SELECT * FROM audit_log WHERE action=? ORDER BY id DESC LIMIT ?').all(action, limit)
    : db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
  return res.json(success(logs));
}

// 健康检查
function health(req, res) {
  return res.json(success({ status: 'ok', version: '2.1.0' }));
}

module.exports = {
  search, exportData, allData, getSettings, saveSettings, auditLogList, health,
};
