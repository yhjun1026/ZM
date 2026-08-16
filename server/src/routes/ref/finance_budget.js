/**
 * 预算管控路由 (PRD 4.5)
 * 功能: 部门/项目预算、实时预算校验、占用/释放/回滚、超支拦截/特批、执行统计看板
 * 审批流程: 编制 → 财务负责人审核 → 副总审批 → 总经理审批 → 执行
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove } = require('../../compat/auth');
const { success, error, safeParse, generateApprovalFlow, now, genId } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 辅助函数: 获取财务配置 =====
function getFinanceConfig(key) {
  const row = db.prepare('SELECT config_value FROM t_finance_config WHERE config_key = ? AND status = ?').get(key, '启用');
  return row ? row.config_value : '';
}

// ===== 辅助函数: 步骤级权限检查 =====
function checkStepPermission(stepName, user) {
  const u = user;
  if (stepName.includes('财务负责人')) {
    return (u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) || u.role === '超级管理员' || u.role === '总经理';
  }
  if (stepName.includes('副总')) {
    return u.role === '副总' || u.role === '超级管理员' || u.role === '总经理';
  }
  if (stepName.includes('总经理')) {
    return u.role === '总经理' || u.role === '超级管理员';
  }
  return true;
}

// ===== 辅助函数: 实时预算校验 =====
function checkBudget(budgetId, amount) {
  const budget = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(budgetId);
  if (!budget) return { ok: false, msg: '预算不存在' };
  if (budget.status !== '已审批' && budget.status !== '已执行') return { ok: false, msg: `预算状态为${budget.status}，不可使用` };

  const available = budget.total_amount - budget.used_amount - budget.occupied_amount;
  const warnThreshold = parseFloat(getFinanceConfig('budget_warn_threshold') || '80');
  const blockThreshold = parseFloat(getFinanceConfig('budget_block_threshold') || '100');
  const usageRate = ((budget.used_amount + budget.occupied_amount + amount) / budget.total_amount * 100);

  if (usageRate > blockThreshold) {
    return { ok: false, msg: `预算超支拦截: 执行率${usageRate.toFixed(1)}%超过${blockThreshold}%阈值`, budget, usage_rate: usageRate };
  }
  if (usageRate > warnThreshold) {
    return { ok: true, warn: true, msg: `预算预警: 执行率${usageRate.toFixed(1)}%超过${warnThreshold}%预警线`, budget, usage_rate: usageRate };
  }
  return { ok: true, msg: '预算充足', budget, usage_rate: usageRate, available: available - amount };
}

// ========== API 端点 ==========

// 预算列表
router.get('/', (req, res) => {
  const { year, dept, category, status, keyword, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_budget WHERE 1=1';
  const params = [];

  if (year) { sql += ' AND year = ?'; params.push(parseInt(year)); }
  if (dept && dept !== 'all') { sql += ' AND dept = ?'; params.push(dept); }
  if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (keyword) { sql += ' AND (budget_no LIKE ? OR dept LIKE ? OR project_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  // 数据权限: 普通员工仅看本部门
  if (req.user.role === '普通员工') {
    sql += ' AND dept = ?';
    params.push(req.user.dept);
  }

  sql += ' ORDER BY year DESC, dept ASC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => {
    r.approval_flow = safeParse(r.approval_flow, []);
    r.usage_rate = r.total_amount > 0 ? ((r.used_amount / r.total_amount) * 100).toFixed(1) : '0';
  });

  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 预算详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '预算不存在');
  row.approval_flow = safeParse(row.approval_flow, []);
  row.usage_rate = row.total_amount > 0 ? ((row.used_amount / row.total_amount) * 100).toFixed(1) : '0';
  // 获取占用明细
  row.occupies = db.prepare('SELECT * FROM t_finance_budget_occupy WHERE budget_id = ? ORDER BY created_at DESC').all(req.params.id);
  return success(res, row);
});

// 实时预算校验
router.post('/check', (req, res) => {
  const { budget_id, amount } = req.body;
  if (!budget_id || !amount) return error(res, 400, '缺少参数');
  const result = checkBudget(budget_id, amount);
  return success(res, result, result.msg);
});

// 创建预算
router.post('/', (req, res) => {
  const {
    year = new Date().getFullYear(), dept, project_id = '', project_name = '',
    category = '其他', total_amount = 0, remark = '', status: reqStatus = '草稿'
  } = req.body;

  if (!dept) return error(res, 400, '部门必填');
  if (!total_amount || total_amount <= 0) return error(res, 400, '预算金额必须大于0');

  const formNo = genId(getFinanceConfig('form_prefix_budget') || 'YS');
  const finalStatus = reqStatus === '待审批' ? '待审批' : '草稿';

  let flow = [];
  if (finalStatus === '待审批') {
    flow = generateApprovalFlow('budget', dept);
    flow[0].user = req.user.name;
    flow[0].done = true;
  }

  const id = genId('BUD');
  db.prepare(
    `INSERT INTO t_finance_budget
     (id, budget_no, year, dept, project_id, project_name, category, total_amount,
      used_amount, occupied_amount, available_amount, status, approval_flow, creator, creator_id, remark)
     VALUES (?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?)`
  ).run(
    id, formNo, parseInt(year), dept, project_id, project_name, category, total_amount,
    total_amount, finalStatus, JSON.stringify(flow), req.user.name, req.user.id, remark
  );

  return success(res, { id, budget_no: formNo }, finalStatus === '待审批' ? '预算已提交审批' : '草稿已保存');
});

// 更新预算
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '预算不存在');
  if (!['草稿', '待审批'].includes(existing.status)) return error(res, 400, '当前状态不可修改');

  const { year, dept, project_id, project_name, category, total_amount, remark, status: newStatus } = req.body;

  let flow = safeParse(existing.approval_flow, []);
  let finalStatus = existing.status;
  if (newStatus === '待审批') {
    finalStatus = '待审批';
    flow = generateApprovalFlow('budget', dept || existing.dept);
    flow[0].user = req.user.name;
    flow[0].done = true;
  }

  const newTotal = total_amount || existing.total_amount;
  const newAvailable = newTotal - existing.used_amount - existing.occupied_amount;

  db.prepare(
    `UPDATE t_finance_budget SET year=?, dept=?, project_id=?, project_name=?, category=?, total_amount=?, available_amount=?, remark=?, approval_flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    parseInt(year || existing.year), dept || existing.dept, project_id || existing.project_id,
    project_name || existing.project_name, category || existing.category, newTotal,
    newAvailable, remark !== undefined ? remark : existing.remark,
    JSON.stringify(flow), finalStatus, req.params.id
  );

  return success(res, { id: req.params.id }, '预算已更新');
});

// 提交审批
router.post('/:id/submit', (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '预算不存在');
  if (existing.status !== '草稿') return error(res, 400, '仅草稿可提交');

  const flow = generateApprovalFlow('budget', existing.dept);
  flow[0].user = req.user.name;
  flow[0].done = true;

  db.prepare('UPDATE t_finance_budget SET status=?, approval_flow=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('待审批', JSON.stringify(flow), req.params.id);
  return success(res, null, '预算已提交审批');
});

// 审批
router.post('/:id/approve', requireApprove(), (req, res) => {
  const u = req.user;
  const item = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '预算不存在');
  if (['已审批', '已执行', '已驳回', '已冻结'].includes(item.status)) return error(res, 400, '该预算已处理');

  const flow = safeParse(item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;
  if (!checkStepPermission(stepName, u)) return error(res, 403, `当前步骤"${stepName}"无权限审批`);

  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();
  if (req.body.remark) flow[currentIdx].remark = req.body.remark;

  const allDone = flow.every(f => f.done);
  const newStatus = allDone ? '已审批' : '审批中';

  db.prepare('UPDATE t_finance_budget SET approval_flow=?, status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(JSON.stringify(flow), newStatus, req.params.id);

  return success(res, null, allDone ? '预算审批通过' : '审批节点已通过');
});

// 驳回
router.post('/:id/reject', requireApprove(), (req, res) => {
  const { remark } = req.body;
  if (!remark) return error(res, 400, '驳回必须填写意见');
  const item = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '预算不存在');
  if (['已审批', '已执行', '已驳回'].includes(item.status)) return error(res, 400, '该预算已处理');

  const flow = safeParse(item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx !== -1 && !checkStepPermission(flow[currentIdx].step, req.user)) return error(res, 403, '无权限驳回');

  db.prepare('UPDATE t_finance_budget SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('已驳回', req.params.id);
  return success(res, null, '已驳回');
});

// 冻结/解冻预算
router.post('/:id/freeze', (req, res) => {
  const u = req.user;
  if (u.role !== '总经理' && u.role !== '超级管理员') return error(res, 403, '仅总经理可冻结/解冻预算');

  const item = db.prepare('SELECT status FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '预算不存在');

  const newStatus = item.status === '已冻结' ? '已执行' : '已冻结';
  db.prepare('UPDATE t_finance_budget SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(newStatus, req.params.id);
  return success(res, null, newStatus === '已冻结' ? '预算已冻结' : '预算已解冻');
});

// 超支特批(总经理)
router.post('/:id/special-approve', (req, res) => {
  const u = req.user;
  if (u.role !== '总经理' && u.role !== '超级管理员') return error(res, 403, '仅总经理可超支特批');

  const { extra_amount, remark } = req.body;
  if (!extra_amount || extra_amount <= 0) return error(res, 400, '追加金额必须大于0');

  const item = db.prepare('SELECT * FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '预算不存在');

  const newTotal = item.total_amount + extra_amount;
  const newAvailable = newTotal - item.used_amount - item.occupied_amount;

  db.prepare(
    `UPDATE t_finance_budget SET total_amount=?, available_amount=?, remark=remark||? , updated_at=datetime('now','localtime') WHERE id=?`
  ).run(newTotal, newAvailable, `\n[超支特批] 追加${extra_amount}元，特批人: ${u.name}，原因: ${remark || '无'}`, req.params.id);

  return success(res, { total_amount: newTotal, available_amount: newAvailable }, '超支特批已执行');
});

// 预算占用明细列表
router.get('/occupies/list', (req, res) => {
  const { budget_id, status, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_budget_occupy WHERE 1=1';
  const params = [];
  if (budget_id) { sql += ' AND budget_id = ?'; params.push(budget_id); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;
  const rows = db.prepare(sql).all(...params);
  return success(res, { list: rows, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 释放占用(回滚)
router.post('/occupies/:id/release', (req, res) => {
  const u = req.user;
  if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员') return error(res, 403, '仅财务可释放预算占用');

  const occ = db.prepare('SELECT * FROM t_finance_budget_occupy WHERE id = ?').get(req.params.id);
  if (!occ) return error(res, 404, '占用记录不存在');
  if (occ.status !== '占用中') return error(res, 400, '仅占用中状态可释放');

  db.prepare("UPDATE t_finance_budget_occupy SET status='已回滚', updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  db.prepare(
    `UPDATE t_finance_budget SET occupied_amount=occupied_amount-?, available_amount=total_amount-used_amount-occupied_amount, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(occ.amount, occ.budget_id);
  return success(res, null, '预算占用已释放回滚');
});

// 执行统计看板
router.get('/stats/dashboard', (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  // 年度预算总览
  const overview = db.prepare(
    `SELECT
      COUNT(*) as total_budgets,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM(used_amount), 0) as used_amount,
      COALESCE(SUM(occupied_amount), 0) as occupied_amount,
      COALESCE(SUM(available_amount), 0) as available_amount
     FROM t_finance_budget WHERE year = ?`
  ).get(parseInt(year));

  overview.usage_rate = overview.total_amount > 0 ? ((overview.used_amount / overview.total_amount) * 100).toFixed(1) : '0';
  overview.occupy_rate = overview.total_amount > 0 ? ((overview.occupied_amount / overview.total_amount) * 100).toFixed(1) : '0';

  // 按部门统计
  const byDept = db.prepare(
    `SELECT dept,
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total,
      COALESCE(SUM(used_amount), 0) as used,
      COALESCE(SUM(occupied_amount), 0) as occupied,
      COALESCE(SUM(available_amount), 0) as available
     FROM t_finance_budget WHERE year = ? GROUP BY dept ORDER BY total DESC`
  ).all(parseInt(year));

  byDept.forEach(d => {
    d.usage_rate = d.total > 0 ? ((d.used / d.total) * 100).toFixed(1) : '0';
  });

  // 按类别统计
  const byCategory = db.prepare(
    `SELECT category,
      COUNT(*) as count,
      COALESCE(SUM(total_amount), 0) as total,
      COALESCE(SUM(used_amount), 0) as used
     FROM t_finance_budget WHERE year = ? GROUP BY category ORDER BY total DESC`
  ).all(parseInt(year));

  // 状态分布
  const byStatus = db.prepare(
    `SELECT status, COUNT(*) as count FROM t_finance_budget WHERE year = ? GROUP BY status`
  ).all(parseInt(year));

  // 预警预算(执行率超过预警阈值)
  const warnThreshold = parseFloat(getFinanceConfig('budget_warn_threshold') || '80');
  const warningBudgets = db.prepare(
    `SELECT id, budget_no, dept, category, total_amount, used_amount, occupied_amount,
      CAST(CASE WHEN total_amount > 0 THEN (used_amount * 100.0 / total_amount) ELSE 0 END AS REAL) as usage_rate
     FROM t_finance_budget
     WHERE year = ? AND total_amount > 0
       AND (used_amount * 100.0 / total_amount) > ?
     ORDER BY usage_rate DESC`
  ).all(parseInt(year), warnThreshold);

  return success(res, {
    overview, by_dept: byDept, by_category: byCategory, by_status: byStatus,
    warning_budgets: warningBudgets, year: parseInt(year)
  }, '预算统计看板');
});

// 删除预算(仅草稿)
router.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT status FROM t_finance_budget WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '预算不存在');
  if (item.status !== '草稿') return error(res, 400, '仅草稿可删除');
  db.prepare('DELETE FROM t_finance_budget WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM t_finance_budget_occupy WHERE budget_id = ?').run(req.params.id);
  return success(res, null, '草稿已删除');
});

module.exports = router;
