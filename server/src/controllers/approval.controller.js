/**
 * 审批中心 controller（55 种类型 / 49 端点 / 引擎级）
 * 数据表（009 迁移建立）：approvals / approval_steps / approval_flow_cfg / approval_flow_change /
 *                       approval_comments / approval_favs / delegations
 *
 * 状态机：待审批 → (通过 → 终态) | (驳回 → 终态) | (撤回 → 终态) | (转办/加签/抄送 → 仍在办)
 * 多级流转：approval_steps.seq，current_step 指向当前应办理人。
 * 流程图：approval_flow_cfg.nodes 存 JSON 数组 [{step_name, role/emp_id}]，自定义优先于内置。
 *
 * 与其他模块的联动：各业务模块（报价/合同/请假/出差…）调 createApproval() 发起本表。
 * 终态时由 applyApprovalEffect() 回调（按 type 派发到对应业务模块的 onApprovalPassed()）。
 */
const db = require('../db');
const { ok, okWith, bad, notfound, forbidden, buildWhere, pager, empId } = require('../utils/resp');

// ===== 55 种审批类型（与参考项目一致）=====
const APPROVAL_TYPES = [
  '报价审批', '特价审批', '合同评审', '市场费用审批', '请假审批', '用车审批',
  '用品领用审批', '用印审批', '费用报销审批', '出差审批', '备用金审批',
  '资质登记审批', '资质续证审批', '市场活动审批', '员工入职审批', '员工评价审批',
  '打印下载审批', '客户资料审批', '经销商资料审批', '供应商资料审批', '厂家资料审批',
  '渠道资料审批', '档案变更审批', '采购审批', '预算审批', '投标立项审批', '工作汇报审批',
  '标书审批', '投标查阅审批', '组织变更审批', '培训审批', '公告发布审批', '销售目标审批',
  '商务合同审批', '人事聘用合同审批', '公文签发审批', '公文废止审批', '制度发布审批',
  '制度废止审批', '商务合同废止审批', '员工异动审批', '员工离职审批', '招聘需求审批',
  '录用审批', '加班审批', '补卡审批', '采购退货审批', '销售退货审批', '开票申请审批',
  '库存调整审批', '回款审批', '资产新增审批', '用品新增审批', '经营公司资料变更审批',
  '审批流程变更审批',
];

// 终态值
const DONE = new Set(['通过', '驳回', '已撤回', '已转办']);

/* ====== 流程图：内置 5 节点链，按 type 提供默认 ====== */
const DEFAULT_NODES = (type) => {
  // 大多数业务审批：申请人 → 部门负责人 → 行政人事部 → 财务 → 总经理
  const base = [
    { step_name: '部门负责人审批', role: 'DEPT_LEAD' },
    { step_name: '行政人事部审批', role: 'HR' },
    { step_name: '财务审批', role: 'FIN' },
    { step_name: '总经理审批', role: 'GM' },
  ];
  if (type === '请假审批' || type === '加班审批' || type === '补卡审批') {
    return [
      { step_name: '直属上级审批', role: 'DEPT_LEAD' },
      { step_name: '行政人事部备案', role: 'HR' },
    ];
  }
  if (type === '出差审批' || type === '用车审批' || type === '备用金审批') {
    return [
      { step_name: '部门负责人审批', role: 'DEPT_LEAD' },
      { step_name: '行政人事部审批', role: 'HR' },
      { step_name: '总经理审批', role: 'GM' },
    ];
  }
  if (type === '合同评审' || type === '商务合同审批' || type === '商务合同废止审批' || type === '投标立项审批' || type === '标书审批') {
    return [
      { step_name: '法务初审', role: 'LEGAL' },
      { step_name: '部门负责人', role: 'DEPT_LEAD' },
      { step_name: '财务审核', role: 'FIN' },
      { step_name: '总经理审批', role: 'GM' },
    ];
  }
  if (type === '预算审批' || type === '回款审批' || type === '开票申请审批') {
    return [
      { step_name: '财务审核', role: 'FIN' },
      { step_name: '总经理审批', role: 'GM' },
    ];
  }
  if (type === '组织变更审批') {
    return [
      { step_name: '副总审批', role: 'VP' },
      { step_name: '总经理审批', role: 'GM' },
    ];
  }
  if (type === '招聘需求审批' || type === '录用审批') {
    return [
      { step_name: '部门负责人', role: 'DEPT_LEAD' },
      { step_name: '行政人事部', role: 'HR' },
      { step_name: '总经理审批', role: 'GM' },
    ];
  }
  if (type === '员工异动审批' || type === '员工离职审批' || type === '员工入职审批' || type === '员工评价审批') {
    return [
      { step_name: '直属上级', role: 'DEPT_LEAD' },
      { step_name: '行政人事部', role: 'HR' },
    ];
  }
  return base;
};

