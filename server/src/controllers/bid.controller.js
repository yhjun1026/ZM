/**
 * 招投标管理 + 标书制作控制器
 * 迁移自参考项目 routes/bid.js（投标台账/标书制作任务/标书文件/查阅审批/审查意见）
 *        + routes/bidgen.js（标书章节框架生成/在线编辑/知识库）
 * 数据表：bids / bid_docs / bid_sections / bid_files / bid_reviews / bid_knowledge / bid_view_grants（009 迁移建立）
 *
 * 【Word 导入导出说明】
 * 参考项目用 mammoth（Word → 文本）与 docx（文本 → Word）实现「章节 Word 导入 / 整本导出 docx」。
 * 当前项目 package.json 未安装 mammoth / docx，按迁移规范不做该项，相关能力降级为：
 *   - 导出仅提供纯文本全文（GET /bid/:id/export）
 *   - 章节正文通过在线编辑或「引用知识库」填充
 * 若后续安装依赖（npm i mammoth docx），可在此控制器补充 import-docx / export-docx 两个接口。
 *
 * 【字段适配说明（对齐 009 DDL）】
 * 009 的 bids 表字段只有 id/bid_no/opp_id/amount/bid_date/result/remark，
 * 参考项目中的 tenderee/project_name/tender_no/budget/deadline/open_time/bond/stage/bid_type/owner 等列不存在。
 * 按规范「不建表、不改迁移」，这些招标信息以 JSON 形式存放在 remark 列（键：tenderee/project_name/.../remark），
 * 读写统一走 parseMeta() / packMeta()，列表与详情对外仍是扁平字段，前端无感知。
 * 同理 bid_reviews 无 score/conclusion 列，评分与结论按「【评分:85】【结论:通过】意见正文」约定写入 comment 列。
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const auditLog = require('../utils/audit');
const KB_SEED = require('../data/bidKnowledgeSeed');

/** 投标阶段（顺序即流程，对齐参考项目 BID_STAGES） */
const STAGES = ['立项跟踪', '标书制作', '已投标', '待开标', '已中标', '未中标', '已放弃'];
/** 可人工推进的阶段（对齐参考项目 BID_STAGES.slice(0,4)） */
const FLOW_STAGES = ['立项跟踪', '标书制作', '已投标', '待开标'];
/** 开标结果（对齐参考项目 BID_RESULTS） */
const RESULTS = ['待开标', '已中标', '未中标', '已放弃'];
/** 标书分册类型（对齐参考项目 DOC_TYPES） */
const DOC_TYPES = ['整体标书', '商务标', '技术标', '报价标', '资质标', '服务承诺'];
/** 标书任务状态（对齐参考项目） */
const DOC_STATUS = ['待启动', '编写中', '内部评审', '已定稿'];
/** 章节类型 */
const SEC_TYPES = ['商务', '技术', '报价', '资格', '售后实施', '其他'];
/** 标书类别 */
const BID_TYPES = ['货物', '工程', '服务'];
/** 知识库分类（法规为第70轮补充的现行法律法规类） */
const KB_CATEGORIES = ['货物', '工程', '服务', '法规'];
/** 可立项/制标/登记结果的角色（对齐参考项目 requireComm 的 COMM 白名单） */
const BID_EDIT_ROLES = ['商务部', '商务主管', '总经理', '销售总监', '超级管理员'];
/** 可在线查看标书/审查意见的角色（对齐参考项目 BID_VIEW_ROLES） */
const BID_VIEW_ROLES = ['总经理', '副总', '销售总监', '部门经理', '超级管理员', '商务部', '商务主管'];

/* ---------------- 基础工具 ---------------- */

/** 本地时间 YYYY-MM-DD HH:mm:ss（对齐参考项目 ts()） */
const now = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

