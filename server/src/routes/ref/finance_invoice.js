/**
 * AI智能发票管理路由 (PRD 4.4)
 * 功能: 发票采集、AI OCR识别、查重拦截、真伪校验、全电/专票/普票兼容、异常修正驳回、全局发票台账
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, safeParse, now, genId, formatDate } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== 辅助函数: 获取财务配置 =====
function getFinanceConfig(key) {
  const row = db.prepare('SELECT config_value FROM t_finance_config WHERE config_key = ? AND status = ?').get(key, '启用');
  return row ? row.config_value : '';
}

// ===== 辅助函数: 发票查重检查 =====
function checkDuplicate(invoiceCode, invoiceNo, excludeId) {
  if (!invoiceCode || !invoiceNo) return null;
  let sql = 'SELECT id, invoice_code, invoice_no, seller, total_amount, operator, created_at FROM t_finance_invoice WHERE invoice_code = ? AND invoice_no = ?';
  const params = [invoiceCode, invoiceNo];
  if (excludeId) { sql += ' AND id != ?'; params.push(excludeId); }
  const existing = db.prepare(sql).get(...params);
  return existing || null;
}

// ===== 辅助函数: 模拟AI OCR识别结果 =====
function simulateOCR(imageData) {
  // 模拟OCR识别 — 返回结构化发票信息
  // 实际项目中对接百度/腾讯/阿里OCR API
  const types = ['增值税专用发票', '增值税普通发票', '全电发票'];
  const randomType = types[Math.floor(Math.random() * types.length)];
  const amount = Math.round(Math.random() * 10000 + 100);
  const taxRate = [0.01, 0.03, 0.06, 0.09, 0.13].sort(() => Math.random() - 0.5)[0];
  const taxAmount = Math.round(amount * taxRate * 100) / 100;
  const totalAmount = amount + taxAmount;

  return {
    invoice_code: String(Math.floor(Math.random() * 900000000 + 100000000)),
    invoice_no: String(Math.floor(Math.random() * 90000000 + 10000000)),
    invoice_type: randomType,
    title: '四川卓盟科技有限公司',
    seller: ['成都卓越供应商有限公司', '四川智联技术有限公司', '深圳科技服务有限公司'][Math.floor(Math.random() * 3)],
    buyer: '四川卓盟科技有限公司',
    amount: amount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    tax_rate: (taxRate * 100).toFixed(1) + '%',
    invoice_date: formatDate(new Date()),
    check_code: String(Math.floor(Math.random() * 900000000000 + 100000000000)),
    ocr_raw: {
      confidence: Math.round(Math.random() * 20 + 80),
      recognized_fields: ['invoice_code', 'invoice_no', 'amount', 'tax_amount', 'total_amount', 'seller', 'buyer', 'invoice_date'],
      image_quality: 'good'
    },
    ocr_confidence: Math.round(Math.random() * 20 + 80) / 100
  };
}

// ===== 辅助函数: 发票真伪校验(模拟) =====
function verifyInvoice(invoiceCode, invoiceNo) {
  // 模对接国家税务总局发票真伪查验接口
  // 实际项目中调用 https://inv-veri.chinatax.gov.cn/ 接口
  const code = parseInt(invoiceCode || '0');
  const no = parseInt(invoiceNo || '0');
  if (code > 0 && no > 0 && String(code).length >= 8) {
    return {
      verified: '已校验',
      result: '查验一致，发票为真',
      date: formatDate(new Date())
    };
  }
  return {
    verified: '存疑',
    result: '查验信息不完整或不一致',
    date: formatDate(new Date())
  };
}

// ========== API 端点 ==========

// 发票台账列表(带筛选)
router.get('/', (req, res) => {
  const { invoice_type, status, verified, keyword, source, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM t_finance_invoice WHERE 1=1';
  const params = [];

  if (invoice_type && invoice_type !== 'all') { sql += ' AND invoice_type = ?'; params.push(invoice_type); }
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (verified && verified !== 'all') { sql += ' AND verified = ?'; params.push(verified); }
  if (source && source !== 'all') { sql += ' AND source = ?'; params.push(source); }
  if (keyword) {
    sql += ' AND (invoice_code LIKE ? OR invoice_no LIKE ? OR seller LIKE ? OR title LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  sql += ' ORDER BY created_at DESC';
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;

  const rows = db.prepare(sql).all(...params);

  let countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/LIMIT.*$/, '');
  const total = db.prepare(countSql).get(...params).total;

  return success(res, { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 发票详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM t_finance_invoice WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '发票不存在');
  row.ocr_raw = safeParse(row.ocr_raw, {});
  // 查询关联单据信息
  if (row.related_expense_id) {
    const exp = db.prepare('SELECT form_no, applicant, total_amount, status FROM t_finance_expense WHERE id = ?').get(row.related_expense_id);
    row.related_expense = exp || null;
  }
  if (row.related_payment_id) {
    const pay = db.prepare('SELECT form_no, applicant, total_amount, status FROM t_finance_payment WHERE id = ?').get(row.related_payment_id);
    row.related_payment = pay || null;
  }
  return success(res, row);
});

// 手动录入发票
router.post('/', (req, res) => {
  const {
    invoice_code, invoice_no, invoice_type = '增值税普通发票',
    title, seller, buyer, amount = 0, tax_amount = 0, total_amount = 0,
    tax_rate = '', invoice_date, check_code = '', remark = ''
  } = req.body;

  if (!invoice_code || !invoice_no) return error(res, 400, '发票代码和号码必填');
  if (!total_amount || total_amount <= 0) return error(res, 400, '价税合计必须大于0');

  // 查重拦截
  if (getFinanceConfig('invoice_duplicate_check') === '1') {
    const dup = checkDuplicate(invoice_code, invoice_no);
    if (dup) {
      // 记录查重日志
      db.prepare(
    `INSERT INTO t_finance_invoice_check (invoice_code, invoice_no, invoice_id, duplicate_invoice_id, operator, operator_id)
     VALUES (?, ?, '', ?, ?, ?)`
  ).run(invoice_code, invoice_no, req.params.id || '', req.user.name, req.user.id);
      return error(res, 409, `发票查重失败：该发票已录入(首次录入ID: ${dup.id}, 销方: ${dup.seller}, 金额: ${dup.total_amount})`);
    }
  }

  const id = genId(getFinanceConfig('form_prefix_invoice') || 'FP');
  db.prepare(
    `INSERT INTO t_finance_invoice
     (id, invoice_code, invoice_no, invoice_type, title, seller, buyer, amount, tax_amount,
      total_amount, tax_rate, invoice_date, check_code, status, source, ocr_raw, ocr_confidence,
      verified, related_expense_id, related_payment_id, operator, operator_id, remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'{}',0,'未校验','','',?,?,?)`
  ).run(
    id, invoice_code, invoice_no, invoice_type, title || '', seller || '', buyer || '',
    amount, tax_amount, total_amount, tax_rate, invoice_date || formatDate(new Date()),
    check_code, '正常', '手动录入', req.user.name, req.user.id, remark
  );

  return success(res, { id }, '发票录入成功');
});

// AI OCR识别发票
router.post('/ocr-recognize', (req, res) => {
  const ocrEnabled = getFinanceConfig('invoice_ocr_enabled');
  if (ocrEnabled !== '1') return error(res, 400, 'AI OCR识别功能未启用');

  const { image_data, image_name } = req.body;
  if (!image_data) return error(res, 400, '请上传发票图片');

  // 模拟AI OCR识别
  const ocrResult = simulateOCR(image_data);

  // 查重检查
  let duplicateInfo = null;
  if (getFinanceConfig('invoice_duplicate_check') === '1') {
    const dup = checkDuplicate(ocrResult.invoice_code, ocrResult.invoice_no);
    if (dup) {
      duplicateInfo = {
        is_duplicate: true,
        existing_id: dup.id,
        existing_seller: dup.seller,
        existing_amount: dup.total_amount
      };
    }
  }

  return success(res, {
    ocr_result: ocrResult,
    duplicate_check: duplicateInfo || { is_duplicate: false }
  }, 'AI识别完成');
});

// 保存OCR识别结果(录入台账)
router.post('/save-ocr', (req, res) => {
  const ocrData = req.body.ocr_result || req.body;
  const {
    invoice_code, invoice_no, invoice_type, title, seller, buyer,
    amount, tax_amount, total_amount, tax_rate, invoice_date, check_code,
    ocr_raw, ocr_confidence
  } = ocrData;

  if (!invoice_code || !invoice_no) return error(res, 400, 'OCR识别结果不完整');
  if (!total_amount || total_amount <= 0) return error(res, 400, '发票金额异常');

  // 查重拦截
  if (getFinanceConfig('invoice_duplicate_check') === '1') {
    const dup = checkDuplicate(invoice_code, invoice_no);
    if (dup) {
      return error(res, 409, `发票查重拦截：该发票已录入(首次录入ID: ${dup.id})`);
    }
  }

  const id = genId(getFinanceConfig('form_prefix_invoice') || 'FP');
  db.prepare(
    `INSERT INTO t_finance_invoice
     (id, invoice_code, invoice_no, invoice_type, title, seller, buyer, amount, tax_amount,
      total_amount, tax_rate, invoice_date, check_code, status, source, ocr_raw, ocr_confidence,
      verified, operator, operator_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'正常','AI OCR识别',?,?,'未校验',?,?)`
  ).run(
    id, invoice_code, invoice_no, invoice_type || '增值税普通发票', title || '', seller || '', buyer || '',
    amount || 0, tax_amount || 0, total_amount, tax_rate || '', invoice_date || formatDate(new Date()),
    check_code || '', JSON.stringify(ocr_raw || {}), ocr_confidence || 0,
    req.user.name, req.user.id
  );

  return success(res, { id }, 'AI识别发票已录入台账');
});

// 发票真伪校验
router.post('/:id/verify', (req, res) => {
  const item = db.prepare('SELECT * FROM t_finance_invoice WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '发票不存在');

  const result = verifyInvoice(item.invoice_code, item.invoice_no);

  db.prepare(
    `UPDATE t_finance_invoice SET verified=?, verified_result=?, verified_date=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(result.verified, result.result, result.date, req.params.id);

  return success(res, result, result.verified === '已校验' ? '发票校验通过' : '发票校验存疑');
});

// 批量真伪校验
router.post('/batch-verify', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) return error(res, 400, '请选择发票');

  const results = [];
  ids.forEach(id => {
    const item = db.prepare('SELECT invoice_code, invoice_no FROM t_finance_invoice WHERE id = ?').get(id);
    if (item) {
      const result = verifyInvoice(item.invoice_code, item.invoice_no);
      db.prepare(
        `UPDATE t_finance_invoice SET verified=?, verified_result=?, verified_date=?, updated_at=datetime('now','localtime') WHERE id=?`
      ).run(result.verified, result.result, result.date, id);
      results.push({ id, ...result });
    }
  });

  return success(res, { total: ids.length, verified: results.length }, '批量校验完成');
});

// 异常修正(修改发票信息)
router.put('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM t_finance_invoice WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '发票不存在');

  const allowedFields = ['invoice_code', 'invoice_no', 'invoice_type', 'title', 'seller', 'buyer',
    'amount', 'tax_amount', 'total_amount', 'tax_rate', 'invoice_date', 'check_code', 'remark', 'status'];
  const updates = [];
  const params = [];

  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      updates.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  });

  if (updates.length === 0) return error(res, 400, '无可更新字段');

  // 如果修改了发票代码或号码，需要重新查重
  if (req.body.invoice_code || req.body.invoice_no) {
    const newCode = req.body.invoice_code || item.invoice_code;
    const newNo = req.body.invoice_no || item.invoice_no;
    if (getFinanceConfig('invoice_duplicate_check') === '1') {
      const dup = checkDuplicate(newCode, newNo, req.params.id);
      if (dup) {
        return error(res, 409, `修正后发票与已存在发票重复(ID: ${dup.id})`);
      }
    }
  }

  updates.push("updated_at = datetime('now','localtime')");
  params.push(req.params.id);

  db.prepare(`UPDATE t_finance_invoice SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return success(res, { id: req.params.id }, '发票信息已修正');
});

// 驳回异常发票(标记为异常)
router.post('/:id/reject', (req, res) => {
  const { remark } = req.body;
  const item = db.prepare('SELECT * FROM t_finance_invoice WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '发票不存在');

  db.prepare("UPDATE t_finance_invoice SET status='异常', remark=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(remark || '发票异常已驳回', req.params.id);

  return success(res, null, '发票已标记为异常');
});

// 作废发票
router.post('/:id/cancel', (req, res) => {
  const u = req.user;
  if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员') {
    return error(res, 403, '仅财务可作废发票');
  }
  const item = db.prepare('SELECT * FROM t_finance_invoice WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '发票不存在');

  db.prepare("UPDATE t_finance_invoice SET status='作废', updated_at=datetime('now','localtime') WHERE id=?")
    .run(req.params.id);
  return success(res, null, '发票已作废');
});

// 发票统计
router.get('/stats/summary', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM t_finance_invoice').get().c;
  const byType = db.prepare("SELECT invoice_type, COUNT(*) as c FROM t_finance_invoice GROUP BY invoice_type").all();
  const byStatus = db.prepare("SELECT status, COUNT(*) as c FROM t_finance_invoice GROUP BY status").all();
  const byVerified = db.prepare("SELECT verified, COUNT(*) as c FROM t_finance_invoice GROUP BY verified").all();
  const totalAmount = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as s FROM t_finance_invoice WHERE status = '正常'").get().s;
  const bySource = db.prepare("SELECT source, COUNT(*) as c FROM t_finance_invoice GROUP BY source").all();
  const duplicates = db.prepare('SELECT COUNT(*) as c FROM t_finance_invoice_check').get().c;

  return success(res, {
    total, by_type: byType, by_status: byStatus, by_verified: byVerified,
    by_source: bySource, total_amount: totalAmount, duplicate_count: duplicates
  }, '发票统计');
});

// 删除发票(仅异常/作废状态可删)
router.delete('/:id', (req, res) => {
  const u = req.user;
  if (!(u.dept === '财务部' && (u.role === '普通员工' || u.role === '部门经理')) && u.role !== '超级管理员') {
    return error(res, 403, '仅财务可删除发票');
  }
  const item = db.prepare('SELECT status FROM t_finance_invoice WHERE id = ?').get(req.params.id);
  if (!item) return error(res, 404, '发票不存在');
  if (!['异常', '作废'].includes(item.status)) return error(res, 400, '仅异常/作废发票可删除');

  db.prepare('DELETE FROM t_finance_invoice WHERE id = ?').run(req.params.id);
  return success(res, null, '发票已删除');
});

module.exports = router;
