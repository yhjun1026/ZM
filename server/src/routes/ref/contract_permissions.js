/**
 * 合同权限规则 API 路由
 * 
 * 提供以下端点：
 * GET    /rules                    - 获取所有合同角色权限规则
 * GET    /my-role                  - 获取当前用户的合同角色和权限
 * GET    /audit-log/:contractId    - 获取指定合同的审计日志
 * GET    /audit-log                - 获取所有审计日志（仅管理员）
 * POST   /seal/:contractId         - 用印登记
 * GET    /can-download/:contractId - 检查下载权限
 * GET    /confidential-access      - 获取涉密合同访问白名单
 * POST   /confidential-access      - 添加涉密合同访问权限
 * DELETE /confidential-access/:id  - 移除涉密合同访问权限
 * GET    /confidential-check/:contractId - 检查涉密合同访问权限
 * POST   /archive/:contractId      - 正式归档
 */

'use strict';

const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { success, error, now } = require('../../compat/helpers');
const {
  CONTRACT_ROLES,
  PERMISSION_RULES,
  UNIVERSAL_CONSTRAINTS,
  DOWNLOAD_ALLOWED_ROLES,
  CONFIDENTIAL_ACCESS_CONFIG,
  getContractRole,
  getDataScope,
  getFormPermission,
  canViewContract,
  canEditField,
  canDownload,
  canSeal,
  canArchive,
  canDirectEdit,
  getListFilter,
  logAudit,
  checkConfidentialAccess,
  getRoleRuleSummary
} = require('../../compat/contract_permissions');

// 认证中间件
const { authMiddleware } = require('../../compat/auth');
const { validateSealRequirement, ensureAuditLog } = require('../../compat/contract_validation');

// 所有接口都需要登录
router.use(authMiddleware);

// ============================================================
// GET /rules - 获取所有合同角色权限规则
// ============================================================
router.get('/rules', (req, res) => {
  try {
    const rules = CONTRACT_ROLES.map(role => getRoleRuleSummary(role));
    success(res, {
      roles: CONTRACT_ROLES,
      rules: rules,
      universalConstraints: UNIVERSAL_CONSTRAINTS,
      downloadAllowedRoles: DOWNLOAD_ALLOWED_ROLES,
      confidentialConfig: {
        enabled: CONFIDENTIAL_ACCESS_CONFIG.enabled,
        defaultRoles: CONFIDENTIAL_ACCESS_CONFIG.defaultRoles
      }
    });
  } catch (e) {
    console.error('[contract_permissions] /rules error:', e);
    error(res, 500, '获取权限规则失败: ' + e.message);
  }
});

// ============================================================
// GET /my-role - 获取当前用户的合同角色和权限
// ============================================================
router.get('/my-role', (req, res) => {
  try {
    const user = req.user;
    const contractRole = getContractRole(user);
    const dataScope = getDataScope(contractRole);
    const summary = getRoleRuleSummary(contractRole);
    const canDownloadFlag = canDownload(user);

    success(res, {
      contractRole: contractRole,
      dataScope: dataScope,
      permissions: summary,
      canDownload: canDownloadFlag,
      canDirectEdit: canDirectEdit(user, null)
    });
  } catch (e) {
    console.error('[contract_permissions] /my-role error:', e);
    error(res, 500, '获取用户角色失败: ' + e.message);
  }
});

// ============================================================
// GET /audit-log/:contractId - 获取指定合同的审计日志
// ============================================================
router.get('/audit-log/:contractId', (req, res) => {
  try {
    const { contractId } = req.params;
    const user = req.user;
    const contractRole = getContractRole(user);

    // 检查是否有权查看该合同
    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    const hasConfidential = checkConfidentialAccess(db, user);
    if (!canViewContract(user, contract, { confidentialAccess: hasConfidential })) {
      return error(res, 403, '无权查看该合同的审计日志');
    }

    // 仅管理员和档案管理员可查看完整审计日志
    if (contractRole !== '系统超级管理员' && contractRole !== '合同档案管理员') {
      // 普通用户只能看到自己的操作记录
      const logs = db.prepare(
        'SELECT * FROM t_contract_audit_log WHERE contract_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100'
      ).all(contractId, user.id);
      return success(res, logs);
    }

    const logs = db.prepare(
      'SELECT * FROM t_contract_audit_log WHERE contract_id = ? ORDER BY created_at DESC LIMIT 500'
    ).all(contractId);

    success(res, logs);
  } catch (e) {
    console.error('[contract_permissions] /audit-log/:id error:', e);
    error(res, 500, '获取审计日志失败: ' + e.message);
  }
});

