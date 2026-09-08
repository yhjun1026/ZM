/**
 * 员工培训管理控制器（迁移自参考项目 routes/training.js，第22轮 + #229-2 严格审批口径）
 * 对齐参考项目业务逻辑：
 *  - 四归口部门：QA=质量管理部 / MKT=市场部 / ADM=行政人事部 / SD=销售部；阶段：年度/季度/月
 *  - 所有培训须严格审批后方可执行，审批终点为公司副总（VP）：
 *    行政人事部发起 → 副总终审；其余部门发起 → 行政人事部审核 → 副总终审
 *  - #229-2 状态锁定：待审批/已通过/已执行 内容锁定不可改；仅「已驳回」可修正并自动重新提交审批
 *  - 培训执行后登记结果，结果资料以附件形式上传（PDF/Word/图片）留存备查
 *  - 培训评价写入 employee_evaluations，供绩效/薪酬取数（对齐参考项目 hr.js / payroll.js 取数口径）
 * 数据表：training_plans / employee_evaluations（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目角色/字段约束）：
 *  1) 参考项目用角色码（QA/MKT/ADM/SD/GM/VP）判定归口，当前项目 users.role 为中文、部门在 users.dept，
 *     故按 dept 反查归口角色（DEPT_OWNER），管理层（总经理/副总/超级管理员）可代指定归口发起；
 *  2) 参考项目附件存 uploads/training/，当前项目静态目录为 server/uploads/，故落 server/uploads/training/；
 *  3) 报名与签到：参考项目无对应表，当前项目亦无，故用 kv_store 存名单（training:signup:<id> / training:signin:<id>）。
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量（对齐参考项目 training.js） ==================== */
// 归口部门（角色 → 负责部门）
const OWNER_MAP = { QA: '质量管理部', MKT: '市场部', ADM: '行政人事部', SD: '销售部' };
// 当前项目 users.dept → 归口角色
const DEPT_OWNER = {
  质量管理部: 'QA', 质量部: 'QA',
  市场部: 'MKT',
  行政人事部: 'ADM', 行政部: 'ADM', 人事行政部: 'ADM',
  销售部: 'SD',
};
const MGMT_ROLES = ['总经理', '副总', '超级管理员'];
const CATEGORIES = ['医疗器械专业知识', '法律法规', '产品专项培训', '公司统一培训', '销售专项培训', '其他'];
const STAGES = ['年度', '季度', '月'];
const EVAL_TYPES = ['专项评价', '半年度绩效', '年度绩效', '试用期转正'];

const TRAIN_DIR = path.join(__dirname, '..', '..', 'uploads', 'training');
const MIME_EXT = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/* ==================== 工具 ==================== */
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const parseAtt = (x) => { try { return JSON.parse(x.result_json || '[]'); } catch (e) { return []; } };
const seq = () => 'TP' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 14) + Math.floor(Math.random() * 900 + 100);

/** 归口角色判定：管理层可代发起（body.owner_role 指定） */
function ownerRoleOf(user, bodyOwnerRole) {
  const byDept = DEPT_OWNER[user && user.dept];
  if (byDept) return byDept;
  if (MGMT_ROLES.includes(user && user.role)) {
    const r = bodyOwnerRole || 'ADM';
    return OWNER_MAP[r] ? r : null;
  }
  return null;
}
/** 可编辑/登记：归口部门、管理层或发起人本人 */
function canEdit(user, t) {
  if (!user) return false;
  if (MGMT_ROLES.includes(user.role)) return true;
  if (DEPT_OWNER[user.dept] === t.owner_role) return true;
  return String(t.created_by) === String(user.id);
}

