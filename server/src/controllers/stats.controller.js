const db = require('../db');
const { success } = require('../utils/response');
const getKV = require('../utils/kv');

// 工作台
function dashboard(req, res) {
  return res.json(success({
    stats: getKV('stats'),
    activities: getKV('activities'),
    todayCheckin: getKV('todayCheckin'),
    currentUser: getKV('currentUser'),
  }));
}

// 智能驾驶舱
function cockpit(req, res) {
  return res.json(success(getKV('cockpit')));
}

// 销售统计
function sales(req, res) {
  return res.json(success(getKV('sales')));
}

// 财务
function finance(req, res) {
  return res.json(success(getKV('finance')));
}

// 统计聚合（实时 SQL 计算）
function statistics(req, res) {
  const stats = {
    users: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='在职' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status='试用期' THEN 1 ELSE 0 END) as trial FROM users").get(),
    customers: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='合作中' THEN 1 ELSE 0 END) as active FROM customers").get(),
    contracts: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='执行中' THEN 1 ELSE 0 END) as active, COALESCE(SUM(amount),0) as totalAmount FROM contracts").get(),
    projects: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='执行中' THEN 1 ELSE 0 END) as active FROM projects").get(),
    leave: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='待审批' THEN 1 ELSE 0 END) as pending FROM leave_records").get(),
    expense: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='待审批' THEN 1 ELSE 0 END) as pending, COALESCE(SUM(amount),0) as totalAmount FROM expense_records").get(),
    purchases: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='待审批' THEN 1 ELSE 0 END) as pending, COALESCE(SUM(amount),0) as totalAmount FROM purchases").get(),
    trips: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='待审批' THEN 1 ELSE 0 END) as pending FROM business_trips").get(),
    reports: db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='已提交' THEN 1 ELSE 0 END) as submitted FROM work_reports").get(),
  };
  return res.json(success(stats));
}

// ===== kv_store 取值类接口（原 6 个会因 key 缺失 500，已由迁移补齐 + 此处 getKV 兜底） =====
function customerLevels(req, res) { return res.json(success(getKV('customerLevels'))); }
function customerLifecycle(req, res) { return res.json(success(getKV('customerLifecycle'))); }
function checkinRecords(req, res) { return res.json(success(getKV('checkinRecords'))); }
function teamMembers(req, res) { return res.json(success(getKV('teamMembers'))); }
function projectStats(req, res) { return res.json(success(getKV('projectStats'))); }
function reportsList(req, res) { return res.json(success(getKV('reportsList'))); }

module.exports = {
  dashboard, cockpit, sales, finance, statistics,
  customerLevels, customerLifecycle, checkinRecords, teamMembers, projectStats, reportsList,
};
