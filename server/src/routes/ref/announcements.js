/**
 * 公司公告路由
 * 公告由行政部普通员工录入 → 行政部负责人审批 → 总经理审批 → 发布
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId, now, safeParse, generateApprovalFlow } = require('../../compat/helpers');

router.use(authMiddleware);

// 公告列表
router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  list.forEach(a => { a.flow = safeParse(a.flow, []); });
  return success(res, list);
});

// 创建公告 — 行政部普通员工/负责人/超管/总经理
router.post('/', (req, res) => {
  const u = req.user;
  // 权限检查
  if (u.role !== '超级管理员' && u.role !== '总经理') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部')) {
      return error(res, 403, '仅行政部人员可录入公告');
    }
  }

  const { title, category, content } = req.body;
  if (!title) return error(res, 400, '公告标题不能为空');
  if (!category) return error(res, 400, '请选择公告类别');

  const validCategories = ['产品会议','公司团建','会议通知','放假通知','人事任命','外出参访通知','公司培训通知'];
  if (validCategories.indexOf(category) === -1) {
    return error(res, 400, '无效的公告类别');
  }

  const id = genId('GG');
  const flow = generateApprovalFlow('announcement', u.dept);
  flow[0].user = u.name;

  db.prepare(`INSERT INTO announcements (id,title,category,content,author,author_dept,status,flow)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, title, category, content||'', u.name, u.dept, '待审批', JSON.stringify(flow));

  return success(res, { id }, '公告已提交，等待审批');
});

// 审批公告 — 步骤级权限检查
router.post('/:id/approve', (req, res) => {
  const u = req.user;
  const { id } = req.params;
  const { remark } = req.body;

  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  if (!ann) return error(res, 404, '公告不存在');
  if (ann.status === '已发布') return error(res, 400, '该公告已发布');
  if (ann.status === '已驳回') return error(res, 400, '该公告已驳回');

  let flow = safeParse(ann.flow, []);
  const currentIdx = flow.findIndex(s => !s.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;

  // 步骤级权限检查
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') {
      return error(res, 403, '仅行政部负责人可执行此审批');
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

  // 执行审批
  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();
  if (remark) flow[currentIdx].remark = remark;

  // 检查是否所有步骤完成
  const allDone = flow.every(s => s.done);
  let newStatus = ann.status;
  if (allDone) {
    newStatus = '已发布';
  }

  // 自动完成"发布"步骤
  const nextIdx = flow.findIndex(s => !s.done);
  if (nextIdx !== -1 && (flow[nextIdx].step.includes('发布') || flow[nextIdx].step.includes('归档'))) {
    flow[nextIdx].done = true;
    flow[nextIdx].user = '系统自动';
    flow[nextIdx].time = now();
    if (flow.every(s => s.done)) newStatus = '已发布';
  }

  db.prepare('UPDATE announcements SET flow = ?, status = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), newStatus, id);

  return success(res, { status: newStatus }, allDone ? '公告已发布' : '审批通过');
});

// 驳回公告
router.post('/:id/reject', (req, res) => {
  const u = req.user;
  const { id } = req.params;
  const { remark } = req.body;

  const ann = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  if (!ann) return error(res, 404, '公告不存在');
  if (ann.status !== '待审批') return error(res, 400, '当前状态不可驳回');

  let flow = safeParse(ann.flow, []);
  const currentIdx = flow.findIndex(s => !s.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;
  // 步骤级权限检查
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') {
      return error(res, 403, '仅行政部负责人可执行此操作');
    }
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅公司副总可执行此操作');
    }
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') {
      return error(res, 403, '仅总经理可执行此操作');
    }
  }

  flow[currentIdx].done = false;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();
  if (remark) flow[currentIdx].remark = '驳回: ' + remark;

  db.prepare('UPDATE announcements SET flow = ?, status = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), '已驳回', id);

  return success(res, null, '公告已驳回');
});

module.exports = router;