/** 单号生成：前缀 + 本地时间戳 + 4 位随机，带存在性校验（对齐参考项目 #119 撞号修复） */
function genNo(prefix, table, col) {
  for (let i = 0; i < 5; i++) {
    const no = prefix + now().replace(/[-: ]/g, '').slice(0, 14) + String(Math.floor(Math.random() * 9000 + 1000));
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE ${col}=?`).get(no)) return no;
  }
  return prefix + Date.now();
}

/** 解析 bids.remark 中的招标信息 JSON；非 JSON（历史纯备注）时降级为 { remark } */
function parseMeta(row) {
  try {
    const o = JSON.parse(row.remark || '{}');
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch (e) { /* 纯文本备注 */ }
  return { remark: row.remark || '' };
}
const packMeta = (meta) => JSON.stringify(meta || {});

/** 把 bids 行 + 招标信息 JSON 展平为接口输出结构 */
function shapeBid(row) {
  const m = parseMeta(row);
  const result = row.result || '待开标';
  return {
    id: row.id,
    bid_no: row.bid_no,
    opp_id: row.opp_id || 0,
    opp_no: row.opp_no || '',
    opp_name: row.opp_name || '',
    opp_stage: row.opp_stage || '',
    // 阶段：优先取 JSON；缺省时由开标结果反推（已中标/未中标/已放弃 为终态）
    stage: m.stage || (RESULTS.includes(result) && result !== '待开标' ? result : '立项跟踪'),
    result,
    amount: row.amount || 0,
    bid_date: row.bid_date || '',
    project_name: m.project_name || row.opp_name || '',
    tenderee: m.tenderee || '',
    tender_no: m.tender_no || '',
    budget: m.budget || '',
    deadline: m.deadline || '',
    open_time: m.open_time || '',
    bond: m.bond || '',
    agency: m.agency || '',
    bid_type: m.bid_type || '',
    region: m.region || row.opp_region || '',
    owner_id: m.owner_id || 0,
    owner_name: m.owner_name || '',
    remark: m.remark || '',
    created_at: row.created_at || '',
  };
}

/** 当前用户的员工 id（bid_* 表的 emp_id/owner_id 均为 INTEGER，users.id 是 TEXT） */
function resolveEmpId(req) {
  const u = req.user || {};
  if (u.emp_id && /^\d+$/.test(String(u.emp_id))) return Number(u.emp_id);
  if (u.name) {
    const e = db.prepare('SELECT id FROM employees WHERE name=?').get(u.name);
    if (e) return e.id;
  }
  return /^\d+$/.test(String(u.id)) ? Number(u.id) : 0;
}

const roleOf = (req) => (req.user && req.user.role) || req.userRole || '';
const canEdit = (req) => BID_EDIT_ROLES.includes(roleOf(req));
const canView = (req) => BID_VIEW_ROLES.includes(roleOf(req));

/** 读一条投标项目（含 meta），不存在返回 null */
function getBid(id) {
  return db.prepare('SELECT * FROM bids WHERE id=?').get(id) || null;
}

/* ---------------- 投标项目台账 ---------------- */

/** 枚举（前端下拉用，避免硬编码） */
async function options(req, res) {
  return res.json(ok({
    stages: STAGES,
    flow_stages: FLOW_STAGES,
    results: RESULTS,
    doc_types: DOC_TYPES,
    doc_status: DOC_STATUS,
    sec_types: SEC_TYPES,
    bid_types: BID_TYPES,
    kb_categories: KB_CATEGORIES,
    review_conclusions: REVIEW_CONCLUSIONS,
    can_edit: canEdit(req),
    can_view: canView(req),
  }));
}

/** 在职人员（负责人 / 授权对象下拉） */
async function people(req, res) {
  const rows = db.prepare("SELECT id, emp_no, name, title, role, region FROM employees WHERE status='在职' ORDER BY id").all();
  return res.json(ok(rows));
}

/** 列表：左连商机，支持阶段/结果/关键字筛选 */
async function list(req, res) {
  const { result, keyword, opp_id } = req.query;
  let sql = `SELECT b.*, o.opp_no, o.name opp_name, o.stage opp_stage, o.region opp_region
    FROM bids b LEFT JOIN opportunities o ON b.opp_id = o.id WHERE 1=1`;
  const p = [];
  if (opp_id) { sql += ' AND b.opp_id=?'; p.push(Number(opp_id)); }
  if (result) { sql += ' AND b.result=?'; p.push(result); }
  if (keyword) {
    sql += ' AND (b.bid_no LIKE ? OR o.name LIKE ? OR b.remark LIKE ?)';
    p.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  sql += ' ORDER BY b.id DESC';
  let rows = db.prepare(sql).all(...p).map(shapeBid);
  // stage / bid_type / tenderee 存于 remark JSON，SQL 无法直接过滤（json_extract 遇非法 JSON 会抛错），此处内存过滤
  if (req.query.stage) rows = rows.filter((r) => r.stage === req.query.stage);
  if (req.query.bid_type) rows = rows.filter((r) => r.bid_type === req.query.bid_type);
  return res.json(ok(rows));
}

/** 统计：投标总数 / 进行中 / 中标 / 未中标 / 中标率 / 金额 + 标书任务与章节数 */
async function stats(req, res) {
  const rows = db.prepare('SELECT b.*, o.name opp_name, o.region opp_region FROM bids b LEFT JOIN opportunities o ON b.opp_id=o.id')
    .all().map(shapeBid);
  const total = rows.length;
  const running = rows.filter((r) => FLOW_STAGES.includes(r.stage)).length;
  const won = rows.filter((r) => r.result === '已中标').length;
  const lost = rows.filter((r) => r.result === '未中标' || r.result === '已放弃').length;
  const amount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const wonAmount = rows.filter((r) => r.result === '已中标').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const docs = db.prepare('SELECT status FROM bid_docs').all();
  return res.json(ok({
    total,
    running,
    won,
    lost,
    win_rate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0,
    amount: Math.round(amount * 100) / 100,
    won_amount: Math.round(wonAmount * 100) / 100,
    doc_tasks: docs.length,
    doc_open: docs.filter((d) => d.status !== '已定稿').length,
    sections: db.prepare('SELECT COUNT(*) c FROM bid_sections').get().c,
    files: db.prepare('SELECT COUNT(*) c FROM bid_files').get().c,
    knowledge: db.prepare('SELECT COUNT(*) c FROM bid_knowledge').get().c,
  }));
}

/** 新增投标立项（对齐参考项目：金额>0、默认 立项跟踪/待开标） */
async function create(req, res) {
  if (!canEdit(req)) return res.json(forbidden('投标立项、标书制作、开标结果登记只能由商务部/销售总监/总经理完成'));
  const b = req.body || {};
  const oppId = Number(b.opp_id) || 0;
  let opp = null;
  if (oppId) {
    opp = db.prepare('SELECT * FROM opportunities WHERE id=?').get(oppId);
    if (!opp) return res.json(notfound('关联的商机不存在'));
  }
  const amount = Number(b.amount) || 0;
  if (amount <= 0) return res.json(bad('预算/投标金额必须大于0（单位：万元）'));
  const projectName = (b.project_name || '').trim() || (opp ? opp.name : '');
  if (!projectName) return res.json(bad('未关联商机时，项目名称为必填项'));

  const empId = resolveEmpId(req);
  const meta = {
    stage: FLOW_STAGES.includes(b.stage) ? b.stage : '立项跟踪',
    project_name: projectName,
    tenderee: b.tenderee || (opp ? (opp.terminal || opp.name) : ''),
    tender_no: b.tender_no || '',
    budget: b.budget || '',
    deadline: b.deadline || '',
    open_time: b.open_time || '',
    bond: b.bond || '',
    agency: b.agency || '',
    bid_type: BID_TYPES.includes(b.bid_type) ? b.bid_type : '货物',
    region: b.region || (opp ? opp.region : '') || '',
    owner_id: Number(b.owner_id) || empId,
    owner_name: b.owner_name || (req.user ? req.user.name : ''),
    remark: b.remark || '',
  };
  const bidNo = genNo('TB', 'bids', 'bid_no');
  const info = db.prepare('INSERT INTO bids(bid_no,opp_id,amount,bid_date,result,remark) VALUES(?,?,?,?,?,?)')
    .run(bidNo, oppId, amount, meta.open_time || meta.deadline || '', '待开标', packMeta(meta));
  auditLog('BID_CREATE', req.userId, bidNo, `新增投标立项：${projectName} 金额 ${amount} 万`);
  return res.json(ok({ id: info.lastInsertRowid, bid_no: bidNo, stage: meta.stage }, '投标项目已创建'));
}

/** 详情：含各子表数量 */
async function detail(req, res) {
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const data = shapeBid(bid);
  data.doc_count = db.prepare('SELECT COUNT(*) c FROM bid_docs WHERE bid_id=?').get(bid.id).c;
  data.section_count = db.prepare('SELECT COUNT(*) c FROM bid_sections WHERE bid_id=?').get(bid.id).c;
  data.file_count = db.prepare('SELECT COUNT(*) c FROM bid_files WHERE bid_id=?').get(bid.id).c;
  data.review_count = db.prepare('SELECT COUNT(*) c FROM bid_reviews WHERE bid_id=?').get(bid.id).c;
  data.grant_count = db.prepare('SELECT COUNT(*) c FROM bid_view_grants WHERE bid_id=?').get(bid.id).c;
  return res.json(ok(data));
}

/** 编辑招标信息（招标单位/项目名称/预算/投标截止/开标时间…） */
async function update(req, res) {
  if (!canEdit(req)) return res.json(forbidden('仅商务部/销售总监/总经理可编辑投标项目'));
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const b = req.body || {};
  const meta = parseMeta(bid);
  ['project_name', 'tenderee', 'tender_no', 'budget', 'deadline', 'open_time', 'bond', 'agency', 'region', 'remark', 'owner_name']
    .forEach((k) => { if (b[k] !== undefined) meta[k] = b[k]; });
  if (b.bid_type !== undefined && BID_TYPES.includes(b.bid_type)) meta.bid_type = b.bid_type;
  if (b.owner_id !== undefined) meta.owner_id = Number(b.owner_id) || 0;
  if (b.stage !== undefined && FLOW_STAGES.includes(b.stage)) meta.stage = b.stage;
  const amount = b.amount !== undefined ? Number(b.amount) || 0 : bid.amount;
  const bidDate = b.open_time || b.bid_date || bid.bid_date || '';
  db.prepare('UPDATE bids SET amount=?, bid_date=?, remark=? WHERE id=?')
    .run(amount, bidDate, packMeta(meta), bid.id);
  auditLog('BID_UPDATE', req.userId, bid.bid_no, `编辑投标项目：${meta.project_name || bid.bid_no}`);
  return res.json(ok({ id: bid.id }, '已保存'));
}

/** 阶段推进：立项跟踪 → 标书制作 → 已投标 → 待开标（对齐参考项目：仅前 4 个阶段） */
async function updateStage(req, res) {
  if (!canEdit(req)) return res.json(forbidden('阶段推进只能由商务部/销售总监/总经理操作'));
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const meta = parseMeta(bid);
  const cur = meta.stage || '立项跟踪';
  if (!FLOW_STAGES.includes(cur)) return res.json(bad(`当前阶段 [${cur}] 已结项，不可再推进`));
  const stage = (req.body || {}).stage;
  if (!FLOW_STAGES.includes(stage)) return res.json(bad(`非法阶段（可推进：${FLOW_STAGES.join('/')}）`));
  if (FLOW_STAGES.indexOf(stage) < FLOW_STAGES.indexOf(cur)) return res.json(bad('阶段不可回退'));
  meta.stage = stage;
  db.prepare('UPDATE bids SET remark=? WHERE id=?').run(packMeta(meta), bid.id);
  auditLog('BID_STAGE', req.userId, bid.bid_no, `阶段推进：${cur} → ${stage}`);
  return res.json(ok({ stage }, `已推进至 ${stage}`));
}

/** 开标结果登记：待开标/已中标/未中标/已放弃；中标联动商机推进至赢单（对齐参考项目） */
async function updateResult(req, res) {
  if (!canEdit(req)) return res.json(forbidden('开标结果登记只能由商务部/销售总监/总经理操作'));
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const { result, bid_date, remark } = req.body || {};
  if (!RESULTS.includes(result)) return res.json(bad(`开标结果须为：${RESULTS.join('/')}`));
  const meta = parseMeta(bid);
  if (remark !== undefined) meta.remark = remark;
  // 终态结果同步写入阶段，保证「阶段」与「结果」一致
  if (result !== '待开标') meta.stage = result;
  db.prepare('UPDATE bids SET result=?, bid_date=?, remark=? WHERE id=?')
    .run(result, bid_date || bid.bid_date || now().slice(0, 10), packMeta(meta), bid.id);
  // 中标联动：商机推进至赢单（对齐参考项目）
  if (result === '已中标' && bid.opp_id) {
    const opp = db.prepare('SELECT stage FROM opportunities WHERE id=?').get(bid.opp_id);
    if (opp && !['赢单', '验收归档'].includes(opp.stage)) {
      db.prepare("UPDATE opportunities SET stage='赢单', probability=100 WHERE id=?").run(bid.opp_id);
    }
  }
  auditLog('BID_RESULT', req.userId, bid.bid_no, `开标结果登记：${result}`);
  return res.json(ok({ result }, `已登记为 ${result}`));
}

/** 删除投标项目（级联清理章节/任务/文件/评审/授权） */
async function remove(req, res) {
  if (!canEdit(req)) return res.json(forbidden('仅商务部/销售总监/总经理可删除投标项目'));
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bid_sections WHERE bid_id=?').run(bid.id);
    db.prepare('DELETE FROM bid_docs WHERE bid_id=?').run(bid.id);
    db.prepare("DELETE FROM archive_files WHERE data_type='bid' AND ref_id IN (SELECT id FROM bid_files WHERE bid_id=?)").run(bid.id);
    db.prepare('DELETE FROM bid_files WHERE bid_id=?').run(bid.id);
    db.prepare('DELETE FROM bid_reviews WHERE bid_id=?').run(bid.id);
    db.prepare('DELETE FROM bid_view_grants WHERE bid_id=?').run(bid.id);
    db.prepare('DELETE FROM bids WHERE id=?').run(bid.id);
  });
  tx();
  auditLog('BID_DELETE', req.userId, bid.bid_no, `删除投标项目：${bid.bid_no}`);
  return res.json(ok(null, '投标项目已删除'));
}

/** 标书全文导出（纯文本；参考项目的 docx 导出因缺少 docx 依赖未迁移，见文件头注释） */
async function exportText(req, res) {
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const meta = parseMeta(bid);
  const rows = db.prepare('SELECT * FROM bid_sections WHERE bid_id=? ORDER BY seq ASC, id ASC').all(bid.id);
  const lines = [
    `投标文件 · ${meta.project_name || bid.bid_no}`,
    `招标编号：${meta.tender_no || '-'}    招标人：${meta.tenderee || '-'}    投标人：${req.user ? req.user.name : ''}`,
    '='.repeat(46),
  ];
  rows.forEach((s) => {
    lines.push('', `【${s.sec_type}】${s.section_no ? s.section_no + ' ' : ''}${s.title}`);
    if (s.content) lines.push(s.content);
  });
  lines.push('', '—— 本文件由卓盟OA标书制作中心自动汇总 ——');
  return res.json(ok({ bid_no: bid.bid_no, text: lines.join('\n') }));
}

/* ---------------- 标书文档（bid_docs） ---------------- */

/** 标书制作任务列表 */
async function listDocs(req, res) {
  let sql = `SELECT d.*, b.bid_no, b.remark bid_remark, o.name opp_name
    FROM bid_docs d JOIN bids b ON d.bid_id=b.id LEFT JOIN opportunities o ON b.opp_id=o.id WHERE 1=1`;
  const p = [];
  if (req.query.bid_id) { sql += ' AND d.bid_id=?'; p.push(Number(req.query.bid_id)); }
  if (req.query.status) { sql += ' AND d.status=?'; p.push(req.query.status); }
  sql += " ORDER BY d.status='已定稿', d.due_date, d.id DESC";
  const rows = db.prepare(sql).all(...p).map((d) => ({
    ...d,
    project_name: (parseMeta({ remark: d.bid_remark }).project_name) || d.opp_name || '',
  }));
  return res.json(ok(rows));
}

/** 新增标书制作任务（分册） */
async function createDoc(req, res) {
  if (!canEdit(req)) return res.json(forbidden('标书制作任务只能由商务部/销售总监/总经理创建'));
  const b = req.body || {};
  const bid = getBid(b.bid_id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  if (!DOC_TYPES.includes(b.doc_type)) return res.json(bad(`分册类型须为：${DOC_TYPES.join('/')}`));
  let ownerId = Number(b.owner_id) || resolveEmpId(req);
  let ownerName = b.owner_name || (req.user ? req.user.name : '');
  if (b.owner_id) {
    const emp = db.prepare("SELECT id,name FROM employees WHERE id=? AND status='在职'").get(Number(b.owner_id));
    if (!emp) return res.json(notfound('编制负责人不存在或已离职'));
    ownerId = emp.id; ownerName = emp.name;
  }
  const meta = parseMeta(bid);
  const no = genNo('BD', 'bid_docs', 'doc_no');
  const info = db.prepare(`INSERT INTO bid_docs(bid_id,doc_no,doc_type,owner_id,owner_name,due_date,status,progress,remark,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(bid.id, no, b.doc_type, ownerId, ownerName, b.due_date || meta.deadline || '', '待启动', 0, b.remark || '', now());
  auditLog('BID_DOC_CREATE', req.userId, no, `新增标书任务：${b.doc_type}（${bid.bid_no}）负责人 ${ownerName}`);
  return res.json(ok({ id: info.lastInsertRowid, doc_no: no }, '标书任务已创建'));
}

/** 更新标书任务状态/进度；全部分册定稿且项目处于「标书制作」→ 自动推进至「已投标」（对齐参考项目） */
async function updateDoc(req, res) {
  const doc = db.prepare('SELECT * FROM bid_docs WHERE id=?').get(req.params.id);
  if (!doc) return res.json(notfound('标书任务不存在'));
  const b = req.body || {};
  const status = DOC_STATUS.includes(b.status) ? b.status : doc.status;
  let progress = Number(b.progress);
  progress = isNaN(progress) ? doc.progress : Math.max(0, Math.min(100, Math.round(progress)));
  if (status === '已定稿') progress = 100;
  db.prepare('UPDATE bid_docs SET status=?, progress=?, due_date=?, remark=?, updated_at=? WHERE id=?')
    .run(status, progress, b.due_date || doc.due_date, b.remark !== undefined ? b.remark : doc.remark, now(), doc.id);
  if (status === '已定稿') {
    const bid = getBid(doc.bid_id);
    if (bid) {
      const open = db.prepare("SELECT COUNT(*) n FROM bid_docs WHERE bid_id=? AND status!='已定稿'").get(bid.id).n;
      const meta = parseMeta(bid);
      if (open === 0 && meta.stage === '标书制作') {
        meta.stage = '已投标';
        db.prepare('UPDATE bids SET remark=? WHERE id=?').run(packMeta(meta), bid.id);
      }
    }
  }
  auditLog('BID_DOC_UPDATE', req.userId, doc.doc_no, `标书任务更新：${status} ${progress}%`);
  return res.json(ok({ status, progress }, '已更新'));
}

async function removeDoc(req, res) {
  if (!canEdit(req)) return res.json(forbidden('仅商务部/销售总监/总经理可删除标书任务'));
  const doc = db.prepare('SELECT * FROM bid_docs WHERE id=?').get(req.params.id);
  if (!doc) return res.json(notfound('标书任务不存在'));
  db.prepare('DELETE FROM bid_docs WHERE id=?').run(doc.id);
  auditLog('BID_DOC_DELETE', req.userId, doc.doc_no, '删除标书任务');
  return res.json(ok(null, '已删除'));
}

/* ---------------- 标书章节（bid_sections） ---------------- */

/** 章节骨架模板（迁移自参考项目 frameworkTemplate：三类标书统一骨架 + 类型差异章节） */
function frameworkTemplate(bidType) {
  const base = [
    { sec_type: '商务', title: '封面（投标文件）' },
    { sec_type: '商务', title: '目录' },
    { sec_type: '商务', title: '投标函' },
    { sec_type: '商务', title: '法定代表人身份证明及授权委托书' },
    { sec_type: '商务', title: '投标一览表（开标一览表）' },
    { sec_type: '报价', title: '分项报价表' },
    { sec_type: '资格', title: '资格证明文件（资质/证照/授权）' },
  ];
  const extra = {
    货物: [
      { sec_type: '技术', title: '货物说明与技术参数响应' },
      { sec_type: '技术', title: '技术规格偏离表' },
      { sec_type: '商务', title: '商务条款偏离表' },
      { sec_type: '售后实施', title: '安装调试方案' },
      { sec_type: '售后实施', title: '培训方案' },
      { sec_type: '售后实施', title: '售后服务方案（含质保承诺）' },
    ],
    工程: [
      { sec_type: '技术', title: '施工组织设计（技术方案）' },
      { sec_type: '技术', title: '施工进度计划与保障' },
      { sec_type: '商务', title: '商务条款偏离表' },
      { sec_type: '售后实施', title: '质量保证措施与验收方案' },
      { sec_type: '售后实施', title: '安全文明施工方案' },
      { sec_type: '售后实施', title: '售后服务方案（保修期内）' },
    ],
    服务: [
      { sec_type: '技术', title: '服务需求理解与总体方案' },
      { sec_type: '技术', title: '服务实施方案' },
      { sec_type: '技术', title: '服务响应与应急保障方案' },
      { sec_type: '商务', title: '商务条款偏离表' },
      { sec_type: '售后实施', title: '履约保障与持续改进方案' },
      { sec_type: '售后实施', title: '售后（实施）服务方案' },
    ],
  };
  const tail = [
    { sec_type: '商务', title: '业绩证明（同类项目案例）' },
    { sec_type: '商务', title: '其他优惠条件及服务承诺' },
  ];
  return [...base, ...(extra[bidType] || extra.货物), ...tail];
}

/** 生成标书框架：按 货物/工程/服务 生成章节树；售后实施章节自动引用知识库正文预填 */
async function generateFramework(req, res) {
  if (!canEdit(req)) return res.json(forbidden('标书框架生成只能由商务部/销售总监/总经理操作'));
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const meta = parseMeta(bid);
  const bidType = BID_TYPES.includes((req.body || {}).bid_type)
    ? req.body.bid_type
    : (BID_TYPES.includes(meta.bid_type) ? meta.bid_type : '货物');
  const tpl = frameworkTemplate(bidType);
  const ins = db.prepare(`INSERT INTO bid_sections(bid_id,parent_id,seq,section_no,title,content,sec_type,ref_knowledge,updated_by,updated_by_name,updated_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`);
  const empId = resolveEmpId(req);
  const tx = db.transaction(() => {
    if (!(req.body || {}).keep_sections) db.prepare('DELETE FROM bid_sections WHERE bid_id=?').run(bid.id);
    let seq = db.prepare('SELECT COALESCE(MAX(seq),0) m FROM bid_sections WHERE bid_id=?').get(bid.id).m;
    tpl.forEach((s) => {
      let content = '';
      if (s.sec_type === '售后实施') {
        const found = db.prepare('SELECT id,content FROM bid_knowledge WHERE category=? AND (title LIKE ? OR title LIKE ?) ORDER BY builtin DESC LIMIT 1')
          .get(bidType, '%售后%', '%服务方案%');
        if (found) content = found.content;
      }
      ins.run(bid.id, 0, ++seq, '', s.title, content, s.sec_type, null, empId, req.user ? req.user.name : '', now());
    });
  });
  tx();
  meta.bid_type = bidType;
  db.prepare('UPDATE bids SET remark=? WHERE id=?').run(packMeta(meta), bid.id);
  auditLog('BID_FRAMEWORK', req.userId, bid.bid_no, `生成${bidType}类标书框架 ${tpl.length} 章`);
  return res.json(ok({ bid_type: bidType, count: tpl.length }, `已生成 ${bidType}类标书框架 ${tpl.length} 个章节`));
}

/** 章节列表（支持 GET /sections?bid_id= 与 GET /:id/sections 两种写法） */
async function listSections(req, res) {
  const bidId = req.query.bid_id || req.params.id;
  if (!bidId) return res.json(bad('请先选择投标项目'));
  const bid = getBid(bidId);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const rows = db.prepare('SELECT * FROM bid_sections WHERE bid_id=? ORDER BY seq ASC, id ASC').all(bid.id)
    .map((s) => ({ ...s, content_len: String(s.content || '').length }));
  return res.json(ok({ bid: shapeBid(bid), sections: rows }));
}

/** 新增章节 */
async function createSection(req, res) {
  if (!canEdit(req)) return res.json(forbidden('章节维护只能由商务部/销售总监/总经理操作'));
  const b = req.body || {};
  const bid = getBid(b.bid_id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  if (!b.title) return res.json(bad('章节标题必填'));
  const maxSeq = db.prepare('SELECT COALESCE(MAX(seq),0) m FROM bid_sections WHERE bid_id=?').get(bid.id).m;
  const info = db.prepare(`INSERT INTO bid_sections(bid_id,parent_id,seq,section_no,title,content,sec_type,ref_knowledge,updated_by,updated_by_name,updated_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`)
    .run(bid.id, Number(b.parent_id) || 0, maxSeq + 1, b.section_no || '', b.title, b.content || '',
      SEC_TYPES.includes(b.sec_type) ? b.sec_type : '其他', b.ref_knowledge || null,
      resolveEmpId(req), req.user ? req.user.name : '', now());
  auditLog('BID_SECTION_CREATE', req.userId, bid.bid_no, `新增章节：${b.title}`);
  return res.json(ok({ id: info.lastInsertRowid }, '章节已新增'));
}

/** 章节在线编辑（标题/正文/类型/编号） */
async function updateSection(req, res) {
  if (!canEdit(req)) return res.json(forbidden('章节编辑只能由商务部/销售总监/总经理操作'));
  const s = db.prepare('SELECT * FROM bid_sections WHERE id=?').get(req.params.id);
  if (!s) return res.json(notfound('章节不存在'));
  const b = req.body || {};
  db.prepare(`UPDATE bid_sections SET title=?, content=?, sec_type=?, section_no=?, seq=?, updated_by=?, updated_by_name=?, updated_at=? WHERE id=?`)
    .run(b.title !== undefined ? b.title : s.title,
      b.content !== undefined ? b.content : s.content,
      SEC_TYPES.includes(b.sec_type) ? b.sec_type : s.sec_type,
      b.section_no !== undefined ? b.section_no : s.section_no,
      Number(b.seq) || s.seq,
      resolveEmpId(req), req.user ? req.user.name : '', now(), s.id);
  auditLog('BID_SECTION_UPDATE', req.userId, String(s.id), `编辑章节：${s.title}`);
  return res.json(ok(null, '章节已保存'));
}

/** 一键引用知识库条目填充章节正文（对齐参考项目 /sections/:id/apply-kb） */
async function applyKnowledge(req, res) {
  if (!canEdit(req)) return res.json(forbidden('引用知识库只能由商务部/销售总监/总经理操作'));
  const s = db.prepare('SELECT * FROM bid_sections WHERE id=?').get(req.params.id);
  if (!s) return res.json(notfound('章节不存在'));
  const kb = db.prepare('SELECT * FROM bid_knowledge WHERE id=?').get(Number((req.body || {}).knowledge_id));
  if (!kb) return res.json(notfound('知识条目不存在'));
  const content = (s.content || '').trim() ? s.content + '\n\n' + kb.content : kb.content;
  db.prepare('UPDATE bid_sections SET content=?, ref_knowledge=?, updated_by=?, updated_by_name=?, updated_at=? WHERE id=?')
    .run(content, kb.id, resolveEmpId(req), req.user ? req.user.name : '', now(), s.id);
  auditLog('BID_SECTION_KB', req.userId, String(s.id), `引用知识库：${s.title} ← ${kb.title}`);
  return res.json(ok(null, `已引用「${kb.title}」填充章节`));
}

/** 删除章节（级联子章节） */
async function removeSection(req, res) {
  if (!canEdit(req)) return res.json(forbidden('章节删除只能由商务部/销售总监/总经理操作'));
  const s = db.prepare('SELECT * FROM bid_sections WHERE id=?').get(req.params.id);
  if (!s) return res.json(notfound('章节不存在'));
  const children = db.prepare('SELECT COUNT(*) n FROM bid_sections WHERE parent_id=?').get(s.id).n;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bid_sections WHERE parent_id=?').run(s.id);
    db.prepare('DELETE FROM bid_sections WHERE id=?').run(s.id);
  });
  tx();
  auditLog('BID_SECTION_DELETE', req.userId, String(s.id), `删除章节：${s.title}`);
  return res.json(ok({ deleted: 1 + children }, '章节已删除'));
}

/* ---------------- 投标文件（bid_files） ---------------- */

/**
 * 文件列表。
 * 009 的 bid_files 无 file_path/file_size 列，物理文件登记在通用附件表 archive_files
 * （data_type='bid'，ref_id=bid_files.id），此处左连取出大小与路径。
 */
async function listFiles(req, res) {
  let sql = `SELECT bf.*, b.bid_no, b.remark bid_remark, af.file_size, af.file_path, af.file_name real_name
    FROM bid_files bf JOIN bids b ON bf.bid_id=b.id
    LEFT JOIN archive_files af ON af.data_type='bid' AND af.ref_id=bf.id
    WHERE 1=1`;
  const p = [];
  if (req.query.bid_id) { sql += ' AND bf.bid_id=?'; p.push(Number(req.query.bid_id)); }
  if (req.query.status) { sql += ' AND bf.status=?'; p.push(req.query.status); }
  sql += ' ORDER BY bf.id DESC';
  const rows = db.prepare(sql).all(...p).map((f) => ({
    ...f,
    project_name: parseMeta({ remark: f.bid_remark }).project_name || '',
  }));
  return res.json(ok(rows));
}

/** 上传/登记投标文件（multipart 可选 file 字段；未带文件时按纯登记处理） */
async function createFile(req, res) {
  if (!canEdit(req)) return res.json(forbidden('标书上传只能由商务部/销售总监/总经理操作'));
  const b = req.body || {};
  const bid = getBid(b.bid_id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const fileName = (b.file_name || (req.file ? req.file.originalname : '') || '').trim();
  if (!fileName) return res.json(bad('标书文件名为必填项'));
  if (b.doc_type && !DOC_TYPES.includes(b.doc_type)) return res.json(bad(`标书类型须为：${DOC_TYPES.join('/')}`));
  let docId = null;
  if (b.doc_id) {
    const d = db.prepare('SELECT * FROM bid_docs WHERE id=? AND bid_id=?').get(Number(b.doc_id), bid.id);
    if (!d) return res.json(notfound('关联标书任务不存在或不属于该项目'));
    docId = d.id;
  }
  const no = genNo('BF', 'bid_files', 'file_no');
  const info = db.prepare(`INSERT INTO bid_files(bid_id,doc_id,file_no,file_name,doc_type,version,content,status,uploaded_id,uploaded_name,uploaded_at)
    VALUES(?,?,?,?,?,1,?,'待审阅',?,?,?)`)
    .run(bid.id, docId, no, fileName, b.doc_type || '整体标书', b.content || '',
      resolveEmpId(req), req.user ? req.user.name : '', now());
  const fid = info.lastInsertRowid;
  if (req.file) {
    db.prepare(`INSERT INTO archive_files(data_type,ref_id,file_name,file_path,file_size,uploader_id,uploader_name,remark)
      VALUES('bid',?,?,?,?,?,?,?)`)
      .run(fid, req.file.originalname, `/uploads/bid-files/${req.file.filename}`, req.file.size,
        resolveEmpId(req), req.user ? req.user.name : '', '投标文件');
  }
  auditLog('BID_FILE_UPLOAD', req.userId, no, `标书上传：${fileName}（${bid.bid_no}）V1`);
  return res.json(ok({ id: fid, file_no: no }, '标书文件已上传'));
}

/** 整改重传：版本 +1，状态回到待审阅（已通过不可覆盖，对齐参考项目） */
async function updateFile(req, res) {
  if (!canEdit(req)) return res.json(forbidden('标书整改重传只能由商务部/销售总监/总经理操作'));
  const f = db.prepare('SELECT * FROM bid_files WHERE id=?').get(req.params.id);
  if (!f) return res.json(notfound('标书文件不存在'));
  if (f.status === '已通过') return res.json(bad('已通过的标书不可覆盖，请另传新版本文件'));
  const b = req.body || {};
  const version = (f.version || 1) + 1;
  db.prepare(`UPDATE bid_files SET file_name=?, content=?, version=?, status='待审阅', review_comment=NULL,
    uploaded_id=?, uploaded_name=?, uploaded_at=? WHERE id=?`)
    .run(b.file_name || f.file_name, b.content !== undefined ? b.content : f.content, version,
      resolveEmpId(req), req.user ? req.user.name : '', now(), f.id);
  if (req.file) {
    db.prepare("DELETE FROM archive_files WHERE data_type='bid' AND ref_id=?").run(f.id);
    db.prepare(`INSERT INTO archive_files(data_type,ref_id,file_name,file_path,file_size,uploader_id,uploader_name,remark)
      VALUES('bid',?,?,?,?,?,?,?)`)
      .run(f.id, req.file.originalname, `/uploads/bid-files/${req.file.filename}`, req.file.size,
        resolveEmpId(req), req.user ? req.user.name : '', '投标文件整改重传');
  }
  auditLog('BID_FILE_REUPLOAD', req.userId, f.file_no, `标书整改重传：${f.file_name} V${version}`);
  return res.json(ok({ version }, `已重传为 V${version}`));
}

/** 删除标书文件（同时清理物理文件与附件登记） */
async function removeFile(req, res) {
  if (!canEdit(req)) return res.json(forbidden('标书文件删除只能由商务部/销售总监/总经理操作'));
  const f = db.prepare('SELECT * FROM bid_files WHERE id=?').get(req.params.id);
  if (!f) return res.json(notfound('标书文件不存在'));
  const att = db.prepare("SELECT * FROM archive_files WHERE data_type='bid' AND ref_id=?").get(f.id);
  if (att) {
    try { fs.unlinkSync(path.join(__dirname, '..', '..', 'uploads', String(att.file_path || '').replace(/^\/uploads\//, ''))); } catch (e) { /* 文件可能已不存在 */ }
    db.prepare('DELETE FROM archive_files WHERE id=?').run(att.id);
  }
  db.prepare('DELETE FROM bid_files WHERE id=?').run(f.id);
  auditLog('BID_FILE_DELETE', req.userId, f.file_no, `删除标书文件：${f.file_name}`);
  return res.json(ok(null, '已删除'));
}

/* ---------------- 标书知识库（bid_knowledge） ---------------- */

/** 知识库列表：按类别/关键字检索 + 分类统计 */
async function listKnowledge(req, res) {
  const { category, q } = req.query;
  let sql = 'SELECT * FROM bid_knowledge WHERE 1=1';
  const p = [];
  if (category) { sql += ' AND category=?'; p.push(category); }
  if (q) { sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY category, id ASC';
  const rows = db.prepare(sql).all(...p).map((k) => ({ ...k, content_len: String(k.content || '').length }));
  const sums = db.prepare('SELECT category, COUNT(*) n FROM bid_knowledge GROUP BY category').all();
  return res.json(ok({ rows, sums }));
}

/** 新增知识条目（同类别同名判重） */
async function createKnowledge(req, res) {
  if (!canEdit(req)) return res.json(forbidden('知识库维护只能由商务部/销售总监/总经理操作'));
  const b = req.body || {};
  const category = KB_CATEGORIES.includes(b.category) ? b.category : '货物';
  if (!b.title || !b.content) return res.json(bad('标题与内容为必填项'));
  const dup = db.prepare('SELECT id FROM bid_knowledge WHERE category=? AND title=?').get(category, b.title);
  if (dup) return res.json(bad(`知识库已存在「${b.title}」（同类别同名），请直接编辑`));
  const info = db.prepare(`INSERT INTO bid_knowledge(category,topic,title,content,tags,builtin,created_by,created_by_name,created_at)
    VALUES(?,?,?,?,?,0,?,?,datetime('now','localtime'))`)
    .run(category, b.topic || '', b.title, b.content, b.tags || '', resolveEmpId(req), req.user ? req.user.name : '');
  auditLog('BID_KB_CREATE', req.userId, String(info.lastInsertRowid), `新增知识条目：${category}「${b.title}」`);
  return res.json(ok({ id: info.lastInsertRowid }, '知识条目已新增'));
}

/** 编辑知识条目 */
async function updateKnowledge(req, res) {
  if (!canEdit(req)) return res.json(forbidden('知识库维护只能由商务部/销售总监/总经理操作'));
  const k = db.prepare('SELECT * FROM bid_knowledge WHERE id=?').get(req.params.id);
  if (!k) return res.json(notfound('知识条目不存在'));
  const b = req.body || {};
  db.prepare('UPDATE bid_knowledge SET category=?, topic=?, title=?, content=?, tags=?, updated_at=? WHERE id=?')
    .run(KB_CATEGORIES.includes(b.category) ? b.category : k.category,
      b.topic !== undefined ? b.topic : k.topic,
      b.title !== undefined ? b.title : k.title,
      b.content !== undefined ? b.content : k.content,
      b.tags !== undefined ? b.tags : k.tags, now(), k.id);
  auditLog('BID_KB_UPDATE', req.userId, String(k.id), `更新知识条目：${k.title}`);
  return res.json(ok(null, '已保存'));
}

async function removeKnowledge(req, res) {
  if (!canEdit(req)) return res.json(forbidden('知识库维护只能由商务部/销售总监/总经理操作'));
  const k = db.prepare('SELECT * FROM bid_knowledge WHERE id=?').get(req.params.id);
  if (!k) return res.json(notfound('知识条目不存在'));
  db.prepare('DELETE FROM bid_knowledge WHERE id=?').run(k.id);
  auditLog('BID_KB_DELETE', req.userId, String(k.id), `删除知识条目：${k.title}`);
  return res.json(ok(null, '已删除'));
}

/** 一键补种内置知识条目（幂等：按 category+title 判重，对齐参考项目 /knowledge/seed） */
async function seedKnowledge(req, res) {
  if (!canEdit(req)) return res.json(forbidden('知识库补种只能由商务部/销售总监/总经理操作'));
  const has = db.prepare('SELECT id FROM bid_knowledge WHERE category=? AND title=?');
  const ins = db.prepare(`INSERT INTO bid_knowledge(category,topic,title,content,tags,builtin,created_by,created_by_name,created_at)
    VALUES(?,?,?,?,?,1,?,?,datetime('now','localtime'))`);
  let made = 0; let skip = 0;
  const tx = db.transaction(() => {
    KB_SEED.forEach((k) => {
      if (has.get(k.category, k.title)) { skip++; return; }
      ins.run(k.category, k.topic || '', k.title, k.content, k.tags || '', resolveEmpId(req), req.user ? req.user.name : '系统内置');
      made++;
    });
  });
  tx();
  auditLog('BID_KB_SEED', req.userId, 'bid_knowledge', `补种知识库：新增 ${made} 条 / 跳过 ${skip} 条`);
  return res.json(ok({ made, skip, total: KB_SEED.length }, `补种完成：新增 ${made} 条，跳过 ${skip} 条`));
}

/* ---------------- 标书评审（bid_reviews） ---------------- */

/**
 * 009 的 bid_reviews 只有 comment 列，没有 score / conclusion。
 * 约定：comment = 【评分:85】【结论:通过】意见正文，读时用 unpackReview() 拆解。
 */
const packReview = (score, conclusion, comment) => `【评分:${score}】【结论:${conclusion}】${comment}`;
function unpackReview(text) {
  const m = String(text || '').match(/^【评分:(\d+)】【结论:([^】]*)】([\s\S]*)$/);
  if (!m) return { score: null, conclusion: '', comment: String(text || '') };
  return { score: Number(m[1]), conclusion: m[2], comment: m[3] };
}
const REVIEW_CONCLUSIONS = ['通过', '修改后通过', '不通过', '待定'];

/** 评审记录列表（支持 GET /reviews?bid_id= 与 GET /:id/reviews） */
async function listReviews(req, res) {
  const bidId = req.query.bid_id || req.params.id;
  let sql = `SELECT br.*, b.bid_no, b.remark bid_remark, f.file_name
    FROM bid_reviews br JOIN bids b ON br.bid_id=b.id LEFT JOIN bid_files f ON br.file_id=f.id WHERE 1=1`;
  const p = [];
  if (bidId) { sql += ' AND br.bid_id=?'; p.push(Number(bidId)); }
  sql += ' ORDER BY br.id DESC';
  const rows = db.prepare(sql).all(...p).map((r) => {
    const u = unpackReview(r.comment);
    return {
      ...r,
      project_name: parseMeta({ remark: r.bid_remark }).project_name || '',
      score: u.score, conclusion: u.conclusion, comment: u.comment,
    };
  });
  return res.json(ok(rows));
}

/** 新增评审记录（评审人/评分/意见/结论） */
async function addReview(req, res) {
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const b = req.body || {};
  const comment = String(b.comment || '').trim();
  if (!comment) return res.json(bad('审查意见必填'));
  const score = Math.max(0, Math.min(100, Math.round(Number(b.score) || 0)));
  const conclusion = REVIEW_CONCLUSIONS.includes(b.conclusion) ? b.conclusion : '待定';
  const info = db.prepare(`INSERT INTO bid_reviews(bid_id,file_id,reviewer_id,reviewer_name,reviewer_role,comment,created_at)
    VALUES(?,?,?,?,?,?,datetime('now','localtime'))`)
    .run(bid.id, Number(b.file_id) || null, resolveEmpId(req), req.user ? req.user.name : '', roleOf(req),
      packReview(score, conclusion, comment));
  auditLog('BID_REVIEW', req.userId, bid.bid_no, `评审：${score} 分 / ${conclusion}`);
  return res.json(ok({ id: info.lastInsertRowid }, '评审已提交'));
}

async function removeReview(req, res) {
  if (!canEdit(req)) return res.json(forbidden('仅商务部/销售总监/总经理可删除评审记录'));
  const r = db.prepare('SELECT * FROM bid_reviews WHERE id=?').get(req.params.id);
  if (!r) return res.json(notfound('评审记录不存在'));
  db.prepare('DELETE FROM bid_reviews WHERE id=?').run(r.id);
  auditLog('BID_REVIEW_DELETE', req.userId, String(r.id), '删除评审记录');
  return res.json(ok(null, '已删除'));
}

/* ---------------- 查看授权（bid_view_grants） ---------------- */

/** 授权列表（支持 GET /grants?bid_id= 与 GET /:id/grants） */
async function listGrants(req, res) {
  const bidId = req.query.bid_id || req.params.id;
  let sql = `SELECT g.*, b.bid_no, b.remark bid_remark FROM bid_view_grants g JOIN bids b ON g.bid_id=b.id WHERE 1=1`;
  const p = [];
  if (bidId) { sql += ' AND g.bid_id=?'; p.push(Number(bidId)); }
  sql += ' ORDER BY g.id DESC';
  const rows = db.prepare(sql).all(...p).map((g) => ({
    ...g,
    project_name: parseMeta({ remark: g.bid_remark }).project_name || '',
  }));
  return res.json(ok(rows));
}

/** 新增授权：按人（emp_id）或按角色（role → 展开该角色下在职员工） */
async function addGrant(req, res) {
  if (!canEdit(req)) return res.json(forbidden('查看授权只能由商务部/销售总监/总经理操作'));
  const bid = getBid(req.params.id);
  if (!bid) return res.json(notfound('投标项目不存在'));
  const b = req.body || {};
  let targets = [];
  if (b.role) {
    targets = db.prepare("SELECT id, name FROM employees WHERE role=? AND status='在职'").all(b.role);
    if (!targets.length) return res.json(bad(`角色「${b.role}」下没有在职人员`));
  } else if (b.emp_id) {
    const e = db.prepare("SELECT id, name FROM employees WHERE id=? AND status='在职'").get(Number(b.emp_id));
    if (!e) return res.json(notfound('被授权人不存在或已离职'));
    targets = [e];
  } else if (b.emp_name) {
    const e = db.prepare("SELECT id, name FROM employees WHERE name=? AND status='在职'").get(b.emp_name);
    if (!e) return res.json(notfound('被授权人不存在或已离职'));
    targets = [e];
  } else {
    return res.json(bad('请选择被授权人或角色'));
  }
  const exist = db.prepare('SELECT id FROM bid_view_grants WHERE bid_id=? AND emp_id=?');
  const ins = db.prepare(`INSERT INTO bid_view_grants(bid_id,emp_id,emp_name,reason,active,created_at)
    VALUES(?,?,?,?,?,datetime('now','localtime'))`);
  // 参考项目走三级审批后激活；当前项目无审批链，授权即生效（active=1）
  let made = 0; let skip = 0;
  const tx = db.transaction(() => {
    targets.forEach((t) => {
      if (exist.get(bid.id, t.id)) { skip++; return; }
      ins.run(bid.id, t.id, t.name, b.reason || '', 1);
      made++;
    });
  });
  tx();
  auditLog('BID_GRANT', req.userId, bid.bid_no, `授权查看：${targets.map((t) => t.name).join('、').slice(0, 60)}`);
  return res.json(ok({ made, skip }, `已授权 ${made} 人${skip ? `，${skip} 人已存在` : ''}`));
}

/** 启用 / 停用授权 */
async function updateGrant(req, res) {
  if (!canEdit(req)) return res.json(forbidden('授权变更只能由商务部/销售总监/总经理操作'));
  const g = db.prepare('SELECT * FROM bid_view_grants WHERE id=?').get(req.params.id);
  if (!g) return res.json(notfound('授权记录不存在'));
  const active = (req.body || {}).active === false || (req.body || {}).active === 0 ? 0 : 1;
  db.prepare('UPDATE bid_view_grants SET active=?, reason=? WHERE id=?')
    .run(active, (req.body || {}).reason !== undefined ? req.body.reason : g.reason, g.id);
  auditLog('BID_GRANT_UPDATE', req.userId, String(g.id), `${active ? '启用' : '停用'}查看授权`);
  return res.json(ok({ active }, active ? '授权已启用' : '授权已停用'));
}

async function removeGrant(req, res) {
  if (!canEdit(req)) return res.json(forbidden('授权撤销只能由商务部/销售总监/总经理操作'));
  const g = db.prepare('SELECT * FROM bid_view_grants WHERE id=?').get(req.params.id);
  if (!g) return res.json(notfound('授权记录不存在'));
  db.prepare('DELETE FROM bid_view_grants WHERE id=?').run(g.id);
  auditLog('BID_GRANT_DELETE', req.userId, String(g.id), '撤销查看授权');
  return res.json(ok(null, '授权已撤销'));
}

module.exports = {
  options, people, list, stats, create, detail, update, updateStage, updateResult, remove, exportText,
  listDocs, createDoc, updateDoc, removeDoc,
  listSections, createSection, updateSection, applyKnowledge, removeSection, generateFramework,
  listFiles, createFile, updateFile, removeFile,
  listKnowledge, createKnowledge, updateKnowledge, removeKnowledge, seedKnowledge,
  listReviews, addReview, removeReview,
  listGrants, addGrant, updateGrant, removeGrant,
  STAGES, FLOW_STAGES, RESULTS, DOC_TYPES, DOC_STATUS, KB_CATEGORIES, BID_TYPES, SEC_TYPES, REVIEW_CONCLUSIONS,
};
