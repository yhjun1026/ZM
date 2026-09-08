/**
 * 人事业务控制器（迁移自参考项目 routes/hr.js，第54轮 #265-#269 人力资源模块增强版）
 *
 * 对齐参考项目业务逻辑：
 *  1. 入职建档 employee_onboards：姓名/角色必填、角色须合法、花名册同名在职校验(409)；
 *     审批通过后进入「待入职」，行政人事部办理入职(activate)时写花名册+分配工号+汇报关系+初始密码 Zm123456
 *  2. 转正评估 employee_evaluations：类型（试用期转正/半年度绩效/年度绩效/专项评价）、评分 0-100 校验
 *  3. 调岗异动 hr_transfers：类型（岗位调动/晋升/降职/调岗/调薪/综合调整），记录原/新部门、职位、角色、薪资；
 *     仅行政人事线或被异动员工直属上级可发起；审批通过后写回员工档案
 *  4. 离职 hr_resignations：类型（主动辞职/协商解除/合同到期不续签/辞退）、最后工作日必填；
 *     本人自助或 HR 代填 → 审批通过「待离职」→ HR 办理停用账号（status=离职）
 *  5. 人事合同 hr_contracts：新签/续签/变更，草稿→审批中→已通过→已归档
 *  6. 招聘三件套：需求 recruit_reqs（编制校验：在职+在途招聘+本次 ≤ 部门编制）→ 候选人 recruit_candidates
 *     （阶段流转 初筛→面试→复试→待录用→已录用/淘汰/放弃，终态不可再流转，录用须走 Offer）→ Offer recruit_offers
 *     （候选人须在「复试/待录用」方可发起，审批通过后自动建档待入职）
 *  7. 员工权限 emp_permissions：员工级模块权限覆盖，行政人事线归口
 *  8. HR 数据看板：在职人数/本月入职离职/在招需求/待入职/部门编制
 *
 * 与参考项目的差异（受当前项目角色/审批体系约束）：
 *  1) 参考项目用角色码（ADM/HR2/GM/VP）判定人事线，当前项目 users.role 为中文、部门在 users.dept，
 *     故按 role + dept 判定（见 isHr）；审批链固定为「行政人事部 → 副总」两级（参考项目按类型动态含直属上级节点）。
 *  2) 参考项目由 approvals.js 审批联动器回调写回业务表，当前项目无统一联动器，
 *     故各业务提供 /:id/approve 逐级审批接口，终审通过时执行与参考项目 applyXXX 完全一致的写回逻辑。
 *  3) 员工建档初始密码沿用参考项目 Zm123456（bcrypt 哈希）。
 *
 * 数据表：employee_onboards / employee_evaluations / hr_transfers / hr_resignations / hr_contracts /
 *         recruit_reqs / recruit_candidates / recruit_offers / emp_permissions / employees / org_units
 */
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量（对齐参考项目 hr.js） ==================== */
const HR_VIEW = ['总经理', '副总', '超级管理员'];
const HR_DEPTS = ['行政人事部', '人事行政部', '行政部', '人力资源部'];
const GM_ROLES = ['总经理', '超级管理员'];
const VP_ROLES = ['副总', '总经理', '超级管理员'];

const EVAL_TYPES = ['试用期转正', '半年度绩效', '年度绩效', '专项评价'];
const TF_TYPES = ['岗位调动', '晋升', '降职', '调岗', '调薪', '综合调整'];
const RS_TYPES = ['主动辞职', '协商解除', '合同到期不续签', '辞退'];
const RECRUIT_STAGES = ['初筛', '面试', '复试', '待录用', '已录用', '淘汰', '放弃'];
const CONTRACT_TYPES = ['新签', '续签', '变更'];
const REQ_TYPES = ['新增', '补员', '储备'];
const GENDERS = ['男', '女'];
const SOURCES = ['招聘网站', '内推', '猎头', '校招', '其他'];
/** 员工权限模块（对齐参考项目 lib.js MODULE_NAME） */
const PERM_MODULES = ['org', 'dept', 'hr', 'directory', 'customer', 'opp', 'salesboard', 'dms', 'bid',
  'finance', 'payout', 'budget', 'approval', 'seal', 'collab', 'daily', 'notice', 'msg', 'doc', 'doclib',
  'market', 'qual', 'service', 'supply', 'procurement', 'audit', 'training', 'archive', 'ops', 'payroll',
  'bizflow', 'contract', 'kpi', 'coord'];

const isHr = (u) => !!u && (HR_VIEW.includes(u.role) || HR_DEPTS.includes(u.dept) || u.role === '超级管理员');
const isVP = (u) => !!u && VP_ROLES.includes(u.role);
const isGM = (u) => !!u && GM_ROLES.includes(u.role);

const pad = (n) => String(n).padStart(2, '0');
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const today = () => localNow().slice(0, 10);
const genNo = (prefix) => prefix + localNow().replace(/[-: ]/g, '').slice(0, 14) + Math.floor(Math.random() * 90 + 10);

/** users.id（'28' / 'ZM001'）→ employees 行 */
function empOf(userId) {
  if (!userId) return null;
  const s = String(userId);
  if (/^\d+$/.test(s)) {
    const e = db.prepare('SELECT * FROM employees WHERE id=?').get(Number(s));
    if (e) return e;
  }
  return db.prepare('SELECT * FROM employees WHERE emp_no=? OR emp_no=?').get(s, 'ZM' + s) || null;
}

