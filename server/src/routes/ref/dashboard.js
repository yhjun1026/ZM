/**
 * 工作台/仪表板路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, safeParse } = require('../../compat/helpers');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const totalStaff = db.prepare("SELECT COUNT(*) as c FROM users WHERE status='在职'").get().c;
  const totalStaffAll = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  const todayCheckin = db.prepare('SELECT COUNT(*) as c FROM checkins WHERE date = ?').get(today).c;
  const pendingReports = db.prepare("SELECT COUNT(*) as c FROM work_reports WHERE status='待审核'").get().c;
  const pendingApprovals = db.prepare("SELECT COUNT(*) as c FROM contracts WHERE status='待审批'").get().c
    + db.prepare("SELECT COUNT(*) as c FROM purchases WHERE status='待审批'").get().c
    + db.prepare("SELECT COUNT(*) as c FROM leaves WHERE status='待审批'").get().c
    + db.prepare("SELECT COUNT(*) as c FROM expenses WHERE status='待审批'").get().c
    + db.prepare("SELECT COUNT(*) as c FROM business_trips WHERE status='待审批'").get().c
    + db.prepare("SELECT COUNT(*) as c FROM projects WHERE status='待审批'").get().c
    + db.prepare("SELECT COUNT(*) as c FROM finance_records WHERE status='待审批'").get().c;

  // 公司文件（已下发）
  const docs = db.prepare("SELECT id,title,type,author,dept,date FROM documents WHERE status='已下发' ORDER BY date DESC LIMIT 5").all();

  // 部门人员分布
  const deptStats = db.prepare("SELECT dept as name, COUNT(*) as count FROM users WHERE status != '离职' GROUP BY dept ORDER BY count DESC").all();

  // 合同统计
  const contractStats = db.prepare("SELECT status, COUNT(*) as c FROM contracts GROUP BY status").all();
  const contractTotal = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM contracts WHERE status != '已驳回'").get().total;

  // 客户统计
  const customerStats = db.prepare("SELECT level, COUNT(*) as c FROM customers GROUP BY level").all();
  const totalCustomers = db.prepare("SELECT COUNT(*) as c FROM customers").get().c;

  // 公司公告（已发布，最新5条）
  const announcements = db.prepare("SELECT id,title,category,author,dept,created_at FROM announcements WHERE status='已发布' ORDER BY created_at DESC LIMIT 5").all();

  // 菜单角标统计
  const badgeStats = {
    pendingContracts: db.prepare("SELECT COUNT(*) as c FROM contracts WHERE status='待审批'").get().c,
    pendingLogistics: db.prepare("SELECT COUNT(*) as c FROM logistics WHERE status='待处理'").get().c,
    pendingDocuments: db.prepare("SELECT COUNT(*) as c FROM documents WHERE status IN ('审批中','待审批')").get().c,
    pendingFinance: db.prepare("SELECT COUNT(*) as c FROM finance_records WHERE status='待审批'").get().c,
    pendingAnnouncements: db.prepare("SELECT COUNT(*) as c FROM announcements WHERE status='待审批'").get().c,
  };

  return success(res, {
    stats: {
      todayCheckin, totalStaff, totalStaffAll, pendingReports, pendingApprovals,
      weekCheckinRate: 94, monthReportRate: 87, newCustomers: totalCustomers,
      totalContracts: contractStats.reduce((s, c) => s + c.c, 0),
      contractTotal, activeProjects: db.prepare("SELECT COUNT(*) as c FROM projects WHERE status NOT IN ('已完成','已取消')").get().c,
      ...badgeStats
    },
    announcements,
    docs,
    deptStats,
    contractStats,
    customerStats
  });
});

module.exports = router;
