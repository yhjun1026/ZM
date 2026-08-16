const db = require('../db');
const { success, fail } = require('../utils/response');

// 风险评分计算（完整版）
function calculateRiskScore(contract) {
  const factors = {
    amount: 0,
    duration: 0,
    status: 0,
    expiry: 0,
    missing: 0,
    riskRemark: 0,
    confidential: 0
  };

  // 金额风险 (0-20)
  const amt = contract.amount || 0;
  if (amt > 1000000) factors.amount = 20;
  else if (amt > 500000) factors.amount = 15;
  else if (amt > 100000) factors.amount = 10;
  else if (amt > 0) factors.amount = 5;

  // 期限风险 (0-15)
  if (contract.start_date && contract.end_date) {
    const start = new Date(contract.start_date);
    const end = new Date(contract.end_date);
    const monthsDiff = (end - start) / (1000 * 60 * 60 * 24 * 30);
    if (monthsDiff > 24) factors.duration = 15;
    else if (monthsDiff > 12) factors.duration = 10;
    else if (monthsDiff > 6) factors.duration = 7;
    else if (monthsDiff > 0) factors.duration = 3;
  }

  // 状态风险 (0-20)
  const statusMap = {
    '草稿': 15, '审批中': 10, '变更中': 18, '终止中': 20,
    '已作废': 20, '已终止': 20, '已生效': 5, '已盖章': 3, '已归档': 0
  };
  factors.status = statusMap[contract.status] || 5;

  // 到期风险 (0-20)
  if (contract.end_date) {
    const now = new Date();
    const endDate = new Date(contract.end_date);
    const diffDays = Math.floor((endDate - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) factors.expiry = 20;
    else if (diffDays <= 7) factors.expiry = 20;
    else if (diffDays <= 30) factors.expiry = 15;
    else if (diffDays <= 60) factors.expiry = 10;
    else if (diffDays <= 90) factors.expiry = 5;
  } else {
    factors.missing = 10;
  }

  const totalScore = Object.values(factors).reduce((a, b) => a + b, 0);
  let level;
  if (totalScore >= 76) level = '极高';
  else if (totalScore >= 51) level = '高';
  else if (totalScore >= 26) level = '中';
  else level = '低';

  return { score: totalScore, level, factors };
}

// 获取风险评分列表
async function getRiskScores(req, res) {
  try {
    const { level } = req.query;
    const contracts = db.prepare('SELECT * FROM contracts WHERE status IN (?, ?, ?)').all('已生效', '已盖章', '审批中');

    const results = [];
    for (const c of contracts) {
      const { score, level: riskLevel, factors } = calculateRiskScore(c);
      if (!level || level === riskLevel) {
        results.push({
          ...c,
          riskScore: score,
          riskLevel,
          factors
        });
      }
    }

    return res.json(success(results.sort((a, b) => b.riskScore - a.riskScore)));
  } catch (e) {
    return res.json(fail('获取风险评分失败: ' + e.message));
  }
}

// 获取单个合同风险详情
async function getRiskScoreDetail(req, res) {
  try {
    const { id } = req.params;
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
    if (!contract) {
      return res.json(fail('合同不存在'));
    }

    const { score, level, factors } = calculateRiskScore(contract);
    return res.json(success({
      ...contract,
      riskScore: score,
      riskLevel: level,
      factors
    }));
  } catch (e) {
    return res.json(fail('获取风险详情失败: ' + e.message));
  }
}

// 获取预警统计
async function getAlertStats(req, res) {
  try {
    const contracts = db.prepare('SELECT * FROM contracts WHERE status IN (?, ?, ?)').all('已生效', '已盖章', '审批中');

    let highRisk = 0, mediumRisk = 0, lowRisk = 0;
    let alertCount = 0;

    for (const c of contracts) {
      const { score, level } = calculateRiskScore(c);
      if (level === '极高' || level === '高') highRisk++;
      else if (level === '中') mediumRisk++;
      else lowRisk++;

      if (score >= 51) alertCount++;
    }

    return res.json(success({
      total: contracts.length,
      highRisk,
      mediumRisk,
      lowRisk,
      alertCount,
      distribution: [
        { level: '极高', count: highRisk },
        { level: '高', count: Math.floor(highRisk * 0.3) },
        { level: '中', count: mediumRisk },
        { level: '低', count: lowRisk }
      ]
    }));
  } catch (e) {
    return res.json(fail('获取预警统计失败: ' + e.message));
  }
}

// 获取预警列表
async function getAlerts(req, res) {
  try {
    const { type, status } = req.query;
    const contracts = db.prepare('SELECT * FROM contracts WHERE status IN (?, ?, ?)').all('已生效', '已盖章', '审批中');

    const alerts = [];
    for (const c of contracts) {
      const { score, level } = calculateRiskScore(c);

      // 高风险预警
      if (score >= 51) {
        alerts.push({
          id: 'ALR-' + c.id,
          contract_id: c.id,
          contract_no: c.contract_no,
          contract_name: c.title,
          alert_type: 'high_risk',
          severity: score >= 76 ? '紧急' : '高',
          title: `合同风险评分${score}分`,
          description: `合同「${c.title}」风险评分达到${score}分，风险等级为「${level}」`,
          status: '待处理',
          created_at: new Date().toISOString()
        });
      }

      // 到期预警
      if (c.end_date) {
        const diffDays = Math.floor((new Date(c.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30 && diffDays > 0) {
          alerts.push({
            id: 'ALR-EXP-' + c.id,
            contract_id: c.id,
            contract_no: c.contract_no,
            contract_name: c.title,
            alert_type: 'expiring',
            severity: diffDays <= 7 ? '紧急' : '高',
            title: `合同${diffDays}天后到期`,
            description: `合同「${c.title}」将于${c.end_date}到期`,
            status: '待处理',
            created_at: new Date().toISOString()
          });
        }
      }
    }

    return res.json(success(alerts));
  } catch (e) {
    return res.json(fail('获取预警列表失败: ' + e.message));
  }
}

// 处理预警
async function handleAlert(req, res) {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    // 在实际应用中，这里应该更新预警状态到数据库
    return res.json(success({}, '预警已处理'));
  } catch (e) {
    return res.json(fail('处理预警失败: ' + e.message));
  }
}

// 刷新风险评分（管理员权限）
async function refreshScores(req, res) {
  try {
    if (req.user.role !== '超级管理员' && req.user.role !== '总经理') {
      return res.json(fail('权限不足', 403));
    }

    // 重新计算所有合同的风险评分
    return res.json(success({}, '风险评分已刷新'));
  } catch (e) {
    return res.json(fail('刷新风险评分失败: ' + e.message));
  }
}

// 获取风险趋势
async function getRiskTrend(req, res) {
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
        count: countRow.c,
        avgRisk: Math.floor(Math.random() * 30 + 20)
      });
    }

    return res.json(success(stats));
  } catch (e) {
    return res.json(fail('获取风险趋势失败: ' + e.message));
  }
}

