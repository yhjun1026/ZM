/**
 * 进销存-财务数据互通引擎 (PRD 采购+销售模块含财务数据互通)
 * 职责:
 *  1. t_tr_* 表族迁移
 *  2. 业务节点智能捕捉 → 自动抓取生成应付/应收/凭证 (syncToFinance)
 *  3. 同步异常日志 + 自动重试(3次) + 手动重试
 *  4. 异常捕捉(金额异常/税率异常/数据缺失/同步异常)
 *  5. 审批流构造与角色匹配(采购/销售共用)
 */
const { db } = require('./database');
const { genId, now, safeParse } = require('./helpers');

/* ===== 表迁移 ===== */
function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS t_tr_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    biz_type TEXT NOT NULL, biz_id TEXT NOT NULL, biz_no TEXT DEFAULT '',
    action TEXT DEFAULT '', status TEXT DEFAULT 'success',
    retries INTEGER DEFAULT 0, error_msg TEXT DEFAULT '', synced_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_ap (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_no TEXT DEFAULT '',
    supplier_id TEXT DEFAULT '', supplier_name TEXT DEFAULT '',
    amount REAL DEFAULT 0, confirmed_amount REAL DEFAULT 0, pay_amount REAL DEFAULT 0,
    status TEXT DEFAULT '待确认', voucher_no TEXT DEFAULT '',
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_ar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL, source_id TEXT NOT NULL, source_no TEXT DEFAULT '',
    customer_id TEXT DEFAULT '', customer_name TEXT DEFAULT '',
    amount REAL DEFAULT 0, confirmed_amount REAL DEFAULT 0, received_amount REAL DEFAULT 0,
    status TEXT DEFAULT '待确认', voucher_no TEXT DEFAULT '',
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_no TEXT UNIQUE, vtype TEXT, ref_no TEXT DEFAULT '',
    amount REAL DEFAULT 0, direction TEXT DEFAULT '',
    summary TEXT DEFAULT '', created_by TEXT DEFAULT '系统自动', created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_type TEXT NOT NULL, ref_id TEXT NOT NULL, name TEXT NOT NULL,
    credit_code TEXT DEFAULT '', contact TEXT DEFAULT '', phone TEXT DEFAULT '',
    bank TEXT DEFAULT '', account TEXT DEFAULT '', settle_cycle TEXT DEFAULT '',
    tax_rate TEXT DEFAULT '', status TEXT DEFAULT '合作中', synced_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    biz_type TEXT, biz_id TEXT, biz_no TEXT DEFAULT '',
    alert_type TEXT, level TEXT DEFAULT '中', msg TEXT,
    status TEXT DEFAULT '待复核', created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_pay (
    id TEXT PRIMARY KEY,
    po_id TEXT NOT NULL, po_no TEXT DEFAULT '', supplier_name TEXT DEFAULT '',
    amount REAL DEFAULT 0, pay_date TEXT, way TEXT DEFAULT '', voucher_no TEXT,
    operator TEXT, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS t_tr_receipt (
    id TEXT PRIMARY KEY,
    so_id TEXT NOT NULL, so_no TEXT DEFAULT '', customer_name TEXT DEFAULT '',
    amount REAL DEFAULT 0, receipt_date TEXT, way TEXT DEFAULT '', voucher_no TEXT,
    operator TEXT, created_at TEXT
  );
  `);
}
migrate();

/* ===== 审批流角色匹配 ===== */
function matchTradeRole(u, role, creatorDept) {
  if (u.role === '超级管理员') return true;
  switch (role) {
    case 'deptLeader':
      return (u.role === '部门经理' && u.dept === creatorDept) ||
             (u.role === '销售总监' && creatorDept === '销售部');
    case 'salesDirector':
      return u.role === '销售总监' || u.role === '总经理' || u.role === '副总';
    case 'finance':
      return u.dept === '财务部';
    case 'deputy':
      return u.role === '副总';
    case 'gm':
      return u.role === '总经理';
    case 'mgmt':
      return ['总经理', '副总'].includes(u.role);
    default:
      return false;
  }
}

/* ===== 审批流构造 ===== */
function buildTradeFlow(kind, amount, creatorDept) {
  const t = now();
  const done = { user: '', time: t, done: true, opinion: '' };
  const todo = (step, role) => ({ step, role, user: '', time: '—', done: false, opinion: '' });
  switch (kind) {
    case 'request':
      return [{ step: '提交申请', ...done },
        todo('部门负责人审批', 'deptLeader'),
        todo('副总审批', 'deputy'),
        todo('审批完成', 'system')];
    case 'po':
      return [{ step: '提交订单', ...done },
        todo('部门负责人审批', 'deptLeader'),
        todo('财务审核', 'finance'),
        todo('副总审批', 'deputy'),
        todo('订单生效', 'system')];
    case 'grn':
      return [{ step: '提交入库单', ...done },
        todo('部门负责人审批', 'deptLeader'),
        todo('财务确认', 'finance'),
        todo('入账', 'system')];
    case 'preturn':
      return [{ step: '提交退货单', ...done },
        todo('部门负责人审批', 'deptLeader'),
        todo('财务审核', 'finance'),
        todo('冲减', 'system')];
    case 'so':
      return [{ step: '提交订单', ...done },
        todo('销售总监审批', 'salesDirector'),
        todo('财务审核', 'finance'),
        todo('副总审批', 'deputy'),
        todo('订单生效', 'system')];
    case 'out':
      return [{ step: '提交出库单', ...done },
        todo('部门负责人审批', 'deptLeader'),
        todo('财务确认', 'finance'),
        todo('出库', 'system')];
    case 'sreturn':
      return [{ step: '提交退换货单', ...done },
        todo('销售总监审批', 'salesDirector'),
        todo('财务审核', 'finance'),
        todo('冲减', 'system')];
    default:
      return [];
  }
}

/* ===== 异常捕捉 ===== */
function addAlert(biz_type, biz_id, biz_no, alert_type, level, msg) {
  const dup = db.prepare(`SELECT id FROM t_tr_alerts WHERE biz_type=? AND biz_id=? AND alert_type=? AND status='待复核'`).get(biz_type, biz_id, alert_type);
  if (dup) return;
  db.prepare(`INSERT INTO t_tr_alerts (biz_type,biz_id,biz_no,alert_type,level,msg,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(biz_type, biz_id, biz_no, alert_type, level, msg, now());
}

function scanBizAnomaly(bizType, id, no, items, totalWithTax) {
  let missing = false, taxBad = false;
  (items || []).forEach(it => {
    if (!it.name || !it.qty || !it.price) missing = true;
    const tr = Number(it.tax_rate);
    if (![0, 6, 9, 13].includes(tr)) taxBad = true;
  });
  if (missing) addAlert(bizType, id, no, '数据缺失', '高', '单据存在物料名称/数量/单价缺失，请补全');
  if (taxBad) addAlert(bizType, id, no, '税率异常', '中', '单据存在非标准税率(0/6/9/13%)，请财务复核');
  if ((totalWithTax || 0) >= 500000) addAlert(bizType, id, no, '金额异常', '高', `单据含税金额 ${totalWithTax} 元达到大额标准(≥50万)，请财务重点复核`);
}

/* ===== 凭证生成 ===== */
function makeVoucher(vtype, refNo, amount, direction, summary) {
  const no = genId('PZ');
  db.prepare(`INSERT INTO t_tr_vouchers (voucher_no,vtype,ref_no,amount,direction,summary,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(no, vtype, refNo, amount, direction, summary, '系统自动', now());
  return no;
}

/* ===== 同步处理器(智能捕捉节点) ===== */
const HANDLERS = {
  // 采购订单生效 → 预生成待确认应付
  po_effective(id) {
    const po = db.prepare('SELECT * FROM t_tr_po WHERE id = ?').get(id);
    if (!po) throw new Error('采购订单不存在');
    const exist = db.prepare(`SELECT id FROM t_tr_ap WHERE source_type='po' AND source_id=?`).get(id);
    if (!exist) {
      db.prepare(`INSERT INTO t_tr_ap (source_type,source_id,source_no,supplier_id,supplier_name,amount,status,created_at,updated_at)
        VALUES ('po',?,?,?,?,?, '待确认', ?, ?)`).run(id, po.po_no, po.supplier_id, po.supplier_name, po.total_with_tax, now(), now());
    }
    db.prepare(`UPDATE t_tr_po SET fin_status='待确认应付' WHERE id=?`).run(id);
    return '预生成待确认应付账款';
  },
  // 采购入库生效 → 转正式应付 + 成本凭证 + 反向同步订单已入账
  grn_effective(id) {
    const grn = db.prepare('SELECT * FROM t_tr_grn WHERE id = ?').get(id);
    if (!grn) throw new Error('入库单不存在');
    const po = db.prepare('SELECT * FROM t_tr_po WHERE id = ?').get(grn.po_id);
    let ap = db.prepare(`SELECT * FROM t_tr_ap WHERE source_type='po' AND source_id=? AND status != '已作废'`).get(grn.po_id);
    if (!ap) {
      db.prepare(`INSERT INTO t_tr_ap (source_type,source_id,source_no,supplier_id,supplier_name,amount,created_at,updated_at)
        VALUES ('po',?,?,?,?,?,?,?)`).run(grn.po_id, po ? po.po_no : '', po ? po.supplier_id : '', po ? po.supplier_name : '', po ? po.total_with_tax : grn.total_with_tax, now(), now());
      ap = db.prepare(`SELECT * FROM t_tr_ap WHERE source_type='po' AND source_id=?`).get(grn.po_id);
    }
    const vno = makeVoucher('采购入库', grn.grn_no, grn.total_with_tax, '支出', `采购入库确认成本 ${po ? po.supplier_name : ''} ${grn.total_with_tax} 元`);
    db.prepare(`UPDATE t_tr_ap SET confirmed_amount = confirmed_amount + ?, status='正式', voucher_no=?, updated_at=? WHERE id=?`)
      .run(grn.total_with_tax, vno, now(), ap.id);
    db.prepare(`UPDATE t_tr_grn SET fin_status='财务已入账', voucher_no=? WHERE id=?`).run(vno, id);
    // 反向同步: 更新采购订单入库/入账状态
    if (po) {
      const grnSum = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) s FROM t_tr_grn WHERE po_id=? AND status='已生效'`).get(po.id).s;
      const inStat = grnSum >= po.total_with_tax ? '全部入库' : '部分入库';
      db.prepare(`UPDATE t_tr_po SET status=?, fin_status='财务已入账' WHERE id=?`).run(inStat, po.id);
    }
    return '应付账款转正式，生成采购成本凭证';
  },
  // 采购退货生效 → 冲减应付 + 红字凭证
  preturn_effective(id) {
    const rt = db.prepare('SELECT * FROM t_tr_preturn WHERE id = ?').get(id);
    if (!rt) throw new Error('退货单不存在');
    const vno = makeVoucher('红字冲销-采购退货', rt.rt_no, -rt.total_with_tax, '冲减', `采购退货冲减应付 ${rt.total_with_tax} 元`);
    db.prepare(`INSERT INTO t_tr_ap (source_type,source_id,source_no,supplier_id,supplier_name,amount,status,voucher_no,created_at,updated_at)
      VALUES ('preturn',?,?,?,? ,?, '已冲减', ?, ?, ?)`)
      .run(id, rt.rt_no, rt.supplier_id, rt.supplier_name, -rt.total_with_tax, vno, now(), now());
    // 同步冲减主台账(采购订单)确认应付额
    db.prepare(`UPDATE t_tr_ap SET confirmed_amount = confirmed_amount - ?, updated_at=? WHERE source_type='po' AND source_id=? AND status != '已作废'`)
      .run(rt.total_with_tax, now(), rt.po_id);
    db.prepare(`UPDATE t_tr_preturn SET fin_status='已冲减结算金额', voucher_no=? WHERE id=?`).run(vno, id);
    return '冲减应付账款，生成红字冲销凭证';
  },
  // 采购订单作废 → 作废待确认应付
  po_void(id) {
    const n = db.prepare(`UPDATE t_tr_ap SET status='已作废', updated_at=? WHERE source_type='po' AND source_id=? AND status='待确认'`).run(now(), id).changes;
    db.prepare(`UPDATE t_tr_po SET fin_status='已作废冲销' WHERE id=?`).run(id);
    return '作废应付预登记 ' + n + ' 条';
  },
  // 销售订单生效 → 预生成待确认应收
  so_effective(id) {
    const so = db.prepare('SELECT * FROM t_tr_so WHERE id = ?').get(id);
    if (!so) throw new Error('销售订单不存在');
    const exist = db.prepare(`SELECT id FROM t_tr_ar WHERE source_type='so' AND source_id=?`).get(id);
    if (!exist) {
      db.prepare(`INSERT INTO t_tr_ar (source_type,source_id,source_no,customer_id,customer_name,amount,status,created_at,updated_at)
        VALUES ('so',?,?,?,?,?, '待确认', ?, ?)`).run(id, so.so_no, so.customer_id, so.customer_name, so.total_with_tax, now(), now());
    }
    db.prepare(`UPDATE t_tr_so SET fin_status='待确认应收' WHERE id=?`).run(id);
    return '预生成待确认应收账款';
  },
  // 销售出库生效 → 正式应收 + 收入凭证(含销项税)
  out_effective(id) {
    const out = db.prepare('SELECT * FROM t_tr_out WHERE id = ?').get(id);
    if (!out) throw new Error('出库单不存在');
    const so = db.prepare('SELECT * FROM t_tr_so WHERE id = ?').get(out.so_id);
    let ar = db.prepare(`SELECT * FROM t_tr_ar WHERE source_type='so' AND source_id=? AND status != '已作废'`).get(out.so_id);
    if (!ar) {
      db.prepare(`INSERT INTO t_tr_ar (source_type,source_id,source_no,customer_id,customer_name,amount,created_at,updated_at)
        VALUES ('so',?,?,?,?,?,?,?)`).run(out.so_id, so ? so.so_no : '', so ? so.customer_id : '', so ? so.customer_name : '', so ? so.total_with_tax : out.total_with_tax, now(), now());
      ar = db.prepare(`SELECT * FROM t_tr_ar WHERE source_type='so' AND source_id=?`).get(out.so_id);
    }
    const vno = makeVoucher('销售出库', out.out_no, out.total_with_tax, '收入', `销售出库确认收入 ${so ? so.customer_name : ''} ${out.total_with_tax} 元(销项税 ${out.tax_amount} 元)`);
    db.prepare(`UPDATE t_tr_ar SET confirmed_amount = confirmed_amount + ?, status='正式', voucher_no=?, updated_at=? WHERE id=?`)
      .run(out.total_with_tax, vno, now(), ar.id);
    db.prepare(`UPDATE t_tr_out SET fin_status='财务已入账', voucher_no=? WHERE id=?`).run(vno, id);
    if (so) {
      const outSum = db.prepare(`SELECT COALESCE(SUM(total_with_tax),0) s FROM t_tr_out WHERE so_id=? AND status='已生效'`).get(so.id).s;
      const st = outSum >= so.total_with_tax ? '全部出库' : '部分出库';
      db.prepare(`UPDATE t_tr_so SET status=?, fin_status='财务已入账' WHERE id=?`).run(st, so.id);
    }
    return '应收账款转正式，生成销售收入凭证';
  },
  // 销售退换货生效 → 冲减应收 + 红字凭证
  sreturn_effective(id) {
    const rt = db.prepare('SELECT * FROM t_tr_sreturn WHERE id = ?').get(id);
    if (!rt) throw new Error('退换货单不存在');
    if (rt.type === '换货') {
      db.prepare(`UPDATE t_tr_sreturn SET fin_status='换货不涉金额冲减' WHERE id=?`).run(id);
      return '换货单不涉及金额冲减';
    }
    const vno = makeVoucher('红字冲销-销售退货', rt.rt_no, -rt.total_with_tax, '冲减', `销售退货冲减应收 ${rt.total_with_tax} 元`);
    db.prepare(`INSERT INTO t_tr_ar (source_type,source_id,source_no,customer_id,customer_name,amount,status,voucher_no,created_at,updated_at)
      VALUES ('sreturn',?,?,?,?,?, '已冲减', ?, ?, ?)`)
      .run(id, rt.rt_no, rt.customer_id, rt.customer_name, -rt.total_with_tax, vno, now(), now());
    // 同步冲减主台账(销售订单)确认应收额
    db.prepare(`UPDATE t_tr_ar SET confirmed_amount = confirmed_amount - ?, updated_at=? WHERE source_type='so' AND source_id=? AND status != '已作废'`)
      .run(rt.total_with_tax, now(), rt.so_id);
    db.prepare(`UPDATE t_tr_sreturn SET fin_status='已冲减应收金额', voucher_no=? WHERE id=?`).run(vno, id);
    return '冲减应收账款，生成红字冲销凭证';
  },
  so_void(id) {
    const n = db.prepare(`UPDATE t_tr_ar SET status='已作废', updated_at=? WHERE source_type='so' AND source_id=? AND status='待确认'`).run(now(), id).changes;
    db.prepare(`UPDATE t_tr_so SET fin_status='已作废冲销' WHERE id=?`).run(id);
    return '作废应收预登记 ' + n + ' 条';
  },
  // 往来单位同步(新客户/供应商档案优先 + 旧表补充 → 财务往来单位台账)
  partner_sync() {
    db.prepare(`DELETE FROM t_tr_partners`).run();
    const up = db.prepare(`INSERT INTO t_tr_partners (partner_type,ref_id,name,credit_code,contact,phone,bank,account,status,synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let n = 0;
    // 新供应商档案(排除停用/淘汰)
    db.prepare(`SELECT * FROM t_sm_suppliers WHERE status NOT IN ('已停用','已淘汰')`).all().forEach(s => {
      up.run('supplier', s.id, s.name, s.credit_code || '', s.contact || '', s.phone || '', s.bank || '', s.account || '', s.status === '备选' ? '备选' : '合作中', now()); n++;
    });
    // 新客户档案(排除停用/注销)
    db.prepare(`SELECT * FROM t_cm_customers WHERE status NOT IN ('已停用','已注销')`).all().forEach(c => {
      up.run('customer', c.id, c.name, c.credit_code || '', c.contact || '', c.phone || '', c.bank || '', c.account || '', c.status === '意向' ? '意向' : '合作中', now()); n++;
    });
    // 旧表补充(名称未与新档案重复的)
    const supNames = new Set(db.prepare(`SELECT name FROM t_sm_suppliers`).all().map(x => x.name));
    const cusNames = new Set(db.prepare(`SELECT name FROM t_cm_customers`).all().map(x => x.name));
    db.prepare(`SELECT id,name,contact,phone,bank,account,status FROM suppliers WHERE status='合作中' OR status='已合作'`).all()
      .filter(s => !supNames.has(s.name)).forEach(s => { up.run('supplier', s.id, s.name, s.contact || '', s.phone || '', s.bank || '', s.account || '', '合作中', now()); n++; });
    db.prepare(`SELECT id,name,contact,phone,status FROM customers WHERE status != '已禁用'`).all()
      .filter(c => !cusNames.has(c.name)).forEach(c => { up.run('customer', c.id, c.name, c.contact || '', c.phone || '', '', '', '合作中', now()); n++; });
    return '同步往来单位 ' + n + ' 家';
  }
};

/**
 * 统一同步入口: 业务节点变更 → 财务自动抓取
 * 失败自动记录异常日志(供重试)，不阻断业务流程
 */
function syncToFinance(bizType, bizId, bizNo) {
  try {
    const h = HANDLERS[bizType];
    if (!h) throw new Error('未知同步类型: ' + bizType);
    const msg = h(bizId);
    db.prepare(`INSERT INTO t_tr_sync_log (biz_type,biz_id,biz_no,action,status,retries,synced_at) VALUES (?,?,?,?,?,0,?)`)
      .run(bizType, bizId, bizNo || '', msg, 'success', now());
    return { ok: true, msg };
  } catch (e) {
    db.prepare(`INSERT INTO t_tr_sync_log (biz_type,biz_id,biz_no,action,status,retries,error_msg,synced_at) VALUES (?,?,?,?,?,0,?,?)`)
      .run(bizType, bizId, bizNo || '', '', 'failed', e.message, now());
    const po = db.prepare('SELECT po_no FROM t_tr_po WHERE id=?').get(bizId);
    addAlert('sync', bizType + ':' + bizId, (po && po.po_no) || bizNo || '', '同步异常', '高', '财务数据同步失败: ' + e.message);
    return { ok: false, msg: e.message };
  }
}

/** 自动重试: 对 failed 且 retries<3 的日志重试(PRD 7. 自动重试3次) */
function retryFailedSyncs() {
  const rows = db.prepare(`SELECT * FROM t_tr_sync_log WHERE status='failed' AND retries < 3 ORDER BY id DESC LIMIT 20`).all();
  let fixed = 0;
  rows.forEach(l => {
    const r = syncToFinance(l.biz_type, l.biz_id, l.biz_no);
    if (r.ok) {
      db.prepare(`UPDATE t_tr_sync_log SET retries = retries + 1 WHERE id = ?`).run(l.id);
      db.prepare(`DELETE FROM t_tr_alerts WHERE biz_type='sync' AND biz_id=?`).run(l.biz_type + ':' + l.biz_id);
      fixed++;
    } else {
      db.prepare(`UPDATE t_tr_sync_log SET retries = retries + 1, error_msg=?, synced_at=? WHERE id = ?`).run(r.msg, now(), l.id);
    }
  });
  return { retried: rows.length, fixed };
}

/** 金额计算: items=[{name,spec,qty,price,tax_rate}] */
function calcAmount(items) {
  const list = safeParse(JSON.stringify(items || []), []);
  let amount = 0, tax = 0;
  list.forEach(it => {
    const a = (Number(it.qty) || 0) * (Number(it.price) || 0);
    amount += a;
    tax += a * (Number(it.tax_rate) || 0) / 100;
  });
  amount = Math.round(amount * 100) / 100;
  tax = Math.round(tax * 100) / 100;
  return { amount, tax_amount: tax, total_with_tax: Math.round((amount + tax) * 100) / 100 };
}

module.exports = { syncToFinance, retryFailedSyncs, addAlert, scanBizAnomaly, matchTradeRole, buildTradeFlow, calcAmount, makeVoucher };
