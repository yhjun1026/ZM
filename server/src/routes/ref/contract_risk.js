/**
 * 合同风险评分与智能预警系统 API 路由
 *
 * 提供以下端点：
 * GET  /risk-scores         - 获取所有合同风险评分(支持分页/等级筛选)
 * GET  /risk-score/:id      - 获取单合同风险评分详情(含因子分解)
 * POST /refresh-scores       - 刷新所有合同风险评分并重新生成预警(高级权限)
 * GET  /alerts               - 获取预警列表(支持类型/状态筛选)
 * GET  /alerts/stats         - 预警统计概览
 * PUT  /alerts/:id/handle    - 处理预警(标记已处理/已忽略)
 * GET  /risk-trend            - 风险趋势(最近12个月评分变化)
 * GET  /risk-distribution     - 风险等级分布
 * GET  /risk-factors          - 风险因子聚合分析
 */

'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { success, error } = require('../../compat/helpers');

// 生成唯一预警ID（避免 genId 随机碰撞）
let _alertSeq = 0;
function genAlertId() {
  _alertSeq++;
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return `ALR-${ts}-${String(_alertSeq).padStart(4, '0')}`;
}
const { authMiddleware } = require('../../compat/auth');

// 所有接口都需要登录
router.use(authMiddleware);

// ============================================================
// 风险评分引擎 - 核心计算逻辑
// ============================================================

/**
 * 计算单个合同的风险评分
 * @param {Object} contract - 合同对象(来自 t_contract_main)
 * @returns {Object} { score, level, factors: {amount, duration, status, expiry, missing, riskRemark, confidential} }
 */