function createApproval(user, type, title, refId, amount, chain) {
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  const approvalNo = 'AP' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + String(n).padStart(4, '0');
  const info = db.prepare(`INSERT INTO approvals
    (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, type, title, refId || 0, Number(amount) || 0,
      Number(user.id) || 0, user.name || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/** 报名/签到名单（kv_store） */
function roster(kind, planId) {
  const row = db.prepare('SELECT value FROM kv_store WHERE key=?').get(`${kind}:${planId}`);
  if (!row) return [];
  try { return JSON.parse(row.value || '[]'); } catch (e) { return []; }
}
function saveRoster(kind, planId, list) {
  db.prepare(`INSERT INTO kv_store (key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(`${kind}:${planId}`, JSON.stringify(list), localNow());
}

/* ==================== 1. 元数据 ==================== */
async function meta(req, res) {
  return res.json(ok({
    categories: CATEGORIES,
    stages: STAGES,
    owner_roles: Object.keys(OWNER_MAP).map((k) => ({ role: k, dept: OWNER_MAP[k] })),
    statuses: ['待审批', '已通过', '已执行', '已驳回'],
    eval_types: EVAL_TYPES,
  }));
}

/* ==================== 2. 培训台账列表 ==================== */
async function list(req, res) {
  let sql = 'SELECT * FROM training_plans WHERE 1=1';
  const p = [];
  if (req.query.stage) { sql += ' AND stage=?'; p.push(req.query.stage); }
  if (req.query.category) { sql += ' AND category=?'; p.push(req.query.category); }
  if (req.query.owner_role) { sql += ' AND owner_role=?'; p.push(req.query.owner_role); }
  if (req.query.status) { sql += ' AND status=?'; p.push(req.query.status); }
  if (req.query.q) {
    sql += ' AND (title LIKE ? OR trainer LIKE ? OR target LIKE ?)';
    const k = `%${req.query.q}%`; p.push(k, k, k);
  }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...p).map((x) => ({
    ...x,
    attachments: parseAtt(x),
    signup_count: roster('training:signup', x.id).length,
    signin_count: roster('training:signin', x.id).length,
  }));
  rows.forEach((x) => { delete x.result_json; });
  return res.json(ok(rows));
}

/* ==================== 3. 统计 ==================== */
async function stats(req, res) {
  const byStage = db.prepare('SELECT stage, COUNT(*) n FROM training_plans GROUP BY stage').all();
  const byOwner = db.prepare('SELECT owner_dept, owner_role, COUNT(*) n FROM training_plans GROUP BY owner_dept, owner_role').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) n FROM training_plans GROUP BY status').all();
  const upcoming = db.prepare(`SELECT id,plan_no,title,plan_date,trainer,location,status FROM training_plans
    WHERE status IN ('已通过','待审批') AND plan_date IS NOT NULL AND plan_date >= date('now','localtime')
    ORDER BY plan_date ASC LIMIT 10`).all();
  const budget = db.prepare("SELECT COALESCE(SUM(budget),0) s FROM training_plans WHERE status IN ('待审批','已通过','已执行')").get().s;
  const planRows = db.prepare('SELECT id FROM training_plans').all();
  let signup = 0, signin = 0;
  planRows.forEach((x) => { signup += roster('training:signup', x.id).length; signin += roster('training:signin', x.id).length; });
  return res.json(ok({
    total: planRows.length, byStage, byOwner, byStatus, upcoming,
    budget: Math.round((budget || 0) * 100) / 100,
    signup, signin,
  }));
}

/* ==================== 4. 详情 ==================== */
async function detail(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  // 培训评价通过 kv_store 记录关联的评价单 id 列表（employee_evaluations 无 biz 关联列）
  const evalIds = roster('training:eval', t.id).map((x) => x.eva_id).filter(Boolean);
  const evaluations = evalIds.length
    ? db.prepare(`SELECT * FROM employee_evaluations WHERE id IN (${evalIds.map(() => '?').join(',')}) ORDER BY id DESC`).all(...evalIds)
    : [];
  return res.json(ok({
    ...t,
    attachments: parseAtt(t),
    signups: roster('training:signup', t.id),
    signins: roster('training:signin', t.id),
    evaluations,
  }));
}

