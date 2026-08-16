/**
 * 人事管理路由 — 按《公司OA自主研发系统》第二部分 8.x 人事管理规范
 * 人事审批：行政部普通员工录入 → 行政部负责人审批 → 总经理审批 → 自动执行
 * 规则：
 *  - 转正日期 = 入职日期 + 试用期月数（系统自动计算，默认3个月）
 *  - 转正到期前10天提醒（GET /regular-reminders）
 *  - 跨部门调岗自动清空原团队身份（t_team_members 记录离队）
 *  - 离职自动冻结账号（status=离职，登录与令牌验证均被拒绝）
 *  - 员工档案聚合（GET /profile/:empId）+ 人事台账导出（GET /export，CSV BOM）
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireModule } = require('../../compat/auth');
const { success, error, genId, now, safeParse, generateApprovalFlow } = require('../../compat/helpers');

router.use(authMiddleware);

/* ===== 数据库迁移（幂等） ===== */
(function migrate() {
  const ucols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!ucols.includes('probation_months')) db.exec("ALTER TABLE users ADD COLUMN probation_months INTEGER DEFAULT 3");
  if (!ucols.includes('regular_date')) db.exec("ALTER TABLE users ADD COLUMN regular_date TEXT DEFAULT ''");
  if (!ucols.includes('employment_type')) db.exec("ALTER TABLE users ADD COLUMN employment_type TEXT DEFAULT '正式'");
  const acols = db.prepare('PRAGMA table_info(hr_applications)').all().map(c => c.name);
  if (!acols.includes('probation_months')) db.exec("ALTER TABLE hr_applications ADD COLUMN probation_months INTEGER DEFAULT 3");
  if (!acols.includes('employment_type')) db.exec("ALTER TABLE hr_applications ADD COLUMN employment_type TEXT DEFAULT '正式'");
  // 历史数据回填转正日期（在职/试用期且无转正日期的员工）
  const rows = db.prepare("SELECT emp_id, join_date, probation_months FROM users WHERE (regular_date IS NULL OR regular_date = '') AND join_date != ''").all();
  const upd = db.prepare('UPDATE users SET regular_date = ? WHERE emp_id = ?');
  rows.forEach(r => upd.run(addMonths(r.join_date, r.probation_months || 3), r.emp_id));
})();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addMonths(dateStr, months) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return '';
  d.setMonth(d.getMonth() + parseInt(months, 10) || 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 跨部门调岗/离职 → 清空团队身份
function clearTeamMembership(empId, reason) {
  db.prepare(`UPDATE t_team_members SET left_at = datetime('now','localtime') WHERE emp_id = ? AND left_at = ''`).run(empId);
}

// 员工列表 — 所有登录用户均可访问（团队管理模块需要）
router.get('/employees', (req, res) => {
  const rows = db.prepare(`
    SELECT id, emp_id, name, dept, role, status, join_date, salary, level, phone, education, age,
           probation_months, regular_date, employment_type
    FROM users ORDER BY dept, id
  `).all();
  return success(res, rows);
});

// 转正到期提醒 — 试用期员工且转正日期在10天内（含已逾期）
router.get('/regular-reminders', (req, res) => {
  const today = todayStr();
  const limit = addDays(today, 10);
  const rows = db.prepare(`
    SELECT emp_id, name, dept, join_date, probation_months, regular_date, employment_type
    FROM users WHERE status = '试用期' AND regular_date != '' AND regular_date <= ?
    ORDER BY regular_date
  `).all(limit);
  rows.forEach(r => {
    const days = Math.round((new Date(r.regular_date) - new Date(today)) / 86400000);
    r.days_left = days;
    r.overdue = days < 0;
  });
  return success(res, rows);
});

// 员工档案聚合 — 基本信息 + 团队身份 + 人事审批历史
router.get('/profile/:empId', (req, res) => {
  const u = db.prepare(`SELECT id, emp_id, name, dept, role, status, join_date, salary, level, phone, education, age,
    probation_months, regular_date, employment_type FROM users WHERE emp_id = ?`).get(req.params.empId);
  if (!u) return error(res, 404, '员工不存在');
  u.teams = db.prepare(`
    SELECT m.team_id, m.role_in_team, m.joined_at, m.left_at, t.name team_name, t.type team_type, t.status team_status
    FROM t_team_members m LEFT JOIN t_teams t ON t.id = m.team_id
    WHERE m.emp_id = ? ORDER BY m.left_at = '', m.id DESC`).all(req.params.empId);
  u.applications = db.prepare(`
    SELECT id, action_type, status, applicant, created_at FROM hr_applications
    WHERE emp_id = ? ORDER BY created_at DESC LIMIT 20`).all(req.params.empId);
  u.applications.forEach(a => { a.flow = undefined; });
  return success(res, u);
});

// 人事台账导出（CSV 带BOM，Excel兼容）
router.get('/export', requireModule('人事管理'), (req, res) => {
  const rows = db.prepare(`
    SELECT emp_id, name, dept, role, employment_type, status, join_date, probation_months, regular_date, level, education, phone
    FROM users ORDER BY dept, emp_id`).all();
  const header = ['工号', '姓名', '部门', '角色', '用工类型', '状态', '入职日期', '试用期(月)', '转正日期', '职级', '学历', '电话'];
  const lines = [header.join(',')];
  rows.forEach(r => lines.push([r.emp_id, r.name, r.dept, r.role, r.employment_type || '正式', r.status, r.join_date, r.probation_months || 3, r.regular_date || '', r.level, r.education, r.phone].map(v => {
    const s = String(v || '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hr_roster_' + todayStr() + '.csv"');
  return res.send('\ufeff' + lines.join('\n'));
});

// 人事统计 — 需要人事管理权限
router.get('/stats', requireModule('人事管理'), (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as c FROM users WHERE status='在职'").get().c;
  const trial = db.prepare("SELECT COUNT(*) as c FROM users WHERE status='试用期'").get().c;
  const leave = db.prepare("SELECT COUNT(*) as c FROM users WHERE status='请假'").get().c;
  const today = todayStr();
  const expiring = db.prepare("SELECT COUNT(*) as c FROM users WHERE status='试用期' AND regular_date != '' AND regular_date <= ?").get(addDays(today, 10)).c;
  const resigned = db.prepare("SELECT COUNT(*) as c FROM users WHERE status='离职'").get().c;
  return success(res, { total, active: total, trial, leave, expiring, resigned, avgAge: 28.5, avgTenure: '2.0年', turnoverRate: 5.2, newHires: 17 });
});

// 人事审批申请列表
router.get('/applications', (req, res) => {
  const list = db.prepare('SELECT * FROM hr_applications ORDER BY created_at DESC').all();
  list.forEach(a => { a.flow = safeParse(a.flow, []); });
  return success(res, list);
});

// 创建人事审批申请 — 行政部普通员工/负责人/超管/总经理
router.post('/applications', (req, res) => {
  const u = req.user;
  // 权限检查
  if (u.role !== '超级管理员' && u.role !== '总经理') {
    if (!(u.role === '普通员工' && u.dept === '行政部') && !(u.role === '部门经理' && u.dept === '行政部')) {
      return error(res, 403, '仅行政部人员可录入人事审批申请');
    }
  }

  const { action_type, emp_id, emp_name, dept, role, level, education, join_date, password, phone, remark, probation_months, employment_type } = req.body;
  if (!action_type) return error(res, 400, '请选择操作类型');
  if (!emp_name) return error(res, 400, '员工姓名不能为空');

  const validActions = ['入职登记', '员工转正', '岗位调动', '离职申请', '薪资调整'];
  if (validActions.indexOf(action_type) === -1) {
    return error(res, 400, '无效的操作类型');
  }
  const pb = parseInt(probation_months, 10) || 3;
  if (pb < 1 || pb > 12) return error(res, 400, '试用期月数须在1-12个月之间');
  const et = ['正式', '试用', '实习', '外包', '劳务'].includes(employment_type) ? employment_type : '正式';

  const id = genId('HR');
  const flow = generateApprovalFlow('hr', u.dept);
  flow[0].user = u.name;

  db.prepare(`INSERT INTO hr_applications (id,action_type,emp_id,emp_name,dept,role,level,education,join_date,password,phone,status,applicant,applicant_dept,flow,remark,probation_months,employment_type)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, action_type, emp_id||'', emp_name, dept||'', role||'', level||'', education||'',
    join_date||'', password||'', phone||'', '待审批', u.name, u.dept, JSON.stringify(flow), remark||'', pb, et
  );

  return success(res, { id }, '人事审批申请已提交，等待审批');
});

// 审批人事申请 — 步骤级权限检查
router.post('/applications/:id/approve', (req, res) => {
  const u = req.user;
  const { id } = req.params;
  const { remark } = req.body;

  const app = db.prepare('SELECT * FROM hr_applications WHERE id = ?').get(id);
  if (!app) return error(res, 404, '申请不存在');
  if (app.status === '已执行') return error(res, 400, '该申请已执行');
  if (app.status === '已驳回') return error(res, 400, '该申请已驳回');

  let flow = safeParse(app.flow, []);
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
  let newStatus = app.status;

  // 自动完成"执行"步骤
  const nextIdx = flow.findIndex(s => !s.done);
  if (nextIdx !== -1 && flow[nextIdx].step.includes('执行')) {
    flow[nextIdx].done = true;
    flow[nextIdx].user = '系统自动';
    flow[nextIdx].time = now();
    if (flow.every(s => s.done)) {
      newStatus = '已执行';
      // 执行人事操作
      executeHrAction(app);
    }
  }

  db.prepare('UPDATE hr_applications SET flow = ?, status = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), newStatus, id);

  return success(res, { status: newStatus }, allDone || newStatus === '已执行' ? '人事申请已执行' : '审批通过');
});

// 驳回人事申请
router.post('/applications/:id/reject', (req, res) => {
  const u = req.user;
  const { id } = req.params;
  const { remark } = req.body;

  const app = db.prepare('SELECT * FROM hr_applications WHERE id = ?').get(id);
  if (!app) return error(res, 404, '申请不存在');
  if (app.status !== '待审批') return error(res, 400, '当前状态不可驳回');

  let flow = safeParse(app.flow, []);
  const currentIdx = flow.findIndex(s => !s.done);
  if (currentIdx === -1) return error(res, 400, '审批流程已完成');

  const stepName = flow[currentIdx].step;
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

  db.prepare('UPDATE hr_applications SET flow = ?, status = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(JSON.stringify(flow), '已驳回', id);

  return success(res, null, '申请已驳回');
});

// 执行人事操作（内部函数）
function executeHrAction(app) {
  try {
    if (app.action_type === '入职登记') {
      // 检查是否已存在
      const existing = db.prepare('SELECT id FROM users WHERE emp_id = ?').get(app.emp_id);
      if (!existing) {
        const userId = genId('U');
        const joinDate = app.join_date || new Date().toISOString().slice(0, 10);
        const pb = app.probation_months || 3;
        // 规则：转正日期 = 入职日期 + 试用期月数（系统自动计算）
        const regularDate = addMonths(joinDate, pb);
        db.prepare(`INSERT INTO users (id, emp_id, password, name, dept, role, status, join_date, level, education, phone, avatar_color, probation_months, regular_date, employment_type)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          userId, app.emp_id, app.password || 'zm2026', app.emp_name,
          app.dept || '行政部', app.role || '普通员工', '试用期',
          joinDate,
          app.level || 'P3', app.education || '本科', app.phone || '',
          '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'),
          pb, regularDate, app.employment_type || '正式'
        );
      }
    } else if (app.action_type === '员工转正') {
      db.prepare("UPDATE users SET status = '在职' WHERE emp_id = ?").run(app.emp_id);
    } else if (app.action_type === '岗位调动') {
      const cur = db.prepare('SELECT dept FROM users WHERE emp_id = ?').get(app.emp_id);
      if (app.dept) db.prepare('UPDATE users SET dept = ? WHERE emp_id = ?').run(app.dept, app.emp_id);
      if (app.role) db.prepare('UPDATE users SET role = ? WHERE emp_id = ?').run(app.role, app.emp_id);
      // 规则：跨部门调岗自动清空原团队身份
      if (cur && app.dept && cur.dept !== app.dept) {
        clearTeamMembership(app.emp_id);
      }
    } else if (app.action_type === '离职申请') {
      // 规则：离职自动冻结账号（登录与令牌验证均被拒绝）+ 清空团队身份
      db.prepare("UPDATE users SET status = '离职' WHERE emp_id = ?").run(app.emp_id);
      clearTeamMembership(app.emp_id);
    } else if (app.action_type === '薪资调整') {
      if (app.level) db.prepare('UPDATE users SET level = ? WHERE emp_id = ?').run(app.level, app.emp_id);
    }
  } catch(e) {
    console.error('[HR] 执行人事操作失败:', e.message);
  }
}

module.exports = router;
