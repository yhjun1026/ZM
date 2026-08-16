/**
 * 合同管理路由 (contract_manage)
 * 子功能：合同新增、合同审批、合同变更、合同终止/解除、合同借阅、合同台账、到期预警、合同模板库
 * 数据隔离：按角色+部门双重权限控制
 * 操作日志：开启 | 版本记录：开启
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove } = require('../../compat/auth');
const { canAccess } = require('../../compat/rbac');
const { success, error, genId, safeParse, generateApprovalFlow, now } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 操作日志辅助函数 =====
function logAction(contractId, action, user, detail) {
  db.prepare('INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail) VALUES (?,?,?,?,?,?)')
    .run(contractId || '', action, user.name || '', user.id || '', user.dept || '', detail || '');
}

// ===== 版本快照辅助函数 =====
function saveVersion(contractId, changeDesc, user) {
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
  if (!contract) return;
  const verCount = db.prepare('SELECT COUNT(*) as c FROM contract_versions WHERE contract_id = ?').get(contractId).c;
  const verId = genId('VER');
  db.prepare('INSERT INTO contract_versions (id, contract_id, version_num, snapshot, change_desc, operator, operator_id) VALUES (?,?,?,?,?,?,?)')
    .run(verId, contractId, verCount + 1, JSON.stringify(contract), changeDesc || '', user.name || '', user.id || '');
}

// ================================================================
// 一、合同列表（台账） — 合同台账子功能
// ================================================================
router.get('/', (req, res) => {
  const { status, type, keyword, expiring } = req.query;
  let sql = 'SELECT * FROM contracts WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (keyword) { sql += ' AND (name LIKE ? OR customer LIKE ? OR id LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%', '%'+keyword+'%'); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => { r.flow = safeParse(r.flow, []); });
  return success(res, rows);
});

// 合同详情
router.get('/detail/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '合同不存在');
  row.flow = safeParse(row.flow, []);
  return success(res, row);
});

// ================================================================
// 二、到期预警 — 30天内到期合同
// ================================================================
router.get('/expiry/warning', (req, res) => {
  const today = now().split(' ')[0];
  const rows = db.prepare(`
    SELECT * FROM contracts
    WHERE end_date IS NOT NULL AND end_date != ''
    AND status IN ('执行中','已完成')
    AND date(end_date) >= date(?) AND date(end_date) <= date(?, '+30 days')
    ORDER BY end_date ASC
  `).all(today, today);
  rows.forEach(r => { r.flow = safeParse(r.flow, []); });
  return success(res, rows);
});

// ================================================================
// 三、创建合同 — 仅行政部
// ================================================================
router.post('/', (req, res) => {
  if (!canAccess(req.user.role, req.user.dept, 'createContract')) {
    return error(res, 403, '仅行政部人员可创建合同');
  }
  const { name, customer, type, amount, start_date, end_date, content, archive_loc } = req.body;
  if (!name) return error(res, 400, '合同名称不能为空');
  const id = genId('CT');
  const flow = generateApprovalFlow('contract', req.user.dept);
  flow[0].user = req.user.name;
  db.prepare(`INSERT INTO contracts (id,name,customer,type,amount,start_date,end_date,status,progress,creator,creator_id,creator_dept,approver,sign_date,execution_status,execution_desc,flow,content,version,archive_loc)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, name, customer||'', type||'', amount||0, start_date||'', end_date||'',
    '待审批', 0, req.user.name, req.user.id, req.user.dept, '', '', '未执行', '', JSON.stringify(flow), content||'', '1', archive_loc||''
  );
  logAction(id, '创建合同', req.user, '合同名称: ' + name);
  saveVersion(id, '初始创建', req.user);
  return success(res, { id }, '合同创建成功，等待审批');
});

// ================================================================
// 四、合同审批 — 步骤级权限检查
// ================================================================
router.post('/:id/approve', (req, res) => {
  const u = req.user;
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!contract) return error(res, 404, '合同不存在');
  if (contract.status === '已执行' || contract.status === '执行中') return error(res, 400, '该合同已执行');
  if (contract.status === '已驳回') return error(res, 400, '该合同已驳回');

  const flow = safeParse(contract.flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;
  // 步骤级权限检查
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') return error(res, 403, '仅行政部负责人可执行此审批');
  } else if (stepName.includes('财务负责人')) {
    if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员' && u.role !== '总经理') return error(res, 403, '仅财务负责人可执行此审批');
  } else if (stepName.includes('销售总监')) {
    if (u.role !== '销售总监' && u.role !== '超级管理员' && u.role !== '总经理') return error(res, 403, '仅销售总监可执行此审批');
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') return error(res, 403, '仅公司副总可执行此审批');
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') return error(res, 403, '仅总经理可执行终审');
  }

  flow[currentIdx].done = true;
  flow[currentIdx].user = u.name;
  flow[currentIdx].time = now();

  let newStatus = contract.status;
  let newExecStatus = contract.execution_status || '未执行';
  const nextIdx = flow.findIndex(f => !f.done);
  if (nextIdx !== -1 && flow[nextIdx].step.includes('执行')) {
    flow[nextIdx].done = true; flow[nextIdx].user = '系统自动'; flow[nextIdx].time = now();
    if (flow.every(f => f.done)) { newStatus = '执行中'; newExecStatus = '执行中'; }
  }
  const allDone = flow.every(f => f.done);
  if (allDone && newStatus === '待审批') { newStatus = '执行中'; newExecStatus = '执行中'; }

  db.prepare(`UPDATE contracts SET flow=?, status=?, execution_status=?, approver=?, sign_date=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), newStatus, newExecStatus, u.name, now().split(' ')[0], req.params.id);
  logAction(req.params.id, '审批通过', u, '审批步骤: ' + stepName);
  return success(res, { status: newStatus }, allDone || newStatus === '执行中' ? '合同审批通过，已进入执行阶段' : '审批节点已通过');
});

// 驳回
router.post('/:id/reject', requireApprove(), (req, res) => {
  const { remark } = req.body;
  const flow = safeParse(db.prepare('SELECT flow FROM contracts WHERE id = ?').get(req.params.id)?.flow || '[]', []);
  const current = flow.find(f => !f.done);
  if (current) { current.rejected = true; current.user = req.user.name; current.time = now(); if (remark) current.remark = '驳回: ' + remark; }
  db.prepare(`UPDATE contracts SET status=?, flow=?, updated_at=datetime('now','localtime') WHERE id=?`).run('已驳回', JSON.stringify(flow), req.params.id);
  logAction(req.params.id, '驳回合同', req.user, '驳回原因: ' + (remark||''));
  return success(res, null, '合同已驳回');
});

// ================================================================
// 五、更新合同执行情况
// ================================================================
router.post('/:id/execution', (req, res) => {
  const u = req.user;
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
  if (!contract) return error(res, 404, '合同不存在');
  if (contract.status !== '执行中') return error(res, 400, '仅执行中的合同可更新执行情况');
  if (u.role !== '超级管理员' && u.role !== '总经理' && u.role !== '副总') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部') && u.id !== contract.creator_id) {
      return error(res, 403, '无权更新合同执行情况');
    }
  }
  const { execution_status, execution_desc, progress } = req.body;
  const validStatuses = ['未执行', '执行中', '已完成', '已暂停'];
  const newExecStatus = validStatuses.indexOf(execution_status) !== -1 ? execution_status : contract.execution_status;
  const newProgress = progress !== undefined ? Math.min(100, Math.max(0, parseInt(progress) || 0)) : contract.progress;
  const newDesc = execution_desc || contract.execution_desc || '';
  let newStatus = contract.status;
  if (newExecStatus === '已完成') newStatus = '已完成';
  else if (newExecStatus === '已暂停') newStatus = '已暂停';
  else newStatus = '执行中';
  db.prepare(`UPDATE contracts SET execution_status=?, execution_desc=?, progress=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(newExecStatus, newDesc, newProgress, newStatus, req.params.id);
  logAction(req.params.id, '更新执行情况', u, '状态:' + newExecStatus + ' 进度:' + newProgress + '%');
  saveVersion(req.params.id, '更新执行情况: ' + newExecStatus, u);
  return success(res, null, '合同执行情况已更新');
});

// ================================================================
// 六、合同变更
// ================================================================
// 变更列表
router.get('/changes/list', (req, res) => {
  const rows = db.prepare('SELECT * FROM contract_changes ORDER BY created_at DESC').all();
  rows.forEach(r => { r.flow = safeParse(r.flow, []); });
  return success(res, rows);
});

// 创建变更申请 — 行政部+创建者
router.post('/changes/create', (req, res) => {
  const u = req.user;
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.body.contract_id);
  if (!contract) return error(res, 404, '合同不存在');
  // 权限：行政部/合同创建者/超管/总经理
  if (u.role !== '超级管理员' && u.role !== '总经理') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部') && u.id !== contract.creator_id) {
      return error(res, 403, '无权申请合同变更');
    }
  }
  const { contract_id, change_type, reason, before_desc, after_desc } = req.body;
  const id = genId('CHG');
  const flow = generateApprovalFlow('contract', u.dept);
  flow[0].user = u.name;
  db.prepare('INSERT INTO contract_changes (id,contract_id,contract_name,change_type,reason,before_desc,after_desc,applicant,applicant_id,applicant_dept,status,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, contract_id, contract.name, change_type||'', reason||'', before_desc||'', after_desc||'', u.name, u.id, u.dept, '待审批', JSON.stringify(flow));
  logAction(contract_id, '申请变更', u, '变更类型: ' + (change_type||''));
  return success(res, { id }, '合同变更申请已提交');
});

// 审批变更
router.post('/changes/:id/approve', (req, res) => {
  const u = req.user;
  const chg = db.prepare('SELECT * FROM contract_changes WHERE id = ?').get(req.params.id);
  if (!chg) return error(res, 404, '变更记录不存在');
  if (chg.status !== '待审批') return error(res, 400, '该变更已处理');
  const flow = safeParse(chg.flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');
  const stepName = flow[currentIdx].step;
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') return error(res, 403, '仅行政部负责人可审批');
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') return error(res, 403, '仅副总可审批');
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') return error(res, 403, '仅总经理可终审');
  }
  flow[currentIdx].done = true; flow[currentIdx].user = u.name; flow[currentIdx].time = now();
  const allDone = flow.every(f => f.done);
  const newStatus = allDone ? '已通过' : '待审批';
  db.prepare('UPDATE contract_changes SET status=?, flow=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(newStatus, JSON.stringify(flow), req.params.id);
  if (allDone) {
    // 变更通过后更新合同版本
    saveVersion(chg.contract_id, '合同变更: ' + (chg.change_type||''), u);
    logAction(chg.contract_id, '变更审批通过', u, '变更类型: ' + (chg.change_type||''));
  }
  return success(res, { status: newStatus }, allDone ? '变更审批通过' : '审批节点已通过');
});

// ================================================================
// 七、合同终止/解除
// ================================================================
// 终止列表
router.get('/terminations/list', (req, res) => {
  const rows = db.prepare('SELECT * FROM contract_terminations ORDER BY created_at DESC').all();
  rows.forEach(r => { r.flow = safeParse(r.flow, []); });
  return success(res, rows);
});

// 创建终止/解除申请
router.post('/terminations/create', (req, res) => {
  const u = req.user;
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.body.contract_id);
  if (!contract) return error(res, 404, '合同不存在');
  if (contract.status !== '执行中') return error(res, 400, '仅执行中的合同可申请终止/解除');
  // 权限：行政部/合同创建者/超管/总经理
  if (u.role !== '超级管理员' && u.role !== '总经理') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部') && u.id !== contract.creator_id) {
      return error(res, 403, '无权申请合同终止/解除');
    }
  }
  const { contract_id, term_type, reason, settle_amount, settle_desc, effective_date } = req.body;
  const id = genId('TRM');
  const flow = generateApprovalFlow('contract', u.dept);
  flow[0].user = u.name;
  db.prepare('INSERT INTO contract_terminations (id,contract_id,contract_name,term_type,reason,settle_amount,settle_desc,effective_date,applicant,applicant_id,applicant_dept,status,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, contract_id, contract.name, term_type||'终止', reason||'', settle_amount||0, settle_desc||'', effective_date||'', u.name, u.id, u.dept, '待审批', JSON.stringify(flow));
  logAction(contract_id, '申请终止/解除', u, '类型: ' + (term_type||'终止'));
  return success(res, { id }, '合同终止/解除申请已提交');
});

// 审批终止/解除
router.post('/terminations/:id/approve', (req, res) => {
  const u = req.user;
  const trm = db.prepare('SELECT * FROM contract_terminations WHERE id = ?').get(req.params.id);
  if (!trm) return error(res, 404, '终止记录不存在');
  if (trm.status !== '待审批') return error(res, 400, '该申请已处理');
  const flow = safeParse(trm.flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');
  const stepName = flow[currentIdx].step;
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') return error(res, 403, '仅行政部负责人可审批');
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') return error(res, 403, '仅副总可审批');
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') return error(res, 403, '仅总经理可终审');
  }
  flow[currentIdx].done = true; flow[currentIdx].user = u.name; flow[currentIdx].time = now();
  const allDone = flow.every(f => f.done);
  const newStatus = allDone ? '已通过' : '待审批';
  db.prepare('UPDATE contract_terminations SET status=?, flow=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(newStatus, JSON.stringify(flow), req.params.id);
  if (allDone) {
    // 终止通过后更新合同状态
    db.prepare('UPDATE contracts SET status=?, execution_status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run('已终止', '已终止', trm.contract_id);
    saveVersion(trm.contract_id, '合同终止/解除: ' + (trm.term_type||''), u);
    logAction(trm.contract_id, '终止/解除审批通过', u, '');
  }
  return success(res, { status: newStatus }, allDone ? '终止/解除审批通过' : '审批节点已通过');
});

// ================================================================
// 八、合同借阅
// ================================================================
// 借阅列表
router.get('/borrows/list', (req, res) => {
  const rows = db.prepare('SELECT * FROM contract_borrows ORDER BY created_at DESC').all();
  rows.forEach(r => { r.flow = safeParse(r.flow, []); });
  return success(res, rows);
});

// 创建借阅申请
router.post('/borrows/create', (req, res) => {
  const u = req.user;
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.body.contract_id);
  if (!contract) return error(res, 404, '合同不存在');
  const { contract_id, expected_return, purpose } = req.body;
  const id = genId('BRW');
  // 借阅审批简化流程：行政部负责人 → 副总 → 总经理
  const flow = [
    { step: '提交', user: u.name, done: true, time: now() },
    { step: '行政部负责人审批', user: '', done: false, time: '' },
    { step: '副总审批', user: '', done: false, time: '' },
    { step: '总经理审批', user: '', done: false, time: '' }
  ];
  db.prepare('INSERT INTO contract_borrows (id,contract_id,contract_name,borrower,borrower_id,borrower_dept,borrow_date,expected_return,purpose,status,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, contract_id, contract.name, u.name, u.id, u.dept, now().split(' ')[0], expected_return||'', purpose||'', '待审批', JSON.stringify(flow));
  logAction(contract_id, '申请借阅', u, '借阅人: ' + u.name);
  return success(res, { id }, '借阅申请已提交');
});

// 审批借阅
router.post('/borrows/:id/approve', (req, res) => {
  const u = req.user;
  const brw = db.prepare('SELECT * FROM contract_borrows WHERE id = ?').get(req.params.id);
  if (!brw) return error(res, 404, '借阅记录不存在');
  if (brw.status !== '待审批') return error(res, 400, '该申请已处理');
  const flow = safeParse(brw.flow, []);
  const currentIdx = flow.findIndex(f => !f.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');
  const stepName = flow[currentIdx].step;
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员') return error(res, 403, '仅行政部负责人可审批');
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') return error(res, 403, '仅副总可审批');
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') return error(res, 403, '仅总经理可终审');
  }
  flow[currentIdx].done = true; flow[currentIdx].user = u.name; flow[currentIdx].time = now();
  const allDone = flow.every(f => f.done);
  const newStatus = allDone ? '已批准' : '待审批';
  db.prepare('UPDATE contract_borrows SET status=?, flow=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(newStatus, JSON.stringify(flow), req.params.id);
  logAction(brw.contract_id, '借阅审批', u, '步骤: ' + stepName);
  return success(res, { status: newStatus }, allDone ? '借阅已批准' : '审批节点已通过');
});

// 归还合同
router.post('/borrows/:id/return', (req, res) => {
  const u = req.user;
  const brw = db.prepare('SELECT * FROM contract_borrows WHERE id = ?').get(req.params.id);
  if (!brw) return error(res, 404, '借阅记录不存在');
  if (brw.status !== '已批准') return error(res, 400, '仅已批准的借阅可归还');
  db.prepare('UPDATE contract_borrows SET status=?, actual_return=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run('已归还', now().split(' ')[0], req.params.id);
  logAction(brw.contract_id, '合同归还', u, '借阅人: ' + (brw.borrower||''));
  return success(res, null, '合同已归还');
});

// ================================================================
// 九、合同模板库
// ================================================================
// 模板列表
router.get('/templates/list', (req, res) => {
  const { category, keyword } = req.query;
  let sql = 'SELECT id, name, category, creator, status, created_at, updated_at FROM contract_templates WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (keyword) { sql += ' AND name LIKE ?'; params.push('%'+keyword+'%'); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  return success(res, rows);
});

// 模板详情（含内容）
router.get('/templates/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '模板不存在');
  return success(res, row);
});

// 创建模板 — 行政部
router.post('/templates/create', (req, res) => {
  const u = req.user;
  if (u.role !== '超级管理员' && u.role !== '总经理') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部')) {
      return error(res, 403, '仅行政部可管理合同模板');
    }
  }
  const { name, category, content, fields } = req.body;
  if (!name) return error(res, 400, '模板名称不能为空');
  const id = genId('TPL');
  db.prepare('INSERT INTO contract_templates (id,name,category,content,fields,creator,creator_id,status) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, name, category||'', content||'', JSON.stringify(fields||[]), u.name, u.id, '启用');
  return success(res, { id }, '模板创建成功');
});

// 更新模板
router.put('/templates/:id', (req, res) => {
  const u = req.user;
  if (u.role !== '超级管理员' && u.role !== '总经理') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部')) {
      return error(res, 403, '仅行政部可管理合同模板');
    }
  }
  const tpl = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(req.params.id);
  if (!tpl) return error(res, 404, '模板不存在');
  const { name, category, content, fields, status } = req.body;
  db.prepare('UPDATE contract_templates SET name=?, category=?, content=?, fields=?, status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(name||tpl.name, category||tpl.category, content||tpl.content, JSON.stringify(fields||[]), status||tpl.status, req.params.id);
  return success(res, null, '模板已更新');
});

// 删除模板
router.delete('/templates/:id', (req, res) => {
  const u = req.user;
  if (u.role !== '超级管理员' && u.role !== '总经理') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部')) {
      return error(res, 403, '仅行政部可管理合同模板');
    }
  }
  db.prepare('DELETE FROM contract_templates WHERE id = ?').run(req.params.id);
  return success(res, null, '模板已删除');
});

// ================================================================
// 十、操作日志查询
// ================================================================
router.get('/logs/list', (req, res) => {
  const { contract_id, action, keyword } = req.query;
  let sql = 'SELECT * FROM contract_logs WHERE 1=1';
  const params = [];
  if (contract_id) { sql += ' AND contract_id = ?'; params.push(contract_id); }
  if (action) { sql += ' AND action LIKE ?'; params.push('%'+action+'%'); }
  if (keyword) { sql += ' AND (operator LIKE ? OR detail LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%'); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const rows = db.prepare(sql).all(...params);
  return success(res, rows);
});

// ================================================================
// 十一、版本记录查询
// ================================================================
router.get('/versions/list', (req, res) => {
  const { contract_id } = req.query;
  let sql = 'SELECT * FROM contract_versions WHERE 1=1';
  const params = [];
  if (contract_id) { sql += ' AND contract_id = ?'; params.push(contract_id); }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => { try { r.snapshot = JSON.parse(r.snapshot); } catch(e) {} });
  return success(res, rows);
});

module.exports = router;
