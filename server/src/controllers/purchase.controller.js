const db = require('../db');
const { success, fail, parseJSON } = require('../utils/response');
const auditLog = require('../utils/audit');

function list(req, res) {
  const rows = db.prepare('SELECT * FROM purchases ORDER BY id').all();
  const purchases = rows.map((r) => ({ ...r, flow: parseJSON(r.flow) || [] }));
  return res.json(success(purchases));
}

function create(req, res) {
  const { id, title, category, amount, qty, unit, applicant, vendor } = req.body;
  try {
    const flow = JSON.stringify([
      { step: '申请', done: true },
      { step: '审批', done: false },
      { step: '采购', done: false },
      { step: '入库', done: false },
    ]);
    const info = db.prepare('INSERT INTO purchases (id,title,category,amount,qty,unit,status,applicant,date,vendor,flow) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id || ('PO-' + Date.now()), title, category || '其他', amount || 0, qty || 1, unit || '件', '待审批', applicant, new Date().toISOString().slice(0, 10), vendor || '-', flow);
    auditLog('ADD_PURCHASE', req.userId, String(id || ''), title);
    return res.json(success({ id: info.lastInsertRowid }, '采购申请已提交'));
  } catch (e) {
    return res.json(fail('提交失败'));
  }
}

// 注：purchases flow 结构无 user/time，原实现把首个未完成及之前全部置 done，此处保持一致。
function approve(req, res) {
  const { status } = req.body;
  try {
    const row = db.prepare('SELECT flow FROM purchases WHERE id=?').get(req.params.id);
    if (row) {
      const flow = parseJSON(row.flow) || [];
      const firstUndone = flow.findIndex((x) => !x.done);
      flow.forEach((f, i) => {
        if (i <= firstUndone) f.done = true;
      });
      db.prepare('UPDATE purchases SET status=?, flow=? WHERE id=?').run(status, JSON.stringify(flow), req.params.id);
    }
    auditLog('APPROVE_PURCHASE', req.userId, req.params.id, status);
    return res.json(success({}, '采购审批已更新'));
  } catch (e) {
    return res.json(fail('操作失败'));
  }
}

function remove(req, res) {
  try {
    auditLog('DELETE_PURCHASE', req.userId, req.params.id, null);
    db.prepare('DELETE FROM purchases WHERE id=?').run(req.params.id);
    return res.json(success({}, '采购记录已删除'));
  } catch (e) {
    return res.json(fail('删除失败'));
  }
}

module.exports = { list, create, approve, remove };
