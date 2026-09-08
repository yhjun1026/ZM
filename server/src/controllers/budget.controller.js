/**
 * 预算管理 controller（参考 budget.js，6 端点）
 * 数据表（009 迁移已建）：budgets / budget_executions
 * 010 已建：budget_categories（补一个分类表）
 */
const db = require('../db');
const { ok, okWith, bad, notfound, empId } = require('../utils/resp');

function list(req, res) {
  const { year, category, status, quarter, month } = req.query;
  let sql = 'SELECT * FROM budgets WHERE 1=1';
  const p = [];
  if (year) { sql += ' AND year=?'; p.push(Number(year)); }
  if (category) { sql += ' AND category=?'; p.push(category); }
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (quarter) { sql += ' AND quarter=?'; p.push(Number(quarter)); }
  if (month) { sql += ' AND month=?'; p.push(Number(month)); }
  sql += ' ORDER BY year DESC, quarter, month, id';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function listCategories(req, res) {
  const rows = db.prepare('SELECT * FROM budget_categories ORDER BY code').all();
  return res.json(ok({ list: rows }));
}
function create(req, res) {
  const { year, quarter, month, category, amount, note } = req.body;
  if (!year || !category || !amount) return res.json(bad('年度/分类/金额必填'));
  const r = db.prepare(`INSERT INTO budgets (year, quarter, month, category, amount, note, status, created_by, created_by_name)
    VALUES (?,?,?,?,?,?, '草稿',?,?)`)
    .run(Number(year), Number(quarter) || 0, Number(month) || 0, category, Number(amount), note || '',
      empId(req), req.user?.name || '');
  return res.json(ok({ id: r.lastInsertRowid }, '已创建'));
}
function listExecutions(req, res) {
  const { budget_id, year, category, from, to } = req.query;
  let sql = `SELECT e.*, b.note as budget_note FROM budget_executions e
    LEFT JOIN budgets b ON b.id=e.budget_id WHERE 1=1`;
  const p = [];
  if (budget_id) { sql += ' AND e.budget_id=?'; p.push(Number(budget_id)); }
  if (year) { sql += ' AND e.year=?'; p.push(Number(year)); }
  if (category) { sql += ' AND e.category=?'; p.push(category); }
  if (from) { sql += ' AND e.created_at >= ?'; p.push(from); }
  if (to) { sql += ' AND e.created_at <= ?'; p.push(to); }
  sql += ' ORDER BY e.id DESC LIMIT 200';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}
function createExecution(req, res) {
  // 实际执行：写 budget_executions + 更新 budgets.actual
  const { budget_id, amount, source_type, source_no, note } = req.body;
  if (!budget_id || !amount) return res.json(bad('预算/金额必填'));
  const b = db.prepare('SELECT * FROM budgets WHERE id=?').get(budget_id);
  if (!b) return res.json(notfound('预算不存在'));
  if (b.status !== '生效') return res.json(bad('预算未生效'));
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO budget_executions (budget_id, year, quarter, month, category, amount, source_type, source_no, note)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(b.id, b.year, b.quarter, b.month, b.category, Number(amount), source_type || '', source_no || '', note || '');
    db.prepare('UPDATE budgets SET actual=actual+? WHERE id=?').run(Number(amount), b.id);
  });
  tx();
  return res.json(ok({}, '已执行'));
}
function stats(req, res) {
  const byYear = db.prepare('SELECT year, SUM(amount) budget, SUM(actual) actual FROM budgets GROUP BY year ORDER BY year DESC').all();
  const byCategory = db.prepare('SELECT category, SUM(amount) budget, SUM(actual) actual FROM budgets GROUP BY category').all();
  const over = db.prepare('SELECT COUNT(*) c FROM budgets WHERE actual > amount AND amount > 0').get().c;
  const total = db.prepare('SELECT COALESCE(SUM(amount),0) v, COALESCE(SUM(actual),0) a FROM budgets').get();
  return res.json(ok({
    by_year: byYear,
    by_category: byCategory,
    over_budget: over,
    total_budget: total.v,
    total_actual: total.a,
    execution_rate: total.v > 0 ? +(total.a / total.v * 100).toFixed(1) : 0,
  }));
}

module.exports = { list, listCategories, create, listExecutions, createExecution, stats };
