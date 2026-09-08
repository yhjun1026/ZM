/**
 * 进销项发票控制器（迁移自参考项目 routes/invoicing.js，第55轮业财税查漏补缺）
 * 对齐参考项目业务逻辑：
 *  - 进项发票：采购收票登记 → 勾稽应付单 → 认证/抵扣勾选（未认证→已认证→已抵扣，单向不可逆）→ 未收票应付预警（入库满30天）
 *  - 销项发票：开票申请（走审批，审批通过后占额度转待开票）→ 财务登记发票号（转已开票）→ 回写应收开票状态；
 *    开票金额 ≤ 应收未开票余额；作废留痕不删除；红冲生成负数红字记录冲回额度
 *  - 采购退货（红字冲销，禁止硬删）：审批通过后 库存扣减 + 红字冲应付 + 冲暂估凭证（借2202/贷1405）
 *  - 销售退货：审批通过后 库存按成本回增 + 红字冲应收/冲收入（借6001/贷1122）+ 冲成本（借1405/贷6401）
 *  - 应付付款：金额 ≤ 未付余额，付后更新应付状态并生成凭证（借2202/贷1002）
 *  - 税务账龄：按到期日分档（未到期 / 0-30 / 31-60 / 61-90 / 90天以上）
 * 金额口径：万元（与业财一体化一致）。
 * 数据表：purchase_invoices / sale_invoices / purchase_returns / sale_returns / ap_ledgers / ap_payments / ar_ledgers
 *
 * 与参考项目的差异（受当前项目库表约束，逐处注明）：
 *  1) 009 迁移的 ap_ledgers 无 inv_amount / inv_status 列、ar_ledgers 无 invoiced_amount / invoice_status 列，
 *     参考项目用聚合列回写（recalcApInv/recalcArInv）→ 改为查询时动态聚合（口径一致：应付按 status='登记' 汇总、
 *     应收按 status IN ('待开票','已开票') 汇总，即审批通过的开票申请同样占用额度）。
 *  2) 账龄分档按本次迁移要求固定为 未到期/0-30/31-60/61-90/90天以上（参考项目为 1-30/31-60/61-90/91-180/180天以上）。
 *  3) 参考项目 notify 走 message.js → 当前项目改为审批单 + 审计日志（audit_log）。
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');
const {
  stockMove, createVoucher, VZ_RULES, money, fmt2, now, today, genNo, isFinance, createApproval,
} = require('./bizflow.controller');

/* ==================== 常量（对齐参考项目 invoicing.js） ==================== */
const INV_TYPES = ['专票', '普票', '电子发票', '其他'];
const DEDUCT_STATES = ['未认证', '已认证', '已抵扣'];
const RET_REASONS = ['质量问题', '多收货', '其他'];
const SALE_RET_REASONS = ['质量问题', '客户拒收', '其他'];
const PAY_METHODS = ['银行转账', '承兑', '现金'];
const AP_STATUS = ['未支付', '部分支付', '已支付'];
const AR_STATUS = ['未到期', '逾期', '部分回款', '已结清'];
/** 账龄分档（本次迁移要求的 0-30/31-60/61-90/90+ 口径） */
const AGING_BUCKETS = ['未到期', '0-30天', '31-60天', '61-90天', '90天以上'];
/** 未收票预警天数（对齐参考项目：入库满 30 天未收票） */
const UNINVOICED_DAYS = 30;

/* ==================== 工具函数 ==================== */
/** 应付单已收票金额与收票状态（无聚合列，动态计算） */
function apInvOf(apId) {
  const inv = money(db.prepare("SELECT COALESCE(SUM(amount),0) v FROM purchase_invoices WHERE ap_id=? AND status='登记'").get(apId).v);
  return inv;
}
function apInvStatus(ap, inv) {
  const total = Number(ap.total_amount) || 0;
  if (inv >= total - 0.0001) return '已收票';
  if (inv > 0.0001) return '部分收票';
  return '未收票';
}
/** 应收单已开票金额与开票状态（无聚合列，动态计算；待开票占额度，红冲负数与红字记录互相抵消） */
function arInvOf(arId) {
  return money(db.prepare("SELECT COALESCE(SUM(amount),0) v FROM sale_invoices WHERE ar_id=? AND status IN ('待开票','已开票','红冲')").get(arId).v);
}
function arInvStatus(ar, inv) {
  const total = Number(ar.total_amount) || 0;
  if (inv >= total - 0.0001) return '已开票';
  if (inv > 0.0001) return '部分开票';
  return '未开票';
}
function decorateAp(a) {
  const inv = apInvOf(a.id);
  return {
    ...a,
    inv_amount: inv,
    inv_status: apInvStatus(a, inv),
    unpaid: money((Number(a.total_amount) || 0) - (Number(a.paid_amount) || 0)),
  };
}
function decorateAr(a) {
  const inv = arInvOf(a.id);
  return {
    ...a,
    invoiced_amount: inv,
    invoice_status: arInvStatus(a, inv),
    outstanding: money((Number(a.total_amount) || 0) - (Number(a.received_amount) || 0)),
    ...agingOf(a),
  };
}
/** 账龄分档：按到期日距今天数（对齐参考 bucketOf，分档按本次要求） */
function agingOf(row) {
  const out = money((Number(row.total_amount) || 0) - (Number(row.paid_amount != null ? row.paid_amount : row.received_amount) || 0));
  if (out <= 0.0001) return { aging_bucket: '-', overdue_days: 0 };
  if (!row.due_date) return { aging_bucket: '未到期', overdue_days: 0 };
  const days = Math.floor((Date.now() - new Date(String(row.due_date).slice(0, 10) + 'T00:00:00').getTime()) / 86400000);
  if (days <= 0) return { aging_bucket: '未到期', overdue_days: 0 };
  if (days <= 30) return { aging_bucket: '0-30天', overdue_days: days };
  if (days <= 60) return { aging_bucket: '31-60天', overdue_days: days };
  if (days <= 90) return { aging_bucket: '61-90天', overdue_days: days };
  return { aging_bucket: '90天以上', overdue_days: days };
}

/* ==================== 元信息 / 统计 ==================== */
async function meta(req, res) {
  return res.json(ok({
    inv_types: INV_TYPES,
    deduct_states: DEDUCT_STATES,
    ret_reasons: RET_REASONS,
    sale_ret_reasons: SALE_RET_REASONS,
    pay_methods: PAY_METHODS,
    ap_status: AP_STATUS,
    ar_status: AR_STATUS,
    aging_buckets: AGING_BUCKETS,
    uninvoiced_days: UNINVOICED_DAYS,
  }));
}

