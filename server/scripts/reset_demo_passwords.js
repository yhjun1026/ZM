/**
 * 服务器端 demo 账号密码强制重置
 * 用法（在 server 目录下）：
 *   node scripts/reset_demo_passwords.js [password]
 *
 * 默认把所有 ZM00x 演示账号统一重置为 zm123456（与登录页 demo 提示词对齐）。
 * 可指定第二个参数覆盖：node scripts/reset_demo_passwords.js YourStrongP@ss
 *
 * - 改写 bcrypt hash（明文密码会在下次登录时由登录控制器再次升级 hash）
 * - 同步把 emp_id 字段对齐到 id（老库升级时漏过这一步会卡住部分登录链路）
 * - 跳过已离职账号（避免误改）
 * - 重复执行幂等
 */
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db'));

const newPassword = process.argv[2] || 'zm123456';

// 密码强度要求：6位以上 + 字母 + 数字（与登录控制器一致）
if (newPassword.length < 6 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
  console.error('[FAIL] 密码必须至少 6 位，且同时包含字母和数字');
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 10);

const users = db.prepare("SELECT id, name, status FROM users WHERE id LIKE 'ZM%' ORDER BY id").all();
if (users.length === 0) {
  console.error('[FAIL] users 表里没有 ZM00x 演示账号，请确认数据库已初始化');
  process.exit(1);
}

let updated = 0;
let empIdSynced = 0;
let skipped = 0;
const updPwd = db.prepare("UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?");
const syncEmpId = db.prepare("UPDATE users SET emp_id = id WHERE id = ? AND (emp_id IS NULL OR emp_id = '' OR emp_id != id)");

const tx = db.transaction(() => {
  for (const u of users) {
    if (u.status === '离职') { skipped++; continue; }
    updPwd.run(hash, u.id);
    updated++;
    const r = syncEmpId.run(u.id);
    if (r.changes) empIdSynced++;
  }
});
tx();

console.log('========================================');
console.log(`  重置 demo 账号密码（${newPassword}）`);
console.log('========================================');
console.log(`  扫描到 ZM00x 账号：${users.length}`);
console.log(`  跳过（离职）    ：${skipped}`);
console.log(`  已重置密码      ：${updated}`);
console.log(`  同步 emp_id     ：${empIdSynced}`);
console.log('----------------------------------------');
console.log('  下一步：在登录页用 ZM001 / ' + newPassword + ' 测试');
console.log('========================================');
