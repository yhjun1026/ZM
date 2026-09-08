const bcrypt = require('bcryptjs');
const db = require('../src/db');
const np = 'zm123456';
const hash = bcrypt.hashSync(np, 10);
const r = db.prepare("UPDATE users SET password = ?, emp_id = id WHERE id = 'ZM001'").run(hash);
console.log('ZM001 rows:', r.changes);
// 给所有用户同步 emp_id（避免再次踩坑）
const all = db.prepare('SELECT id FROM users').all();
let n = 0;
for (const u of all) {
  if (!u.id) continue;
  const x = db.prepare("UPDATE users SET emp_id = id WHERE id = ? AND (emp_id IS NULL OR emp_id = '')").run(u.id);
  n += x.changes;
}
console.log('synced emp_id for', n, 'users');
const after = db.prepare("SELECT id, emp_id, substr(password,1,7) AS pw FROM users WHERE id = 'ZM001'").get();
console.log('ZM001 now:', after);