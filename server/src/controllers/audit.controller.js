/**
 * 审计日志控制器（迁移自参考项目 routes/audit.js，第30轮 #119 + 第59轮归档）
 * 对齐参考项目业务逻辑：
 *  - 查询口径：按时间区间 / 操作人 / 模块 / 动作关键词 组合筛选 + 真 SQL 分页
 *  - 可见范围：仅管理层 + 行政人事负责人（参考项目 GM/VP/IT/ADM），越权返回 403
 *  - 模块与动作下拉**从日志表动态聚合**（第60轮口径），不硬编码，避免与实际写入值脱节
 *  - 归档：审计数据是合规数据「只归档不丢弃」——先写 JSONL 并逐行校验 → SHA256 存证入库 → 再删主表；
 *          只允许归档 30 天前的日志；单次上限 20 万条；删除行数与导出行数不符即回滚
 * 数据表：audit_logs / audit_archives（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目角色/字段约束）：
 *  1) 参考项目角色码 GM/VP/IT/ADM → 当前项目中文角色：总经理 / 副总 / 超级管理员 / 行政人事部负责人（部门经理且部门含「行政」）；
 *  2) 当前项目运行期另有 utils/audit 写入的 audit_log 表（登录/业务操作留痕），为免审计页空白，
 *     查询以 audit_logs 为主并 UNION audit_log（module 统一记为「系统」），归档只针对 audit_logs 主表。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量 ==================== */
/** 可查询审计日志的角色（题目要求：总经理、副总、行政人事部负责人、超级管理员） */
const AUDIT_ROLES = ['总经理', '副总', '超级管理员', '行政人事部负责人', '行政人事部经理', '信息管理'];
/** 可执行归档的角色（对齐参考项目 GM/ADM） */
const ARCHIVE_ROLES = ['总经理', '超级管理员', '行政人事部负责人', '行政人事部经理'];

const ARCHIVE_DIR = path.join(__dirname, '..', '..', 'data', 'audit_archive');
const ARCHIVE_MAX_ROWS = 200000;
const ARCHIVE_MIN_AGE_DAYS = 30;
const FILE_RE = /^audit_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}(_\d+)?\.jsonl$/;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** 权限判定：角色白名单，或「行政部门 + 经理/负责人」 */
function canAudit(user) {
  if (!user) return false;
  if (AUDIT_ROLES.includes(user.role)) return true;
  const dept = user.dept || '';
  return dept.includes('行政') && /(经理|负责人|主管)/.test(user.role || '');
}
function canArchive(user) {
  if (!user) return false;
  if (ARCHIVE_ROLES.includes(user.role)) return true;
  const dept = user.dept || '';
  return dept.includes('行政') && /(经理|负责人)/.test(user.role || '');
}

/**
 * 统一数据源：audit_logs（009 参考口径）+ audit_log（当前项目运行期留痕）合并
 * legacy 行无 module，统一记为「系统」，便于按模块筛选
 */
const CTE = `WITH all_logs AS (
  SELECT id, emp_no, emp_name, role, module, action, detail, ip, created_at, 'ref' src FROM audit_logs
  UNION ALL
  SELECT l.id, l.user_id emp_no, COALESCE(u.name, l.user_id) emp_name, COALESCE(u.role,'') role,
         '系统' module, l.action, COALESCE(l.detail,'') detail, '' ip, l.timestamp created_at, 'legacy' src
  FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
)`;

/** 统一筛选条件（列表 / 导出 / 统计共用，避免两处逻辑漂移） */
function buildWhere(q) {
  const where = [];
  const args = [];
  if (q.emp_no) { where.push('emp_no LIKE ?'); args.push('%' + String(q.emp_no).trim() + '%'); }
  if (q.operator) { where.push('emp_name LIKE ?'); args.push('%' + String(q.operator).trim() + '%'); }
  if (q.module) { where.push('module=?'); args.push(String(q.module).trim()); }
  if (q.action) { where.push('action LIKE ?'); args.push('%' + String(q.action).trim() + '%'); }
  if (q.keyword) {
    const k = '%' + String(q.keyword).trim() + '%';
    where.push('(detail LIKE ? OR emp_name LIKE ? OR module LIKE ? OR action LIKE ? OR emp_no LIKE ?)');
    args.push(k, k, k, k, k);
  }
  if (q.from) { where.push('created_at>=?'); args.push(String(q.from).trim()); }
  if (q.to) { where.push('created_at<=?'); args.push(String(q.to).trim() + ' 23:59:59'); }
  return { wsql: where.length ? ' WHERE ' + where.join(' AND ') : '', args };
}

