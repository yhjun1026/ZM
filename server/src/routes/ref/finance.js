/**
 * 财务管理路由
 * 固定资产录入：财务部普通员工 → 财务负责人审批 → 副总审批 → 总经理审批 → 执行
 * 财务记录录入：财务部普通员工 → 财务负责人审批 → 副总审批 → 总经理终审
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove, requireAction } = require('../../compat/auth');
const { canAccess } = require('../../compat/rbac');
const { success, error, genId, safeParse, generateApprovalFlow, now } = require('../../compat/helpers');

router.use(authMiddleware);

// 财务概览
router.get('/overview', (req, res) => {
  const receivable = db.prepare("SELECT * FROM finance_records WHERE type='receivable' ORDER BY date DESC").all();
  const payable = db.prepare("SELECT * FROM finance_records WHERE type='payable' ORDER BY date DESC").all();
  const assets = db.prepare('SELECT * FROM fixed_assets ORDER BY created_at DESC').all();
  receivable.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  payable.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  assets.forEach(a => { a.approval_flow = safeParse(a.approval_flow, []); });
  return success(res, { receivable, payable, assets });
});

// 所有财务记录
router.get('/records', (req, res) => {
  const rows = db.prepare('SELECT * FROM finance_records ORDER BY date DESC').all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  return success(res, rows);
});

// 应收账款
router.get('/receivable', (req, res) => {
  const rows = db.prepare("SELECT * FROM finance_records WHERE type='receivable' ORDER BY date DESC").all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  return success(res, rows);
});

// 应付账款
router.get('/payable', (req, res) => {
  const rows = db.prepare("SELECT * FROM finance_records WHERE type='payable' ORDER BY date DESC").all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  return success(res, rows);
});

// 固定资产
router.get('/assets', (req, res) => {
  const rows = db.prepare('SELECT * FROM fixed_assets ORDER BY created_at DESC').all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  return success(res, rows);
});

// ===== 固定资产录入（财务部普通员工）=====
router.post('/assets', (req, res) => {
  if (!canAccess(req.user.role, req.user.dept, 'createFixedAsset')) {
    return error(res, 403, '仅财务部人员可录入固定资产');
  }
  const { name, category, dept, user, purchase_date, original_value, salvage_rate, useful_life } = req.body;
  if (!name || !original_value) return error(res, 400, '请填写资产名称和原值');
  const aid = 'FA-' + Date.now();
  const flow = generateApprovalFlow('fixed_asset', req.user.dept);
  flow[0].user = req.user.name;
  const netVal = (original_value || 0) - (original_value || 0) * (salvage_rate || 0.05);
  db.prepare(`INSERT INTO fixed_assets (id,name,category,dept,user,purchase_date,original_value,salvage_rate,useful_life,accumulated_dep,net_value,status,submitter,submitter_id,applicant_dept,approval_flow)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(aid, name, category||'', dept||'', user||'', purchase_date||now().split(' ')[0],
      original_value||0, salvage_rate||0.05, useful_life||36, 0, netVal, '待审批',
      req.user.name, req.user.id, req.user.dept, JSON.stringify(flow));
  return success(res, { id: aid }, '固定资产录入已提交，等待审批');
});

// ===== 固定资产审批（步骤级权限检查）=====
router.post('/assets/:id/approve', (req, res) => {
  const u = req.user;
  const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(req.params.id);
  if (!asset) return error(res, 404, '资产不存在');
  if (asset.status === '已驳回') return error(res, 400, '该资产申请已驳回');

  const flow = safeParse(asset.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '已全部审批完成');

  const stepName = flow[currentIdx].step;

  // 步骤级权限检查
  if (stepName.includes('财务负责人')) {
    if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅财务负责人可执行此审批');
    }
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅公司副总可执行此审批');
    }
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') {
      return error(res, 403, '仅总经理可终审');
    }
  }

  // 执行审批
  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();

  // 自动完成"执行"步骤
  let newStatus = asset.status;
  const nextIdx = flow.findIndex(f => !f.done);
  if (nextIdx !== -1 && flow[nextIdx].step.includes('执行')) {
    flow[nextIdx].done = true;
    flow[nextIdx].user = '系统自动';
    flow[nextIdx].time = now();
  }
  if (flow.every(s => s.done)) {
    newStatus = '使用中';
  }

  db.prepare(`UPDATE fixed_assets SET status=?, approval_flow=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(newStatus, JSON.stringify(flow), req.params.id);
  return success(res, null, flow.every(s => s.done) ? '固定资产审批通过，已执行' : '审批节点已通过');
});

// ===== 固定资产驳回 =====
router.post('/assets/:id/reject', (req, res) => {
  const { remark } = req.body;
  const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(req.params.id);
  if (!asset) return error(res, 404, '资产不存在');
  const flow = safeParse(asset.approval_flow, []);
  const current = flow.find(f => !f.done);
  if (current) {
    current.rejected = true;
    current.user = req.user.name;
    current.time = now();
    current.remark = remark || '驳回';
  }
  db.prepare(`UPDATE fixed_assets SET status='已驳回', approval_flow=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), req.params.id);
  return success(res, null, '固定资产申请已驳回');
});

// ===== 固定资产领用单 =====
// 领用单列表
router.get('/asset-requisitions', (req, res) => {
  const rows = db.prepare('SELECT * FROM asset_requisitions ORDER BY created_at DESC').all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  return success(res, rows);
});

// 创建领用单 — 财务部普通员工录入
router.post('/asset-requisitions', (req, res) => {
  if (!canAccess(req.user.role, req.user.dept, 'createFixedAsset')) {
    return error(res, 403, '仅财务部人员可录入领用单');
  }
  const { asset_id, asset_name, category, requisitioner, requisitioner_id, dept, req_date, purpose } = req.body;
  if (!asset_id || !requisitioner) return error(res, 400, '请填写资产和领用人');
  const id = genId('AR');
  const flow = [
    { step: '财务部录入', user: req.user.name, time: now(), done: true },
    { step: '财务负责人审批', user: '', time: '—', done: false },
    { step: '副总审批', user: '', time: '—', done: false },
    { step: '总经理审批', user: '', time: '—', done: false },
    { step: '执行', user: '', time: '—', done: false }
  ];
  db.prepare(`INSERT INTO asset_requisitions (id,asset_id,asset_name,category,requisitioner,requisitioner_id,dept,req_date,purpose,status,submitter,submitter_id,approval_flow)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, asset_id, asset_name||'', category||'', requisitioner, requisitioner_id||'', dept||'', req_date||now().split(' ')[0], purpose||'',
    '待审批', req.user.name, req.user.id, JSON.stringify(flow)
  );
  return success(res, { id }, '领用单已提交，等待审批');
});

// 领用单审批
router.post('/asset-requisitions/:id/approve', (req, res) => {
  const u = req.user;
  const req_item = db.prepare('SELECT * FROM asset_requisitions WHERE id = ?').get(req.params.id);
  if (!req_item) return error(res, 404, '领用单不存在');
  const flow = safeParse(req_item.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '已全部审批完成');

  const stepName = flow[currentIdx].step;
  if (stepName.includes('财务负责人')) {
    if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅财务负责人可执行此审批');
    }
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅公司副总可执行此审批');
    }
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') {
      return error(res, 403, '仅总经理可终审');
    }
  }

  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();

  let newStatus = req_item.status;
  const nextIdx = flow.findIndex(f => !f.done);
  if (nextIdx !== -1 && flow[nextIdx].step.includes('执行')) {
    flow[nextIdx].done = true;
    flow[nextIdx].user = '系统自动';
    flow[nextIdx].time = now();
  }
  if (flow.every(s => s.done)) {
    newStatus = '已批准';
  }

  db.prepare(`UPDATE asset_requisitions SET status=?, approval_flow=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(newStatus, JSON.stringify(flow), req.params.id);
  return success(res, null, flow.every(s => s.done) ? '领用单审批通过' : '审批节点已通过');
});

// 领用单驳回
router.post('/asset-requisitions/:id/reject', (req, res) => {
  const { remark } = req.body;
  db.prepare(`UPDATE asset_requisitions SET status='已驳回', updated_at=datetime('now','localtime') WHERE id=?`)
    .run(req.params.id);
  return success(res, null, '领用单已驳回');
});

// 办公租金
router.get('/rent', (req, res) => {
  const rows = db.prepare("SELECT * FROM finance_records WHERE type='rent' ORDER BY date DESC").all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); });
  return success(res, rows);
});

// ===== 财务记录录入（应收/应付/租金）— 财务部普通员工可录入 =====
router.post('/records', (req, res) => {
  if (!canAccess(req.user.role, req.user.dept, 'createFinanceRecord')) {
    return error(res, 403, '仅财务部人员可录入财务数据');
  }
  const { type, category, amount, date, desc, vendor, customer } = req.body;
  if (!type || !amount) return error(res, 400, '请填写类型和金额');
  const id = genId('FIN');
  const flow = generateApprovalFlow('finance', req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO finance_records (id,type,category,amount,date,dept,desc,status,submitter,submitter_id,approval_flow)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, type, category||'', amount, date||now().split(' ')[0], req.user.dept, desc||vendor||customer||'', '待审批', req.user.name, req.user.id, JSON.stringify(flow));
  return success(res, { id }, '财务记录已录入，等待审批');
});

// ===== 财务审批（财务负责人审批 → 副总审批 → 总经理终审）=====
router.post('/records/:id/approve', (req, res) => {
  const u = req.user;
  const record = db.prepare('SELECT * FROM finance_records WHERE id = ?').get(req.params.id);
  if (!record) return error(res, 404, '记录不存在');
  const flow = safeParse(record.approval_flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '已全部审批完成');

  const stepName = flow[currentIdx].step;
  if (stepName.includes('财务负责人')) {
    if (!canAccess(u.role, u.dept, 'financeReview') && u.role !== '总经理' && u.role !== '超级管理员') {
      return error(res, 403, '仅财务负责人可审批');
    }
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅公司副总可执行此审批');
    }
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') {
      return error(res, 403, '仅总经理可终审');
    }
  }

  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();

  const allDone = flow.every(f => f.done);
  const newStatus = allDone ? '已确认' : '待审批';
  db.prepare(`UPDATE finance_records SET status=?, approval_flow=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(newStatus, JSON.stringify(flow), req.params.id);
  return success(res, null, allDone ? '财务记录已终审通过' : '审批节点已通过');
});

// ===== 财务驳回 =====
router.post('/records/:id/reject', (req, res) => {
  const { remark } = req.body;
  const record = db.prepare('SELECT * FROM finance_records WHERE id = ?').get(req.params.id);
  if (!record) return error(res, 404, '记录不存在');
  const flow = safeParse(record.approval_flow, []);
  const current = flow.find(f => !f.done);
  if (current) {
    current.rejected = true;
    current.user = req.user.name;
    current.time = now();
    current.remark = remark || '驳回';
  }
  db.prepare(`UPDATE finance_records SET status='已驳回', approval_flow=? WHERE id=?`)
    .run(JSON.stringify(flow), req.params.id);
  return success(res, null, '财务记录已驳回');
});

module.exports = router;
