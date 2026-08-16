/**
 * 合同模板库 API 路由 (contract_template)
 *
 * 功能：
 * - 模板CRUD + 版本控制（修改保留版本记录，旧版标记失效，不直接删除）
 * - 模板文件上传/下载（PDF/Word）
 * - 启用/禁用状态切换
 * - 历史版本恢复
 *
 * 权限模型：
 * - 查看/下载：所有登录用户（经办人可查看、选用模板发起新合同）
 * - 创建/修改/上传：法务专员 OR 超级管理员/总经理/副总 OR 行政部部门经理
 * - 删除：超级管理员/总经理 + 模板必须先禁用
 * - 恢复版本：同创建/修改权限
 *
 * 路由前缀：/api/contract-template
 */

'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../../compat/database');
const { success, error, genId, safeParse, now } = require('../../compat/helpers');
const { authMiddleware } = require('../../compat/auth');

// 所有接口都需要登录
router.use(authMiddleware);

// ============================================================
// 文件上传配置
// ============================================================
const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads', 'templates');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'TPL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PDF/Word 文件格式'));
    }
  }
});

// ============================================================
// 权限检查工具函数
// ============================================================

/**
 * 检查用户是否有模板维护权限
 * 仅行政部可管理合同模板库
 */
function canManageTemplate(user) {
  if (user.role === '超级管理员') return true;
  return user.dept === '行政部';
}

/**
 * 检查用户是否有删除权限
 */
function canDeleteTemplate(user) {
  if (user.role === '超级管理员') return true;
  return user.dept === '行政部';
}

/**
 * 构建模板修改审批流程
 * 行政部提交 → 行政部负责人审批 → 总经理审批 → 自动生效
 */
function buildTemplateApprovalFlow(applicant) {
  const t = now();
  const done = { step: '提交修改申请', role: 'applicant', user: applicant.name, time: t, done: true, opinion: '提交申请' };
  const todo = (step, role) => ({ step, role, user: '', time: '—', done: false, opinion: '' });
  return [
    done,
    todo('行政部负责人审核', 'deptLeader'),
    todo('副总审批', 'deputy'),
    todo('总经理审批', 'gm'),
    todo('系统自动生效入库', 'system')
  ];
}

/**
 * 模板审批角色匹配（越级拦截）
 */
function matchTemplateApprovalRole(u, role) {
  if (u.role === '超级管理员') return true;
  switch (role) {
    case 'deptLeader':
      return u.role === '部门经理' && u.dept === '行政部';
    case 'deputy':
      return u.role === '副总';
    case 'gm':
      return u.role === '总经理';
    case 'system':
      return true; // 系统自动完成
    default:
      return false;
  }
}

/**
 * 记录模板操作日志到 t_contract_audit_log
 */
