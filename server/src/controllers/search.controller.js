/**
 * 全局搜索控制器（迁移自参考项目 routes/search.js，第39轮 #186）
 * 对齐参考项目业务逻辑：
 *  - 跨模块统一检索，返回结果按模块分组并给出分组计数与总数
 *  - 权限隔离：① 销售类角色只能搜自己的客户与商机（对齐「数据范围按 dataScope 隔离」口径）
 *             ② 所有角色都搜不到他人的文档草稿，只能搜到「已下发」公文 + 本人起草的草稿
 *  - LIKE 通配符转义（% / _），防止关键字含通配符导致全表命中
 * 数据表：employees / customers / contracts / documents / opportunities / bids（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目角色/字段约束）：
 *  1) 参考项目按 dataScope（region + distributor_id）隔离，当前项目 customers 无 region/owner_distributor_id，
 *     只有 owner（负责人姓名）、opportunities 有 sales_id，故按「owner = 本人姓名 / sales_id = 本人员工 id」隔离；
 *  2) 参考项目还搜审批单/公告/厂家/供应商/渠道，当前模块按需求聚焦 员工/客户/合同/文档/商机/投标 六类。
 */
const db = require('../db');
const { ok, bad } = require('../utils/resp');

/** 管理层：可跨范围检索全部客户/商机/合同 */
const MGMT = ['总经理', '副总', '超级管理员', '销售总监'];
/** 销售类角色：客户与商机只搜自己负责的 */
const SALES = ['销售员', '销售代表', '大客户经理', '渠道经理', '区域经理'];

/** LIKE 转义：% _ 前加反斜杠，查询时带 ESCAPE '\' */
const escLike = (s) => String(s || '').replace(/[\\%_]/g, (m) => '\\' + m);
const kwLike = (q) => '%' + escLike(q) + '%';

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

/** 当前登录人的检索范围（前端用于提示与禁用空结果分组） */
async function scope(req, res) {
  const me = empOf(req.user);
  const role = (req.user && req.user.role) || '';
  return res.json(ok({
    role,
    emp_id: me ? me.id : 0,
    emp_name: me ? me.name : '',
    scoped: SALES.includes(role),
    full: MGMT.includes(role),
    modules: ['employee', 'customer', 'contract', 'document', 'opportunity', 'bid'],
  }));
}

/**
 * 跨模块检索
 * GET /search?q=关键字&limit=每类条数(默认5)&types=customer,opportunity
 */
