/**
 * 系统设置路由 - 公司信息管理
 * 功能: 获取/更新公司信息
 * 权限: GET 所有登录用户可查看; PUT 仅超级管理员可编辑
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware } = require('../../compat/auth');
const { success, error, now } = require('../../compat/helpers');

router.use(authMiddleware);

// ===== GET / - 获取公司信息 (所有登录用户可查看) =====
router.get('/', (req, res) => {
  const row = db.prepare('SELECT * FROM t_company_info WHERE id = 1').get();
  if (!row) {
    return success(res, { company_name: '四川卓盟科技有限公司' }, '公司信息(默认)');
  }
  return success(res, row, '公司信息');
});

// ===== PUT / - 更新公司信息 (仅超级管理员) =====
router.put('/', (req, res) => {
  if (req.user.role !== '超级管理员') {
    return error(res, 403, '仅超级管理员可编辑公司信息');
  }

  let row = db.prepare('SELECT * FROM t_company_info WHERE id = 1').get();
  if (!row) {
    // 自动创建初始记录
    db.prepare(`INSERT INTO t_company_info (id, company_name, created_at) VALUES (1, ?, ?)`)
      .run('四川卓盟科技有限公司', now());
    row = db.prepare('SELECT * FROM t_company_info WHERE id = 1').get();
  }

  const {
    company_name, short_name, credit_code, legal_person, registered_capital,
    established_date, registered_address, office_address, phone, fax,
    email, website, business_scope, bank_name, bank_account, tax_number,
    invoice_title, remark
  } = req.body;

  db.prepare(
    `UPDATE t_company_info SET
      company_name=?, short_name=?, credit_code=?, legal_person=?, registered_capital=?,
      established_date=?, registered_address=?, office_address=?, phone=?, fax=?,
      email=?, website=?, business_scope=?, bank_name=?, bank_account=?, tax_number=?,
      invoice_title=?, remark=?, updated_by=?, updated_by_id=?, updated_at=?
     WHERE id=1`
  ).run(
    company_name !== undefined ? company_name : row.company_name,
    short_name !== undefined ? short_name : row.short_name,
    credit_code !== undefined ? credit_code : row.credit_code,
    legal_person !== undefined ? legal_person : row.legal_person,
    registered_capital !== undefined ? registered_capital : row.registered_capital,
    established_date !== undefined ? established_date : row.established_date,
    registered_address !== undefined ? registered_address : row.registered_address,
    office_address !== undefined ? office_address : row.office_address,
    phone !== undefined ? phone : row.phone,
    fax !== undefined ? fax : row.fax,
    email !== undefined ? email : row.email,
    website !== undefined ? website : row.website,
    business_scope !== undefined ? business_scope : row.business_scope,
    bank_name !== undefined ? bank_name : row.bank_name,
    bank_account !== undefined ? bank_account : row.bank_account,
    tax_number !== undefined ? tax_number : row.tax_number,
    invoice_title !== undefined ? invoice_title : row.invoice_title,
    remark !== undefined ? remark : row.remark,
    req.user.name, req.user.id, now()
  );

  const updated = db.prepare('SELECT * FROM t_company_info WHERE id = 1').get();
  return success(res, updated, '公司信息已更新');
});

module.exports = router;
