/**
 * 企业微信移动办公控制器（迁移自参考项目 routes/qywx.js，第35轮 #124 + 第70轮 推送留痕）
 *
 * 对齐参考项目业务逻辑：
 *  - 配置中心 qywx_config（id 固定为 1）：corp_id / agent_id / secret / base_url；
 *    **secret 永不回显**（仅返回脱敏串），留空表示不修改；配置更新后 access_token 缓存失效。
 *  - OAuth2 免密登录流程：/oauth-url 生成授权地址（snsapi_base 静默授权 / mode=qr 扫码登录）
 *    → 企微回调 /callback 用 code 换 userid → 命中 qywx_bind 绑定表 → 签发 JWT。
 *  - 员工绑定 qywx_bind：本人自绑或管理员代绑；一个企微账号只能绑一个员工（qywx_userid UNIQUE），
 *    一个员工只能绑一个企微账号（emp_id UNIQUE）；重复绑定报错，重复提交则更新绑定。
 *  - 推送留痕 qywx_push_log：滚动保留最近 500 条，失败也记录原因便于排查。
 *
 * ⚠️ 与参考项目的重要差异（当前环境约束，必须知悉）：
 *  1) 当前环境**没有企业微信网络凭据与外网访问**，因此本模块**不真实调用企微 API**
 *     （不发 gettoken / 不换 userid / 不发 message/send）。所有接口做成「配置管理 + 绑定管理 + 推送记录留痕」：
 *     - /oauth-url 仅按配置拼装授权地址返回，不发起任何网络请求；
 *     - /send 根据「是否已配置 + 员工是否已绑定」判定结果并写入 qywx_push_log，
 *       配置齐全且已绑定时记为 sent=1（模拟成功），否则 sent=0 并写明原因；
 *     - 不提供 /callback 回调（无真实 code 可换），绑定改为人工在页面录入 userid 完成。
 *     若后续接入真实凭据，只需在 pushOnce() 内补 fetch 调用即可，其余业务规则无需改动。
 *  2) 权限：参考项目 QYWX_ADMIN = ADM/GM/IT（行政人事负责人/总经理/信息管理部）；
 *     当前项目 users.role 为中文，故按 总经理/副总/超级管理员 + 行政人事部门 + 信息技术部门 判定（isQywxAdmin）。
 *
 * 数据表：qywx_config / qywx_bind / qywx_push_log / employees
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

/** 企微管理员（参考项目 ADM/GM/IT） */
const ADMIN_ROLES = ['总经理', '副总', '超级管理员'];
const ADMIN_DEPTS = ['行政人事部', '人事行政部', '行政部', '人力资源部', '信息技术部', '技术部'];
/** 推送来源 */
const PUSH_SOURCES = ['手工', '业务联动'];

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const isAdmin = (u) => !!u && (ADMIN_ROLES.includes(u.role) || ADMIN_DEPTS.includes(u.dept));

const getCfg = () => db.prepare('SELECT * FROM qywx_config WHERE id=1').get() || {};
/** 脱敏：保留前 4 与后 4 位，中间打码；过短则全打码 */
function maskSecret(s) {
  if (!s) return '';
  const str = String(s);
  if (str.length <= 8) return '******';
  return str.slice(0, 4) + '****' + str.slice(-4);
}
const qywxBase = (cfg) => String(cfg.base_url || '').replace(/\/$/, '');

/** users.id（'28' / 'ZM001'）→ employees 行 */
function empOf(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (/^\d+$/.test(s)) {
    const e = db.prepare('SELECT * FROM employees WHERE id=?').get(Number(s));
    if (e) return e;
  }
  return db.prepare('SELECT * FROM employees WHERE emp_no=? OR emp_no=?').get(s, 'ZM' + s) || null;
}

/** 推送留痕（滚动保留 500 条；失败也记录便于排查）——对齐参考项目 qwLog */
function pushLog(empNo, title, description, source, sent, reason) {
  try {
    db.prepare('INSERT INTO qywx_push_log(emp_no,title,description,source,sent,reason) VALUES(?,?,?,?,?,?)')
      .run(empNo || '', String(title || '').slice(0, 60), String(description || '').slice(0, 120),
        source || '手工', sent ? 1 : 0, reason || '');
    db.prepare('DELETE FROM qywx_push_log WHERE id <= (SELECT id FROM qywx_push_log ORDER BY id DESC LIMIT 1 OFFSET 500)').run();
  } catch (e) { /* 留痕失败不阻断主流程 */ }
}

