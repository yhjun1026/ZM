/**
 * 资料档案中心控制器（迁移自参考项目 routes/archive.js，第42/43轮口径）
 * 对齐参考项目业务逻辑：
 *  - 五类档案（客户/厂家/供应商/渠道/经销商）统一在档案中心查看；厂家/渠道由市场部统一录入
 *  - 厂家/渠道资料审批准入制：录入即草稿 + 自动发起资料审批，通过后生效（草稿/已驳回可直改）
 *  - 已生效档案的修改/续期须走「档案变更审批」，通过后写入档案库（archive_pending 承载变更单）
 *  - PDF 版资料以附件形式挂档案（archive_files）；随变更单上传的附件审批通过后才入档
 *  - 借阅留痕：借阅/归还全过程留痕
 * 数据表：archive_files / archive_pending（009 迁移建立）+ 五类档案主体表
 *
 * 与参考项目的差异（受当前项目库表约束，已在下方逐处注明）：
 *  1) 当前项目 customers/suppliers/factories/channels/distributors 为本项目既有表，字段与参考项目不同：
 *     无 expire_date / warn_days / credit_code / legal_person / business_scope（suppliers 除外），
 *     故「档案有效期到期提醒」不在本模块实现（无字段可依），仅保留五类统一查看与变更审批；
 *  2) 009 迁移的 archive_pending 无 files 表关联列 → 随单附件通过 archive_files.pending_id 关联（与参考项目一致）；
 *  3) 借阅留痕无专用表 → 借阅记录存 kv_store（key: archive:borrows），并同步写审计日志；
 *  4) 参考项目由市场部（MKT）操作，当前项目按 dept==='市场部' + 管理层（总经理/副总/超级管理员）判定。
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量（对齐参考项目 archive.js） ==================== */
const FACT_TYPES = ['设备厂家', '耗材厂家', '试剂厂家', '服务商', '其他'];
const FACT_IDENTITIES = ['品牌厂家', 'OEM厂家', '代工厂', '授权合作厂', '其他'];
const CHAN_TYPES = ['省级代理', '区域代理', '分销商', '线上渠道', '其他'];
const DIS_IDENTITIES = ['下游经销商', '省级代理', '地市级代理', '区域代理', '直销终端'];
const SUP_IDENTITIES = ['上游供应商', 'OEM厂商', '服务商', '原材料商', '其他'];
const PAY_TERMS = ['先款后货', '货到付款', '30天', '45天', '60天', '90天'];

// 类型 → 档案表 / 中文名 / 准入审批类型 / 可写字段白名单
const TABLE = {
  customer: 'customers', factory: 'factories', supplier: 'suppliers', channel: 'channels', distributor: 'distributors',
};
const TYPE_NAME = { customer: '客户', factory: '厂家', supplier: '供应商', channel: '渠道', distributor: '经销商' };
const APPROVAL_TYPE = {
  customer: '客户资料审批', factory: '厂家资料审批', supplier: '供应商资料审批',
  channel: '渠道资料审批', distributor: '经销商资料审批',
};
// 厂家审批链（SD→VP→GM）；渠道审批链（CHAN→SD→VP）；档案变更审批链
const CHAIN_FACTORY = ['销售总监', '副总', '总经理'];
const CHAIN_CHANNEL = ['渠道经理', '销售总监', '副总'];
const CHAIN_CHANGE = ['市场部负责人', '副总', '总经理'];
// 变更可写字段白名单（防注入：列名只能来自白名单）
const EDITABLE = {
  customer: ['name', 'contact', 'phone', 'address', 'level', 'industry'],
  factory: ['name', 'type', 'category', 'product_spec', 'contact_name', 'contact_phone', 'license_no', 'address', 'credit_grade', 'identity'],
  supplier: ['name', 'category', 'contact', 'phone', 'address', 'level', 'business_scope', 'qualifications', 'products'],
  channel: ['name', 'type', 'region', 'product_spec', 'contact_name', 'contact_phone', 'address'],
  distributor: ['name', 'tier', 'region', 'contact_name', 'contact_phone', 'license_no', 'credit_limit', 'identity'],
};

const MGMT_ROLES = ['总经理', '副总', '超级管理员'];
const BORROW_KEY = 'archive:borrows';
const ARC_DIR = path.join(__dirname, '..', '..', 'uploads', 'archive_files');

/* ==================== 工具 ==================== */
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const todayStr = () => localNow().slice(0, 10);

function canEdit(user) {
  return !!user && (user.dept === '市场部' || MGMT_ROLES.includes(user.role));
}

/** 生成编号：前缀 + 现有最大 id + 1（对齐参考项目 nextCode） */
function nextCode(prefix, table) {
  for (let i = 0; i < 5; i++) {
    const maxId = db.prepare(`SELECT COALESCE(MAX(id),0) AS m FROM ${table}`).get().m;
    const code = prefix + String(maxId + 1).padStart(3, '0');
    const dup = db.prepare(`SELECT id FROM ${table} WHERE code=?`).get(code);
    if (!dup) return code;
  }
  return prefix + Date.now();
}

