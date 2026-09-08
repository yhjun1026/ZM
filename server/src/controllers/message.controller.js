/**
 * 消息中心控制器（迁移自参考项目 routes/message.js）
 * 对齐参考项目业务逻辑：
 *  - 消息列表：本人收件箱（to_emp_id = 本人 employees.id），支持按类型/业务分类/关键词检索 + 真 SQL 分页
 *  - 未读：单条标记已读、批量已读、按类型批量已读、全部已读（仅本人消息）
 *  - 统计：总数/未读/按类型分布（供角标与消息维护面板）
 *  - 推送接口：/push 供其它模块（审批/合同/协调中心/日程提醒…）写入消息，落 messages 并镜像到 notifications
 * 数据表：messages（列名是 biz_type / biz_id，不是 ref_type）/ notifications（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目角色/字段约束）：
 *  1) 参考项目待办/已办/抄送三类是审批流动态聚合视图，当前项目审批单为独立表且口径不同，
 *     本模块聚焦 messages 真实消息表，待办类业务由各业务模块推送写入；
 *  2) 参考项目 req.user.id 即 employees.id，当前项目 users.id 为 TEXT，故用 empOf() 映射；
 *  3) 推送时同步写 notifications（user_id 为 users.id TEXT），使顶栏通知与消息中心一致。
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

/** messages.msg_type 白名单（对齐参考项目 notify() 的取值） */
const MSG_TYPES = ['待办', '已办', '抄送', '系统', '站内信'];
/** messages.biz_type 业务分类（关联业务类型） */
const BIZ_TYPES = ['审批', '请假', '公告', '会议', '任务', '汇报', '合同', '商机', '投标', '回款', '日程', '业务协调', '站内信'];
const CLEAN_TYPES = ['站内信', '系统']; // 可批量已读/清理的真实消息类型（动态聚合类不可）

/* ==================== 工具 ==================== */
/** users.id（'28' / 'ZM001'）→ employees 行 */
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
  return { id: /^\d+$/.test(s) ? Number(s) : 0, emp_no: s, name: user.name || '', role: user.role || '' };
}

/** employees.id → users.id（TEXT），用于镜像写 notifications；找不到返回 null */
function userIdOfEmp(empId) {
  if (!empId) return null;
  const byId = db.prepare('SELECT id FROM users WHERE id=?').get(String(empId));
  if (byId) return byId.id;
  const emp = db.prepare('SELECT emp_no, name FROM employees WHERE id=?').get(Number(empId));
  if (!emp) return null;
  const byNo = db.prepare('SELECT id FROM users WHERE emp_id=?').get(emp.emp_no);
  if (byNo) return byNo.id;
  const byName = db.prepare('SELECT id FROM users WHERE name=?').get(emp.name);
  return byName ? byName.id : null;
}

/**
 * 写一条消息（内部共用）：落 messages，并镜像到 notifications
 * @returns {number|null} messages.id
 */
