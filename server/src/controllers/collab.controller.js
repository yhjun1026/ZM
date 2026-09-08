/**
 * 协同办公控制器（迁移自参考项目 routes/collab.js + routes/todo.js）
 * 对齐参考项目业务逻辑：
 *  - 会议室预订：同一会议室在重叠时段不可重复预订（时间冲突检测，字符串比较 HH:MM）
 *  - 日程：同一人同一时段重叠冲突校验；日期格式强校验 YYYY-MM-DD；本人或管理层可改删
 *  - 任务：标题+执行人必填，执行人须在职；进度 0-100，>=100 自动置「已完成」
 *  - 会议纪要：决议逐条自动生成闭环任务（指派给组织者），对齐参考项目「决议任务闭环」
 *  - 个人待办：仅本人可见可操作，内容 ≤200 字，截止日 YYYY-MM-DD，完成写 finished_at
 *  - 委托/补卡/加班：委托生效期内代办；补卡与加班走 待审批→已通过/驳回/已撤销 状态流转
 * 数据表：meeting_rooms / meeting_reservations / meeting_notes / schedules / tasks /
 *        user_todos / delegations / cardfix_reqs / overtime_reqs（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目角色/字段约束）：
 *  1) 参考项目用角色码 GM/VP/ADM/SD/RM 判定权限，当前项目 users.role 为中文，故改用中文角色白名单；
 *  2) 参考项目 req.user.id 即 employees.id，当前项目 users.id 为 TEXT（'28'/'ZM001'），
 *     故用 empOf() 把登录用户映射到 employees 行，写表统一用 employees.id（INTEGER）。
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量与工具 ==================== */
/** 管理层（可代他人改删日程、查看全部任务） */
const MGR = ['总经理', '副总', '超级管理员'];
/** 可查看全部任务的角色（对齐参考项目 GM/VP/SD/RM/ADM） */
const TASK_VIEW = ['总经理', '副总', '销售总监', '区域负责人', '超级管理员', '行政人事部经理', '行政部'];

const SCHED_TYPES = ['个人', '会议', '拜访', '培训'];
const SCHED_STATUS = ['正常', '已取消', '已完成'];
const PRIORITIES = ['高', '中', '普通'];
const TODO_PRIORITIES = ['高', '中', '普通'];
const TASK_STATUS = ['待开始', '进行中', '已完成', '已逾期'];
const ROOM_STATUS = ['可用', '维护中'];
const RESV_STATUS = ['已预约', '已取消', '已结束'];
const DELEG_SCOPE = ['全部', '仅审批'];
const FIX_TYPES = ['上班补卡', '下班补卡'];
const OT_TYPES = ['工作日', '休息日', '法定节假日'];
const COMP_TYPES = ['调休', '加班工资'];
const REQ_STATUS = ['待审批', '已通过', '驳回', '已撤销'];

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const todayStr = () => localNow().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));

/** users.id（'28' / 'ZM001'）→ employees 行；找不到时按 req.user 兜底 */
function empOf(user) {
  if (!user || !user.id) return null;
  const s = String(user.id);
  if (/^\d+$/.test(s)) {
    const e = db.prepare('SELECT * FROM employees WHERE id=?').get(Number(s));
    if (e) return e;
  }
  const e2 = db.prepare('SELECT * FROM employees WHERE emp_no=? OR emp_no=?').get(s, 'ZM' + s);
  if (e2) return e2;
  const e3 = db.prepare('SELECT * FROM employees WHERE name=?').get(user.name);
  if (e3) return e3;
  return { id: /^\d+$/.test(s) ? Number(s) : 0, emp_no: s, name: user.name || '', role: user.role || '', dept: user.dept || '' };
}
const isMgr = (user) => !!user && MGR.includes(user.role);
const canViewAllTask = (user) => !!user && TASK_VIEW.includes(user.role);

/* ==================== 枚举 / 选项 ==================== */
async function options(req, res) {
  const rooms = db.prepare('SELECT * FROM meeting_rooms ORDER BY id').all();
  const employees = db.prepare("SELECT id, emp_no, name, role FROM employees WHERE status='在职' ORDER BY id").all();
  return res.json(ok({
    rooms, employees,
    sched_types: SCHED_TYPES, sched_status: SCHED_STATUS,
    priorities: PRIORITIES, todo_priorities: TODO_PRIORITIES,
    task_status: TASK_STATUS, room_status: ROOM_STATUS, resv_status: RESV_STATUS,
    deleg_scopes: DELEG_SCOPE, fix_types: FIX_TYPES,
    ot_types: OT_TYPES, comp_types: COMP_TYPES, req_status: REQ_STATUS,
  }));
}