async function stats(req, res) {
  const year = String(Number(req.query.year) || new Date().getFullYear());
  const q = (sql, ...p) => db.prepare(sql).get(...p);
  const pin = q("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a, COALESCE(SUM(tax_amount),0) t FROM purchase_invoices WHERE status='登记' AND substr(invoice_date,1,4)=?", year);
  const pinState = db.prepare("SELECT deduct_status, COUNT(*) n, COALESCE(SUM(amount),0) a FROM purchase_invoices WHERE status='登记' GROUP BY deduct_status").all();
  const sout = q("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a, COALESCE(SUM(tax_amount),0) t FROM sale_invoices WHERE status IN ('已开票','红冲') AND substr(invoice_date,1,4)=?", year);
  const sWait = q("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a FROM sale_invoices WHERE status IN ('待开票','审批中')");
  const sVoid = q("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a FROM sale_invoices WHERE status IN ('作废','红冲')");
  const apRows = db.prepare("SELECT * FROM ap_ledgers WHERE status!='已支付'").all();
  const arRows = db.prepare("SELECT * FROM ar_ledgers WHERE status!='已结清'").all();
  const apUninv = apRows.reduce((s, a) => s + Math.max(money((Number(a.total_amount) || 0) - apInvOf(a.id)), 0), 0);
  const arUninv = arRows.reduce((s, a) => s + Math.max(money((Number(a.total_amount) || 0) - arInvOf(a.id)), 0), 0);
  const prt = q("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a FROM purchase_returns WHERE status='待审批'");
  const srt = q("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a FROM sale_returns WHERE status='待审批'");
  const t = today();
  const overdueAr = arRows.reduce((s, a) => {
    const d = decorateAr(a);
    return s + (a.due_date && a.due_date < t ? Math.max(Number(d.outstanding), 0) : 0);
  }, 0);
  return res.json(ok({
    year,
    purchase: { count: pin.n, amount: fmt2(pin.a), tax: fmt2(pin.t), by_deduct: pinState },
    sale: { count: sout.n, amount: fmt2(sout.a), tax: fmt2(sout.t), pending_count: sWait.n, pending_amount: fmt2(sWait.a), void_count: sVoid.n },
    ap_uninvoiced: fmt2(apUninv),
    ar_uninvoiced: fmt2(arUninv),
    ap_balance: fmt2(apRows.reduce((s, a) => s + Math.max((Number(a.total_amount) || 0) - (Number(a.paid_amount) || 0), 0), 0)),
    ar_balance: fmt2(arRows.reduce((s, a) => s + Math.max((Number(a.total_amount) || 0) - (Number(a.received_amount) || 0), 0), 0)),
    ar_overdue: fmt2(overdueAr),
    purchase_returns_pending: prt.n,
    purchase_returns_amount: fmt2(prt.a),
    sale_returns_pending: srt.n,
    sale_returns_amount: fmt2(srt.a),
  }));
}

/* ==================== 进项发票 ==================== */
async function purchaseInvoices(req, res) {
  const { status, ap_no, deduct_status, q } = req.query;
  let sql = 'SELECT pi.* FROM purchase_invoices pi WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND pi.status=?'; p.push(status); }
  if (ap_no) { sql += ' AND pi.ap_no=?'; p.push(ap_no); }
  if (deduct_status) { sql += ' AND pi.deduct_status=?'; p.push(deduct_status); }
  if (q) { sql += ' AND (pi.invoice_no LIKE ? OR pi.supplier_name LIKE ? OR pi.pi_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY pi.id DESC LIMIT 500';
  return res.json(ok(db.prepare(sql).all(...p)));
}

async function createPurchaseInvoice(req, res) {
  const b = req.body || {};
  if (!b.invoice_no) return res.json(bad('发票号码必填'));
  const amount = money(Number(b.amount));
  if (!(amount > 0)) return res.json(bad('发票金额（万元）须大于 0'));
  const tax = money(Number(b.tax_amount) || 0);
  if (tax > amount) return res.json(bad('进项税额不能大于价税合计'));
  let ap = null;
  if (b.ap_id) {
    ap = db.prepare('SELECT * FROM ap_ledgers WHERE id=?').get(b.ap_id);
    if (!ap) return res.json(bad('勾稽的应付单不存在'));
  }
  const piNo = genNo('PI');
  const info = db.prepare(`INSERT INTO purchase_invoices(pi_no,invoice_no,invoice_code,inv_type,supplier_id,supplier_name,ap_id,ap_no,rc_no,po_no,amount,tax_amount,pre_amount,invoice_date,deduct_status,status,remark,operator_id,operator_name)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'登记',?,?,?)`)
    .run(piNo, b.invoice_no, b.invoice_code || '', INV_TYPES.includes(b.inv_type) ? b.inv_type : '专票',
      ap ? ap.supplier_id : (b.supplier_id || null), ap ? ap.supplier_name : (b.supplier_name || ''),
      ap ? ap.id : null, ap ? ap.ap_no : (b.ap_no || ''), b.rc_no || (ap ? ap.source_no : '') || '',
      b.po_no || (ap ? ap.source_no : '') || '',
      amount, tax, money(amount - tax), b.invoice_date || today(),
      DEDUCT_STATES.includes(b.deduct_status) ? b.deduct_status : '未认证',
      b.remark || '', empId(req) || null, (req.user && req.user.name) || '');
  audit('INV_PURCHASE_ADD', req.userId, piNo, `进项发票登记 ${piNo} ${b.invoice_no} ${amount}万元${ap ? '，勾稽应付 ' + ap.ap_no : ''}`);
  return res.json(ok({ pi_no: piNo, id: info.lastInsertRowid }, '进项发票已登记'));
}

async function updatePurchaseInvoice(req, res) {
  const pi = db.prepare('SELECT * FROM purchase_invoices WHERE id=?').get(req.params.id);
  if (!pi) return res.json(notfound('进项发票登记不存在'));
  if (pi.status !== '登记') return res.json(bad('仅正常登记状态可修改（作废请走作废操作留痕）'));
  if (pi.deduct_status === '已抵扣') return res.json(bad('已抵扣的发票不可修改'));
  const b = req.body || {};
  const amount = b.amount !== undefined ? money(Number(b.amount)) : pi.amount;
  if (!(amount > 0)) return res.json(bad('发票金额须大于 0'));
  const tax = b.tax_amount !== undefined ? money(Number(b.tax_amount)) : pi.tax_amount;
  let apId = pi.ap_id;
  if (b.ap_id !== undefined) {
    apId = b.ap_id ? Number(b.ap_id) : null;
    if (apId) {
      const ap = db.prepare('SELECT * FROM ap_ledgers WHERE id=?').get(apId);
      if (!ap) return res.json(bad('勾稽的应付单不存在'));
    }
  }
  db.prepare(`UPDATE purchase_invoices SET invoice_no=?, invoice_code=?, inv_type=?, supplier_id=?, supplier_name=?, ap_id=?, ap_no=?, rc_no=?, amount=?, tax_amount=?, pre_amount=?, invoice_date=?, deduct_status=?, remark=? WHERE id=?`)
    .run(b.invoice_no !== undefined ? b.invoice_no : pi.invoice_no,
      b.invoice_code !== undefined ? b.invoice_code : pi.invoice_code,
      b.inv_type !== undefined && INV_TYPES.includes(b.inv_type) ? b.inv_type : pi.inv_type,
      b.supplier_id !== undefined ? b.supplier_id : pi.supplier_id,
      b.supplier_name !== undefined ? b.supplier_name : pi.supplier_name,
      apId, apId ? ((db.prepare('SELECT ap_no FROM ap_ledgers WHERE id=?').get(apId) || {}).ap_no || '') : '',
      b.rc_no !== undefined ? b.rc_no : pi.rc_no,
      amount, tax, money(amount - tax), b.invoice_date !== undefined ? b.invoice_date : pi.invoice_date,
      b.deduct_status !== undefined && DEDUCT_STATES.includes(b.deduct_status) ? b.deduct_status : pi.deduct_status,
      b.remark !== undefined ? b.remark : pi.remark, pi.id);
  audit('INV_PURCHASE_EDIT', req.userId, pi.pi_no, `进项发票 ${pi.pi_no} ${pi.invoice_no} 修改为 ${amount}万元`);
  return res.json(ok(null, '已更新'));
}

