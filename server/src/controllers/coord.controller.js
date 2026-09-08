/**
 * 业务协调中心控制器（迁移自参考项目 routes/coord.js，第70轮任务2）
 * 对齐参考项目业务逻辑：
 *  - ① 断点检测（只读体检）：扫描主业务链路上的「断链点」，每条规则给 severity / 是否可一键处理 / 制度依据提示
 *  - ② 一键联动（写操作）：对可自动衔接的断点补链，全程写 coord_actions 留痕并推送站内信
 *  - ③ 自动跑批：对可幂等补链的规则批量执行，同规则 + 同源单据不重复生成
 *  - 幂等：以 (rule, src_no) 判重，已成功联动过的不再重复；可追溯：coord_actions + 审计留痕
 * 数据表：coord_actions + 跨模块（bids / opportunities / contracts / ar_ledgers / approvals /
 *        employees / cardfix_reqs / overtime_reqs）（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目表结构约束）：
 *  1) 参考项目 bids 有 project_name/tenderee/deadline/owner_id，当前项目 009 的 bids 只有
 *     bid_no/opp_id/amount/bid_date/result/remark，故项目名与客户从关联商机/客户推导，
 *     「投标已过截止未回填结果」以 bid_date 超 30 天仍为「待开标」判定；
 *  2) 参考项目 contracts 有 bid_id/acceptance_status，当前项目 contracts 以 TEXT 主键 +
 *     name/customer/status 呈现，故「中标未签合同」按“是否已有同名合同 + coord_actions 留痕”判重，
 *     「合同已签未回款」按 status 属于执行类且无对应应收台账判定；
 *  3) 企业微信推送在参考项目为静默降级，当前项目未接企微，故只落站内信（message 模块 pushMessage）。
 */
const db = require('../db');
const { ok, bad, notfound, forbidden } = require('../utils/resp');
const audit = require('../utils/audit');

/** 管理层（可查看协调中心） */
const MGMT = ['总经理', '副总', '超级管理员', '销售总监'];
/** 可执行一键联动的角色（管理层 + 商务/财务条线） */
const OPERABLE = ['总经理', '副总', '超级管理员', '销售总监', '区域经理', '部门经理'];

const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const todayStr = () => localNow().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const dayDiff = (d) => {
  if (!d) return null;
  const t = new Date(String(d).replace(/-/g, '/')).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
};