/* ==================== 查询 ==================== */
async function logs(req, res) {
  if (!canAudit(req.user)) return res.json(forbidden('仅总经理、副总、行政人事部负责人、超级管理员可查询审计日志'));
  const q = req.query || {};
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(q.pageSize, 10) || 20));
  const { wsql, args } = buildWhere(q);
  const total = (db.prepare(`${CTE} SELECT COUNT(*) n FROM all_logs${wsql}`).get(...args) || {}).n || 0;
  const rows = db.prepare(`${CTE} SELECT * FROM all_logs${wsql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize);
  return res.json(ok({ total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), rows }));
}

/** 模块下拉（动态聚合，带条数） */
async function modules(req, res) {
  if (!canAudit(req.user)) return res.json(forbidden('无权限查看审计模块'));
  return res.json(ok(db.prepare(`${CTE} SELECT module name, COUNT(*) n FROM all_logs GROUP BY module ORDER BY n DESC, module ASC`).all()));
}

/** 动作下拉（按模块联动，带条数） */
async function actions(req, res) {
  if (!canAudit(req.user)) return res.json(forbidden('无权限查看审计动作'));
  const mod = String((req.query || {}).module || '').trim();
  const sql = mod
    ? `${CTE} SELECT action name, COUNT(*) n FROM all_logs WHERE module=? GROUP BY action ORDER BY n DESC, action ASC`
    : `${CTE} SELECT action name, COUNT(*) n FROM all_logs GROUP BY action ORDER BY n DESC, action ASC`;
  return res.json(ok(db.prepare(sql).all(...(mod ? [mod] : []))));
}

/** 概览统计 */
async function stats(req, res) {
  if (!canAudit(req.user)) return res.json(forbidden('无权限查看审计统计'));
  const one = (sql, ...p) => (db.prepare(sql).get(...p) || {}).n || 0;
  const agg = db.prepare(`${CTE} SELECT COUNT(*) total, MIN(created_at) oldest, MAX(created_at) newest FROM all_logs`).get();
  const byModule = db.prepare(`${CTE} SELECT module, COUNT(*) n FROM all_logs GROUP BY module ORDER BY n DESC LIMIT 10`).all();
  const byDay = db.prepare(`${CTE} SELECT substr(created_at,1,10) d, COUNT(*) n FROM all_logs GROUP BY d ORDER BY d DESC LIMIT 14`).all();
  return res.json(ok({
    total: agg.total || 0, oldest: agg.oldest, newest: agg.newest,
    today: one(`${CTE} SELECT COUNT(*) n FROM all_logs WHERE substr(created_at,1,10)=?`, today()),
    week: one(`${CTE} SELECT COUNT(*) n FROM all_logs WHERE created_at>=?`, daysAgo(7)),
    byModule, byDay,
    archives: one('SELECT COUNT(*) n FROM audit_archives'),
    archive_min_age_days: ARCHIVE_MIN_AGE_DAYS,
    can_archive: canArchive(req.user),
    dir: 'server/data/audit_archive/',
  }));
}

/* ==================== 归档 ==================== */
function listArchiveFiles() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return [];
    return fs.readdirSync(ARCHIVE_DIR).filter((f) => FILE_RE.test(f)).map((f) => {
      let size = 0; let lines = 0;
      try { size = fs.statSync(path.join(ARCHIVE_DIR, f)).size; } catch (e) { /* ignore */ }
      try { lines = fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8').split('\n').filter((x) => x.trim()).length; } catch (e) { /* ignore */ }
      const rec = db.prepare('SELECT * FROM audit_archives WHERE file_name=?').get(f) || null;
      return {
        file: f, size, lines, registered: !!rec,
        sha256: rec ? rec.sha256 : null,
        from_date: rec ? rec.from_date : null,
        to_date: rec ? rec.to_date : null,
        rows: rec ? rec.rows : null,
        archived_by: rec ? rec.archived_by_name : null,
        archived_at: rec ? rec.created_at : null,
      };
    }).sort((a, b) => (a.file < b.file ? 1 : -1));
  } catch (e) { return []; }
}
const sha256File = (fp) => crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');

/** 归档清单（含磁盘文件与存证核对） */
async function archives(req, res) {
  if (!canAudit(req.user)) return res.json(forbidden('无权限查看审计归档'));
  const files = listArchiveFiles();
  const onDisk = new Set(files.map((f) => f.file));
  const lost = db.prepare('SELECT file_name, rows, sha256, created_at FROM audit_archives').all()
    .filter((x) => !onDisk.has(x.file_name))
    .map((x) => ({ file: x.file_name, rows: x.rows, sha256: x.sha256, archived_at: x.created_at }));
  return res.json(ok({ files, lost, total: files.length }));
}

/** 归档预览（只算不动数据） */
async function archivePreview(req, res) {
  if (!canArchive(req.user)) return res.json(forbidden('仅总经理与行政人事部负责人可执行审计归档'));
  const before = String((req.query || {}).before || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) return res.json(bad('before 须为 YYYY-MM-DD 日期'));
  const min = daysAgo(ARCHIVE_MIN_AGE_DAYS);
  if (before > min) return res.json(bad(`只允许归档 ${ARCHIVE_MIN_AGE_DAYS} 天前（${min} 及更早）的日志，近期留痕保持随时可查`));
  const agg = db.prepare('SELECT COUNT(*) n, MIN(created_at) oldest, MAX(created_at) newest FROM audit_logs WHERE created_at < ?')
    .get(before + ' 00:00:00');
  return res.json(ok({ before, count: agg.n || 0, oldest: agg.oldest, newest: agg.newest }));
}

/** 执行归档：JSONL 落盘 → 逐行校验 → SHA256 存证 → 事务删主表（行数不符回滚） */
async function archiveRun(req, res) {
  if (!canArchive(req.user)) return res.json(forbidden('仅总经理与行政人事部负责人可执行审计归档'));
  const before = String((req.body || {}).before || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) return res.json(bad('before 须为 YYYY-MM-DD 日期'));
  const min = daysAgo(ARCHIVE_MIN_AGE_DAYS);
  if (before > min) return res.json(bad(`只允许归档 ${ARCHIVE_MIN_AGE_DAYS} 天前（${min} 及更早）的日志`));
  const cutoff = before + ' 00:00:00';

  const rows = db.prepare('SELECT * FROM audit_logs WHERE created_at < ? ORDER BY id ASC').all(cutoff);
  if (!rows.length) return res.json(bad('该日期前没有可归档的审计日志'));
  if (rows.length > ARCHIVE_MAX_ROWS) return res.json(bad(`待归档 ${rows.length} 条超过单次上限 ${ARCHIVE_MAX_ROWS}，请按更近的日期分批归档`));

  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const fromD = String(rows[0].created_at || '').slice(0, 10) || 'unknown';
  const toD = String(rows[rows.length - 1].created_at || '').slice(0, 10) || before;
  const base = path.join(ARCHIVE_DIR, `audit_${fromD}_${toD}.jsonl`);
  let target = base; let k = 2;
  while (fs.existsSync(target)) target = base.replace(/\.jsonl$/, `_${k++}.jsonl`);
  const tmp = target + '.tmp' + Date.now();
  try {
    fs.writeFileSync(tmp, rows.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
    const back = fs.readFileSync(tmp, 'utf8').split('\n').filter((x) => x.trim());
    if (back.length !== rows.length) throw new Error(`落盘校验失败：文件 ${back.length} 行 ≠ 待归档 ${rows.length} 条`);
    back.forEach((line) => JSON.parse(line));
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
    return res.json(bad('归档文件写入/校验失败，主表未动：' + e.message));
  }
  let deleted = 0;
  try {
    deleted = db.transaction(() => {
      const chg = db.prepare('DELETE FROM audit_logs WHERE created_at < ?').run(cutoff).changes;
      if (chg !== rows.length) throw new Error(`删除行数 ${chg} ≠ 导出行数 ${rows.length}`);
      return chg;
    })();
  } catch (e) {
    return res.json(bad('主表清理失败已回滚（归档文件保留，数据无损失）：' + e.message));
  }
  const sz = fs.statSync(target).size;
  const digest = sha256File(target);
  db.prepare(`INSERT INTO audit_archives(file_name,from_date,to_date,rows,size_bytes,sha256,archived_by,archived_by_name)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(file_name) DO UPDATE SET rows=excluded.rows, size_bytes=excluded.size_bytes, sha256=excluded.sha256,
      archived_by=excluded.archived_by, archived_by_name=excluded.archived_by_name, created_at=datetime('now','localtime')`)
    .run(path.basename(target), fromD, toD, deleted, sz, digest,
      String((req.user && req.user.id) || ''), (req.user && req.user.name) || '');
  audit('AUDIT_ARCHIVE', req.userId, path.basename(target), `归档 ${deleted} 条（${fromD}~${toD}），SHA256 ${digest.slice(0, 16)}…`);
  return res.json(ok({
    file: path.basename(target), archived: deleted,
    sizeMB: Math.round((sz / 1048576) * 100) / 100, sha256: digest,
    from_date: fromD, to_date: toD,
  }, `已归档 ${deleted} 条审计日志`));
}

/** 归档文件完整性校验（重算 SHA256 与存证比对） */
async function archiveVerify(req, res) {
  if (!canArchive(req.user)) return res.json(forbidden('仅总经理与行政人事部负责人可校验归档'));
  const f = String((req.body || {}).file || (req.query || {}).file || '').trim();
  if (!FILE_RE.test(f)) return res.json(bad('非法文件名'));
  const rec = db.prepare('SELECT * FROM audit_archives WHERE file_name=?').get(f);
  if (!rec) return res.json(notfound('该文件无存证记录'));
  const fp = path.join(ARCHIVE_DIR, path.basename(f));
  if (!fs.existsSync(fp)) return res.json(notfound('归档文件已丢失（存证仍在库），请立即排查'));
  const actual = sha256File(fp);
  const match = actual === rec.sha256;
  audit('AUDIT_ARCHIVE_VERIFY', req.userId, f, match ? 'SHA256 与存证一致' : 'SHA256 与存证不一致（疑似被篡改/损坏！）');
  return res.json(ok({ file: f, match, stored: rec.sha256, actual, rowsStored: rec.rows }));
}

module.exports = { logs, modules, actions, stats, archives, archivePreview, archiveRun, archiveVerify, canAudit };