/** 生成审批单：行政人事部 → 副总（两级） */
function createApproval(user, type, title, refId, amount) {
  // 单号：AP + 日期 + 4 位序号 + 3 位随机（对齐参考项目 lib.createApproval，避免同秒/删行后撞号）
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  const approvalNo = 'AP' + new Date().toISOString().slice(0, 10).replace(/-/g, '')
    + String(n).padStart(4, '0') + Math.floor(Math.random() * 900 + 100);
  const chain = ['行政人事部', '副总'];
  const info = db.prepare(`INSERT INTO approvals
    (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, type, title, refId || 0, Number(amount) || 0,
      Number(user.id) || 0, user.name || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/**
 * 通用逐级审批：第 1 级行政人事部，第 2 级（终审）副总/总经理。
 * @param table 业务表名（内部常量传入，非用户输入）
 * @param onPass 终审通过后执行的写回逻辑，返回 { status } 或 { status, msg }
 */
async function doApprove(req, res, table, onPass, pending) {
  const waitStatus = pending || '待审批';
  const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(req.params.id);
  if (!row) return res.json(notfound('记录不存在'));
  if (row.status !== waitStatus) return res.json(bad(`当前状态「${row.status}」无需审批`, 409));
  const { result, comment } = req.body || {};
  if (!['通过', '驳回'].includes(result)) return res.json(bad('审批结果须为 通过 / 驳回'));

  const ap = row.approval_id ? db.prepare('SELECT * FROM approvals WHERE id=?').get(row.approval_id) : null;
  const step = ap ? Number(ap.current_step) || 1 : 1;
  const total = ap ? Number(ap.total_steps) || 1 : 1;
  if (step === 1 && !isHr(req.user)) return res.json(forbidden('第 1 级由行政人事部审核'));
  if (step > 1 && !isVP(req.user)) return res.json(forbidden(`第 ${step} 级由副总/总经理审批`));

  if (result === '驳回') {
    db.prepare(`UPDATE ${table} SET status='驳回' WHERE id=?`).run(row.id);
    if (ap) {
      db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(localNow(), ap.id);
      db.prepare("UPDATE approval_steps SET action='驳回', approver_name=?, comment=?, acted_at=? WHERE approval_id=? AND seq=?")
        .run(req.user.name || '', comment || '', localNow(), ap.id, step);
    }
    audit('HR_REJECT', req.userId, `${table}#${row.id}`, `驳回：${comment || ''}`);
    return res.json(ok(null, '已驳回，发起人可修正后重新提交'));
  }

  if (ap && step < total) {
    db.prepare('UPDATE approvals SET current_step=? WHERE id=?').run(step + 1, ap.id);
    db.prepare("UPDATE approval_steps SET action='通过', approver_name=?, comment=?, acted_at=? WHERE approval_id=? AND seq=?")
      .run(req.user.name || '', comment || '', localNow(), ap.id, step);
    audit('HR_APPROVE_STEP', req.userId, `${table}#${row.id}`, `第 ${step} 级审批通过，流转至第 ${step + 1} 级`);
    return res.json(ok({ step: step + 1, total }, `第 ${step} 级审批通过，已流转至第 ${step + 1} 级`));
  }

  const r = (typeof onPass === 'function' ? onPass(row) : {}) || {};
  db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(r.status || '已通过', row.id);
  if (ap) {
    db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(localNow(), ap.id);
    db.prepare("UPDATE approval_steps SET action='通过', approver_name=?, comment=?, acted_at=? WHERE approval_id=? AND seq=?")
      .run(req.user.name || '', comment || '', localNow(), ap.id, step);
  }
  audit('HR_APPROVE', req.userId, `${table}#${row.id}`, `审批通过：${comment || ''}`);
  return res.json(ok(null, r.msg || '审批通过'));
}

/* ==================== 0. 元数据 / 辅助下拉 ==================== */
async function meta(req, res) {
  return res.json(ok({
    eval_types: EVAL_TYPES,
    tf_types: TF_TYPES,
    rs_types: RS_TYPES,
    recruit_stages: RECRUIT_STAGES,
    contract_types: CONTRACT_TYPES,
    req_types: REQ_TYPES,
    genders: GENDERS,
    sources: SOURCES,
    perm_modules: PERM_MODULES,
    roles: db.prepare('SELECT DISTINCT role FROM employees ORDER BY role').all().map((x) => x.role),
    is_hr: isHr(req.user),
  }));
}
async function orgs(req, res) {
  return res.json(ok(db.prepare("SELECT id,name,type,headcount FROM org_units WHERE status='启用' ORDER BY type,id").all()));
}
async function staff(req, res) {
  return res.json(ok(db.prepare("SELECT id,emp_no,name,title,role,region FROM employees WHERE status='在职' ORDER BY id").all()));
}

/* ==================== 8. HR 数据看板 ==================== */
async function dashboard(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('人事看板仅行政人事线/管理层可见'));
  const year = new Date().getFullYear();
  const mon = `${year}-${pad(new Date().getMonth() + 1)}`;
  const total = db.prepare("SELECT COUNT(*) c FROM employees WHERE status='在职'").get().c;
  const thisMonthJoin = db.prepare("SELECT COUNT(*) c FROM employees WHERE status='在职' AND hire_date LIKE ?").get(mon + '%').c;
  const thisMonthLeave = db.prepare("SELECT COUNT(*) c FROM hr_resignations WHERE status='已离职' AND finished_at LIKE ?").get(mon + '%').c;
  const transferDone = db.prepare("SELECT COUNT(*) c FROM hr_transfers WHERE status='已生效' AND created_at LIKE ?").get(mon + '%').c;
  const resigning = db.prepare("SELECT COUNT(*) c FROM hr_resignations WHERE status IN ('待审批','待离职')").get().c;
  const transferPending = db.prepare("SELECT COUNT(*) c FROM hr_transfers WHERE status='待审批'").get().c;
  const recruiting = db.prepare("SELECT COUNT(*) c FROM recruit_reqs WHERE status IN ('待审批','招聘中')").get().c;
  const offerPending = db.prepare("SELECT COUNT(*) c FROM recruit_offers WHERE status='待审批'").get().c;
  const pendingJoin = db.prepare("SELECT COUNT(*) c FROM employee_onboards WHERE status='待入职'").get().c;
  const dept = db.prepare(`SELECT o.id,o.name,o.headcount,
      (SELECT name FROM employees e WHERE e.id=o.manager_emp_id) manager,
      (SELECT COUNT(*) FROM employees e WHERE e.org_id=o.id AND e.status='在职') incumb
    FROM org_units o WHERE o.type='DEPT' AND o.status='启用' ORDER BY o.id`).all();
  const roleDist = db.prepare("SELECT role,COUNT(*) n FROM employees WHERE status='在职' GROUP BY role ORDER BY n DESC").all();
  const expiring = db.prepare(`SELECT hc_no,emp_name,end_date,status FROM hr_contracts
    WHERE status IN ('已通过','已归档') AND end_date>=? AND end_date<=? ORDER BY end_date LIMIT 20`)
    .all(today(), `${year}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate() + 90)}`);
  return res.json(ok({
    date: today(),
    cards: {
      total, dept_count: dept.length, this_month_join: thisMonthJoin, this_month_leave: thisMonthLeave,
      transfer_done: transferDone, transfer_pending: transferPending, resigning, recruiting,
      offer_pending: offerPending, pending_join: pendingJoin,
    },
    dept, roleDist, expiring,
  }));
}

