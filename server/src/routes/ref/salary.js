/**
 * 薪酬管理路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireAction, requireApprove } = require('../../compat/auth');
const { success, error, genId } = require('../../compat/helpers');

router.use(authMiddleware);

// 薪酬模板列表
router.get('/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM salary_templates ORDER BY base_salary DESC').all();
  return success(res, rows);
});

// 薪酬记录列表
router.get('/records', (req, res) => {
  const rows = db.prepare('SELECT * FROM salary_records ORDER BY month DESC, dept').all();
  return success(res, rows);
});

// 新增薪酬记录 (需 financeSalary 权限)
router.post('/records', requireAction('financeSalary'), (req, res) => {
  const { emp_id, emp_name, dept, level, month, base_salary, performance_score, performance_grade, performance_bonus, allowance, overtime, social_ins, housing_fund, tax } = req.body;
  const id = genId('SAL');
  const gross = (base_salary||0) + (performance_bonus||0) + (allowance||0) + (overtime||0);
  const net = gross - (social_ins||0) - (housing_fund||0) - (tax||0);
  db.prepare(`INSERT INTO salary_records (id,emp_id,emp_name,dept,level,month,base_salary,performance_score,performance_grade,performance_bonus,allowance,overtime,social_ins,housing_fund,tax,gross_pay,net_pay,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, emp_id, emp_name||'', dept||'', level||'', month||'', base_salary||0, performance_score||0, performance_grade||'B', performance_bonus||0, allowance||0, overtime||0, social_ins||0, housing_fund||0, tax||0, gross, net, '待审核');
  return success(res, { id }, '薪酬记录创建成功');
});

// 审核薪酬 (需 financeReview 权限)
router.post('/records/:id/review', requireAction('financeReview'), (req, res) => {
  const { status } = req.body;
  db.prepare("UPDATE salary_records SET status=?, approver=?, sign_time=datetime('now','localtime') WHERE id=?")
    .run(status || '已审核', req.user.name, req.params.id);
  return success(res, null, '薪酬审核完成');
});

module.exports = router;
