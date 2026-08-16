/**
 * 供应商管理路由
 * 五级审批流程：市场部录入→市场部负责人→行政部负责人→销售总监→总经理→执行
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireAction } = require('../../compat/auth');
const { success, error, genId, safeParse, generateApprovalFlow, now } = require('../../compat/helpers');

router.use(authMiddleware);

// 供应商列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM suppliers ORDER BY created_at DESC').all();
  rows.forEach(r => {
    r.qualifications = safeParse(r.qualifications, []);
    r.products = safeParse(r.products, []);
    r.timeline = safeParse(r.timeline, []);
    r.approval_flow = safeParse(r.approval_flow, []);
  });
  return success(res, rows);
});

// 单个供应商
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '供应商不存在');
  row.qualifications = safeParse(row.qualifications, []);
  row.products = safeParse(row.products, []);
  row.timeline = safeParse(row.timeline, []);
  row.approval_flow = safeParse(row.approval_flow, []);
  return success(res, row);
});

// 创建供应商申请（需 createSupplierApplication 权限）
router.post('/', requireAction('createSupplierApplication'), (req, res) => {
  const { name, short_name, category, level, contact, phone, email, address, bank, account, business_scope, remark } = req.body;
  if (!name) return error(res, 400, '供应商名称不能为空');
  const id = genId('SUP');
  const flow = generateApprovalFlow('supplier', req.user.dept);
  const cols = 'id,name,short_name,category,level,contact,phone,email,address,bank,account,business_scope,status,coop_date,remark,qualifications,products,timeline,submitter,submitter_id,applicant_dept,approval_flow';
  const placeholders = Array(22).fill('?').join(',');
  db.prepare(`INSERT INTO suppliers (${cols}) VALUES (${placeholders})`).run(
    id, name, short_name||'', category||'', level||'C', contact||'', phone||'', email||'',
    address||'', bank||'', account||'', business_scope||'', '待审批', '', remark||'',
    '[]', '[]', '[]',
    req.user.name, req.user.id, req.user.dept, JSON.stringify(flow)
  );
  return success(res, { id }, '供应商申请已提交，等待审批');
});

// 审批通过（步骤级审批）
router.post('/:id/approve', requireAction('approveSupplierApplication'), (req, res) => {
  const app = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!app) return error(res, 404, '供应商不存在');
  if (app.status === '合作中' || app.status === '已执行') return error(res, 400, '该申请已执行完毕');
  if (app.status === '已驳回') return error(res, 400, '该申请已被驳回');

  let flow = safeParse(app.approval_flow, []);
  if (!Array.isArray(flow) || flow.length === 0) return error(res, 400, '审批流程数据异常');

  const nextIdx = flow.findIndex(s => !s.done);
  if (nextIdx === -1) return error(res, 400, '所有步骤已完成');

  const stepName = flow[nextIdx].step;
  const u = req.user;

  // 步骤级权限检查
  if (stepName.includes('市场部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '市场部') && u.role !== '超级管理员') {
      return error(res, 403, '仅市场部负责人可执行此审批');
    }
  } else if (stepName.includes('行政部负责人')) {
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

  const nowStr = now();
  flow[nextIdx].done = true;
  flow[nextIdx].user = u.name;
  flow[nextIdx].time = nowStr;

  let newStatus = '待审批';

  // 检查是否自动完成"执行"步骤
  const execIdx = flow.findIndex(s => !s.done);
  if (execIdx !== -1 && flow[execIdx].step.includes('执行')) {
    flow[execIdx].done = true;
    flow[execIdx].user = '系统自动';
    flow[execIdx].time = nowStr;
    if (flow.every(s => s.done)) {
      newStatus = '合作中';
    }
  }

  // 如果还有未完成步骤，更新当前状态
  if (newStatus === '待审批') {
    const currentStep = flow.find(s => !s.done);
    if (currentStep) {
      newStatus = '审批中';
    } else if (flow.every(s => s.done)) {
      newStatus = '合作中';
    }
  }

  const coopDate = newStatus === '合作中' ? new Date().toISOString().slice(0, 10) : app.coop_date;
  db.prepare('UPDATE suppliers SET approval_flow = ?, status = ?, coop_date = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), newStatus, coopDate, req.params.id);

  return success(res, { status: newStatus }, newStatus === '合作中' ? '审批通过，供应商已正式合作' : '审批通过');
});

// 驳回
router.post('/:id/reject', requireAction('approveSupplierApplication'), (req, res) => {
  const app = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!app) return error(res, 404, '供应商不存在');
  if (app.status === '合作中' || app.status === '已驳回') return error(res, 400, '该申请不可驳回');

  const { remark } = req.body;
  let flow = safeParse(app.approval_flow, []);
  const nextIdx = flow.findIndex(s => !s.done);
  if (nextIdx !== -1) {
    flow[nextIdx].user = req.user.name;
    flow[nextIdx].time = now();
  }

  db.prepare('UPDATE suppliers SET approval_flow = ?, status = ?, remark = COALESCE(?,remark), updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), '已驳回', remark || '', req.params.id);

  return success(res, null, '供应商申请已驳回');
});

// 更新供应商
router.put('/:id', (req, res) => {
  const { name, short_name, category, level, contact, phone, email, address, bank, account, business_scope, status, rating, remark } = req.body;
  db.prepare(`UPDATE suppliers SET name=COALESCE(?,name),short_name=COALESCE(?,short_name),category=COALESCE(?,category),
    level=COALESCE(?,level),contact=COALESCE(?,contact),phone=COALESCE(?,phone),email=COALESCE(?,email),
    address=COALESCE(?,address),bank=COALESCE(?,bank),account=COALESCE(?,account),business_scope=COALESCE(?,business_scope),
    status=COALESCE(?,status),rating=COALESCE(?,rating),remark=COALESCE(?,remark),updated_at=datetime('now','localtime')
    WHERE id=?`).run(name, short_name, category, level, contact, phone, email, address, bank, account, business_scope, status, rating, remark, req.params.id);
  return success(res, null, '供应商更新成功');
});

// 删除供应商
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  return success(res, null, '供应商已删除');
});

module.exports = router;
