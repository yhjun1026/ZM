const bcrypt = require('bcryptjs');
const db = require('../db');
const { success, fail, safeFail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const users = db
    .prepare('SELECT id,name,dept,role,status,join_date as joinDate,level,phone,education,age FROM users ORDER BY id')
    .all();
  const hrStats = parseJSON(db.prepare('SELECT value FROM kv_store WHERE key=?').get('hrStats').value);
  return res.json(success({ employees: users, hrStats }));
}

function create(req, res) {
  const { id, name, dept, role, level, phone, email, education, age } = req.body;
  try {
    const defaultPasswordHash = bcrypt.hashSync('ZM@2026#default', 10);
    db.prepare(
      'INSERT INTO users (id,name,dept,role,level,phone,email,education,age,status,join_date,password) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(id, name, dept, role, level, phone, email, education, age, '试用期', new Date().toISOString().slice(0, 10), defaultPasswordHash);
    auditLog('ADD_USER', req.userId, id, '新员工: ' + name);
    return res.json(success({ id }, '员工添加成功（初始密码: ZM@2026#default，请及时修改）'));
  } catch (e) {
    return res.json(safeFail('添加员工失败', e));
  }
}

function update(req, res) {
  const { name, dept, role, status, level, phone, education, age } = req.body;
  try {
    db.prepare('UPDATE users SET name=?,dept=?,role=?,status=?,level=?,phone=?,education=?,age=? WHERE id=?')
      .run(name, dept, role, status, level, phone, education, age, req.params.id);
    auditLog('UPDATE_USER', req.userId, req.params.id, null);
    return res.json(success({}, '员工信息更新成功'));
  } catch (e) {
    return res.json(fail('更新失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_USER', req.userId, req.params.id, null);
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    return res.json(success({}, '员工已删除'));
  } catch (e) {
    return res.json(safeFail('删除失败', e));
  }
}

function changePassword(req, res) {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.json(fail('请输入原密码和新密码'));
  if (newPassword.length < 6) return res.json(fail('新密码至少6位'));
  try {
    const user = db.prepare('SELECT password FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.json(fail('用户不存在'));
    const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
    const validOld = isHashed ? bcrypt.compareSync(oldPassword, user.password) : oldPassword === user.password;
    if (!validOld) return res.json(fail('原密码错误'));
    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password=? WHERE id=?').run(newHash, req.params.id);
    auditLog('CHANGE_PASSWORD', req.userId, req.params.id, null);
    return res.json(success({}, '密码修改成功'));
  } catch (e) {
    return res.json(safeFail('密码修改失败', e));
  }
}

module.exports = { list, create, update, remove, changePassword };