function pushMessage({ msg_type, title, content, biz_type, biz_id, to_emp_id, from_emp_id, from_name }) {
  const to = db.prepare('SELECT id, name FROM employees WHERE id=?').get(Number(to_emp_id));
  if (!to) return null;
  const info = db.prepare(`INSERT INTO messages(msg_type,title,content,biz_type,biz_id,from_emp_id,from_name,to_emp_id,to_name)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(msg_type || '系统', title, content || '', biz_type || null, biz_id || null,
      from_emp_id || null, from_name || null, to.id, to.name);
  const uid = userIdOfEmp(to.id);
  if (uid) {
    db.prepare('INSERT INTO notifications(user_id,title,content,type,link) VALUES(?,?,?,?,?)')
      .run(uid, title, content || '', biz_type ? 'info' : 'info', biz_type ? `/${biz_type}` : '');
  }
  return info.lastInsertRowid;
}

/* ==================== 列表 / 统计 ==================== */
/** 我的消息列表：type（msg_type 或 未读/全部）、biz_type、keyword、分页 */
async function list(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const { type, biz_type, keyword } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(5, parseInt(req.query.pageSize, 10) || 20));

  let where = ' WHERE m.to_emp_id=?';
  const p = [myId];
  if (type === '未读') where += ' AND m.is_read=0';
  else if (type && type !== '全部' && MSG_TYPES.includes(type)) { where += ' AND m.msg_type=?'; p.push(type); }
  if (biz_type) { where += ' AND m.biz_type=?'; p.push(biz_type); }
  if (keyword) {
    where += ' AND (m.title LIKE ? OR m.content LIKE ?)';
    p.push(`%${keyword}%`, `%${keyword}%`);
  }
  const from = ' FROM messages m' + where;
  const total = (db.prepare(`SELECT COUNT(*) n${from}`).get(...p) || {}).n || 0;
  const rows = db.prepare(`SELECT m.*${from} ORDER BY m.is_read ASC, m.id DESC LIMIT ? OFFSET ?`)
    .all(...p, pageSize, (page - 1) * pageSize);
  return res.json(ok({
    total, rows, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)),
  }));
}

/** 未读数统计（顶栏角标） */
async function unreadCount(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const one = (sql) => (db.prepare(sql).get(myId) || {}).n || 0;
  const unread = one('SELECT COUNT(*) n FROM messages WHERE to_emp_id=? AND is_read=0');
  const todo = one("SELECT COUNT(*) n FROM messages WHERE to_emp_id=? AND is_read=0 AND msg_type='待办'");
  return res.json(ok({ unread, todo, total: unread + todo }));
}

/** 收件箱统计：总数/未读/按类型分布（对齐参考项目 /messages/stats） */
async function stats(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const one = (sql, ...p) => (db.prepare(sql).get(...p) || {}).n || 0;
  const byType = db.prepare(`SELECT msg_type, COUNT(*) total, SUM(CASE WHEN is_read=0 THEN 1 ELSE 0 END) unread
    FROM messages WHERE to_emp_id=? GROUP BY msg_type ORDER BY unread DESC, total DESC`).all(myId)
    .map((x) => ({ msg_type: x.msg_type, total: x.total, unread: x.unread || 0 }));
  const byBiz = db.prepare(`SELECT biz_type, COUNT(*) total, SUM(CASE WHEN is_read=0 THEN 1 ELSE 0 END) unread
    FROM messages WHERE to_emp_id=? GROUP BY biz_type ORDER BY total DESC`).all(myId)
    .map((x) => ({ biz_type: x.biz_type || '未分类', total: x.total, unread: x.unread || 0 }));
  return res.json(ok({
    total: one('SELECT COUNT(*) n FROM messages WHERE to_emp_id=?', myId),
    unread: one('SELECT COUNT(*) n FROM messages WHERE to_emp_id=? AND is_read=0', myId),
    read: one('SELECT COUNT(*) n FROM messages WHERE to_emp_id=? AND is_read=1', myId),
    byType, byBiz,
  }));
}

/** 枚举：消息类型 / 业务分类（合并库内已有取值，避免硬编码遗漏） */
async function types(req, res) {
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const usedMsg = db.prepare('SELECT DISTINCT msg_type t FROM messages WHERE to_emp_id=?').all(myId).map((x) => x.t).filter(Boolean);
  const usedBiz = db.prepare('SELECT DISTINCT biz_type t FROM messages WHERE to_emp_id=?').all(myId).map((x) => x.t).filter(Boolean);
  return res.json(ok({
    msg_types: Array.from(new Set([...MSG_TYPES, ...usedMsg])),
    biz_types: Array.from(new Set([...BIZ_TYPES, ...usedBiz])),
    clean_types: CLEAN_TYPES,
  }));
}

/* ==================== 已读 / 删除 ==================== */
async function markRead(req, res) {
  const me = empOf(req.user);
  const m = db.prepare('SELECT * FROM messages WHERE id=? AND to_emp_id=?').get(req.params.id, me ? me.id : 0);
  if (!m) return res.json(notfound('消息不存在'));
  db.prepare('UPDATE messages SET is_read=1 WHERE id=?').run(m.id);
  return res.json(ok(null, '已标记为已读'));
}

async function readAll(req, res) {
  const me = empOf(req.user);
  const n = db.prepare('UPDATE messages SET is_read=1 WHERE to_emp_id=? AND is_read=0').run(me ? me.id : 0).changes;
  return res.json(ok({ affected: n }, `已标记 ${n} 条为已读`));
}

/** 批量已读（仅本人消息，越权 id 自动跳过） */
async function readBatch(req, res) {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.json(bad('请传入消息 id 数组'));
  const me = empOf(req.user);
  const stmt = db.prepare('UPDATE messages SET is_read=1 WHERE id=? AND to_emp_id=?');
  let affected = 0;
  for (const id of ids) affected += stmt.run(Number(id), me ? me.id : 0).changes;
  return res.json(ok({ affected }, `已标记 ${affected} 条为已读`));
}

/** 按业务分类批量已读 */
async function readByBizType(req, res) {
  const { biz_type } = req.body || {};
  if (!biz_type) return res.json(bad('biz_type 必填'));
  const me = empOf(req.user);
  const n = db.prepare('UPDATE messages SET is_read=1 WHERE to_emp_id=? AND biz_type=? AND is_read=0')
    .run(me ? me.id : 0, biz_type).changes;
  return res.json(ok({ affected: n }, `「${biz_type}」类已读 ${n} 条`));
}

async function remove(req, res) {
  const me = empOf(req.user);
  const m = db.prepare('SELECT * FROM messages WHERE id=? AND to_emp_id=?').get(req.params.id, me ? me.id : 0);
  if (!m) return res.json(notfound('消息不存在或无权删除'));
  db.prepare('DELETE FROM messages WHERE id=?').run(m.id);
  audit('MESSAGE_DELETE', req.userId, `消息#${m.id}`, `删除「${String(m.title).slice(0, 30)}」`);
  return res.json(ok(null, '消息已删除'));
}

/** 清理历史消息：默认只清 30 天前已读，天数下限 7 天，单次上限 5000 条 */
async function cleanup(req, res) {
  const b = req.body || {};
  const days = Math.max(parseInt(b.days, 10) || 30, 7);
  const limit = Math.min(parseInt(b.limit, 10) || 5000, 5000);
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const n = db.prepare(`DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE to_emp_id=? AND is_read=1
        AND created_at < datetime('now','localtime',?)
      ORDER BY id LIMIT ?)`).run(myId, `-${days} days`, limit).changes;
  audit('MESSAGE_CLEANUP', req.userId, '清理历史消息', `清理 ${days} 天前已读消息 ${n} 条`);
  return res.json(ok({ affected: n, days }, `已清理 ${n} 条`));
}

/* ==================== 发送 / 推送 ==================== */
/** 发起站内信（可多人，逗号分隔） */
async function create(req, res) {
  const b = req.body || {};
  const { to_emp_id, title, content, biz_type, biz_id } = b;
  if (!to_emp_id || !title) return res.json(bad('收件人与标题必填'));
  const ids = String(to_emp_id).split(',').map((s) => s.trim()).filter(Boolean);
  const me = empOf(req.user);
  let count = 0;
  for (const id of ids) {
    const mid = pushMessage({
      msg_type: '站内信', title, content,
      biz_type: biz_type || '站内信', biz_id: biz_id || null,
      to_emp_id: Number(id), from_emp_id: me ? me.id : null, from_name: me ? me.name : '',
    });
    if (mid) count++;
  }
  if (!count) return res.json(bad('收件人不存在，消息未发送'));
  audit('MESSAGE_SEND', req.userId, '发送站内信', `发给[${ids.join(',')}]：${String(title).slice(0, 40)}`);
  return res.json(ok({ count }, `已发送给 ${count} 人`));
}

/**
 * 消息推送接口（供其它模块调用，如审批流转、合同评审、协调中心联动、日程提醒）
 * body: { msg_type, title, content, biz_type, biz_id, to_emp_id | to_emp_ids }
 */
async function push(req, res) {
  const b = req.body || {};
  const { title, content, biz_type, biz_id } = b;
  if (!title) return res.json(bad('消息标题必填'));
  const targets = String(b.to_emp_ids || b.to_emp_id || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!targets.length) return res.json(bad('收件人 to_emp_id / to_emp_ids 必填'));
  const msgType = MSG_TYPES.includes(b.msg_type) ? b.msg_type : '系统';
  const me = empOf(req.user);
  const sent = [];
  for (const id of targets) {
    const mid = pushMessage({
      msg_type: msgType, title, content,
      biz_type: biz_type || null, biz_id: biz_id || null,
      to_emp_id: Number(id), from_emp_id: me ? me.id : null, from_name: me ? me.name : '系统',
    });
    if (mid) sent.push(mid);
  }
  if (!sent.length) return res.json(bad('收件人不存在，消息未推送'));
  audit('MESSAGE_PUSH', req.userId, '消息推送', `${biz_type || '系统'}：${String(title).slice(0, 40)} → ${targets.join(',')}`);
  return res.json(ok({ ids: sent, count: sent.length }, `已推送 ${sent.length} 条`));
}

module.exports = {
  list, unreadCount, stats, types,
  markRead, readAll, readBatch, readByBizType, remove, cleanup,
  create, push, pushMessage, empOf, userIdOfEmp,
};