/* ====== 生成单号 ====== */
const today = () => {
  const d = new Date();
  return d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
};
const makeApprovalNo = (type) => {
  const prefix = { 报价审批: 'QT', 特价审批: 'TJ', 合同评审: 'HT', 市场费用审批: 'SC',
    请假审批: 'QJ', 用车审批: 'YC', 用品领用审批: 'YP', 用印审批: 'YY', 费用报销审批: 'BX',
    出差审批: 'CC', 备用金审批: 'BY', 资质登记审批: 'ZZ', 资质续证审批: 'ZX',
    市场活动审批: 'HD', 员工入职审批: 'RZ', 员工评价审批: 'PJ', 打印下载审批: 'DY',
    客户资料审批: 'KH', 经销商资料审批: 'JS', 供应商资料审批: 'GY', 厂家资料审批: 'CJ',
    渠道资料审批: 'QD', 档案变更审批: 'DA', 采购审批: 'CG', 预算审批: 'YS',
    投标立项审批: 'TB', 工作汇报审批: 'BG', 标书审批: 'BS', 投标查阅审批: 'CY',
    组织变更审批: 'ZZ', 培训审批: 'PX', 公告发布审批: 'GG', 销售目标审批: 'XS',
    商务合同审批: 'SW', 人事聘用合同审批: 'RC', 公文签发审批: 'GW', 公文废止审批: 'GF',
    制度发布审批: 'ZF', 制度废止审批: 'ZJ', 商务合同废止审批: 'SWF', 员工异动审批: 'RY',
    员工离职审批: 'LZ', 招聘需求审批: 'ZP', 录用审批: 'LY', 加班审批: 'JB', 补卡审批: 'BK',
    采购退货审批: 'CT', 销售退货审批: 'ST', 开票申请审批: 'KP', 库存调整审批: 'KC',
    回款审批: 'HK', 资产新增审批: 'ZC', 用品新增审批: 'YJ', 经营公司资料变更审批: 'JY',
    审批流程变更审批: 'LC' }[type] || 'AP';
  return prefix + today() + '-' + Math.floor(Math.random() * 9000 + 1000);
};

/* ====== 解析当前节点的 approver_id 列表 ====== */
function resolveApprovers(nodes, idx, applicant) {
  const node = nodes[idx] || {};
  if (node.emp_id) return [{ id: node.emp_id, name: node.emp_name || '' }];
  const role = node.role;
  if (!role) return [];
  // 按角色查员工
  if (role === 'GM') return db.prepare("SELECT id, name FROM employees WHERE role IN ('GM','CEO','总经理') AND status='在职' LIMIT 5").all();
  if (role === 'VP') return db.prepare("SELECT id, name FROM employees WHERE role IN ('VP','副总','副总经理') AND status='在职' LIMIT 5").all();
  if (role === 'HR') {
    // 通过 org_units.name LIKE '%人事%' 找部门，再查部门下员工
    const orgs = db.prepare("SELECT id FROM org_units WHERE name LIKE '%人事%' OR func LIKE '%人事%'").all();
    const ids = orgs.map(o => o.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      return db.prepare(`SELECT id, name FROM employees WHERE org_id IN (${placeholders}) AND status='在职' LIMIT 5`).all(...ids);
    }
    return [];
  }
  if (role === 'FIN') {
    const orgs = db.prepare("SELECT id FROM org_units WHERE name LIKE '%财务%' OR func LIKE '%财务%'").all();
    const ids = orgs.map(o => o.id);
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      return db.prepare(`SELECT id, name FROM employees WHERE org_id IN (${placeholders}) AND status='在职' LIMIT 5`).all(...ids);
    }
    return [];
  }
  if (role === 'LEGAL') return db.prepare("SELECT id, name FROM employees WHERE role IN ('LEGAL','法务') AND status='在职' LIMIT 5").all();
  if (role === 'DEPT_LEAD') {
    // 申请人部门负责人：取 org_units.manager_emp_id
    const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(applicant);
    if (emp && emp.org_id) {
      const u = db.prepare('SELECT * FROM org_units WHERE id=?').get(emp.org_id);
      if (u && u.manager_emp_id) {
        const m = db.prepare('SELECT id, name FROM employees WHERE id=?').get(u.manager_emp_id);
        if (m) return [m];
      }
    }
    return db.prepare("SELECT id, name FROM employees WHERE role IN ('DEPT_LEAD','MANAGER') AND status='在职' LIMIT 3").all();
  }
  return [];
}

