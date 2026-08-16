/**
 * 财务后台配置路由 (PRD 第九章)
 * 功能: 财务参数、费用标准、流程自定义、编码规则、消息模板、接口参数
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, genId } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 权限检查: 仅管理员/财务负责人可操作 =====
function requireAdmin(req, res, next) {
  const u = req.user;
  if (u.role !== '超级管理员' && u.role !== '总经理' &&
      !(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理'))) {
    return error(res, 403, '仅管理员或财务负责人可管理配置');
  }
  next();
}

// ========== API 端点 ==========

// 配置列表
router.get('/', (req, res) => {
  const { type, category, keyword, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM t_finance_config WHERE 1=1';
  const params = [];

  if (type && type !== 'all') { sql += ' AND config_type = ?'; params.push(type); }
  if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
  if (keyword) { sql += ' AND (config_key LIKE ? OR description LIKE ? OR category LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  sql += ' ORDER BY config_type, category, config_key';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 获取单个配置
router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_config WHERE config_key = ?').get(req.params.key);
  if (!row) return error(res, 404, '配置不存在');
  return success(res, row);
});

// 新增配置
router.post('/', requireAdmin, (req, res) => {
  const { config_key, config_value = '', config_type = '参数', category = '', description = '', status = '启用' } = req.body;
  if (!config_key) return error(res, 400, '配置键必填');

  const existing = db.prepare('SELECT id FROM t_finance_config WHERE config_key = ?').get(config_key);
  if (existing) return error(res, 409, '配置键已存在');

  const id = genId('CFG');
  db.prepare(
    `INSERT INTO t_finance_config (id, config_key, config_value, config_type, category, description, is_system, status, updated_by, updated_by_id)
     VALUES (?,?,?,?,?,0,?,?,?,?)`
  ).run(id, config_key, config_value, config_type, category, description, status, req.user.name, req.user.id);
  return success(res, { id }, '配置已创建');
});

// 更新配置
router.put('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM t_finance_config WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '配置不存在');

  const { config_value, config_type, category, description, status } = req.body;
  db.prepare(
    `UPDATE t_finance_config SET config_value=?, config_type=?, category=?, description=?, status=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    config_value !== undefined ? config_value : existing.config_value,
    config_type || existing.config_type,
    category || existing.category,
    description !== undefined ? description : existing.description,
    status || existing.status,
    req.user.name, req.user.id, req.params.id
  );
  return success(res, { id: req.params.id }, '配置已更新');
});

// 删除配置(仅非系统内置)
router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT is_system FROM t_finance_config WHERE id = ?').get(req.params.id);
  if (!existing) return error(res, 404, '配置不存在');
  if (existing.is_system === 1) return error(res, 400, '系统内置配置不可删除');
  db.prepare('DELETE FROM t_finance_config WHERE id = ?').run(req.params.id);
  return success(res, null, '配置已删除');
});

// 批量更新配置
router.put('/batch/update', requireAdmin, (req, res) => {
  const { configs } = req.body;
  if (!configs || !Array.isArray(configs) || configs.length === 0) return error(res, 400, '请提供配置列表');

  const stmt = db.prepare(
    `UPDATE t_finance_config SET config_value=?, updated_by=?, updated_by_id=?, updated_at=datetime('now','localtime') WHERE config_key=?`
  );
  let updated = 0;
  configs.forEach(c => {
    if (c.config_key && c.config_value !== undefined) {
      const result = stmt.run(c.config_value, req.user.name, req.user.id, c.config_key);
      if (result.changes > 0) updated++;
    }
  });
  return success(res, { updated }, `已更新${updated}项配置`);
});

// 电子签章记录列表
router.get('/seals/list', (req, res) => {
  const { source_type, seal_status, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_seal WHERE 1=1';
  const params = [];
  if (source_type && source_type !== 'all') { sql += ' AND source_type = ?'; params.push(source_type); }
  if (seal_status && seal_status !== 'all') { sql += ' AND seal_status = ?'; params.push(seal_status); }
  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;
  const rows = db.prepare(sql).all(...params);
  return success(res, { list: rows, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 创建签章记录
router.post('/seals', requireAdmin, (req, res) => {
  const { source_type, source_id, source_form_no, pdf_path, seal_type = '公章', seal_position = '正文', remark = '' } = req.body;
  if (!source_type || !source_id) return error(res, 400, '缺少源单据参数');

  const id = genId('SEAL');
  const sealNo = genId('QZ');

  // 生成模拟哈希
  const crypto = require('crypto');
  const hashValue = crypto.createHash('sha256').update(`${source_id}${sealNo}${Date.now()}`).digest('hex');

  db.prepare(
    `INSERT INTO t_finance_seal
     (id, seal_no, source_type, source_id, source_form_no, pdf_path, seal_type, seal_position,
      seal_image, timestamp_server, timestamp_token, hash_value, seal_status, seal_date, operator, operator_id, remark)
     VALUES (?,?,?,?,?,?,?,?,?,'','',?,?,'',?,?,?)`
  ).run(
    id, sealNo, source_type, source_id, source_form_no || '', pdf_path || '',
    seal_type, seal_position, '', hashValue, '待签章', req.user.name, req.user.id, remark
  );

  return success(res, { id, seal_no: sealNo, hash_value: hashValue }, '签章记录已创建');
});

// 执行签章(模拟)
router.post('/seals/:id/execute', requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM t_finance_seal WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '签章记录不存在');
  if (item.seal_status === '已签章') return error(res, 400, '该记录已签章');

  // 模拟签章
  const sealDate = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
  const timestampToken = `TS-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  db.prepare(
    `UPDATE t_finance_seal SET seal_status='已签章', seal_date=?, timestamp_server='ts.zhuomeng.com', timestamp_token=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(sealDate, timestampToken, req.params.id);

  return success(res, { seal_status: '已签章', seal_date: sealDate, timestamp_token: timestampToken }, '签章执行成功');
});

// 作废签章
router.post('/seals/:id/cancel', requireAdmin, (req, res) => {
  const item = db.prepare('SELECT seal_status FROM t_finance_seal WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '签章记录不存在');
  if (item.seal_status !== '已签章') return error(res, 400, '仅已签章可作废');
  db.prepare("UPDATE t_finance_seal SET seal_status='已作废', updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  return success(res, null, '签章已作废');
});

module.exports = router;
