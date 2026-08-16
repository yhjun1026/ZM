/**
 * 合作方信用档案 API 路由 (partner_credit)
 *
 * 功能：
 * - 合作方信用档案CRUD
 * - 自动从t_contract_main同步合作方数据
 * - 统计: 总数/评级分布/风险分布
 * - 关联合同列表
 *
 * 权限模型：
 * - 查看：所有登录用户
 * - 新增/修改：法务专员 OR 超级管理员/总经理/副总 OR 行政部部门经理
 * - 自动同步：同新增/修改权限
 *
 * 路由前缀：/api/partner-credit
 */

'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { success, error, genId, now } = require('../../compat/helpers');
const { authMiddleware } = require('../../compat/auth');

// 所有接口都需要登录
router.use(authMiddleware);

// ============================================================
// 权限检查
// ============================================================
function canManage(user) {
  if (user.contract_role === '法务专员') return true;
  const adminRoles = ['超级管理员', '总经理', '副总'];
  if (adminRoles.includes(user.role)) return true;
  if (user.dept === '行政部' && ['部门经理', '超级管理员'].includes(user.role)) return true;
  return false;
}

// ============================================================
// GET /stats - 统计概览
// ============================================================
router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM t_partner_credit').get().c;

    const ratingDist = db.prepare(
      `SELECT credit_rating, COUNT(*) as count FROM t_partner_credit GROUP BY credit_rating`
    ).all();

    const riskDist = db.prepare(
      `SELECT risk_level, COUNT(*) as count FROM t_partner_credit GROUP BY risk_level`
    ).all();

    const totalAmount = db.prepare(
      'SELECT COALESCE(SUM(total_amount), 0) as sum FROM t_partner_credit'
    ).get().sum;

    const avgOnTime = db.prepare(
      'SELECT COALESCE(AVG(on_time_rate), 100) as avg FROM t_partner_credit'
    ).get().avg;

    return success(res, {
      total,
      totalAmount: Math.round(totalAmount * 100) / 100,
      avgOnTimeRate: Math.round(avgOnTime * 100) / 100,
      ratingDistribution: ratingDist,
      riskDistribution: riskDist
    });
  } catch (e) {
    return error(res, 500, '获取统计失败: ' + e.message);
  }
});

// ============================================================
// GET / - 列表（支持搜索/筛选/分页）
// ============================================================
router.get('/', (req, res) => {
  try {
    const { keyword, rating, risk, page, pageSize } = req.query;
    const pageNum = parseInt(page) || 1;
    const size = parseInt(pageSize) || 20;
    const offset = (pageNum - 1) * size;

    let sql = 'SELECT * FROM t_partner_credit WHERE 1=1';
    const params = [];

    if (keyword) {
      sql += ' AND (partner_name LIKE ? OR social_credit_code LIKE ? OR contact_person LIKE ?)';
      params.push('%' + keyword + '%', '%' + keyword + '%', '%' + keyword + '%');
    }
    if (rating) {
      sql += ' AND credit_rating = ?';
      params.push(rating);
    }
    if (risk) {
      sql += ' AND risk_level = ?';
      params.push(risk);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(size, offset);

    const list = db.prepare(sql).all(...params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as c FROM t_partner_credit WHERE 1=1';
    const countParams = [];
    if (keyword) {
      countSql += ' AND (partner_name LIKE ? OR social_credit_code LIKE ? OR contact_person LIKE ?)';
      countParams.push('%' + keyword + '%', '%' + keyword + '%', '%' + keyword + '%');
    }
    if (rating) {
      countSql += ' AND credit_rating = ?';
      countParams.push(rating);
    }
    if (risk) {
      countSql += ' AND risk_level = ?';
      countParams.push(risk);
    }
    const total = db.prepare(countSql).get(...countParams).c;

    return success(res, {
      list,
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size)
    });
  } catch (e) {
    return error(res, 500, '获取列表失败: ' + e.message);
  }
});

// ============================================================
// GET /:id - 详情（含关联合同列表）
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const partner = db.prepare('SELECT * FROM t_partner_credit WHERE id = ?').get(id);
    if (!partner) {
      return error(res, 404, '合作方档案不存在');
    }

    // 查询关联合同
    const contracts = db.prepare(
      `SELECT id, contract_no, contract_name, contract_type, amount,
              contract_status, start_date, end_date, created_at
       FROM t_contract_main
       WHERE partner_company = ?
       ORDER BY created_at DESC`
    ).all(partner.partner_name);

    return success(res, { partner, contracts });
  } catch (e) {
    return error(res, 500, '获取详情失败: ' + e.message);
  }
});