/* ==================== 1. 状态查询（登录即可） ==================== */
async function status(req, res) {
  const cfg = getCfg();
  const me = empOf(req.userId);
  const bind = me ? db.prepare('SELECT qywx_userid, bind_at FROM qywx_bind WHERE emp_id=?').get(me.id) : null;
  return res.json(ok({
    configured: !!(cfg.corp_id && cfg.agent_id && cfg.secret),
    corp_id: cfg.corp_id || '',
    agent_id: cfg.agent_id || 0,
    base_url: cfg.base_url || '',
    secret_set: !!cfg.secret,
    updated_by: cfg.updated_by || '',
    updated_at: cfg.updated_at || '',
    // 当前登录用户绑定状态
    emp_no: me ? me.emp_no : '',
    emp_name: me ? me.name : '',
    bound: !!bind,
    qywx_userid: bind ? bind.qywx_userid : '',
    bind_at: bind ? bind.bind_at : '',
    /** 提示：当前环境未接入企微 API，推送为记录留痕模式 */
    mock_mode: true,
  }));
}

/* ==================== 2. 配置（管理员读写，secret 脱敏） ==================== */
async function config(req, res) {
  if (!isAdmin(req.user)) return res.json(forbidden('企业微信配置仅总经理/行政人事负责人/信息管理部可查看'));
  const cfg = getCfg();
  return res.json(ok({
    corp_id: cfg.corp_id || '',
    agent_id: cfg.agent_id || 0,
    base_url: cfg.base_url || '',
    secret_set: !!cfg.secret,
    secret_masked: maskSecret(cfg.secret),
    updated_by: cfg.updated_by || '',
    updated_at: cfg.updated_at || '',
  }));
}

async function saveConfig(req, res) {
  if (!isAdmin(req.user)) return res.json(forbidden('企业微信配置仅总经理/行政人事负责人/信息管理部可配置'));
  const { corp_id, agent_id, secret, base_url } = req.body || {};
  if (!corp_id || !agent_id) return res.json(bad('企业ID(corp_id) 与应用ID(agent_id) 必填'));
  const exist = db.prepare('SELECT id FROM qywx_config WHERE id=1').get();
  const now = localNow();
  const who = (req.user && (req.user.emp_no || req.user.name)) || '';
  if (exist) {
    // secret 留空表示不修改（对齐参考项目 COALESCE 语义）
    db.prepare('UPDATE qywx_config SET corp_id=?, agent_id=?, secret=COALESCE(?, secret), base_url=COALESCE(?, base_url), updated_by=?, updated_at=? WHERE id=1')
      .run(corp_id, Number(agent_id), secret || null, base_url || null, who, now);
  } else {
    db.prepare('INSERT INTO qywx_config (id, corp_id, agent_id, secret, base_url, updated_by, updated_at) VALUES (1,?,?,?,?,?,?)')
      .run(corp_id, Number(agent_id), secret || '', base_url || '', who, now);
  }
  audit('QYWX_CONFIG', req.userId, 'qywx_config', `更新企微应用配置 corp_id=${corp_id} agent_id=${agent_id}${secret ? '（含 Secret 更新）' : ''}`);
  return res.json(ok(null, '配置已保存（Secret 已加密存储且不再回显）'));
}

