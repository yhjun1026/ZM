/**
 * 数据服务 controller（参考 datasvc.js，8 端点）
 * - 字段级权限（field_permissions）：查询 / 设置 / 角色矩阵
 * - 个人仪表盘 / 跨部门快照 / 服务审计 / 合规检查
 */
const db = require('../db');
const { ok, okWith, bad, notfound, empId } = require('../utils/resp');

function getUserDashboardData(req, res) {
  // 跨表个人汇总
  const me = String(empId(req));
  const meId = Number(empId(req)) || 0;
  const rows = {
    pending_approvals: db.prepare("SELECT COUNT(*) c FROM approvals WHERE applicant_id=? AND status='待审批'").get(me).c,
    todo_count: db.prepare("SELECT COUNT(*) c FROM approvals a JOIN approval_steps s ON s.approval_id=a.id AND s.seq=a.current_step WHERE a.status='待审批' AND s.approver_id=?").get(meId).c,
    pending_reports: db.prepare("SELECT COUNT(*) c FROM work_reports WHERE user_id=? AND status='待提交'").get(me).c,
    unread_msg: db.prepare("SELECT COUNT(*) c FROM messages WHERE to_emp_id=? AND is_read=0").get(me).c,
    opps: db.prepare("SELECT COUNT(*) c FROM opportunities WHERE sales_id=? AND stage NOT IN ('成交','输单','搁置')").get(me).c,
    contracts: db.prepare("SELECT COUNT(*) c FROM contracts WHERE creator_id=? AND status NOT IN ('已结清','已驳回')").get(me).c,
  };
  // 审计
  const t0 = Date.now();
  db.prepare(`INSERT INTO datasvc_audit (caller_no, caller_name, caller_role, api_name, filters, record_count, created_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))`)
    .run(me, req.user?.name || '', req.user?.role || '', '/dsvc/get_user_dashboard_data', JSON.stringify(req.query), Object.keys(rows).length);
  return res.json(ok(rows));
}

function crossDeptSnapshot(req, res) {
  // 跨部门：销售/采购/库存/合同 四个维度
  const t0 = Date.now();
  const snap = {
    sales: {
      total: db.prepare("SELECT COALESCE(SUM(amount),0) v FROM sales_records WHERE sale_date >= date('now','start of month')").get().v,
      orders: db.prepare("SELECT COUNT(*) c FROM sales_records WHERE sale_date >= date('now','start of month')").get().c,
    },
    purchase: {
      total: db.prepare("SELECT COALESCE(SUM(amount),0) v FROM purchases WHERE created_at >= date('now','start of month')").get().v,
      orders: db.prepare("SELECT COUNT(*) c FROM purchases WHERE created_at >= date('now','start of month')").get().c,
    },
    stock: {
      items: db.prepare("SELECT COUNT(*) c FROM warehouse_stock").get().c,
      low: db.prepare("SELECT COUNT(*) c FROM warehouse_stock WHERE qty <= 10").get().c,
    },
    contracts: {
      total: db.prepare("SELECT COUNT(*) c FROM contracts WHERE created_at >= date('now','start of month')").get().c,
      amount: db.prepare("SELECT COALESCE(SUM(amount),0) v FROM contracts WHERE created_at >= date('now','start of month')").get().v,
    },
  };
  db.prepare(`INSERT INTO datasvc_audit (caller_no, caller_name, caller_role, api_name, record_count, created_at) VALUES (?,?,?,?,?,datetime('now','localtime'))`)
    .run(String(empId(req)), req.user?.name || '', req.user?.role || '', '/dsvc/cross_dept_snapshot', 4);
  return res.json(ok(snap));
}

function svcAudit(req, res) {
  const { endpoint, from, to, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM datasvc_audit WHERE 1=1';
  const p = [];
  if (endpoint) { sql += ' AND api_name LIKE ?'; p.push('%' + endpoint + '%'); }
  if (from) { sql += ' AND created_at >= ?'; p.push(from); }
  if (to) { sql += ' AND created_at <= ?'; p.push(to); }
  const total = db.prepare(sql.replace(/SELECT \*[\s\S]*?FROM/, 'SELECT COUNT(*) c FROM')).get(...p).c;
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  p.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  return res.json(okWith({ list: db.prepare(sql).all(...p), total, page: Number(page), pageSize: Number(pageSize) }));
}

function listFieldPermissions(req, res) {
  const { module, role } = req.query;
  let sql = 'SELECT * FROM field_permissions WHERE 1=1';
  const p = [];
  if (module) { sql += ' AND module=?'; p.push(module); }
  if (role) {
    // 角色匹配 visible_roles（逗号分隔字符串 LIKE）
    sql += ' AND (visible_roles LIKE ? OR visible_roles LIKE ? OR visible_roles LIKE ?)';
    p.push('%' + role + '%');
    p.push('%' + role + ',%');
    p.push('%,' + role + ',%');
  }
  sql += ' ORDER BY module, field_name';
  return res.json(ok({ list: db.prepare(sql).all(...p) }));
}

function updateFieldPermission(req, res) {
  const { perm } = req.body;
  if (!['可见', '脱敏', '隐藏'].includes(perm)) return res.json(bad('权限值非法'));
  // visible_roles 字段追加角色
  const r = db.prepare('SELECT visible_roles FROM field_permissions WHERE id=?').get(req.params.id);
  if (!r) return res.json(bad('规则不存在'));
  const roles = (r.visible_roles || '').split(',').filter(Boolean);
  if (!roles.includes(perm)) roles.push(perm);
  db.prepare('UPDATE field_permissions SET visible_roles=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(roles.join(','), req.params.id);
  return res.json(ok({}, '已更新'));
}

function compliance(req, res) {
  // 合规检查：审批超期/资质过期/合同到期
  const issues = [];
  // 审批 > 7 天
  const stuck = db.prepare("SELECT COUNT(*) c FROM approvals WHERE status='待审批' AND created_at < datetime('now','-7 days')").get().c;
  if (stuck > 0) issues.push({ type: '审批超期', count: stuck, severity: 'high' });
  // 资质 30 天内到期
  let qualExpire = 0;
  try { qualExpire = db.prepare("SELECT COUNT(*) c FROM qualifications WHERE expire_date IS NOT NULL AND julianday(expire_date) - julianday('now') BETWEEN 0 AND 30").get().c; } catch (e) {}
  if (qualExpire > 0) issues.push({ type: '资质30天内到期', count: qualExpire, severity: 'high' });
  // 合同 30 天内到期
  let contractExpire = 0;
  try { contractExpire = db.prepare("SELECT COUNT(*) c FROM contracts WHERE end_date IS NOT NULL AND julianday(end_date) - julianday('now') BETWEEN 0 AND 30").get().c; } catch (e) {}
  if (contractExpire > 0) issues.push({ type: '合同30天内到期', count: contractExpire, severity: 'medium' });
  // 库存低预警
  const low = db.prepare("SELECT COUNT(*) c FROM warehouse_stock WHERE qty <= 10").get().c;
  if (low > 0) issues.push({ type: '库存低预警', count: low, severity: 'low' });
  return res.json(ok({ issues, checked_at: new Date().toISOString() }));
}

module.exports = {
  getUserDashboardData, crossDeptSnapshot, svcAudit,
  listFieldPermissions, updateFieldPermission, compliance,
};
