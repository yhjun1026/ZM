/**
 * 后勤管理路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireModule } = require('../../compat/auth');
const { success, error } = require('../../compat/helpers');

router.use(authMiddleware);

// 后勤工单列表
router.get('/items', (req, res) => {
  const rows = db.prepare('SELECT * FROM logistics ORDER BY created_at DESC').all();
  return success(res, rows);
});

// 新增后勤工单
router.post('/items', (req, res) => {
  const { type, title, detail, cost } = req.body;
  if (!title) return error(res, 400, '标题不能为空');
  const info = db.prepare('INSERT INTO logistics (type,title,applicant,dept,status,date,detail,cost) VALUES (?,?,?,?,?,?,?,?)')
    .run(type||'维修', title, req.user.name, req.user.dept, '待处理', new Date().toISOString().slice(0,10), detail||'', cost||0);
  return success(res, { id: info.lastInsertRowid }, '工单已创建');
});

// 车辆列表
router.get('/vehicles', (req, res) => {
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY id').all();
  return success(res, rows);
});

module.exports = router;