/* ==================== 留痕与通知 ==================== */
function logAction(rule, ruleName, srcModule, dstModule, srcNo, dstNo, result, auto, user) {
  try {
    db.prepare(`INSERT INTO coord_actions(rule,rule_name,src_module,dst_module,src_no,dst_no,result,auto,operator_id,operator_name,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(rule, ruleName, srcModule, dstModule, srcNo || '', dstNo || '', result, auto ? 1 : 0,
        user ? Number(String(user.id).replace(/\D/g, '')) || null : null,
        user ? user.name : '系统自动', localNow());
  } catch (e) { console.error('[协调中心] 留痕失败:', e.message); }
}

/** 某规则已处理过的 src_no → result（幂等判重） */
function actedMap(rule) {
  try {
    const m = {};
    db.prepare('SELECT src_no,result FROM coord_actions WHERE rule=?').all(rule).forEach((x) => { m[x.src_no] = x.result; });
    return m;
  } catch (e) { return {}; }
}

/** 站内信推送（经 message 模块，失败静默降级） */
function notifyEmp(empId, title, content, bizType, bizId, user) {
  try {
    const { pushMessage } = require('../controllers/message.controller');
    pushMessage({
      msg_type: '系统', title, content,
      biz_type: bizType || '业务协调', biz_id: bizId || null,
      to_emp_id: Number(empId),
      from_emp_id: user ? Number(String(user.id).replace(/\D/g, '')) || null : null,
      from_name: user ? user.name : '系统自动',
    });
  } catch (e) { /* 消息模块异常不影响业务联动 */ }
}

function empByRole(role) {
  return db.prepare("SELECT id,emp_no,name FROM employees WHERE role=? AND status='在职' ORDER BY id LIMIT 1").get(role) || null;
}

/** 商机 → 客户名 */
function custNameOfOpp(oppId) {
  if (!oppId) return '';
  const row = db.prepare(`SELECT c.name FROM opportunities o LEFT JOIN customers c ON CAST(o.customer_id AS TEXT)=c.id
    WHERE o.id=?`).get(oppId);
  return row ? (row.name || '') : '';
}

/* ==================== 断点检测规则 ==================== */
const RULES = [
  {
    code: 'bid_win_no_contract', name: '已中标但未生成合同', from: '招投标管理', to: '合同管理',
    severity: '高', fix: true, fixApi: '/api/coord/link/bid-win',
    hint: '依据《政府采购法》第46条：采购人与中标人应自中标通知书发出之日起30日内订立合同，逾期存在被投诉与废标风险。',
    scan() {
      const acted = actedMap('bid_win_no_contract');
      return db.prepare("SELECT * FROM bids WHERE result='已中标' ORDER BY id DESC").all()
        .map((b) => {
          const opp = b.opp_id ? db.prepare('SELECT * FROM opportunities WHERE id=?').get(b.opp_id) : null;
          const projName = opp ? opp.name : b.bid_no;
          return { b, opp, projName };
        })
        .filter((x) => {
          if (acted[x.b.bid_no]) return false;
          // 已有同名（项目名）合同视为已签
          const has = db.prepare('SELECT id FROM contracts WHERE name LIKE ?').get(`%${x.projName}%`);
          return !has;
        })
        .map((x) => ({
          no: x.b.bid_no, id: x.b.id, title: x.projName,
          owner: x.opp ? '' : '',
          amount: x.b.amount,
          extra: `投标号 ${x.b.bid_no}｜客户：${custNameOfOpp(x.b.opp_id) || '-'}｜中标金额：${x.b.amount || '-'} 万元`,
          days: dayDiff(x.b.bid_date),
        }));
    },
  },
  {
    code: 'contract_no_ar', name: '合同已签但未建应收/回款', from: '合同管理', to: '回款管理',
    severity: '高', fix: true, fixApi: '/api/coord/link/contract-ar',
    hint: '合同生效后应立即建立应收台账并约定回款到期日，否则回款无人跟踪、账龄失真。',
    scan() {
      const acted = actedMap('contract_no_ar');
      const signs = ['执行中', '已签署', '履行中', '已验收', '已完成'];
      return db.prepare('SELECT * FROM contracts').all()
        .filter((c) => signs.includes(c.status) || c.sign_date)
        .filter((c) => !db.prepare('SELECT id FROM ar_ledgers WHERE contract_no=?').get(c.id) && !acted[c.id])
        .map((c) => ({
          no: c.id, id: c.id, title: c.name, owner: c.creator || '',
          amount: c.amount,
          extra: `客户：${c.customer || '-'}｜签订日期：${(c.sign_date || '').slice(0, 10) || '-'}｜金额：${c.amount || '-'} 元`,
          days: dayDiff(String(c.sign_date || '').slice(0, 10)),
        }));
    },
  },
  {
    code: 'ar_overdue', name: '应收逾期未回款', from: '回款管理', to: '财务/销售催办',
    severity: '高', fix: true, fixApi: '/api/coord/link/ar-urge',
    hint: '逾期应收应启动催办：先由销售跟进，超期 30 天升级财务与销售总监，超期 90 天纳入法务催告。',
    scan() {
      return db.prepare("SELECT * FROM ar_ledgers WHERE IFNULL(status,'')<>'已结清' AND IFNULL(due_date,'')<>'' AND due_date<?").all(todayStr())
        .map((a) => ({
          no: a.ar_no, id: a.id, title: `${a.customer_name || a.contract_no} ${a.ar_no}`,
          owner: a.sales_id ? ((db.prepare('SELECT name FROM employees WHERE id=?').get(a.sales_id) || {}).name || '') : '',
          amount: a.total_amount,
          extra: `到期日 ${a.due_date}｜逾期 ${dayDiff(a.due_date)} 天｜未收 ${(Number(a.total_amount) || 0) - (Number(a.received_amount) || 0)} 元`,
          days: dayDiff(a.due_date),
        }));
    },
  },
  {
    code: 'stale_approval', name: '审批滞留超过 7 天', from: '审批中心', to: '责任审批人',
    severity: '中', fix: false, fixApi: '',
    hint: '滞留超过 7 天的审批应催办，此处列出仍未闭环的单据供管理层督办。',
    scan() {
      return db.prepare("SELECT * FROM approvals WHERE status='待审批' AND created_at<? ORDER BY created_at ASC LIMIT 50").all(daysAgo(7))
        .map((a) => ({
          no: a.approval_no || ('#' + a.id), id: a.id, title: a.title || a.type, owner: a.applicant_name || '',
          amount: a.amount,
          extra: `类型：${a.type}｜提交：${String(a.created_at || '').slice(0, 10)}｜第 ${a.current_step || 1}/${a.total_steps || 1} 步`,
          days: dayDiff(String(a.created_at || '').slice(0, 10)),
        }));
    },
  },
  {
    code: 'pending_att_req', name: '补卡/加班申请滞留未审批', from: '协同办公', to: '行政人事审批',
    severity: '中', fix: false, fixApi: '',
    hint: '补卡与加班申请应在 3 个工作日内审结，逾期影响考勤核算与加班费结算。',
    scan() {
      const cut = daysAgo(3);
      const out = [];
      db.prepare("SELECT cf_no no, id, emp_name, work_date, created_at, '补卡' kind FROM cardfix_reqs WHERE status='待审批' AND created_at<?").all(cut)
        .forEach((x) => out.push({
          no: x.no, id: x.id, title: `${x.emp_name} 的${x.kind}申请`, owner: x.emp_name,
          extra: `类型：${x.kind}｜日期：${x.work_date}｜提交：${String(x.created_at || '').slice(0, 10)}`,
          days: dayDiff(String(x.created_at || '').slice(0, 10)),
        }));
      db.prepare("SELECT ot_no no, id, emp_name, ot_date, created_at, '加班' kind FROM overtime_reqs WHERE status='待审批' AND created_at<?").all(cut)
        .forEach((x) => out.push({
          no: x.no, id: x.id, title: `${x.emp_name} 的${x.kind}申请`, owner: x.emp_name,
          extra: `类型：${x.kind}｜日期：${x.ot_date}｜提交：${String(x.created_at || '').slice(0, 10)}`,
          days: dayDiff(String(x.created_at || '').slice(0, 10)),
        }));
      return out;
    },
  },
  {
    code: 'emp_pending_activate', name: '员工已建档未开通账号', from: '人事管理', to: '账号与权限',
    severity: '中', fix: false, fixApi: '',
    hint: '入职审批通过后员工状态为「待开通」，须由行政人事部负责人开通账号方可登录。',
    scan() {
      return db.prepare("SELECT id,emp_no,name,role,created_at FROM employees WHERE status='待开通' ORDER BY id DESC").all()
        .map((e) => ({
          no: e.emp_no, id: e.id, title: `${e.name}（${e.emp_no}）`, owner: '',
          extra: `岗位角色：${e.role}｜建档日期：${String(e.created_at || '').slice(0, 10)}`,
          days: dayDiff(String(e.created_at || '').slice(0, 10)),
        }));
    },
  },
  {
    code: 'bid_result_pending', name: '投标已过投标日未回填结果', from: '招投标管理', to: '开标结果',
    severity: '低', fix: false, fixApi: '',
    hint: '投标后应及时回填开标结果（已中标/未中标/已放弃），否则商机阶段与中标率统计失真。',
    scan() {
      return db.prepare("SELECT * FROM bids WHERE IFNULL(result,'待开标')='待开标' AND IFNULL(bid_date,'')<>'' AND bid_date<?").all(daysAgo(30))
        .map((b) => {
          const opp = b.opp_id ? db.prepare('SELECT name FROM opportunities WHERE id=?').get(b.opp_id) : null;
          return {
            no: b.bid_no, id: b.id, title: opp ? opp.name : b.bid_no, owner: '',
            amount: b.amount,
            extra: `投标日：${b.bid_date}｜距今 ${dayDiff(b.bid_date)} 天仍未回填结果`,
            days: dayDiff(b.bid_date),
          };
        });
    },
  },
];

function scanRule(rule, itemLimit) {
  let items = [];
  try { items = rule.scan() || []; } catch (e) {
    items = [];
    console.error('[协调中心] 规则扫描失败 ' + rule.code + ':', e.message);
  }
  return {
    code: rule.code, name: rule.name, from: rule.from, to: rule.to,
    severity: rule.severity, fix: rule.fix, fix_api: rule.fixApi, hint: rule.hint,
    count: items.length, items: items.slice(0, itemLimit || 50),
  };
}

/* ==================== 接口：断点检测 / 总览 / 留痕 ==================== */
async function breaks(req, res) {
  const only = String(req.query.rule || '').trim();
  const list = RULES.filter((r) => !only || r.code === only).map((r) => scanRule(r));
  return res.json(ok({ rules: list, total: list.reduce((s, x) => s + x.count, 0) }));
}

async function overview(req, res) {
  if (!MGMT.includes(req.user && req.user.role) && !OPERABLE.includes(req.user && req.user.role)) {
    // 非管理层仅可查看概览断点，不允许执行联动（联动接口单独鉴权）
    if (!req.user) return res.json(forbidden('未登录'));
  }
  const chains = [
    { name: '市场/商机 → 投标 → 合同 → 应收 → 回款', nodes: ['商机管理', '招投标管理', '合同管理', '回款管理'], rules: ['bid_win_no_contract', 'contract_no_ar', 'ar_overdue'] },
    { name: '业务单据 → 审批 → 消息通知', nodes: ['各业务模块', '审批中心', '消息中心'], rules: ['stale_approval'] },
    { name: '考勤异常 → 补卡/加班申请 → 行政人事审批', nodes: ['考勤管理', '协同办公', '行政人事'], rules: ['pending_att_req'] },
    { name: '招聘 → 入职审批 → 建档 → 开通账号', nodes: ['人事管理', '审批中心', '账号权限'], rules: ['emp_pending_activate'] },
    { name: '投标立项 → 开标 → 结果回填', nodes: ['招投标管理', '开标结果'], rules: ['bid_result_pending'] },
  ];
  const breaks = RULES.map((r) => scanRule(r, 20));
  const byCode = {};
  breaks.forEach((b) => { byCode[b.code] = b.count; });
  const chainHealth = chains.map((c) => {
    const n = c.rules.reduce((s, code) => s + (byCode[code] || 0), 0);
    return { name: c.name, nodes: c.nodes, breaks: n, status: n === 0 ? '畅通' : n <= 2 ? '轻微阻塞' : '阻塞' };
  });
  const high = breaks.filter((b) => b.severity === '高').reduce((s, b) => s + b.count, 0);
  const mid = breaks.filter((b) => b.severity === '中').reduce((s, b) => s + b.count, 0);
  const low = breaks.filter((b) => b.severity === '低').reduce((s, b) => s + b.count, 0);
  const total = high + mid + low;
  const health = total === 0 ? 100 : Math.max(0, 100 - (high * 6 + mid * 3 + low));
  let actions = [];
  try { actions = db.prepare('SELECT * FROM coord_actions ORDER BY id DESC LIMIT 30').all(); } catch (e) { actions = []; }
  return res.json(ok({
    stats: {
      total, high, mid, low, health,
      chains: chainHealth.length,
      blocked_chains: chainHealth.filter((c) => c.breaks > 0).length,
      actions: (db.prepare('SELECT COUNT(*) n FROM coord_actions').get() || {}).n || 0,
      can_operate: OPERABLE.includes(req.user && req.user.role) || MGMT.includes(req.user && req.user.role),
    },
    chains: chainHealth, breaks, recent_actions: actions,
  }));
}

async function actions(req, res) {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const rows = db.prepare('SELECT * FROM coord_actions ORDER BY id DESC LIMIT ?').all(limit);
  const total = (db.prepare('SELECT COUNT(*) n FROM coord_actions').get() || {}).n || 0;
  return res.json(ok({ actions: rows, total }));
}

function operable(user) {
  return !!user && (MGMT.includes(user.role) || OPERABLE.includes(user.role));
}

/* ==================== 一键联动：中标 → 生成合同草稿 ==================== */
function genContractId() {
  const y = new Date().getFullYear();
  for (let i = 0; i < 50; i++) {
    const n = db.prepare('SELECT COUNT(*) n FROM contracts').get().n + 1 + i;
    const id = `HT-${y}-${String(n).padStart(3, '0')}`;
    if (!db.prepare('SELECT id FROM contracts WHERE id=?').get(id)) return id;
  }
  return `HT-${y}-${Date.now()}`;
}

function linkBidWin(bid, user, auto, out) {
  const acted = actedMap('bid_win_no_contract');
  const opp = bid.opp_id ? db.prepare('SELECT * FROM opportunities WHERE id=?').get(bid.opp_id) : null;
  const projName = opp ? opp.name : bid.bid_no;
  if (db.prepare('SELECT id FROM contracts WHERE name LIKE ?').get(`%${projName}%`) || acted[bid.bid_no]) {
    out.push({ src: bid.bid_no, skipped: true, msg: '已生成过合同，跳过（幂等）' });
    return null;
  }
  const cid = genContractId();
  const custName = custNameOfOpp(bid.opp_id);
  db.prepare(`INSERT INTO contracts(id,name,customer,type,amount,start_date,end_date,status,progress,creator,creator_id,creator_dept,sign_date,execution_status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'未执行')`)
    .run(cid, `${projName}销售合同`, custName, '销售合同', Number(bid.amount) || 0,
      todayStr(), '', '待审批', 0,
      user ? user.name : '系统自动', String((user && user.id) || ''), (user && user.dept) || '', '');
  logAction('bid_win_no_contract', '中标→生成合同草稿', '招投标管理', '合同管理', bid.bid_no, cid,
    `已生成合同草稿 ${cid}（金额 ${bid.amount || 0} 万元，待发起评审）`, auto ? 1 : 0, user);
  audit('COORD_BID_WIN', user ? user.id : 'SYSTEM', bid.bid_no, `中标联动生成合同草稿 ${cid}`);
  const targets = [];
  if (opp && opp.sales_id) targets.push(opp.sales_id);
  const comm = empByRole('总经理');
  if (comm && comm.id !== (opp && opp.sales_id)) targets.push(comm.id);
  targets.forEach((tid) => {
    notifyEmp(tid, '中标联动：已生成合同草稿',
      `投标 ${bid.bid_no}（${projName}）已中标，系统自动生成合同草稿 ${cid}（${bid.amount || 0} 万元），请尽快补充合同条款并发起合同评审。`,
      '合同管理', null, user);
  });
  out.push({ src: bid.bid_no, contract_id: cid, msg: `已生成合同草稿 ${cid}` });
  return cid;
}

async function linkBidWinApi(req, res) {
  if (!operable(req.user)) return res.json(forbidden('仅管理层/商务条线可执行一键联动'));
  const b = req.body || {};
  let list = [];
  if (b.bid_id) list = db.prepare('SELECT * FROM bids WHERE id=?').all(Number(b.bid_id));
  else if (b.bid_no) list = db.prepare('SELECT * FROM bids WHERE bid_no=?').all(b.bid_no);
  else list = RULES[0].scan().map((x) => db.prepare('SELECT * FROM bids WHERE id=?').get(x.id)).filter(Boolean);
  if (!list.length) return res.json(notfound('没有需要联动的中标项目'));
  const out = [];
  list.forEach((bid) => {
    if (bid.result !== '已中标' && !b.force) { out.push({ src: bid.bid_no, skipped: true, msg: '非中标状态，跳过' }); return; }
    try { linkBidWin(bid, req.user, 0, out); } catch (e) { out.push({ src: bid.bid_no, error: e.message }); }
  });
  return res.json(ok({ count: out.length, results: out }, `处理 ${out.length} 条`));
}

/* ==================== 一键联动：合同 → 补建应收台账 ==================== */
async function linkContractAr(req, res) {
  if (!operable(req.user)) return res.json(forbidden('仅管理层/商务条线可执行一键联动'));
  const b = req.body || {};
  let list = [];
  if (b.contract_id) list = db.prepare('SELECT * FROM contracts WHERE id=?').all(String(b.contract_id));
  else list = RULES[1].scan().map((x) => db.prepare('SELECT * FROM contracts WHERE id=?').get(x.id)).filter(Boolean);
  const out = [];
  list.forEach((ct) => {
    try {
      if (db.prepare('SELECT id FROM ar_ledgers WHERE contract_no=?').get(ct.id)) {
        out.push({ src: ct.id, skipped: true, msg: '应收已存在' });
        return;
      }
      const n = db.prepare('SELECT COUNT(*) n FROM ar_ledgers').get().n + 1;
      const arNo = 'AR' + new Date().getFullYear() + String(n).padStart(3, '0');
      // 到期日：签订日期 + 30 天（与制度中心《合同订立与履约管理制度》账期约定一致）
      const base = ct.sign_date ? new Date(String(ct.sign_date).slice(0, 10).replace(/-/g, '/')) : new Date();
      const due = new Date(base.getTime() + 30 * 86400000);
      const dueStr = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      db.prepare(`INSERT INTO ar_ledgers(ar_no,contract_no,customer_name,total_amount,received_amount,due_date,status)
        VALUES(?,?,?,?,0,?,'未到期')`)
        .run(arNo, ct.id, ct.customer || ct.name, Number(ct.amount) || 0, dueStr);
      logAction('contract_no_ar', '合同→补建应收', '合同管理', '回款管理', ct.id, arNo,
        `已建应收 ${arNo}（${ct.amount || 0} 元，到期 ${dueStr}）`, 0, req.user);
      audit('COORD_CONTRACT_AR', req.userId, ct.id, `补建应收 ${arNo}（到期 ${dueStr}）`);
      // 当前项目 contracts 无 opp_id 外键，按创建人姓名回查员工，作为回款跟进人
      const creator = db.prepare('SELECT id FROM employees WHERE name=?').get(ct.creator || '');
      const fin = empByRole('总经理');
      if (creator) {
        notifyEmp(creator.id, '合同联动：已生成应收台账',
          `合同 ${ct.id}（${ct.name}）已生效，系统自动建立应收 ${arNo}（${ct.amount || 0} 元，到期 ${dueStr}），请跟进回款计划。`,
          '回款管理', null, req.user);
      }
      if (fin) {
        notifyEmp(fin.id, '合同联动：新增应收台账',
          `合同 ${ct.id} → 应收 ${arNo}（${ct.amount || 0} 元，到期 ${dueStr}）。`, '回款管理', null, req.user);
      }
      out.push({ src: ct.id, ar_no: arNo, msg: `已建应收 ${arNo}（到期 ${dueStr}）` });
    } catch (e) { out.push({ src: ct.id, error: e.message }); }
  });
  return res.json(ok({ count: out.length, results: out }, `处理 ${out.length} 条`));
}

/* ==================== 一键联动：逾期应收 → 分级催办 ==================== */
async function linkArUrge(req, res) {
  if (!operable(req.user)) return res.json(forbidden('仅管理层/商务条线可执行一键联动'));
  const b = req.body || {};
  let list = [];
  if (b.ar_id) list = db.prepare('SELECT * FROM ar_ledgers WHERE id=?').all(Number(b.ar_id));
  else list = RULES[2].scan().map((x) => db.prepare('SELECT * FROM ar_ledgers WHERE id=?').get(x.id)).filter(Boolean);
  const out = [];
  // 同应收 7 天防重复催办
  const recent = {};
  db.prepare("SELECT src_no FROM coord_actions WHERE rule='ar_overdue' AND created_at>=?").all(daysAgo(7))
    .forEach((x) => { recent[x.src_no] = 1; });
  list.forEach((ar) => {
    try {
      if (recent[ar.ar_no] && !b.force) { out.push({ src: ar.ar_no, skipped: true, msg: '7 天内已催办，跳过' }); return; }
      const od = dayDiff(ar.due_date) || 0;
      const level = od >= 90 ? '法务催告级' : od >= 30 ? '财务督办级' : '销售跟进阶';
      const targets = [];
      if (ar.sales_id) targets.push(ar.sales_id);
      if (od >= 30) { const fin = empByRole('总经理'); if (fin) targets.push(fin.id); }
      db.prepare("UPDATE ar_ledgers SET status='逾期' WHERE id=?").run(ar.id);
      let n = 0;
      targets.forEach((tid) => {
        notifyEmp(tid, `应收逾期催办（${level}）`,
          `应收 ${ar.ar_no}（${ar.customer_name || ar.contract_no}）已于 ${ar.due_date} 到期，逾期 ${od} 天，未收 ${(Number(ar.total_amount) || 0) - (Number(ar.received_amount) || 0)} 元，请按《应收账款管理办法》分级处置。`,
          '回款管理', ar.id, req.user);
        n++;
      });
      logAction('ar_overdue', '逾期应收→分级催办', '回款管理', '财务/销售催办', ar.ar_no, '',
        `逾期 ${od} 天，${level}，已通知 ${n} 人`, 0, req.user);
      audit('COORD_AR_URGE', req.userId, ar.ar_no, `逾期 ${od} 天（${level}），已通知 ${n} 人`);
      out.push({ src: ar.ar_no, msg: `逾期 ${od} 天，${level}，已通知 ${n} 人` });
    } catch (e) { out.push({ src: ar.ar_no, error: e.message }); }
  });
  return res.json(ok({ count: out.length, results: out }, `处理 ${out.length} 条`));
}

/* ==================== 自动跑批（幂等） ==================== */
async function autoRun(req, res) {
  if (!operable(req.user)) return res.json(forbidden('仅管理层/商务条线可执行自动联动'));
  const out = { bid_win: [], contract_ar: [] };
  RULES[0].scan().forEach((x) => {
    const bid = db.prepare('SELECT * FROM bids WHERE id=?').get(x.id);
    if (bid) { try { linkBidWin(bid, req.user, 1, out.bid_win); } catch (e) { out.bid_win.push({ src: bid.bid_no, error: e.message }); } }
  });
  // 合同 → 应收：金额与到期日可由制度推导，直接自动补链
  const contracts = RULES[1].scan().map((x) => db.prepare('SELECT * FROM contracts WHERE id=?').get(x.id)).filter(Boolean);
  contracts.forEach((ct) => {
    try {
      if (db.prepare('SELECT id FROM ar_ledgers WHERE contract_no=?').get(ct.id)) {
        out.contract_ar.push({ src: ct.id, skipped: true, msg: '应收已存在' });
        return;
      }
      const n = db.prepare('SELECT COUNT(*) n FROM ar_ledgers').get().n + 1;
      const arNo = 'AR' + new Date().getFullYear() + String(n).padStart(3, '0');
      const base = ct.sign_date ? new Date(String(ct.sign_date).slice(0, 10).replace(/-/g, '/')) : new Date();
      const due = new Date(base.getTime() + 30 * 86400000);
      const dueStr = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      db.prepare(`INSERT INTO ar_ledgers(ar_no,contract_no,customer_name,total_amount,received_amount,due_date,status)
        VALUES(?,?,?,?,0,?,'未到期')`).run(arNo, ct.id, ct.customer || ct.name, Number(ct.amount) || 0, dueStr);
      logAction('contract_no_ar', '合同→补建应收', '合同管理', '回款管理', ct.id, arNo,
        `已建应收 ${arNo}（${ct.amount || 0} 元，到期 ${dueStr}）`, 1, req.user);
      out.contract_ar.push({ src: ct.id, ar_no: arNo, msg: `已建应收 ${arNo}（到期 ${dueStr}）` });
    } catch (e) { out.contract_ar.push({ src: ct.id, error: e.message }); }
  });
  const done = out.bid_win.filter((x) => !x.skipped && !x.error).length + out.contract_ar.filter((x) => !x.skipped && !x.error).length;
  audit('COORD_AUTO_RUN', req.userId, '自动联动跑批', `本次自动补链 ${done} 条`);
  return res.json(ok({
    total: done, results: out,
    note: '中标→合同、合同→应收已全自动补链；应收逾期催办涉及分级通知，请在断点清单中逐条一键处理。',
  }, `本次自动补链 ${done} 条`));
}

module.exports = { breaks, overview, actions, linkBidWinApi, linkContractAr, linkArUrge, autoRun, RULES };