/** 作废：留痕不删除，自动退出勾稽汇总（status='登记' 才计入） */
async function voidPurchaseInvoice(req, res) {
  const pi = db.prepare('SELECT * FROM purchase_invoices WHERE id=?').get(req.params.id);
  if (!pi) return res.json(notfound('进项发票登记不存在'));
  if (pi.status !== '登记') return res.json(bad('该发票已作废'));
  db.prepare("UPDATE purchase_invoices SET status='作废' WHERE id=?").run(pi.id);
  audit('INV_PURCHASE_VOID', req.userId, pi.pi_no, `进项发票 ${pi.pi_no} ${pi.invoice_no} 作废（不可删除，留痕）`);
  return res.json(ok(null, '已作废'));
}

/** 认证/勾选抵扣：未认证 → 已认证 → 已抵扣，单向不可逆 */
async function deductPurchaseInvoice(req, res) {
  const pi = db.prepare('SELECT * FROM purchase_invoices WHERE id=?').get(req.params.id);
  if (!pi) return res.json(notfound('进项发票登记不存在'));
  if (pi.status !== '登记') return res.json(bad('已作废发票不可认证'));
  const target = (req.body || {}).deduct_status;
  if (!DEDUCT_STATES.includes(target)) return res.json(bad('认证状态非法'));
  const cur = DEDUCT_STATES.indexOf(pi.deduct_status);
  const next = DEDUCT_STATES.indexOf(target);
  if (next <= cur) return res.json(bad(`认证状态只能单向推进：当前[${pi.deduct_status}]`));
  if (next !== cur + 1) return res.json(bad(`请按顺序认证：${pi.deduct_status} → ${DEDUCT_STATES[cur + 1]}`));
  db.prepare('UPDATE purchase_invoices SET deduct_status=? WHERE id=?').run(target, pi.id);
  audit('INV_PURCHASE_DEDUCT', req.userId, pi.pi_no, `进项发票 ${pi.pi_no} ${pi.invoice_no} 认证状态 ${pi.deduct_status} → ${target}`);
  return res.json(ok({ deduct_status: target }, `已${target === '已抵扣' ? '勾选抵扣' : '认证'}`));
}

/** 未收票应付预警：应付单收票不足，且入库满 30 天仍未收齐（对齐参考 /ap-uninvoiced） */
async function apUninvoiced(req, res) {
  const rows = db.prepare(`SELECT a.*, (SELECT MIN(receipt_date) FROM purchase_receipts rc WHERE rc.rc_no=a.source_no) receipt_date
    FROM ap_ledgers a WHERE a.source_type='采购入库' ORDER BY a.id DESC`).all()
    .map(decorateAp)
    .filter((x) => x.inv_status !== '已收票');
  const t = today();
  const overdue = rows.filter((x) => x.receipt_date && x.receipt_date <= t
    && (Date.now() - new Date(String(x.receipt_date).slice(0, 10) + 'T00:00:00').getTime()) / 86400000 >= UNINVOICED_DAYS);
  return res.json(ok({ rows, overdue, days: UNINVOICED_DAYS }));
}