function createApproval(user, type, title, refId, amount, chain) {
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  const approvalNo = 'AP' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(n).padStart(4, '0');
  const info = db.prepare(`INSERT INTO approvals
    (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, type, title, refId || 0, Number(amount) || 0,
      Number(user.id) || 0, user.name || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/** 借阅留痕：kv_store 读写 JSON 数组 */
function readBorrows() {
  const row = db.prepare('SELECT value FROM kv_store WHERE key=?').get(BORROW_KEY);
  if (!row) return [];
  try { return JSON.parse(row.value || '[]'); } catch (e) { return []; }
}
function writeBorrows(list) {
  db.prepare('INSERT INTO kv_store (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    .run(BORROW_KEY, JSON.stringify(list), localNow());
}

/* ==================== 1. 元数据枚举 ==================== */
async function meta(req, res) {
  return res.json(ok({
    types: Object.keys(TABLE).map((k) => ({ key: k, name: TYPE_NAME[k], table: TABLE[k] })),
    type_names: TYPE_NAME,
    fact_types: FACT_TYPES, fact_identities: FACT_IDENTITIES,
    chan_types: CHAN_TYPES, dis_identities: DIS_IDENTITIES, sup_identities: SUP_IDENTITIES,
    pay_terms: PAY_TERMS,
    change_types: ['修改', '续期'],
  }));
}

/* ==================== 2. 概览统计 ==================== */
async function summary(req, res) {
  const cnt = (t) => {
    try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch (e) { return 0; }
  };
  return res.json(ok({
    customers: cnt('customers'),
    factories: cnt('factories'),
    suppliers: cnt('suppliers'),
    channels: cnt('channels'),
    distributors: cnt('distributors'),
    // 待归档（变更单）+ 待准入（草稿）
    pending_changes: db.prepare("SELECT COUNT(*) c FROM archive_pending WHERE status='待审批'").get().c,
    pending_admission: (() => {
      let n = 0;
      ['factories', 'channels'].forEach((t) => {
        try { n += db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE status='草稿'`).get().c; } catch (e) { /* 无该状态 */ }
      });
      return n;
    })(),
    files: db.prepare("SELECT COUNT(*) c FROM archive_files WHERE status='有效'").get().c,
    borrowing: readBorrows().filter((x) => x.status === '借阅中').length,
  }));
}

/* ==================== 3. 五类资料统一查看（对齐参考项目 /directory） ==================== */
const DIRECTORY_SQL = {
  customer: `SELECT id,name,contact,phone,address,level,industry,status,owner FROM customers
    WHERE (? = '' OR name LIKE ? OR contact LIKE ?) ORDER BY id DESC`,
  factory: `SELECT id,code,name,type,category,product_spec,contact_name,contact_phone,license_no,address,credit_grade,identity,status
    FROM factories WHERE status NOT IN ('草稿','已驳回') AND (? = '' OR name LIKE ? OR code LIKE ? OR category LIKE ? OR product_spec LIKE ?) ORDER BY id DESC`,
  supplier: `SELECT id,name,short_name,category,level,contact,phone,address,business_scope,qualifications,products,rating,status
    FROM suppliers WHERE (? = '' OR name LIKE ? OR category LIKE ? OR contact LIKE ?) ORDER BY id DESC`,
  channel: `SELECT id,code,name,type,region,product_spec,contact_name,contact_phone,address,status
    FROM channels WHERE status NOT IN ('草稿','已驳回') AND (? = '' OR name LIKE ? OR type LIKE ? OR region LIKE ? OR contact_name LIKE ?) ORDER BY id DESC`,
  distributor: `SELECT id,code,name,tier,region,contact_name,contact_phone,license_no,credit_limit,admission_status,status,identity
    FROM distributors WHERE (? = '' OR name LIKE ? OR code LIKE ? OR region LIKE ? OR contact_name LIKE ?) ORDER BY id DESC`,
};
// 各类型 SQL 中 LIKE 占位符个数（首个 ? 为 q 空值短路判断）
const LIKE_COUNT = { customer: 2, factory: 4, supplier: 3, channel: 4, distributor: 4 };

async function directory(req, res) {
  const type = req.query.type || 'customer';
  if (!TABLE[type]) return res.json(bad('type 须为 customer/factory/supplier/channel/distributor'));
  const q = (req.query.q || '').trim();
  const like = `%${q}%`;
  const sql = DIRECTORY_SQL[type];
  const params = [q, ...new Array(LIKE_COUNT[type]).fill(like)];
  let rows = [];
  try {
    rows = db.prepare(sql).all(...params);
  } catch (e) {
    return res.json(bad(`档案查询失败：${e.message}`));
  }
  // 附加归档文件数
  rows.forEach((x) => {
    x.type_name = TYPE_NAME[type];
    x.file_count = db.prepare("SELECT COUNT(*) c FROM archive_files WHERE data_type=? AND ref_id=? AND status='有效'").get(type, x.id).c;
  });
  return res.json(ok(rows));
}

