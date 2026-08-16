/**
 * 合同底层强制校验规则中间件
 *
 * 实现7条不可跳过的强制校验规则：
 * 1. 草稿合同无正式合同编号（已在 flow_contract_new.js 的 genContractNo 中实现）
 * 2. 不允许删除状态为【已生效、已归档、已变更】的合同；作废必须走审批流程
 * 3. 同一个合同不能同时启动多个审批流程
 * 4. 并行会签节点必须全部通过（已在 flow_contract_new.js 中实现）
 * 5. 用印操作必须有完整线上审批记录
 * 6. 所有流程修改、附件上传、审批动作永久留存操作日志
 * 7. 禁止前端绕过流程引擎直接更新数据库合同状态
 */

'use strict';

const { db } = require('./database');
const { error } = require('./helpers');

// 需要保护的状态：不允许直接删除或直接作废
const PROTECTED_STATUSES = ['已生效', '已归档', '已变更'];

// 允许直接作废的状态（无需走作废审批流程）
const DIRECT_VOID_ALLOWED = ['草稿', '已驳回'];

/**
 * Rule 7: 禁止前端绕过流程引擎直接更新合同状态
 * 中间件：从 PUT/POST 请求体中剥离 contract_status 字段
 * 例外：标记的"允许更新状态"路由不受此限制
 *
 * 用法：router.use(stripContractStatus) 或在特定路由上使用
 */
function stripContractStatus(req, res, next) {
  if (req.body && req.body.contract_status !== undefined) {
    // 从URL路径中提取合同ID（全局中间件中 req.params 尚未绑定路由参数）
    const pathParts = (req.path || '').split('/');
    let contractId = '';
    // 匹配类似 /draft/CM-xxx 或 /CM-xxx/void 的路径
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i] && pathParts[i].startsWith('CM-')) {
        contractId = pathParts[i];
        break;
      }
    }
    // 记录尝试绕过的安全日志
    try {
      db.prepare(
        `INSERT INTO t_contract_audit_log (contract_id, user_id, user_name, user_dept, action_type, detail)
         VALUES (?, ?, ?, ?, '安全拦截', ?)`
      ).run(
        contractId || req.params.id || req.params.contractId || '',
        req.user?.id || '',
        req.user?.name || 'unknown',
        req.user?.dept || '',
        `尝试直接修改合同状态为「${req.body.contract_status}」已被拦截（Rule 7）`
      );
    } catch(e) {
      console.error('[contract_validation] audit log error:', e);
    }
    // 删除 contract_status 字段，阻止绕过流程引擎
    delete req.body.contract_status;
  }
  next();
}

/**
 * Rule 3: 检查合同是否有进行中的审批流程
 * 跨流程检查：检查所有类型的审批流程（新签/变更/终止/作废）
 * @param {string} contractId - 合同ID
 * @param {string} excludeFlowType - 排除的流程类型（用于变更流程中排除自身）
 * @returns {{hasActive: boolean, activeFlow: object|null}}
 */
function hasActiveFlow(contractId, excludeFlowType) {
  let sql = "SELECT * FROM t_flow_instances WHERE contract_id = ? AND status = '进行中'";
  const params = [contractId];

  if (excludeFlowType) {
    sql += " AND flow_id != ?";
    params.push(excludeFlowType);
  }

  const active = db.prepare(sql).get(...params);
  return { hasActive: !!active, activeFlow: active };
}

/**
 * Rule 3 中间件：验证同一合同不能同时启动多个审批流程
 * 用于所有流程启动端点
 */
