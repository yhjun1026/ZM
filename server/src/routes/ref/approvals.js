/**
 * 统一审批路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove } = require('../../compat/auth');
const { canAccess } = require('../../compat/rbac');
const { success, error, safeParse, now } = require('../../compat/helpers');

router.use(authMiddleware);

// 获取待审批列表
router.get('/pending', (req, res) => {
  const result = { contracts: [], purchases: [], leaves: [], expenses: [], documents: [], businessTrips: [], projects: [], financeRecords: [] };

  const contracts = db.prepare("SELECT id,name,status,creator FROM contracts WHERE status='待审批' ORDER BY created_at DESC").all();
  result.contracts = contracts;

  const purchases = db.prepare("SELECT id,title,status,applicant,applicant_dept FROM purchases WHERE status='待审批' ORDER BY created_at DESC").all();
  result.purchases = purchases;

  const leaves = db.prepare("SELECT id,applicant,type,status FROM leaves WHERE status='待审批' ORDER BY created_at DESC").all();
  result.leaves = leaves;

  const expenses = db.prepare("SELECT id,applicant,category,amount,status FROM expenses WHERE status='待审批' ORDER BY created_at DESC").all();
  result.expenses = expenses;

  const documents = db.prepare("SELECT id,title,status,author FROM documents WHERE status='审批中' ORDER BY created_at DESC").all();
  result.documents = documents;

  const businessTrips = db.prepare("SELECT id,applicant,destination,status FROM business_trips WHERE status='待审批' ORDER BY created_at DESC").all();
  result.businessTrips = businessTrips;

  const projects = db.prepare("SELECT id,name,manager,status FROM projects WHERE status='待审批' ORDER BY created_at DESC").all();
  result.projects = projects;

  const financeRecords = db.prepare("SELECT id,type,desc,amount,status FROM finance_records WHERE status='待审批' ORDER BY created_at DESC").all();
  result.financeRecords = financeRecords;

  return success(res, result);
});

// 统一审批通过
router.post('/:type/:id/approve', (req, res) => {
  const { type, id } = req.params;
  const { remark } = req.body;

  // 检查审批权限
  if (type === 'purchase') {
    if (!canAccess(req.user.role, req.user.dept, 'approvePurchase')) {
      return error(res, 403, '您无审批权限');
    }
  } else if (type === 'project' || type === 'finance') {
    if (!canAccess(req.user.role, req.user.dept, type === 'project' ? 'approveProject' : 'createFinanceRecord')) {
      return error(res, 403, '您无审批权限');
    }
  } else {
    if (req.user.role === '普通员工') {
      return error(res, 403, '您无审批权限');
    }
  }

  const tables = {
    contract: 'contracts', purchase: 'purchases', leave: 'leaves',
    expense: 'expenses', document: 'documents', businesstrip: 'business_trips',
    project: 'projects', finance: 'finance_records'
  };
  const table = tables[type];
  if (!table) return error(res, 400, '不支持的审批类型');

  const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!item) return error(res, 404, '记录不存在');

  // 不同表使用不同的flow列名
  const flowCol = type === 'document' ? 'doc_flow' : (type === 'project' || type === 'finance') ? 'approval_flow' : 'flow';
  const flow = safeParse(item[flowCol], []);
  const pending = flow.find(f => !f.done);
  if (!pending) return error(res, 400, '已全部审批完成');

  // 采购步骤级权限检查
  if (type === 'purchase') {
    const stepName = pending.step;
    if (stepName.includes('市场部负责人') && !(req.user.role === '部门经理' && req.user.dept === '市场部') && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return error(res, 403, '仅市场部负责人可审批');
    }
    if (stepName.includes('销售总监') && req.user.role !== '销售总监' && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return error(res, 403, '仅销售总监可审批');
    }
    if (stepName.includes('财务负责人') && !canAccess(req.user.role, req.user.dept, 'financeReview') && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return error(res, 403, '仅财务负责人可审批');
    }
    if (stepName.includes('总经理') && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return error(res, 403, '仅总经理可终审');
    }
  }

  // 财务步骤级权限检查
  if (type === 'finance') {
    const stepName = pending.step;
    if (stepName.includes('财务负责人') && !canAccess(req.user.role, req.user.dept, 'financeReview') && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return error(res, 403, '仅财务负责人可审批');
    }
    if (stepName.includes('总经理') && req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return error(res, 403, '仅总经理可终审');
    }
  }

  pending.done = true;
  pending.user = req.user.name;
  pending.time = now();
  if (remark) pending.remark = remark;

  // 自动完成后续非审批步骤
  const idx = flow.indexOf(pending);
  for (let i = idx + 1; i < flow.length; i++) {
    if (!flow[i].done && (flow[i].step.includes('入库') || flow[i].step.includes('采购流程') || flow[i].step.includes('立项') || flow[i].step.includes('确认') || flow[i].step.includes('完成') || flow[i].step.includes('归档'))) {
      flow[i].done = true;
      flow[i].user = '系统';
      flow[i].time = now();
    } else {
      break;
    }
  }

  const allDone = flow.every(f => f.done);

  let newStatus = item.status;
  if (type === 'document') {
    newStatus = allDone ? '已下发' : '审批中';
  } else if (type === 'purchase') {
    newStatus = allDone ? (item.applicant_dept === '市场部' ? '采购中' : '已入库') : '待审批';
  } else if (type === 'contract') {
    newStatus = allDone ? '执行中' : '待审批';
  } else if (type === 'businesstrip') {
    newStatus = allDone ? '已批准' : '待审批';
  } else if (type === 'project') {
    newStatus = allDone ? '已立项' : '待审批';
  } else if (type === 'finance') {
    newStatus = allDone ? '已确认' : '待审批';
  } else {
    newStatus = allDone ? '已通过' : '待审批';
  }

  db.prepare(`UPDATE ${table} SET ${flowCol}=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), newStatus, id);
  return success(res, null, allDone ? '审批全部通过' : '审批节点已通过');
});

// 统一驳回
router.post('/:type/:id/reject', (req, res) => {
  const { type, id } = req.params;
  const { remark } = req.body;

  // 检查审批权限
  if (type === 'purchase') {
    if (!canAccess(req.user.role, req.user.dept, 'approvePurchase')) {
      return error(res, 403, '您无审批权限');
    }
  } else {
    if (req.user.role === '普通员工') {
      return error(res, 403, '您无审批权限');
    }
  }

  const tables = {
    contract: 'contracts', purchase: 'purchases', leave: 'leaves',
    expense: 'expenses', document: 'documents', businesstrip: 'business_trips',
    project: 'projects', finance: 'finance_records'
  };
  const table = tables[type];
  if (!table) return error(res, 400, '不支持的审批类型');

  const flowCol = type === 'document' ? 'doc_flow' : (type === 'project' || type === 'finance') ? 'approval_flow' : 'flow';
  const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!item) return error(res, 404, '记录不存在');
  const flow = safeParse(item[flowCol], []);
  const current = flow.find(f => !f.done);
  if (current) {
    current.rejected = true;
    current.user = req.user.name;
    current.time = now();
    current.remark = remark || '驳回';
  }

  db.prepare(`UPDATE ${table} SET status='已驳回', ${flowCol}=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), id);
  return success(res, null, '已驳回');
});

module.exports = router;