/* ==================== 4. 厂家档案（审批准入制） ==================== */
async function listFactories(req, res) {
  let sql = 'SELECT * FROM factories WHERE 1=1';
  const p = [];
  if (req.query.status) { sql += ' AND status=?'; p.push(req.query.status); }
  if (req.query.q) {
    sql += ' AND (name LIKE ? OR type LIKE ? OR category LIKE ? OR product_spec LIKE ? OR contact_name LIKE ?)';
    p.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createFactory(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('厂家资料由市场部统一录入（审批准入制）'));
  const b = req.body || {};
  if (!b.name) return res.json(bad('厂家名称必填'));
  const dup = db.prepare("SELECT id FROM factories WHERE name=? AND status IN ('有效','草稿')").get(b.name);
  if (dup) return res.json(bad(`厂家「${b.name}」已存在（含待审批草稿），请勿重复录入`, 409));
  const type = FACT_TYPES.includes(b.type) ? b.type : '设备厂家';
  const identity = FACT_IDENTITIES.includes(b.identity) ? b.identity : '品牌厂家';
  const code = nextCode('F', 'factories');
  const info = db.prepare(`INSERT INTO factories
    (code,name,type,category,product_spec,contact_name,contact_phone,license_no,address,credit_grade,identity,status,created_by,created_by_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'草稿',?,?)`)
    .run(code, b.name, type, b.category || '', b.product_spec || '', b.contact_name || '', b.contact_phone || '',
      b.license_no || '', b.address || '', b.credit_grade || '良', identity,
      empId(req) || null, (req.user && req.user.name) || '');
  const ap = createApproval(req.user, '厂家资料审批', `厂家资料准入：${b.name}（${type}）`, info.lastInsertRowid, 0, CHAIN_FACTORY);
  audit('ARCHIVE_FACTORY_CREATE', req.userId, `厂家#${info.lastInsertRowid}`, `录入厂家「${b.name}」，发起厂家资料审批 ${ap.approval_no}`);
  return res.json(ok({ id: info.lastInsertRowid, code, status: '草稿', approval_id: ap.id, approval_no: ap.approval_no }, '厂家资料已提交，审批通过后正式进入档案中心'));
}

async function updateFactory(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('厂家资料由市场部维护'));
  const f = db.prepare('SELECT * FROM factories WHERE id=?').get(req.params.id);
  if (!f) return res.json(notfound('厂家不存在'));
  const b = req.body || {};
  // 草稿/已驳回：直接改草稿内容；已生效：走档案变更审批
  if (f.status === '草稿' || f.status === '已驳回') {
    db.prepare(`UPDATE factories SET name=?, type=?, category=?, product_spec=?, contact_name=?, contact_phone=?,
      license_no=?, address=?, credit_grade=?, identity=? WHERE id=?`)
      .run(b.name || f.name, FACT_TYPES.includes(b.type) ? b.type : f.type,
        b.category !== undefined ? b.category : f.category,
        b.product_spec !== undefined ? b.product_spec : f.product_spec,
        b.contact_name !== undefined ? b.contact_name : f.contact_name,
        b.contact_phone !== undefined ? b.contact_phone : f.contact_phone,
        b.license_no !== undefined ? b.license_no : (f.license_no || ''),
        b.address !== undefined ? b.address : f.address,
        b.credit_grade || f.credit_grade,
        FACT_IDENTITIES.includes(b.identity) ? b.identity : f.identity, f.id);
    audit('ARCHIVE_FACTORY_DRAFT', req.userId, `厂家#${f.id}`, `编辑厂家草稿「${b.name || f.name}」`);
    return res.json(ok({ status: f.status }, '草稿已保存'));
  }
  return submitChange(req, res, 'factory', f, b);
}

/* ==================== 5. 渠道档案（审批准入制） ==================== */
async function listChannels(req, res) {
  let sql = 'SELECT * FROM channels WHERE 1=1';
  const p = [];
  if (req.query.status) { sql += ' AND status=?'; p.push(req.query.status); }
  if (req.query.q) {
    sql += ' AND (name LIKE ? OR type LIKE ? OR region LIKE ? OR product_spec LIKE ? OR contact_name LIKE ?)';
    p.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createChannel(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('渠道资料由市场部统一录入（审批准入制）'));
  const b = req.body || {};
  if (!b.name) return res.json(bad('渠道名称必填'));
  const dup = db.prepare("SELECT id FROM channels WHERE name=? AND status IN ('有效','草稿')").get(b.name);
  if (dup) return res.json(bad(`渠道「${b.name}」已存在（含待审批草稿），请勿重复录入`, 409));
  const type = CHAN_TYPES.includes(b.type) ? b.type : '区域代理';
  const code = nextCode('CH', 'channels');
  const info = db.prepare(`INSERT INTO channels
    (code,name,type,region,product_spec,contact_name,contact_phone,address,status,created_by,created_by_name)
    VALUES (?,?,?,?,?,?,?,?,'草稿',?,?)`)
    .run(code, b.name, type, b.region || '', b.product_spec || '', b.contact_name || '', b.contact_phone || '',
      b.address || '', empId(req) || null, (req.user && req.user.name) || '');
  const ap = createApproval(req.user, '渠道资料审批', `渠道资料准入：${b.name}（${type}）`, info.lastInsertRowid, 0, CHAIN_CHANNEL);
  audit('ARCHIVE_CHANNEL_CREATE', req.userId, `渠道#${info.lastInsertRowid}`, `录入渠道「${b.name}」，发起渠道资料审批 ${ap.approval_no}`);
  return res.json(ok({ id: info.lastInsertRowid, code, status: '草稿', approval_id: ap.id, approval_no: ap.approval_no }, '渠道资料已提交，审批通过后正式进入档案中心'));
}

async function updateChannel(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('渠道资料由市场部维护'));
  const c = db.prepare('SELECT * FROM channels WHERE id=?').get(req.params.id);
  if (!c) return res.json(notfound('渠道不存在'));
  const b = req.body || {};
  if (c.status === '草稿' || c.status === '已驳回') {
    db.prepare(`UPDATE channels SET name=?, type=?, region=?, product_spec=?, contact_name=?, contact_phone=?, address=? WHERE id=?`)
      .run(b.name || c.name, CHAN_TYPES.includes(b.type) ? b.type : c.type,
        b.region !== undefined ? b.region : c.region,
        b.product_spec !== undefined ? b.product_spec : c.product_spec,
        b.contact_name !== undefined ? b.contact_name : c.contact_name,
        b.contact_phone !== undefined ? b.contact_phone : c.contact_phone,
        b.address !== undefined ? b.address : c.address, c.id);
    audit('ARCHIVE_CHANNEL_DRAFT', req.userId, `渠道#${c.id}`, `编辑渠道草稿「${b.name || c.name}」`);
    return res.json(ok({ status: c.status }, '草稿已保存'));
  }
  return submitChange(req, res, 'channel', c, b);
}