/* ==================== 统计卡片 ==================== */
async function stats(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const today = todayStr();
  const one = (sql, ...p) => (db.prepare(sql).get(...p) || {}).n || 0;
  return res.json(ok({
    todo_undone: one('SELECT COUNT(*) n FROM user_todos WHERE emp_id=? AND done=0', myId),
    todo_today: one('SELECT COUNT(*) n FROM user_todos WHERE emp_id=? AND done=0 AND due_date=?', myId, today),
    sched_today: one("SELECT COUNT(*) n FROM schedules WHERE emp_id=? AND sched_date=? AND status!='已取消'", myId, today),
    task_running: one("SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status IN ('待开始','进行中')", myId),
    task_overdue: one("SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status='已逾期'", myId),
    room_total: one('SELECT COUNT(*) n FROM meeting_rooms'),
    room_available: one("SELECT COUNT(*) n FROM meeting_rooms WHERE status='可用'"),
    resv_today: one("SELECT COUNT(*) n FROM meeting_reservations WHERE reserve_date=? AND status='已预约'", today),
    deleg_active: one("SELECT COUNT(*) n FROM delegations WHERE status='生效' AND (from_emp_id=? OR to_emp_id=?)", myId, myId),
    pending_cardfix: one("SELECT COUNT(*) n FROM cardfix_reqs WHERE status='待审批'"),
    pending_overtime: one("SELECT COUNT(*) n FROM overtime_reqs WHERE status='待审批'"),
  }));
}

/* ==================== 1. 会议室台账 ==================== */
async function listRooms(req, res) {
  const rows = db.prepare(`SELECT r.*,
      (SELECT COUNT(*) FROM meeting_reservations v
        WHERE v.room_id=r.id AND v.status='已预约' AND v.reserve_date>=?) today_used
    FROM meeting_rooms r ORDER BY r.id`).all(todayStr());
  return res.json(ok(rows));
}

async function createRoom(req, res) {
  const b = req.body || {};
  if (!b.name) return res.json(bad('会议室名称必填'));
  if (db.prepare('SELECT id FROM meeting_rooms WHERE name=?').get(b.name)) return res.json(bad('该会议室已存在'));
  const info = db.prepare('INSERT INTO meeting_rooms(name,capacity,location,equipment,status) VALUES(?,?,?,?,?)')
    .run(b.name, Number(b.capacity) || 10, b.location || '', b.equipment || '',
      ROOM_STATUS.includes(b.status) ? b.status : '可用');
  audit('COLLAB_ROOM_CREATE', req.userId, `会议室#${info.lastInsertRowid}`, b.name);
  return res.json(ok({ id: info.lastInsertRowid }, '会议室已登记'));
}

async function updateRoom(req, res) {
  const room = db.prepare('SELECT * FROM meeting_rooms WHERE id=?').get(req.params.id);
  if (!room) return res.json(notfound('会议室不存在'));
  const b = req.body || {};
  db.prepare('UPDATE meeting_rooms SET name=?,capacity=?,location=?,equipment=?,status=? WHERE id=?')
    .run(b.name || room.name, Number(b.capacity) || room.capacity,
      b.location !== undefined ? b.location : room.location,
      b.equipment !== undefined ? b.equipment : room.equipment,
      ROOM_STATUS.includes(b.status) ? b.status : room.status, room.id);
  return res.json(ok(null, '会议室已更新'));
}

