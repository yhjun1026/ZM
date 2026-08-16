/**
 * 团队管理路由 — 按《公司OA自主研发系统》第二部分 4.x 团队管理规范
 * 规则：
 *  - 跨部门团队：t_teams(常设/临时/项目) + t_team_members(跨部门抽调成员快照)
 *  - 临时团队：到期前7天预警；到期自动暂停（列表访问时自动检查）
 *  - 解散需审批：总经理/超管直达生效；其他管理层 → t_team_changes 待总经理审批
 *  - 成员管理：从在职员工中抽调（跨部门），移除记录离队时间；已解散/已暂停团队禁止增员
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, now } = require('../../compat/helpers');

router.use(authMiddleware);

/* ===== 数据库迁移（幂等） ===== */
(function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS t_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '常设',
    dept_id INTEGER DEFAULT 0,
    dept_name TEXT DEFAULT '',
    leader_emp TEXT DEFAULT '',
    leader_name TEXT DEFAULT '',
    purpose TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    expire_date TEXT DEFAULT '',
    status TEXT DEFAULT '运作中',
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    dissolved_at TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    user_id INTEGER DEFAULT 0,
    emp_id TEXT DEFAULT '',
    user_name TEXT DEFAULT '',
    dept TEXT DEFAULT '',
    role_in_team TEXT DEFAULT '成员',
    joined_at TEXT DEFAULT (datetime('now','localtime')),
    left_at TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS t_team_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_type TEXT NOT NULL,
    team_id INTEGER DEFAULT 0,
    team_name TEXT DEFAULT '',
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

/* ===== 工具函数 ===== */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function canManage(u) {
  return ['超级管理员', '总经理'].includes(u.role) || (u.role === '部门经理' && u.dept === '行政部');
}

function canOperate(u, team) {
  if (canManage(u)) return true;
  if (!team || !team.leader_emp) return false;
  const me = db.prepare('SELECT emp_id FROM users WHERE id = ?').get(u.id);
  return !!me && me.emp_id === team.leader_emp;
}

// 生命周期引擎：临时团队到期自动暂停（幂等，列表访问时触发）
function autoLifecycle() {
  const today = todayStr();
  db.prepare("UPDATE t_teams SET status='已暂停', updated_at=datetime('now','localtime') WHERE type='临时' AND status='运作中' AND expire_date != '' AND expire_date < ?").run(today);
}

// 附加展示字段：成员数、剩余天数、预警标记
function decorate(team) {
  const t = { ...team };
  t.member_count = db.prepare("SELECT COUNT(*) n FROM t_team_members WHERE team_id = ? AND left_at = ''").get(team.id).n;
  if (t.type === '临时' && t.expire_date && t.status === '运作中') {
    const days = Math.round((new Date(t.expire_date) - new Date(todayStr())) / 86400000);
    t.days_left = days;
    t.expiring = days <= 7; // 到期前7天预警
  } else {
    t.days_left = null;
    t.expiring = false;
  }
  return t;
}

function buildFlow(u) {
  const nowStr = now();
  if (['超级管理员', '总经理'].includes(u.role)) {
    return [
      { step: '发起解散', user: u.name, time: nowStr, done: true, remark: '高级权限直接生效' },
      { step: '总经理审批', user: u.name, time: nowStr, done: true, remark: '自动通过' }
    ];
  }
  return [
    { step: '发起解散', user: u.name, time: nowStr, done: true, remark: '' },
    { step: '总经理审批', user: '', time: '—', done: false, remark: '' }
  ];
}

function nameExists(name, excludeId) {
  const row = db.prepare("SELECT COUNT(*) n FROM t_teams WHERE name = ? AND status != '已解散' AND id != ?").get(name, excludeId || 0);
  return row.n > 0;
}

/* ===== 团队列表（含生命周期自动检查） ===== */
router.get('/', (req, res) => {
  autoLifecycle();
  const { type, status, keyword } = req.query;
  let sql = 'SELECT * FROM t_teams WHERE 1=1';
  const args = [];
  if (type) { sql += ' AND type = ?'; args.push(type); }
  if (status) { sql += ' AND status = ?'; args.push(status); }
  if (keyword) { sql += ' AND (name LIKE ? OR purpose LIKE ?)'; args.push('%' + keyword + '%', '%' + keyword + '%'); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...args).map(decorate);
  return success(res, rows);
});

router.get('/stats', (req, res) => {
  autoLifecycle();
  const total = db.prepare("SELECT COUNT(*) n FROM t_teams WHERE status != '已解散'").get().n;
  const running = db.prepare("SELECT COUNT(*) n FROM t_teams WHERE status = '运作中'").get().n;
  const paused = db.prepare("SELECT COUNT(*) n FROM t_teams WHERE status = '已暂停'").get().n;
  const dissolved = db.prepare("SELECT COUNT(*) n FROM t_teams WHERE status = '已解散'").get().n;
  const expiring = db.prepare("SELECT COUNT(*) n FROM t_teams WHERE type='临时' AND status='运作中' AND expire_date != '' AND expire_date >= ? AND expire_date <= date(?, '+7 day')").get(todayStr(), todayStr()).n;
  return success(res, { total, running, paused, dissolved, expiring });
});

router.get('/changes', (req, res) => {
  const rows = db.prepare('SELECT * FROM t_team_changes ORDER BY created_at DESC LIMIT 200').all();
  rows.forEach(r => { r.approval_flow = safeParse(r.approval_flow, []); r.before_data = safeParse(r.before_data, {}); r.after_data = safeParse(r.after_data, {}); });
  return success(res, rows);
});

/* ===== 团队详情（含成员名单） ===== */
router.get('/:id(\\d+)', (req, res) => {
  autoLifecycle();
  const team = db.prepare('SELECT * FROM t_teams WHERE id = ?').get(req.params.id);
  if (!team) return error(res, 404, '团队不存在');
  const t = decorate(team);
  t.members = db.prepare("SELECT * FROM t_team_members WHERE team_id = ? ORDER BY left_at = '', id").all(team.id);
  return success(res, t);
});

/* ===== 创建团队 ===== */
router.post('/', (req, res) => {
  if (!canManage(req.user)) return error(res, 403, '仅超级管理员/总经理/行政部负责人可创建团队');
  const { name, type, dept_id, dept_name, leader_emp, purpose, start_date, expire_date, status } = req.body;
  if (!name || !name.trim()) return error(res, 400, '团队名称不能为空');
  const t = ['常设', '临时', '项目'].includes(type) ? type : '常设';
  if (t === '临时') {
    if (!expire_date) return error(res, 400, '临时团队必须设置到期日');
    if (expire_date < todayStr()) return error(res, 400, '临时团队到期日不能早于今天');
  }
  if (nameExists(name.trim())) return error(res, 400, `团队名称「${name.trim()}」已存在（重名拦截）`);
  let leaderName = '';
  if (leader_emp) {
    const lu = db.prepare('SELECT name FROM users WHERE emp_id = ?').get(leader_emp);
    if (!lu) return error(res, 400, `负责人工号 ${leader_emp} 不存在`);
    leaderName = lu.name;
  }
  const info = db.prepare('INSERT INTO t_teams (name,type,dept_id,dept_name,leader_emp,leader_name,purpose,start_date,expire_date,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(name.trim(), t, dept_id || 0, dept_name || '', leader_emp || '', leaderName, purpose || '', start_date || todayStr(), expire_date || '', ['筹备中', '运作中'].includes(status) ? status : '运作中', req.user.name);
  // 负责人自动入队
  if (leader_emp) {
    const lu = db.prepare('SELECT * FROM users WHERE emp_id = ?').get(leader_emp);
    db.prepare('INSERT INTO t_team_members (team_id,user_id,emp_id,user_name,dept,role_in_team) VALUES (?,?,?,?,?,?)')
      .run(info.lastInsertRowid, lu.id, lu.emp_id, lu.name, lu.dept, '负责人');
  }
  return success(res, { id: info.lastInsertRowid }, '团队创建成功');
});

/* ===== 修改团队 ===== */
router.put('/:id(\\d+)', (req, res) => {
  const team = db.prepare('SELECT * FROM t_teams WHERE id = ?').get(req.params.id);
  if (!team) return error(res, 404, '团队不存在');
  if (!canOperate(req.user, team)) return error(res, 403, '仅超级管理员/总经理/行政部负责人/团队负责人可修改');
  if (team.status === '已解散') return error(res, 400, '团队已解散，禁止修改');
  const { name, type, purpose, expire_date, start_date } = req.body;
  const newName = (name || team.name).trim();
  if (!newName) return error(res, 400, '团队名称不能为空');
  if (nameExists(newName, team.id)) return error(res, 400, `团队名称「${newName}」已被使用（重名拦截）`);
  const newType = ['常设', '临时', '项目'].includes(type) ? type : team.type;
  let newExpire = expire_date !== undefined ? expire_date : team.expire_date;
  if (newType === '临时') {
    if (!newExpire) return error(res, 400, '临时团队必须设置到期日');
    if (newExpire < todayStr()) return error(res, 400, '临时团队到期日不能早于今天');
  }
  db.prepare(`UPDATE t_teams SET name=?, type=?, purpose=?, start_date=COALESCE(NULLIF(?,''),start_date), expire_date=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(newName, newType, purpose !== undefined ? purpose : team.purpose, start_date || '', newType === '临时' ? newExpire : '', team.id);
  return success(res, null, '团队信息已更新');
});

/* ===== 成员管理：添加（跨部门抽调） ===== */
router.post('/:id(\\d+)/members', (req, res) => {
  const team = db.prepare('SELECT * FROM t_teams WHERE id = ?').get(req.params.id);
  if (!team) return error(res, 404, '团队不存在');
  if (!canOperate(req.user, team)) return error(res, 403, '仅团队负责人或管理员可添加成员');
  if (team.status === '已解散') return error(res, 400, '团队已解散，禁止添加成员');
  if (team.status === '已暂停') return error(res, 400, '团队已暂停，禁止添加成员，请先恢复运作');
  const { emp_id, role_in_team } = req.body;
  if (!emp_id) return error(res, 400, '请指定员工工号');
  const user = db.prepare('SELECT * FROM users WHERE emp_id = ?').get(emp_id);
  if (!user) return error(res, 400, `工号 ${emp_id} 不存在`);
  if (user.status === '离职') return error(res, 400, `${user.name} 已离职，禁止加入团队`);
  const dup = db.prepare("SELECT COUNT(*) n FROM t_team_members WHERE team_id = ? AND emp_id = ? AND left_at = ''").get(team.id, emp_id);
  if (dup.n > 0) return error(res, 400, `${user.name} 已是该团队成员`);
  db.prepare('INSERT INTO t_team_members (team_id,user_id,emp_id,user_name,dept,role_in_team) VALUES (?,?,?,?,?,?)')
    .run(team.id, user.id, user.emp_id, user.name, user.dept, role_in_team || '成员');
  return success(res, null, `成员「${user.name}」（${user.dept}）已加入团队`);
});

/* ===== 成员管理：移除（记录离队时间） ===== */
router.delete('/:id(\\d+)/members/:memberId(\\d+)', (req, res) => {
  const team = db.prepare('SELECT * FROM t_teams WHERE id = ?').get(req.params.id);
  if (!team) return error(res, 404, '团队不存在');
  if (!canOperate(req.user, team)) return error(res, 403, '仅团队负责人或管理员可移除成员');
  if (team.status === '已解散') return error(res, 400, '团队已解散，成员已全部离队');
  const m = db.prepare("SELECT * FROM t_team_members WHERE id = ? AND team_id = ? AND left_at = ''").get(req.params.memberId, team.id);
  if (!m) return error(res, 404, '成员记录不存在或已离队');
  db.prepare("UPDATE t_team_members SET left_at = datetime('now','localtime') WHERE id = ?").run(m.id);
  return success(res, null, `成员「${m.user_name}」已移出团队`);
});

/* ===== 恢复运作（已暂停 → 运作中，临时团队需到期日在未来） ===== */
router.post('/:id(\\d+)/resume', (req, res) => {
  if (!canManage(req.user)) return error(res, 403, '仅超级管理员/总经理/行政部负责人可恢复团队运作');
  const team = db.prepare('SELECT * FROM t_teams WHERE id = ?').get(req.params.id);
  if (!team) return error(res, 404, '团队不存在');
  if (team.status !== '已暂停') return error(res, 400, `团队当前状态为「${team.status}」，无需恢复`);
  if (team.type === '临时' && team.expire_date && team.expire_date < todayStr()) {
    return error(res, 400, '临时团队到期日已过期，请先修改到期日（延期）后再恢复运作');
  }
  db.prepare("UPDATE t_teams SET status='运作中', updated_at=datetime('now','localtime') WHERE id=?").run(team.id);
  return success(res, null, '团队已恢复运作');
});

/* ===== 解散团队（需审批） ===== */
router.post('/:id(\\d+)/dissolve', (req, res) => {
  const team = db.prepare('SELECT * FROM t_teams WHERE id = ?').get(req.params.id);
  if (!team) return error(res, 404, '团队不存在');
  if (!canOperate(req.user, team)) return error(res, 403, '仅团队负责人或管理员可发起解散');
  if (team.status === '已解散') return error(res, 400, '团队已解散，无需重复操作');
  const flow = buildFlow(req.user);
  const status = flow.every(s => s.done) ? '已生效' : '待审批';
  const info = db.prepare('INSERT INTO t_team_changes (change_type,team_id,team_name,before_data,after_data,approval_flow,status,applicant) VALUES (?,?,?,?,?,?,?,?)')
    .run('解散', team.id, team.name, JSON.stringify({ status: team.status, member_count: db.prepare("SELECT COUNT(*) n FROM t_team_members WHERE team_id=? AND left_at=''").get(team.id).n }), JSON.stringify({ status: '已解散' }), JSON.stringify(flow), status, req.user.name);
  if (status === '已生效') {
    applyDissolve(team.id);
    return success(res, { changeId: info.lastInsertRowid }, '团队已解散（成员全部离队，已记录台账）');
  }
  return success(res, { changeId: info.lastInsertRowid }, '解散申请已提交，待总经理审批');
});

function applyDissolve(teamId) {
  db.prepare("UPDATE t_team_members SET left_at = datetime('now','localtime') WHERE team_id = ? AND left_at = ''").run(teamId);
  db.prepare("UPDATE t_teams SET status='已解散', dissolved_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?").run(teamId);
}

/* ===== 解散审批 ===== */
router.post('/changes/:id/approve', (req, res) => {
  if (!['超级管理员', '总经理'].includes(req.user.role)) return error(res, 403, '仅总经理及以上可审批团队解散');
  const ch = db.prepare('SELECT * FROM t_team_changes WHERE id = ?').get(req.params.id);
  if (!ch) return error(res, 404, '审批记录不存在');
  if (ch.status !== '待审批') return error(res, 400, '该申请已处理（' + ch.status + '）');
  let flow = safeParse(ch.approval_flow, []);
  flow.forEach(s => { if (!s.done) { s.done = true; s.user = req.user.name; s.time = now(); } });
  applyDissolve(ch.team_id);
  db.prepare("UPDATE t_team_changes SET status='已生效', approval_flow=?, approver=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(flow), req.user.name, ch.id);
  return success(res, null, '解散申请已审批通过，团队已解散');
});

router.post('/changes/:id/reject', (req, res) => {
  if (!['超级管理员', '总经理'].includes(req.user.role)) return error(res, 403, '仅总经理及以上可审批团队解散');
  const ch = db.prepare('SELECT * FROM t_team_changes WHERE id = ?').get(req.params.id);
  if (!ch) return error(res, 404, '审批记录不存在');
  if (ch.status !== '待审批') return error(res, 400, '该申请已处理');
  const { remark } = req.body;
  if (!remark || !remark.trim()) return error(res, 400, '驳回必须填写意见');
  let flow = safeParse(ch.approval_flow, []);
  const idx = flow.findIndex(s => !s.done);
  if (idx !== -1) { flow[idx].user = req.user.name; flow[idx].time = now(); flow[idx].remark = '驳回：' + remark.trim(); }
  db.prepare("UPDATE t_team_changes SET status='已驳回', approval_flow=?, approver=?, remark=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(JSON.stringify(flow), req.user.name, remark.trim(), ch.id);
  return success(res, null, '解散申请已驳回，团队继续运作');
});

module.exports = router;