/* ==================== 5. 发起培训计划（自动进入审批，终点副总） ==================== */
async function create(req, res) {
  const { title, category, stage, plan_date, trainer, target, duration, location, budget, content } = req.body || {};
  if (!title || !category) return res.json(bad('培训主题与类别必填'));
  if (!CATEGORIES.includes(category)) return res.json(bad(`培训类别须为：${CATEGORIES.join('/')}`));
  if (stage && !STAGES.includes(stage)) return res.json(bad(`培训阶段须为：${STAGES.join('/')}`));

  const ownerRole = ownerRoleOf(req.user, (req.body || {}).owner_role);
  if (!ownerRole) {
    return res.json(forbidden('培训计划仅限 质量管理部/市场部/行政人事部/销售部 或 公司领导 发起'));
  }
  const planNo = seq();
  const info = db.prepare(`INSERT INTO training_plans
    (plan_no,title,category,owner_dept,owner_role,stage,plan_date,trainer,target,duration,location,budget,content,status,created_by,created_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'待审批',?,?)`)
    .run(planNo, title, category, OWNER_MAP[ownerRole], ownerRole, stage || '月', plan_date || null,
      trainer || '', target || '', duration || '', location || '', Number(budget) || 0, content || '',
      empId(req) || null, (req.user && req.user.name) || '');
  // 行政人事部发起 → 副总终审；其余部门发起 → 行政人事部审核 → 副总终审
  const chain = ownerRole === 'ADM' ? ['副总'] : [`${OWNER_MAP[ownerRole]}负责人`, '行政人事部', '副总'];
  const ap = createApproval(req.user, '培训审批', `培训计划：${title}（${stage || '月'}·${OWNER_MAP[ownerRole]}）`,
    info.lastInsertRowid, Number(budget) || 0, chain);
  db.prepare('UPDATE training_plans SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('TRAINING_CREATE', req.userId, `培训${planNo}`, `发起培训 ${title}（${category}·${stage || '月'}），审批单 ${ap.approval_no}`);
  return res.json(ok({
    id: info.lastInsertRowid, plan_no: planNo, approval_id: ap.id, approval_no: ap.approval_no,
  }, '培训计划已提交审批，审批通过后方可执行'));
}

/* ==================== 6. 编辑（#229-2：状态锁定，仅已驳回可改并重提） ==================== */
async function update(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  if (!canEdit(req.user, t)) return res.json(forbidden('仅归口部门或公司领导可修改该培训计划'));
  if (t.status === '待审批') return res.json(bad('培训计划正在审批中，内容已锁定不可修改；如需调整请在审批中心撤回后重新发起', 409));
  if (t.status === '已通过') return res.json(bad('培训计划已审批通过，内容锁定；如需变更请重新发起新培训计划', 409));
  if (t.status === '已执行') return res.json(bad('已执行的培训不可再修改内容，结果资料可补充上传', 409));

  const { title, category, stage, plan_date, trainer, target, duration, location, budget, content } = req.body || {};
  if (category && !CATEGORIES.includes(category)) return res.json(bad(`培训类别须为：${CATEGORIES.join('/')}`));
  if (stage && !STAGES.includes(stage)) return res.json(bad(`培训阶段须为：${STAGES.join('/')}`));
  db.prepare(`UPDATE training_plans SET title=?, category=?, stage=?, plan_date=?, trainer=?, target=?,
    duration=?, location=?, budget=?, content=?, updated_at=? WHERE id=?`)
    .run(title || t.title, category || t.category, stage || t.stage,
      plan_date !== undefined ? plan_date : t.plan_date, trainer !== undefined ? trainer : t.trainer,
      target !== undefined ? target : t.target, duration !== undefined ? duration : t.duration,
      location !== undefined ? location : t.location,
      budget !== undefined ? Number(budget) || 0 : t.budget,
      content !== undefined ? content : t.content, localNow(), t.id);
  // 驳回后改单绝不直接执行：自动重新提交审批
  const ap = createApproval(req.user, '培训审批', `培训计划(重提)：${title || t.title}（${stage || t.stage}·${t.owner_dept}）`,
    t.id, budget !== undefined ? Number(budget) || 0 : t.budget,
    t.owner_role === 'ADM' ? ['副总'] : [`${t.owner_dept}负责人`, '行政人事部', '副总']);
  db.prepare(`UPDATE training_plans SET approval_id=?, status='待审批', updated_at=? WHERE id=?`).run(ap.id, localNow(), t.id);
  audit('TRAINING_RESUBMIT', req.userId, `培训${t.plan_no}`, `驳回后修正并重新提交审批（${ap.approval_no}）`);
  return res.json(ok({ approval_id: ap.id, approval_no: ap.approval_no, status: '待审批' },
    '培训计划已修正并重新提交审批，审批通过后方可执行'));
}

/* ==================== 7. 审批终审（副总/总经理） ==================== */
async function approve(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  if (!MGMT_ROLES.includes(req.user && req.user.role)) return res.json(forbidden('培训终审由公司副总/总经理完成'));
  if (t.status !== '待审批') return res.json(bad(`当前状态「${t.status}」无需审批`));
  const { result, comment } = req.body || {};
  if (!['通过', '驳回'].includes(result)) return res.json(bad('审批结果须为 通过 / 驳回'));
  if (result === '驳回') {
    db.prepare(`UPDATE training_plans SET status='已驳回', updated_at=? WHERE id=?`).run(localNow(), t.id);
    if (t.approval_id) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(localNow(), t.approval_id);
    audit('TRAINING_REJECT', req.userId, `培训${t.plan_no}`, `${t.title} 审批驳回：${comment || ''}`);
    return res.json(ok(null, '已驳回，发起人可修正后重新提交'));
  }
  db.prepare(`UPDATE training_plans SET status='已通过', updated_at=? WHERE id=?`).run(localNow(), t.id);
  if (t.approval_id) db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(localNow(), t.approval_id);
  audit('TRAINING_APPROVE', req.userId, `培训${t.plan_no}`, `${t.title} 审批通过，可组织执行`);
  return res.json(ok(null, '审批通过，可组织执行并登记结果'));
}

/* ==================== 8. 培训结果登记（附件快照） ==================== */
async function result(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  if (!canEdit(req.user, t)) return res.json(forbidden('仅归口部门或公司领导可登记培训结果'));
  // #229-2：仅已通过/已执行可登记，杜绝未批先执行
  if (!['已通过', '已执行'].includes(t.status)) {
    return res.json(bad(t.status === '待审批'
      ? '培训尚未审批通过，不能登记结果'
      : `培训计划当前状态「${t.status}」不能登记执行结果（须审批通过后组织执行并登记）`, 409));
  }
  const { result_note, exec_date, file_name, file_b64 } = req.body || {};
  const attachments = parseAtt(t);
  let saved = null;
  if (file_b64) {
    const mime = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/.exec(file_b64);
    if (!mime) return res.json(bad('附件数据格式非法'));
    const ext = MIME_EXT[mime[1]];
    if (!ext) return res.json(bad('培训结果附件仅支持 PDF / Word / 图片（.pdf/.doc/.docx/.jpg/.png）'));
    const safeName = String(file_name || `培训结果_${t.plan_no}`).replace(/[\\/:*?"<>|]/g, '_');
    const fname = `${t.plan_no}_${Date.now()}.${ext}`;
    try {
      fs.mkdirSync(TRAIN_DIR, { recursive: true });
      fs.writeFileSync(path.join(TRAIN_DIR, fname), Buffer.from(file_b64.split(',')[1], 'base64'));
    } catch (e) {
      return res.json(bad(`附件保存失败：${e.message}`));
    }
    saved = { file_name: safeName, file_path: `/uploads/training/${fname}`, uploaded_at: localNow() };
    attachments.push(saved);
  }
  db.prepare(`UPDATE training_plans SET status='已执行', result_note=?, exec_date=?, exec_by=?, result_json=?, updated_at=? WHERE id=?`)
    .run(result_note !== undefined ? result_note : t.result_note,
      exec_date || t.exec_date || localNow().slice(0, 10),
      (req.user && req.user.name) || '', JSON.stringify(attachments), localNow(), t.id);
  audit('TRAINING_RESULT', req.userId, `培训${t.plan_no}`, `登记培训结果 ${t.title}（附件${attachments.length}份）`);
  return res.json(ok({ plan_no: t.plan_no, attachments: saved ? [saved] : [] }, '培训结果已登记'));
}

/* ==================== 9. 报名 / 签到 ==================== */
async function signup(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  const b = req.body || {};
  const name = b.emp_name || (req.user && req.user.name) || '';
  const list = roster('training:signup', t.id);
  if (list.some((x) => (b.emp_id && x.emp_id === Number(b.emp_id)) || x.emp_name === name)) {
    return res.json(bad('该人员已报名'));
  }
  list.push({
    emp_id: Number(b.emp_id) || empId(req) || 0,
    emp_name: name,
    dept: b.dept || (req.user && req.user.dept) || '',
    signed_at: localNow(),
  });
  saveRoster('training:signup', t.id, list);
  audit('TRAINING_SIGNUP', req.userId, `培训${t.plan_no}`, `${name} 报名参训`);
  return res.json(ok(list, '报名成功'));
}

async function cancelSignup(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  const empId = Number(req.query.emp_id || req.userId) || 0;
  const list = roster('training:signup', t.id).filter((x) => x.emp_id !== empId);
  saveRoster('training:signup', t.id, list);
  return res.json(ok(list, '已取消报名'));
}

async function signin(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  if (!['已通过', '已执行'].includes(t.status)) return res.json(bad('培训尚未通过审批，不能签到', 409));
  const b = req.body || {};
  const name = b.emp_name || (req.user && req.user.name) || '';
  const empId = Number(b.emp_id || req.userId) || 0;
  const list = roster('training:signin', t.id);
  if (list.some((x) => x.emp_id === empId || x.emp_name === name)) return res.json(bad('该人员已签到'));
  list.push({ emp_id: empId, emp_name: name, dept: b.dept || (req.user && req.user.dept) || '', signed_at: localNow() });
  saveRoster('training:signin', t.id, list);
  audit('TRAINING_SIGNIN', req.userId, `培训${t.plan_no}`, `${name} 签到`);
  return res.json(ok(list, '签到成功'));
}

/* ==================== 10. 培训评价（employee_evaluations） ==================== */
async function evaluate(req, res) {
  const t = db.prepare('SELECT * FROM training_plans WHERE id=?').get(req.params.id);
  if (!t) return res.json(notfound('培训计划不存在'));
  if (!canEdit(req.user, t)) return res.json(forbidden('仅归口部门或公司领导可登记培训评价'));
  const b = req.body || {};
  if (!b.score) return res.json(bad('评分必填'));
  const score = Number(b.score);
  if (!(score >= 0 && score <= 100)) return res.json(bad('评分须在 0-100 之间'));
  // 支持按 emp_id 或姓名定位被评价员工
  const emp = b.emp_id
    ? db.prepare('SELECT id,name FROM employees WHERE id=?').get(b.emp_id)
    : db.prepare('SELECT id,name FROM employees WHERE name=?').get(b.emp_name || '');
  if (!emp) return res.json(notfound('被评价员工不存在（须为员工花名册中的在职员工）'));
  const evaNo = 'EVA' + localNow().replace(/[-: ]/g, '').slice(0, 14) + Math.floor(Math.random() * 900 + 100);
  const evalType = EVAL_TYPES.includes(b.eval_type) ? b.eval_type : '专项评价';
  const info = db.prepare(`INSERT INTO employee_evaluations
    (eva_no,emp_id,emp_name,eval_type,score,comment,suggestion,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(evaNo, emp.id, b.emp_name || emp.name, evalType, score,
      `培训【${t.title}】(${t.plan_no}) ${b.comment || ''}`.trim(),
      b.suggestion || '', empId(req) || null, (req.user && req.user.name) || '');
  const evals = roster('training:eval', t.id);
  evals.push({ eva_id: info.lastInsertRowid, emp_id: emp.id, emp_name: emp.name, score });
  saveRoster('training:eval', t.id, evals);
  audit('TRAINING_EVAL', req.userId, `培训${t.plan_no}`, `${emp.name} 培训评价 ${score} 分（${evaNo}）`);
  return res.json(ok({ id: info.lastInsertRowid, eva_no: evaNo }, '培训评价已登记'));
}

module.exports = {
  meta, list, stats, detail, create, update, approve, result,
  signup, cancelSignup, signin, evaluate,
};