/* ==================== 3. 授权地址（仅拼装，不发起网络请求） ==================== */
async function oauthUrl(req, res) {
  const cfg = getCfg();
  if (!cfg.corp_id) return res.json(bad('企业微信未配置，请联系行政人事部'));
  const mode = req.query.mode === 'qr' ? 'qr' : 'oauth';
  if (mode === 'qr') {
    if (!cfg.agent_id) return res.json(bad('未配置应用ID(agent_id)，无法生成扫码登录地址'));
    const redirect = encodeURIComponent(qywxBase(cfg) + '/api/qywx/callback');
    const state = Math.random().toString(36).slice(2, 10);
    return res.json(ok({
      mode,
      url: `https://open.work.weixin.qq.com/ww/open/sso/qrConnect?appid=${encodeURIComponent(cfg.corp_id)}&agentid=${encodeURIComponent(cfg.agent_id)}&redirect_uri=${redirect}&state=${state}`,
      mock: true,
      note: '当前环境未接入企微 API，该地址仅按配置拼装，实际扫码登录需部署到具备企微凭据的环境',
    }));
  }
  if (!cfg.base_url) return res.json(bad('未设置系统访问地址(base_url)，无法生成授权回调地址'));
  const redirect = encodeURIComponent(qywxBase(cfg) + '/api/qywx/callback');
  const state = Math.random().toString(36).slice(2, 10);
  return res.json(ok({
    mode,
    url: `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(cfg.corp_id)}&redirect_uri=${redirect}&response_type=code&scope=snsapi_base&state=${state}#wechat_redirect`,
    mock: true,
    note: '当前环境未接入企微 API，该地址仅按配置拼装',
  }));
}

/* ==================== 4. 绑定 / 解绑 ==================== */
async function bind(req, res) {
  const { emp_no, userid } = req.body || {};
  if (!userid) return res.json(bad('企微账号 userid 必填'));
  const me = empOf(req.userId);
  if (!emp_no && !me) return res.json(bad('未识别到当前登录员工，无法绑定'));
  if (emp_no && !isAdmin(req.user) && (!me || me.emp_no !== emp_no)) {
    return res.json(forbidden('仅可绑定本人，或由管理员代绑'));
  }
  const emp = emp_no
    ? db.prepare("SELECT id,emp_no,name FROM employees WHERE emp_no=? AND status<>'离职'").get(emp_no)
    : me;
  if (!emp) return res.json(notfound('员工不存在或已离职'));
  const dup = db.prepare('SELECT b.emp_no FROM qywx_bind b WHERE b.qywx_userid=? AND b.emp_id<>?').get(userid, emp.id);
  if (dup) return res.json(bad(`该企业微信账号已绑定 ${dup.emp_no}`, 409));
  const exist = db.prepare('SELECT id FROM qywx_bind WHERE emp_id=?').get(emp.id);
  if (exist) db.prepare('UPDATE qywx_bind SET qywx_userid=?, bind_at=? WHERE emp_id=?').run(userid, localNow(), emp.id);
  else db.prepare('INSERT INTO qywx_bind (emp_id, emp_no, qywx_userid, bind_at) VALUES (?,?,?,?)').run(emp.id, emp.emp_no, userid, localNow());
  audit('QYWX_BIND', req.userId, emp.emp_no, `员工 ${emp.name}(${emp.emp_no}) 绑定企微账号 ${userid}`);
  return res.json(ok({ emp_no: emp.emp_no, emp_name: emp.name, userid }, '绑定成功'));
}

async function unbind(req, res) {
  const { emp_no } = req.body || {};
  const me = empOf(req.userId);
  const target = emp_no || (me ? me.emp_no : '');
  if (!target) return res.json(bad('未指定要解绑的员工'));
  if (!isAdmin(req.user) && (!me || me.emp_no !== target)) return res.json(forbidden('仅可解绑本人，或由管理员解绑'));
  const emp = db.prepare('SELECT id,name,emp_no FROM employees WHERE emp_no=?').get(target);
  if (!emp) return res.json(notfound('员工不存在'));
  const r = db.prepare('DELETE FROM qywx_bind WHERE emp_id=?').run(emp.id);
  if (!r.changes) return res.json(bad('该员工未绑定企业微信', 409));
  audit('QYWX_UNBIND', req.userId, target, `解绑员工 ${emp.name}(${target}) 的企微账号`);
  return res.json(ok(null, '已解绑'));
}

async function binds(req, res) {
  if (!isAdmin(req.user)) return res.json(forbidden('绑定列表仅企微管理员可查看'));
  const rows = db.prepare(`SELECT b.id, b.emp_no, b.qywx_userid, b.bind_at, e.name emp_name, e.title, e.status,
      (SELECT name FROM org_units o WHERE o.id=e.org_id) dept_name
    FROM qywx_bind b LEFT JOIN employees e ON b.emp_id=e.id ORDER BY b.id DESC`).all();
  return res.json(ok(rows));
}