function logTemplateAction(templateId, user, actionType, detail) {
  try {
    db.prepare(
      `INSERT INTO t_contract_audit_log (contract_id, user_id, user_name, user_dept, action_type, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(templateId, user.id, user.name, user.dept, actionType, detail || '');
  } catch (e) {
    console.error('[contract_template] logTemplateAction error:', e);
  }
}

/**
 * 保存当前模板版本到历史表
 */
function saveVersionSnapshot(template, user, changeDesc) {
  const versionId = genId('TPLV');
  db.prepare(
    `INSERT INTO contract_template_versions
      (id, template_id, version_num, name, category, content, fields,
       template_file, file_type, applicable_dept, status,
       operator, operator_id, change_desc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    versionId,
    template.id,
    template.version || 1,
    template.name,
    template.category || '',
    template.content || '',
    template.fields || '[]',
    template.template_file || '',
    template.file_type || '',
    template.applicable_dept || '',
    template.status || '启用',
    user.name,
    user.id,
    changeDesc || '版本保存'
  );
}

// ============================================================
// GET / - 模板列表（支持筛选，排除已软删除和历史版本）
// ============================================================
router.get('/', (req, res) => {
  try {
    const { category, dept, status, keyword } = req.query;

    let sql = `SELECT id, name, category, content, fields, creator, creator_id,
               status, applicable_dept, template_file, file_type, version,
               parent_id, is_latest, is_deleted, created_at, updated_at
               FROM contract_templates
               WHERE is_deleted = 0 AND is_latest = 1`;
    const params = [];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    if (dept) {
      // applicable_dept 为空表示适用于所有部门
      sql += ` AND (applicable_dept = '' OR applicable_dept LIKE ?)`;
      params.push('%' + dept + '%');
    }
    if (keyword) {
      sql += ` AND name LIKE ?`;
      params.push('%' + keyword + '%');
    }

    sql += ` ORDER BY updated_at DESC`;

    const templates = db.prepare(sql).all(...params);

    const result = templates.map(t => ({
      ...t,
      fields: safeParse(t.fields, []),
      applicable_dept: t.applicable_dept ? t.applicable_dept.split(',').filter(Boolean) : []
    }));

    // 统计
    const stats = {
      total: result.length,
      enabled: result.filter(t => t.status === '启用').length,
      disabled: result.filter(t => t.status === '禁用').length,
      byCategory: {}
    };
    result.forEach(t => {
      const cat = t.category || '未分类';
      if (!stats.byCategory[cat]) stats.byCategory[cat] = 0;
      stats.byCategory[cat]++;
    });

    return success(res, { stats, templates: result });
  } catch (e) {
    console.error('[contract_template] GET / error:', e);
    return error(res, 500, '获取模板列表失败: ' + e.message);
  }
});

// ============================================================
// GET /categories - 获取所有模板分类（用于下拉筛选）
// ============================================================
router.get('/categories', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT DISTINCT category FROM contract_templates
       WHERE is_deleted = 0 AND is_latest = 1 AND category != ''
       ORDER BY category`
    ).all();
    return success(res, rows.map(r => r.category));
  } catch (e) {
    return error(res, 500, '获取分类列表失败: ' + e.message);
  }
});

// ============================================================
// GET /:id - 模板详情
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const tpl = db.prepare(
      `SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0`
    ).get(id);

    if (!tpl) {
      return error(res, 404, '模板不存在或已被删除');
    }

    tpl.fields = safeParse(tpl.fields, []);
    tpl.applicable_dept = tpl.applicable_dept ? tpl.applicable_dept.split(',').filter(Boolean) : [];

    // 获取版本数
    const versionCount = db.prepare(
      'SELECT COUNT(*) as c FROM contract_template_versions WHERE template_id = ?'
    ).get(id).c;

    tpl.version_count = versionCount;

    // 记录查看日志
    logTemplateAction(id, req.user, '查看模板', `查看模板「${tpl.name}」`);

    return success(res, tpl);
  } catch (e) {
    console.error('[contract_template] GET /:id error:', e);
    return error(res, 500, '获取模板详情失败: ' + e.message);
  }
});

// ============================================================
// GET /:id/versions - 获取模板版本历史
// ============================================================
router.get('/:id/versions', (req, res) => {
  try {
    const { id } = req.params;

    // 确认模板存在
    const tpl = db.prepare('SELECT id, name FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!tpl) {
      return error(res, 404, '模板不存在或已被删除');
    }

    const versions = db.prepare(
      `SELECT id, template_id, version_num, name, category, content, fields,
              template_file, file_type, applicable_dept, status,
              operator, operator_id, change_desc, created_at
       FROM contract_template_versions
       WHERE template_id = ?
       ORDER BY version_num DESC`
    ).all(id);

    const result = versions.map(v => ({
      ...v,
      fields: safeParse(v.fields, []),
      applicable_dept: v.applicable_dept ? v.applicable_dept.split(',').filter(Boolean) : []
    }));

    return success(res, { total: result.length, versions: result });
  } catch (e) {
    console.error('[contract_template] GET /:id/versions error:', e);
    return error(res, 500, '获取版本历史失败: ' + e.message);
  }
});

// ============================================================
// POST / - 创建模板（需提交审批，审批通过后入库）
// ============================================================
router.post('/', (req, res) => {
  try {
    if (!canManageTemplate(req.user)) {
      return error(res, 403, '无权限创建合同模板，仅行政部可操作');
    }

    const { name, category, content, fields, applicable_dept } = req.body;

    if (!name || !name.trim()) {
      return error(res, 400, '模板名称不能为空');
    }

    const fieldsJson = JSON.stringify(fields || []);
    const deptStr = Array.isArray(applicable_dept) ? applicable_dept.join(',') : (applicable_dept || '');

    // 创建审批申请
    const approvalId = genId('TPA');
    const steps = buildTemplateApprovalFlow(req.user);
    const changeData = JSON.stringify({
      name: name.trim(),
      category: category || '',
      content: content || '',
      fields: fieldsJson,
      applicable_dept: deptStr
    });

    db.prepare(
      `INSERT INTO t_template_approval
        (id, template_id, template_name, change_type, change_data, snapshot_data,
         reason, status, current_step, steps, applicant_id, applicant_name, applicant_dept, approver_log, created_at, updated_at)
       VALUES (?, '', ?, 'create', ?, '{}', ?, '审批中', 1, ?, ?, ?, ?, '[]', ?, ?)`
    ).run(
      approvalId, name.trim(), changeData,
      req.body.reason || '新增合同模板',
      JSON.stringify(steps),
      req.user.id, req.user.name, req.user.dept,
      now(), now()
    );

    logTemplateAction(approvalId, req.user, '提交模板创建审批', `申请创建模板「${name.trim()}」，待行政部负责人及总经理审批`);

    return success(res, { id: approvalId, status: '审批中' }, '模板创建申请已提交，待行政部负责人及总经理逐级审批后入库');
  } catch (e) {
    console.error('[contract_template] POST / error:', e);
    return error(res, 500, '创建模板失败: ' + e.message);
  }
});

// ============================================================
// PUT /:id - 更新模板（需提交审批，审批通过后生效）
// ============================================================
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!canManageTemplate(req.user)) {
      return error(res, 403, '无权限修改合同模板，仅行政部可操作');
    }

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!existing) {
      return error(res, 404, '模板不存在或已被删除');
    }

    // 检查是否已有待审批的修改申请
    const pendingApproval = db.prepare(
      `SELECT id FROM t_template_approval WHERE template_id = ? AND status = '审批中'`
    ).get(id);
    if (pendingApproval) {
      return error(res, 400, '该模板已有待审批的修改申请，请等待审批完成后再提交');
    }

    const { name, category, content, fields, applicable_dept, change_desc } = req.body;

    // 构建变更数据
    const changeData = {};
    if (name !== undefined) changeData.name = name.trim();
    if (category !== undefined) changeData.category = category;
    if (content !== undefined) changeData.content = content;
    if (fields !== undefined) changeData.fields = JSON.stringify(fields);
    if (applicable_dept !== undefined) {
      changeData.applicable_dept = Array.isArray(applicable_dept) ? applicable_dept.join(',') : (applicable_dept || '');
    }

    // 保存变更前快照
    const snapshot = {
      name: existing.name,
      category: existing.category,
      content: existing.content,
      fields: existing.fields,
      applicable_dept: existing.applicable_dept,
      version: existing.version
    };

    // 创建审批申请
    const approvalId = genId('TPA');
    const steps = buildTemplateApprovalFlow(req.user);

    db.prepare(
      `INSERT INTO t_template_approval
        (id, template_id, template_name, change_type, change_data, snapshot_data,
         reason, status, current_step, steps, applicant_id, applicant_name, applicant_dept, approver_log, created_at, updated_at)
       VALUES (?, ?, ?, 'modify', ?, ?, ?, '审批中', 1, ?, ?, ?, ?, '[]', ?, ?)`
    ).run(
      approvalId, id, existing.name,
      JSON.stringify(changeData),
      JSON.stringify(snapshot),
      change_desc || `修改模板「${existing.name}」`,
      JSON.stringify(steps),
      req.user.id, req.user.name, req.user.dept,
      now(), now()
    );

    logTemplateAction(id, req.user, '提交模板修改审批', `申请修改模板「${existing.name}」，待审批后生效`);

    return success(res, { id: approvalId, template_id: id, status: '审批中' }, '模板修改申请已提交，待行政部负责人及总经理逐级审批后生效');
  } catch (e) {
    console.error('[contract_template] PUT /:id error:', e);
    return error(res, 500, '提交修改申请失败: ' + e.message);
  }
});

// ============================================================
// PUT /:id/status - 切换启用/禁用状态（需提交审批）
// ============================================================
router.put('/:id/status', (req, res) => {
  try {
    const { id } = req.params;

    if (!canManageTemplate(req.user)) {
      return error(res, 403, '无权限修改模板状态，仅行政部可操作');
    }

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!existing) {
      return error(res, 404, '模板不存在或已被删除');
    }

    // 检查是否已有待审批
    const pendingApproval = db.prepare(
      `SELECT id FROM t_template_approval WHERE template_id = ? AND status = '审批中'`
    ).get(id);
    if (pendingApproval) {
      return error(res, 400, '该模板已有待审批的申请，请等待审批完成后再提交');
    }

    const newStatus = existing.status === '启用' ? '禁用' : '启用';

    // 创建审批申请
    const approvalId = genId('TPA');
    const steps = buildTemplateApprovalFlow(req.user);

    db.prepare(
      `INSERT INTO t_template_approval
        (id, template_id, template_name, change_type, change_data, snapshot_data,
         reason, status, current_step, steps, applicant_id, applicant_name, applicant_dept, approver_log, created_at, updated_at)
       VALUES (?, ?, ?, 'status_toggle', ?, ?, ?, '审批中', 1, ?, ?, ?, ?, '[]', ?, ?)`
    ).run(
      approvalId, id, existing.name,
      JSON.stringify({ new_status: newStatus }),
      JSON.stringify({ status: existing.status }),
      `模板状态切换：${existing.status} → ${newStatus}`,
      JSON.stringify(steps),
      req.user.id, req.user.name, req.user.dept,
      now(), now()
    );

    logTemplateAction(id, req.user, '提交模板状态审批', `申请切换模板「${existing.name}」状态：${existing.status} → ${newStatus}`);

    return success(res, { id: approvalId, template_id: id, status: '审批中' }, `状态切换申请已提交，待审批后生效`);
  } catch (e) {
    console.error('[contract_template] PUT /:id/status error:', e);
    return error(res, 500, '提交状态切换申请失败: ' + e.message);
  }
});

// ============================================================
// DELETE /:id - 软删除模板（需提交审批）
// ============================================================
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!canDeleteTemplate(req.user)) {
      return error(res, 403, '无权限删除合同模板，仅行政部可操作');
    }

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!existing) {
      return error(res, 404, '模板不存在或已被删除');
    }

    // 启用状态的模板不可删除，需先禁用
    if (existing.status === '启用') {
      return error(res, 400, '启用状态的模板不可删除，请先禁用后再删除');
    }

    // 检查是否已有待审批
    const pendingApproval = db.prepare(
      `SELECT id FROM t_template_approval WHERE template_id = ? AND status = '审批中'`
    ).get(id);
    if (pendingApproval) {
      return error(res, 400, '该模板已有待审批的申请，请等待审批完成后再提交');
    }

    // 创建审批申请
    const approvalId = genId('TPA');
    const steps = buildTemplateApprovalFlow(req.user);

    db.prepare(
      `INSERT INTO t_template_approval
        (id, template_id, template_name, change_type, change_data, snapshot_data,
         reason, status, current_step, steps, applicant_id, applicant_name, applicant_dept, approver_log, created_at, updated_at)
       VALUES (?, ?, ?, 'delete', '{}', ?, ?, '审批中', 1, ?, ?, ?, ?, '[]', ?, ?)`
    ).run(
      approvalId, id, existing.name,
      JSON.stringify({ name: existing.name, category: existing.category, content: existing.content }),
      req.body.reason || `删除模板「${existing.name}」`,
      JSON.stringify(steps),
      req.user.id, req.user.name, req.user.dept,
      now(), now()
    );

    logTemplateAction(id, req.user, '提交模板删除审批', `申请删除模板「${existing.name}」，待审批后执行`);

    return success(res, { id: approvalId, template_id: id, status: '审批中' }, '模板删除申请已提交，待审批后执行');
  } catch (e) {
    console.error('[contract_template] DELETE /:id error:', e);
    return error(res, 500, '提交删除申请失败: ' + e.message);
  }
});

// ============================================================
// POST /:id/upload - 上传模板文件（PDF/Word）
// ============================================================
router.post('/:id/upload', upload.single('file'), (req, res) => {
  try {
    const { id } = req.params;

    if (!canManageTemplate(req.user)) {
      // 清理已上传的文件
      if (req.file) fs.unlinkSync(req.file.path);
      return error(res, 403, '无权限上传模板文件，仅法务专员或管理员可操作');
    }

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!existing) {
      if (req.file) fs.unlinkSync(req.file.path);
      return error(res, 404, '模板不存在或已被删除');
    }

    if (!req.file) {
      return error(res, 400, '请选择要上传的文件');
    }

    // 删除旧文件
    if (existing.template_file) {
      const oldPath = path.join(__dirname, '..', '..', '..', 'uploads', 'templates', path.basename(existing.template_file));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch(e) {}
      }
    }

    const fileName = req.file.originalname;
    const filePath = '/uploads/templates/' + req.file.filename;
    const ext = path.extname(fileName).toLowerCase();
    const fileType = ext === '.pdf' ? 'PDF' : 'Word';

    const nowStr = now();
    db.prepare('UPDATE contract_templates SET template_file = ?, file_type = ?, updated_at = ? WHERE id = ?')
      .run(filePath, fileType, nowStr, id);

    logTemplateAction(id, req.user, '上传文件', `上传模板文件「${fileName}」（${fileType}）`);

    return success(res, { id, template_file: filePath, file_type: fileType, file_name: fileName }, '模板文件上传成功');
  } catch (e) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(err) {} }
    console.error('[contract_template] POST /:id/upload error:', e);
    return error(res, 500, '上传文件失败: ' + e.message);
  }
});

// ============================================================
// GET /:id/download - 下载模板文件
// ============================================================
router.get('/:id/download', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!existing) {
      return error(res, 404, '模板不存在或已被删除');
    }

    if (!existing.template_file) {
      return error(res, 400, '该模板未上传文件');
    }

    // 检查禁用状态下的下载权限（仅管理员可下载禁用模板的文件）
    if (existing.status === '禁用' && !canManageTemplate(req.user)) {
      return error(res, 403, '该模板已禁用，仅管理员可下载文件');
    }

    const fileName = path.basename(existing.template_file);
    const filePath = path.join(__dirname, '..', '..', '..', 'uploads', 'templates', fileName);

    if (!fs.existsSync(filePath)) {
      return error(res, 404, '模板文件不存在，可能已被清理');
    }

    // 记录下载日志
    logTemplateAction(id, req.user, '下载模板', `下载模板「${existing.name}」文件`);

    // 生成下载文件名
    const downloadName = existing.name + path.extname(fileName);
    res.download(filePath, downloadName);
  } catch (e) {
    console.error('[contract_template] GET /:id/download error:', e);
    return error(res, 500, '下载文件失败: ' + e.message);
  }
});

// ============================================================
// POST /:id/restore-version - 从历史版本恢复
// ============================================================
router.post('/:id/restore-version', (req, res) => {
  try {
    const { id } = req.params;
    const { version_id, change_desc } = req.body;

    if (!canManageTemplate(req.user)) {
      return error(res, 403, '无权限恢复历史版本，仅法务专员或管理员可操作');
    }

    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!existing) {
      return error(res, 404, '模板不存在或已被删除');
    }

    if (!version_id) {
      return error(res, 400, '请指定要恢复的版本ID');
    }

    const versionData = db.prepare(
      'SELECT * FROM contract_template_versions WHERE id = ? AND template_id = ?'
    ).get(version_id, id);

    if (!versionData) {
      return error(res, 404, '指定版本不存在');
    }

    // 先保存当前版本快照
    saveVersionSnapshot(existing, req.user, `恢复到v${versionData.version_num}前的保存`);

    // 恢复到历史版本
    const newVersion = (existing.version || 1) + 1;
    const nowStr = now();

    db.prepare(
      `UPDATE contract_templates
       SET name = ?, category = ?, content = ?, fields = ?,
           template_file = ?, file_type = ?, applicable_dept = ?,
           version = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      versionData.name, versionData.category, versionData.content, versionData.fields,
      versionData.template_file, versionData.file_type, versionData.applicable_dept,
      newVersion, nowStr, id
    );

    // 保存恢复版本到历史表
    db.prepare(
      `INSERT INTO contract_template_versions
        (id, template_id, version_num, name, category, content, fields,
         template_file, file_type, applicable_dept, status,
         operator, operator_id, change_desc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      genId('TPLV'), id, newVersion,
      versionData.name, versionData.category, versionData.content, versionData.fields,
      versionData.template_file, versionData.file_type, versionData.applicable_dept,
      existing.status || '启用',
      req.user.name, req.user.id,
      change_desc || `从v${versionData.version_num}恢复`
    );

    logTemplateAction(id, req.user, '恢复版本', `模板「${existing.name}」恢复到v${versionData.version_num}，新版本v${newVersion}`);

    return success(res, { id, version: newVersion }, `已恢复到版本v${versionData.version_num}，当前版本：v${newVersion}`);
  } catch (e) {
    console.error('[contract_template] POST /:id/restore-version error:', e);
    return error(res, 500, '恢复版本失败: ' + e.message);
  }
});

// ============================================================
// POST /:id/clone - 从模板创建实例（调用模板，支持修改并保留痕迹）
// 任何登录用户均可调用模板创建实例，实例可自由修改
// 修改痕迹通过版本历史自动保留
// ============================================================
router.post('/:id/clone', (req, res) => {
  try {
    const { id } = req.params;
    const source = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!source) {
      return error(res, 404, '模板不存在或已被删除');
    }
    if (source.status !== '启用') {
      return error(res, 400, '该模板已禁用，无法调用');
    }

    const { name, content, fields, applicable_dept, remark } = req.body;
    const newId = genId('TPL');
    const fieldsJson = JSON.stringify(fields || safeParse(source.fields, []));
    const deptStr = Array.isArray(applicable_dept) ? applicable_dept.join(',') : (applicable_dept || source.applicable_dept || '');
    const nowStr = now();
    const newName = (name || source.name + '（副本）').trim();

    // 创建实例：parent_id 指向源模板，标记为最新版
    db.prepare(
      `INSERT INTO contract_templates
        (id, name, category, content, fields, creator, creator_id, status,
         applicable_dept, template_file, file_type, version, parent_id, is_latest, is_deleted,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '启用', ?, '', '', 1, ?, 1, 0, ?, ?)`
    ).run(
      newId, newName, source.category || '',
      content || source.content || '', fieldsJson,
      req.user.name, req.user.id, deptStr,
      id, // parent_id 指向源模板
      nowStr, nowStr
    );

    // 记录初始版本到版本历史表
    db.prepare(
      `INSERT INTO contract_template_versions
        (id, template_id, version_num, name, category, content, fields,
         template_file, file_type, applicable_dept, status,
         operator, operator_id, change_desc)
       VALUES (?, ?, 1, ?, ?, ?, ?, '', '', ?, '启用', ?, ?, ?)`
    ).run(
      genId('TPLV'), newId, newName, source.category || '',
      content || source.content || '', fieldsJson, deptStr,
      req.user.name, req.user.id,
      remark || `从模板「${source.name}」调用创建`
    );

    // 记录源模板的使用日志
    logTemplateAction(id, req.user, '调用模板', `用户调用模板「${source.name}」创建实例「${newName}」(实例ID: ${newId})`);
    // 记录新实例的创建日志
    logTemplateAction(newId, req.user, '创建实例', `从模板「${source.name}」调用创建`);

    return success(res, {
      id: newId,
      source_template_id: id,
      source_template_name: source.name,
      name: newName,
      version: 1
    }, `已从模板「${source.name}」创建实例，可在此基础上进行修改，所有修改将自动保留版本痕迹`);
  } catch (e) {
    console.error('[contract_template] POST /:id/clone error:', e);
    return error(res, 500, '调用模板失败: ' + e.message);
  }
});

// ============================================================
// GET /:id/trace - 获取模板修改痕迹（对比源模板与当前版本的差异）
// ============================================================
router.get('/:id/trace', (req, res) => {
  try {
    const { id } = req.params;
    const tpl = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(id);
    if (!tpl) {
      return error(res, 404, '模板不存在或已被删除');
    }

    // 获取版本历史
    const versions = db.prepare(
      `SELECT id, version_num, name, content, fields, operator, operator_id, change_desc, created_at
       FROM contract_template_versions
       WHERE template_id = ?
       ORDER BY version_num DESC`
    ).all(id);

    // 如果有源模板，获取源模板内容用于对比
    let sourceTemplate = null;
    let diff = null;
    if (tpl.parent_id && tpl.parent_id !== tpl.id) {
      sourceTemplate = db.prepare('SELECT id, name, content, fields FROM contract_templates WHERE id = ?').get(tpl.parent_id);
      if (sourceTemplate) {
        // 简单差异对比：找出内容不同之处
        const sourceContent = sourceTemplate.content || '';
        const currentContent = tpl.content || '';
        const sourceFields = safeParse(sourceTemplate.fields, []);
        const currentFields = safeParse(tpl.fields, []);

        // 字段差异
        const fieldChanges = [];
        const sourceFieldMap = {};
        sourceFields.forEach(f => { sourceFieldMap[f.key] = f; });
        currentFields.forEach(f => {
          if (!sourceFieldMap[f.key]) {
            fieldChanges.push({ key: f.key, change: '新增', label: f.label });
          } else if (JSON.stringify(sourceFieldMap[f.key]) !== JSON.stringify(f)) {
            fieldChanges.push({ key: f.key, change: '修改', label: f.label });
          }
        });
        Object.keys(sourceFieldMap).forEach(k => {
          if (!currentFields.find(f => f.key === k)) {
            fieldChanges.push({ key: k, change: '删除', label: sourceFieldMap[k].label });
          }
        });

        // 内容差异（行级对比）
        const sourceLines = sourceContent.split('\n');
        const currentLines = currentContent.split('\n');
        const contentChanges = [];
        const maxLines = Math.max(sourceLines.length, currentLines.length);
        for (let i = 0; i < maxLines; i++) {
          if (sourceLines[i] !== currentLines[i]) {
            contentChanges.push({
              line: i + 1,
              source: sourceLines[i] || '(无)',
              current: currentLines[i] || '(无)'
            });
          }
        }

        diff = {
          source_name: sourceTemplate.name,
          source_content_length: sourceContent.length,
          current_content_length: currentContent.length,
          content_changed: sourceContent !== currentContent,
          field_changes: fieldChanges,
          content_changes: contentChanges.slice(0, 50) // 限制返回条数
        };
      }
    }

    return success(res, {
      template: {
        id: tpl.id,
        name: tpl.name,
        version: tpl.version,
        parent_id: tpl.parent_id,
        is_cloned: !!(tpl.parent_id && tpl.parent_id !== tpl.id)
      },
      source_template: sourceTemplate ? { id: sourceTemplate.id, name: sourceTemplate.name } : null,
      diff,
      versions: versions.map(v => ({
        ...v,
        fields: safeParse(v.fields, [])
      }))
    });
  } catch (e) {
    console.error('[contract_template] GET /:id/trace error:', e);
    return error(res, 500, '获取修改痕迹失败: ' + e.message);
  }
});

// ============================================================
// GET /:id/usage-log - 获取模板使用记录
// ============================================================
router.get('/:id/usage-log', (req, res) => {
  try {
    const { id } = req.params;
    const logs = db.prepare(
      `SELECT * FROM t_contract_audit_log
       WHERE contract_id = ?
       ORDER BY created_at DESC
       LIMIT 100`
    ).all(id);

    return success(res, { total: logs.length, logs });
  } catch (e) {
    return error(res, 500, '获取使用记录失败: ' + e.message);
  }
});

// ============================================================
// 审批管理: 生效处理器（审批通过后自动应用变更）
// ============================================================
function applyApprovalEffect(approval) {
  const changeData = safeParse(approval.change_data, {});
  const t = now();
  let msg = '';

  if (approval.change_type === 'create') {
    // 创建新模板
    const id = genId('TPL');
    const fieldsJson = changeData.fields || '[]';
    const deptStr = changeData.applicable_dept || '';
    db.prepare(
      `INSERT INTO contract_templates
        (id, name, category, content, fields, creator, creator_id, status,
         applicable_dept, template_file, file_type, version, parent_id, is_latest, is_deleted,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '启用', ?, '', '', 1, ?, 1, 0, ?, ?)`
    ).run(
      id, changeData.name || '', changeData.category || '', changeData.content || '', fieldsJson,
      approval.applicant_name, approval.applicant_id, deptStr, id, t, t
    );
    // 记录初始版本
    db.prepare(
      `INSERT INTO contract_template_versions
        (id, template_id, version_num, name, category, content, fields,
         template_file, file_type, applicable_dept, status,
         operator, operator_id, change_desc)
       VALUES (?, ?, 1, ?, ?, ?, ?, '', '', ?, '启用', ?, ?, '审批通过后创建')`
    ).run(
      genId('TPLV'), id, changeData.name || '', changeData.category || '',
      changeData.content || '', fieldsJson, deptStr,
      approval.applicant_name, approval.applicant_id
    );
    // 更新审批记录关联模板ID
    db.prepare('UPDATE t_template_approval SET template_id = ? WHERE id = ?').run(id, approval.id);
    msg = `模板「${changeData.name}」已审批通过并入库，可供员工调用`;

  } else if (approval.change_type === 'modify') {
    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(approval.template_id);
    if (!existing) throw new Error('模板不存在');

    // 保存版本快照
    saveVersionSnapshot(existing, { name: approval.applicant_name, id: approval.applicant_id }, '审批通过后修改');

    // 应用变更
    const updates = [];
    const params = [];
    if (changeData.name !== undefined) { updates.push('name = ?'); params.push(changeData.name); }
    if (changeData.category !== undefined) { updates.push('category = ?'); params.push(changeData.category); }
    if (changeData.content !== undefined) { updates.push('content = ?'); params.push(changeData.content); }
    if (changeData.fields !== undefined) { updates.push('fields = ?'); params.push(changeData.fields); }
    if (changeData.applicable_dept !== undefined) { updates.push('applicable_dept = ?'); params.push(changeData.applicable_dept); }

    if (updates.length > 0) {
      const newVersion = (existing.version || 1) + 1;
      updates.push('version = ?'); params.push(newVersion);
      updates.push('updated_at = ?'); params.push(t);
      params.push(approval.template_id);

      db.prepare(`UPDATE contract_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      // 保存新版本到历史表
      const updated = db.prepare('SELECT * FROM contract_templates WHERE id = ?').get(approval.template_id);
      db.prepare(
        `INSERT INTO contract_template_versions
          (id, template_id, version_num, name, category, content, fields,
           template_file, file_type, applicable_dept, status,
           operator, operator_id, change_desc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        genId('TPLV'), approval.template_id, newVersion,
        updated.name, updated.category || '', updated.content || '', updated.fields || '[]',
        updated.template_file || '', updated.file_type || '', updated.applicable_dept || '',
        updated.status || '启用',
        approval.applicant_name, approval.applicant_id,
        `审批通过后修改(v${newVersion})`
      );
      msg = `模板「${existing.name}」修改已审批通过，版本更新至v${newVersion}`;
    } else {
      msg = '无变更内容需要应用';
    }

  } else if (approval.change_type === 'status_toggle') {
    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(approval.template_id);
    if (!existing) throw new Error('模板不存在');
    const newStatus = changeData.new_status || (existing.status === '启用' ? '禁用' : '启用');
    db.prepare('UPDATE contract_templates SET status = ?, updated_at = ? WHERE id = ?')
      .run(newStatus, t, approval.template_id);
    msg = `模板「${existing.name}」状态已${newStatus === '启用' ? '启用' : '禁用'}`;

  } else if (approval.change_type === 'delete') {
    const existing = db.prepare('SELECT * FROM contract_templates WHERE id = ? AND is_deleted = 0').get(approval.template_id);
    if (!existing) throw new Error('模板不存在');
    db.prepare('UPDATE contract_templates SET is_deleted = 1, updated_at = ? WHERE id = ?')
      .run(t, approval.template_id);
    msg = `模板「${existing.name}」已删除（软删除，物理数据保留）`;
  }

  return msg;
}

// ============================================================
// GET /approvals - 审批申请列表
// ============================================================
router.get('/approvals/list', (req, res) => {
  try {
    const { status, change_type, keyword } = req.query;
    let sql = `SELECT * FROM t_template_approval WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (change_type) { sql += ` AND change_type = ?`; params.push(change_type); }
    if (keyword) { sql += ` AND template_name LIKE ?`; params.push('%' + keyword + '%'); }
    sql += ` ORDER BY created_at DESC LIMIT 200`;

    const rows = db.prepare(sql).all(...params);
    rows.forEach(r => {
      r.change_data = safeParse(r.change_data, {});
      r.snapshot_data = safeParse(r.snapshot_data, {});
      r.steps = safeParse(r.steps, []);
      r.approver_log = safeParse(r.approver_log, []);
    });

    const stats = {
      total: rows.length,
      pending: rows.filter(r => r.status === '审批中').length,
      approved: rows.filter(r => r.status === '已通过').length,
      rejected: rows.filter(r => r.status === '已驳回').length
    };

    return success(res, { stats, approvals: rows });
  } catch (e) {
    console.error('[contract_template] GET /approvals/list error:', e);
    return error(res, 500, '获取审批列表失败: ' + e.message);
  }
});

// ============================================================
// GET /approvals/:id - 审批详情
// ============================================================
router.get('/approvals/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM t_template_approval WHERE id = ?').get(req.params.id);
    if (!row) return error(res, 404, '审批记录不存在');
    row.change_data = safeParse(row.change_data, {});
    row.snapshot_data = safeParse(row.snapshot_data, {});
    row.steps = safeParse(row.steps, []);
    row.approver_log = safeParse(row.approver_log, []);
    return success(res, row);
  } catch (e) {
    return error(res, 500, '获取审批详情失败: ' + e.message);
  }
});