// ============================================================
// POST / - 新增
// ============================================================
router.post('/', (req, res) => {
  try {
    if (!canManage(req.user)) {
      return error(res, 403, '无权限创建合作方档案，仅法务专员或管理员可操作');
    }

    const { partner_name, social_credit_code, contact_person, contact_phone,
            credit_rating, risk_level, remark } = req.body;

    if (!partner_name || !partner_name.trim()) {
      return error(res, 400, '合作方名称不能为空');
    }

    // 检查重名
    const existing = db.prepare('SELECT id FROM t_partner_credit WHERE partner_name = ?').get(partner_name.trim());
    if (existing) {
      return error(res, 409, '该合作方档案已存在，ID: ' + existing.id);
    }

    const id = genId('PC');
    const nowStr = now();

    db.prepare(
      `INSERT INTO t_partner_credit
        (id, partner_name, social_credit_code, contact_person, contact_phone,
         credit_rating, total_contracts, total_amount, on_time_rate, risk_level,
         remark, creator, creator_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 100, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, partner_name.trim(), social_credit_code || '', contact_person || '',
      contact_phone || '', credit_rating || 'B', risk_level || '低',
      remark || '', req.user.name, req.user.id, nowStr, nowStr
    );

    // 自动关联合同数据
    syncContractData(id, partner_name.trim());

    return success(res, { id }, '合作方档案创建成功');
  } catch (e) {
    return error(res, 500, '创建失败: ' + e.message);
  }
});

// ============================================================
// PUT /:id - 修改
// ============================================================
router.put('/:id', (req, res) => {
  try {
    if (!canManage(req.user)) {
      return error(res, 403, '无权限修改合作方档案');
    }

    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM t_partner_credit WHERE id = ?').get(id);
    if (!existing) {
      return error(res, 404, '合作方档案不存在');
    }

    const { partner_name, social_credit_code, contact_person, contact_phone,
            credit_rating, risk_level, on_time_rate, remark } = req.body;

    const updates = [];
    const params = [];

    if (partner_name !== undefined) { updates.push('partner_name = ?'); params.push(partner_name.trim()); }
    if (social_credit_code !== undefined) { updates.push('social_credit_code = ?'); params.push(social_credit_code); }
    if (contact_person !== undefined) { updates.push('contact_person = ?'); params.push(contact_person); }
    if (contact_phone !== undefined) { updates.push('contact_phone = ?'); params.push(contact_phone); }
    if (credit_rating !== undefined) { updates.push('credit_rating = ?'); params.push(credit_rating); }
    if (risk_level !== undefined) { updates.push('risk_level = ?'); params.push(risk_level); }
    if (on_time_rate !== undefined) { updates.push('on_time_rate = ?'); params.push(on_time_rate); }
    if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }

    if (updates.length === 0) {
      return error(res, 400, '没有需要更新的字段');
    }

    updates.push('updated_at = ?');
    params.push(now());
    params.push(id);

    db.prepare(`UPDATE t_partner_credit SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // 如果名称变更，重新关联合同
    if (partner_name && partner_name.trim() !== existing.partner_name) {
      syncContractData(id, partner_name.trim());
    }

    return success(res, { id }, '合作方档案更新成功');
  } catch (e) {
    return error(res, 500, '更新失败: ' + e.message);
  }
});

// ============================================================
// POST /auto-sync - 自动从t_contract_main同步所有合作方数据
// ============================================================
router.post('/auto-sync', (req, res) => {
  try {
    if (!canManage(req.user)) {
      return error(res, 403, '无权限执行自动同步');
    }

    // 获取所有不重复的合作方名称
    const partners = db.prepare(
      `SELECT DISTINCT partner_company, social_credit_code, contact_person, contact_phone
       FROM t_contract_main
       WHERE partner_company != '' AND partner_company IS NOT NULL
       AND contract_status IN ('已生效', '已归档')`
    ).all();

    let created = 0;
    let updated = 0;

    partners.forEach(p => {
      const existing = db.prepare('SELECT id FROM t_partner_credit WHERE partner_name = ?').get(p.partner_company);
      if (existing) {
        syncContractData(existing.id, p.partner_company);
        // 更新基础信息
        if (p.contact_person || p.contact_phone || p.social_credit_code) {
          const updates = [];
          const params = [];
          if (p.social_credit_code && !existing) { updates.push('social_credit_code = ?'); params.push(p.social_credit_code); }
          if (p.contact_person) { updates.push('contact_person = ?'); params.push(p.contact_person); }
          if (p.contact_phone) { updates.push('contact_phone = ?'); params.push(p.contact_phone); }
          if (updates.length > 0) {
            updates.push('updated_at = ?');
            params.push(now(), existing.id);
            db.prepare(`UPDATE t_partner_credit SET ${updates.join(', ')} WHERE id = ?`).run(...params);
          }
        }
        updated++;
      } else {
        const id = genId('PC');
        const nowStr = now();
        db.prepare(
          `INSERT INTO t_partner_credit
            (id, partner_name, social_credit_code, contact_person, contact_phone,
             credit_rating, total_contracts, total_amount, on_time_rate, risk_level,
             remark, creator, creator_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'B', 0, 0, 100, '低', '', ?, ?, ?, ?)`
        ).run(id, p.partner_company, p.social_credit_code || '', p.contact_person || '',
              p.contact_phone || '', req.user.name, req.user.id, nowStr, nowStr);
        syncContractData(id, p.partner_company);
        created++;
      }
    });

    return success(res, { created, updated, total: partners.length },
      `同步完成: 新建${created}个, 更新${updated}个`);
  } catch (e) {
    return error(res, 500, '自动同步失败: ' + e.message);
  }
});

// ============================================================
// 工具函数: 同步合同数据
// ============================================================
function syncContractData(partnerId, partnerName) {
  try {
    const stats = db.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM t_contract_main
       WHERE partner_company = ? AND contract_status IN ('已生效', '已归档')`
    ).get(partnerName);

    // 计算风险等级
    let riskLevel = '低';
    if (stats.total > 5000000) riskLevel = '高';
    else if (stats.total > 1000000) riskLevel = '中';

    db.prepare(
      `UPDATE t_partner_credit SET total_contracts = ?, total_amount = ?, risk_level = ?, updated_at = ? WHERE id = ?`
    ).run(stats.count, Math.round(stats.total * 100) / 100, riskLevel, now(), partnerId);
  } catch (e) {
    console.error('[partner_credit] syncContractData error:', e);
  }
}

module.exports = router;
