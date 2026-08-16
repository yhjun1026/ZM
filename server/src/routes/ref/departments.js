/**
 * 部门管理路由 — 按《部门管理功能及流程规范方案》改造
 * 规则：
 *  - 部门编码 = 公司缩写 + 层级码 + 流水号（ZM-D1-001 一级 / ZM-D2-021 二级），系统自动生成
 *  - 部门名称全局唯一（跨层级重名拦截）
 *  - 有在职员工或有子部门的部门禁止删除，仅可停用
 *  - 部门变更（新增/修改/停用/启用/删除）需走OA审批：
 *      总经理/超级管理员操作 → 记录台账并立即生效
 *      其他管理层操作 → 生成变更申请，总经理审批通过后生效
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, now } = require('../../compat/helpers');

router.use(authMiddleware);

/* ===== 数据库迁移（幂等） ===== */
(function migrate() {
  const exist = db.prepare('PRAGMA table_info(departments)').all().map(c => c.name);
  if (!exist.includes('code')) db.exec("ALTER TABLE departments ADD COLUMN code TEXT DEFAULT ''");
  if (!exist.includes('status')) db.exec("ALTER TABLE departments ADD COLUMN status TEXT DEFAULT '启用'");
  if (!exist.includes('founded_at')) db.exec("ALTER TABLE departments ADD COLUMN founded_at TEXT DEFAULT ''");
  // 历史数据回填编码
  const rows = db.prepare("SELECT id, parent_id, code FROM departments WHERE code IS NULL OR code = ''").all();
  if (rows.length) {
    const cnt = { 1: 0, 2: 0 };
    db.prepare("SELECT code FROM departments WHERE code LIKE 'ZM-D%'").all().forEach(r => {
      const m = /^ZM-D(\d)-(\d+)$/.exec(r.code || '');
      if (m) cnt[parseInt(m[1], 10)] = Math.max(cnt[parseInt(m[1], 10)] || 0, parseInt(m[2], 10));
    });
    const upd = db.prepare('UPDATE departments SET code = ?, founded_at = COALESCE(NULLIF(founded_at,\'\'), created_at, \'\') WHERE id = ?');
    rows.forEach(r => {
      const level = r.parent_id === 0 ? 1 : 2;
      cnt[level] = (cnt[level] || 0) + 1;
      upd.run(`ZM-D${level}-${String(cnt[level]).padStart(3, '0')}`, r.id);
    });
  }
  db.exec(`CREATE TABLE IF NOT EXISTS t_dept_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_type TEXT NOT NULL,
    dept_id INTEGER DEFAULT 0,
    dept_name TEXT DEFAULT '',
    before_data TEXT DEFAULT '{}',
    after_data TEXT DEFAULT '{}',
    approval_flow TEXT DEFAULT '[]',
    status TEXT DEFAULT '待审批',
    applicant TEXT DEFAULT '',
    approver TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
})();

function genDeptCode(parentId) {
  const level = !parentId || parentId === 0 ? 1 : 2;
  const prefix = `ZM-D${level}-`;
  const rows = db.prepare("SELECT code FROM departments WHERE code LIKE ?").all(prefix + '%');
  let max = 0;
  rows.forEach(r => { const m = new RegExp('^' + prefix + '(\\d+)$').exec(r.code || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return prefix + String(max + 1).padStart(3, '0');
}

function nameExists(name, excludeId) {
  const row = db.prepare('SELECT COUNT(*) n FROM departments WHERE name = ? AND id != ?').get(name, excludeId || 0);
  return row.n > 0;
}

function deptEmployees(deptName) {
  return db.prepare("SELECT COUNT(*) n FROM users WHERE dept = ? AND status != '离职'").get(deptName).n;
}

function deptChildren(deptId) {
  return db.prepare('SELECT COUNT(*) n FROM departments WHERE parent_id = ?').get(deptId).n;
}

function canManage(u) {
  return ['超级管理员', '总经理'].includes(u.role) || (u.role === '部门经理' && u.dept === '行政部');
}

function buildChangeFlow(u) {
  const nowStr = now();
  // 总经理/超管操作 → 台账直达；其他管理层 → 提交→副总审批→总经理审批
  if (['超级管理员', '总经理'].includes(u.role)) {
    return [
      { step: '提交变更', user: u.name, time: nowStr, done: true, remark: '高级权限直接生效' },
      { step: '总经理审批', user: u.name, time: nowStr, done: true, remark: '自动通过' }
    ];
  }
  // 副总操作 → 提交→总经理审批（副总不需自审）
  if (u.role === '副总') {
    return [
      { step: '提交变更', user: u.name, time: nowStr, done: true, remark: '' },
      { step: '总经理审批', user: '', time: '—', done: false, remark: '' }
    ];
  }
  // 其他管理层 → 提交→副总审批→总经理审批
  return [
    { step: '提交变更', user: u.name, time: nowStr, done: true, remark: '' },
    { step: '副总审批', user: '', time: '—', done: false, remark: '' },
    { step: '总经理审批', user: '', time: '—', done: false, remark: '' }
  ];
}

function logChange(u, changeType, deptId, deptName, before, after) {
  const flow = buildChangeFlow(u);
  const status = flow.every(s => s.done) ? '已生效' : '待审批';
  const info = db.prepare('INSERT INTO t_dept_changes (change_type,dept_id,dept_name,before_data,after_data,approval_flow,status,applicant) VALUES (?,?,?,?,?,?,?,?)')
    .run(changeType, deptId || 0, deptName || '', JSON.stringify(before || {}), JSON.stringify(after || {}), JSON.stringify(flow), status, u.name);
  return { id: info.lastInsertRowid, status };
}

// 审批通过后落地执行变更
function applyChange(ch) {
  const after = safeParse(ch.after_data, {});
  if (ch.change_type === '新增') {
    const code = genDeptCode(after.parent_id || 0);
    db.prepare('INSERT INTO departments (name,head,count,headcount,description,color,icon,parent_id,code,status,founded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(after.name, after.head || '', 0, after.headcount || 0, after.description || '', after.color || '#6366f1', after.icon || 'folder', after.parent_id || 0, code, '启用', after.founded_at || new Date().toISOString().slice(0, 10));
    return { code };
  }
  if (ch.change_type === '修改') {
    db.prepare('UPDATE departments SET name=?, head=?, headcount=?, description=?, founded_at=COALESCE(NULLIF(?,\'\'),founded_at) WHERE id=?')
      .run(after.name, after.head || '', after.headcount || 0, after.description || '', after.founded_at || '', ch.dept_id);
    return {};
  }
  if (ch.change_type === '停用') {
    db.prepare("UPDATE departments SET status = '停用' WHERE id = ?").run(ch.dept_id);
    return {};
  }
  if (ch.change_type === '启用') {
    db.prepare("UPDATE departments SET status = '启用' WHERE id = ?").run(ch.dept_id);
    return {};
  }
  if (ch.change_type === '删除') {
    db.prepare('DELETE FROM departments WHERE id = ?').run(ch.dept_id);
    return {};
  }
  return {};
}

/* ===== 部门树 ===== */
router.get('/', (req, res) => {
  const depts = db.prepare('SELECT * FROM departments ORDER BY parent_id, id').all();
  const tree = depts.filter(d => !d.parent_id || d.parent_id === 0).map(parent => {
    parent.children = depts.filter(d => d.parent_id === parent.id);
    return parent;
  });
  return success(res, tree);
});

router.get('/flat', (req, res) => {
  const depts = db.prepare('SELECT * FROM departments ORDER BY parent_id, id').all();
  return success(res, depts);
});

/* ===== 变更台账 ===== */
router.get('/changes', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_dept_changes ORDER BY created_at DESC LIMIT 200').all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); r.before_data = safeParse(r.before_data, {}); r.after_data = safeParse(r.after_data, {}); });
  return success(res, rows);
});

router.post('/changes/:id/approve', (req, res) => {
  if (!['超级管理员', '总经理', '副总'].includes(req.user.role)) return error(res, 403, '仅副总及以上可审批部门变更');
  const ch = db.prepare('SELECT * FROM t_dept_changes WHERE id = ?').get(req.params.id);
  if (!ch) return error(res, 404, '变更记录不存在');
  if (ch.status !== '待审批') return error(res, 400, '该变更已处理（' + ch.status + '）');
  let flow = safeParse(ch.approval_flow, []);
  const idx = flow.findIndex(s => !s.done);
  if (idx === -1) return error(res, 400, '无待审批步骤');
  // 副总只能审批"副总审批"步骤；总经理审批步骤仅总经理/超管可审
  if (flow[idx].step === '总经理审批' && !['超级管理员', '总经理'].includes(req.user.role)) {
    return error(res, 403, '该步骤需总经理审批，您无权操作');
  }
  // 总经理/超管可跳过副总步骤直接终审
  if (['超级管理员', '总经理'].includes(req.user.role)) {
    flow.forEach(s => { if (!s.done) { s.done = true; s.user = req.user.name; s.time = now(); } });
  } else {
    flow[idx].done = true; flow[idx].user = req.user.name; flow[idx].time = now();
  }
  const allDone = flow.every(s => s.done);
  if (allDone) {
    // 删除前再次校验保护规则
    if (ch.change_type === '删除') {
      const d = db.prepare('SELECT * FROM departments WHERE id = ?').get(ch.dept_id);
      if (d && (deptEmployees(d.name) > 0 || deptChildren(d.id) > 0)) return error(res, 400, '该部门仍有在职员工或子部门，禁止删除，仅可停用');
    }
    const result = applyChange(ch);
    db.prepare("UPDATE t_dept_changes SET status='已生效', approval_flow=?, approver=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(JSON.stringify(flow), req.user.name, req.params.id);
    return success(res, result, '部门变更已审批通过并生效');
  }
  db.prepare("UPDATE t_dept_changes SET approval_flow=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(flow), req.params.id);
  return success(res, null, '副总审批已通过，待总经理终审');
});

router.post('/changes/:id/reject', (req, res) => {
  if (!['超级管理员', '总经理', '副总'].includes(req.user.role)) return error(res, 403, '仅副总及以上可审批部门变更');
  const ch = db.prepare('SELECT * FROM t_dept_changes WHERE id = ?').get(req.params.id);
  if (!ch) return error(res, 404, '变更记录不存在');
  if (ch.status !== '待审批') return error(res, 400, '该变更已处理');
  const { remark } = req.body;
  if (!remark || !remark.trim()) return error(res, 400, '驳回必须填写意见');
  let flow = safeParse(ch.approval_flow, []);
  const idx = flow.findIndex(s => !s.done);
  if (idx !== -1) { flow[idx].user = req.user.name; flow[idx].time = now(); flow[idx].remark = '驳回：' + remark.trim(); }
  db.prepare("UPDATE t_dept_changes SET status='已驳回', approval_flow=?, approver=?, remark=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(flow), req.user.name, remark.trim(), req.params.id);
  return success(res, null, '部门变更已驳回，不生效');
});

/* ===== 新增部门（重名拦截 + 编码自动生成 + 审批） ===== */
router.post('/', (req, res) => {
  if (!canManage(req.user)) return error(res, 403, '仅超级管理员/总经理/行政部负责人可发起部门变更');
  const { name, head, color, icon, parent_id, headcount, description, founded_at } = req.body;
  if (!name || !name.trim()) return error(res, 400, '部门名称不能为空');
  if (nameExists(name.trim())) return error(res, 400, `部门名称「${name.trim()}」已存在（全局重名拦截）`);
  const after = { name: name.trim(), head: head || '', color: color || '#6366f1', icon: icon || 'folder', parent_id: parent_id || 0, headcount: headcount || 0, description: description || '', founded_at: founded_at || '' };
  const { id, status } = logChange(req.user, '新增', 0, after.name, null, after);
  if (status === '已生效') {
    const result = applyChange({ change_type: '新增', after_data: JSON.stringify(after) });
    return success(res, { changeId: id, code: result.code }, `部门创建成功（编码 ${result.code}，已记录变更台账）`);
  }
  return success(res, { changeId: id }, '变更申请已提交，待总经理审批通过后生效');
});

/* ===== 修改部门 ===== */
router.put('/:id(\\d+)', (req, res) => {
  if (!canManage(req.user)) return error(res, 403, '仅超级管理员/总经理/行政部负责人可发起部门变更');
  const d = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!d) return error(res, 404, '部门不存在');
  if (d.status === '停用' && !req.body.status) return error(res, 400, '部门已停用，请先启用后再修改');
  const { name, head, color, icon, headcount, description, founded_at } = req.body;
  const newName = (name || d.name).trim();
  if (!newName) return error(res, 400, '部门名称不能为空');
  if (nameExists(newName, d.id)) return error(res, 400, `部门名称「${newName}」已被其他部门使用（全局重名拦截）`);
  const before = { name: d.name, head: d.head, headcount: d.headcount, description: d.description, founded_at: d.founded_at };
  const after = { name: newName, head: head !== undefined ? head : d.head, color: color || d.color, icon: icon || d.icon, headcount: headcount !== undefined ? headcount : d.headcount, description: description !== undefined ? description : d.description, founded_at: founded_at || d.founded_at, parent_id: d.parent_id };
  const { id, status } = logChange(req.user, '修改', d.id, d.name, before, after);
  if (status === '已生效') {
    applyChange({ change_type: '修改', dept_id: d.id, after_data: JSON.stringify(after) });
    return success(res, { changeId: id }, '部门更新成功（已记录变更台账）');
  }
  return success(res, { changeId: id }, '变更申请已提交，待总经理审批通过后生效');
});

/* ===== 启用/停用 ===== */
router.post('/:id(\\d+)/status', (req, res) => {
  if (!canManage(req.user)) return error(res, 403, '仅超级管理员/总经理/行政部负责人可发起部门变更');
  const d = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!d) return error(res, 404, '部门不存在');
  const target = req.body.status === '停用' ? '停用' : '启用';
  if (target === d.status) return error(res, 400, `部门当前已是「${d.status}」状态`);
  if (target === '停用' && d.parent_id === 0 && deptChildren(d.id) > 0) {
    // 允许停用但提示子部门仍在
  }
  const { id, status } = logChange(req.user, target, d.id, d.name, { status: d.status }, { status: target });
  if (status === '已生效') {
    applyChange({ change_type: target, dept_id: d.id });
    return success(res, { changeId: id }, target === '停用' ? '部门已停用（人员与历史数据保留，禁止新业务流入）' : '部门已启用');
  }
  return success(res, { changeId: id }, '停用/启用申请已提交，待总经理审批通过后生效');
});

/* ===== 删除部门（有员工/子部门禁删） ===== */
router.delete('/:id(\\d+)', (req, res) => {
  if (req.user.role !== '超级管理员' && req.user.role !== '总经理') return error(res, 403, '仅超级管理员/总经理可发起删除');
  const d = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id);
  if (!d) return error(res, 404, '部门不存在');
  const empN = deptEmployees(d.name);
  const childN = deptChildren(d.id);
  if (empN > 0 || childN > 0) {
    return error(res, 400, `该部门仍有在职员工${empN}人/子部门${childN}个，禁止删除，仅可停用（公司管理规定）`);
  }
  const { id, status } = logChange(req.user, '删除', d.id, d.name, { name: d.name, code: d.code }, null);
  if (status === '已生效') {
    applyChange({ change_type: '删除', dept_id: d.id });
    return success(res, { changeId: id }, '空部门已删除（已记录变更台账）');
  }
  return success(res, { changeId: id }, '删除申请已提交，待总经理审批通过后执行');
});

module.exports = router;