/* ==================== 2. 会议室预订（核心：时间冲突检测） ==================== */
async function listReservations(req, res) {
  const { date, room_id, status, from, to } = req.query;
  let sql = `SELECT v.*, r.name room_name, r.location room_location
    FROM meeting_reservations v LEFT JOIN meeting_rooms r ON r.id=v.room_id WHERE 1=1`;
  const p = [];
  if (date) { sql += ' AND v.reserve_date=?'; p.push(date); }
  if (room_id) { sql += ' AND v.room_id=?'; p.push(room_id); }
  if (status) { sql += ' AND v.status=?'; p.push(status); }
  if (from) { sql += ' AND v.reserve_date>=?'; p.push(from); }
  if (to) { sql += ' AND v.reserve_date<=?'; p.push(to); }
  sql += ' ORDER BY v.reserve_date DESC, v.start_time ASC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createReservation(req, res) {
  const b = req.body || {};
  const { room_id, subject, reserve_date, start_time, end_time } = b;
  if (!room_id || !subject || !reserve_date || !start_time || !end_time) {
    return res.json(bad('会议室、主题、日期、起止时间均必填'));
  }
  if (!isDate(reserve_date)) return res.json(bad('预订日期格式须为 YYYY-MM-DD'));
  if (!isTime(start_time) || !isTime(end_time)) return res.json(bad('起止时间格式须为 HH:MM'));
  if (String(start_time) >= String(end_time)) return res.json(bad('结束时间须晚于开始时间'));

  const room = db.prepare('SELECT * FROM meeting_rooms WHERE id=?').get(room_id);
  if (!room) return res.json(notfound('会议室不存在'));
  if (room.status !== '可用') return res.json(bad(`会议室「${room.name}」当前${room.status}，不可预订`));
  if (reserve_date < todayStr()) return res.json(bad('不可预订过去的日期'));

  // 时间冲突检测：同一会议室在重叠时段不可重复预订（已取消/已结束不占用时段）
  const clash = db.prepare(`SELECT * FROM meeting_reservations
    WHERE room_id=? AND reserve_date=? AND status='已预约' AND start_time < ? AND end_time > ?`)
    .get(room_id, reserve_date, end_time, start_time);
  if (clash) {
    return res.json(bad(`时间冲突：该会议室 ${reserve_date} ${clash.start_time}-${clash.end_time} 已被「${clash.subject}」（${clash.organizer_name || ''}）占用`));
  }

  const me = empOf(req.user);
  const info = db.prepare(`INSERT INTO meeting_reservations
    (room_id,subject,reserve_date,start_time,end_time,organizer_id,organizer_name,attendees,status)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(room_id, subject, reserve_date, start_time, end_time,
      me ? me.id : 0, me ? me.name : (req.user && req.user.name) || '', b.attendees || '', '已预约');
  audit('COLLAB_RESERVE', req.userId, `会议室#${room_id}`, `${reserve_date} ${start_time}-${end_time} ${subject}`);
  return res.json(ok({ id: info.lastInsertRowid }, '会议室预订成功'));
}

async function cancelReservation(req, res) {
  const v = db.prepare('SELECT * FROM meeting_reservations WHERE id=?').get(req.params.id);
  if (!v) return res.json(notfound('预订不存在'));
  const me = empOf(req.user);
  if (v.organizer_id !== (me ? me.id : -1) && !isMgr(req.user)) return res.json(forbidden('仅预订人或管理层可取消'));
  if (v.status !== '已预约') return res.json(bad(`当前状态「${v.status}」不可取消`));
  db.prepare("UPDATE meeting_reservations SET status='已取消' WHERE id=?").run(v.id);
  audit('COLLAB_RESERVE_CANCEL', req.userId, `预订#${v.id}`, `${v.reserve_date} ${v.subject}`);
  return res.json(ok(null, '已取消预订'));
}

/* ==================== 3. 会议纪要（决议 → 自动生成闭环任务） ==================== */
async function listNotes(req, res) {
  const { reservation_id } = req.query;
  let sql = `SELECT n.*, v.subject resv_subject, v.room_id,
      (SELECT name FROM meeting_rooms r WHERE r.id=v.room_id) room_name
    FROM meeting_notes n LEFT JOIN meeting_reservations v ON v.id=n.reservation_id WHERE 1=1`;
  const p = [];
  if (reservation_id) { sql += ' AND n.reservation_id=?'; p.push(reservation_id); }
  sql += ' ORDER BY n.id DESC LIMIT 200';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createNote(req, res) {
  const b = req.body || {};
  if (!b.subject) return res.json(bad('会议主题必填'));
  if (b.meeting_date && !isDate(b.meeting_date)) return res.json(bad('会议日期格式须为 YYYY-MM-DD'));
  const me = empOf(req.user);
  const info = db.prepare(`INSERT INTO meeting_notes
    (reservation_id,subject,meeting_date,organizer_id,organizer_name,attendees,content,decisions)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(b.reservation_id || null, b.subject, b.meeting_date || todayStr(),
      me ? me.id : 0, me ? me.name : (req.user && req.user.name) || '',
      b.attendees || '', b.content || '', b.decisions || '');
  // 决议 → 自动生成闭环任务（对齐参考项目：每条决议一行，指派给组织者，优先级「高」）
  let taskCount = 0;
  const decisions = String(b.decisions || '').split('\n').map((s) => s.trim()).filter((s) => s.length > 3);
  decisions.forEach((d) => {
    const n = db.prepare('SELECT COUNT(*) c FROM tasks').get().c + 1;
    db.prepare(`INSERT INTO tasks(task_no,title,descr,assigner_id,assigner_name,assignee_id,assignee_name,priority,due_date,biz_type,biz_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(`TK${todayStr().replace(/-/g, '')}${String(n).padStart(4, '0')}`,
        `[决议] ${d.slice(0, 50)}`, `会议纪要 #${info.lastInsertRowid} 决议跟进`,
        me ? me.id : 0, me ? me.name : '', me ? me.id : 0, me ? me.name : '',
        '高', b.due_date || null, '会议纪要', info.lastInsertRowid);
    taskCount++;
  });
  audit('COLLAB_NOTE_CREATE', req.userId, `会议纪要#${info.lastInsertRowid}`, `${b.subject}（决议 ${taskCount} 条 → 任务）`);
  return res.json(ok({ id: info.lastInsertRowid, tasks: taskCount }, `纪要已保存，生成 ${taskCount} 条决议任务`));
}

/* ==================== 4. 日程 ==================== */
async function listSchedules(req, res) {
  const { date, month, emp_id } = req.query;
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  // 本人日程 + 共享给我的日程（attendees 含我的姓名）——对齐参考项目口径
  let sql = 'SELECT * FROM schedules WHERE (emp_id=? OR attendees LIKE ?)';
  const p = [myId, `%${(me && me.name) || ''}%`];
  if (date) { sql += ' AND sched_date=?'; p.push(date); }
  if (month) { sql += ' AND sched_date LIKE ?'; p.push(String(month) + '%'); }
  if (emp_id) { sql += ' AND emp_id=?'; p.push(emp_id); }
  sql += ' ORDER BY sched_date DESC, start_time IS NULL, start_time ASC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createSchedule(req, res) {
  const b = req.body || {};
  const { title, sched_date, start_time, end_time } = b;
  if (!title || !sched_date) return res.json(bad('日程标题与日期必填'));
  if (!isDate(sched_date)) return res.json(bad('日期格式须为 YYYY-MM-DD'));
  if (start_time && !isTime(start_time)) return res.json(bad('开始时间格式须为 HH:MM'));
  if (end_time && !isTime(end_time)) return res.json(bad('结束时间格式须为 HH:MM'));
  if (start_time && end_time && String(start_time) >= String(end_time)) return res.json(bad('结束时间须晚于开始时间'));

  const me = empOf(req.user);
  const empId = b.emp_id ? Number(b.emp_id) : (me ? me.id : 0);
  // 同一人同一时段重叠冲突校验（对齐参考项目）
  if (start_time && end_time) {
    const clash = db.prepare(`SELECT * FROM schedules
      WHERE emp_id=? AND sched_date=? AND status='正常' AND start_time < ? AND end_time > ?`)
      .get(empId, sched_date, end_time, start_time);
    if (clash) return res.json(bad(`与日程[${clash.title}](${clash.start_time}-${clash.end_time})时间冲突`));
  }
  const info = db.prepare(`INSERT INTO schedules(emp_id,emp_name,title,sched_date,start_time,end_time,type,location,remind,attendees,remark)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(empId, me ? me.name : (req.user && req.user.name) || '', title, sched_date,
      start_time || null, end_time || null, SCHED_TYPES.includes(b.type) ? b.type : '个人',
      b.location || '', Number(b.remind) || 0, b.attendees || '', b.remark || '');
  audit('COLLAB_SCHEDULE_CREATE', req.userId, `日程#${info.lastInsertRowid}`, `${sched_date} ${start_time || ''} ${title}`);
  return res.json(ok({ id: info.lastInsertRowid }, '日程已创建'));
}

async function updateSchedule(req, res) {
  const s = db.prepare('SELECT * FROM schedules WHERE id=?').get(req.params.id);
  if (!s) return res.json(notfound('日程不存在'));
  const me = empOf(req.user);
  if (s.emp_id !== (me ? me.id : -1) && !isMgr(req.user)) return res.json(forbidden('仅本人或管理层可修改'));
  // 009 的 schedules 无 done/finished_at 列（参考项目后续迭代补的），完成状态落在 status='已完成'
  let status = SCHED_STATUS.includes(b.status) ? b.status : s.status;
  if (b.done !== undefined) status = b.done ? '已完成' : '正常';
  db.prepare('UPDATE schedules SET title=?, status=?, remark=? WHERE id=?')
    .run(b.title || s.title, status, b.remark !== undefined ? b.remark : s.remark, s.id);
  const act = b.done !== undefined ? (b.done ? '标记日程完成' : '取消日程完成') : '修改日程';
  audit('COLLAB_SCHEDULE_UPDATE', req.userId, `日程#${s.id}`, `${act}：${s.sched_date} ${s.title}`);
  return res.json(ok({ done: status === '已完成' ? 1 : 0, status }, '日程已更新'));
}

async function removeSchedule(req, res) {
  const s = db.prepare('SELECT * FROM schedules WHERE id=?').get(req.params.id);
  if (!s) return res.json(notfound('日程不存在'));
  const me = empOf(req.user);
  if (s.emp_id !== (me ? me.id : -1) && !isMgr(req.user)) return res.json(forbidden('仅本人或管理层可删除'));
  db.prepare('DELETE FROM schedules WHERE id=?').run(s.id);
  audit('COLLAB_SCHEDULE_DELETE', req.userId, `日程#${s.id}`, `${s.sched_date} ${s.title}`);
  return res.json(ok(null, '日程已删除'));
}

/** 日程智能提醒：到达提醒时间后写站内信（对齐参考项目 /schedules/check-reminders） */
async function checkReminders(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const nowD = new Date();
  const today = todayStr();
  const curMin = nowD.getHours() * 60 + nowD.getMinutes();
  // 009 无 remind_sent 列，用 messages 去重（同 biz_type/biz_id 不重复推送）
  const rows = db.prepare(`SELECT * FROM schedules
    WHERE emp_id=? AND sched_date=? AND remind>0 AND COALESCE(status,'正常') NOT IN ('已取消','已完成')`).all(myId, today);
  const notified = [];
  rows.forEach((s) => {
    if (!s.start_time) return;
    const [h, m] = String(s.start_time).split(':').map(Number);
    const startMin = (h || 0) * 60 + (m || 0);
    if (startMin - s.remind <= curMin) {
      // 已提醒过的用 messages 去重（同 biz_type/biz_id 不重复推送）
      const dup = db.prepare("SELECT id FROM messages WHERE to_emp_id=? AND biz_type='日程' AND biz_id=?").get(myId, s.id);
      if (!dup) {
        db.prepare(`INSERT INTO messages(msg_type,title,content,biz_type,biz_id,from_emp_id,from_name,to_emp_id,to_name)
          VALUES('系统',?,?,'日程',?,?,?,?,?)`)
          .run(`日程提醒：${s.title}`,
            `您于 ${s.start_time} 有「${s.type || '个人'}」日程：${s.title}${s.location ? '，地点：' + s.location : ''}。`,
            s.id, 0, '系统', myId, me ? me.name : '');
      }
      notified.push({ id: s.id, title: s.title, start_time: s.start_time, remind: s.remind });
    }
  });
  if (notified.length) {
    audit('COLLAB_REMIND', req.userId, '日程提醒', `${today} 触发 ${notified.length} 条`);
  }
  return res.json(ok({ notified }));
}

/* ==================== 5. 任务 ==================== */
async function listTasks(req, res) {
  const { mine, status, q } = req.query;
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const p = [];
  if (mine === '1' || !canViewAllTask(req.user)) {
    sql += ' AND (assignee_id=? OR assigner_id=?)'; p.push(myId, myId);
  }
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (q) { sql += ' AND (title LIKE ? OR task_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY (due_date IS NULL), due_date ASC, id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createTask(req, res) {
  const b = req.body || {};
  if (!b.title || !b.assignee_id) return res.json(bad('任务标题与执行人必填'));
  const to = db.prepare("SELECT id,name FROM employees WHERE id=? AND status='在职'").get(Number(b.assignee_id));
  if (!to) return res.json(notfound('执行人不存在或已离职'));
  if (b.due_date && !isDate(b.due_date)) return res.json(bad('截止日格式须为 YYYY-MM-DD'));
  const me = empOf(req.user);
  const n = db.prepare('SELECT COUNT(*) c FROM tasks').get().c + 1;
  const task_no = `TK${todayStr().replace(/-/g, '')}${String(n).padStart(4, '0')}`;
  const info = db.prepare(`INSERT INTO tasks(task_no,title,descr,assigner_id,assigner_name,assignee_id,assignee_name,priority,due_date,biz_type,biz_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(task_no, b.title, b.descr || '', me ? me.id : 0, me ? me.name : '', to.id, to.name,
      PRIORITIES.includes(b.priority) ? b.priority : '普通', b.due_date || null, b.biz_type || null, b.biz_id || null);
  audit('COLLAB_TASK_CREATE', req.userId, task_no, `${b.title} → ${to.name}`);
  return res.json(ok({ id: info.lastInsertRowid, task_no }, '任务已指派'));
}

async function updateTaskProgress(req, res) {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('任务不存在'));
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  if (t.assignee_id !== myId && t.assigner_id !== myId && !isMgr(req.user)) {
    return res.json(forbidden('仅执行人/指派人/管理层可更新'));
  }
  const b = req.body || {};
  const pr = Math.max(0, Math.min(100, Number(b.progress !== undefined ? b.progress : t.progress) || 0));
  let st = b.status || (pr >= 100 ? '已完成' : pr > 0 ? '进行中' : '待开始');
  if (!TASK_STATUS.includes(st)) st = pr >= 100 ? '已完成' : '进行中';
  db.prepare('UPDATE tasks SET progress=?, status=? WHERE id=?').run(pr, st, t.id);
  audit('COLLAB_TASK_PROGRESS', req.userId, t.task_no, `${t.title} ${pr}% ${st}`);
  return res.json(ok({ progress: pr, status: st }, '进度已更新'));
}

/* ==================== 6. 个人待办（对齐参考项目 routes/todo.js） ==================== */
async function listTodos(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const limit = req.query.limit === 'all' ? 200 : 50;
  const rows = db.prepare(`SELECT id, content, priority, due_date, done, created_at, finished_at
    FROM user_todos WHERE emp_id=?
    ORDER BY done ASC, CASE WHEN due_date IS NULL OR due_date='' THEN 1 ELSE 0 END ASC, due_date ASC, id DESC
    LIMIT ?`).all(myId, limit);
  return res.json(ok(rows));
}

async function todoStats(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const one = (sql, ...p) => (db.prepare(sql).get(...p) || {}).n || 0;
  return res.json(ok({
    total: one('SELECT COUNT(*) n FROM user_todos WHERE emp_id=?', myId),
    undone: one('SELECT COUNT(*) n FROM user_todos WHERE emp_id=? AND done=0', myId),
    done: one('SELECT COUNT(*) n FROM user_todos WHERE emp_id=? AND done=1', myId),
    overdue: one("SELECT COUNT(*) n FROM user_todos WHERE emp_id=? AND done=0 AND due_date<>'' AND due_date IS NOT NULL AND due_date<?", myId, todayStr()),
    today: one('SELECT COUNT(*) n FROM user_todos WHERE emp_id=? AND done=0 AND due_date=?', myId, todayStr()),
  }));
}

async function createTodo(req, res) {
  const content = String((req.body || {}).content || '').trim();
  if (!content) return res.json(bad('待办内容不能为空'));
  if (content.length > 200) return res.json(bad('待办内容过长（≤200字）'));
  const b = req.body || {};
  const priority = TODO_PRIORITIES.includes(b.priority) ? b.priority : '普通';
  const due_date = String(b.due_date || '').trim();
  if (due_date && !isDate(due_date)) return res.json(bad('截止日格式应为 YYYY-MM-DD'));
  const me = empOf(req.user);
  const info = db.prepare('INSERT INTO user_todos(emp_id,content,priority,due_date) VALUES(?,?,?,?)')
    .run(me ? me.id : 0, content, priority, due_date || null);
  audit('TODO_CREATE', req.userId, `待办#${info.lastInsertRowid}`, content.slice(0, 50));
  return res.json(ok({ id: info.lastInsertRowid }, '待办已添加'));
}

async function updateTodo(req, res) {
  const row = db.prepare('SELECT * FROM user_todos WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('待办不存在'));
  const me = empOf(req.user);
  if (row.emp_id !== (me ? me.id : -1)) return res.json(forbidden('仅本人可修改自己的待办'));
  const b = req.body || {};
  // 仅传 done = 完成/取消完成快捷切换
  if (b.done !== undefined && Object.keys(b).length === 1) {
    const done = b.done ? 1 : 0;
    db.prepare('UPDATE user_todos SET done=?, finished_at=? WHERE id=?').run(done, done ? localNow() : null, row.id);
    audit('TODO_TOGGLE', req.userId, `待办#${row.id}`, `${done ? '完成' : '重开'}：${row.content.slice(0, 50)}`);
    return res.json(ok({ done }, done ? '已完成' : '已重开'));
  }
  const content = String(b.content !== undefined ? b.content : row.content).trim();
  if (!content) return res.json(bad('待办内容不能为空'));
  if (content.length > 200) return res.json(bad('待办内容过长（≤200字）'));
  const priority = b.priority !== undefined ? (TODO_PRIORITIES.includes(b.priority) ? b.priority : '普通') : row.priority;
  const due_date = b.due_date !== undefined ? String(b.due_date || '').trim() : (row.due_date || '');
  if (due_date && !isDate(due_date)) return res.json(bad('截止日格式应为 YYYY-MM-DD'));
  db.prepare('UPDATE user_todos SET content=?, priority=?, due_date=? WHERE id=?')
    .run(content, priority, due_date || null, row.id);
  audit('TODO_UPDATE', req.userId, `待办#${row.id}`, content.slice(0, 50));
  return res.json(ok(null, '待办已更新'));
}

async function removeTodo(req, res) {
  const row = db.prepare('SELECT * FROM user_todos WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('待办不存在'));
  const me = empOf(req.user);
  if (row.emp_id !== (me ? me.id : -1)) return res.json(forbidden('仅本人可删除自己的待办'));
  db.prepare('DELETE FROM user_todos WHERE id=?').run(row.id);
  audit('TODO_DELETE', req.userId, `待办#${row.id}`, row.content.slice(0, 50));
  return res.json(ok(null, '待办已删除'));
}

/* ==================== 7. 委托 ==================== */
async function listDelegations(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  let sql = 'SELECT * FROM delegations WHERE 1=1';
  const p = [];
  if (!isMgr(req.user)) { sql += ' AND (from_emp_id=? OR to_emp_id=?)'; p.push(myId, myId); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...p).map((d) => Object.assign({}, d, {
    expired: d.end_date ? d.end_date < todayStr() : false,
  }));
  return res.json(ok(rows));
}

async function createDelegation(req, res) {
  const b = req.body || {};
  const { to_emp_id, start_date, end_date } = b;
  if (!to_emp_id || !start_date || !end_date) return res.json(bad('受托人、起止日期必填'));
  if (!isDate(start_date) || !isDate(end_date)) return res.json(bad('日期格式须为 YYYY-MM-DD'));
  if (start_date > end_date) return res.json(bad('结束日期不能早于开始日期'));
  const to = db.prepare("SELECT id,name FROM employees WHERE id=? AND status='在职'").get(Number(to_emp_id));
  if (!to) return res.json(notfound('受托人不存在或已离职'));
  const me = empOf(req.user);
  if (to.id === (me ? me.id : -1)) return res.json(bad('不能委托给自己'));
  // 同一委托人生效期内的委托不重复建立
  const dup = db.prepare("SELECT id FROM delegations WHERE from_emp_id=? AND status='生效' AND end_date>=?").get(me ? me.id : 0, todayStr());
  if (dup) return res.json(bad('您已存在生效中的委托，请先停用后再新建'));
  const info = db.prepare(`INSERT INTO delegations(from_emp_id,from_emp_name,to_emp_id,to_emp_name,start_date,end_date,scope,status)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(me ? me.id : 0, me ? me.name : '', to.id, to.name, start_date, end_date,
      DELEG_SCOPE.includes(b.scope) ? b.scope : '全部', '生效');
  audit('COLLAB_DELEGATE', req.userId, `委托#${info.lastInsertRowid}`, `${start_date}~${end_date} 委托给 ${to.name}`);
  return res.json(ok({ id: info.lastInsertRowid }, '委托已生效'));
}

async function updateDelegation(req, res) {
  const d = db.prepare('SELECT * FROM delegations WHERE id=?').get(req.params.id);
  if (!d) return res.json(notfound('委托不存在'));
  const me = empOf(req.user);
  if (d.from_emp_id !== (me ? me.id : -1) && !isMgr(req.user)) return res.json(forbidden('仅委托人本人或管理层可停用'));
  const status = (req.body || {}).status === '生效' ? '生效' : '已停用';
  db.prepare('UPDATE delegations SET status=? WHERE id=?').run(status, d.id);
  audit('COLLAB_DELEGATE_STOP', req.userId, `委托#${d.id}`, `${status}`);
  return res.json(ok(null, `委托已${status === '生效' ? '恢复' : '停用'}`));
}

/* ==================== 8. 补卡申请 ==================== */
async function listCardfix(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  let sql = 'SELECT * FROM cardfix_reqs WHERE 1=1';
  const p = [];
  const status = req.query.status;
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (!isMgr(req.user) && req.query.all !== '1') { sql += ' AND emp_id=?'; p.push(myId); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createCardfix(req, res) {
  const b = req.body || {};
  if (!b.work_date || !b.reason) return res.json(bad('补卡日期与事由必填'));
  if (!isDate(b.work_date)) return res.json(bad('补卡日期格式须为 YYYY-MM-DD'));
  if (b.work_date > todayStr()) return res.json(bad('不能为未来日期补卡'));
  const me = empOf(req.user);
  const n = db.prepare('SELECT COUNT(*) c FROM cardfix_reqs').get().c + 1;
  const cf_no = `BK${todayStr().replace(/-/g, '')}${String(n).padStart(3, '0')}`;
  const info = db.prepare(`INSERT INTO cardfix_reqs(cf_no,emp_id,emp_name,dept_name,work_date,fix_type,expect_time,reason,status,applied_at)
    VALUES(?,?,?,?,?,?,?,?,'待审批',?)`)
    .run(cf_no, me ? me.id : 0, me ? me.name : '', (req.user && req.user.dept) || '', b.work_date,
      FIX_TYPES.includes(b.fix_type) ? b.fix_type : '上班补卡', b.expect_time || '', b.reason, localNow());
  audit('CARD_FIX_APPLY', req.userId, cf_no, `${b.work_date} ${b.fix_type || '上班补卡'}：${String(b.reason).slice(0, 40)}`);
  return res.json(ok({ id: info.lastInsertRowid, cf_no }, '补卡申请已提交，待审批'));
}

async function updateCardfix(req, res) {
  const row = db.prepare('SELECT * FROM cardfix_reqs WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('补卡申请不存在'));
  const b = req.body || {};
  const me = empOf(req.user);
  const isOwner = row.emp_id === (me ? me.id : -1);
  // 撤销：仅本人且仍在待审批；审批：仅管理层
  if (b.status === '已撤销') {
    if (!isOwner) return res.json(forbidden('仅申请人本人可撤销'));
    if (row.status !== '待审批') return res.json(bad('仅待审批的申请可撤销'));
  } else if (['已通过', '驳回'].includes(b.status)) {
    if (!isMgr(req.user)) return res.json(forbidden('仅管理层可审批补卡申请'));
    if (row.status !== '待审批') return res.json(bad('该申请已审结，不可重复审批'));
  } else {
    return res.json(bad('状态不合法'));
  }
  db.prepare('UPDATE cardfix_reqs SET status=? WHERE id=?').run(b.status, row.id);
  audit('CARD_FIX_REVIEW', req.userId, row.cf_no, `${row.status} → ${b.status} ${b.comment || ''}`);
  return res.json(ok(null, `已置为「${b.status}」`));
}

/* ==================== 9. 加班申请 ==================== */
async function listOvertime(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  let sql = 'SELECT * FROM overtime_reqs WHERE 1=1';
  const p = [];
  if (req.query.status) { sql += ' AND status=?'; p.push(req.query.status); }
  if (!isMgr(req.user) && req.query.all !== '1') { sql += ' AND emp_id=?'; p.push(myId); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createOvertime(req, res) {
  const b = req.body || {};
  if (!b.ot_date || !b.reason) return res.json(bad('加班日期与事由必填'));
  if (!isDate(b.ot_date)) return res.json(bad('加班日期格式须为 YYYY-MM-DD'));
  const hours = Number(b.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return res.json(bad('加班时长须为 0-24 之间的小时数'));
  const me = empOf(req.user);
  const n = db.prepare('SELECT COUNT(*) c FROM overtime_reqs').get().c + 1;
  const ot_no = `JB${todayStr().replace(/-/g, '')}${String(n).padStart(3, '0')}`;
  const info = db.prepare(`INSERT INTO overtime_reqs(ot_no,emp_id,emp_name,dept_name,ot_date,start_time,end_time,hours,ot_type,comp_type,reason,status,applied_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'待审批',?)`)
    .run(ot_no, me ? me.id : 0, me ? me.name : '', (req.user && req.user.dept) || '', b.ot_date,
      b.start_time || '', b.end_time || '', Math.round(hours * 10) / 10,
      OT_TYPES.includes(b.ot_type) ? b.ot_type : '工作日',
      COMP_TYPES.includes(b.comp_type) ? b.comp_type : '调休', b.reason, localNow());
  audit('OVERTIME_APPLY', req.userId, ot_no, `${b.ot_date} ${hours}h：${String(b.reason).slice(0, 40)}`);
  return res.json(ok({ id: info.lastInsertRowid, ot_no }, '加班申请已提交，待审批'));
}

async function updateOvertime(req, res) {
  const row = db.prepare('SELECT * FROM overtime_reqs WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('加班申请不存在'));
  const b = req.body || {};
  const me = empOf(req.user);
  const isOwner = row.emp_id === (me ? me.id : -1);
  if (b.status === '已撤销') {
    if (!isOwner) return res.json(forbidden('仅申请人本人可撤销'));
    if (row.status !== '待审批') return res.json(bad('仅待审批的申请可撤销'));
  } else if (['已通过', '驳回'].includes(b.status)) {
    if (!isMgr(req.user)) return res.json(forbidden('仅管理层可审批加班申请'));
    if (row.status !== '待审批') return res.json(bad('该申请已审结，不可重复审批'));
  } else {
    return res.json(bad('状态不合法'));
  }
  db.prepare('UPDATE overtime_reqs SET status=? WHERE id=?').run(b.status, row.id);
  audit('OVERTIME_REVIEW', req.userId, row.ot_no, `${row.status} → ${b.status} ${b.comment || ''}`);
  return res.json(ok(null, `已置为「${b.status}」`));
}

module.exports = {
  options, stats,
  listRooms, createRoom, updateRoom,
  listReservations, createReservation, cancelReservation,
  listNotes, createNote,
  listSchedules, createSchedule, updateSchedule, removeSchedule, checkReminders,
  listTasks, createTask, updateTaskProgress,
  listTodos, todoStats, createTodo, updateTodo, removeTodo,
  listDelegations, createDelegation, updateDelegation,
  listCardfix, createCardfix, updateCardfix,
  listOvertime, createOvertime, updateOvertime,
};
