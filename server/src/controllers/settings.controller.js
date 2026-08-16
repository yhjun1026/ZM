/**
 * 系统设置 Controller
 */
const db = require('../db');
const { success, fail } = require('../utils/response');
const bcrypt = require('bcryptjs');

// 获取公司信息
async function getCompanyInfo(req, res) {
  try {
    const row = db.prepare('SELECT * FROM company_info WHERE id = 1').get();
    if (!row) {
      // 返回默认值
      return res.json(success({
        company_name: '四川卓盟科技有限公司',
        short_name: '卓盟科技',
        credit_code: '',
        legal_person: '',
        registered_capital: '',
        established_date: '',
        registered_address: '',
        office_address: '',
        phone: '',
        fax: '',
        email: '',
        website: '',
        bank_name: '',
        bank_account: '',
        tax_number: '',
        invoice_title: '',
        business_scope: '',
        remark: ''
      }));
    }
    return res.json(success(row));
  } catch (e) {
    console.error('[settings] getCompanyInfo error:', e);
    return res.json(fail('获取公司信息失败: ' + e.message));
  }
}

// 更新公司信息（仅超级管理员）
async function updateCompanyInfo(req, res) {
  try {
    if (req.user.role !== '超级管理员') {
      return res.json(fail('仅超级管理员可编辑公司信息', 403));
    }

    const data = req.body;
    const existing = db.prepare('SELECT * FROM company_info WHERE id = 1').get();
    
    if (!existing) {
      // 创建新记录
      db.prepare(`
        INSERT INTO company_info (
          id, company_name, short_name, credit_code, legal_person,
          registered_capital, established_date, registered_address, office_address,
          phone, fax, email, website, business_scope, bank_name, bank_account,
          tax_number, invoice_title, remark, updated_by, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        data.company_name || '四川卓盟科技有限公司',
        data.short_name || '',
        data.credit_code || '',
        data.legal_person || '',
        data.registered_capital || '',
        data.established_date || '',
        data.registered_address || '',
        data.office_address || '',
        data.phone || '',
        data.fax || '',
        data.email || '',
        data.website || '',
        data.business_scope || '',
        data.bank_name || '',
        data.bank_account || '',
        data.tax_number || '',
        data.invoice_title || '',
        data.remark || '',
        req.user.name
      );
    } else {
      // 更新记录
      db.prepare(`
        UPDATE company_info SET
          company_name = ?, short_name = ?, credit_code = ?, legal_person = ?,
          registered_capital = ?, established_date = ?, registered_address = ?,
          office_address = ?, phone = ?, fax = ?, email = ?, website = ?,
          business_scope = ?, bank_name = ?, bank_account = ?, tax_number = ?,
          invoice_title = ?, remark = ?, updated_by = ?, updated_at = datetime('now')
        WHERE id = 1
      `).run(
        data.company_name || existing.company_name,
        data.short_name || existing.short_name,
        data.credit_code || existing.credit_code,
        data.legal_person || existing.legal_person,
        data.registered_capital || existing.registered_capital,
        data.established_date || existing.established_date,
        data.registered_address || existing.registered_address,
        data.office_address || existing.office_address,
        data.phone || existing.phone,
        data.fax || existing.fax,
        data.email || existing.email,
        data.website || existing.website,
        data.business_scope || existing.business_scope,
        data.bank_name || existing.bank_name,
        data.bank_account || existing.bank_account,
        data.tax_number || existing.tax_number,
        data.invoice_title || existing.invoice_title,
        data.remark || existing.remark,
        req.user.name
      );
    }

    const updated = db.prepare('SELECT * FROM company_info WHERE id = 1').get();
    return res.json(success(updated, '公司信息已更新'));
  } catch (e) {
    console.error('[settings] updateCompanyInfo error:', e);
    return res.json(fail('更新公司信息失败: ' + e.message));
  }
}

// 修改密码
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.json(fail('请输入旧密码和新密码'));
    }

    if (newPassword.length < 6) {
      return res.json(fail('新密码长度至少6位'));
    }

    // 获取当前用户
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.json(fail('用户不存在'));
    }

    // 验证旧密码
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return res.json(fail('旧密码不正确'));
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);

    return res.json(success({}, '密码修改成功'));
  } catch (e) {
    console.error('[settings] changePassword error:', e);
    return res.json(fail('修改密码失败: ' + e.message));
  }
}

module.exports = {
  getCompanyInfo,
  updateCompanyInfo,
  changePassword
};
