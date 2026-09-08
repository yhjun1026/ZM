/**
 * 组织变更审批控制器（迁移自参考项目 routes/orgchange.js，#109 第20轮）
 *
 * 对齐参考项目业务逻辑：
 *  - 组织架构调整 / 部门设置 / 人员调整 / 权限设置 一律「先审批、后生效」：
 *    提交申请（含 payload JSON）→ 副总审批 → 总经理终审 → 通过后由 applyOrgChange 写回组织数据；
 *    驳回不生效（原数据保持不变）。
 *  - 变更类型（对齐参考项目 CHANGE_TYPES，中文语义与前端一致）：
 *    单位新增/单位调整/单位停用、部门新增/部门合并/部门调整/部门撤销、人员调整/人员停用、
 *    权限调整/权限恢复、区域负责人任命
 *  - 校验：新增须名称+编码且编码唯一；停用部门前须完成人员分流；员工停用不可对总经理；
 *    区域负责人须为销售序列员工；权限调整一次仅一个字段且与生效值一致则 409。
 *  - 变更台账：发起人/类型/状态/审批进度/生效时间与生效人全留痕。
 *
 * 与参考项目的差异（受当前项目角色/审批体系约束）：
 *  1) 参考项目仅行政人事部负责人（ADM）可发起，当前项目按 users.role + users.dept 判定行政人事线与公司领导（isHr）。
 *  2) 参考项目由 approvals.js 审批联动器回调 applyOrgChange，当前项目无统一联动器，
 *     故提供 POST /:id/approve 逐级审批：第 1 级副总、第 2 级（终审）总经理，终审通过时执行完全一致的写回逻辑。
 *  3) 参考项目 CHANGE_TYPES 为英文码，当前项目对外用中文语义类型（CHANGE_TYPES 映射见下），
 *     payload 字段名与参考项目保持一致。
 *
 * 数据表：org_changes / org_units / employees / emp_permissions / sales_regions / approvals / approval_steps
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/** 变更类型（中文）→ 默认标题 */
const CHANGE_TYPES = {
  单位新增: '新增单位',
  单位调整: '单位信息调整',
  单位停用: '单位停用',
  部门新增: '新增部门',
  部门合并: '部门合并',
  部门调整: '部门信息调整',
  部门撤销: '部门撤销',
  人员调整: '员工信息调整',
  人员停用: '员工停用',
  权限调整: '员工权限变更',
  权限恢复: '员工权限恢复',
  区域负责人任命: '区域负责人任命',
};
const STATUS = ['待审批', '已通过', '已驳回'];
/** 权限字段中文标签 */
const FIELD_LABEL = { can_view: '查看', can_edit: '编辑', can_approve: '审批' };

const HR_DEPTS = ['行政人事部', '人事行政部', '行政部', '人力资源部'];
const GM_ROLES = ['总经理', '超级管理员'];
const VP_ROLES = ['副总', '总经理', '超级管理员'];
const isHr = (u) => !!u && (GM_ROLES.includes(u.role) || VP_ROLES.includes(u.role) || HR_DEPTS.includes(u.dept) || u.role === '超级管理员');
const isVP = (u) => !!u && VP_ROLES.includes(u.role);
const isGM = (u) => !!u && GM_ROLES.includes(u.role);

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const genNo = () => 'OC' + localNow().replace(/[-: ]/g, '').slice(0, 14) + Math.floor(Math.random() * 900 + 100);
const fieldLabel = (f) => FIELD_LABEL[f] || f;

