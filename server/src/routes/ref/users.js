/**
 * 用户管理路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireModule, requireAction } = require('../../compat/auth');
const { success, error } = require('../../compat/helpers');

router.use(authMiddleware);

// 获取系统用户列表
router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT id, emp_id, name, avatar, avatar_color, dept, role, phone, status, join_date, level, education, age
    FROM users ORDER BY dept, id
  `).all();
  return success(res, users);
});

// 获取单个用户详情
router.get('/:id', (req, res) => {
  const user = db.prepare('SELECT id, emp_id, name, avatar, avatar_color, dept, role, phone, status, join_date, level, education, age FROM users WHERE id = ?').get(req.params.id);
  if (!user) return error(res, 404, '用户不存在');
  return success(res, user);
});

// 新增用户 (需 createEmployee 权限)
router.post('/', requireAction('createEmployee'), (req, res) => {
  const { emp_id, password, name, dept, role, phone, level, education, age, join_date } = req.body;
  if (!emp_id || !password || !name || !dept || !role) {
    return error(res, 400, '缺少必填字段');
  }
  const exists = db.prepare('SELECT 1 FROM users WHERE emp_id = ?').get(emp_id);
  if (exists) return error(res, 409, '工号已存在');

  const id = 'U' + Date.now();
  const avatar = name.charAt(0);
  const colors = ['#6366f1','#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#0d9488'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  db.prepare(`INSERT INTO users (id, emp_id, password, name, avatar, avatar_color, dept, role, phone, status, join_date, level, education, age)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, emp_id, password, name, avatar, avatarColor, dept, role, phone || '', '在职',
    join_date || new Date().toISOString().slice(0,10), level || 'P3', education || '', age || 25
  );
  return success(res, { id, emp_id, name }, '用户创建成功');
});

// 更新用户 (仅超级管理员/总经理，或用户修改自己的个人信息)
router.put('/:id', (req, res) => {
  // 先检查权限（防止通过404/403差异枚举用户ID）
  const isSelf = req.user.id === req.params.id;
  const isAdmin = req.user.role === '超级管理员' || req.user.role === '总经理';
  if (!isSelf && !isAdmin) {
    return error(res, 403, '无权修改其他用户信息');
  }
  const user = db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.params.id);
  if (!user) return error(res, 404, '用户不存在');
  const { name, dept, role, phone, level, education, age, status } = req.body;
  // 仅超管可修改角色和部门
  if ((role || dept || status) && req.user.role !== '超级管理员') {
    return error(res, 403, '仅超级管理员可修改用户角色/部门/状态');
  }
  db.prepare(`UPDATE users SET name=COALESCE(?,name), dept=COALESCE(?,dept), role=COALESCE(?,role),
    phone=COALESCE(?,phone), level=COALESCE(?,level), education=COALESCE(?,education),
    age=COALESCE(?,age), status=COALESCE(?,status), updated_at=datetime('now','localtime')
    WHERE id=?`).run(name, dept, role, phone, level, education, age, status, req.params.id);
  return success(res, null, '用户更新成功');
});

// 删除用户 (仅超级管理员)
router.delete('/:id', (req, res) => {
  if (req.user.role !== '超级管理员') {
    return error(res, 403, '仅超级管理员可删除用户');
  }
  if (req.params.id === req.user.id) {
    return error(res, 400, '不能删除当前登录用户');
  }
  const user = db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.params.id);
  if (!user) return error(res, 404, '用户不存在');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  return success(res, null, '用户已删除');
});

module.exports = router;
