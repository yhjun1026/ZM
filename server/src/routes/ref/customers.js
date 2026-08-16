/**
 * 客户管理路由
 * 审批流程: 行政部录入 → 行政部负责人审批 → 销售总监审批 → 总经理审批 → 执行
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireAction } = require('../../compat/auth');
const { success, error, genId, now, safeParse, generateApprovalFlow } = require('../../compat/helpers');

router.use(authMiddleware);

// 客户列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  return success(res, rows);
});

// 客户详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '客户不存在');
  row.approval_flow = safeParse(row.approval_flow, []);
  return success(res, row);
});

// 创建客户申请 (需 createCustomerApplication 权限)
router.post('/', requireAction('createCustomerApplication'), (req, res) => {
  const { name, contact, phone, email, address, level, industry, source, owner, owner_dept } = req.body;
  if (!name) return error(res, 400, '客户名称不能为空');

  const id = genId('CUS');
  const flow = generateApprovalFlow('customer', req.user.dept);
  const status = '待审批';

  db.prepare(`INSERT INTO customers (id,name,contact,phone,email,address,level,industry,source,status,owner,owner_dept,submitter,submitter_id,applicant_dept,approval_flow,remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, contact||'', phone||'', email||'', address||'', level||'C', industry||'', source||'',
      status, owner||req.user.name, owner_dept||req.user.dept,
      req.user.name, req.user.id, req.user.dept, JSON.stringify(flow), '');

  return success(res, { id }, '客户申请已提交，待审批');
});

// 审批通过 — 步骤级权限检查
router.post('/:id/approve', requireAction('approveCustomerApplication'), (req, res) => {
  const app = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!app) return error(res, 404, '客户不存在');

  let flow = safeParse(app.approval_flow, []);
  if (flow.length === 0) return error(res, 400, '审批流程异常');

  // 找到第一个未完成的步骤
  const idx = flow.findIndex(s => !s.done);
  if (idx === -1) return error(res, 400, '已全部审批完成');

  const stepName = flow[idx].step;
  const u = req.user;

  // 步骤级权限检查
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') {
      return error(res, 403, '仅行政部负责人可执行此审批');
    }
  } else if (stepName.includes('销售总监')) {
    if (u.role !== '销售总监' && u.role !== '超级管理员') {
      return error(res, 403, '仅销售总监可执行此审批');
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

  // 完成当前步骤
  const nowStr = now();
  flow[idx].done = true;
  flow[idx].user = u.name;
  flow[idx].time = nowStr;

  // 自动完成"执行"步骤
  const nextIdx = flow.findIndex(s => !s.done);
  let newStatus = app.status;
  if (nextIdx !== -1 && flow[nextIdx].step.includes('执行')) {
    flow[nextIdx].done = true;
    flow[nextIdx].user = '系统自动';
    flow[nextIdx].time = nowStr;
    newStatus = '潜在'; // 审批通过后客户状态恢复为"潜在"
  }

  // 如果所有步骤完成
  if (flow.every(s => s.done)) {
    newStatus = '已归档';
  }

  db.prepare('UPDATE customers SET approval_flow = ?, status = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), newStatus, req.params.id);

  return success(res, { status: newStatus, flow }, '审批通过');
});

// 驳回
router.post('/:id/reject', requireAction('approveCustomerApplication'), (req, res) => {
  const app = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!app) return error(res, 404, '客户不存在');

  let flow = safeParse(app.approval_flow, []);
  const idx = flow.findIndex(s => !s.done);
  if (idx === -1) return error(res, 400, '已全部审批完成');

  const stepName = flow[idx].step;
  const u = req.user;

  // 步骤级权限检查
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') {
      return error(res, 403, '仅行政部负责人可执行此审批');
    }
  } else if (stepName.includes('销售总监')) {
    if (u.role !== '销售总监' && u.role !== '超级管理员') {
      return error(res, 403, '仅销售总监可执行此审批');
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

  const remark = req.body.remark || '驳回';
  flow[idx].done = true;
  flow[idx].user = u.name;
  flow[idx].time = now();
  flow[idx].remark = '驳回：' + remark;

  db.prepare('UPDATE customers SET approval_flow = ?, status = ?, remark = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), '已驳回', remark, req.params.id);

  return success(res, null, '已驳回');
});

// 更新客户
router.put('/:id', (req, res) => {
  const { name, contact, phone, email, address, level, industry, source, status, owner } = req.body;
  db.prepare(`UPDATE customers SET name=COALESCE(?,name),contact=COALESCE(?,contact),phone=COALESCE(?,phone),
    email=COALESCE(?,email),address=COALESCE(?,address),level=COALESCE(?,level),industry=COALESCE(?,industry),
    source=COALESCE(?,source),status=COALESCE(?,status),owner=COALESCE(?,owner),updated_at=datetime('now','localtime')
    WHERE id=?`).run(name,contact,phone,email,address,level,industry,source,status,owner,req.params.id);
  return success(res, null, '客户更新成功');
});

// 删除客户
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  return success(res, null, '客户已删除');
});

module.exports = router;
