/**
 * 合同分析仪表板 Controller
 */
const db = require('../db');
const { success, fail } = require('../utils/response');

// 获取概览数据
async function overview(req, res) {
  try {
    // 合同总数
    const totalRow = db.prepare('SELECT COUNT(*) as c FROM contracts').get();
    const total = totalRow.c;

    // 状态分布
    const statusStats = db.prepare(
      "SELECT status, COUNT(*) as count FROM contracts GROUP BY status ORDER BY count DESC"
    ).all();

    // 类型分布
    const typeStats = db.prepare(
      "SELECT COALESCE(NULLIF(type, ''), '未分类') as type, COUNT(*) as count FROM contracts GROUP BY COALESCE(NULLIF(type, ''), '未分类') ORDER BY count DESC"
    ).all();

    // 金额统计
    const amountRow = db.prepare(
      "SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total, COALESCE(AVG(amount), 0) as avg FROM contracts WHERE status IN ('已生效', '已盖章')"
    ).get();

    // 审批中数量
    const pendingRow = db.prepare(
      "SELECT COUNT(*) as c FROM contracts WHERE status = '审批中'"
    ).get();

    // 草稿数量
    const draftRow = db.prepare(
      "SELECT COUNT(*) as c FROM contracts WHERE status = '草稿'"
    ).get();

    // 即将到期数量(30天内)
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const expiringRow = db.prepare(
      "SELECT COUNT(*) as c FROM contracts WHERE status IN ('已生效', '已盖章') AND end_date IS NOT NULL AND end_date >= ? AND end_date <= ?"
    ).get(today, thirtyDaysLater);

    // 已过期数量
    const expiredRow = db.prepare(
      "SELECT COUNT(*) as c FROM contracts WHERE status IN ('已生效', '已盖章') AND end_date IS NOT NULL AND end_date < ?"
    ).get(today);

    return res.json(success({
      total,
      statusDistribution: statusStats,
      typeDistribution: typeStats,
      amount: {
        total: amountRow.total,
        average: Math.round(amountRow.avg),
        activeCount: amountRow.c
      },
      pendingApproval: pendingRow.c,
      draft: draftRow.c,
      expiringWithin30Days: expiringRow.c,
      expiredCount: expiredRow.c
    }));
  } catch (e) {
    console.error('[contractAnalytics] overview error:', e);
    return res.json(fail('获取合同总览数据失败: ' + e.message));
  }
}

// 获取即将到期合同
async function expiring(req, res) {
  try {
    const days = parseInt(req.query.days) || 90;
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const contracts = db.prepare(
      `SELECT id, contract_no, title, type, partner_company,
              amount, start_date, end_date, status, handler, dept,
              created_at
       FROM contracts
       WHERE status IN ('已生效', '已盖章')
         AND end_date IS NOT NULL
         AND end_date >= ? AND end_date <= ?
       ORDER BY end_date ASC`
    ).all(today, futureDate);

    const todayObj = new Date(today);
    const result = contracts.map(c => {
      const endDate = new Date(c.end_date);
      const diffDays = Math.ceil((endDate - todayObj) / (1000 * 60 * 60 * 24));
      return {
        ...c,
        remainingDays: diffDays,
        urgency: diffDays <= 7 ? '紧急' : diffDays <= 30 ? '高' : diffDays <= 60 ? '中' : '低'
      };
    });

    return res.json(success(result));
  } catch (e) {
    console.error('[contractAnalytics] expiring error:', e);
    return res.json(fail('获取即将到期合同失败: ' + e.message));
  }
}

// 获取部门统计
async function departmentStats(req, res) {
  try {
    const stats = db.prepare(
      `SELECT 
        dept as department,
        COUNT(*) as total,
        SUM(CASE WHEN status = '已生效' THEN 1 ELSE 0 END) as effective,
        SUM(CASE WHEN status = '审批中' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = '草稿' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = '已归档' THEN 1 ELSE 0 END) as archived,
        COALESCE(SUM(amount), 0) as totalAmount
       FROM contracts
       GROUP BY dept
       ORDER BY total DESC`
    ).all();

    return res.json(success(stats));
  } catch (e) {
    console.error('[contractAnalytics] departmentStats error:', e);
    return res.json(fail('获取部门统计失败: ' + e.message));
  }
}

// 获取月度趋势
async function monthlyTrend(req, res) {
  try {
    const months = parseInt(req.query.months) || 12;
    const stats = [];
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toISOString().slice(0, 7);
      
      const countRow = db.prepare(
        "SELECT COUNT(*) as c FROM contracts WHERE created_at LIKE ?"
      ).get(`${month}%`);
      
      stats.push({
        month,
        count: countRow.c
      });
    }

    return res.json(success(stats));
  } catch (e) {
    console.error('[contractAnalytics] monthlyTrend error:', e);
    return res.json(fail('获取月度趋势失败: ' + e.message));
  }
}

module.exports = {
  overview,
  expiring,
  departmentStats,
  monthlyTrend
};