/** 创建两级审批单：副总 → 总经理 */
function createApproval(user, title, refId) {
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  // 单号带 3 位随机后缀（对齐参考项目 lib.createApproval），避免删行后序号回退导致撞号
  const approvalNo = 'AP' + new Date().toISOString().slice(0, 10).replace(/-/g, '')
    + String(n).padStart(4, '0') + Math.floor(Math.random() * 900 + 100);
  const chain = ['副总', '总经理'];
  const info = db.prepare(`INSERT INTO approvals
    (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, '组织变更审批', title, refId || 0, 0,
      Number(user.id) || 0, user.name || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/* ==================== 变更内容校验 + 摘要生成（对齐参考项目 validatePayload） ==================== */
function validatePayload(change_type, p) {
  if (!p || typeof p !== 'object') return '变更内容不能为空';
  switch (change_type) {
    case '单位新增':
    case '部门新增': {
      if (!p.name || !String(p.name).trim()) return '名称必填';
      if (!p.code || !String(p.code).trim()) return '编码必填';
      if (db.prepare('SELECT id FROM org_units WHERE code=?').get(String(p.code).trim())) return `编码 ${p.code} 已存在`;
      return {
        name: String(p.name).trim(), code: String(p.code).trim(),
        type: change_type === '部门新增' ? 'DEPT' : (p.type || 'DEPT'),
        func: p.func || '', headcount: Number(p.headcount) || 0,
      };
    }
    case '单位调整':
    case '部门调整': {
      const u = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.unit_id);
      if (!u) return '单位/部门不存在';
      if (p.manager_emp_id) {
        const m = db.prepare("SELECT id FROM employees WHERE id=? AND status='在职'").get(p.manager_emp_id);
        if (!m) return '负责人不存在或已停用';
      }
      return { unit: u.name, name: p.name || u.name, func: p.func, headcount: p.headcount, manager_emp_id: p.manager_emp_id, region: p.region };
    }
    case '部门合并': {
      const src = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.src_unit_id);
      const dst = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.dst_unit_id);
      if (!src || !dst) return '源部门/目标部门不存在';
      if (src.id === dst.id) return '源部门与目标部门不能相同';
      return { src: src.name, dst: dst.name, reason: p.reason || '', move_emp: p.move_emp === undefined ? 1 : Number(p.move_emp) };
    }
    case '单位停用':
    case '部门撤销': {
      const u = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.unit_id);
      if (!u) return '单位/部门不存在';
      if (u.status === '停用') return `${u.name} 已处于停用状态`;
      const n = db.prepare("SELECT COUNT(*) c FROM employees WHERE org_id=? AND status IN ('在职','待开通')").get(u.id).c;
      if (n > 0) return `${u.name} 仍有 ${n} 名在职员工，请先通过「人员调整」完成分流后再撤销`;
      return { unit: u.name, reason: p.reason || '' };
    }
    case '人员调整': {
      const e = db.prepare('SELECT * FROM employees WHERE id=?').get(p.emp_id);
      if (!e) return '员工不存在';
      const changed = [];
      if (p.title) changed.push(`职位→${p.title}`);
      if (p.role) changed.push(`角色→${p.role}`);
      if (p.org_id) {
        const o = db.prepare('SELECT name FROM org_units WHERE id=?').get(p.org_id);
        if (!o) return '目标部门不存在';
        changed.push(`部门→${o.name}`);
      }
      if (p.region) changed.push(`区域→${p.region}`);
      if (p.product_line) changed.push(`产品线→${p.product_line}`);
      if (p.report1_id) {
        const m = db.prepare('SELECT name FROM employees WHERE id=?').get(p.report1_id);
        if (!m) return '直属上级不存在';
        changed.push(`直属上级→${m.name}`);
      }
      if (!changed.length) return '请至少填写一项调整内容';
      return { emp: `${e.name}(${e.emp_no})`, changes: changed.join('；') };
    }
    case '人员停用': {
      const e = db.prepare('SELECT id,name,emp_no,role FROM employees WHERE id=?').get(p.emp_id);
      if (!e) return '员工不存在';
      if (e.role === '总经理') return '总经理账号不可停用';
      if (e.status !== '在职') return '仅在职员工可停用';
      return { emp: `${e.name}(${e.emp_no})`, reason: p.reason || '' };
    }
    case '权限调整': {
      const e = db.prepare('SELECT id,name,emp_no FROM employees WHERE id=?').get(p.emp_id);
      if (!e) return '员工不存在';
      if (!p.module) return '模块必填';
      if (!['can_view', 'can_edit', 'can_approve'].includes(p.field)) return '权限字段非法';
      return { emp: `${e.name}(${e.emp_no})`, mod_name: p.module, field: fieldLabel(p.field), value: p.value ? '允许' : '禁止' };
    }
    case '权限恢复': {
      const e = db.prepare('SELECT id,name,emp_no FROM employees WHERE id=?').get(p.emp_id);
      if (!e) return '员工不存在';
      if (!p.module) return '模块必填';
      if (!db.prepare('SELECT 1 FROM emp_permissions WHERE emp_id=? AND module=?').get(e.id, p.module))
        return `${e.name} 当前无「${p.module}」权限覆盖，无需恢复`;
      return { emp: `${e.name}(${e.emp_no})`, scope: `${p.module} 模块` };
    }
    case '区域负责人任命': {
      const reg = db.prepare('SELECT * FROM sales_regions WHERE id=?').get(p.region_id);
      if (!reg) return '区域不存在';
      const e = db.prepare("SELECT id,name,emp_no,role FROM employees WHERE id=? AND status='在职'").get(p.emp_id);
      if (!e) return '员工不存在或已停用';
      if (!['销售总监', '区域经理', '销售员', '销售专员'].includes(e.role)) return '区域负责人须为销售序列员工（销售总监/区域经理/销售员）';
      return { region: reg.name, emp: `${e.name}(${e.emp_no})` };
    }
    default: return '变更类型非法';
  }
}

function defaultTitle(type, chk) {
  const base = CHANGE_TYPES[type] || '组织变更';
  if (type === '权限调整') return `${base}：${chk.emp} - ${chk.mod_name}·${chk.field} → ${chk.value}`;
  if (type === '权限恢复') return `${base}：${chk.emp}（${chk.scope}）`;
  if (type === '部门新增' || type === '单位新增') return `${base}：${chk.name}（${chk.code}）`;
  if (type === '部门合并') return `${base}：${chk.src} → ${chk.dst}`;
  if (['单位调整', '部门调整', '单位停用', '部门撤销'].includes(type)) return `${base}：${chk.unit}`;
  if (type === '人员调整' || type === '人员停用') return `${base}：${chk.emp}`;
  if (type === '区域负责人任命') return `${base}：${chk.region} → ${chk.emp}`;
  return base;
}
function summarize(type, chk) {
  if (type === '权限调整') return `员工权限调整：${chk.emp} 的 ${chk.mod_name} · ${chk.field}权限 → ${chk.value}`;
  if (type === '权限恢复') return `员工权限恢复：${chk.emp}（${chk.scope}）恢复角色默认`;
  if (type === '部门新增' || type === '单位新增') return `新增${type === '部门新增' ? '部门' : '单位'}：${chk.name}（编码 ${chk.code}）${chk.func ? '，职责：' + chk.func : ''}，编制 ${chk.headcount} 人`;
  if (type === '单位调整' || type === '部门调整') return `${type === '部门调整' ? '部门' : '单位'}信息调整：${chk.unit}（名称/职责/编制/负责人/区域）`;
  if (type === '部门合并') return `部门合并：${chk.src} 并入 ${chk.dst}${chk.move_emp ? '，在职人员同步迁移' : ''}${chk.reason ? '，原因：' + chk.reason : ''}`;
  if (type === '单位停用' || type === '部门撤销') return `${type === '部门撤销' ? '部门撤销' : '单位停用'}：${chk.unit}${chk.reason ? '，原因：' + chk.reason : ''}`;
  if (type === '人员调整') return `员工调整：${chk.emp} — ${chk.changes}`;
  if (type === '人员停用') return `员工停用：${chk.emp}${chk.reason ? '，原因：' + chk.reason : ''}`;
  if (type === '区域负责人任命') return `区域负责人任命：${chk.region} → ${chk.emp}`;
  return '';
}

/* ==================== 审批通过后执行变更（对齐参考项目 applyOrgChange） ==================== */
function applyOrgChange(change, req) {
  const p = JSON.parse(change.payload || '{}');
  const user = (req && req.user) || {};
  switch (change.change_type) {
    case '单位新增':
    case '部门新增': {
      const info = db.prepare(`INSERT INTO org_units(code,name,type,parent_id,region,manager_emp_id,func,headcount,status)
        VALUES(?,?,?,?,?,?,?,?,'启用')`)
        .run(p.code, p.name, change.change_type === '部门新增' ? 'DEPT' : (p.type || 'DEPT'),
          p.parent_id || null, p.region || null, p.manager_emp_id || null, p.func || '', Number(p.headcount) || 0);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `新增 ${p.name}（${p.code}）生效`);
      return { ok: true, id: info.lastInsertRowid };
    }
    case '单位调整':
    case '部门调整': {
      const u = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.unit_id);
      if (!u) return { ok: false, error: '单位/部门不存在' };
      db.prepare('UPDATE org_units SET name=?, func=?, headcount=?, manager_emp_id=?, region=? WHERE id=?')
        .run(p.name || u.name, p.func !== undefined ? p.func : u.func,
          p.headcount !== undefined ? (Number(p.headcount) || 0) : u.headcount,
          p.manager_emp_id !== undefined ? p.manager_emp_id : u.manager_emp_id,
          p.region !== undefined ? p.region : u.region, u.id);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `${u.name} 信息调整生效`);
      return { ok: true };
    }
    case '部门合并': {
      const src = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.src_unit_id);
      const dst = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.dst_unit_id);
      if (!src || !dst) return { ok: false, error: '源/目标部门不存在' };
      if (p.move_emp !== 0) {
        db.prepare('UPDATE employees SET org_id=? WHERE org_id=?').run(dst.id, src.id);
      }
      db.prepare("UPDATE org_units SET status='停用' WHERE id=?").run(src.id);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `${src.name} 并入 ${dst.name} 生效（源部门已停用）`);
      return { ok: true };
    }
    case '单位停用':
    case '部门撤销': {
      const u = db.prepare('SELECT * FROM org_units WHERE id=?').get(p.unit_id);
      if (!u) return { ok: false, error: '单位/部门不存在' };
      db.prepare("UPDATE org_units SET status='停用' WHERE id=?").run(u.id);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `${u.name} 已停用`);
      return { ok: true };
    }
    case '人员调整': {
      const e = db.prepare('SELECT * FROM employees WHERE id=?').get(p.emp_id);
      if (!e) return { ok: false, error: '员工不存在' };
      db.prepare('UPDATE employees SET title=?, role=?, org_id=?, region=?, product_line=?, report1_id=? WHERE id=?')
        .run(p.title !== undefined ? p.title : e.title, p.role !== undefined ? p.role : e.role,
          p.org_id !== undefined ? p.org_id : e.org_id, p.region !== undefined ? p.region : e.region,
          p.product_line !== undefined ? p.product_line : e.product_line,
          p.report1_id !== undefined ? p.report1_id : e.report1_id, e.id);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `${e.name} 人员调整生效`);
      return { ok: true };
    }
    case '人员停用': {
      const e = db.prepare('SELECT * FROM employees WHERE id=?').get(p.emp_id);
      if (!e) return { ok: false, error: '员工不存在' };
      if (e.role === '总经理') return { ok: false, error: '总经理账号不可停用' };
      db.prepare("UPDATE employees SET status='已停用' WHERE id=?").run(e.id);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `${e.name} 已停用`);
      return { ok: true };
    }
    case '权限调整': {
      const v = p.value ? 1 : 0;
      const cur = db.prepare('SELECT can_view,can_edit,can_approve FROM emp_permissions WHERE emp_id=? AND module=?').get(p.emp_id, p.module);
      if (!cur) {
        db.prepare('INSERT INTO emp_permissions(emp_id,module,can_view,can_edit,can_approve,updated_by) VALUES(?,?,?,?,?,?)')
          .run(p.emp_id, p.module, p.field === 'can_view' ? v : 1, p.field === 'can_edit' ? v : 0,
            p.field === 'can_approve' ? v : 0, user.name || change.operator_name);
      } else {
        db.prepare(`UPDATE emp_permissions SET ${p.field}=?, updated_by=? WHERE emp_id=? AND module=?`)
          .run(v, user.name || change.operator_name, p.emp_id, p.module);
      }
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `员工#${p.emp_id} ${p.module} ${p.field} → ${v ? '允许' : '禁止'}`);
      return { ok: true };
    }
    case '权限恢复': {
      db.prepare('DELETE FROM emp_permissions WHERE emp_id=? AND module=?').run(p.emp_id, p.module);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `员工#${p.emp_id} ${p.module} 恢复角色默认`);
      return { ok: true };
    }
    case '区域负责人任命': {
      const reg = db.prepare('SELECT * FROM sales_regions WHERE id=?').get(p.region_id);
      const emp = db.prepare("SELECT id,name FROM employees WHERE id=? AND status='在职'").get(p.emp_id);
      if (!reg || !emp) return { ok: false, error: '区域或员工不存在' };
      db.prepare('UPDATE sales_regions SET manager_emp_id=?, manager_name=? WHERE id=?').run(emp.id, emp.name, reg.id);
      db.prepare('UPDATE employees SET region=? WHERE id=?').run(reg.name, emp.id);
      audit('ORGCHANGE_APPLY', user.id, `变更${change.change_no}`, `区域[${reg.name}] 任命 ${emp.name}`);
      return { ok: true };
    }
    default: return { ok: false, error: '未知变更类型' };
  }
}