/* ==================== 1. 入职建档 ==================== */
async function listOnboards(req, res) {
  const rows = isHr(req.user)
    ? db.prepare(`SELECT o.*, a.status approval_status, a.current_step, a.total_steps, a.approval_no
      FROM employee_onboards o LEFT JOIN approvals a ON a.id=o.approval_id ORDER BY o.id DESC`).all()
    : db.prepare(`SELECT o.*, a.status approval_status, a.approval_no
      FROM employee_onboards o LEFT JOIN approvals a ON a.id=o.approval_id
      WHERE o.operator_id=? ORDER BY o.id DESC`).all(empId(req) || 0);
  return res.json(ok(rows));
}
async function createOnboard(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('员工录入仅行政人事线/管理层可操作'));
  const { name, gender, phone, email, title, role, org_id, region, hire_date, salary, remark } = req.body || {};
  if (!name || !role) return res.json(bad('姓名与角色必填'));
  if (db.prepare('SELECT id FROM employees WHERE name=? AND status=?').get(name, '在职'))
    return res.json(bad(`花名册中已存在同名在职员工：${name}`, 409));
  const org = org_id ? db.prepare('SELECT name FROM org_units WHERE id=?').get(org_id) : null;
  const no = genNo('ONB');
  const info = db.prepare(`INSERT INTO employee_onboards
    (onb_no,name,gender,phone,email,title,role,org_id,dept_name,region,hire_date,salary,remark,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, name, gender || '', phone || '', email || '', title || '', role,
      org_id || null, org ? org.name : '', region || '', hire_date || today(),
      Number(salary) || 0, remark || '', empId(req) || null, req.user.name || '');
  const ap = createApproval(req.user, '员工入职审批', `员工入职：${name}（${role} / ${title || '待定职位'}）`, info.lastInsertRowid, salary);
  db.prepare('UPDATE employee_onboards SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('HR_ONBOARD_CREATE', req.userId, no, `录入 ${name} 拟任 ${role}，已提交人事审批（${ap.approval_no}）`);
  return res.json(ok({ id: info.lastInsertRowid, onb_no: no, approval_id: ap.id, approval_no: ap.approval_no, status: '待审批' },
    '入职登记已提交审批'));
}
/** 审批通过 → 待入职 */
async function approveOnboard(req, res) {
  return doApprove(req, res, 'employee_onboards', () => ({ status: '待入职', msg: '审批通过，待行政人事部办理入职' }));
}
/** 办理入职：写花名册 + 分配工号 + 汇报关系 + 初始密码（对齐参考项目 createEmployeeFromOnboard） */
async function activateOnboard(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('办理入职仅行政人事线/管理层可操作'));
  const onb = db.prepare('SELECT * FROM employee_onboards WHERE id=?').get(req.params.id);
  if (!onb) return res.json(notfound('入职登记单不存在'));
  if (onb.status !== '待入职') return res.json(bad('仅「审批通过·待入职」的登记单可办理入职', 409));

  const maxNo = db.prepare("SELECT emp_no FROM employees WHERE emp_no LIKE 'ZM%' ORDER BY CAST(substr(emp_no,3) AS INTEGER) DESC LIMIT 1").get();
  const nextSeq = maxNo ? (parseInt(maxNo.emp_no.slice(2), 10) || 0) + 1 : 1;
  const empNo = 'ZM' + String(nextSeq).padStart(3, '0');
  const hash = bcrypt.hashSync('Zm123456', 10);
  let report1 = null;
  if (onb.org_id) {
    const mgr = db.prepare('SELECT manager_emp_id FROM org_units WHERE id=?').get(onb.org_id);
    if (mgr && mgr.manager_emp_id) report1 = mgr.manager_emp_id;
  }
  if (!report1 && onb.region) {
    const rm = db.prepare("SELECT id FROM employees WHERE role='区域经理' AND region=? AND status='在职' ORDER BY id LIMIT 1").get(onb.region);
    if (rm) report1 = rm.id;
  }
  // 对齐参考项目第65轮：建档后账号默认「待开通」，须由行政人事部负责人在权限设置中开通方可登录
  const info = db.prepare(`INSERT INTO employees
    (emp_no,name,password_hash,title,role,org_id,region,phone,email,hire_date,report1_id,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'待开通')`)
    .run(empNo, onb.name, hash, onb.title || onb.role, onb.role, onb.org_id || null,
      onb.region || '', onb.phone || '', onb.email || '', onb.hire_date || today(), report1);
  db.prepare("UPDATE employee_onboards SET status='通过', emp_id=? WHERE id=?").run(info.lastInsertRowid, onb.id);
  // 注：参考项目 employee_onboards 有 offer_id 列，当前库无此列，反向关联走 recruit_offers.onboard_id
  db.prepare("UPDATE recruit_offers SET status='已入职', onboard_at=? WHERE onboard_id=? AND status='已通过'")
    .run(localNow(), onb.id);
  audit('HR_ONBOARD_ACTIVATE', req.userId, onb.onb_no, `${onb.name} 工号 ${empNo} 入职花名册（初始密码 Zm123456，待开通）`);
  return res.json(ok({ emp_id: info.lastInsertRowid, emp_no: empNo, status: '通过' },
    `已办理入职，工号 ${empNo}（账号待开通）`));
}

/* ==================== 2. 转正评估 / 绩效评价 ==================== */
async function listEvaluations(req, res) {
  const rows = isHr(req.user)
    ? db.prepare(`SELECT e.*, a.status approval_status, a.current_step, a.total_steps, a.approval_no
      FROM employee_evaluations e LEFT JOIN approvals a ON a.id=e.approval_id ORDER BY e.id DESC`).all()
    : db.prepare(`SELECT e.*, a.status approval_status, a.approval_no FROM employee_evaluations e
      LEFT JOIN approvals a ON a.id=e.approval_id WHERE e.operator_id=? OR e.emp_id=? ORDER BY e.id DESC`)
      .all(empId(req) || 0, empId(req) || 0);
  return res.json(ok(rows));
}
async function createEvaluation(req, res) {
  const { emp_id, eval_type, score, comment, suggestion } = req.body || {};
  if (!emp_id || !eval_type) return res.json(bad('被评价员工与评价类型必填'));
  if (!EVAL_TYPES.includes(eval_type)) return res.json(bad(`评价类型须为：${EVAL_TYPES.join('/')}`));
  const emp = db.prepare("SELECT id,name,role,report1_id FROM employees WHERE id=? AND status='在职'").get(emp_id);
  if (!emp) return res.json(notfound('被评价员工不存在或不在职'));
  const s = Number(score);
  if (!(s >= 0 && s <= 100)) return res.json(bad('评分须在 0-100 之间'));
  const no = genNo('EVA');
  const info = db.prepare(`INSERT INTO employee_evaluations
    (eva_no,emp_id,emp_name,eval_type,score,comment,suggestion,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(no, emp.id, emp.name, eval_type, s, comment || '', suggestion || '',
      empId(req) || null, req.user.name || '');
  const ap = createApproval(req.user, '员工评价审批', `员工评价：${emp.name}（${eval_type}，${s}分）`, info.lastInsertRowid, 0);
  db.prepare('UPDATE employee_evaluations SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('HR_EVAL_CREATE', req.userId, no, `${emp.name} ${eval_type} ${s} 分，已提交审批（${ap.approval_no}）`);
  return res.json(ok({ id: info.lastInsertRowid, eva_no: no, approval_id: ap.id, approval_no: ap.approval_no, status: '待审批' },
    '评价已提交审批'));
}
/** 转正/绩效评价通过：评分留档（供绩效 kpi 取数，参考项目 kpi 用「通过」的评价分） */
async function approveEvaluation(req, res) {
  return doApprove(req, res, 'employee_evaluations', () => ({ status: '通过', msg: '评价审批通过' }));
}

/* ==================== 3. 调岗异动 ==================== */
async function listTransfers(req, res) {
  const rows = isHr(req.user)
    ? db.prepare(`SELECT t.*, a.status approval_status, a.current_step, a.total_steps, a.approval_no
      FROM hr_transfers t LEFT JOIN approvals a ON a.id=t.approval_id ORDER BY t.id DESC`).all()
    : db.prepare(`SELECT t.*, a.status approval_status, a.approval_no FROM hr_transfers t
      LEFT JOIN approvals a ON a.id=t.approval_id WHERE t.emp_id=? OR t.operator_id=? ORDER BY t.id DESC`)
      .all(empId(req) || 0, empId(req) || 0);
  return res.json(ok(rows));
}
async function createTransfer(req, res) {
  const { emp_id, tf_type, dst_org_id, dst_dept, dst_title, dst_role, dst_region, new_salary, effective_date, reason } = req.body || {};
  if (!emp_id || !tf_type) return res.json(bad('被异动员工与异动类型必填'));
  if (!TF_TYPES.includes(tf_type)) return res.json(bad(`异动类型须为：${TF_TYPES.join('/')}`));
  const emp = db.prepare("SELECT id,name,emp_no,title,role,org_id,region,hire_date,report1_id FROM employees WHERE id=? AND status='在职'").get(emp_id);
  if (!emp) return res.json(notfound('被异动员工不存在或不在职'));
  if (!(isHr(req.user) || emp.report1_id === empId(req))) {
    return res.json(forbidden('仅行政人事线/管理层或被异动员工的直属上级可发起异动'));
  }
  const srcOrg = emp.org_id ? db.prepare('SELECT name FROM org_units WHERE id=?').get(emp.org_id) : null;
  let dstName = dst_dept || '';
  if (dst_org_id && !dstName) {
    const o = db.prepare('SELECT name FROM org_units WHERE id=?').get(dst_org_id);
    if (o) dstName = o.name;
  }
  const sp = db.prepare('SELECT base_salary FROM salary_profiles WHERE emp_id=?').get(emp.id);
  const oldSal = sp ? Number(sp.base_salary) || 0 : 0;
  const newSal = Number(new_salary) || 0;
  const no = genNo('TF');
  const info = db.prepare(`INSERT INTO hr_transfers
    (tf_no,emp_id,emp_name,emp_no,tf_type,src_org_id,src_dept,src_title,src_role,
     dst_org_id,dst_dept,dst_title,dst_role,dst_region,old_salary,new_salary,effective_date,reason,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, emp.id, emp.name, emp.emp_no || '', tf_type, emp.org_id || null, srcOrg ? srcOrg.name : '',
      emp.title || '', emp.role || '', dst_org_id || null, dstName, dst_title || '', dst_role || '',
      dst_region || '', oldSal, newSal, effective_date || today(), reason || '',
      empId(req) || null, req.user.name || '');
  const ap = createApproval(req.user, '员工异动审批',
    `员工${tf_type}：${emp.name}${dst_title ? ` → ${dst_title}` : ''}`, info.lastInsertRowid, newSal);
  db.prepare('UPDATE hr_transfers SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('HR_TRANSFER_CREATE', req.userId, no, `${emp.name} ${tf_type}，已提交审批（${ap.approval_no}）`);
  return res.json(ok({ id: info.lastInsertRowid, tf_no: no, approval_id: ap.id, approval_no: ap.approval_no, status: '待审批' },
    '异动已提交审批'));
}
/** 审批通过 → 写回员工档案（对齐参考项目：部门/职位/角色/区域/薪资） */
async function approveTransfer(req, res) {
  return doApprove(req, res, 'hr_transfers', (row) => {
    db.prepare(`UPDATE employees SET
      org_id=COALESCE(?, org_id), title=COALESCE(NULLIF(?,''), title),
      role=COALESCE(NULLIF(?,''), role), region=COALESCE(NULLIF(?,''), region) WHERE id=?`)
      .run(row.dst_org_id, row.dst_title || '', row.dst_role || '', row.dst_region || '', row.emp_id);
    if (Number(row.new_salary) > 0) {
      const sp = db.prepare('SELECT id FROM salary_profiles WHERE emp_id=?').get(row.emp_id);
      if (sp) db.prepare('UPDATE salary_profiles SET base_salary=? WHERE emp_id=?').run(Number(row.new_salary), row.emp_id);
      else {
        try {
          db.prepare('INSERT INTO salary_profiles (emp_id, base_salary) VALUES (?,?)').run(row.emp_id, Number(row.new_salary));
        } catch (e) { /* 薪酬档案表结构差异不阻断异动生效 */ }
      }
    }
    return { status: '已生效', msg: '异动审批通过，员工档案已更新' };
  });
}

/* ==================== 4. 离职（含交接清单） ==================== */
async function listResignations(req, res) {
  const rows = isHr(req.user)
    ? db.prepare(`SELECT x.*, a.status approval_status, a.current_step, a.total_steps, a.approval_no
      FROM hr_resignations x LEFT JOIN approvals a ON a.id=x.approval_id ORDER BY x.id DESC`).all()
    : db.prepare(`SELECT x.*, a.status approval_status, a.approval_no FROM hr_resignations x
      LEFT JOIN approvals a ON a.id=x.approval_id WHERE x.emp_id=? OR x.operator_id=? ORDER BY x.id DESC`)
      .all(empId(req) || 0, empId(req) || 0);
  return res.json(ok(rows.map((x) => ({
    ...x,
    handover: (() => { try { return JSON.parse(x.handover_json || '[]'); } catch (e) { return []; } })(),
    assets: (() => { try { return JSON.parse(x.asset_json || '[]'); } catch (e) { return []; } })(),
  }))));
}
async function createResignation(req, res) {
  const { emp_id, resign_type, last_work_date, reason, handover, assets } = req.body || {};
  if (!resign_type || !last_work_date) return res.json(bad('离职类型与最后工作日必填'));
  if (!RS_TYPES.includes(resign_type)) return res.json(bad(`离职类型须为：${RS_TYPES.join('/')}`));
  const me = empOf(req.userId);
  let emp;
  if (emp_id && Number(emp_id) !== empId(req)) {
    if (!isHr(req.user)) return res.json(forbidden('只能提交本人离职申请，或由行政人事部代填'));
    emp = db.prepare("SELECT id,name,emp_no,title,org_id,region,hire_date,report1_id FROM employees WHERE id=? AND status='在职'").get(emp_id);
    if (!emp) return res.json(notfound('员工不存在或不在职'));
  } else {
    emp = me && me.status === '在职' ? me : null;
    if (!emp) return res.json(bad('您当前不在职，无法提交离职申请'));
  }
  const org = emp.org_id ? db.prepare('SELECT name FROM org_units WHERE id=?').get(emp.org_id) : null;
  const no = genNo('RS');
  const info = db.prepare(`INSERT INTO hr_resignations
    (rs_no,emp_id,emp_name,emp_no,emp_title,emp_dept,resign_type,last_work_date,reason,handover_json,asset_json,operator_id,operator_name,applied_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, emp.id, emp.name, emp.emp_no || '', emp.title || '', org ? org.name : '', resign_type, last_work_date,
      reason || '', JSON.stringify(handover || []), JSON.stringify(assets || []),
      empId(req) || null, req.user.name || '', localNow());
  const ap = createApproval(req.user, '员工离职审批',
    `员工离职：${emp.name}（${resign_type}，最后工作日 ${last_work_date}）`, info.lastInsertRowid, 0);
  db.prepare('UPDATE hr_resignations SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('HR_RESIGN_CREATE', req.userId, no, `${emp.name} ${resign_type}，最后工作日 ${last_work_date}，已提交审批`);
  return res.json(ok({ id: info.lastInsertRowid, rs_no: no, approval_id: ap.id, approval_no: ap.approval_no, status: '待审批' },
    '离职申请已提交审批'));
}
/** 审批通过 → 待离职（HR 办理停用后正式离职） */
async function approveResignation(req, res) {
  return doApprove(req, res, 'hr_resignations', () => ({ status: '待离职', msg: '审批通过，待行政人事部办理离职手续' }));
}
/** 离职交接清单 / 资产核验清单维护（待离职阶段可补录） */
async function updateHandover(req, res) {
  const rs = db.prepare('SELECT * FROM hr_resignations WHERE id=?').get(req.params.id);
  if (!rs) return res.json(notfound('离职单不存在'));
  if (!isHr(req.user) && Number(rs.emp_id) !== empId(req)) {
    return res.json(forbidden('仅行政人事部或离职员工本人可维护交接清单'));
  }
  if (!['待审批', '待离职'].includes(rs.status)) return res.json(bad(`当前状态「${rs.status}」不可维护交接清单`, 409));
  const { handover, assets } = req.body || {};
  db.prepare('UPDATE hr_resignations SET handover_json=COALESCE(?,handover_json), asset_json=COALESCE(?,asset_json) WHERE id=?')
    .run(handover ? JSON.stringify(handover) : null, assets ? JSON.stringify(assets) : null, rs.id);
  audit('HR_RESIGN_HANDOVER', req.userId, rs.rs_no, `更新离职交接/资产清单`);
  return res.json(ok(null, '交接清单已更新'));
}
/** HR 办理离职：停用账号（status=离职）+ 完结单据（对齐参考项目 /resignations/:id/finish） */
async function finishResignation(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('离职办理仅行政人事线/管理层可操作'));
  const rs = db.prepare('SELECT * FROM hr_resignations WHERE id=?').get(req.params.id);
  if (!rs) return res.json(notfound('离职单不存在'));
  if (rs.status !== '待离职') return res.json(bad('仅审批通过（待离职）的离职单可办理停用', 409));
  db.prepare("UPDATE employees SET status='离职' WHERE id=?").run(rs.emp_id);
  db.prepare("UPDATE hr_resignations SET status='已离职', finished_at=?, finished_by=? WHERE id=?")
    .run(localNow(), req.user.name || '', rs.id);
  audit('HR_RESIGN_FINISH', req.userId, rs.rs_no, `${rs.emp_name} 账号已停用（${rs.last_work_date || '-'} 后离职）`);
  return res.json(ok({ status: '已离职' }, '离职手续办理完成，账号已停用'));
}

/* ==================== 5. 人事合同 ==================== */
async function listContracts(req, res) {
  const rows = isHr(req.user)
    ? db.prepare(`SELECT c.*, a.status approval_status, a.approval_no FROM hr_contracts c
      LEFT JOIN approvals a ON a.id=c.approval_id ORDER BY c.id DESC`).all()
    : db.prepare(`SELECT c.*, a.status approval_status FROM hr_contracts c
      LEFT JOIN approvals a ON a.id=c.approval_id WHERE c.emp_id=? OR c.drafter_id=? ORDER BY c.id DESC`)
      .all(empId(req) || 0, empId(req) || 0);
  return res.json(ok(rows));
}
async function createContract(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('人事合同起草仅行政人事线/管理层可操作'));
  const { emp_id, contract_type, start_date, end_date, probation_months, salary_base, salary_other, workplace, content, title, dept_name } = req.body || {};
  if (!emp_id) return res.json(bad('员工必填'));
  if (contract_type && !CONTRACT_TYPES.includes(contract_type)) return res.json(bad(`合同类型须为：${CONTRACT_TYPES.join('/')}`));
  const emp = db.prepare("SELECT id,name,emp_no,title,org_id FROM employees WHERE id=? AND status<>'离职'").get(emp_id);
  if (!emp) return res.json(notfound('员工不存在或已离职'));
  if (!start_date || !end_date) return res.json(bad('合同起止日期必填'));
  if (String(end_date) <= String(start_date)) return res.json(bad('合同终止日期须晚于起始日期'));
  const org = emp.org_id ? db.prepare('SELECT name FROM org_units WHERE id=?').get(emp.org_id) : null;
  const no = genNo('HRL');
  const info = db.prepare(`INSERT INTO hr_contracts
    (hc_no,emp_id,emp_name,emp_no,dept_name,title,contract_type,start_date,end_date,probation_months,
     salary_base,salary_other,workplace,content,drafter_id,drafter_name,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'审批中')`)
    .run(no, emp.id, emp.name, emp.emp_no || '', dept_name || (org ? org.name : ''), title || emp.title || '',
      contract_type || '新签', start_date, end_date, Math.max(0, parseInt(probation_months, 10) || 0),
      Number(salary_base) || 0, salary_other || '', workplace || '', content || '',
      empId(req) || null, req.user.name || '');
  const ap = createApproval(req.user, '人事合同审批', `人事合同：${emp.name}（${contract_type || '新签'} ${start_date}~${end_date}）`, info.lastInsertRowid, salary_base);
  db.prepare('UPDATE hr_contracts SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('HR_CONTRACT_CREATE', req.userId, no, `${emp.name} ${contract_type || '新签'} 合同，已提交审批（${ap.approval_no}）`);
  return res.json(ok({ id: info.lastInsertRowid, hc_no: no, approval_id: ap.id, approval_no: ap.approval_no, status: '审批中' },
    '合同已提交审批'));
}
/** 人事合同审批（待审状态为「审批中」，终审通过 → 已通过） */
async function approveContract(req, res) {
  return doApprove(req, res, 'hr_contracts', () => ({ status: '已通过', msg: '合同审批通过' }), '审批中');
}
/** 归档（已通过 → 已归档） */
async function archiveContract(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('合同归档仅行政人事线可操作'));
  const c = db.prepare('SELECT * FROM hr_contracts WHERE id=?').get(req.params.id);
  if (!c) return res.json(notfound('合同不存在'));
  if (c.status !== '已通过') return res.json(bad('仅「已通过」的合同可归档', 409));
  db.prepare("UPDATE hr_contracts SET status='已归档', updated_at=? WHERE id=?").run(localNow(), c.id);
  audit('HR_CONTRACT_ARCHIVE', req.userId, c.hc_no, `${c.emp_name} 人事合同已归档`);
  return res.json(ok(null, '合同已归档'));
}

/* ==================== 6. 招聘三件套 ==================== */
async function listReqs(req, res) {
  const rows = isHr(req.user)
    ? db.prepare(`SELECT r.*, a.status approval_status, a.current_step, a.total_steps, a.approval_no,
        (SELECT COUNT(*) FROM recruit_candidates c WHERE c.req_id=r.id) cand_count
      FROM recruit_reqs r LEFT JOIN approvals a ON a.id=r.approval_id ORDER BY r.id DESC`).all()
    : db.prepare(`SELECT r.*, a.status approval_status, a.approval_no,
        (SELECT COUNT(*) FROM recruit_candidates c WHERE c.req_id=r.id) cand_count
      FROM recruit_reqs r LEFT JOIN approvals a ON a.id=r.approval_id WHERE r.created_by=? ORDER BY r.id DESC`)
      .all(empId(req) || 0);
  return res.json(ok(rows));
}
async function createReq(req, res) {
  const { title, dept_id, headcount, req_type, job_duty, requirement, salary_range, need_date } = req.body || {};
  if (!title) return res.json(bad('招聘岗位必填'));
  if (!dept_id) return res.json(bad('请选择用人部门（编制校验依据）'));
  const hc = Math.max(1, parseInt(headcount, 10) || 1);
  const org = db.prepare("SELECT name,headcount FROM org_units WHERE id=? AND status='启用'").get(dept_id);
  if (!org) return res.json(notfound('用人部门不存在'));
  // 编制校验（对齐参考项目）：在职 + 在途招聘需求 + 本次需求 ≤ 部门编制；编制未配置（0）则放行
  if (Number(org.headcount) > 0) {
    const incumb = db.prepare("SELECT COUNT(*) c FROM employees WHERE org_id=? AND status='在职'").get(dept_id).c;
    const inflight = db.prepare("SELECT COALESCE(SUM(headcount),0) s FROM recruit_reqs WHERE dept_id=? AND status IN ('待审批','招聘中')").get(dept_id).s;
    if (incumb + inflight + hc > Number(org.headcount)) {
      return res.json(bad(`编制校验未通过：${org.name} 编制 ${org.headcount} 人，在职 ${incumb} 人、在途招聘 ${inflight} 人，再招 ${hc} 人将超编。请缩减人数或与行政人事部沟通。`, 409));
    }
  }
  const no = genNo('RR');
  const info = db.prepare(`INSERT INTO recruit_reqs
    (req_no,title,dept_id,dept_name,headcount,req_type,job_duty,requirement,salary_range,need_date,created_by,created_by_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, title, dept_id, org.name, hc, req_type || '新增', job_duty || '', requirement || '',
      salary_range || '', need_date || '', empId(req) || null, req.user.name || '');
  const ap = createApproval(req.user, '招聘需求审批', `招聘需求：${title} ×${hc}（${org.name}）`, info.lastInsertRowid, 0);
  db.prepare('UPDATE recruit_reqs SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('HR_REQ_CREATE', req.userId, no, `${title} ×${hc}（${org.name}），已提交编制审批`);
  return res.json(ok({ id: info.lastInsertRowid, req_no: no, approval_id: ap.id, approval_no: ap.approval_no, status: '待审批' },
    '招聘需求已提交审批'));
}
async function approveReq(req, res) {
  return doApprove(req, res, 'recruit_reqs', () => ({ status: '招聘中', msg: '需求审批通过，进入招聘中' }));
}
async function closeReq(req, res) {
  const rq = db.prepare('SELECT * FROM recruit_reqs WHERE id=?').get(req.params.id);
  if (!rq) return res.json(notfound('招聘需求不存在'));
  if (!(isHr(req.user) || Number(rq.created_by) === empId(req))) return res.json(forbidden('仅行政人事部或需求发起人可关闭'));
  if (rq.status === '已关闭') return res.json(ok(null, '需求已关闭'));
  if (!['待审批', '招聘中'].includes(rq.status)) return res.json(bad('当前状态不可关闭', 409));
  db.prepare("UPDATE recruit_reqs SET status='已关闭' WHERE id=?").run(rq.id);
  if (rq.approval_id) {
    db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=? AND status='待审批'").run(localNow(), rq.approval_id);
  }
  audit('HR_REQ_CLOSE', req.userId, rq.req_no, `关闭招聘需求 ${rq.title}`);
  return res.json(ok(null, '招聘需求已关闭'));
}

async function listCandidates(req, res) {
  if (isHr(req.user)) {
    const p = [];
    let sql = `SELECT c.*, (SELECT title FROM recruit_reqs x WHERE x.id=c.req_id) req_title2 FROM recruit_candidates c WHERE 1=1`;
    if (req.query.req_id) { sql += ' AND c.req_id=?'; p.push(Number(req.query.req_id)); }
    if (req.query.stage) { sql += ' AND c.stage=?'; p.push(req.query.stage); }
    if (req.query.keyword) { sql += ' AND (c.name LIKE ? OR c.phone LIKE ?)'; p.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`); }
    return res.json(ok(db.prepare(sql + ' ORDER BY c.id DESC').all(...p)));
  }
  return res.json(ok(db.prepare(`SELECT c.*, (SELECT title FROM recruit_reqs x WHERE x.id=c.req_id) req_title2
    FROM recruit_candidates c WHERE c.operator_id=? ORDER BY c.id DESC`).all(empId(req) || 0)));
}
async function createCandidate(req, res) {
  const { req_id, name, gender, phone, email, source, resume_note } = req.body || {};
  if (!name) return res.json(bad('候选人姓名必填'));
  if (!req_id) return res.json(bad('需关联招聘需求'));
  const rq = db.prepare('SELECT * FROM recruit_reqs WHERE id=?').get(req_id);
  if (!rq) return res.json(notfound('招聘需求不存在'));
  if (!['待审批', '招聘中'].includes(rq.status)) return res.json(bad('该需求未在招聘中，无法录入候选人', 409));
  if (!(isHr(req.user) || Number(rq.created_by) === empId(req))) return res.json(forbidden('仅行政人事部或需求发起人可录入候选人'));
  const no = genNo('CAN');
  const info = db.prepare(`INSERT INTO recruit_candidates
    (cand_no,req_id,req_title,name,gender,phone,email,source,resume_note,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, rq.id, rq.title, name, gender || '', phone || '', email || '', source || '招聘网站', resume_note || '',
      empId(req) || null, req.user.name || '');
  audit('HR_CAND_CREATE', req.userId, no, `录入候选人 ${name} → ${rq.title}`);
  return res.json(ok({ id: info.lastInsertRowid, cand_no: no, stage: '初筛' }, '候选人已录入'));
}
async function updateCandidateStage(req, res) {
  const { stage, score, evaluation } = req.body || {};
  if (!RECRUIT_STAGES.includes(stage)) return res.json(bad(`阶段须为：${RECRUIT_STAGES.join('/')}`));
  const cd = db.prepare('SELECT * FROM recruit_candidates WHERE id=?').get(req.params.id);
  if (!cd) return res.json(notfound('候选人不存在'));
  if (!isHr(req.user)) {
    const rq = db.prepare('SELECT * FROM recruit_reqs WHERE id=?').get(cd.req_id);
    if (!(rq && Number(rq.created_by) === empId(req))) return res.json(forbidden('仅行政人事部或需求发起人可流转候选人'));
  }
  if (cd.stage === '已录用' || ['淘汰', '放弃'].includes(cd.stage)) return res.json(bad('候选人已到终态（已录用/淘汰/放弃），不可再流转', 409));
  if (stage === '已录用') return res.json(bad('录用请通过「发起录用（Offer）」审批自动流转，勿手工直改', 409));
  db.prepare('UPDATE recruit_candidates SET stage=?, score=COALESCE(?,score), evaluation=COALESCE(?,evaluation), updated_at=? WHERE id=?')
    .run(stage, (score === undefined || score === '' || score === null) ? null : Number(score),
      evaluation === undefined ? null : (evaluation || ''), localNow(), cd.id);
  audit('HR_CAND_STAGE', req.userId, cd.cand_no, `${cd.name} ${cd.stage} → ${stage}`);
  return res.json(ok({ stage }, `已流转至 ${stage}`));
}

async function listOffers(req, res) {
  const rows = isHr(req.user)
    ? db.prepare(`SELECT o.*, a.status approval_status, a.approval_no, o2.onb_no, o2.status onb_status,
        (SELECT title FROM recruit_reqs x WHERE x.id=o.req_id) req_title2
      FROM recruit_offers o LEFT JOIN approvals a ON a.id=o.approval_id
      LEFT JOIN employee_onboards o2 ON o2.id=o.onboard_id ORDER BY o.id DESC`).all()
    : db.prepare(`SELECT o.*, a.status approval_status, a.approval_no FROM recruit_offers o
      LEFT JOIN approvals a ON a.id=o.approval_id WHERE o.operator_id=? ORDER BY o.id DESC`)
      .all(empId(req) || 0);
  return res.json(ok(rows));
}
async function createOffer(req, res) {
  const { cand_id, title, role, dept_id, dept_name, region, hire_date, salary_base, probation_months, remark } = req.body || {};
  const cd = db.prepare('SELECT * FROM recruit_candidates WHERE id=?').get(cand_id);
  if (!cd) return res.json(notfound('候选人不存在'));
  if (!['复试', '待录用'].includes(cd.stage)) return res.json(bad('候选人须进入「复试/待录用」阶段方可发起录用', 409));
  if (!title || !role) return res.json(bad('录用岗位与角色必填'));
  if (!isHr(req.user)) return res.json(forbidden('录用定级定薪仅行政人事线/管理层可操作'));
  const salary = Number(salary_base) || 0;
  const no = genNo('OFF');
  const info = db.prepare(`INSERT INTO recruit_offers
    (offer_no,req_id,cand_id,cand_name,cand_phone,cand_gender,title,role,dept_id,dept_name,region,hire_date,salary_base,probation_months,remark,operator_id,operator_name)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(no, cd.req_id || null, cd.id, cd.name, cd.phone || '', cd.gender || '', title, role,
      dept_id || null, dept_name || '', region || '', hire_date || '', salary,
      Math.max(0, parseInt(probation_months, 10) || 3), remark || '',
      empId(req) || null, req.user.name || '');
  const ap = createApproval(req.user, '录用审批', `录用：${cd.name} 任 ${title}（${role}）`, info.lastInsertRowid, salary);
  db.prepare('UPDATE recruit_offers SET approval_id=?, applied_at=? WHERE id=?').run(ap.id, localNow(), info.lastInsertRowid);
  db.prepare("UPDATE recruit_candidates SET stage='待录用', updated_at=? WHERE id=? AND stage<>'已录用'").run(localNow(), cd.id);
  audit('HR_OFFER_CREATE', req.userId, no, `${cd.name} 任 ${title}，已提交录用审批（${ap.approval_no}）`);
  return res.json(ok({ id: info.lastInsertRowid, offer_no: no, approval_id: ap.id, approval_no: ap.approval_no, status: '待审批' },
    '录用已提交审批'));
}
/** 录用审批通过：候选人置「已录用」+ 自动建档入职登记单（待入职）（对齐参考项目） */
async function approveOffer(req, res) {
  return doApprove(req, res, 'recruit_offers', (row) => {
    db.prepare("UPDATE recruit_candidates SET stage='已录用', updated_at=? WHERE id=?").run(localNow(), row.cand_id);
    const org = row.dept_id ? db.prepare('SELECT name FROM org_units WHERE id=?').get(row.dept_id) : null;
    const onbNo = genNo('ONB');
    const info = db.prepare(`INSERT INTO employee_onboards
      (onb_no,name,gender,phone,title,role,org_id,dept_name,region,hire_date,salary,remark,operator_id,operator_name,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'待入职')`)
      .run(onbNo, row.cand_name, row.cand_gender || '', row.cand_phone || '', row.title, row.role,
        row.dept_id || null, org ? org.name : (row.dept_name || ''), row.region || '', row.hire_date || today(),
        Number(row.salary_base) || 0, `录用审批 ${row.offer_no} 自动建档`,
        empId(req) || null, req.user.name || '');
    db.prepare('UPDATE recruit_offers SET onboard_id=? WHERE id=?').run(info.lastInsertRowid, row.id);
    return { status: '已通过', msg: '录用审批通过，已自动建档待入职，请办理入职' };
  });
}

/* ==================== 7. 员工权限（emp_permissions） ==================== */
async function listPermissions(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('公司员工权限设置由行政人事部负责人执行和调整'));
  const empId = Number(req.query.emp_id) || 0;
  if (!empId) {
    return res.json(ok(db.prepare(`SELECT p.*, e.name emp_name, e.emp_no
      FROM emp_permissions p LEFT JOIN employees e ON e.id=p.emp_id ORDER BY p.emp_id, p.module`).all()));
  }
  const emp = db.prepare('SELECT id,emp_no,name,role,title,status FROM employees WHERE id=?').get(empId);
  if (!emp) return res.json(notfound('员工不存在'));
  return res.json(ok({
    emp,
    rows: db.prepare('SELECT * FROM emp_permissions WHERE emp_id=? ORDER BY module').all(empId),
    modules: PERM_MODULES,
  }));
}
/** 设置/覆盖员工-模块权限（对齐参考项目：一次仅可变更一个字段，与生效值一致则 409） */
async function setPermission(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('公司员工权限设置由行政人事部负责人执行和调整'));
  const empId = Number(req.params.emp_id);
  const module = req.params.module;
  if (!PERM_MODULES.includes(module)) return res.json(bad('模块不存在'));
  const emp = db.prepare('SELECT id,emp_no,name,role FROM employees WHERE id=?').get(empId);
  if (!emp) return res.json(notfound('员工不存在'));
  const b = req.body || {};
  const changed = ['can_view', 'can_edit', 'can_approve'].filter((f) => b[f] !== undefined);
  if (changed.length !== 1) return res.json(bad('一次仅可变更一个权限字段（can_view/can_edit/can_approve）'));
  const field = changed[0];
  const value = b[field] ? 1 : 0;
  const cur = db.prepare('SELECT * FROM emp_permissions WHERE emp_id=? AND module=?').get(empId, module);
  if (cur && Number(cur[field]) === value) return res.json(bad('与当前生效值一致，无需变更', 409));
  if (cur) {
    db.prepare(`UPDATE emp_permissions SET ${field}=?, updated_by=?, updated_at=? WHERE emp_id=? AND module=?`)
      .run(value, req.user.name || '', localNow(), empId, module);
  } else {
    db.prepare(`INSERT INTO emp_permissions (emp_id,module,can_view,can_edit,can_approve,updated_by)
      VALUES (?,?,?,?,?,?)`)
      .run(empId, module, field === 'can_view' ? value : 1, field === 'can_edit' ? value : 0,
        field === 'can_approve' ? value : 0, req.user.name || '');
  }
  audit('HR_PERM_SET', req.userId, `员工#${empId}`, `${emp.name} ${module} ${field} → ${value ? '允许' : '禁止'}`);
  return res.json(ok(null, '员工权限已更新'));
}
/** 清除员工-模块覆盖，恢复角色默认 */
async function clearPermission(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('公司员工权限设置由行政人事部负责人执行和调整'));
  const empId = Number(req.params.emp_id);
  const module = req.params.module;
  const cur = db.prepare('SELECT * FROM emp_permissions WHERE emp_id=? AND module=?').get(empId, module);
  if (!cur) return res.json(bad('该员工当前无此模块权限覆盖，无需恢复', 409));
  db.prepare('DELETE FROM emp_permissions WHERE emp_id=? AND module=?').run(empId, module);
  audit('HR_PERM_CLEAR', req.userId, `员工#${empId}`, `${module} 权限覆盖已恢复角色默认`);
  return res.json(ok(null, '已恢复角色默认权限'));
}

module.exports = {
  meta, orgs, staff, dashboard,
  listOnboards, createOnboard, approveOnboard, activateOnboard,
  listEvaluations, createEvaluation, approveEvaluation,
  listTransfers, createTransfer, approveTransfer,
  listResignations, createResignation, approveResignation, updateHandover, finishResignation,
  listContracts, createContract, approveContract, archiveContract,
  listReqs, createReq, approveReq, closeReq,
  listCandidates, createCandidate, updateCandidateStage,
  listOffers, createOffer, approveOffer,
  listPermissions, setPermission, clearPermission,
  EVAL_TYPES, TF_TYPES, RS_TYPES, RECRUIT_STAGES, CONTRACT_TYPES, REQ_TYPES, PERM_MODULES, isHr,
};
