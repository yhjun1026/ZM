/**
 * 财务对接集成路由 (PRD 第六章)
 * 功能: OA→财务ERP同步、字段映射、自动/手动推送、失败重试、状态回调、凭证号回写、接口安全
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, now, genId } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 辅助函数: 获取财务配置 =====
function getFinanceConfig(key) {
  const row = db.prepare('SELECT config_value FROM t_finance_config WHERE config_key = ? AND status = ?').get(key, '启用');
  return row ? row.config_value : '';
}

// ===== 辅助函数: 生成字段映射 =====
function buildPayload(sourceType, sourceId) {
  if (sourceType === '报销') {
    const exp = db.prepare('SELECT * FROM t_finance_expense WHERE id = ?').get(sourceId);
    if (!exp) return null;
    return {
      voucher_type: '费用报销',
      voucher_date: exp.reimburse_date,
      applicant: exp.applicant,
      dept: exp.applicant_dept,
      amount: exp.actual_amount,
      bank_account: exp.bank_account,
      bank_name: exp.bank_name,
      remark: exp.remark,
      form_no: exp.form_no
    };
  }
  if (sourceType === '付款') {
    const pay = db.prepare('SELECT * FROM t_finance_payment WHERE id = ?').get(sourceId);
    if (!pay) return null;
    return {
      voucher_type: '对公付款',
      voucher_date: pay.pay_date,
      applicant: pay.applicant,
      dept: pay.applicant_dept,
      amount: pay.this_amount,
      payee_name: pay.payee_name,
      payee_account: pay.payee_account,
      payee_bank: pay.payee_bank,
      contract_name: pay.contract_name,
      payment_method: pay.payment_method,
      form_no: pay.form_no
    };
  }
  if (sourceType === '借款') {
    const loan = db.prepare('SELECT * FROM t_finance_loan WHERE id = ?').get(sourceId);
    if (!loan) return null;
    return {
      voucher_type: '借款',
      voucher_date: loan.created_at,
      applicant: loan.applicant,
      dept: loan.applicant_dept,
      amount: loan.amount,
      loan_type: loan.loan_type,
      purpose: loan.purpose,
      form_no: loan.form_no
    };
  }
  return null;
}

// ===== 辅助函数: 模拟推送至财务ERP =====
function simulatePushToERP(payload, targetSystem, hookUrl) {
  // 实际项目中使用 fetch/axios 调用财务ERP接口
  // 模拟: 90%成功率
  const isSuccess = Math.random() > 0.1;
  if (isSuccess) {
    // 模拟ERP返回凭证号
    const voucherNo = `PZ-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 9000 + 1000)}`;
    return {
      success: true,
      voucher_no: voucherNo,
      message: '推送成功，凭证已生成',
      response: { code: 200, voucher_no: voucherNo, message: 'OK' }
    };
  }
  return {
    success: false,
    voucher_no: '',
    message: '推送失败: 连接超时',
    response: { code: 500, message: 'Connection timeout' }
  };
}

// ========== API 端点 ==========

// 对接日志列表
router.get('/logs', (req, res) => {
  const { status, source_type, sync_type, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_hook_log WHERE 1=1';
  const params = [];

  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (source_type && source_type !== 'all') { sql += ' AND source_type = ?'; params.push(source_type); }
  if (sync_type && sync_type !== 'all') { sql += ' AND sync_type = ?'; params.push(sync_type); }

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);
  rows.forEach(r => {
    r.field_mapping = safeParse(r.field_mapping, {});
    r.payload = safeParse(r.payload, {});
    r.response = safeParse(r.response, {});
  });

  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 手动推送单据至财务ERP
router.post('/push', (req, res) => {
  const { source_type, source_id, target_system = 'ERP' } = req.body;
  if (!source_type || !source_id) return error(res, 400, '缺少源单据参数');

  // 检查是否启用对接
  if (getFinanceConfig('finance_hook_enabled') !== '1') {
    return error(res, 400, '财务对接功能未启用，请在配置中心开启');
  }

  const hookUrl = getFinanceConfig('finance_hook_url');
  const payload = buildPayload(source_type, source_id);
  if (!payload) return error(res, 400, '源单据不存在或类型不支持');

  const logId = genId('HOOK');
  const logNo = genId('HL');

  // 执行推送
  const result = simulatePushToERP(payload, target_system, hookUrl);

  db.prepare(
    `INSERT INTO t_finance_hook_log
     (id, log_no, sync_type, direction, source_type, source_id, source_form_no,
      target_system, field_mapping, payload, response, status, retry_count, error_msg, voucher_no, operator, operator_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`
  ).run(
    logId, logNo, '手动', '推送', source_type, source_id, payload.form_no || '',
    target_system, JSON.stringify(payload), JSON.stringify(payload), JSON.stringify(result.response),
    result.success ? '成功' : '失败', result.success ? '' : result.message,
    result.voucher_no, req.user.name, req.user.id
  );

  // 成功推送后回写凭证号
  if (result.success && result.voucher_no) {
    if (source_type === '报销') {
      db.prepare("UPDATE t_finance_expense SET remark=remark||? , updated_at=datetime('now','localtime') WHERE id=?")
        .run(`\n[凭证号: ${result.voucher_no}]`, source_id);
    } else if (source_type === '付款') {
      db.prepare("UPDATE t_finance_payment SET remark=remark||? , updated_at=datetime('now','localtime') WHERE id=?")
        .run(`\n[凭证号: ${result.voucher_no}]`, source_id);
    } else if (source_type === '借款') {
      db.prepare("UPDATE t_finance_loan SET remark=remark||? , updated_at=datetime('now','localtime') WHERE id=?")
        .run(`\n[凭证号: ${result.voucher_no}]`, source_id);
    }
  }

  return success(res, {
    log_id: logId,
    success: result.success,
    voucher_no: result.voucher_no
  }, result.success ? '推送成功' : '推送失败');
});

// 批量推送
router.post('/batch-push', (req, res) => {
  const { items, target_system = 'ERP' } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) return error(res, 400, '请选择单据');

  if (getFinanceConfig('finance_hook_enabled') !== '1') return error(res, 400, '财务对接功能未启用');

  const results = [];
  items.forEach(item => {
    const payload = buildPayload(item.source_type, item.source_id);
    if (!payload) { results.push({ ...item, success: false, msg: '单据不存在' }); return; }

    const result = simulatePushToERP(payload, target_system, getFinanceConfig('finance_hook_url'));
    const logId = genId('HOOK');

    db.prepare(
      `INSERT INTO t_finance_hook_log
       (id, log_no, sync_type, direction, source_type, source_id, source_form_no,
        target_system, field_mapping, payload, response, status, retry_count, error_msg, voucher_no, operator, operator_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`
    ).run(
      logId, genId('HL'), '批量', '推送', item.source_type, item.source_id, payload.form_no || '',
      target_system, JSON.stringify(payload), JSON.stringify(payload), JSON.stringify(result.response),
      result.success ? '成功' : '失败', result.success ? '' : result.message,
      result.voucher_no, req.user.name, req.user.id
    );

    if (result.success && result.voucher_no) {
      if (item.source_type === '报销') {
        db.prepare("UPDATE t_finance_expense SET remark=remark||? WHERE id=?").run(`\n[凭证号: ${result.voucher_no}]`, item.source_id);
      } else if (item.source_type === '付款') {
        db.prepare("UPDATE t_finance_payment SET remark=remark||? WHERE id=?").run(`\n[凭证号: ${result.voucher_no}]`, item.source_id);
      }
    }

    results.push({ ...item, success: result.success, voucher_no: result.voucher_no });
  });

  const successCount = results.filter(r => r.success).length;
  return success(res, { total: items.length, success: successCount, failed: items.length - successCount }, '批量推送完成');
});

// 重试失败推送
router.post('/logs/:id/retry', (req, res) => {
  const log = db.prepare('SELECT * FROM t_finance_hook_log WHERE id = ?').get(req.params.id);
  if (!log) return error(res, 404, '日志不存在');
  if (log.status === '成功') return error(res, 400, '该日志已成功，无需重试');

  const maxRetry = parseInt(getFinanceConfig('finance_hook_retry_max') || '3');
  if (log.retry_count >= maxRetry) return error(res, 400, `已超过最大重试次数${maxRetry}次`);

  const payload = safeParse(log.payload, {});
  const result = simulatePushToERP(payload, log.target_system, getFinanceConfig('finance_hook_url'));

  db.prepare(
    `UPDATE t_finance_hook_log SET
     response=?, status=?, retry_count=retry_count+1, error_msg=?, voucher_no=?,
     updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    JSON.stringify(result.response),
    result.success ? '成功' : '重试中',
    result.success ? '' : result.message,
    result.voucher_no,
    req.params.id
  );

  return success(res, { success: result.success, voucher_no: result.voucher_no, retry_count: log.retry_count + 1 },
    result.success ? '重试成功' : '重试仍失败');
});

// 凭证号回写回调(模拟财务ERP回调)
router.post('/callback', (req, res) => {
  const { log_id, voucher_no, status, message } = req.body;
  if (!log_id) return error(res, 400, '缺少日志ID');

  const log = db.prepare('SELECT * FROM t_finance_hook_log WHERE id = ?').get(log_id);
  if (!log) return error(res, 404, '日志不存在');

  db.prepare(
    `UPDATE t_finance_hook_log SET voucher_no=?, status=?, error_msg=?, direction='回调', updated_at=datetime('now','localtime') WHERE id=?`
  ).run(voucher_no || '', status || '成功', message || '', log_id);

  return success(res, null, '回调已处理');
});

// 对接统计
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM t_finance_hook_log').get().c;
  const byStatus = db.prepare("SELECT status, COUNT(*) as c FROM t_finance_hook_log GROUP BY status").all();
  const bySource = db.prepare("SELECT source_type, COUNT(*) as c FROM t_finance_hook_log GROUP BY source_type").all();
  const bySync = db.prepare("SELECT sync_type, COUNT(*) as c FROM t_finance_hook_log GROUP BY sync_type").all();
  const failedCount = db.prepare("SELECT COUNT(*) as c FROM t_finance_hook_log WHERE status = '失败' OR status = '重试中'").get().c;
  const successRate = total > 0 ? ((total - failedCount) / total * 100).toFixed(1) : '0';

  return success(res, { total, by_status: byStatus, by_source: bySource, by_sync: bySync, failed: failedCount, success_rate: successRate });
});

module.exports = router;