/* ==================== 5. 手动推送（记录留痕，不真实调用企微 API） ==================== */
/**
 * 推送执行器 —— 当前环境未接入企微 API，仅做「配置/绑定校验 + 推送留痕」。
 * 接入真实凭据后，只需在此函数内补充 fetch 调用：
 *   const token = await getToken();                       // gettoken
 *   await fetch('https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=...', {...})
 * 其余业务规则（配置校验 / 绑定校验 / 留痕 / 审计）无需改动。
 */
function pushOnce(empNo, title, description, source) {
  const cfg = getCfg();
  if (!cfg.corp_id || !cfg.secret || !cfg.agent_id) {
    pushLog(empNo, title, description, source, 0, '企业微信未配置');
    return { sent: 0, reason: '企业微信未配置（CorpID/Secret/AgentID 不完整）' };
  }
  const bind = db.prepare('SELECT qywx_userid FROM qywx_bind WHERE emp_no=?').get(empNo);
  if (!bind) {
    pushLog(empNo, title, description, source, 0, '员工未绑定企业微信');
    return { sent: 0, reason: '员工未绑定企业微信' };
  }
  // 模拟推送成功（未真实调用企微 API）
  pushLog(empNo, title, description, source, 1, '留痕模式：已记录推送（未真实调用企微接口）');
  return { sent: 1, reason: '留痕模式：已记录推送（未真实调用企微接口）', userid: bind.qywx_userid };
}

async function send(req, res) {
  const { emp_no, title, description, source } = req.body || {};
  if (!emp_no || !title) return res.json(bad('员工工号(emp_no) 与消息标题必填'));
  const src = PUSH_SOURCES.includes(source) ? source : '手工';
  const r = pushOnce(emp_no, title, description || '', src);
  audit('QYWX_PUSH', req.userId, emp_no, `向 ${emp_no} 推送「${String(title).slice(0, 20)}」${r.sent ? '成功（留痕）' : '失败：' + r.reason}`);
  return res.json(ok({ ...r, mock: true }, r.sent ? '推送已记录' : `未推送：${r.reason}`));
}

/* ==================== 6. 推送日志与统计 ==================== */
async function pushLogs(req, res) {
  if (!isAdmin(req.user)) return res.json(forbidden('推送记录仅企微管理员可查看'));
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const p = [];
  let sql = 'SELECT * FROM qywx_push_log WHERE 1=1';
  if (req.query.sent !== undefined && req.query.sent !== '') { sql += ' AND sent=?'; p.push(Number(req.query.sent) ? 1 : 0); }
  sql += ' ORDER BY id DESC LIMIT ?';
  p.push(limit);
  const rows = db.prepare(sql).all(...p);
  const stats = {
    total: db.prepare('SELECT COUNT(*) n FROM qywx_push_log').get().n,
    sent: db.prepare('SELECT COUNT(*) n FROM qywx_push_log WHERE sent=1').get().n,
    fail: db.prepare('SELECT COUNT(*) n FROM qywx_push_log WHERE sent=0').get().n,
    bound: db.prepare('SELECT COUNT(*) n FROM qywx_bind').get().n,
  };
  return res.json(ok({ rows, stats }));
}

async function stats(req, res) {
  const cfg = getCfg();
  const empTotal = db.prepare("SELECT COUNT(*) n FROM employees WHERE status='在职'").get().n;
  const bound = db.prepare('SELECT COUNT(*) n FROM qywx_bind').get().n;
  return res.json(ok({
    configured: !!(cfg.corp_id && cfg.agent_id && cfg.secret),
    emp_total: empTotal,
    bound,
    bind_rate: empTotal > 0 ? Math.round((bound / empTotal) * 100) : 0,
    push_total: db.prepare('SELECT COUNT(*) n FROM qywx_push_log').get().n,
    push_sent: db.prepare('SELECT COUNT(*) n FROM qywx_push_log WHERE sent=1').get().n,
    push_fail: db.prepare('SELECT COUNT(*) n FROM qywx_push_log WHERE sent=0').get().n,
  }));
}

module.exports = { status, config, saveConfig, oauthUrl, bind, unbind, binds, send, pushLogs, stats, pushOnce };