// ============================================================
// POST /approvals/:id/approve - 审批通过当前节点
// ============================================================
router.post('/approvals/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const { opinion } = req.body;
    const approval = db.prepare('SELECT * FROM t_template_approval WHERE id = ?').get(id);
    if (!approval) return error(res, 404, '审批记录不存在');
    if (approval.status !== '审批中') return error(res, 400, '该审批已完结');

    const steps = safeParse(approval.steps, []);
    const idx = steps.findIndex(s => !s.done);
    if (idx === -1) return error(res, 400, '已全部审批完成');
    const step = steps[idx];

    if (step.role !== 'system' && !matchTemplateApprovalRole(req.user, step.role)) {
      return error(res, 403, `禁止越级审批，当前节点「${step.step}」需对应审批人处理`);
    }

    const t = now();
    step.done = true;
    step.user = req.user.name;
    step.time = t;
    step.opinion = opinion || '同意';

    // 记录审批日志
    const approverLog = safeParse(approval.approver_log, []);
    approverLog.push({ step: step.step, user: req.user.name, time: t, opinion: step.opinion, action: 'approve' });

    let effectMsg = '';
    const next = steps.findIndex(s => !s.done);
    if (next !== -1 && steps[next].role === 'system') {
      // 自动完成系统生效节点
      steps[next].done = true;
      steps[next].user = '系统自动';
      steps[next].time = t;
      approval.status = '已通过';
      try {
        effectMsg = applyApprovalEffect(approval);
      } catch (e) {
        return error(res, 500, '生效处理异常: ' + e.message);
      }
      steps[next].opinion = effectMsg;
    }

    if (steps.every(s => s.done) && approval.status === '审批中') {
      approval.status = '已通过';
    }

    db.prepare(`UPDATE t_template_approval SET steps=?, status=?, current_step=?, approver_log=?, updated_at=? WHERE id=?`)
      .run(JSON.stringify(steps), approval.status, steps.findIndex(s => !s.done) + 1, JSON.stringify(approverLog), t, id);

    logTemplateAction(approval.template_id || id, req.user, '审批通过', `模板审批「${approval.template_name}」节点「${step.step}」通过`);

    return success(res, { id, status: approval.status, msg: effectMsg ? `审批通过，${effectMsg}` : '审批通过' });
  } catch (e) {
    console.error('[contract_template] POST /approvals/:id/approve error:', e);
    return error(res, 500, '审批操作失败: ' + e.message);
  }
});

