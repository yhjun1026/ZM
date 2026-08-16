/**
 * 费用报销路由
 * 审批流程: 提交 → 区域负责人审批 → 部门审批 → 财务审核 → 副总审批 → 总经理审批
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove } = require('../../compat/auth');
const { success, error, safeParse, generateApprovalFlow, now } = require('../../compat/helpers');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM expenses ORDER BY created_at DESC').all();
  rows.forEach(r => { r.flow = safeParse(r.flow, []); });
  return success(res, rows);
});

// 费用详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '报销不存在');
  row.flow = safeParse(row.flow, []);
  return success(res, row);
});

router.post('/', (req, res) => {
  const { category, amount, date, desc, receipts } = req.body;
  if (!category || !amount) return error(res, 400, '请填写完整信息');
  const flow = generateApprovalFlow('expense', req.user.dept);
  flow[0].user = req.user.name;
  const info = db.prepare(`INSERT INTO expenses (applicant,applicant_id,dept,category,amount,date,desc,status,receipts,flow)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.user.name, req.user.id, req.user.dept, category, amount, date||new Date().toISOString().slice(0,10), desc||'', '待审批', receipts||0, JSON.stringify(flow));
  return success(res, { id: info.lastInsertRowid }, '报销申请已提交');
});

router.post('/:id/approve', requireApprove(), (req, res) => {
  const u = req.user;
  const item = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '报销不存在');
  if (item.status === '已通过' || item.status === '已驳回') return error(res, 400, '该报销已处理');

  const flow = safeParse(item.flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;
  // 步骤级权限检查
  if (stepName.includes('部门') || stepName.includes('区域负责人')) {
    if (u.role !== '部门经理' && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅部门负责人可执行此审批');
    }
  } else if (stepName.includes('财务')) {
    if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅财务负责人可执行此审核');
    }
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅公司副总可执行此审批');
    }
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') {
      return error(res, 403, '仅总经理可执行终审');
    }
  }

  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();

  const allDone = flow.every(f => f.done);
  db.prepare(`UPDATE expenses SET flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), allDone ? '已通过' : item.status, req.params.id);
  return success(res, null, allDone ? '报销申请已通过' : '审批节点已通过');
});

router.post('/:id/reject', requireApprove(), (req, res) => {
  const { remark } = req.body;
  db.prepare(`UPDATE expenses SET status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run('已驳回', req.params.id);
  return success(res, null, '已驳回');
});

module.exports = router;