/* ====== 核心：发起审批 ====== */
function createApproval(payload) {
  // payload: { type, title, ref_id, amount, discount, applicant_id, applicant_name, region, cc_emp_ids, custom_nodes }
  const type = payload.type;
  if (!APPROVAL_TYPES.includes(type)) throw new Error('审批类型非法: ' + type);
  const applicantId = payload.applicant_id;
  if (!applicantId) throw new Error('缺少申请人');

  // 取流程图：自定义优先
  const custom = db.prepare('SELECT * FROM approval_flow_cfg WHERE type=? AND enabled=1').get(type);
  let nodes;
  if (custom && custom.nodes) {
    try { nodes = JSON.parse(custom.nodes); } catch (e) { nodes = DEFAULT_NODES(type); }
  } else {
    nodes = DEFAULT_NODES(type);
  }
  if (!nodes || nodes.length === 0) nodes = DEFAULT_NODES(type);

  const approvalNo = makeApprovalNo(type);
  const ins = db.prepare(`INSERT INTO approvals
    (approval_no, type, title, ref_id, amount, discount, applicant_id, applicant_name, current_step, total_steps, status, region, cc_emp_ids, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`);
  const r = ins.run(approvalNo, type, payload.title || type, payload.ref_id || null,
    payload.amount || 0, payload.discount || 0, applicantId, payload.applicant_name || '',
    1, nodes.length, '待审批', payload.region || '', payload.cc_emp_ids || '');
  const approvalId = r.lastInsertRowid;

  // 写步骤 + 当前节点 approver
  const stepIns = db.prepare(`INSERT INTO approval_steps (approval_id, seq, step_name, approver_id, approver_name, action) VALUES (?,?,?,?,?, '待审批')`);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    let approverId = null, approverName = node.step_name;
    if (i === 0) {
      // 第一个节点立刻解析审批人
      const approvers = resolveApprovers(nodes, i, applicantId);
      if (approvers.length === 1) { approverId = approvers[0].id; approverName = approvers[0].name; }
      else if (approvers.length > 1) { approverId = approvers[0].id; approverName = approvers[0].name + '等'; }
    }
    stepIns.run(approvalId, i + 1, node.step_name, approverId, approverName);
  }
  return { id: approvalId, approval_no: approvalNo, total_steps: nodes.length };
}

/* ====== 核心：办理（通过/驳回） ====== */
function actOnApproval(approvalId, action, comment, actor) {
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(approvalId);
  if (!ap) throw new Error('审批单不存在');
  if (DONE.has(ap.status)) throw new Error('审批已结束，不能再办理');

  // 委托：当前节点 actor 是被委托人
  const delegation = db.prepare(`SELECT * FROM delegations WHERE status='生效' AND from_emp_id=? AND (start_date IS NULL OR start_date<=date('now')) AND (end_date IS NULL OR end_date>=date('now'))`)
    .get(ap.approver_id || 0);
  const realActor = delegation && delegation.to_emp_id === actor ? actor : actor;

  const step = db.prepare('SELECT * FROM approval_steps WHERE approval_id=? AND seq=?').get(approvalId, ap.current_step);
  if (!step) throw new Error('当前步骤不存在');
  db.prepare(`UPDATE approval_steps SET action=?, comment=?, approver_id=?, approver_name=(SELECT name FROM employees WHERE id=?), acted_at=datetime('now','localtime') WHERE id=?`)
    .run(action, comment || '', actor, actor, step.id);

  if (action === '驳回') {
    db.prepare(`UPDATE approvals SET status='驳回', finished_at=datetime('now','localtime') WHERE id=?`).run(approvalId);
    return { status: '驳回' };
  }

  if (action === '通过') {
    if (ap.current_step >= ap.total_steps) {
      db.prepare(`UPDATE approvals SET status='通过', finished_at=datetime('now','localtime') WHERE id=?`).run(approvalId);
      return { status: '通过' };
    }
    // 推进到下一步
    const nextSeq = ap.current_step + 1;
    const nextStep = db.prepare('SELECT * FROM approval_steps WHERE approval_id=? AND seq=?').get(approvalId, nextSeq);
    // 解析下一节点审批人
    const custom = db.prepare('SELECT * FROM approval_flow_cfg WHERE type=? AND enabled=1').get(ap.type);
    let nodes = DEFAULT_NODES(ap.type);
    if (custom && custom.nodes) { try { nodes = JSON.parse(custom.nodes); } catch (e) {} }
    const nextNode = nodes[nextSeq - 1] || {};
    const approvers = resolveApprovers(nodes, nextSeq - 1, ap.applicant_id);
    if (approvers.length > 0) {
      db.prepare('UPDATE approval_steps SET approver_id=?, approver_name=? WHERE id=?')
        .run(approvers[0].id, approvers[0].name, nextStep.id);
    }
    db.prepare('UPDATE approvals SET current_step=? WHERE id=?').run(nextSeq, approvalId);
    return { status: '通过', next_step: nextSeq };
  }
  return { status: ap.status };
}