async function search(req, res) {
  const q = String(req.query.q || req.query.keyword || '').trim();
  if (!q) return res.json(ok({ q: '', total: 0, groups: {}, grouped: {}, results: [] }, '请输入搜索关键字'));
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  const only = String(req.query.types || '').split(',').map((s) => s.trim()).filter(Boolean);
  const kw = kwLike(q);
  const me = empOf(req.user);
  const myId = me ? me.id : 0;
  const myName = me ? me.name : (req.user && req.user.name) || '';
  const role = (req.user && req.user.role) || '';
  const isFull = MGMT.includes(role);
  const isSales = SALES.includes(role);

  const results = [];
  const want = (t) => !only.length || only.includes(t);

  // 1. 员工（通讯录：在职员工，全员可搜；只返回必要字段，手机号脱敏）
  if (want('employee')) {
    db.prepare(`SELECT id, emp_no, name, title, role, phone FROM employees
      WHERE status='在职' AND (name LIKE ? ESCAPE '\\' OR emp_no LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
        OR role LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
      ORDER BY id LIMIT ?`).all(kw, kw, kw, kw, kw, limit)
      .forEach((e) => results.push({
        type: 'employee', id: e.id, code: e.emp_no, name: e.name,
        sub: `员工 · ${e.title || '—'}${e.role ? ' · ' + e.role : ''}`,
        extra: e.phone ? String(e.phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '',
        path: '/hr',
      }));
  }

  // 2. 客户（销售类角色仅自己负责的）
  if (want('customer')) {
    let sql = `SELECT id, name, owner, level, status, industry, phone FROM customers
      WHERE (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR IFNULL(industry,'') LIKE ? ESCAPE '\\'
        OR IFNULL(address,'') LIKE ? ESCAPE '\\') AND IFNULL(status,'')!='已删除'`;
    const p = [kw, kw, kw, kw];
    if (isSales) { sql += ' AND owner=?'; p.push(myName); }
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    p.push(limit);
    db.prepare(sql).all(...p).forEach((c) => results.push({
      type: 'customer', id: c.id, code: c.id, name: c.name,
      sub: `客户 · ${c.owner || '未分配'} · ${c.level || '—'}类 · ${c.status || '—'}`,
      extra: c.industry || '', path: '/trade-customer',
    }));
  }

  // 3. 商机（销售类角色仅自己负责的；其余角色全量）
  if (want('opportunity')) {
    let sql = `SELECT o.id, o.opp_no, o.name, o.amount, o.stage, o.region, o.sales_mode,
        c.name cust_name FROM opportunities o
      LEFT JOIN customers c ON CAST(o.customer_id AS TEXT) = c.id
      WHERE (o.name LIKE ? ESCAPE '\\' OR o.opp_no LIKE ? ESCAPE '\\'
        OR IFNULL(c.name,'') LIKE ? ESCAPE '\\' OR IFNULL(o.terminal,'') LIKE ? ESCAPE '\\')`;
    const p = [kw, kw, kw, kw];
    if (isSales) { sql += ' AND o.sales_id=?'; p.push(myId); }
    sql += ' ORDER BY o.amount DESC LIMIT ?';
    p.push(limit);
    db.prepare(sql).all(...p).forEach((o) => results.push({
      type: 'opportunity', id: o.id, code: o.opp_no, name: o.name, amount: o.amount,
      sub: `商机 · ${o.cust_name || '—'} · ${o.stage || '—'}${o.region ? ' · ' + o.region : ''}`,
      extra: o.sales_mode || '', path: '/opportunity',
    }));
  }

  // 4. 合同（销售类角色仅自己创建的）
  if (want('contract')) {
    let sql = `SELECT id, name, customer, amount, status, sign_date, creator FROM contracts
      WHERE (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR IFNULL(customer,'') LIKE ? ESCAPE '\\')`;
    const p = [kw, kw, kw];
    if (isSales) { sql += ' AND creator=?'; p.push(myName); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    p.push(limit);
    db.prepare(sql).all(...p).forEach((c) => results.push({
      type: 'contract', id: c.id, code: c.id, name: c.name, amount: c.amount,
      sub: `合同 · ${c.customer || '—'} · ${c.status || '—'}${c.sign_date ? ' · 签订 ' + c.sign_date.slice(0, 10) : ''}`,
      extra: c.creator || '', path: '/contract',
    }));
  }

  // 5. 文档（他人草稿不可见：仅「已下发」+ 本人起草的草稿）
  if (want('document')) {
    db.prepare(`SELECT id, title, type, author, date, status FROM documents
      WHERE (title LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR IFNULL(content,'') LIKE ? ESCAPE '\\')
        AND (status='已下发' OR author=? OR author_id=?)
      ORDER BY date DESC, id DESC LIMIT ?`).all(kw, kw, kw, myName, String((req.user && req.user.id) || ''), limit)
      .forEach((d) => results.push({
        type: 'document', id: d.id, code: d.id, name: d.title,
        sub: `公文 · ${d.type || '—'} · ${d.author || '—'} · ${(d.date || '').slice(0, 10)}`,
        extra: d.status || '', path: '/documents',
      }));
  }

  // 6. 投标（销售类角色仅自己商机下的投标）
  if (want('bid')) {
    let sql = `SELECT b.id, b.bid_no, b.amount, b.bid_date, b.result, o.name opp_name, o.sales_id
      FROM bids b LEFT JOIN opportunities o ON o.id=b.opp_id
      WHERE (b.bid_no LIKE ? ESCAPE '\\' OR IFNULL(o.name,'') LIKE ? ESCAPE '\\')`;
    const p = [kw, kw];
    if (isSales) { sql += ' AND o.sales_id=?'; p.push(myId); }
    sql += ' ORDER BY b.id DESC LIMIT ?';
    p.push(limit);
    db.prepare(sql).all(...p).forEach((b) => results.push({
      type: 'bid', id: b.id, code: b.bid_no, name: b.opp_name || b.bid_no, amount: b.amount,
      sub: `投标 · ${b.result || '待开标'}${b.bid_date ? ' · ' + String(b.bid_date).slice(0, 10) : ''}`,
      extra: b.bid_no, path: '/bid',
    }));
  }

  // 分组统计 + 分组明细（前端按模块分栏渲染）
  const grouped = {};
  const groups = {};
  results.forEach((x) => {
    groups[x.type] = (groups[x.type] || 0) + 1;
    (grouped[x.type] = grouped[x.type] || []).push(x);
  });
  return res.json(ok({ q, total: results.length, groups, grouped, results, scoped: isSales, full: isFull }));
}

module.exports = { search, scope, SALES, MGMT };