/* ==================== 6. 归档文件登记（archive_files） ==================== */
async function listFiles(req, res) {
  const type = String(req.query.data_type || '');
  if (!TABLE[type]) return res.json(bad('data_type 非法'));
  const rows = db.prepare(`SELECT * FROM archive_files WHERE data_type=? AND ref_id=? ORDER BY id DESC`)
    .all(type, req.query.ref_id);
  return res.json(ok(rows));
}

async function createFile(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('归档文件登记由市场部完成'));
  const b = req.body || {};
  const type = String(b.data_type || '');
  if (!TABLE[type]) return res.json(bad('data_type 非法'));
  if (!b.ref_id || !b.file_name) return res.json(bad('ref_id / file_name 必填'));
  const rec = db.prepare(`SELECT id FROM ${TABLE[type]} WHERE id=?`).get(b.ref_id);
  if (!rec) return res.json(notfound('档案不存在'));

  let filePath = b.file_path || '';
  let size = Number(b.file_size) || 0;
  // 支持 PDF 原件上传（base64，对齐参考项目：仅 PDF）
  if (b.file_base64) {
    const m = String(b.file_base64).match(/^data:(application\/pdf);base64,(.+)$/);
    if (!m) return res.json(bad('仅支持 PDF 文件（application/pdf）'));
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 10 * 1024 * 1024) return res.json(bad('PDF 大小不能超过 10MB'));
    const safe = String(b.file_name).replace(/[\\/:*?"<>|\s]+/g, '_').slice(-80);
    const name = `${type}_${b.ref_id}_${Date.now()}_${safe}`;
    try {
      fs.mkdirSync(ARC_DIR, { recursive: true });
      fs.writeFileSync(path.join(ARC_DIR, name), buf);
    } catch (e) {
      return res.json(bad(`附件保存失败：${e.message}`));
    }
    filePath = `/uploads/archive_files/${name}`;
    size = buf.length;
  }
  if (!filePath) return res.json(bad('file_path 或 file_base64 必填其一'));

  const info = db.prepare(`INSERT INTO archive_files
    (data_type,ref_id,file_name,file_path,file_size,uploader_id,uploader_name,remark,pending_id,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(type, b.ref_id, b.file_name, filePath, size, empId(req) || null,
      (req.user && req.user.name) || '', b.remark || '', Number(b.pending_id) || 0,
      Number(b.pending_id) > 0 ? '随单待审' : '有效');
  audit('ARCHIVE_FILE_UPLOAD', req.userId, `档案#${b.ref_id}(${type})`, `登记归档文件 ${b.file_name}`);
  return res.json(ok({ id: info.lastInsertRowid, file_path: filePath }, '归档文件已登记'));
}

async function removeFile(req, res) {
  const f = db.prepare('SELECT * FROM archive_files WHERE id=?').get(req.params.id);
  if (!f) return res.json(notfound('附件不存在'));
  if (!canEdit(req.user)) return res.json(forbidden('仅市场部或公司领导可删除附件'));
  try {
    const abs = path.join(ARC_DIR, path.basename(f.file_path || ''));
    if (f.file_path && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) { /* 文件缺失不影响记录清理 */ }
  db.prepare('DELETE FROM archive_files WHERE id=?').run(f.id);
  audit('ARCHIVE_FILE_DELETE', req.userId, `档案#${f.ref_id}(${f.data_type})`, `删除归档文件 ${f.file_name}`);
  return res.json(ok(null, '已删除'));
}

/* ==================== 7. 待归档 / 档案变更单 ==================== */
/** 内部：创建变更单 + 发起档案变更审批（对齐参考项目 createArchivePending） */
function createArchivePending(user, type, refId, unitName, changeType, reason, fields, oldRec) {
  if (!reason || !String(reason).trim()) return { error: '变更事由必填（说明变更/续期原因）' };
  const oldSnapshot = {};
  EDITABLE[type].forEach((k) => { if (oldRec[k] !== undefined) oldSnapshot[k] = oldRec[k]; });
  const pendNo = 'PG' + localNow().replace(/[-: ]/g, '').slice(2, 14) + Math.floor(Math.random() * 900 + 100);
  const info = db.prepare(`INSERT INTO archive_pending
    (pend_no,data_type,ref_id,unit_name,change_type,reason,payload,old_snapshot,expire_date,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(pendNo, type, refId, unitName, changeType, String(reason).trim(),
      JSON.stringify(fields), JSON.stringify(oldSnapshot), fields.expire_date || '',
      Number(user.id) || null, user.name || '');
  const ap = createApproval(user, '档案变更审批', `档案${changeType}：${unitName}（${TYPE_NAME[type]}档案）`, info.lastInsertRowid, 0, CHAIN_CHANGE);
  db.prepare('UPDATE archive_pending SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('ARCHIVE_CHANGE_SUBMIT', user.id, `档案#${refId}(${type})`, `${unitName} 提交${changeType}审批 ${ap.approval_no}`);
  return { id: info.lastInsertRowid, pend_no: pendNo, approval_id: ap.id, approval_no: ap.approval_no };
}

/** PUT 已生效档案时复用：收集变更字段 → 变更单 */
function submitChange(req, res, type, rec, b) {
  const fields = {};
  EDITABLE[type].forEach((k) => {
    if (b[k] !== undefined && String(b[k]) !== String(rec[k] || '')) fields[k] = b[k];
  });
  if (!Object.keys(fields).length) return res.json(bad('未检测到变更内容'));
  const pend = createArchivePending(req.user, type, rec.id, rec.name, b.change_type === '续期' ? '续期' : '修改', b.reason || '', fields, rec);
  if (pend.error) return res.json(bad(pend.error));
  return res.json(ok(pend, '档案修改已提交档案变更审批，通过后写入档案中心'));
}

async function listPendings(req, res) {
  const rows = db.prepare(`SELECT p.*, a.approval_no, a.status ap_status FROM archive_pending p
    LEFT JOIN approvals a ON p.approval_id = a.id ORDER BY p.id DESC LIMIT 200`).all();
  rows.forEach((x) => {
    try { x.payload = JSON.parse(x.payload || '{}'); } catch (e) { x.payload = {}; }
    try { x.old_snapshot = JSON.parse(x.old_snapshot || '{}'); } catch (e) { x.old_snapshot = {}; }
    x.type_name = TYPE_NAME[x.data_type] || x.data_type;
    x.pdf_files = db.prepare(`SELECT id,file_name,file_path,file_size,status FROM archive_files
      WHERE pending_id=? ORDER BY id`).all(x.id);
  });
  return res.json(ok(rows));
}

async function createPending(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('档案变更由市场部提交'));
  const type = String((req.body || {}).data_type || '');
  if (!TABLE[type]) return res.json(bad('data_type 须为 customer/factory/supplier/channel/distributor'));
  const b = req.body || {};
  const rec = db.prepare(`SELECT * FROM ${TABLE[type]} WHERE id=?`).get(b.ref_id);
  if (!rec) return res.json(notfound('档案不存在'));
  const fields = (b.fields && typeof b.fields === 'object') ? b.fields : {};
  if (!Object.keys(fields).length) return res.json(bad('未提交任何变更字段'));
  const pend = createArchivePending(req.user, type, rec.id, b.unit_name || rec.name,
    b.change_type === '续期' ? '续期' : '修改', b.reason || '', fields, rec);
  if (pend.error) return res.json(bad(pend.error));
  return res.json(ok(pend, `${b.change_type === '续期' ? '续期' : '变更'}已提交档案变更审批，通过后写入档案中心`));
}

/** 变更单审批：通过 → 写入档案库 + 随单附件入档；驳回 → 随单附件作废 */
async function approvePending(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('档案变更审批由市场部负责人/公司领导处理'));
  const p = db.prepare('SELECT * FROM archive_pending WHERE id=?').get(req.params.id);
  if (!p) return res.json(notfound('变更单不存在'));
  if (p.status !== '待审批') return res.json(bad(`变更单当前状态「${p.status}」，无需审批`));
  const { result, comment } = req.body || {};
  if (!['通过', '驳回'].includes(result)) return res.json(bad('审批结果须为 通过 / 驳回'));

  if (result === '驳回') {
    db.prepare("UPDATE archive_pending SET status='已驳回' WHERE id=?").run(p.id);
    db.prepare("UPDATE archive_files SET status='已作废' WHERE pending_id=?").run(p.id);
    if (p.approval_id) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(localNow(), p.approval_id);
    audit('ARCHIVE_CHANGE_REJECT', req.userId, `变更单${p.pend_no}`, `${p.unit_name} 变更驳回：${comment || ''}`);
    return res.json(ok(null, '已驳回'));
  }
  // 通过：按白名单写回档案表
  let fields = {};
  try { fields = JSON.parse(p.payload || '{}'); } catch (e) { fields = {}; }
  const keys = EDITABLE[p.data_type].filter((k) => fields[k] !== undefined);
  if (keys.length) {
    const setSql = keys.map((k) => `${k}=?`).join(',');
    db.prepare(`UPDATE ${TABLE[p.data_type]} SET ${setSql} WHERE id=?`)
      .run(...keys.map((k) => fields[k]), p.ref_id);
  }
  db.prepare("UPDATE archive_pending SET status='已通过', applied_at=? WHERE id=?").run(localNow(), p.id);
  db.prepare("UPDATE archive_files SET status='有效' WHERE pending_id=?").run(p.id);
  if (p.approval_id) db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(localNow(), p.approval_id);
  audit('ARCHIVE_CHANGE_APPROVE', req.userId, `变更单${p.pend_no}`, `${p.unit_name} 变更通过，写入字段[${keys.join('、') || '无'}]`);
  return res.json(ok(null, '审批通过，变更已写入档案中心'));
}

/* ==================== 8. 准入审批（厂家/渠道草稿 → 生效） ==================== */
async function approveAdmission(req, res) {
  if (!canEdit(req.user)) return res.json(forbidden('资料准入审批由市场部/公司领导处理'));
  const b = req.body || {};
  const type = String(b.data_type || '');
  if (!['factory', 'channel'].includes(type)) return res.json(bad('data_type 须为 factory / channel'));
  const rec = db.prepare(`SELECT * FROM ${TABLE[type]} WHERE id=?`).get(b.ref_id);
  if (!rec) return res.json(notfound('档案不存在'));
  if (!['草稿', '已驳回'].includes(rec.status)) return res.json(bad(`当前状态「${rec.status}」无需准入审批`));
  const { result, comment } = b;
  if (!['通过', '驳回'].includes(result)) return res.json(bad('审批结果须为 通过 / 驳回'));

  const apType = APPROVAL_TYPE[type];
  const ap = db.prepare(`SELECT id,approval_no FROM approvals WHERE type=? AND ref_id=? AND status='待审批' ORDER BY id DESC LIMIT 1`)
    .get(apType, rec.id);
  if (result === '驳回') {
    db.prepare(`UPDATE ${TABLE[type]} SET status='已驳回' WHERE id=?`).run(rec.id);
    if (ap) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(localNow(), ap.id);
    audit('ARCHIVE_ADMIT_REJECT', req.userId, `${TYPE_NAME[type]}#${rec.id}`, `${rec.name} 资料准入驳回：${comment || ''}`);
    return res.json(ok(null, '已驳回'));
  }
  db.prepare(`UPDATE ${TABLE[type]} SET status='有效' WHERE id=?`).run(rec.id);
  if (ap) db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(localNow(), ap.id);
  audit('ARCHIVE_ADMIT_APPROVE', req.userId, `${TYPE_NAME[type]}#${rec.id}`, `${rec.name} 资料准入通过，正式进入档案中心`);
  return res.json(ok(null, '审批通过，档案已生效'));
}

/* ==================== 9. 借阅留痕 ==================== */
async function listBorrows(req, res) {
  let list = readBorrows();
  if (req.query.data_type) list = list.filter((x) => x.data_type === req.query.data_type);
  if (req.query.ref_id) list = list.filter((x) => String(x.ref_id) === String(req.query.ref_id));
  if (req.query.status) list = list.filter((x) => x.status === req.query.status);
  return res.json(ok(list.sort((a, b) => (b.id || 0) - (a.id || 0))));
}

async function borrowFile(req, res) {
  const b = req.body || {};
  const f = db.prepare('SELECT * FROM archive_files WHERE id=?').get(b.file_id);
  if (!f) return res.json(notfound('归档文件不存在'));
  if (f.status !== '有效') return res.json(bad(`该文件当前状态「${f.status}」不可借阅`));
  if (!b.purpose) return res.json(bad('借阅用途必填'));
  const list = readBorrows();
  const rec = {
    id: (list.reduce((m, x) => Math.max(m, x.id || 0), 0)) + 1,
    file_id: f.id, data_type: f.data_type, ref_id: f.ref_id, file_name: f.file_name,
    borrower_id: empId(req) || 0,
    borrower_name: b.borrower_name || ((req.user && req.user.name) || ''),
    borrower_dept: b.borrower_dept || ((req.user && req.user.dept) || ''),
    borrow_date: todayStr(),
    expected_return: b.expected_return || '',
    actual_return: '',
    purpose: b.purpose,
    status: '借阅中',
  };
  list.push(rec);
  writeBorrows(list);
  audit('ARCHIVE_BORROW', req.userId, `档案#${f.ref_id}(${f.data_type})`, `借阅「${f.file_name}」，用途：${b.purpose}`);
  return res.json(ok(rec, '借阅已登记'));
}

async function returnFile(req, res) {
  const list = readBorrows();
  const rec = list.find((x) => String(x.id) === String(req.params.id));
  if (!rec) return res.json(notfound('借阅记录不存在'));
  if (rec.status === '已归还') return res.json(bad('该借阅已归还'));
  rec.status = '已归还';
  rec.actual_return = todayStr();
  writeBorrows(list);
  audit('ARCHIVE_RETURN', req.userId, `档案#${rec.ref_id}(${rec.data_type})`, `归还「${rec.file_name}」`);
  return res.json(ok(rec, '归还已登记'));
}

/* ==================== 12. 第42轮补缺：统一录入/变更/草稿/到期/详情 ==================== */
// POST /api/archive/records：市场部统一录入五类档案（草稿 + 发起资料审批准入）
async function createRecord(req, res) {
  const b = req.body || {};
  const type = String(b.type || '');
  if (!TABLE[type]) return res.json(bad('身份类型须为 customer/factory/supplier/channel/distributor 之一'));
  if (!b.name) return res.json(bad('单位名称必填'));
  const table = TABLE[type];
  try {
    const dup = db.prepare(`SELECT id FROM ${table} WHERE name=? AND status IN ('有效','启用','草稿','有效')`).get(b.name);
    if (dup) return res.json(bad(`「${b.name}」已存在（含待审批草稿），请勿重复录入`));
  } catch (e) { /* 字段缺失则跳过唯一检查 */ }
  const tmpCode = 'TMP' + Date.now() + Math.floor(Math.random() * 90 + 10);
  const emp = empId(req);
  let info;
  try {
    if (type === 'customer') {
      info = db.prepare(`INSERT INTO customers(code,name,tier,cust_type,level,nature,province,city,address,region,status,credit_grade,expire_date,warn_days,created_by,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tmpCode, b.name, b.tier || 'C', b.cust_type || '三甲医院', b.level || '三甲医院', b.nature || '公立', b.province || '', b.city || '', b.address || '', b.region || '重庆主城', '草稿', b.credit_grade || '良', b.expire_date || '', Number(b.warn_days) || 90, emp, localNow());
    } else if (type === 'factory') {
      info = db.prepare(`INSERT INTO factories(code,name,type,category,product_spec,contact_name,contact_phone,license_no,license_expire,address,credit_grade,identity,status,expire_date,warn_days,credit_code,legal_person,business_scope,created_by,created_by_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('F' + nextCode('F', 'factories').slice(1), b.name, b.biz_type || b.type || '设备厂家', b.category || '', b.product_spec || '', b.contact_name || '', b.contact_phone || '', b.license_no || '', b.license_expire || '', b.address || '', b.credit_grade || '良', b.identity || '品牌厂家', '草稿', b.expire_date || '', Number(b.warn_days) || 90, b.credit_code || '', b.legal_person || '', b.business_scope || '', emp, req.user && req.user.name || '');
    } else if (type === 'supplier') {
      info = db.prepare(`INSERT INTO suppliers(code,name,type,category,product_spec,contact_name,contact_phone,license_no,license_expire,address,credit_grade,payment_terms,status,identity,expire_date,warn_days,credit_code,legal_person,business_scope,created_by,created_by_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tmpCode, b.name, b.biz_type || b.type || '耗材', b.category || '', b.product_spec || '', b.contact_name || '', b.contact_phone || '', b.license_no || '', b.license_expire || '', b.address || '', b.credit_grade || '良', b.payment_terms || '30天', '草稿', b.identity || '上游供应商', b.expire_date || '', Number(b.warn_days) || 90, b.credit_code || '', b.legal_person || '', b.business_scope || '', emp, req.user && req.user.name || '');
    } else if (type === 'channel') {
      info = db.prepare(`INSERT INTO channels(code,name,type,region,product_spec,contact_name,contact_phone,license_no,license_expire,address,status,expire_date,warn_days,credit_code,legal_person,business_scope,created_by,created_by_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('CH' + nextCode('CH', 'channels').slice(2), b.name, b.biz_type || b.type || '区域代理', b.region || '', b.product_spec || '', b.contact_name || '', b.contact_phone || '', b.license_no || '', b.license_expire || '', b.address || '', '草稿', b.expire_date || '', Number(b.warn_days) || 90, b.credit_code || '', b.legal_person || '', b.business_scope || '', emp, req.user && req.user.name || '');
    } else if (type === 'distributor') {
      info = db.prepare(`INSERT INTO distributors(code,name,product_spec,tier,region,contact_name,contact_phone,license_no,license_expire,credit_limit,admission_status,status,identity,expire_date,warn_days,credit_code,legal_person,business_scope)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tmpCode, b.name, b.product_spec || '', b.tier || '观察', b.region || '重庆主城', b.contact_name || '', b.contact_phone || '', b.license_no || '', b.license_expire || '', Number(b.credit_limit) || 0, '准入评审中', '草稿', b.identity || '下游经销商', b.expire_date || '', Number(b.warn_days) || 90, b.credit_code || '', b.legal_person || '', b.business_scope || '');
    } else {
      return res.json(bad('类型非法'));
    }
  } catch (e) {
    return res.json(bad('字段缺失或不匹配：' + e.message));
  }
  const apType = APPROVAL_TYPE[type] || '客户资料审批';
  let approvalId = 0, approvalNo = '';
  try {
    approvalId = createApproval({ id: emp, name: (req.user && req.user.name) || '' }, apType, `${type}档案准入：${b.name}`, info.lastInsertRowid, 0);
    db.prepare(`UPDATE ${table} SET approval_id=? WHERE id=?`).run(approvalId, info.lastInsertRowid);
    const ap = db.prepare('SELECT approval_no FROM approvals WHERE id=?').get(approvalId);
    approvalNo = ap ? ap.approval_no : '';
  } catch (e) { /* 审批创建失败不阻塞草稿写入 */ }
  audit('ARCHIVE_RECORD_CREATE', req.userId, `${type}#${info.lastInsertRowid}`, `市场部统一录入「${b.name}」，发起 ${apType}`);
  return res.json(ok({ id: info.lastInsertRowid, status: '草稿', approval_id: approvalId, approval_no: approvalNo }, '已发起资料审批准入'));
}

// POST /api/archive/records/:type/:id/change：已生效档案变更/续期
async function submitChange(req, res) {
  const type = String(req.params.type || '');
  if (!TABLE[type]) return res.json(bad('类型非法'));
  const table = TABLE[type];
  const rec = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(req.params.id);
  if (!rec) return res.json(notfound('档案不存在'));
  if (!['有效', '启用', '停用'].includes(rec.status)) return res.json(bad('仅正式生效的档案可提交变更审批'));
  const b = req.body || {};
  const fields = (b.fields && typeof b.fields === 'object') ? b.fields : {};
  if (b.expire_date) fields.expire_date = b.expire_date;
  if (!Object.keys(fields).length) return res.json(bad('未提交任何变更字段'));
  const emp = empId(req);
  const userObj = { id: emp, name: (req.user && req.user.name) || '' };
  const pend = createArchivePending(userObj, type, rec.id, rec.name, b.change_type === '续期' ? '续期' : '修改', b.reason || '档案资料变更', fields, rec);
  if (pend && pend.error) return res.json(bad(pend.error));
  audit('ARCHIVE_CHANGE', req.userId, `${type}#${rec.id}`, `${rec.name} 提交${b.change_type === '续期' ? '续期' : '修改'}审批`);
  return res.json(ok(pend, '已发起档案变更审批'));
}

// GET /api/archive/drafts：草稿/已驳回档案列表（市场部可看全部，scope=mine 仅自己）
async function listDrafts(req, res) {
  const mgr = MGMT_ROLES.includes(req.user && req.user.role) && req.query.scope !== 'mine';
  const cond = mgr ? '' : 'AND created_by=?';
  const args = mgr ? [] : [empId(req) || 0];
  const out = [];
  for (const [type, table] of Object.entries(TABLE)) {
    try {
      const rows = db.prepare(`SELECT id,code,name,status,expire_date,warn_days,created_at,approval_id,created_by FROM ${table}
        WHERE status IN ('草稿','已驳回') ${cond} ORDER BY id DESC LIMIT 100`).all(...args);
      rows.forEach((x) => {
        const ap = x.approval_id ? db.prepare('SELECT approval_no FROM approvals WHERE id=?').get(x.approval_id) : null;
        out.push({ type, id: x.id, code: x.code, name: x.name, status: x.status, expire_date: x.expire_date, warn_days: x.warn_days || 90, created_at: x.created_at, approval_id: x.approval_id, approval_no: ap ? ap.approval_no : '', mine: x.created_by === empId(req) });
      });
    } catch (e) { /* 表字段不匹配则跳过 */ }
  }
  out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return res.json(ok(out));
}

// GET /api/archive/expiring?days=30：五类档案 N 天内到期
async function listExpiring(req, res) {
  const days = Math.max(1, Number(req.query.days) || 30);
  const limitDate = new Date(new Date(todayStr()).getTime() + days * 86400000).toISOString().slice(0, 10);
  const out = [];
  for (const [type, table] of Object.entries(TABLE)) {
    try {
      const rows = db.prepare(`SELECT id,code,name,expire_date,warn_days,status FROM ${table}
        WHERE expire_date IS NOT NULL AND expire_date != '' AND expire_date <= ? AND status IN ('有效','启用','停用')`).all(limitDate);
      rows.forEach((x) => {
        const exp = String(x.expire_date).slice(0, 10);
        const today = new Date(todayStr()).getTime();
        const daysLeft = Math.round((new Date(exp).getTime() - today) / 86400000);
        let state = '正常';
        if (daysLeft < 0) state = '已到期';
        else if (daysLeft <= (x.warn_days || 90)) state = '即将到期';
        out.push({ type, id: x.id, code: x.code, name: x.name, expire_date: x.expire_date, warn_days: x.warn_days || 90, status: x.status, exp_state: state, days_left: daysLeft });
      });
    } catch (e) { /* skip */ }
  }
  out.sort((a, b) => (a.days_left || 0) - (b.days_left || 0));
  return res.json(ok(out));
}

// GET /api/archive/detail?type=&id=：档案详情（含 PDF 附件 + 到期状态）
async function getDetail(req, res) {
  const type = String(req.query.type || '');
  if (!TABLE[type]) return res.json(bad('type 非法'));
  const rec = db.prepare(`SELECT * FROM ${TABLE[type]} WHERE id=?`).get(Number(req.query.id) || 0);
  if (!rec) return res.json(notfound('档案不存在'));
  const exp = rec.expire_date;
  let state = '未设', daysLeft = null;
  if (exp) {
    daysLeft = Math.round((new Date(String(exp).slice(0, 10)).getTime() - new Date(todayStr()).getTime()) / 86400000);
    state = daysLeft < 0 ? '已到期' : (daysLeft <= (rec.warn_days || 90) ? '即将到期' : '正常');
  }
  let files = [];
  try { files = db.prepare(`SELECT id,file_name,file_path,file_size,uploader_name,remark,created_at FROM archive_files WHERE data_type=? AND ref_id=? AND status='有效' ORDER BY id DESC`).all(type, rec.id); } catch (e) {}
  if (type === 'supplier' && !(req.user && BANK_ROLES.includes(req.user.role))) {
    delete rec.bank_name; delete rec.bank_account; delete rec.license_no;
  }
  return res.json(ok({ ...rec, exp_state: state, days_left: daysLeft, files }));
}

module.exports = {
  meta, summary, directory,
  listFactories, createFactory, updateFactory,
  listChannels, createChannel, updateChannel,
  listFiles, createFile, removeFile,
  listPendings, createPending, approvePending, approveAdmission,
  listBorrows, borrowFile, returnFile,
  // 第42轮补缺
  createRecord, submitChange, listDrafts, listExpiring, getDetail,
};