// ============================================================
// POST /approvals/:id/reject - 驳回审批
// ============================================================
router.post('/approvals/:id/reject', (req, res) => {
  try {
    const { id } = req.params;
    const { remark } = req.body;
    if (!remark || !remark.trim()) return error(res, 400, '驳回必须填写驳回原因');

    const approval = db.prepare('SELECT * FROM t_template_approval WHERE id = ?').get(id);
    if (!approval) return error(res, 404, '审批记录不存在');
    if (approval.status !== '审批中') return error(res, 400, '该审批已完结');

    const steps = safeParse(approval.steps, []);
    const idx = steps.findIndex(s => !s.done);
    if (idx === -1) return error(res, 400, '已全部审批完成');
    const step = steps[idx];

    if (step.role !== 'system' && !matchTemplateApprovalRole(req.user, step.role)) {
      return error(res, 403, `禁止越级审批，当前节点「${step.step}」需对应审批人处理`);
    }

    const t = now();
    step.done = true;
    step.user = req.user.name;
    step.time = t;
    step.opinion = '驳回：' + remark.trim();

    const approverLog = safeParse(approval.approver_log, []);
    approverLog.push({ step: step.step, user: req.user.name, time: t, opinion: remark.trim(), action: 'reject' });

    approval.status = '已驳回';

    db.prepare(`UPDATE t_template_approval SET steps=?, status=?, approver_log=?, updated_at=? WHERE id=?`)
      .run(JSON.stringify(steps), '已驳回', JSON.stringify(approverLog), t, id);

    logTemplateAction(approval.template_id || id, req.user, '审批驳回', `模板审批「${approval.template_name}」被驳回：${remark.trim()}`);

    return success(res, { id, status: '已驳回' }, '已驳回，模板变更未生效');
  } catch (e) {
    console.error('[contract_template] POST /approvals/:id/reject error:', e);
    return error(res, 500, '驳回操作失败: ' + e.message);
  }
});

module.exports = router;
