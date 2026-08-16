const db = require('../db');
const { success } = require('../utils/response');
const getKV = require('../utils/kv');

// 工作台
function dashboard(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const cnt = (sql, ...args) => {
    try {
      return db.prepare(sql).get(...args).count;
    } catch {
      return 0;
    }
  };

  // 实时统计（与参考项目对齐：全部从业务表实时计算）
  const totalStaff = cnt("SELECT COUNT(*) as count FROM users WHERE status != '离职'");
  const todayCheckin = cnt('SELECT COUNT(*) as count FROM checkins WHERE date = ?', today);
  const pendingReports = cnt("SELECT COUNT(*) as count FROM work_reports WHERE status IN ('已提交', '待审核', '待审阅')");
  const newCustomers = cnt("SELECT COUNT(*) as count FROM customers WHERE status != '已流失'");

  // 待审批总数 = 各业务模块待审批之和
  const pendingApprovals =
    cnt("SELECT COUNT(*) as count FROM contracts WHERE status = '待审批'") +
    cnt("SELECT COUNT(*) as count FROM purchases WHERE status = '待审批'") +
    cnt("SELECT COUNT(*) as count FROM leave_records WHERE status = '待审批'") +
    cnt("SELECT COUNT(*) as count FROM expense_records WHERE status = '待审批'") +
    cnt("SELECT COUNT(*) as count FROM business_trips WHERE status = '待审批'") +
    cnt("SELECT COUNT(*) as count FROM projects WHERE status = '待审批'") +
    cnt("SELECT COUNT(*) as count FROM announcements WHERE status = '待审批'");

  // 菜单角标数字
  const badgeStats = {
    pendingReports,
    pendingContracts: cnt("SELECT COUNT(*) as count FROM contracts WHERE status = '待审批'"),
    activeProjects: cnt("SELECT COUNT(*) as count FROM projects WHERE status NOT IN ('已完成', '已取消', '已驳回')"),
    pendingLogistics: cnt("SELECT COUNT(*) as count FROM logistics WHERE status = '待处理'"),
    pendingDocuments: cnt("SELECT COUNT(*) as count FROM documents WHERE status IN ('审批中', '待审批')"),
    pendingFinance: cnt("SELECT COUNT(*) as count FROM expense_records WHERE status = '待审批'"),
    pendingAnnouncements: cnt("SELECT COUNT(*) as count FROM announcements WHERE status = '待审批'"),
  };

  // kv_store 中的演示指标（周打卡率/月汇报率等保留），真实统计覆盖之
  const kvStats = getKV('stats') || {};

  // 公司公告（已发布，最新5条）
  let announcements = [];
  try {
    announcements = db
      .prepare("SELECT id, title, category, author, dept, created_at, published_at FROM announcements WHERE status = '已发布' ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5")
      .all();
  } catch { /* ignore */ }

  // 公司文件（已下发，最新5条）
  let docs = [];
  try {
    docs = db
      .prepare("SELECT id, title, type, author, dept, date FROM documents WHERE status = '已下发' ORDER BY date DESC LIMIT 5")
      .all();
  } catch { /* ignore */ }

  // 当前登录用户（从 token 对应的用户表实时取）
  let currentUser = getKV('currentUser');
  if (req.userId) {
    const u = db.prepare('SELECT id, name, dept, role, phone, avatar_color, leave_balance FROM users WHERE id = ?').get(req.userId);
    if (u) {
      currentUser = {
        id: u.id,
        name: u.name,
        avatar: (u.name || '?').charAt(0),
        avatarColor: u.avatar_color || '#2563eb',
        dept: u.dept,
        role: u.role,
        phone: u.phone,
        leaveBalance: (() => { try { return JSON.parse(u.leave_balance || '{}'); } catch { return {}; } })(),
      };
    }
  }

  return res.json(success({
    stats: {
      ...kvStats,
      todayCheckin,
      totalStaff,
      pendingReports,
      newCustomers,
      pendingApprovals,
      ...badgeStats,
    },
    announcements,
    docs,
    activities: getKV('activities'),
    todayCheckinStatus: getKV('todayCheckin'),
    currentUser,
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