/* ==================== 销项发票 ==================== */
async function saleInvoices(req, res) {
  const { status, ar_no, q } = req.query;
  let sql = 'SELECT si.*, (SELECT approval_no FROM approvals WHERE id=si.approval_id) approval_no FROM sale_invoices si WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND si.status=?'; p.push(status); }
  if (ar_no) { sql += ' AND si.ar_no=?'; p.push(ar_no); }
  if (req.user && req.user.role === '销售员') { sql += ' AND si.sales_id=?'; p.push(empId(req) || 0); }
  if (q) { sql += ' AND (si.invoice_no LIKE ? OR si.customer_name LIKE ? OR si.sin_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY si.id DESC LIMIT 500';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 未开票应收：可开票余额 > 0 且未结清（对齐参考 /ar-uninvoiced） */
async function arUninvoiced(req, res) {
  let sql = 'SELECT a.* FROM ar_ledgers a WHERE 1=1';
  const p = [];
  if (req.user && req.user.role === '销售员') { sql += ' AND a.sales_id=?'; p.push(empId(req) || 0); }
  sql += ' ORDER BY a.id DESC';
  const rows = db.prepare(sql).all(...p).map(decorateAr)
    .filter((x) => x.status !== '已结清' && money((Number(x.total_amount) || 0) - Number(x.invoiced_amount)) > 0.0001);
  return res.json(ok(rows));
}

/** 开票申请：走审批，金额 ≤ 应收未开票余额（对齐参考 /sale-invoices/apply） */
async function applySaleInvoice(req, res) {
  const b = req.body || {};
  const ar = b.ar_id ? db.prepare('SELECT * FROM ar_ledgers WHERE id=?').get(b.ar_id) : null;
  if (!ar) return res.json(bad('请选择应收单'));
  const amount = money(Number(b.amount));
  if (!(amount > 0)) return res.json(bad('开票金额须大于 0'));
  const inv = arInvOf(ar.id);
  const uninvoiced = money((Number(ar.total_amount) || 0) - inv);
  if (amount > uninvoiced + 0.0001) {
    return res.json(bad(`开票超额：应收${fmt2(ar.total_amount)}万元，已开票/占用${fmt2(inv)}万元，可开${fmt2(uninvoiced)}万元`));
  }
  const tax = money(Number(b.tax_amount) || 0);
  const sinNo = genNo('SI');
  try {
    const out = db.transaction(() => {
      const info = db.prepare(`INSERT INTO sale_invoices(sin_no,invoice_no,invoice_code,inv_type,ar_id,ar_no,customer_name,distributor_id,sales_id,region,amount,tax_amount,pre_amount,invoice_date,source,status,operator_id,operator_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'开票申请','审批中',?,?)`)
        .run(sinNo, '', '', INV_TYPES.includes(b.inv_type) ? b.inv_type : '专票', ar.id, ar.ar_no, ar.customer_name,
          ar.distributor_id, ar.sales_id, ar.region || '', amount, tax, money(amount - tax), b.invoice_date || '',
          empId(req) || null, (req.user && req.user.name) || '');
      const ap = createApproval(req.user, '开票申请审批', `开票申请：${ar.customer_name} ${amount}万元（应收 ${ar.ar_no}）`,
        info.lastInsertRowid, amount, ['财务部', '总经理']);
      db.prepare('UPDATE sale_invoices SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
      return { id: info.lastInsertRowid, ap };
    })();
    audit('INV_SALE_APPLY', req.userId, sinNo, `开票申请 ${sinNo}（${ar.customer_name} ${amount}万元 应收${ar.ar_no}）审批 ${out.ap.approval_no}`);
    return res.json(ok({ sin_no: sinNo, id: out.id, approval_no: out.ap.approval_no }, '开票申请已提交审批'));
  } catch (e) {
    return res.json(bad(e.message || '申请失败'));
  }
}

/** 开票申请审批：通过 → 待开票（占用应收开票额度）；驳回 → 作废留痕 */
async function approveSaleInvoice(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可审批开票申请'));
  const { action } = req.body || {};
  const si = db.prepare('SELECT * FROM sale_invoices WHERE id=?').get(req.params.id);
  if (!si) return res.json(notfound('开票登记不存在'));
  if (si.status !== '审批中') return res.json(bad(`当前状态[${si.status}]非审批中`));
  const st = action === 'reject' ? '驳回' : '待开票';
  db.prepare('UPDATE sale_invoices SET status=? WHERE id=?').run(st, si.id);
  if (si.approval_id) db.prepare('UPDATE approvals SET status=?, finished_at=? WHERE id=?').run(st === '待开票' ? '通过' : '驳回', now(), si.approval_id);
  audit('INV_SALE_APPROVE', req.userId, si.sin_no, `开票申请 ${si.sin_no} ${st}`);
  return res.json(ok(null, `开票申请已${st === '待开票' ? '批准，待财务开票' : '驳回'}`));
}

/** 财务直接登记（已开票，发票号必填） */
async function createSaleInvoice(req, res) {
  const b = req.body || {};
  const ar = b.ar_id ? db.prepare('SELECT * FROM ar_ledgers WHERE id=?').get(b.ar_id) : null;
  if (!ar) return res.json(bad('请选择应收单'));
  if (!b.invoice_no) return res.json(bad('实际发票号码必填'));
  const amount = money(Number(b.amount));
  if (!(amount > 0)) return res.json(bad('开票金额须大于 0'));
  const inv = arInvOf(ar.id);
  const uninvoiced = money((Number(ar.total_amount) || 0) - inv);
  if (amount > uninvoiced + 0.0001) return res.json(bad(`开票超额：可开${fmt2(uninvoiced)}万元`));
  const tax = money(Number(b.tax_amount) || 0);
  const sinNo = genNo('SI');
  const info = db.prepare(`INSERT INTO sale_invoices(sin_no,invoice_no,invoice_code,inv_type,ar_id,ar_no,customer_name,distributor_id,sales_id,region,amount,tax_amount,pre_amount,invoice_date,source,status,operator_id,operator_name)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'直接登记','已开票',?,?)`)
    .run(sinNo, b.invoice_no, b.invoice_code || '', INV_TYPES.includes(b.inv_type) ? b.inv_type : '专票', ar.id, ar.ar_no, ar.customer_name,
      ar.distributor_id, ar.sales_id, ar.region || '', amount, tax, money(amount - tax), b.invoice_date || today(),
      empId(req) || null, (req.user && req.user.name) || '');
  audit('INV_SALE_ADD', req.userId, sinNo, `销项发票登记 ${sinNo} ${ar.customer_name} 发票${b.invoice_no} ${amount}万元（应收${ar.ar_no}）`);
  return res.json(ok({ sin_no: sinNo, id: info.lastInsertRowid }, '销项发票已登记'));
}

/** 补录发票号：待开票 → 已开票 */
async function registerSaleInvoice(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可登记发票号'));
  const si = db.prepare('SELECT * FROM sale_invoices WHERE id=?').get(req.params.id);
  if (!si) return res.json(notfound('开票登记不存在'));
  if (si.status !== '待开票') return res.json(bad(`当前状态[${si.status}]不可登记（仅待开票可补录发票号）`));
  const b = req.body || {};
  if (!b.invoice_no) return res.json(bad('实际发票号码必填'));
  db.prepare('UPDATE sale_invoices SET invoice_no=?, invoice_code=?, invoice_date=?, status=? WHERE id=?')
    .run(b.invoice_no, b.invoice_code || '', b.invoice_date || today(), '已开票', si.id);
  audit('INV_SALE_REGISTER', req.userId, si.sin_no, `销项发票 ${si.sin_no} 补录发票号 ${b.invoice_no} → 已开票`);
  return res.json(ok(null, '已开票'));
}

/** 作废：留痕不删除，释放开票额度（对齐参考） */
async function voidSaleInvoice(req, res) {
  const si = db.prepare('SELECT * FROM sale_invoices WHERE id=?').get(req.params.id);
  if (!si) return res.json(notfound('开票登记不存在'));
  if (!['待开票', '已开票'].includes(si.status)) return res.json(bad('当前状态不可作废'));
  db.prepare("UPDATE sale_invoices SET status='作废' WHERE id=?").run(si.id);
  audit('INV_SALE_VOID', req.userId, si.sin_no, `销项发票 ${si.sin_no} ${si.invoice_no || '(未开)'} 作废留痕`);
  return res.json(ok(null, '已作废'));
}

/** 红字冲销：原票置为「红冲」，并生成一条负数红字记录冲回开票额度（对齐参考「禁止硬删、红字冲销」） */
async function redSaleInvoice(req, res) {
  const si = db.prepare('SELECT * FROM sale_invoices WHERE id=?').get(req.params.id);
  if (!si) return res.json(notfound('开票登记不存在'));
  if (si.status !== '已开票') return res.json(bad('仅已开票的发票可红冲'));
  if (si.source === '红冲') return res.json(bad('红字记录不可再红冲'));
  const b = req.body || {};
  const sinNo = genNo('SI');
  try {
    const out = db.transaction(() => {
      db.prepare("UPDATE sale_invoices SET status='红冲' WHERE id=?").run(si.id);
      const info = db.prepare(`INSERT INTO sale_invoices(sin_no,invoice_no,invoice_code,inv_type,ar_id,ar_no,customer_name,distributor_id,sales_id,region,amount,tax_amount,pre_amount,invoice_date,source,status,operator_id,operator_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'红冲','已开票',?,?)`)
        .run(sinNo, `红字-${si.invoice_no || si.sin_no}`, si.invoice_code || '', si.inv_type, si.ar_id, si.ar_no, si.customer_name,
          si.distributor_id, si.sales_id, si.region || '', -Number(si.amount || 0), -Number(si.tax_amount || 0),
          -Number(si.pre_amount || 0), b.invoice_date || today(), empId(req) || null, (req.user && req.user.name) || '');
      return { id: info.lastInsertRowid };
    })();
    audit('INV_SALE_RED', req.userId, si.sin_no, `销项发票 ${si.sin_no} ${si.invoice_no || ''} 红字冲销，生成红字记录 ${sinNo}（-${si.amount}万元）`);
    return res.json(ok({ sin_no: sinNo, id: out.id }, '已红冲，红字记录已生成'));
  } catch (e) {
    return res.json(bad(e.message || '红冲失败'));
  }
}

/* ==================== 采购退货（红字冲销） ==================== */
async function purchaseReturns(req, res) {
  const { status } = req.query;
  let sql = 'SELECT prt.*, (SELECT approval_no FROM approvals WHERE id=prt.approval_id) approval_no FROM purchase_returns prt WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND prt.status=?'; p.push(status); }
  if (req.query.rc_no) { sql += ' AND prt.rc_no=?'; p.push(req.query.rc_no); }
  sql += ' ORDER BY prt.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 入库单可退试算：累计已退 + 应付未付余额 → 可退上限（对齐参考 /purchase-returns/calc） */
async function purchaseReturnCalc(req, res) {
  const rc = db.prepare('SELECT * FROM purchase_receipts WHERE id=?').get(Number(req.query.rc_id) || 0);
  if (!rc) return res.json(notfound('入库单不存在'));
  const retSum = db.prepare("SELECT COALESCE(SUM(qty),0) q, COALESCE(SUM(amount),0) a FROM purchase_returns WHERE rc_id=? AND status='已生效'").get(rc.id);
  const ap = db.prepare("SELECT * FROM ap_ledgers WHERE source_type='采购入库' AND source_no=?").get(rc.rc_no);
  const unpaid = ap ? money((Number(ap.total_amount) || 0) - (Number(ap.paid_amount) || 0)) : 0;
  return res.json(ok({
    rc,
    returned_qty: retSum.q,
    returned_amount: retSum.a,
    returnable_qty: money((Number(rc.qty) || 0) - retSum.q),
    returnable_amount: Math.min(money((Number(rc.amount) || 0) - retSum.a), unpaid),
    ap_no: ap ? ap.ap_no : null,
    unpaid,
  }));
}

async function createPurchaseReturn(req, res) {
  const b = req.body || {};
  const rc = b.rc_id ? db.prepare('SELECT * FROM purchase_receipts WHERE id=?').get(b.rc_id) : null;
  if (!rc) return res.json(bad('请选择采购入库单'));
  const qty = Number(b.qty) || 0;
  const amount = money(Number(b.amount));
  if (qty <= 0) return res.json(bad('退货数量须大于 0'));
  if (!(amount > 0)) return res.json(bad('红冲金额（万元）须大于 0'));
  const retSum = db.prepare("SELECT COALESCE(SUM(qty),0) q, COALESCE(SUM(amount),0) a FROM purchase_returns WHERE rc_id=? AND status='已生效'").get(rc.id);
  if (retSum.q + qty > (Number(rc.qty) || 0) + 0.0001) return res.json(bad(`退货超量：入库${rc.qty}，已退${retSum.q}，本次最多${fmt2((Number(rc.qty) || 0) - retSum.q)}`));
  if (retSum.a + amount > (Number(rc.amount) || 0) + 0.0001) return res.json(bad(`退货金额超出入库金额：已退${fmt2(retSum.a)}万元，最多${fmt2((Number(rc.amount) || 0) - retSum.a)}万元`));
  const ap = db.prepare("SELECT * FROM ap_ledgers WHERE source_type='采购入库' AND source_no=?").get(rc.rc_no);
  if (!ap) return res.json(bad('未找到该入库单的应付记录，无法退货冲销'));
  const unpaid = money((Number(ap.total_amount) || 0) - (Number(ap.paid_amount) || 0));
  if (amount > unpaid + 0.0001) return res.json(bad(`该入库对应应付${ap.ap_no}未付余额仅${fmt2(unpaid)}万元，已付部分请走线下退款，本次最多红冲${fmt2(unpaid)}万元`));
  const warehouse = b.warehouse || rc.warehouse || '总部仓库';
  const st = db.prepare('SELECT * FROM warehouse_stock WHERE item_name=? AND model=? AND warehouse=?').get(rc.item_name, rc.model || '', warehouse);
  if (!st || (Number(st.qty) || 0) < qty - 0.0001) return res.json(bad(`库存不足：${rc.item_name} 当前库存${st ? st.qty : 0}${rc.unit || '件'}，无法退${qty}${rc.unit || '件'}`));

  const no = genNo('PRT');
  const reason = RET_REASONS.includes(b.reason) ? b.reason : '质量问题';
  try {
    const out = db.transaction(() => {
      const info = db.prepare(`INSERT INTO purchase_returns(rt_no,rc_id,rc_no,po_id,po_no,supplier_id,supplier_name,item_name,model,warehouse,unit,qty,amount,reason,return_date,status,operator_id,operator_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'待审批',?,?)`)
        .run(no, rc.id, rc.rc_no, rc.po_id, rc.po_no, rc.supplier_id, rc.supplier_name, rc.item_name, rc.model || '', warehouse,
          rc.unit || '件', qty, amount, reason, b.return_date || today(), empId(req) || null, (req.user && req.user.name) || '');
      const apv = createApproval(req.user, '采购退货审批', `采购退货：${rc.item_name} ${qty}${rc.unit || '件'} 红冲${amount}万元`,
        info.lastInsertRowid, amount, ['采购部', '财务部', '总经理']);
      db.prepare('UPDATE purchase_returns SET approval_id=? WHERE id=?').run(apv.id, info.lastInsertRowid);
      return { id: info.lastInsertRowid, apv };
    })();
    audit('INV_PURCHASE_RETURN_ADD', req.userId, no, `采购退货单 ${no}（${rc.rc_no}）${rc.item_name} ${qty}${rc.unit || '件'} ${amount}万元，审批 ${out.apv.approval_no}`);
    return res.json(ok({ rt_no: no, id: out.id, approval_no: out.apv.approval_no }, '采购退货已提交审批'));
  } catch (e) {
    return res.json(bad(e.message || '提交失败'));
  }
}

/**
 * 采购退货生效（审批通过联动，对齐参考 applyPurchaseReturn）：
 * 库存扣减（负数出库）→ 红字冲应付（借2202/贷1405，冲暂估）→ 冲减应付余额 → 退货单置已生效
 */
async function approvePurchaseReturn(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可审批采购退货'));
  const { action } = req.body || {};
  const row = db.prepare('SELECT * FROM purchase_returns WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('退货单不存在'));
  if (row.status !== '待审批') return res.json(bad(`退货单当前状态[${row.status}]不可审批`));
  if (action === 'reject') {
    db.prepare("UPDATE purchase_returns SET status='驳回' WHERE id=?").run(row.id);
    if (row.approval_id) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(now(), row.approval_id);
    audit('INV_PURCHASE_RETURN_REJECT', req.userId, row.rt_no, `采购退货 ${row.rt_no} 驳回`);
    return res.json(ok(null, '已驳回'));
  }
  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  try {
    const out = db.transaction(() => {
      const st = db.prepare('SELECT * FROM warehouse_stock WHERE item_name=? AND model=? AND warehouse=?').get(row.item_name, row.model || '', row.warehouse || '总部仓库');
      if (!st || (Number(st.qty) || 0) < Number(row.qty) - 0.0001) throw new Error(`库存不足（当前${st ? st.qty : 0}${row.unit || '件'}）`);
      const ap = db.prepare("SELECT * FROM ap_ledgers WHERE source_type='采购入库' AND source_no=?").get(row.rc_no);
      if (!ap) throw new Error('关联应付单不存在');
      if (Number(row.amount) > (Number(ap.total_amount) - Number(ap.paid_amount)) + 0.0001) throw new Error(`应付${ap.ap_no}未付余额不足，无法红冲${row.amount}万元`);
      const mv = stockMove({
        move_type: '采购退货', ref_table: 'purchase_returns', ref_id: row.id, ref_no: row.rt_no,
        item_name: row.item_name, model: row.model || '', warehouse: row.warehouse || '总部仓库', unit: row.unit || '件',
        qty: -Number(row.qty), amount: -Number(row.amount), emp, biz_date: row.return_date || today(),
        remark: `采购退货 ${row.rt_no} ${row.reason || ''}`,
      });
      const amt = Math.abs(Number(row.amount));
      const rule = VZ_RULES['采购退货'];
      const vz = createVoucher({
        source_type: '采购退货', source_table: 'purchase_returns', source_id: row.id, source_no: row.rt_no,
        summary: `采购退货 ${row.rt_no} ${row.item_name} 红冲${amt}万元（${row.reason || ''}）`, biz_date: row.return_date || today(), emp,
        entries: [
          { direction: '借', account_code: rule.d[0], account_name: rule.d[1], amount: amt },
          { direction: '贷', account_code: rule.c[0], account_name: rule.c[1], amount: amt },
        ],
      });
      const newTotal = money(Number(ap.total_amount) - Number(row.amount));
      const nst = newTotal <= (Number(ap.paid_amount) || 0) + 0.0001 ? '已支付' : ((Number(ap.paid_amount) || 0) > 0.0001 ? '部分支付' : '未支付');
      db.prepare('UPDATE ap_ledgers SET total_amount=?, status=? WHERE id=?').run(newTotal, nst, ap.id);
      db.prepare("UPDATE purchase_returns SET status='已生效' WHERE id=?").run(row.id);
      if (row.approval_id) db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(now(), row.approval_id);
      return { mv, vz, ap_no: ap.ap_no, newTotal };
    })();
    audit('INV_PURCHASE_RETURN_APPLY', req.userId, row.rt_no, `采购退货 ${row.rt_no} 生效：库存扣减${row.qty}${row.unit || '件'}，应付${out.ap_no}冲减至${out.newTotal}万元，凭证${out.vz && out.vz.voucher_no}`);
    return res.json(ok({ move_no: out.mv && out.mv.move_no, voucher_no: out.vz && out.vz.voucher_no }, '退货已生效：库存扣减、应付红冲、凭证已生成'));
  } catch (e) {
    return res.json(bad(e.message || '审批失败'));
  }
}

/* ==================== 销售退货（红字冲销） ==================== */
async function saleReturns(req, res) {
  const { status } = req.query;
  let sql = 'SELECT srt.*, (SELECT approval_no FROM approvals WHERE id=srt.approval_id) approval_no FROM sale_returns srt WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND srt.status=?'; p.push(status); }
  sql += ' ORDER BY srt.id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 可退货应收：未回款余额 > 0 且未结清（对齐参考 /ar-returnable） */
async function arReturnable(req, res) {
  const rows = db.prepare('SELECT * FROM ar_ledgers ORDER BY id DESC').all().map(decorateAr)
    .filter((x) => x.status !== '已结清' && Number(x.outstanding) > 0.0001);
  return res.json(ok(rows));
}

async function createSaleReturn(req, res) {
  const b = req.body || {};
  const ar = b.ar_id ? db.prepare('SELECT * FROM ar_ledgers WHERE id=?').get(b.ar_id) : null;
  if (!ar) return res.json(bad('请选择应收单'));
  const qty = Number(b.qty) || 0;
  const amount = money(Number(b.amount));
  if (qty <= 0) return res.json(bad('退货数量须大于 0'));
  if (!(amount > 0)) return res.json(bad('红冲应收金额（万元）须大于 0'));
  const outstanding = money((Number(ar.total_amount) || 0) - (Number(ar.received_amount) || 0));
  if (amount > outstanding + 0.0001) return res.json(bad(`该应收未回款余额仅${fmt2(outstanding)}万元，已回款部分请走线下退款流程，本次最多红冲${fmt2(outstanding)}万元`));
  if (!b.item_name) return res.json(bad('退货商品名称必填'));
  const no = genNo('SRT');
  const reason = SALE_RET_REASONS.includes(b.reason) ? b.reason : '质量问题';
  try {
    const out = db.transaction(() => {
      const info = db.prepare(`INSERT INTO sale_returns(rt_no,ar_id,ar_no,customer_name,distributor_id,sales_id,region,item_name,model,warehouse,unit,qty,amount,reason,return_date,status,operator_id,operator_name)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'待审批',?,?)`)
        .run(no, ar.id, ar.ar_no, ar.customer_name, ar.distributor_id, ar.sales_id, ar.region || '', b.item_name, b.model || '',
          b.warehouse || '总部仓库', b.unit || '件', qty, amount, reason, b.return_date || today(),
          empId(req) || null, (req.user && req.user.name) || '');
      const apv = createApproval(req.user, '销售退货审批', `销售退货：${ar.customer_name} ${amount}万元（${b.item_name} ${qty}${b.unit || '件'}）`,
        info.lastInsertRowid, amount, ['销售总监', '财务部', '总经理']);
      db.prepare('UPDATE sale_returns SET approval_id=? WHERE id=?').run(apv.id, info.lastInsertRowid);
      return { id: info.lastInsertRowid, apv };
    })();
    audit('INV_SALE_RETURN_ADD', req.userId, no, `销售退货单 ${no}（${ar.ar_no} ${ar.customer_name} ${amount}万元）审批 ${out.apv.approval_no}`);
    return res.json(ok({ rt_no: no, id: out.id, approval_no: out.apv.approval_no }, '销售退货已提交审批'));
  } catch (e) {
    return res.json(bad(e.message || '提交失败'));
  }
}

/**
 * 销售退货生效（对齐参考 applySaleReturn）：
 * 库存按当前平均成本回增 → 红字冲收入（借6001/贷1122）+ 冲成本（借1405/贷6401）→ 冲减应收 → 退货单置已生效
 */
async function approveSaleReturn(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可审批销售退货'));
  const { action } = req.body || {};
  const row = db.prepare('SELECT * FROM sale_returns WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('退货单不存在'));
  if (row.status !== '待审批') return res.json(bad(`退货单当前状态[${row.status}]不可审批`));
  if (action === 'reject') {
    db.prepare("UPDATE sale_returns SET status='驳回' WHERE id=?").run(row.id);
    if (row.approval_id) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(now(), row.approval_id);
    audit('INV_SALE_RETURN_REJECT', req.userId, row.rt_no, `销售退货 ${row.rt_no} 驳回`);
    return res.json(ok(null, '已驳回'));
  }
  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  try {
    const out = db.transaction(() => {
      const ar = row.ar_id ? db.prepare('SELECT * FROM ar_ledgers WHERE id=?').get(row.ar_id) : null;
      if (!ar) throw new Error('关联应收单不存在');
      const outstanding = money((Number(ar.total_amount) || 0) - (Number(ar.received_amount) || 0));
      if (Number(row.amount) > outstanding + 0.0001) throw new Error(`应收${ar.ar_no}未回款余额${fmt2(outstanding)}万元不足红冲`);
      const st = db.prepare('SELECT * FROM warehouse_stock WHERE item_name=? AND model=? AND warehouse=?').get(row.item_name, row.model || '', row.warehouse || '总部仓库');
      const costAmt = st ? money((Number(st.avg_cost) || 0) * Number(row.qty)) : 0;
      const mv = stockMove({
        move_type: '销售退货', ref_table: 'sale_returns', ref_id: row.id, ref_no: row.rt_no,
        item_name: row.item_name, model: row.model || '', warehouse: row.warehouse || '总部仓库', unit: row.unit || '件',
        qty: Number(row.qty), amount: costAmt, emp, biz_date: row.return_date || today(),
        remark: `销售退货 ${row.rt_no} ${row.reason || ''}`,
      });
      const amt = Number(row.amount);
      const vz1 = createVoucher({
        source_type: '销售退货', source_table: 'sale_returns', source_id: row.id, source_no: row.rt_no,
        summary: `销售退货 ${row.rt_no} ${ar.customer_name} 红冲收入${amt}万元`, biz_date: row.return_date || today(), emp,
        entries: [
          { direction: '借', account_code: '6001', account_name: '主营业务收入', amount: amt },
          { direction: '贷', account_code: '1122', account_name: '应收账款', amount: amt },
        ],
      });
      let vz2 = null;
      if (costAmt > 0.0001) {
        vz2 = createVoucher({
          source_type: '销售退货成本', source_table: 'sale_returns', source_id: row.id, source_no: `${row.rt_no}-COST`,
          summary: `销售退货 ${row.rt_no} 冲回出库成本${costAmt}万元`, biz_date: row.return_date || today(), emp,
          entries: [
            { direction: '借', account_code: '1405', account_name: '库存商品', amount: costAmt },
            { direction: '贷', account_code: '6401', account_name: '主营业务成本', amount: costAmt },
          ],
        });
      }
      const newTotal = money((Number(ar.total_amount) || 0) - amt);
      const t = today();
      let nst;
      if ((Number(ar.received_amount) || 0) >= newTotal - 0.0001) nst = '已结清';
      else if (ar.due_date && ar.due_date < t) nst = '逾期';
      else if ((Number(ar.received_amount) || 0) > 0.0001) nst = '部分回款';
      else nst = '未到期';
      db.prepare('UPDATE ar_ledgers SET total_amount=?, status=? WHERE id=?').run(newTotal, nst, ar.id);
      db.prepare("UPDATE sale_returns SET status='已生效' WHERE id=?").run(row.id);
      if (row.approval_id) db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(now(), row.approval_id);
      return { mv, vz1, vz2, ar_no: ar.ar_no, newTotal };
    })();
    audit('INV_SALE_RETURN_APPLY', req.userId, row.rt_no, `销售退货 ${row.rt_no} 生效：库存回补${row.qty}${row.unit || '件'}，应收${out.ar_no}冲减至${out.newTotal}万元，凭证${out.vz1 && out.vz1.voucher_no}`);
    return res.json(ok({ move_no: out.mv && out.mv.move_no, voucher_no: out.vz1 && out.vz1.voucher_no }, '退货已生效：库存回补、应收红冲、凭证已生成'));
  } catch (e) {
    return res.json(bad(e.message || '审批失败'));
  }
}

/* ==================== 应付 / 应收 ==================== */
async function apLedgers(req, res) {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM ap_ledgers WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (q) { sql += ' AND (ap_no LIKE ? OR supplier_name LIKE ? OR source_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY id DESC LIMIT 500';
  return res.json(ok(db.prepare(sql).all(...p).map(decorateAp)));
}

/** 应付付款：金额 ≤ 未付余额，生成付款记录 + 凭证（借2202/贷1002），更新应付状态 */
async function payAp(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可登记付款'));
  const ap = db.prepare('SELECT * FROM ap_ledgers WHERE id=?').get(req.params.id);
  if (!ap) return res.json(notfound('应付单不存在'));
  const b = req.body || {};
  const amount = money(Number(b.amount));
  if (!(amount > 0)) return res.json(bad('付款金额须大于 0'));
  const unpaid = money((Number(ap.total_amount) || 0) - (Number(ap.paid_amount) || 0));
  if (amount > unpaid + 0.0001) return res.json(bad(`付款超额：应付${fmt2(ap.total_amount)}万元，已付${fmt2(ap.paid_amount)}万元，未付${fmt2(unpaid)}万元`));
  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  const payDate = b.pay_date || today();
  try {
    const out = db.transaction(() => {
      const info = db.prepare('INSERT INTO ap_payments(ap_id,ap_no,amount,pay_date,method,operator_id,operator_name) VALUES(?,?,?,?,?,?,?)')
        .run(ap.id, ap.ap_no, amount, payDate, PAY_METHODS.includes(b.method) ? b.method : '银行转账',
          empId(req) || null, (req.user && req.user.name) || '');
      const paid = money((Number(ap.paid_amount) || 0) + amount);
      const nst = paid >= (Number(ap.total_amount) || 0) - 0.0001 ? '已支付' : '部分支付';
      db.prepare('UPDATE ap_ledgers SET paid_amount=?, status=? WHERE id=?').run(paid, nst, ap.id);
      const rule = VZ_RULES['应付付款'];
      const vz = createVoucher({
        source_type: '应付付款', source_table: 'ap_payments', source_id: info.lastInsertRowid, source_no: ap.ap_no,
        summary: `支付货款 ${ap.ap_no} ${amount}万元（${b.method || '银行转账'}）`, biz_date: payDate, emp,
        entries: [
          { direction: '借', account_code: rule.d[0], account_name: rule.d[1], amount },
          { direction: '贷', account_code: rule.c[0], account_name: rule.c[1], amount },
        ],
      });
      return { paid, nst, vz };
    })();
    audit('INV_AP_PAY', req.userId, ap.ap_no, `应付付款 ${ap.ap_no} ${amount}万元，累计已付${out.paid}万元（${out.nst}），凭证${out.vz && out.vz.voucher_no}`);
    return res.json(ok({ paid_amount: out.paid, status: out.nst, voucher_no: out.vz && out.vz.voucher_no }, '付款已登记'));
  } catch (e) {
    return res.json(bad(e.message || '付款登记失败'));
  }
}

async function arLedgers(req, res) {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM ar_ledgers WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (req.user && req.user.role === '销售员') { sql += ' AND sales_id=?'; p.push(empId(req) || 0); }
  if (q) { sql += ' AND (ar_no LIKE ? OR customer_name LIKE ? OR contract_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY id DESC LIMIT 500';
  return res.json(ok(db.prepare(sql).all(...p).map(decorateAr)));
}

/* ==================== 税务汇总 / 账龄分析 ==================== */
/** 对齐参考 /tax-summary：月度进销项 + 未开票收入 + 未收票应付 + 收入-开票差异预警 */
async function taxSummary(req, res) {
  const year = String(Number(req.query.year) || new Date().getFullYear());
  const byMonth = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const pin = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a, COALESCE(SUM(tax_amount),0) t FROM purchase_invoices WHERE status='登记' AND substr(invoice_date,1,7)=?").get(`${year}-${mm}`);
    // 销项：已开票 + 红冲原票（与红字负数记录相互抵消，净额口径与应收开票额一致）
    const sout = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount),0) a, COALESCE(SUM(tax_amount),0) t FROM sale_invoices WHERE status IN ('已开票','红冲') AND substr(invoice_date,1,7)=?").get(`${year}-${mm}`);
    byMonth.push({
      month: `${year}-${mm}`,
      in: { count: pin.n, amount: fmt2(pin.a), tax: fmt2(pin.t) },
      out: { count: sout.n, amount: fmt2(sout.a), tax: fmt2(sout.t) },
    });
  }
  const arRows = db.prepare("SELECT * FROM ar_ledgers WHERE status!='已结清'").all().map(decorateAr);
  const apRows = db.prepare("SELECT * FROM ap_ledgers WHERE status!='已支付'").all().map(decorateAp);
  const diffAr = arRows.filter((x) => money(Number(x.total_amount) - Number(x.invoiced_amount)) > 0.0001)
    .map((x) => ({ ar_no: x.ar_no, customer_name: x.customer_name, total_amount: fmt2(x.total_amount), invoiced_amount: fmt2(x.invoiced_amount), diff: fmt2(money(Number(x.total_amount) - Number(x.invoiced_amount))) }))
    .sort((a, b) => Number(b.diff) - Number(a.diff)).slice(0, 20);
  const diffAp = apRows.filter((x) => money(Number(x.total_amount) - Number(x.inv_amount)) > 0.0001)
    .map((x) => ({ ap_no: x.ap_no, supplier_name: x.supplier_name, total_amount: fmt2(x.total_amount), inv_amount: fmt2(x.inv_amount), diff: fmt2(money(Number(x.total_amount) - Number(x.inv_amount))) }))
    .sort((a, b) => Number(b.diff) - Number(a.diff)).slice(0, 20);
  const sums = byMonth.reduce((s, x) => ({
    in_amount: s.in_amount + Number(x.in.amount), in_tax: s.in_tax + Number(x.in.tax),
    out_amount: s.out_amount + Number(x.out.amount), out_tax: s.out_tax + Number(x.out.tax),
  }), { in_amount: 0, in_tax: 0, out_amount: 0, out_tax: 0 });
  return res.json(ok({
    year,
    byMonth,
    sums: { in_amount: fmt2(sums.in_amount), in_tax: fmt2(sums.in_tax), out_amount: fmt2(sums.out_amount), out_tax: fmt2(sums.out_tax) },
    uninvoicedIncome: fmt2(diffAr.reduce((s, x) => s + Number(x.diff), 0)),
    uninvoicedExpense: fmt2(diffAp.reduce((s, x) => s + Number(x.diff), 0)),
    diffAr,
    diffAp,
  }));
}

/** 账龄分析（0-30/31-60/61-90/90+ 分档；对齐参考 /aging） */
async function aging(req, res) {
  const side = req.query.side === 'ap' ? 'ap' : 'ar';
  const buckets = AGING_BUCKETS.map((k) => ({ bucket: k, count: 0, amount: 0 }));
  const idx = Object.fromEntries(buckets.map((x, i) => [x.bucket, i]));
  let rows = [];
  if (side === 'ar') rows = db.prepare("SELECT * FROM ar_ledgers WHERE status!='已结清'").all().map(decorateAr);
  else rows = db.prepare("SELECT * FROM ap_ledgers WHERE status!='已支付'").all().map(decorateAp);
  rows.forEach((x) => {
    const out = side === 'ar' ? Number(x.outstanding) : Number(x.unpaid);
    if (out <= 0.0001) return;
    const b = x.aging_bucket;
    if (b && idx[b] != null) {
      buckets[idx[b]].count++;
      buckets[idx[b]].amount = fmt2(Number(buckets[idx[b]].amount) + out);
    }
  });
  return res.json(ok({
    side,
    asof: today(),
    buckets,
    total: fmt2(buckets.reduce((s, x) => s + Number(x.amount), 0)),
    rows: rows.filter((x) => (side === 'ar' ? Number(x.outstanding) : Number(x.unpaid)) > 0.0001)
      .sort((a, b) => (side === 'ar' ? Number(b.outstanding) - Number(a.outstanding) : Number(b.unpaid) - Number(a.unpaid)))
      .slice(0, 100),
  }));
}

module.exports = {
  meta, stats,
  purchaseInvoices, createPurchaseInvoice, updatePurchaseInvoice, voidPurchaseInvoice, deductPurchaseInvoice, apUninvoiced,
  saleInvoices, applySaleInvoice, approveSaleInvoice, createSaleInvoice, registerSaleInvoice, voidSaleInvoice, redSaleInvoice, arUninvoiced,
  purchaseReturns, purchaseReturnCalc, createPurchaseReturn, approvePurchaseReturn,
  saleReturns, arReturnable, createSaleReturn, approveSaleReturn,
  apLedgers, payAp, arLedgers,
  taxSummary, aging,
  applyPurchaseReturn: approvePurchaseReturn,
  applySaleReturn: approveSaleReturn,
};
