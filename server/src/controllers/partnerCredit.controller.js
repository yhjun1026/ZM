const db = require('../db');
const { success, fail } = require('../utils/response');

// 获取统计
async function stats(req, res) {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM partner_credits').get().c;
    const totalAmount = db.prepare('SELECT COALESCE(SUM(total_amount), 0) as total FROM partner_credits').get().total;
    const aLevel = db.prepare("SELECT COUNT(*) as c FROM partner_credits WHERE credit_rating = 'A'").get().c;

    return res.json(success({
      total,
      totalAmount,
      avgOnTimeRate: 95,
      aLevel
    }));
  } catch (e) {
    return res.json(fail('获取统计失败: ' + e.message));
  }
}

// 获取列表
async function list(req, res) {
  try {
    const { rating, risk_level, keyword } = req.query;
    let sql = 'SELECT * FROM partner_credits WHERE 1=1';
    const params = [];

    if (rating) {
      sql += ' AND credit_rating = ?';
      params.push(rating);
    }
    if (risk_level) {
      sql += ' AND risk_level = ?';
      params.push(risk_level);
    }
    if (keyword) {
      sql += ' AND (partner_name LIKE ? OR social_credit_code LIKE ? OR contact_person LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY created_at DESC';
    const partners = db.prepare(sql).all(...params);
    return res.json(success(partners));
  } catch (e) {
    return res.json(fail('获取列表失败: ' + e.message));
  }
}

// 获取详情
async function get(req, res) {
  try {
    const { id } = req.params;
    const partner = db.prepare('SELECT * FROM partner_credits WHERE id = ?').get(id);
    if (!partner) {
      return res.json(fail('合作方不存在'));
    }
    return res.json(success(partner));
  } catch (e) {
    return res.json(fail('获取详情失败: ' + e.message));
  }
}

// 新增档案
async function create(req, res) {
  try {
    if (req.user.role !== '超级管理员' && req.user.role !== '总经理' && 
        req.user.role !== '副总' && !(req.user.role === '行政部经理' || req.user.role === '法务专员')) {
      return res.json(fail('权限不足', 403));
    }

    const data = req.body;
    const id = 'PC-' + Date.now();

    db.prepare(`
      INSERT INTO partner_credits (
        id, partner_name, social_credit_code, contact_person, contact_phone,
        credit_rating, risk_level, total_contracts, total_amount, on_time_rate, remark, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id, data.partner_name, data.social_credit_code, data.contact_person, data.contact_phone,
      data.credit_rating || 'C', data.risk_level || '中', 0, 0, 100, data.remark || ''
    );

    return res.json(success({ id }, '档案创建成功'));
  } catch (e) {
    return res.json(fail('创建档案失败: ' + e.message));
  }
}

// 更新档案
async function update(req, res) {
  try {
    if (req.user.role !== '超级管理员' && req.user.role !== '总经理' && 
        req.user.role !== '副总' && !(req.user.role === '行政部经理' || req.user.role === '法务专员')) {
      return res.json(fail('权限不足', 403));
    }

    const { id } = req.params;
    const data = req.body;

    db.prepare(`
      UPDATE partner_credits SET
        partner_name = ?, social_credit_code = ?, contact_person = ?, contact_phone = ?,
        credit_rating = ?, risk_level = ?, remark = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      data.partner_name, data.social_credit_code, data.contact_person, data.contact_phone,
      data.credit_rating, data.risk_level, data.remark, id
    );

    return res.json(success({}, '档案更新成功'));
  } catch (e) {
    return res.json(fail('更新档案失败: ' + e.message));
  }
}

// 自动同步
async function autoSync(req, res) {
  try {
    if (req.user.role !== '超级管理员' && req.user.role !== '总经理') {
      return res.json(fail('权限不足', 403));
    }

    // 从合同数据中提取合作方信息
    const contracts = db.prepare(`
      SELECT DISTINCT partner_company, COUNT(*) as contract_count, SUM(amount) as total_amount
      FROM contracts
      WHERE partner_company IS NOT NULL AND partner_company != ''
      GROUP BY partner_company
    `).all();

    let syncCount = 0;
    for (const c of contracts) {
      const existing = db.prepare('SELECT * FROM partner_credits WHERE partner_name = ?').get(c.partner_company);
      if (!existing) {
        const id = 'PC-' + Date.now() + '-' + syncCount;
        db.prepare(`
          INSERT INTO partner_credits (id, partner_name, total_contracts, total_amount, credit_rating, risk_level, created_at)
          VALUES (?, ?, ?, ?, 'C', '中', datetime('now'))
        `).run(id, c.partner_company, c.contract_count, c.total_amount);
        syncCount++;
      }
    }

    return res.json(success({ syncCount }, `已同步${syncCount}个合作方档案`));
  } catch (e) {
    return res.json(fail('自动同步失败: ' + e.message));
  }
}

module.exports = {
  stats,
  list,
  get,
  create,
  update,
  autoSync
};
