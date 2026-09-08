/**
 * 统一 API 响应封装。
 *
 * 项目历史上有两套响应格式：
 *   A) utils/response.js  -> { success: true, data, message }
 *   B) compat/helpers.js  -> { code: 200, msg, data }
 * 前端两种写法（r.code === 200 / r.success）都在用。
 * 新模块统一用本文件，一次输出两套字段，两种前端写法都能识别，避免继续分叉。
 */

/** 成功：res.json(ok(...)) */
function ok(data, msg = 'OK') {
  return { code: 200, success: true, msg, message: msg, data: data === undefined ? null : data };
}

/** 成功且带额外顶层字段（列表分页等场景） */
function okWith(data, extra = {}, msg = 'OK') {
  return Object.assign({ code: 200, success: true, msg, message: msg, data }, extra);
}

/** 失败：HTTP 状态码与业务 code 一致 */
function bad(msg, code = 400) {
  return { code, success: false, msg, message: msg, data: null };
}

/** 401 未登录 / 403 无权限 快捷方法 */
const unauth = (msg = '未登录或会话已过期') => bad(msg, 401);
const forbidden = (msg = '无权限执行此操作') => bad(msg, 403);
const notfound = (msg = '记录不存在') => bad(msg, 404);

/**
 * 列表查询辅助：把 req.query 中的非空筛选条件拼成 WHERE 片段
 * @param {Object} query req.query
 * @param {Object} map   { 查询参数名: 'SQL 片段' }，如 { stage: 'o.stage = ?' }
 * @returns {{ where: string, params: any[] }}
 */
function buildWhere(query, map) {
  const where = [];
  const params = [];
  for (const [key, tpl] of Object.entries(map)) {
    const v = query[key];
    if (v === undefined || v === null || v === '') continue;
    if (tpl.includes('LIKE')) params.push('%' + v + '%');
    else params.push(v);
    where.push(tpl);
  }
  return { where: where.length ? ' AND ' + where.join(' AND ') : '', params };
}

/**
 * 分页
 * @returns {{ limit:number, offset:number }}
 */
function pager(query, defaultSize = 20, maxSize = 200) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const size = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { limit: size, offset: (page - 1) * size, page, pageSize: size };
}

/** 生成单号：prefix + yyyymmdd + 4 位序号 */
function makeNo(db, table, prefix, dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const n = db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c + 1;
  return `${prefix}${d}${String(n).padStart(4, '0')}`;
}

/**
 * 取当前登录人在参考项目体系下的员工 ID（employees.id）。
 * auth 中间件已解析好 req.empId；这里做兜底，兼容未走中间件或 employees 未同步的情况。
 */
function empId(req) {
  if (req && req.empId != null) return req.empId;
  const n = Number(req && req.userId);
  return Number.isFinite(n) ? n : null;
}

module.exports = { ok, okWith, bad, unauth, forbidden, notfound, buildWhere, pager, makeNo, empId };