/* ==================== 接口 ==================== */
async function meta(req, res) {
  return res.json(ok({
    change_types: Object.keys(CHANGE_TYPES),
    statuses: STATUS,
    unit_types: ['HQ', 'PRODUCT', 'BRANCH', 'DEPT'],
    perm_fields: Object.keys(FIELD_LABEL),
    can_submit: isHr(req.user),
    can_approve: isVP(req.user),
  }));
}

async function stats(req, res) {
  const byStatus = db.prepare('SELECT status, COUNT(*) n FROM org_changes GROUP BY status').all();
  const byType = db.prepare('SELECT change_type, COUNT(*) n FROM org_changes GROUP BY change_type ORDER BY n DESC').all();
  const pending = db.prepare("SELECT COUNT(*) n FROM org_changes WHERE status='待审批'").get().n;
  const applied = db.prepare("SELECT COUNT(*) n FROM org_changes WHERE status='已通过'").get().n;
  const rejected = db.prepare("SELECT COUNT(*) n FROM org_changes WHERE status='已驳回'").get().n;
  return res.json(ok({ pending, applied, rejected, byStatus, byType }));
}

/** 提交前预览（校验 + 生成标题/摘要，不落库） */
async function preview(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('组织架构调整、部门设置及人员调整由行政人事部负责人执行和发起，须报副总、总经理审批通过后生效'));
  const { change_type, payload } = req.body || {};
  if (!CHANGE_TYPES[change_type]) return res.json(bad(`变更类型须为：${Object.keys(CHANGE_TYPES).join('/')}`));
  const checked = validatePayload(change_type, payload);
  if (typeof checked === 'string') return res.json(bad(checked));
  return res.json(ok({ change_type, title: defaultTitle(change_type, checked), summary: summarize(change_type, checked) }));
}