// ============================================================
// GET /audit-log - 获取所有审计日志（仅超级管理员和档案管理员）
// 支持筛选：contractId, action, startDate, endDate
// ============================================================
router.get('/audit-log', (req, res) => {
  try {
    const user = req.user;
    const contractRole = getContractRole(user);

    if (contractRole !== '系统超级管理员' && contractRole !== '合同档案管理员') {
      return error(res, 403, '无权查看全部审计日志');
    }

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 50;
    const offset = (page - 1) * pageSize;
    const actionType = req.query.action || req.query.actionType;
    const contractId = req.query.contractId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    let sql = 'FROM t_contract_audit_log WHERE 1=1';
    const params = [];
    if (actionType) {
      sql += ' AND action_type = ?';
      params.push(actionType);
    }
    if (contractId) {
      sql += ' AND contract_id = ?';
      params.push(contractId);
    }
    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    const total = db.prepare('SELECT COUNT(*) as c ' + sql).get(...params).c;
    const logs = db.prepare('SELECT * ' + sql + ' ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...params, pageSize, offset);

    res.json({
      code: 200,
      msg: 'OK',
      data: logs,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (e) {
    console.error('[contract_permissions] /audit-log error:', e);
    error(res, 500, '获取审计日志失败: ' + e.message);
  }
});

// ============================================================
// POST /seal/:contractId - 用印登记
// 业务限制：仅当流程全部审批通过时才开放用印按钮
// ============================================================
router.post('/seal/:contractId', validateSealRequirement, (req, res) => {
  try {
    const { contractId } = req.params;
    const user = req.user;
    const contractRole = getContractRole(user);

    if (contractRole !== '印章管理员') {
      return error(res, 403, '仅印章管理员可执行用印登记');
    }

    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    // 获取审批流程步骤
    let approvalSteps = [];
    try {
      if (contract.flow) {
        approvalSteps = JSON.parse(contract.flow);
      }
    } catch (e) {
      // flow 解析失败，尝试从流程实例获取
      const flowInstance = db.prepare('SELECT flow_data FROM t_flow_instances WHERE contract_id = ? ORDER BY created_at DESC LIMIT 1').get(contractId);
      if (flowInstance && flowInstance.flow_data) {
        const flowData = JSON.parse(flowInstance.flow_data);
        if (flowData.nodes) {
          approvalSteps = flowData.nodes;
        }
      }
    }

    // 检查所有审批步骤是否全部通过
    if (!canSeal(user, contract, approvalSteps)) {
      return error(res, 400, '审批流程未全部通过或合同状态不允许用印登记');
    }

    // 记录用印信息
    const { sealNo, remark } = req.body;
    if (sealNo) {
      try {
        const atts = contract.attachment_group ? JSON.parse(contract.attachment_group) : [];
        atts.push({
          name: '盖章扫描件',
          path: req.body.sealScanFile || '',
          uploadedBy: user.name,
          uploadedAt: new Date().toISOString()
        });
        db.prepare('UPDATE t_contract_main SET attachment_group = ? WHERE id = ?')
          .run(JSON.stringify(atts), contractId);
      } catch(e) {}
    }

    // 写入审计日志
    logAudit(db, user.id, user.name, user.dept, contractId, '用印', `用印编号:${sealNo||''}, ${remark||'用印登记完成'}`);

    success(res, { contractId, sealNo: sealNo || '' }, '用印登记成功');
  } catch (e) {
    console.error('[contract_permissions] /seal error:', e);
    error(res, 500, '用印登记失败: ' + e.message);
  }
});

// ============================================================
// POST /esign/:contractId - 电子签章接口(stub)
// 提供电子签章集成接口框架，供印章管理员在用印环节调用
// 实际接入时替换为第三方电子签章服务商API
// ============================================================
router.post('/esign/:contractId', (req, res) => {
  try {
    const { contractId } = req.params;
    const user = req.user;
    const contractRole = getContractRole(user);

    if (contractRole !== '印章管理员' && contractRole !== '系统超级管理员') {
      return error(res, 403, '仅印章管理员可发起电子签章');
    }

    const contract = db.prepare('SELECT id, contract_no, contract_name, partner_company, amount, contract_status FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    const { signerName, signerIdNo, signerPhone, signPosition } = req.body;

    if (!signerName || !signerPhone) {
      return error(res, 400, '签署人姓名和手机号不能为空');
    }

    // 生成签章请求编号
    const esignRequestId = 'ES-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(Math.floor(Math.random() * 9000) + 1000);

    // 写入审计日志
    logAudit(db, user.id, user.name, user.dept, contractId, '电子签章',
      `签章请求号:${esignRequestId}, 签署人:${signerName}, 手机:${signerPhone}, 合同:${contract.contract_no || contractId}`);

    // ---- Stub响应 ----
    // 实际接入时此处应调用第三方电子签章API，例如:
    // const esignResult = await axios.post('https://api.esign.cn/v1/sign', { ... });
    // return success(res, { requestId: esignRequestId, signUrl: esignResult.data.signUrl });

    success(res, {
      requestId: esignRequestId,
      contractId: contractId,
      contractNo: contract.contract_no || '',
      contractName: contract.contract_name || '',
      signerName: signerName,
      signerPhone: signerPhone,
      signPosition: signPosition || '落款处',
      status: 'pending',
      signUrl: '', // 第三方签章页面URL(stub为空)
      provider: 'stub',
      message: '电子签章请求已创建(Stub模式)。实际接入第三方签章服务商后，signUrl将返回签署链接。'
    }, '电子签章请求已创建(Stub模式)');
  } catch (e) {
    console.error('[contract_permissions] /esign error:', e);
    error(res, 500, '电子签章请求失败: ' + e.message);
  }
});

// ============================================================
// GET /esign/status/:contractId - 查询电子签章状态
// ============================================================
router.get('/esign/status/:contractId', (req, res) => {
  try {
    const { contractId } = req.params;
    const contract = db.prepare('SELECT id, contract_no FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    // 从审计日志中查找电子签章记录
    const esignLogs = db.prepare(
      "SELECT user_id, user_name, detail, created_at FROM t_contract_audit_log WHERE contract_id = ? AND action_type = '电子签章' ORDER BY created_at DESC"
    ).all(contractId);

    const latestStatus = esignLogs.length > 0 ? 'pending' : 'not_initiated';

    success(res, {
      contractId,
      contractNo: contract.contract_no || '',
      status: latestStatus,
      esignRecords: esignLogs.map(l => ({
        operator: l.user_name,
        detail: l.detail,
        time: l.created_at
      })),
      message: esignLogs.length > 0 ? '已有电子签章记录' : '尚未发起电子签章'
    });
  } catch (e) {
    console.error('[contract_permissions] /esign/status error:', e);
    error(res, 500, '查询签章状态失败: ' + e.message);
  }
});

// ============================================================
// GET /can-download/:contractId - 检查下载权限
// ============================================================
router.get('/can-download/:contractId', (req, res) => {
  try {
    const { contractId } = req.params;
    const user = req.user;

    // 检查合同是否存在
    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    // 检查查看权限
    const hasConfidential = checkConfidentialAccess(db, user);
    if (!canViewContract(user, contract, { confidentialAccess: hasConfidential })) {
      return error(res, 403, '无权查看该合同');
    }

    // 检查下载权限
    const canDownloadFlag = canDownload(user);

    // 写入审计日志（无论是否允许下载，查看操作都记录）
    logAudit(db, user.id, user.name, user.dept, contractId, canDownloadFlag ? '下载' : '查看', '用户请求下载/查看合同');

    success(res, {
      canDownload: canDownloadFlag,
      contractRole: getContractRole(user),
      message: canDownloadFlag ? '允许下载原件' : '仅可预览，不可下载原件'
    });
  } catch (e) {
    console.error('[contract_permissions] /can-download error:', e);
    error(res, 500, '检查下载权限失败: ' + e.message);
  }
});

// ============================================================
// GET /confidential-access - 获取涉密合同访问白名单
// 仅超级管理员和档案管理员可操作
// ============================================================
router.get('/confidential-access', (req, res) => {
  try {
    const user = req.user;
    const contractRole = getContractRole(user);

    if (contractRole !== '系统超级管理员' && contractRole !== '合同档案管理员') {
      return error(res, 403, '无权管理涉密合同访问权限');
    }

    const list = db.prepare(`
      SELECT ca.*, u.emp_id, u.dept as user_dept
      FROM t_contract_confidential_access ca
      LEFT JOIN users u ON ca.user_id = u.id
      ORDER BY ca.granted_at DESC
    `).all();

    success(res, list);
  } catch (e) {
    console.error('[contract_permissions] GET /confidential-access error:', e);
    error(res, 500, '获取涉密访问白名单失败: ' + e.message);
  }
});

// ============================================================
// POST /confidential-access - 添加涉密合同访问权限
// ============================================================
router.post('/confidential-access', (req, res) => {
  try {
    const user = req.user;
    const contractRole = getContractRole(user);

    if (contractRole !== '系统超级管理员' && contractRole !== '合同档案管理员') {
      return error(res, 403, '无权管理涉密合同访问权限');
    }

    const { userId, userName, userDept, contractRole: targetRole, remark } = req.body;
    if (!userId) {
      return error(res, 400, '缺少用户ID');
    }

    // 查找用户
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ? OR emp_id = ?').get(userId, userId);
    if (!targetUser) {
      return error(res, 404, '用户不存在');
    }

    db.prepare(`
      INSERT INTO t_contract_confidential_access (user_id, user_name, user_dept, contract_role, status, granted_by, remark)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET status = 1, granted_by = ?, remark = ?, granted_at = datetime('now','localtime')
    `).run(
      targetUser.id, targetUser.name, targetUser.dept,
      targetRole || getContractRole(targetUser),
      user.name, remark || '',
      user.name, remark || ''
    );

    logAudit(db, user.id, user.name, user.dept, '0', '涉密权限管理', `授权用户 ${targetUser.name} 涉密合同访问权限`);

    success(res, { userId: targetUser.id }, '涉密合同访问权限已添加');
  } catch (e) {
    console.error('[contract_permissions] POST /confidential-access error:', e);
    error(res, 500, '添加涉密访问权限失败: ' + e.message);
  }
});

// ============================================================
// DELETE /confidential-access/:id - 移除涉密合同访问权限
// ============================================================
router.delete('/confidential-access/:id', (req, res) => {
  try {
    const user = req.user;
    const contractRole = getContractRole(user);

    if (contractRole !== '系统超级管理员' && contractRole !== '合同档案管理员') {
      return error(res, 403, '无权管理涉密合同访问权限');
    }

    const { id } = req.params;
    const access = db.prepare('SELECT * FROM t_contract_confidential_access WHERE id = ?').get(id);
    if (!access) {
      return error(res, 404, '记录不存在');
    }

    db.prepare('UPDATE t_contract_confidential_access SET status = 0 WHERE id = ?').run(id);

    logAudit(db, user.id, user.name, user.dept, '0', '涉密权限管理', `移除用户 ${access.user_name} 涉密合同访问权限`);

    success(res, { id }, '涉密合同访问权限已移除');
  } catch (e) {
    console.error('[contract_permissions] DELETE /confidential-access error:', e);
    error(res, 500, '移除涉密访问权限失败: ' + e.message);
  }
});

// ============================================================
// GET /confidential-check/:contractId - 检查涉密合同访问权限
// ============================================================
router.get('/confidential-check/:contractId', (req, res) => {
  try {
    const { contractId } = req.params;
    const user = req.user;

    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    const isConfidential = contract.is_confidential === 1;
    const hasAccess = checkConfidentialAccess(db, user);
    const canAccess = !isConfidential || hasAccess;

    success(res, {
      isConfidential: isConfidential,
      hasAccess: hasAccess,
      canAccess: canAccess,
      contractRole: getContractRole(user)
    });
  } catch (e) {
    console.error('[contract_permissions] /confidential-check error:', e);
    error(res, 500, '检查涉密权限失败: ' + e.message);
  }
});

// ============================================================
// POST /archive/:contractId - 正式归档
// ============================================================
router.post('/archive/:contractId', (req, res) => {
  try {
    const { contractId } = req.params;
    const user = req.user;

    const contract = db.prepare('SELECT * FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    if (!canArchive(user, contract)) {
      return error(res, 403, '无归档权限或合同状态不允许归档');
    }

    const { archiveNo, archiveLocation, archiveRemark, retentionPeriod, remark } = req.body;

    // 更新合同归档信息
    db.prepare(`
      UPDATE t_contract_main
      SET contract_status = '已归档',
          current_approval_node = '归档完成',
          updated_by = ?, updated_by_id = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(user.name, user.id, contractId);

    // 写入合同操作日志
    try {
      db.prepare(`
        INSERT INTO contract_logs (contract_id, action, operator, operator_id, operator_dept, detail, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `).run(contractId, '归档', user.name, user.id, user.dept,
        `归档编号:${archiveNo || ''}, 存档位置:${archiveLocation || ''}, 保管期限:${retentionPeriod || ''}, 备注:${archiveRemark || remark || ''}`);
    } catch(e) {
      // contract_logs表可能不存在，忽略
    }

    // 写入审计日志
    logAudit(db, user.id, user.name, user.dept, contractId, '归档', `归档编号:${archiveNo || ''}, 备注:${remark || archiveRemark || ''}`);

    success(res, { contractId, status: '已归档' }, '合同归档成功');
  } catch (e) {
    console.error('[contract_permissions] /archive error:', e);
    error(res, 500, '归档失败: ' + e.message);
  }
});

module.exports = router;