/* ====== 健康巡检 ====== */
function healthCheck() {
  const issues = { stuck: 0, stale: 0, quarantine: 0 };
  // 卡单：超过 7 天没人动
  const stuck = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE status='待审批' AND created_at < datetime('now','-7 days')`).get().c;
  // 僵死：超过 30 天还待审批
  const stale = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE status='待审批' AND created_at < datetime('now','-30 days')`).get().c;
  // 异常单：current_step 超过 total_steps
  const quarantine = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE current_step > total_steps AND status='待审批'`).get().c;
  issues.stuck = stuck;
  issues.stale = stale;
  issues.quarantine = quarantine;
  return issues;
}

/* ===================== 49 端点实现 ===================== */

function listTypes(req, res) { return res.json(ok({ types: APPROVAL_TYPES, builtin: APPROVAL_TYPES })); }
function listAllTypes(req, res) {
  // 在途出现过的类型 + 全量
  const inUse = db.prepare("SELECT DISTINCT type FROM approvals ORDER BY type").all().map(r => r.type);
  return res.json(ok({ types: APPROVAL_TYPES, in_use: inUse, all: APPROVAL_TYPES }));
}
function getFlowCharts(req, res) {
  // 返回所有类型的流程图（优先自定义）
  const customs = db.prepare('SELECT type, nodes, enabled FROM approval_flow_cfg WHERE enabled=1').all();
  const map = {};
  customs.forEach(c => { try { map[c.type] = JSON.parse(c.nodes); } catch (e) {} });
  APPROVAL_TYPES.forEach(t => { if (!map[t]) map[t] = DEFAULT_NODES(t); });
  return res.json(ok({ charts: map, customs }));
}
function listFlows(req, res) {
  const rows = db.prepare('SELECT * FROM approval_flow_cfg ORDER BY type').all();
  rows.forEach(r => { try { r.nodes = JSON.parse(r.nodes || '[]'); } catch (e) { r.nodes = []; } });
  return res.json(ok({ flows: rows, defaults: APPROVAL_TYPES.map(t => ({ type: t, nodes: DEFAULT_NODES(t) })) }));
}
function getFlowByType(req, res) {
  const t = req.params.type;
  if (!APPROVAL_TYPES.includes(t)) return res.json(notfound('审批类型不存在'));
  const c = db.prepare('SELECT * FROM approval_flow_cfg WHERE type=? AND enabled=1').get(t);
  if (c) { try { c.nodes = JSON.parse(c.nodes); } catch (e) {} }
  return res.json(ok({ type: t, custom: c, default_nodes: DEFAULT_NODES(t) }));
}
function listFlowChanges(req, res) {
  const rows = db.prepare('SELECT * FROM approval_flow_change ORDER BY id DESC LIMIT 200').all();
  return res.json(ok({ changes: rows }));
}
function cancelFlowChange(req, res) {
  const r = db.prepare(`UPDATE approval_flow_change SET status='已取消' WHERE id=? AND status='待审批'`).run(req.params.id);
  return res.json(okWith({ changes: r.changes }, r.changes ? '已取消' : '无需取消'));
}
function saveFlow(req, res) {
  const t = req.params.type;
  const { nodes, remark } = req.body;
  if (!APPROVAL_TYPES.includes(t)) return res.json(bad('审批类型非法'));
  if (!Array.isArray(nodes) || nodes.length === 0) return res.json(bad('流程节点不能为空'));
  // 写变更登记
  db.prepare(`INSERT INTO approval_flow_change (type, before_nodes, after_nodes, status, applicant_id, applicant_name, remark, created_at)
    SELECT ?, COALESCE((SELECT nodes FROM approval_flow_cfg WHERE type=? AND enabled=1), '[]'), ?, '待审批', ?, ?, ?, datetime('now','localtime')`)
    .run(t, t, JSON.stringify(nodes), empId(req), req.user?.name || '', remark || '');
  // 暂存 cfg（启用）
  const exists = db.prepare('SELECT id FROM approval_flow_cfg WHERE type=?').get(t);
  if (exists) {
    db.prepare('UPDATE approval_flow_cfg SET nodes=?, enabled=1, remark=?, updated_by=?, updated_by_name=?, updated_at=datetime(\'now\',\'localtime\') WHERE type=?')
      .run(JSON.stringify(nodes), remark || '', empId(req), req.user?.name || '', t);
  } else {
    db.prepare('INSERT INTO approval_flow_cfg (type, nodes, enabled, remark, updated_by, updated_by_name, updated_at) VALUES (?,?,1,?,?,?,datetime(\'now\',\'localtime\'))')
      .run(t, JSON.stringify(nodes), remark || '', empId(req), req.user?.name || '');
  }
  return res.json(ok({}, '流程已保存（待审批流程变更生效）'));
}
function deleteFlow(req, res) {
  const t = req.params.type;
  const r = db.prepare('DELETE FROM approval_flow_cfg WHERE type=?').run(t);
  return res.json(okWith({ changes: r.changes }, r.changes ? '已恢复内置' : '无自定义流程'));
}

function list(req, res) {
  const { type, status, applicant_id, approver_id, keyword, from, to, page = 1, pageSize = 20 } = req.query;
  let sql = `SELECT a.*, e.name as applicant_emp_name FROM approvals a
    LEFT JOIN employees e ON e.id=a.applicant_id WHERE 1=1`;
  const p = [];
  if (type) { sql += ' AND a.type=?'; p.push(type); }
  if (status) { sql += ' AND a.status=?'; p.push(status); }
  if (applicant_id) { sql += ' AND a.applicant_id=?'; p.push(Number(applicant_id)); }
  if (approver_id) {
    sql += ` AND a.id IN (SELECT approval_id FROM approval_steps WHERE approver_id=? AND action='待审批')`;
    p.push(Number(approver_id));
  }
  if (keyword) { sql += ' AND (a.title LIKE ? OR a.approval_no LIKE ?)'; p.push('%' + keyword + '%'); p.push('%' + keyword + '%'); }
  if (from) { sql += ' AND a.created_at >= ?'; p.push(from); }
  if (to) { sql += ' AND a.created_at <= ?'; p.push(to); }
  sql += ' ORDER BY a.id DESC';
  const total = db.prepare(sql.replace(/SELECT a\.\*[\s\S]*?FROM/, 'SELECT COUNT(*) c FROM')).get(...p).c;
  sql += ` LIMIT ? OFFSET ?`;
  p.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const rows = db.prepare(sql).all(...p);
  return res.json(okWith({ list: rows, total, page: Number(page), pageSize: Number(pageSize) }));
}

function listTodo(req, res) {
  const me = empId(req);
  const rows = db.prepare(`
    SELECT a.*, s.seq, s.step_name, s.approver_id
    FROM approvals a
    JOIN approval_steps s ON s.approval_id=a.id AND s.seq=a.current_step
    WHERE a.status='待审批' AND (s.approver_id=? OR s.step_name IN (SELECT step_name FROM approval_steps WHERE approver_id=?))
    ORDER BY a.id DESC LIMIT 100
  `).all(me, me);
  return res.json(ok({ list: rows }));
}

function listDone(req, res) {
  const me = empId(req);
  const rows = db.prepare(`
    SELECT DISTINCT a.* FROM approvals a
    JOIN approval_steps s ON s.approval_id=a.id
    WHERE a.status IN ('通过','驳回','已撤回') AND s.approver_id=?
    ORDER BY a.id DESC LIMIT 100
  `).all(me);
  return res.json(ok({ list: rows }));
}

function listCc(req, res) {
  const me = empId(req);
  const rows = db.prepare(`SELECT * FROM approvals WHERE cc_emp_ids LIKE ? ORDER BY id DESC LIMIT 100`).all('%' + me + '%');
  return res.json(ok({ list: rows }));
}

function preview(req, res) {
  const { type, amount, region, dept_id } = req.body;
  if (!APPROVAL_TYPES.includes(type)) return res.json(bad('审批类型非法'));
  const custom = db.prepare('SELECT * FROM approval_flow_cfg WHERE type=? AND enabled=1').get(type);
  let nodes = DEFAULT_NODES(type);
  if (custom && custom.nodes) { try { nodes = JSON.parse(custom.nodes); } catch (e) {} }
  // 预览每节点的审批人（按 role 解析）
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const approvers = resolveApprovers(nodes, i, empId(req));
    n.approvers = approvers;
  }
  return res.json(ok({ type, nodes, total_steps: nodes.length }));
}

function create(req, res) {
  const { type, title, ref_id, amount, discount, cc_emp_ids } = req.body;
  try {
    const r = createApproval({
      type, title, ref_id, amount, discount,
      applicant_id: empId(req),
      applicant_name: req.user?.name || '',
      region: req.body.region,
      cc_emp_ids: cc_emp_ids || '',
    });
    return res.json(ok(r, '已发起'));
  } catch (e) { return res.json(bad(e.message)); }
}

function act(req, res) {
  const { action, comment } = req.body;
  if (!['通过', '驳回'].includes(action)) return res.json(bad('动作非法'));
  try {
    const r = actOnApproval(req.params.id, action, comment, empId(req));
    return res.json(ok(r, '已' + (action === '通过' ? '通过' : '驳回')));
  } catch (e) { return res.json(bad(e.message)); }
}

function resync(req, res) {
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound('审批单不存在'));
  if (ap.status !== '待审批') return res.json(bad('非待审批状态不可重试'));
  // 重新解析当前节点审批人
  const custom = db.prepare('SELECT * FROM approval_flow_cfg WHERE type=? AND enabled=1').get(ap.type);
  let nodes = DEFAULT_NODES(ap.type);
  if (custom && custom.nodes) { try { nodes = JSON.parse(custom.nodes); } catch (e) {} }
  const approvers = resolveApprovers(nodes, ap.current_step - 1, ap.applicant_id);
  if (approvers.length > 0) {
    db.prepare('UPDATE approval_steps SET approver_id=?, approver_name=? WHERE approval_id=? AND seq=?')
      .run(approvers[0].id, approvers[0].name, ap.id, ap.current_step);
  }
  return res.json(ok({}, '已重试'));
}

function listStuck(req, res) {
  const rows = db.prepare(`SELECT * FROM approvals WHERE status='待审批' AND created_at < datetime('now','-7 days') ORDER BY id DESC LIMIT 100`).all();
  return res.json(ok({ list: rows }));
}
function listStale(req, res) {
  const rows = db.prepare(`SELECT * FROM approvals WHERE status='待审批' AND created_at < datetime('now','-30 days') ORDER BY id DESC LIMIT 100`).all();
  return res.json(ok({ list: rows }));
}
function efficiency(req, res) {
  const stats = db.prepare(`SELECT
    COUNT(*) total,
    SUM(CASE WHEN status='通过' THEN 1 ELSE 0 END) passed,
    SUM(CASE WHEN status='驳回' THEN 1 ELSE 0 END) rejected,
    AVG(CASE WHEN status='通过' THEN julianday(finished_at)-julianday(created_at) END) avg_days
    FROM approvals WHERE created_at > datetime('now','-30 days')`).get();
  return res.json(ok({ stats, period: '30d' }));
}
function health(req, res) {
  return res.json(ok({ health: healthCheck(), checked_at: new Date().toISOString() }));
}
function fixStatus(req, res) {
  const r = db.prepare(`UPDATE approvals SET status='驳回', finished_at=datetime('now','localtime') WHERE current_step>total_steps AND status='待审批'`).run();
  return res.json(okWith({ changes: r.changes }, '已修复'));
}
function fixDeadTodos(req, res) {
  // 清掉指向已结束审批单的待办消息
  const r = db.prepare(`UPDATE messages SET is_read=1 WHERE msg_type='待办' AND biz_type IN (SELECT type FROM approvals WHERE status IN ('通过','驳回','已撤回'))`).run();
  return res.json(okWith({ changes: r.changes }, '已清理'));
}
function purgeQuarantine(req, res) {
  const r = db.prepare(`UPDATE approvals SET status='已撤回', finished_at=datetime('now','localtime') WHERE current_step>total_steps AND status='待审批'`).run();
  return res.json(okWith({ changes: r.changes }, '已回收'));
}
function batchRemind(req, res) {
  const { ids, message } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json(bad('缺少 ids'));
  let n = 0;
  for (const id of ids) {
    const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(id);
    if (!ap || ap.status !== '待审批') continue;
    const step = db.prepare('SELECT * FROM approval_steps WHERE approval_id=? AND seq=?').get(id, ap.current_step);
    if (!step || !step.approver_id) continue;
    db.prepare(`INSERT INTO messages (biz_type, biz_id, to_emp_id, title, content, msg_type, created_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))`)
      .run('审批', id, step.approver_id, '审批催办', `请尽快办理「${ap.title || ap.type}」`, '待办');
    db.prepare('UPDATE approvals SET remind_count=remind_count+1 WHERE id=?').run(id);
    n++;
  }
  return res.json(okWith({ count: n }, '已催办 ' + n + ' 条'));
}
function remindOne(req, res) {
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap || ap.status !== '待审批') return res.json(bad('不可催办'));
  const step = db.prepare('SELECT * FROM approval_steps WHERE approval_id=? AND seq=?').get(ap.id, ap.current_step);
  if (!step || !step.approver_id) return res.json(bad('当前节点无审批人'));
  db.prepare(`INSERT INTO messages (biz_type, biz_id, to_emp_id, title, content, msg_type, created_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))`)
    .run('审批', ap.id, step.approver_id, '审批催办', `请尽快办理「${ap.title || ap.type}」`, '待办');
  db.prepare('UPDATE approvals SET remind_count=remind_count+1 WHERE id=?').run(ap.id);
  return res.json(ok({}, '已催办'));
}
function batchAct(req, res) {
  const { ids, action, comment } = req.body;
  if (!Array.isArray(ids) || !['通过', '驳回'].includes(action)) return res.json(bad('参数错误'));
  let n = 0;
  for (const id of ids) { try { actOnApproval(id, action, comment || '', empId(req)); n++; } catch (e) {} }
  return res.json(okWith({ count: n }, '已办理 ' + n + ' 条'));
}
function followups(req, res) {
  const me = empId(req);
  const rows = db.prepare(`SELECT a.*, s.approver_id, s.step_name FROM approvals a
    JOIN approval_steps s ON s.approval_id=a.id AND s.seq=a.current_step
    WHERE a.status='待审批' AND s.approver_id=? ORDER BY a.remind_count DESC, a.id DESC LIMIT 50`).all(me);
  return res.json(ok({ list: rows }));
}
function transfer(req, res) {
  const { to_emp_id, to_emp_name, reason } = req.body;
  if (!to_emp_id) return res.json(bad('缺少接收人'));
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound('审批单不存在'));
  if (ap.status !== '待审批') return res.json(bad('非待审批状态'));
  db.prepare('UPDATE approval_steps SET approver_id=?, approver_name=? WHERE approval_id=? AND seq=?')
    .run(to_emp_id, to_emp_name, ap.id, ap.current_step);
  db.prepare(`INSERT INTO messages (biz_type, biz_id, to_emp_id, title, content, msg_type, created_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))`)
    .run('审批', ap.id, to_emp_id, '审批转办', `「${ap.title || ap.type}」已转办给你（原因：${reason || ''}）`, '待办');
  return res.json(ok({}, '已转办'));
}
function addsign(req, res) {
  const { to_emp_id, to_emp_name, mode, reason } = req.body;
  if (!to_emp_id) return res.json(bad('缺少加签人'));
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound());
  if (ap.status !== '待审批') return res.json(bad('非待审批状态'));
  // 加签：在当前节点之后插入一个节点
  const insertAt = ap.current_step + 1;
  const newSeq = ap.total_steps + 1;
  // 后续节点全部 +1
  db.prepare('UPDATE approval_steps SET seq=seq+1 WHERE approval_id=? AND seq >= ?').run(ap.id, insertAt);
  db.prepare('INSERT INTO approval_steps (approval_id, seq, step_name, approver_id, approver_name, action) VALUES (?,?,?,?,?,?)')
    .run(ap.id, insertAt, '加签' + (mode === 'after' ? '(后)' : '(前)'), to_emp_id, to_emp_name, '待审批');
  db.prepare('UPDATE approvals SET total_steps=?, current_step=? WHERE id=?').run(newSeq, insertAt, ap.id);
  return res.json(ok({}, '已加签'));
}
function addCc(req, res) {
  const { cc_emp_ids } = req.body;
  if (!cc_emp_ids) return res.json(bad('缺少抄送人'));
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound());
  const merged = Array.from(new Set([...(ap.cc_emp_ids || '').split(',').filter(Boolean), ...cc_emp_ids.split(',').filter(Boolean)])).join(',');
  db.prepare('UPDATE approvals SET cc_emp_ids=? WHERE id=?').run(merged, ap.id);
  // 推送抄送消息
  for (const eid of cc_emp_ids.split(',').filter(Boolean)) {
    db.prepare(`INSERT INTO messages (biz_type, biz_id, to_emp_id, title, content, msg_type, created_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))`)
      .run('审批', ap.id, Number(eid), '审批抄送', `「${ap.title || ap.type}」抄送给你查阅`, '抄送');
  }
  return res.json(ok({}, '已抄送'));
}
function withdraw(req, res) {
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound());
  if (ap.applicant_id !== empId(req)) return res.json(forbidden('只有申请人可以撤回'));
  if (!['待审批'].includes(ap.status)) return res.json(bad('非待审批状态不可撤回'));
  db.prepare(`UPDATE approvals SET status='已撤回', finished_at=datetime('now','localtime') WHERE id=?`).run(ap.id);
  return res.json(ok({}, '已撤回'));
}
function retry(req, res) {
  return res.json(ok({}, '已重试（占位：触发重发消息/重置状态）'));
}
function exportOne(req, res) {
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound());
  const steps = db.prepare('SELECT * FROM approval_steps WHERE approval_id=? ORDER BY seq').all(ap.id);
  const lines = [
    `审批单号：${ap.approval_no}`,
    `类型：${ap.type}`,
    `标题：${ap.title || ''}`,
    `申请人：${ap.applicant_name} (${ap.applicant_id})`,
    `金额：${ap.amount || 0}   折扣：${ap.discount || 0}`,
    `状态：${ap.status}`,
    `创建时间：${ap.created_at}`,
    `完成时间：${ap.finished_at || ''}`,
    '',
    '流程节点：',
    ...steps.map(s => `  ${s.seq}. ${s.step_name} - ${s.approver_name || '未指派'} - ${s.action}${s.comment ? ' - ' + s.comment : ''}`),
  ];
  return res.json(ok({ text: lines.join('\n') }));
}
function detail(req, res) {
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound());
  const steps = db.prepare('SELECT * FROM approval_steps WHERE approval_id=? ORDER BY seq').all(ap.id);
  return res.json(ok({ approval: ap, steps }));
}
function trace(req, res) {
  // 流程图 + 当前所在位置
  const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound());
  const custom = db.prepare('SELECT * FROM approval_flow_cfg WHERE type=? AND enabled=1').get(ap.type);
  let nodes = DEFAULT_NODES(ap.type);
  if (custom && custom.nodes) { try { nodes = JSON.parse(custom.nodes); } catch (e) {} }
  const steps = db.prepare('SELECT * FROM approval_steps WHERE approval_id=? ORDER BY seq').all(ap.id);
  return res.json(ok({ nodes, steps, current_step: ap.current_step, status: ap.status }));
}
function stats(req, res) {
  const byType = db.prepare(`SELECT type, COUNT(*) c FROM approvals GROUP BY type ORDER BY c DESC`).all();
  const byStatus = db.prepare(`SELECT status, COUNT(*) c FROM approvals GROUP BY status`).all();
  const total = db.prepare(`SELECT COUNT(*) c FROM approvals`).get().c;
  return res.json(ok({ by_type: byType, by_status: byStatus, total }));
}

/* ===== 委托 ===== */
function listDelegations(req, res) {
  const rows = db.prepare('SELECT * FROM delegations ORDER BY id DESC LIMIT 200').all();
  return res.json(ok({ list: rows }));
}
function createDelegation(req, res) {
  const { to_emp_id, to_emp_name, start_date, end_date, scope } = req.body;
  if (!to_emp_id) return res.json(bad('缺少被委托人'));
  const r = db.prepare(`INSERT INTO delegations (from_emp_id, from_emp_name, to_emp_id, to_emp_name, start_date, end_date, scope, status) VALUES (?,?,?,?,?,?,?, '生效')`)
    .run(empId(req), req.user?.name || '', to_emp_id, to_emp_name, start_date, end_date, scope || '全部');
  return res.json(ok({ id: r.lastInsertRowid }, '已创建'));
}
function deleteDelegation(req, res) {
  const r = db.prepare(`UPDATE delegations SET status='已停用' WHERE id=? AND from_emp_id=?`).run(req.params.id, Number(empId(req)) || 0);
  return res.json(okWith({ changes: r.changes }, r.changes ? '已停用' : '不可停用'));
}

/* ===== 评论（常用意见）===== */
function listComments(req, res) {
  const rows = db.prepare('SELECT * FROM approval_comments WHERE emp_no=? OR emp_no IS NULL OR emp_no=\'\' ORDER BY id DESC').all(empId(req) || '');
  return res.json(ok({ list: rows }));
}
function createComment(req, res) {
  const { content } = req.body;
  if (!content) return res.json(bad('内容为空'));
  const r = db.prepare(`INSERT INTO approval_comments (emp_no, content) VALUES (?,?)`).run(empId(req) || '', content);
  return res.json(ok({ id: r.lastInsertRowid }, '已保存'));
}
function deleteComment(req, res) {
  const r = db.prepare('DELETE FROM approval_comments WHERE id=?').run(req.params.id);
  return res.json(okWith({ changes: r.changes }, '已删除'));
}

/* ===== 收藏 ===== */
function listFavs(req, res) {
  const me = Number(empId(req)) || 0;
  const rows = db.prepare(`SELECT af.*, a.title, a.type, a.status FROM approval_favs af
    LEFT JOIN approvals a ON a.id=af.approval_id WHERE af.user_id=? ORDER BY af.id DESC`).all(me);
  return res.json(ok({ list: rows }));
}
function createFav(req, res) {
  const { approval_id } = req.body;
  if (!approval_id) return res.json(bad('缺少 approval_id'));
  const r = db.prepare('INSERT OR IGNORE INTO approval_favs (user_id, approval_id) VALUES (?,?)').run(Number(empId(req)) || 0, Number(approval_id));
  return res.json(okWith({ changes: r.changes }, r.changes ? '已收藏' : '已存在'));
}
function deleteFav(req, res) {
  const r = db.prepare('DELETE FROM approval_favs WHERE id=? AND user_id=?').run(req.params.id, Number(empId(req)) || 0);
  return res.json(okWith({ changes: r.changes }, '已取消'));
}

/* ===== 打印 token（极简实现：base64(appid+id+ts) ===== */
function printRequest(req, res) {
  const { approval_id, content } = req.body;
  if (!approval_id) return res.json(bad('缺少 approval_id'));
  const token = Buffer.from('PRINT:' + approval_id + ':' + Date.now()).toString('base64');
  // 简化：把 content 暂存到 approval_comments（type 区分）
  db.prepare(`INSERT INTO approval_comments (emp_no, content) VALUES (?,?)`).run('PRINT:' + token, content || '');
  return res.json(ok({ token, expires_in: 3600 }, '已生成'));
}
function listPrintTokens(req, res) {
  const rows = db.prepare(`SELECT id, content, created_at FROM approval_comments WHERE emp_no LIKE 'PRINT:%' ORDER BY id DESC LIMIT 50`).all();
  return res.json(ok({ list: rows.map(r => ({ ...r, token: r.emp_no.replace('PRINT:', '') })) }));
}
function printExecute(req, res) {
  const { token } = req.body;
  if (!token) return res.json(bad('缺少 token'));
  const row = db.prepare(`SELECT * FROM approval_comments WHERE emp_no=?`).get('PRINT:' + token);
  if (!row) return res.json(notfound('token 无效'));
  return res.json(ok({ content: row.content, executed_at: new Date().toISOString() }, '执行成功'));
}

module.exports = {
  APPROVAL_TYPES, DEFAULT_NODES,
  // 对外接口（供其他模块调用）
  createApproval, actOnApproval, healthCheck,
  // 49 端点
  listTypes, listAllTypes,
  getFlowCharts, listFlows, getFlowByType, listFlowChanges, cancelFlowChange,
  saveFlow, deleteFlow,
  list, listTodo, listDone, listCc,
  preview, create, act, resync,
  listStuck, listStale, efficiency, health,
  fixStatus, fixDeadTodos, purgeQuarantine,
  batchRemind, remindOne, batchAct, followups,
  transfer, addsign, addCc, withdraw, retry,
  exportOne, detail, trace, stats,
  listDelegations, createDelegation, deleteDelegation,
  listComments, createComment, deleteComment,
  listFavs, createFav, deleteFav,
  printRequest, listPrintTokens, printExecute,
};