/** 提交组织变更申请 */
async function create(req, res) {
  if (!isHr(req.user)) return res.json(forbidden('组织架构调整、部门设置及人员调整由行政人事部负责人执行和发起，须报副总、总经理审批通过后生效'));
  const { change_type, payload, title } = req.body || {};
  if (!CHANGE_TYPES[change_type]) return res.json(bad(`变更类型须为：${Object.keys(CHANGE_TYPES).join('/')}`));
  const checked = validatePayload(change_type, payload);
  if (typeof checked === 'string') return res.json(bad(checked));
  const no = genNo();
  const t = title || defaultTitle(change_type, checked);
  const s = summarize(change_type, checked);
  const info = db.prepare(`INSERT INTO org_changes(change_no,change_type,title,summary,payload,status,operator_id,operator_name)
    VALUES(?,?,?,?,?,'待审批',?,?)`)
    .run(no, change_type, t, s, JSON.stringify(payload || {}),
      empId(req) || null, req.user.name || '');
  const ap = createApproval(req.user, t, info.lastInsertRowid);
  db.prepare('UPDATE org_changes SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
  audit('ORGCHANGE_SUBMIT', req.userId, no, `${t}（${change_type}），已报副总→总经理审批，审批单 ${ap.approval_no}`);
  return res.json(ok({
    id: info.lastInsertRowid, change_no: no, approval_id: ap.id, approval_no: ap.approval_no,
    status: '待审批', title: t, summary: s,
  }, '已提交组织变更申请，副总→总经理审批通过后生效'));
}

/** 变更台账 */
async function list(req, res) {
  const q = req.query;
  let sql = `SELECT c.*, a.status approval_status, a.current_step, a.total_steps, a.approval_no,
      (SELECT s.step_name FROM approval_steps s WHERE s.approval_id=a.id AND s.seq=a.current_step) step_name
    FROM org_changes c LEFT JOIN approvals a ON a.id=c.approval_id WHERE 1=1`;
  const p = [];
  if (!isHr(req.user)) { sql += ' AND c.operator_id=?'; p.push(empId(req) || 0); }
  if (q.status) { sql += ' AND c.status=?'; p.push(q.status); }
  if (q.change_type) { sql += ' AND c.change_type=?'; p.push(q.change_type); }
  if (q.keyword) { sql += ' AND (c.title LIKE ? OR c.change_no LIKE ?)'; p.push(`%${q.keyword}%`, `%${q.keyword}%`); }
  sql += ' ORDER BY c.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function detail(req, res) {
  const c = db.prepare('SELECT * FROM org_changes WHERE id=?').get(req.params.id);
  if (!c) return res.json(notfound('变更申请不存在'));
  if (!(isHr(req.user) || Number(c.operator_id) === empId(req))) {
    return res.json(forbidden('无权查看该变更申请'));
  }
  const steps = c.approval_id
    ? db.prepare('SELECT * FROM approval_steps WHERE approval_id=? ORDER BY seq').all(c.approval_id)
    : [];
  return res.json(ok({ ...c, payload_obj: (() => { try { return JSON.parse(c.payload || '{}'); } catch (e) { return {}; } })(), steps }));
}

/** 两级审批：第 1 级副总 → 第 2 级总经理终审；终审通过执行 applyOrgChange */
async function approve(req, res) {
  const c = db.prepare('SELECT * FROM org_changes WHERE id=?').get(req.params.id);
  if (!c) return res.json(notfound('变更申请不存在'));
  if (c.status !== '待审批') return res.json(bad(`当前状态「${c.status}」无需审批`, 409));
  const { result, comment } = req.body || {};
  if (!['通过', '驳回'].includes(result)) return res.json(bad('审批结果须为 通过 / 驳回'));

  const ap = c.approval_id ? db.prepare('SELECT * FROM approvals WHERE id=?').get(c.approval_id) : null;
  const step = ap ? Number(ap.current_step) || 1 : 1;
  const total = ap ? Number(ap.total_steps) || 2 : 2;
  if (step === 1 && !isVP(req.user)) return res.json(forbidden('第 1 级由副总审批'));
  if (step >= 2 && !isGM(req.user)) return res.json(forbidden('第 2 级（终审）由总经理审批'));

  if (result === '驳回') {
    db.prepare("UPDATE org_changes SET status='已驳回', reject_reason=?, applied_at=? WHERE id=?")
      .run(comment || '', localNow(), c.id);
    if (ap) {
      db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(localNow(), ap.id);
      db.prepare("UPDATE approval_steps SET action='驳回', approver_name=?, comment=?, acted_at=? WHERE approval_id=? AND seq=?")
        .run(req.user.name || '', comment || '', localNow(), ap.id, step);
    }
    audit('ORGCHANGE_REJECT', req.userId, c.change_no, `${c.title} 驳回：${comment || ''}`);
    return res.json(ok(null, '已驳回，变更不生效'));
  }

  if (ap && step < total) {
    db.prepare('UPDATE approvals SET current_step=? WHERE id=?').run(step + 1, ap.id);
    db.prepare("UPDATE approval_steps SET action='通过', approver_name=?, comment=?, acted_at=? WHERE approval_id=? AND seq=?")
      .run(req.user.name || '', comment || '', localNow(), ap.id, step);
    audit('ORGCHANGE_APPROVE_STEP', req.userId, c.change_no, `${c.title} 第 ${step} 级（副总）通过，流转总经理终审`);
    return res.json(ok({ step: step + 1, total }, '副总审批通过，已流转总经理终审'));
  }

  const r = applyOrgChange(c, req);
  if (!r.ok) return res.json(bad(`变更执行失败：${r.error}`));
  db.prepare("UPDATE org_changes SET status='已通过', applied_at=?, applied_by=? WHERE id=?")
    .run(localNow(), req.user.name || '', c.id);
  if (ap) {
    db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(localNow(), ap.id);
    db.prepare("UPDATE approval_steps SET action='通过', approver_name=?, comment=?, acted_at=? WHERE approval_id=? AND seq=?")
      .run(req.user.name || '', comment || '', localNow(), ap.id, step);
  }
  audit('ORGCHANGE_APPROVE', req.userId, c.change_no, `${c.title} 总经理终审通过，变更已生效`);
  return res.json(ok({ applied: true }, '总经理终审通过，组织变更已生效'));
}

module.exports = { meta, stats, preview, create, list, detail, approve, CHANGE_TYPES, applyOrgChange };