function calculateRiskScore(contract) {
  const factors = {
    amount: 0,      // 0-20  金额风险
    duration: 0,    // 0-15  期限风险
    status: 0,      // 0-20  状态风险
    expiry: 0,      // 0-20  到期临近风险
    missing: 0,     // 0-10  缺失字段风险
    riskRemark: 0,  // 0-10  内部风险备注
    confidential: 0 // 0-5   机密性风险
  };

  // --- 金额风险 (0-20) ---
  const amt = contract.amount || 0;
  if (amt > 1000000) factors.amount = 20;
  else if (amt > 500000) factors.amount = 15;
  else if (amt > 100000) factors.amount = 10;
  else if (amt > 0) factors.amount = 5;

  // --- 期限风险 (0-15) ---
  if (contract.start_date && contract.end_date) {
    const start = new Date(contract.start_date);
    const end = new Date(contract.end_date);
    const monthsDiff = (end - start) / (1000 * 60 * 60 * 24 * 30);
    if (monthsDiff > 24) factors.duration = 15;
    else if (monthsDiff > 12) factors.duration = 10;
    else if (monthsDiff > 6) factors.duration = 7;
    else if (monthsDiff > 0) factors.duration = 3;
  }

  // --- 状态风险 (0-20) ---
  const statusMap = {
    '草稿': 15, '审批中': 10, '变更中': 18, '终止中': 20,
    '已作废': 20, '已终止': 20, '已生效': 5, '已盖章': 3, '已归档': 0
  };
  factors.status = statusMap[contract.contract_status] || 5;

  // --- 到期临近风险 (0-20) ---
  if (!contract.end_date) {
    factors.expiry = 10; // 无到期日期，数据缺失风险
  } else {
    const now = new Date();
    const endDate = new Date(contract.end_date);
    const diffDays = Math.floor((endDate - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) factors.expiry = 20;           // 已过期
    else if (diffDays <= 7) factors.expiry = 20;     // 7天内到期
    else if (diffDays <= 30) factors.expiry = 15;    // 30天内
    else if (diffDays <= 60) factors.expiry = 10;    // 60天内
    else if (diffDays <= 90) factors.expiry = 5;     // 90天内
    // >90天 → 0
  }

  // --- 缺失字段风险 (0-10) ---
  let missingCount = 0;
  if (!contract.contact_person) missingCount += 2;
  if (!contract.contact_phone) missingCount += 2;
  if (!contract.social_credit_code) missingCount += 2;
  if (!contract.payment_method) missingCount += 2;
  if (!contract.tax_rate) missingCount += 2;
  factors.missing = Math.min(missingCount, 10);

  // --- 内部风险备注 (0-10) ---
  if (contract.internal_risk_remark && contract.internal_risk_remark.trim()) {
    factors.riskRemark = 10;
  }

  // --- 机密性风险 (0-5) ---
  if (contract.is_confidential === 1) {
    factors.confidential = 5;
  }

  const totalScore = factors.amount + factors.duration + factors.status +
    factors.expiry + factors.missing + factors.riskRemark + factors.confidential;

  let level;
  if (totalScore >= 76) level = '极高';
  else if (totalScore >= 51) level = '高';
  else if (totalScore >= 26) level = '中';
  else level = '低';

  return { score: totalScore, level, factors };
}

/**
 * 全量刷新风险评分并重新生成预警
 */
function refreshAllRiskScores() {
  // 获取所有合同
  const contracts = db.prepare('SELECT * FROM t_contract_main').all();
  const results = [];

  // 清空旧评分
  db.prepare('DELETE FROM t_contract_risk_scores').run();

  // 清空旧的自动预警(保留手动处理的记录)
  db.prepare("DELETE FROM t_contract_alerts WHERE status = '待处理'").run();

  const insertScore = db.prepare(`
    INSERT INTO t_contract_risk_scores
      (contract_id, contract_no, contract_name, risk_score, risk_level,
       factor_amount, factor_duration, factor_status, factor_expiry,
       factor_missing, factor_risk_remark, factor_confidential, evaluated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
  `);

  const insertAlert = db.prepare(`
    INSERT INTO t_contract_alerts
      (id, contract_id, contract_no, contract_name, alert_type, severity, title, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '待处理', datetime('now','localtime'))
  `);

  const tx = db.transaction(() => {
    for (const c of contracts) {
      const { score, level, factors } = calculateRiskScore(c);
      insertScore.run(c.id, c.contract_no, c.contract_name, score, level,
        factors.amount, factors.duration, factors.status, factors.expiry,
        factors.missing, factors.riskRemark, factors.confidential);
      results.push({ contract_id: c.id, contract_no: c.contract_no, score, level, factors });

      // --- 生成预警 ---
      // 1. 高风险预警
      if (score >= 61) {
        insertAlert.run(
          genAlertId(), c.id, c.contract_no, c.contract_name, 'high_risk',
          score >= 76 ? '紧急' : '高',
          `合同风险评分${score}分(${level})`,
          `合同「${c.contract_name || c.contract_no || c.id}」风险评分达到${score}分，风险等级为「${level}」，建议立即关注并采取管控措施。`,
        );
      }

      // 2. 到期预警(仅对生效/盖章状态的合同)
      if (c.end_date && ['已生效', '已盖章'].includes(c.contract_status)) {
        const now = new Date();
        const endDate = new Date(c.end_date);
        const diffDays = Math.floor((endDate - now) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          insertAlert.run(
            genAlertId(), c.id, c.contract_no, c.contract_name, 'expired', '紧急',
            '合同已过期', `合同「${c.contract_name || c.contract_no}」已于${c.end_date}过期，请及时处理续签或归档。`,
          );
        } else if (diffDays <= 7) {
          insertAlert.run(
            genAlertId(), c.id, c.contract_no, c.contract_name, 'expiring', '紧急',
            `合同${diffDays}天后到期`, `合同「${c.contract_name || c.contract_no}」将于${diffDays}天后(${c.end_date})到期，请尽快处理续签或终止事宜。`,
          );
        } else if (diffDays <= 30) {
          insertAlert.run(
            genAlertId(), c.id, c.contract_no, c.contract_name, 'expiring', '高',
            `合同${diffDays}天后到期`, `合同「${c.contract_name || c.contract_no}」将于${c.end_date}到期(剩余${diffDays}天)，请及时安排续签或终止评估。`,
          );
        } else if (diffDays <= 90) {
          insertAlert.run(
            genAlertId(), c.id, c.contract_no, c.contract_name, 'expiring', '中',
            `合同${diffDays}天后到期`, `合同「${c.contract_name || c.contract_no}」将于${c.end_date}到期(剩余${diffDays}天)，建议提前规划续签事宜。`,
          );
        }
      }

      // 3. 草稿停滞预警(创建超过30天仍为草稿)
      if (c.contract_status === '草稿' && c.created_at) {
        const createdDate = new Date(c.created_at);
        const daysSinceCreated = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
        if (daysSinceCreated > 30) {
          insertAlert.run(
            genAlertId(), c.id, c.contract_no, c.contract_name, 'stale_draft', '中',
            `草稿停滞${daysSinceCreated}天`,
            `合同「${c.contract_name || c.contract_no}」创建已${daysSinceCreated}天仍为草稿状态，请尽快提交审批或补充信息。`,
          );
        }
      }

      // 4. 关键信息缺失预警(缺失3个以上关键字段)
      let missingFields = [];
      if (!c.contact_person) missingFields.push('联系人');
      if (!c.contact_phone) missingFields.push('联系电话');
      if (!c.social_credit_code) missingFields.push('统一社会信用代码');
      if (!c.payment_method) missingFields.push('付款方式');
      if (!c.tax_rate) missingFields.push('税率');
      if (missingFields.length >= 3) {
        insertAlert.run(
          genAlertId(), c.id, c.contract_no, c.contract_name, 'missing_info', '低',
          `缺失${missingFields.length}项关键信息`,
          `合同「${c.contract_name || c.contract_no}」缺失以下关键字段：${missingFields.join('、')}，建议尽快补全。`,
        );
      }
    }
  });

  tx();
  return { evaluated: results.length, alerts: db.prepare("SELECT COUNT(*) as c FROM t_contract_alerts WHERE status = '待处理'").get().c };
}

// ============================================================
// GET /risk-scores - 获取所有合同风险评分
// ============================================================
router.get('/risk-scores', (req, res) => {
  try {
    const { level, page, pageSize } = req.query;
    const limit = parseInt(pageSize) || 0;
    const offset = ((parseInt(page) || 1) - 1) * limit;

    let whereClause = '';
    const params = [];
    if (level && level !== 'all') {
      whereClause = 'WHERE risk_level = ?';
      params.push(level);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as c FROM t_contract_risk_scores ${whereClause}`).get(...params);
    const total = countRow.c;

    let query = `SELECT * FROM t_contract_risk_scores ${whereClause} ORDER BY risk_score DESC`;
    if (limit > 0) {
      query += ` LIMIT ${limit}`;
      if (offset > 0) query += ` OFFSET ${offset}`;
    }
    const rows = db.prepare(query).all(...params);

    // 合并合同基础信息
    const contractMap = {};
    const contracts = db.prepare('SELECT id, contract_type, partner_company, amount, contract_status, end_date, created_dept FROM t_contract_main').all();
    contracts.forEach(c => { contractMap[c.id] = c; });
    rows.forEach(r => {
      const c = contractMap[r.contract_id] || {};
      r.contract_type = c.contract_type || '';
      r.partner_company = c.partner_company || '';
      r.amount = c.amount || 0;
      r.contract_status = c.contract_status || '';
      r.end_date = c.end_date || '';
      r.created_dept = c.created_dept || '';
    });

    success(res, {
      total,
      page: parseInt(page) || 1,
      pageSize: limit || total,
      list: rows
    });
  } catch (err) {
    console.error('[risk-scores] Error:', err);
    error(res, 500, '获取风险评分失败: ' + err.message);
  }
});

// ============================================================
// GET /risk-score/:id - 获取单合同风险评分详情
// ============================================================
router.get('/risk-score/:id', (req, res) => {
  try {
    const { id } = req.params;
    const score = db.prepare('SELECT * FROM t_contract_risk_scores WHERE contract_id = ? ORDER BY evaluated_at DESC LIMIT 1').get(id);
    if (!score) {
      return error(res, 404, '未找到该合同的风险评分记录');
    }

    // 获取合同详细信息
    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(id);
    if (contract) {
      score.contract = {
        id: contract.id,
        contract_no: contract.contract_no,
        contract_name: contract.contract_name,
        contract_type: contract.contract_type,
        partner_company: contract.partner_company,
        amount: contract.amount,
        contract_status: contract.contract_status,
        start_date: contract.start_date,
        end_date: contract.end_date,
        is_confidential: contract.is_confidential,
        internal_risk_remark: contract.internal_risk_remark,
        created_by: contract.created_by,
        created_dept: contract.created_dept,
        created_at: contract.created_at
      };
    }

    // 因子分解
    score.factors = {
      amount: score.factor_amount,
      duration: score.factor_duration,
      status: score.factor_status,
      expiry: score.factor_expiry,
      missing: score.factor_missing,
      riskRemark: score.factor_risk_remark,
      confidential: score.factor_confidential
    };
    score.maxScore = 100;

    // 获取该合同相关预警
    score.relatedAlerts = db.prepare('SELECT * FROM t_contract_alerts WHERE contract_id = ? ORDER BY created_at DESC').all(id);

    success(res, score);
  } catch (err) {
    console.error('[risk-score/:id] Error:', err);
    error(res, 500, '获取风险评分详情失败: ' + err.message);
  }
});

// ============================================================
// POST /refresh-scores - 刷新所有合同风险评分
// ============================================================
router.post('/refresh-scores', (req, res) => {
  try {
    // 权限检查：仅超级管理员/总经理/副总/行政部部门经理可刷新
    const allowedRoles = ['超级管理员', '总经理', '副总'];
    const allowedDepts = ['行政部'];
    if (!allowedRoles.includes(req.user.role) &&
        !(allowedDepts.includes(req.user.dept) && req.user.role === '部门经理')) {
      return error(res, 403, '权限不足，仅超级管理员/总经理/副总/行政部部门经理可刷新风险评分');
    }

    const result = refreshAllRiskScores();
    success(res, result, `风险评分刷新完成：评估${result.evaluated}份合同，生成${result.alerts}条待处理预警`);
  } catch (err) {
    console.error('[refresh-scores] Error:', err);
    error(res, 500, '刷新风险评分失败: ' + err.message);
  }
});

// ============================================================
// GET /alerts - 获取预警列表
// ============================================================
router.get('/alerts', (req, res) => {
  try {
    const { type, status, severity, contract_id } = req.query;

    let where = [];
    let params = [];
    if (type && type !== 'all') { where.push('alert_type = ?'); params.push(type); }
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
    if (severity && severity !== 'all') { where.push('severity = ?'); params.push(severity); }
    if (contract_id) { where.push('contract_id = ?'); params.push(contract_id); }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const rows = db.prepare(
      `SELECT * FROM t_contract_alerts ${whereClause} ORDER BY 
       CASE severity WHEN '紧急' THEN 0 WHEN '高' THEN 1 WHEN '中' THEN 2 WHEN '低' THEN 3 END,
       created_at DESC`
    ).all(...params);

    success(res, rows);
  } catch (err) {
    console.error('[alerts] Error:', err);
    error(res, 500, '获取预警列表失败: ' + err.message);
  }
});

// ============================================================
// GET /alerts/stats - 预警统计概览
// ============================================================
router.get('/alerts/stats', (req, res) => {
  try {
    // 按状态统计
    const byStatus = db.prepare(
      "SELECT status, COUNT(*) as count FROM t_contract_alerts GROUP BY status"
    ).all();

    // 按类型统计
    const byType = db.prepare(
      `SELECT alert_type as type, COUNT(*) as count,
        SUM(CASE WHEN status = '待处理' THEN 1 ELSE 0 END) as pending
       FROM t_contract_alerts GROUP BY alert_type`
    ).all();

    // 按紧急程度统计
    const bySeverity = db.prepare(
      "SELECT severity, COUNT(*) as count FROM t_contract_alerts WHERE status = '待处理' GROUP BY severity"
    ).all();

    // 风险等级分布
    const riskDistribution = db.prepare(
      "SELECT risk_level as level, COUNT(*) as count, AVG(risk_score) as avg_score FROM t_contract_risk_scores GROUP BY risk_level ORDER BY CASE risk_level WHEN '极高' THEN 0 WHEN '高' THEN 1 WHEN '中' THEN 2 WHEN '低' THEN 3 END"
    ).all();

    // 汇总
    const totalContracts = db.prepare('SELECT COUNT(*) as c FROM t_contract_risk_scores').get().c;
    const pendingAlerts = byStatus.find(s => s.status === '待处理')?.count || 0;
    const handledAlerts = byStatus.find(s => s.status === '已处理')?.count || 0;
    const ignoredAlerts = byStatus.find(s => s.status === '已忽略')?.count || 0;

    success(res, {
      totalAlerts: pendingAlerts + handledAlerts + ignoredAlerts,
      pendingAlerts,
      handledAlerts,
      ignoredAlerts,
      byStatus,
      byType,
      bySeverity,
      riskDistribution,
      totalContracts
    });
  } catch (err) {
    console.error('[alerts/stats] Error:', err);
    error(res, 500, '获取预警统计失败: ' + err.message);
  }
});

// ============================================================
// PUT /alerts/:id/handle - 处理预警
// ============================================================
router.put('/alerts/:id/handle', (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    if (!status || !['已处理', '已忽略'].includes(status)) {
      return error(res, 400, '处理状态必须为「已处理」或「已忽略」');
    }

    // 权限检查：部门经理以上可处理
    const userRole = req.user.role;
    if (!['超级管理员', '总经理', '副总', '部门经理'].includes(userRole)) {
      return error(res, 403, '权限不足，仅部门经理以上角色可处理预警');
    }

    const alert = db.prepare('SELECT * FROM t_contract_alerts WHERE id = ?').get(id);
    if (!alert) {
      return error(res, 404, '预警记录不存在');
    }

    db.prepare(`
      UPDATE t_contract_alerts SET
        status = ?, handled_by = ?, handled_by_id = ?,
        handled_at = datetime('now','localtime'), handled_remark = ?
      WHERE id = ?
    `).run(status, req.user.name, req.user.id, remark || '', id);

    success(res, { id, status, handledBy: req.user.name, handledAt: new Date().toISOString() }, '预警已' + (status === '已处理' ? '处理' : '忽略'));
  } catch (err) {
    console.error('[alerts/:id/handle] Error:', err);
    error(res, 500, '处理预警失败: ' + err.message);
  }
});

// ============================================================
// GET /risk-trend - 风险趋势(最近12个月)
// ============================================================
router.get('/risk-trend', (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const now = new Date();
    const trend = [];

    for (let i = months - 1; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const monthLabel = `${y}-${m}`;
      const monthEnd = new Date(y, m, 0); // Last day of month
      const monthEndStr = `${y}-${m}-${String(monthEnd.getDate()).padStart(2, '0')} 23:59:59`;

      // 统计该月最后一天的风险评分分布
      // 取该月及之前创建的评分记录中evaluated_at在该月的
      const scores = db.prepare(`
        SELECT risk_score, risk_level FROM t_contract_risk_scores
        WHERE evaluated_at <= ? AND evaluated_at >= ?
        ORDER BY evaluated_at DESC
      `).all(monthEndStr, `${y}-${m}-01 00:00:00`);

      // 因为可能有多条记录/合同，取每个合同最新的
      const contractScores = {};
      for (const s of scores) {
        // This gives us the latest scores up to end of month
        // For simplicity, we'll aggregate all scores in this month
      }

      // 取该月评估的所有评分
      const monthScores = db.prepare(`
        SELECT risk_score, risk_level FROM t_contract_risk_scores
        WHERE evaluated_at LIKE ? || '%'
      `).all(monthLabel);

      const high = monthScores.filter(s => s.risk_level === '高' || s.risk_level === '极高').length;
      const mid = monthScores.filter(s => s.risk_level === '中').length;
      const low = monthScores.filter(s => s.risk_level === '低').length;

      const avgScore = monthScores.length > 0
        ? Math.round(monthScores.reduce((sum, s) => sum + s.risk_score, 0) / monthScores.length)
        : 0;

      trend.push({
        month: monthLabel,
        total: monthScores.length,
        high,
        mid,
        low,
        avgScore
      });
    }

    success(res, trend);
  } catch (err) {
    console.error('[risk-trend] Error:', err);
    error(res, 500, '获取风险趋势失败: ' + err.message);
  }
});

// ============================================================
// GET /risk-distribution - 风险等级分布
// ============================================================
router.get('/risk-distribution', (req, res) => {
  try {
    const distribution = db.prepare(`
      SELECT risk_level as level, COUNT(*) as count,
        ROUND(AVG(risk_score), 1) as avg_score,
        MIN(risk_score) as min_score,
        MAX(risk_score) as max_score
      FROM t_contract_risk_scores
      GROUP BY risk_level
      ORDER BY CASE risk_level
        WHEN '极高' THEN 0 WHEN '高' THEN 1
        WHEN '中' THEN 2 WHEN '低' THEN 3
      END
    `).all();

    // 按因子统计Top风险因子
    const factorStats = db.prepare(`
      SELECT
        ROUND(AVG(factor_amount), 1) as avg_amount,
        ROUND(AVG(factor_duration), 1) as avg_duration,
        ROUND(AVG(factor_status), 1) as avg_status,
        ROUND(AVG(factor_expiry), 1) as avg_expiry,
        ROUND(AVG(factor_missing), 1) as avg_missing,
        ROUND(AVG(factor_risk_remark), 1) as avg_risk_remark,
        ROUND(AVG(factor_confidential), 1) as avg_confidential
      FROM t_contract_risk_scores
    `).get();

    const factors = [
      { name: '金额风险', key: 'amount', avg: factorStats.avg_amount || 0, max: 20 },
      { name: '期限风险', key: 'duration', avg: factorStats.avg_duration || 0, max: 15 },
      { name: '状态风险', key: 'status', avg: factorStats.avg_status || 0, max: 20 },
      { name: '到期风险', key: 'expiry', avg: factorStats.avg_expiry || 0, max: 20 },
      { name: '缺失字段', key: 'missing', avg: factorStats.avg_missing || 0, max: 10 },
      { name: '风险备注', key: 'riskRemark', avg: factorStats.avg_risk_remark || 0, max: 10 },
      { name: '机密性', key: 'confidential', avg: factorStats.avg_confidential || 0, max: 5 },
    ];

    const total = distribution.reduce((sum, d) => sum + d.count, 0);

    success(res, { distribution, total, factors });
  } catch (err) {
    console.error('[risk-distribution] Error:', err);
    error(res, 500, '获取风险分布失败: ' + err.message);
  }
});

// ============================================================
// GET /risk-factors - 风险因子聚合分析(按部门)
// ============================================================
router.get('/risk-factors', (req, res) => {
  try {
    // 按部门聚合风险因子
    const deptStats = db.prepare(`
      SELECT
        cm.created_dept as dept,
        COUNT(*) as count,
        ROUND(AVG(rs.risk_score), 1) as avg_score,
        ROUND(AVG(rs.factor_amount), 1) as avg_amount,
        ROUND(AVG(rs.factor_duration), 1) as avg_duration,
        ROUND(AVG(rs.factor_status), 1) as avg_status,
        ROUND(AVG(rs.factor_expiry), 1) as avg_expiry,
        ROUND(AVG(rs.factor_missing), 1) as avg_missing,
        ROUND(AVG(rs.factor_risk_remark), 1) as avg_risk_remark,
        ROUND(AVG(rs.factor_confidential), 1) as avg_confidential,
        SUM(CASE WHEN rs.risk_level = '高' OR rs.risk_level = '极高' THEN 1 ELSE 0 END) as high_count
      FROM t_contract_risk_scores rs
      LEFT JOIN t_contract_main cm ON rs.contract_id = cm.id
      GROUP BY cm.created_dept
      ORDER BY avg_score DESC
    `).all();

    success(res, deptStats);
  } catch (err) {
    console.error('[risk-factors] Error:', err);
    error(res, 500, '获取风险因子分析失败: ' + err.message);
  }
});

module.exports = router;
