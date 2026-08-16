/**
 * 合同分析仪表板与预警系统 API 路由
 *
 * 提供以下端点：
 * GET  /overview           - 合同总览KPI数据(总数/状态分布/类型分布/金额统计)
 * GET  /expiring           - 即将到期合同预警(30/60/90天内到期)
 * GET  /expired            - 已过期合同列表
 * GET  /pending-approvals  - 待审批合同列表(来自审批流程实例)
 * GET  /monthly-trend       - 月度合同趋势(最近12个月新建/完成统计)
 * GET  /department-stats    - 部门合同统计(按创建部门分组)
 * GET  /templates           - 合同模板列表
 * POST /templates           - 创建合同模板
 * PUT  /templates/:id       - 更新合同模板
 * DELETE /templates/:id     - 删除合同模板(启用状态不可删除)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { success, error, genId, safeParse } = require('../../compat/helpers');
const { authMiddleware } = require('../../compat/auth');

// 所有接口都需要登录
router.use(authMiddleware);

// ============================================================
// GET /overview - 合同总览KPI数据
// ============================================================
router.get('/overview', (req, res) => {
  try {
    // 合同总数
    const totalRow = db.prepare('SELECT COUNT(*) as c FROM t_contract_main').get();
    const total = totalRow.c;

    // 状态分布
    const statusStats = db.prepare(
      "SELECT contract_status as status, COUNT(*) as count FROM t_contract_main GROUP BY contract_status ORDER BY count DESC"
    ).all();

    // 类型分布
    const typeStats = db.prepare(
      "SELECT COALESCE(NULLIF(contract_type, ''), '未分类') as type, COUNT(*) as count FROM t_contract_main GROUP BY COALESCE(NULLIF(contract_type, ''), '未分类') ORDER BY count DESC"
    ).all();

    // 金额统计(仅已生效/已盖章/已归档的合同)
    const amountRow = db.prepare(
      "SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total, COALESCE(AVG(amount), 0) as avg, COALESCE(MAX(amount), 0) as max, COALESCE(MIN(amount), 0) as min FROM t_contract_main WHERE contract_status IN ('已生效', '已盖章', '已归档')"
    ).get();

    // 审批中数量
    const pendingRow = db.prepare(
      "SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status = '审批中'"
    ).get();

    // 草稿数量
    const draftRow = db.prepare(
      "SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status = '草稿'"
    ).get();

    // 流程实例统计
    const flowStats = db.prepare(
      "SELECT flow_id, status, COUNT(*) as count FROM t_flow_instances GROUP BY flow_id, status"
    ).all();

    // 审计日志总数
    const auditRow = db.prepare('SELECT COUNT(*) as c FROM t_contract_audit_log').get();

    // 模板数量
    const templateRow = db.prepare("SELECT COUNT(*) as c FROM contract_templates WHERE status = '启用'").get();

    // 即将到期数量(30天内)
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const expiringRow = db.prepare(
      "SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status IN ('已生效', '已盖章') AND end_date != '' AND end_date IS NOT NULL AND end_date >= ? AND end_date <= ?"
    ).get(today, thirtyDaysLater);

    // 已过期数量(已生效但end_date已过)
    const expiredRow = db.prepare(
      "SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status IN ('已生效', '已盖章') AND end_date != '' AND end_date IS NOT NULL AND end_date < ?"
    ).get(today);

    return success(res, {
      total,
      statusDistribution: statusStats,
      typeDistribution: typeStats,
      amount: {
        total: amountRow.total,
        average: Math.round(amountRow.avg),
        max: amountRow.max,
        min: amountRow.min,
        activeCount: amountRow.c
      },
      pendingApproval: pendingRow.c,
      draft: draftRow.c,
      flowInstances: flowStats,
      auditLogCount: auditRow.c,
      templateCount: templateRow.c,
      expiringWithin30Days: expiringRow.c,
      expiredCount: expiredRow.c
    });
  } catch (e) {
    console.error('[contract_analytics] /overview error:', e);
    return error(res, 500, '获取合同总览数据失败: ' + e.message);
  }
});

// ============================================================
// GET /expiring - 即将到期合同预警
// ============================================================
router.get('/expiring', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const contracts = db.prepare(
      `SELECT id, contract_no, contract_name, contract_type, partner_company,
              amount, start_date, end_date, contract_status, handler, created_dept,
              created_at
       FROM t_contract_main
       WHERE contract_status IN ('已生效', '已盖章')
         AND end_date != '' AND end_date IS NOT NULL
         AND end_date >= ? AND end_date <= ?
       ORDER BY end_date ASC`
    ).all(today, futureDate);

    // 计算每个合同的剩余天数
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

    // 按紧急程度分组统计
    const urgencyStats = {
      critical: result.filter(c => c.remainingDays <= 7).length,
      high: result.filter(c => c.remainingDays > 7 && c.remainingDays <= 30).length,
      medium: result.filter(c => c.remainingDays > 30 && c.remainingDays <= 60).length,
      low: result.filter(c => c.remainingDays > 60).length
    };

    return success(res, {
      days: days,
      total: result.length,
      urgencyStats,
      contracts: result
    });
  } catch (e) {
    console.error('[contract_analytics] /expiring error:', e);
    return error(res, 500, '获取即将到期合同失败: ' + e.message);
  }
});

// ============================================================
// GET /expired - 已过期合同列表
// ============================================================
router.get('/expired', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const contracts = db.prepare(
      `SELECT id, contract_no, contract_name, contract_type, partner_company,
              amount, start_date, end_date, contract_status, handler, created_dept,
              created_at
       FROM t_contract_main
       WHERE contract_status IN ('已生效', '已盖章')
         AND end_date != '' AND end_date IS NOT NULL
         AND end_date < ?
       ORDER BY end_date DESC`
    ).all(today);

    const todayObj = new Date(today);
    const result = contracts.map(c => {
      const endDate = new Date(c.end_date);
      const diffDays = Math.ceil((todayObj - endDate) / (1000 * 60 * 60 * 24));
      return {
        ...c,
        expiredDays: diffDays,
        expiredDuration: diffDays > 365 ? Math.floor(diffDays / 365) + '年' :
                         diffDays > 30 ? Math.floor(diffDays / 30) + '个月' :
                         diffDays + '天'
      };
    });

    return success(res, {
      total: result.length,
      contracts: result
    });
  } catch (e) {
    console.error('[contract_analytics] /expired error:', e);
    return error(res, 500, '获取已过期合同失败: ' + e.message);
  }
});

// ============================================================
// GET /pending-approvals - 待审批合同列表
// ============================================================
router.get('/pending-approvals', (req, res) => {
  try {
    // 从 t_flow_instances 获取进行中的审批流程
    const flows = db.prepare(
      `SELECT fi.id, fi.flow_id, fi.contract_id, fi.contract_no, fi.status,
              fi.current_node, fi.started_by, fi.started_by_id, fi.started_at,
              cm.contract_name, cm.contract_type, cm.partner_company, cm.amount,
              cm.contract_status, cm.created_dept
       FROM t_flow_instances fi
       LEFT JOIN t_contract_main cm ON fi.contract_id = cm.id
       WHERE fi.status = '进行中'
       ORDER BY fi.started_at DESC`
    ).all();

    // 解析 flow_data 获取当前节点信息
    const result = flows.map(f => {
      let flowData = safeParse(f.flow_data, {});
      let flowSteps = flowData.steps || flowData.nodes || [];
      let currentStepInfo = null;

      if (Array.isArray(flowSteps)) {
        currentStepInfo = flowSteps.find(s => !s.done && s.step !== '—') || null;
      }

      // 流程类型中文名
      const flowTypeMap = {
        'flow_contract_new': '合同新签',
        'flow_contract_change': '合同变更',
        'flow_contract_end': '合同终止',
        'flow_contract_borrow': '合同借阅'
      };

      return {
        flowInstanceId: f.id,
        flowType: f.flow_id,
        flowTypeName: flowTypeMap[f.flow_id] || f.flow_id,
        contractId: f.contract_id,
        contractNo: f.contract_no || '',
        contractName: f.contract_name || '',
        contractType: f.contract_type || '',
        partnerCompany: f.partner_company || '',
        amount: f.amount || 0,
        contractStatus: f.contract_status || '',
        createdDept: f.created_dept || '',
        currentNode: f.current_node || '',
        currentApprover: currentStepInfo ? (currentStepInfo.step || '') : (f.current_node || ''),
        startedBy: f.started_by,
        startedById: f.started_by_id,
        startedAt: f.started_at,
        flowSteps: flowSteps
      };
    });

    // 按流程类型分组统计
    const typeStats = {};
    result.forEach(r => {
      if (!typeStats[r.flowTypeName]) typeStats[r.flowTypeName] = 0;
      typeStats[r.flowTypeName]++;
    });

    return success(res, {
      total: result.length,
      typeStats,
      pendingFlows: result
    });
  } catch (e) {
    console.error('[contract_analytics] /pending-approvals error:', e);
    return error(res, 500, '获取待审批合同失败: ' + e.message);
  }
});

// ============================================================
// GET /monthly-trend - 月度合同趋势(最近12个月)
// ============================================================
router.get('/monthly-trend', (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const trends = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const yearMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const monthStart = yearMonth + '-01';
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().slice(0, 10);

      // 当月新建合同数
      const newRow = db.prepare(
        "SELECT COUNT(*) as c FROM t_contract_main WHERE created_at >= ? AND created_at < ?"
      ).get(monthStart, monthEnd);

      // 当月生效合同数
      const effectiveRow = db.prepare(
        "SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status IN ('已生效', '已盖章') AND updated_at >= ? AND updated_at < ?"
      ).get(monthStart, monthEnd);

      // 当月合同总金额(新建)
      const amountRow = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM t_contract_main WHERE created_at >= ? AND created_at < ?"
      ).get(monthStart, monthEnd);

      // 当月归档数
      const archivedRow = db.prepare(
        "SELECT COUNT(*) as c FROM t_contract_main WHERE contract_status = '已归档' AND updated_at >= ? AND updated_at < ?"
      ).get(monthStart, monthEnd);

      trends.push({
        month: yearMonth,
        newContracts: newRow.c,
        effective: effectiveRow.c,
        archived: archivedRow.c,
        totalAmount: amountRow.total
      });
    }

    return success(res, {
      months: months,
      trends: trends
    });
  } catch (e) {
    console.error('[contract_analytics] /monthly-trend error:', e);
    return error(res, 500, '获取月度趋势失败: ' + e.message);
  }
});

// ============================================================
// GET /department-stats - 部门合同统计
// ============================================================
router.get('/department-stats', (req, res) => {
  try {
    // 按创建部门分组统计
    const deptStats = db.prepare(
      `SELECT COALESCE(NULLIF(created_dept, ''), '未分配') as department,
              COUNT(*) as total,
              SUM(CASE WHEN contract_status = '已生效' THEN 1 ELSE 0 END) as effective,
              SUM(CASE WHEN contract_status = '审批中' THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN contract_status = '草稿' THEN 1 ELSE 0 END) as draft,
              SUM(CASE WHEN contract_status = '已归档' THEN 1 ELSE 0 END) as archived,
              SUM(CASE WHEN contract_status IN ('已生效', '已盖章', '已归档') THEN 1 ELSE 0 END) as active,
              COALESCE(SUM(CASE WHEN contract_status IN ('已生效', '已盖章', '已归档') THEN amount ELSE 0 END), 0) as totalAmount
       FROM t_contract_main
       GROUP BY COALESCE(NULLIF(created_dept, ''), '未分配')
       ORDER BY total DESC`
    ).all();

    // 按合同类型 x 部门交叉统计
    const crossStats = db.prepare(
      `SELECT COALESCE(NULLIF(created_dept, ''), '未分配') as department,
              COALESCE(NULLIF(contract_type, ''), '未分类') as contractType,
              COUNT(*) as count,
              COALESCE(SUM(amount), 0) as totalAmount
       FROM t_contract_main
       GROUP BY COALESCE(NULLIF(created_dept, ''), '未分配'),
                COALESCE(NULLIF(contract_type, ''), '未分类')
       ORDER BY department, count DESC`
    ).all();

    return success(res, {
      departmentStats: deptStats,
      crossStats: crossStats
    });
  } catch (e) {
    console.error('[contract_analytics] /department-stats error:', e);
    return error(res, 500, '获取部门统计失败: ' + e.message);
  }
});

// ============================================================
// GET /templates - 合同模板列表
// ============================================================
router.get('/templates', (req, res) => {
  try {
    const templates = db.prepare(
      `SELECT id, name, category, content, fields, creator, creator_id, status,
              created_at, updated_at
       FROM contract_templates
       ORDER BY updated_at DESC`
    ).all();

    // 解析fields JSON
    const result = templates.map(t => ({
      ...t,
      fields: safeParse(t.fields, [])
    }));

    // 按分类分组
    const categoryStats = {};
    result.forEach(t => {
      const cat = t.category || '未分类';
      if (!categoryStats[cat]) categoryStats[cat] = 0;
      categoryStats[cat]++;
    });

    return success(res, {
      total: result.length,
      categoryStats,
      templates: result
    });
  } catch (e) {
    console.error('[contract_analytics] /templates GET error:', e);
    return error(res, 500, '获取合同模板列表失败: ' + e.message);
  }
});

// ============================================================
// POST /templates - 创建合同模板
// ============================================================
router.post('/templates', (req, res) => {
  try {
    const { name, category, content, fields } = req.body;

    if (!name || !name.trim()) {
      return error(res, 400, '模板名称不能为空');
    }

    // 权限检查：仅超级管理员、总经理、行政部负责人可创建模板
    const user = req.user;
    const allowedRoles = ['超级管理员', '总经理', '副总'];
    const allowedDepts = ['行政部'];
    if (!allowedRoles.includes(user.role) &&
        !(allowedDepts.includes(user.dept) && ['部门经理', '超级管理员'].includes(user.role))) {
      return error(res, 403, '无权限创建合同模板，仅管理员或行政部负责人可操作');
    }

    const id = genId('TPL');
    const fieldsJson = JSON.stringify(fields || []);
    const now = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');

    db.prepare(
      `INSERT INTO contract_templates (id, name, category, content, fields, creator, creator_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '启用', ?, ?)`
    ).run(id, name.trim(), category || '', content || '', fieldsJson,
          user.name, user.id, now, now);

    return success(res, { id, name: name.trim() }, '合同模板创建成功');
  } catch (e) {
    console.error('[contract_analytics] /templates POST error:', e);
    return error(res, 500, '创建合同模板失败: ' + e.message);
  }
});

// ============================================================
// PUT /templates/:id - 更新合同模板
// ============================================================
router.put('/templates/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, content, fields, status } = req.body;

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(id);
    if (!existing) {
      return error(res, 404, '合同模板不存在');
    }

    // 权限检查
    const user = req.user;
    const allowedRoles = ['超级管理员', '总经理', '副总'];
    if (!allowedRoles.includes(user.role) &&
        !(user.dept === '行政部' && ['部门经理', '超级管理员'].includes(user.role))) {
      return error(res, 403, '无权限修改合同模板');
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (content !== undefined) { updates.push('content = ?'); params.push(content); }
    if (fields !== undefined) { updates.push('fields = ?'); params.push(JSON.stringify(fields)); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length === 0) {
      return error(res, 400, '没有需要更新的字段');
    }

    const now = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
    updates.push('updated_at = ?');
    params.push(now);
    params.push(id);

    db.prepare(`UPDATE contract_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    return success(res, { id }, '合同模板更新成功');
  } catch (e) {
    console.error('[contract_analytics] /templates PUT error:', e);
    return error(res, 500, '更新合同模板失败: ' + e.message);
  }
});

// ============================================================
// DELETE /templates/:id - 删除合同模板
// ============================================================
router.delete('/templates/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(id);
    if (!existing) {
      return error(res, 404, '合同模板不存在');
    }

    // 权限检查
    const user = req.user;
    const allowedRoles = ['超级管理员', '总经理'];
    if (!allowedRoles.includes(user.role)) {
      return error(res, 403, '无权限删除合同模板，仅超级管理员或总经理可操作');
    }

    // 启用状态的模板不可直接删除，需先禁用
    if (existing.status === '启用') {
      return error(res, 400, '启用状态的模板不可删除，请先禁用后再删除');
    }

    db.prepare('DELETE FROM contract_templates WHERE id = ?').run(id);

    return success(res, { id }, '合同模板已删除');
  } catch (e) {
    console.error('[contract_analytics] /templates DELETE error:', e);
    return error(res, 500, '删除合同模板失败: ' + e.message);
  }
});

// ============================================================
// GET /monthly-signing-stat - 月度签约金额统计(按月统计签约数量+金额)
// ============================================================
router.get('/monthly-signing-stat', (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const result = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const yearMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const monthStart = yearMonth + '-01';
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().slice(0, 10);

      // 签约合同数(已生效/已盖章/已归档)
      const signedRow = db.prepare(
        "SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total, COALESCE(AVG(amount), 0) as avg FROM t_contract_main WHERE contract_status IN ('已生效','已盖章','已归档') AND created_at >= ? AND created_at < ?"
      ).get(monthStart, monthEnd);

      // 按类型细分
      const typeBreakdown = db.prepare(
        "SELECT COALESCE(NULLIF(contract_type,''),'未分类') as type, COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM t_contract_main WHERE contract_status IN ('已生效','已盖章','已归档') AND created_at >= ? AND created_at < ? GROUP BY COALESCE(NULLIF(contract_type,''),'未分类') ORDER BY count DESC"
      ).all(monthStart, monthEnd);

      result.push({
        month: yearMonth,
        signedCount: signedRow.c,
        totalAmount: signedRow.total,
        avgAmount: Math.round(signedRow.avg),
        typeBreakdown: typeBreakdown
      });
    }

    // 汇总
    const summary = {
      totalSigned: result.reduce((s, r) => s + r.signedCount, 0),
      totalAmount: result.reduce((s, r) => s + r.totalAmount, 0),
      avgMonthly: result.length > 0 ? Math.round(result.reduce((s, r) => s + r.signedCount, 0) / result.length) : 0,
      peakMonth: result.length > 0 ? result.reduce((max, r) => r.signedCount > max.signedCount ? r : max, result[0]) : null
    };

    return success(res, { months, summary, monthlyStats: result });
  } catch (e) {
    console.error('[contract_analytics] /monthly-signing-stat error:', e);
    return error(res, 500, '获取月度签约统计失败: ' + e.message);
  }
});

// ============================================================
// GET /department-signing-stat - 各部门签约统计(合同数/总金额/平均金额)
// ============================================================
router.get('/department-signing-stat', (req, res) => {
  try {
    const stats = db.prepare(
      `SELECT COALESCE(NULLIF(created_dept,''),'未分配') as department,
              COUNT(*) as totalContracts,
              SUM(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN 1 ELSE 0 END) as signedCount,
              SUM(CASE WHEN contract_status = '审批中' THEN 1 ELSE 0 END) as pendingCount,
              SUM(CASE WHEN contract_status = '草稿' THEN 1 ELSE 0 END) as draftCount,
              SUM(CASE WHEN contract_status = '已终止' THEN 1 ELSE 0 END) as terminatedCount,
              COALESCE(SUM(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN amount ELSE 0 END), 0) as totalAmount,
              COALESCE(AVG(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN amount END), 0) as avgAmount,
              COALESCE(MAX(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN amount END), 0) as maxAmount,
              COALESCE(MIN(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN amount END), 0) as minAmount
       FROM t_contract_main
       GROUP BY COALESCE(NULLIF(created_dept,''),'未分配')
       ORDER BY totalContracts DESC`
    ).all();

    // 类型交叉统计
    const typeCross = db.prepare(
      `SELECT COALESCE(NULLIF(created_dept,''),'未分配') as department,
              COALESCE(NULLIF(contract_type,''),'未分类') as contractType,
              COUNT(*) as count,
              COALESCE(SUM(amount),0) as amount
       FROM t_contract_main
       WHERE contract_status IN ('已生效','已盖章','已归档')
       GROUP BY COALESCE(NULLIF(created_dept,''),'未分配'), COALESCE(NULLIF(contract_type,''),'未分类')
       ORDER BY department, count DESC`
    ).all();

    // 汇总
    const summary = {
      totalDepartments: stats.length,
      totalContracts: stats.reduce((s, r) => s + r.totalContracts, 0),
      totalSigned: stats.reduce((s, r) => s + r.signedCount, 0),
      totalAmount: stats.reduce((s, r) => s + r.totalAmount, 0),
      topDept: stats.length > 0 ? stats[0].department : null
    };

    return success(res, { summary, departmentStats: stats, typeBreakdown: typeCross });
  } catch (e) {
    console.error('[contract_analytics] /department-signing-stat error:', e);
    return error(res, 500, '获取部门签约统计失败: ' + e.message);
  }
});

// ============================================================
// GET /expiry-stat - 到期合同统计(按月统计即将到期数量+金额)
// ============================================================
router.get('/expiry-stat', (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;
    const today = new Date().toISOString().slice(0, 10);
    const result = [];

    for (let i = 0; i < months; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      const yearMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const monthStart = i === 0 ? today : yearMonth + '-01';
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().slice(0, 10);

      const row = db.prepare(
        "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total, COALESCE(AVG(amount),0) as avg FROM t_contract_main WHERE contract_status IN ('已生效','已盖章') AND end_date != '' AND end_date IS NOT NULL AND end_date >= ? AND end_date < ?"
      ).get(monthStart, monthEnd);

      // 按类型细分
      const typeBreakdown = db.prepare(
        "SELECT COALESCE(NULLIF(contract_type,''),'未分类') as type, COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM t_contract_main WHERE contract_status IN ('已生效','已盖章') AND end_date != '' AND end_date IS NOT NULL AND end_date >= ? AND end_date < ? GROUP BY COALESCE(NULLIF(contract_type,''),'未分类') ORDER BY count DESC"
      ).all(monthStart, monthEnd);

      // 按部门细分
      const deptBreakdown = db.prepare(
        "SELECT COALESCE(NULLIF(created_dept,''),'未分配') as dept, COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM t_contract_main WHERE contract_status IN ('已生效','已盖章') AND end_date != '' AND end_date IS NOT NULL AND end_date >= ? AND end_date < ? GROUP BY COALESCE(NULLIF(created_dept,''),'未分配') ORDER BY count DESC"
      ).all(monthStart, monthEnd);

      result.push({
        month: yearMonth,
        expiringCount: row.c,
        totalAmount: row.total,
        avgAmount: Math.round(row.avg),
        typeBreakdown: typeBreakdown,
        deptBreakdown: deptBreakdown
      });
    }

    // 已过期统计
    const expiredRow = db.prepare(
      "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM t_contract_main WHERE contract_status IN ('已生效','已盖章') AND end_date != '' AND end_date IS NOT NULL AND end_date < ?"
    ).get(today);

    const summary = {
      totalExpiring: result.reduce((s, r) => s + r.expiringCount, 0),
      totalAmount: result.reduce((s, r) => s + r.totalAmount, 0),
      expiredCount: expiredRow.c,
      expiredAmount: expiredRow.total,
      peakMonth: result.length > 0 ? result.reduce((max, r) => r.expiringCount > max.expiringCount ? r : max, result[0]) : null
    };

    return success(res, { months, summary, expiryStats: result });
  } catch (e) {
    console.error('[contract_analytics] /expiry-stat error:', e);
    return error(res, 500, '获取到期统计失败: ' + e.message);
  }
});

// ============================================================
// GET /partner-ranking - 合作方排名(按合同数量/金额排名TOP10)
// ============================================================
router.get('/partner-ranking', (req, res) => {
  try {
    const sortBy = req.query.sortBy === 'amount' ? 'totalAmount' : 'contractCount';
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const partners = db.prepare(
      `SELECT COALESCE(NULLIF(partner_company,''),'未知合作方') as partnerName,
              COUNT(*) as contractCount,
              SUM(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN 1 ELSE 0 END) as signedCount,
              SUM(CASE WHEN contract_status = '审批中' THEN 1 ELSE 0 END) as pendingCount,
              SUM(CASE WHEN contract_status = '已终止' THEN 1 ELSE 0 END) as terminatedCount,
              COALESCE(SUM(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN amount ELSE 0 END), 0) as totalAmount,
              COALESCE(MAX(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN amount END), 0) as maxAmount,
              COALESCE(AVG(CASE WHEN contract_status IN ('已生效','已盖章','已归档') THEN amount END), 0) as avgAmount,
              MIN(created_at) as firstCooperation,
              MAX(created_at) as lastCooperation
       FROM t_contract_main
       WHERE partner_company IS NOT NULL AND partner_company != ''
       GROUP BY COALESCE(NULLIF(partner_company,''),'未知合作方')
       ORDER BY ${sortBy === 'totalAmount' ? 'totalAmount' : 'contractCount'} DESC
       LIMIT ?`
    ).all(limit);

    // 计算总合作方数
    const totalPartnersRow = db.prepare(
      "SELECT COUNT(DISTINCT COALESCE(NULLIF(partner_company,''),'未知合作方')) as c FROM t_contract_main WHERE partner_company IS NOT NULL AND partner_company != ''"
    ).get();

    const summary = {
      totalPartners: totalPartnersRow.c,
      topPartner: partners.length > 0 ? partners[0].partnerName : null,
      totalAmount: partners.reduce((s, p) => s + p.totalAmount, 0),
      totalContracts: partners.reduce((s, p) => s + p.contractCount, 0)
    };

    return success(res, { sortBy, limit, summary, partners });
  } catch (e) {
    console.error('[contract_analytics] /partner-ranking error:', e);
    return error(res, 500, '获取合作方排名失败: ' + e.message);
  }
});

module.exports = router;