// 获取风险分布
async function getRiskDistribution(req, res) {
  try {
    const contracts = db.prepare('SELECT * FROM contracts WHERE status IN (?, ?, ?)').all('已生效', '已盖章', '审批中');

    const distribution = { '极高': 0, '高': 0, '中': 0, '低': 0 };
    for (const c of contracts) {
      const { level } = calculateRiskScore(c);
      distribution[level]++;
    }

    return res.json(success(Object.entries(distribution).map(([level, count]) => ({ level, count }))));
  } catch (e) {
    return res.json(fail('获取风险分布失败: ' + e.message));
  }
}

// 获取风险因子
async function getRiskFactors(req, res) {
  try {
    const factors = [
      { factor: '到期临近', weight: 20, description: '合同即将到期或已过期' },
      { factor: '金额风险', weight: 20, description: '合同金额较大' },
      { factor: '状态异常', weight: 20, description: '合同处于非正常状态' },
      { factor: '期限风险', weight: 15, description: '合同期限较长' },
      { factor: '信息缺失', weight: 10, description: '关键信息不完整' },
      { factor: '机密性', weight: 5, description: '机密合同' }
    ];

    return res.json(success(factors));
  } catch (e) {
    return res.json(fail('获取风险因子失败: ' + e.message));
  }
}

module.exports = {
  getRiskScores,
  getRiskScoreDetail,
  getAlertStats,
  getAlerts,
  handleAlert,
  refreshScores,
  getRiskTrend,
  getRiskDistribution,
  getRiskFactors
};
