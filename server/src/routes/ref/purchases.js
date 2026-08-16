/**
 * 采购管理路由
 * 市场部普通员工录入 → 市场部负责人审批 → 销售总监审批 → 财务负责人审批 → 总经理终审 → 采购流程
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { canAccess } = require('../../compat/rbac');
const { success, error, genId, safeParse, generateApprovalFlow, now } = require('../../compat/helpers');

router.use(authMiddleware);

// 采购列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM purchases ORDER BY created_at DESC').all();
  rows.forEach(r => { r.flow = safeParse(r.flow, []); });
  return success(res, rows);
});

// 采购详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '采购单不存在');
  row.flow = safeParse(row.flow, []);
  return success(res, row);
});

// 创建采购 — 市场部普通员工/各部门可创建
router.post('/', (req, res) => {
  if (!canAccess(req.user.role, req.user.dept, 'createPurchase')) {
    return error(res, 403, '无权创建采购申请');
  }
  const { title, category, amount, qty, unit, vendor, desc } = req.body;
  if (!title) return error(res, 400, '采购标题不能为空');
  const id = genId('PO');
  const flow = generateApprovalFlow('purchase', req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO purchases (id,title,category,amount,qty,unit,status,applicant,applicant_dept,date,vendor,desc,flow)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, title, category||'', amount||0, qty||0, unit||'', '待审批', req.user.name, req.user.dept, new Date().toISOString().slice(0,10), vendor||'', desc||'', JSON.stringify(flow));
  return success(res, { id }, '采购申请已提交，等待审批');
});

// 采购审批 — 步骤级权限检查
router.post('/:id/approve', (req, res) => {
  if (!canAccess(req.user.role, req.user.dept, 'approvePurchase')) {
    return error(res, 403, '您无审批权限');
  }
  const item = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '采购单不存在');
  const flow = safeParse(item.flow, []);
  const current = flow.find(f => !f.done);
  if (!current) return error(res, 400, '已全部审批完成');
  
  // 步骤级审批权限检查
  const stepName = current.step;
  
  // 市场部负责人审批 — 市场部部门经理
  if (stepName.includes('市场部负责人')) {
    if (req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      if (!(req.user.role === '部门经理' && req.user.dept === '市场部')) {
        return error(res, 403, '仅市场部负责人可审批');
      }
    }
  }
  // 销售总监审批 — 仅销售总监
  if (stepName.includes('销售总监')) {
    if (req.user.role !== '总经理' && req.user.role !== '超级管理员' && req.user.role !== '销售总监') {
      return error(res, 403, '仅销售总监可审批');
    }
  }
  // 财务负责人审批 — 财务部部门经理/财务部普通员工
  if (stepName.includes('财务负责人')) {
    if (req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      if (!(req.user.dept === '财务部' && (req.user.role === '普通员工' || req.user.role === '部门经理'))) {
        return error(res, 403, '仅财务负责人可审批');
      }
    }
  }
  // 总经理终审/审批 — 仅总经理
  if (stepName.includes('总经理')) {
    if (req.user.role !== '总经理' && req.user.role !== '超级管理员') {
      return error(res, 403, '仅总经理可终审');
    }
  }
  // 副总审批 — 仅副总
  if (stepName.includes('副总')) {
    if (req.user.role !== '总经理' && req.user.role !== '超级管理员' && req.user.role !== '副总') {
      return error(res, 403, '仅副总可审批');
    }
  }
  
  current.done = true;
  current.user = req.user.name;
  current.time = now();
  
  // 自动完成后续非审批步骤（如"采购入库"、"采购流程"）
  const idx = flow.indexOf(current);
  for (let i = idx + 1; i < flow.length; i++) {
    if (!flow[i].done && (flow[i].step.includes('入库') || flow[i].step.includes('采购流程') || flow[i].step.includes('完成'))) {
      flow[i].done = true;
      flow[i].user = '系统';
      flow[i].time = now();
    } else {
      break;
    }
  }
  
  const allDone = flow.every(f => f.done);
  // 市场部采购: 全部审批后进入"采购流程"
  // 其他采购: 全部审批后"采购入库"
  const newStatus = allDone ? (item.applicant_dept === '市场部' ? '采购中' : '已入库') : '待审批';
  
  db.prepare(`UPDATE purchases SET flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), newStatus, req.params.id);
  return success(res, null, allDone ? '审批全部通过，进入采购流程' : '审批节点已通过');
});

// 采购驳回
router.post('/:id/reject', (req, res) => {
  if (!canAccess(req.user.role, req.user.dept, 'approvePurchase')) {
    return error(res, 403, '您无审批权限');
  }
  const { remark } = req.body;
  const item = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '采购单不存在');
  const flow = safeParse(item.flow, []);
  const current = flow.find(f => !f.done);
  if (current) {
    current.rejected = true;
    current.user = req.user.name;
    current.time = now();
    current.remark = remark || '驳回';
  }
  db.prepare(`UPDATE purchases SET status='已驳回', flow=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), req.params.id);
  return success(res, null, '采购申请已驳回');
});

module.exports = router;