function validateSingleFlow(req, res, next) {
  try {
    const contractId = req.params.contractId || req.params.id;
    if (!contractId) return next();

    const contract = db.prepare('SELECT contract_status FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    // 检查是否有任何进行中的流程（跨流程类型检查）
    const { hasActive, activeFlow } = hasActiveFlow(contractId);
    if (hasActive) {
      return error(res, 400, `该合同已有进行中的审批流程（${activeFlow.flow_id}），不可同时启动多个流程（Rule 3）`);
    }

    next();
  } catch(e) {
    console.error('[contract_validation] validateSingleFlow error:', e);
    return error(res, 500, '流程校验失败: ' + e.message);
  }
}

/**
 * Rule 2: 验证合同作废操作
 * 对于已生效/已归档/已变更的合同，必须通过作废审批流程，不能直接作废
 * 用于 POST /:id/void 端点
 */
function validateVoidOperation(req, res, next) {
  try {
    const contractId = req.params.id || req.params.contractId;
    if (!contractId) return next();

    const contract = db.prepare('SELECT contract_status, contract_no FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    // 如果状态在保护列表中，必须检查是否有已完成的作废审批流程
    if (PROTECTED_STATUSES.includes(contract.contract_status)) {
      // 检查是否有已完成的作废审批流程
      const voidFlow = db.prepare(
        "SELECT * FROM t_flow_instances WHERE contract_id = ? AND flow_id = 'flow_contract_void' AND status = '已完成'"
      ).get(contractId);

      if (!voidFlow) {
        return error(res, 400, `合同状态为「${contract.contract_status}」，不可直接作废，请先发起合同作废审批流程（Rule 2）`);
      }

      // 有已完成的作废流程，允许执行作废
      req._voidFlowVerified = true;
    }

    next();
  } catch(e) {
    console.error('[contract_validation] validateVoidOperation error:', e);
    return error(res, 500, '作废校验失败: ' + e.message);
  }
}

/**
 * Rule 2 扩展：验证合同删除操作
 * 不允许删除已生效/已归档/已变更的合同
 */
function validateContractDelete(req, res, next) {
  try {
    const contractId = req.params.id || req.params.contractId;
    if (!contractId) return next();

    const contract = db.prepare('SELECT contract_status, contract_no FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    if (PROTECTED_STATUSES.includes(contract.contract_status)) {
      return error(res, 400, `合同状态为「${contract.contract_status}」，不允许删除，仅可作废（Rule 2）`);
    }

    next();
  } catch(e) {
    console.error('[contract_validation] validateContractDelete error:', e);
    return error(res, 500, '删除校验失败: ' + e.message);
  }
}

/**
 * Rule 5: 验证用印操作必须有完整线上审批记录
 * 增强：检查 t_flow_instances 中是否有已完成的审批流程
 */
function validateSealRequirement(req, res, next) {
  try {
    const contractId = req.params.contractId || req.params.id;
    if (!contractId) return next();

    const contract = db.prepare('SELECT contract_status, contract_no FROM t_contract_main WHERE id = ?').get(contractId);
    if (!contract) {
      return error(res, 404, '合同不存在');
    }

    // 检查是否有已完成的审批流程（新签/变更）
    const completedFlow = db.prepare(
      "SELECT * FROM t_flow_instances WHERE contract_id = ? AND status = '已完成' ORDER BY completed_at DESC LIMIT 1"
    ).get(contractId);

    if (!completedFlow) {
      return error(res, 400, '用印操作必须有完整线上审批记录，该合同无已完成审批流程（Rule 5）');
    }

    // 将流程信息附加到 req 供后续使用
    req._completedFlow = completedFlow;
    next();
  } catch(e) {
    console.error('[contract_validation] validateSealRequirement error:', e);
    return error(res, 500, '用印校验失败: ' + e.message);
  }
}

/**
 * Rule 6: 确保操作日志永久留存
 * 记录到 t_contract_audit_log，不可清理
 * @param {string} contractId - 合同ID
 * @param {object} user - 用户对象
 * @param {string} actionType - 操作类型
 * @param {string} detail - 操作详情
 */
function ensureAuditLog(contractId, user, actionType, detail) {
  try {
    db.prepare(
      `INSERT INTO t_contract_audit_log (contract_id, user_id, user_name, user_dept, action_type, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(contractId, user.id, user.name, user.dept, actionType, detail || '');
  } catch(e) {
    console.error('[contract_validation] ensureAuditLog error:', e);
    // 审计日志写入失败不应阻断业务流程，但必须记录到控制台
    console.error('[AUDIT LOG FAILED]', { contractId, user: user.name, actionType, detail });
  }
}

module.exports = {
  stripContractStatus,
  validateSingleFlow,
  validateVoidOperation,
  validateContractDelete,
  validateSealRequirement,
  ensureAuditLog,
  hasActiveFlow,
  PROTECTED_STATUSES,
  DIRECT_VOID_ALLOWED
};
