/**
 * 公司文件路由
 */
const express = require('express');
const router = express.Router();
const { db } = require('../../compat/database');
const { authMiddleware, requireApprove, canAccess } = require('../../compat/auth');
const { success, error, genId, safeParse, generateApprovalFlow } = require('../../compat/helpers');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
  rows.forEach(r => { r.doc_flow = safeParse(r.doc_flow, []); });
  return success(res, rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!row) return error(res, 404, '文件不存在');
  row.doc_flow = safeParse(row.doc_flow, []);
  return success(res, row);
});

// 新建文件 (行政部普通员工可用)
router.post('/', (req, res) => {
  // 权限检查: 普通员工仅行政部可创建文件
  if (req.user.role === '普通员工' && req.user.dept !== '行政部') {
    return error(res, 403, '无权创建公司文件');
  }
  const { title, type, content, distribute_scope } = req.body;
  if (!title) return error(res, 400, '文件标题不能为空');
  const id = genId('DOC');
  const docFlow = generateApprovalFlow('document', req.user.dept);
  docFlow[0].user = req.user.name;
  db.prepare(`INSERT INTO documents (id,title,type,author,author_id,dept,date,status,distribute_scope,content,read_count,doc_flow)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, title, type||'通知公告', req.user.name, req.user.id, req.user.dept,
    new Date().toISOString().slice(0,10), '草稿', distribute_scope||'全体员工', content||'', 0, JSON.stringify(docFlow)
  );
  return success(res, { id }, '文件创建成功');
});

// 提交审批
router.post('/:id/submit', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return error(res, 404, '文件不存在');
  const flow = safeParse(doc.doc_flow, []);
  // 标记第一步完成
  if (flow[0] && !flow[0].done) {
    flow[0].done = true;
    flow[0].user = req.user.name;
  }
  db.prepare(`UPDATE documents SET doc_flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), '审批中', req.params.id);
  return success(res, null, '文件已提交审批');
});

// 审批通过 — 步骤级权限检查
router.post('/:id/approve', requireApprove(), (req, res) => {
  const u = req.user;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return error(res, 404, '文件不存在');
  const flow = safeParse(doc.doc_flow, []);
  const pending = flow.find(f => !f.done);
  if (!pending) return error(res, 400, '已全部审批完成');

  const stepName = pending.step;
  if (stepName.includes('行政部负责人')) {
    if (!(u.role === '部门经理' && u.dept === '行政部') && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅行政部负责人可执行此审批');
    }
  } else if (stepName.includes('副总')) {
    if (u.role !== '副总' && u.role !== '超级管理员' && u.role !== '总经理') {
      return error(res, 403, '仅公司副总可执行此审批');
    }
  } else if (stepName.includes('总经理')) {
    if (u.role !== '总经理' && u.role !== '超级管理员') {
      return error(res, 403, '仅总经理可签署下发');
    }
  }

  pending.done = true;
  pending.user = u.name;
  pending.time = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
  if (req.body.remark) pending.remark = req.body.remark;

  const allDone = flow.every(f => f.done);
  db.prepare(`UPDATE documents SET doc_flow=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(JSON.stringify(flow), allDone ? '已下发' : doc.status, req.params.id);
  return success(res, null, allDone ? '文件已签署下发' : '审批通过');
});

// 驳回
router.post('/:id/reject', requireApprove(), (req, res) => {
  db.prepare(`UPDATE documents SET status=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run('已驳回', req.params.id);
  return success(res, null, '已驳回');
});

// 更新文件
router.put('/:id', (req, res) => {
  const { title, type, content, distribute_scope } = req.body;
  db.prepare(`UPDATE documents SET title=COALESCE(?,title),type=COALESCE(?,type),content=COALESCE(?,content),
    distribute_scope=COALESCE(?,distribute_scope),updated_at=datetime('now','localtime') WHERE id=?`)
    .run(title, type, content, distribute_scope, req.params.id);
  return success(res, null, '文件更新成功');
});

// 删除文件
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  return success(res, null, '文件已删除');
});

module.exports = router;
