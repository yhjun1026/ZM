/**
 * 业财一体化控制器（迁移自参考项目 routes/accounting.js + invoicing.js 的库存/折旧段）
 * 对齐参考项目业务逻辑：
 *  - 库存台账 warehouse_stock 采用加权平均成本（avg_cost 万元/单位），金额与数量同步滚动
 *  - 任何出入库必须先写 stock_movements 流水、再同步 warehouse_stock 数量/金额（同一事务，防漂移）
 *  - 复式记账凭证 finance_vouchers + voucher_entries：按记账规则模板自动生成（源单幂等），
 *    借贷不平衡禁止落账/禁止审核（阈值 0.0001 万元）
 *  - 记账规则：采购入库 借1405库存商品/贷2202应付暂估；应付付款 借2202/贷1002；
 *    销售发货 借1122应收/贷6001收入；销售出库结转 借6401成本/贷1405；回款 借1002/贷1122；
 *    盘盈 借1405/贷6301，盘亏 借6711/贷1405；折旧计提 借6602管理费用-折旧/贷1602累计折旧
 *  - 库存调整（盘点）必须走审批，审批通过才入账并生成凭证；低库存按预警线自动给补货建议并可转采购申请
 *  - 固定资产按月直线法折旧：月折旧 = 原值(元)×(1-残值率)/年限/12，同资产同期间幂等，末月提足为止
 * 数据表：warehouse_stock / stock_movements / stock_adjustments / finance_vouchers / voucher_entries /
 *        asset_registrations / fixed_dep_records / petty_funds（009 迁移建立）
 *
 * 与参考项目的差异（受当前项目库表约束，逐处注明）：
 *  1) 009 迁移的 warehouse_stock 无 min_stock 列 → 预警线存放 kv_store（key=bizflow:warn_lines，默认 5，
 *     与参考项目 `min_stock == null ? 5 : min_stock` 的默认值一致）；补货建议与低库存判定口径不变。
 *  2) 参考项目固定资产用 fixed_assets（含 dep_life_years/dep_salvage_rate/dep_start/dep_acc/dep_status），
 *     当前项目该表为另一套遗留结构 → 改用 asset_registrations 作为资产卡片，折旧参数存 kv_store
 *     （key=bizflow:dep_params，默认 5 年 / 残值率 5% / 起提月=登记月），累计折旧由 fixed_dep_records 汇总派生。
 *  3) 参考项目审批用 lib.createApproval → 改用当前项目 approvals + approval_steps（与 qual.controller 一致）。
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, empId } = require('../utils/resp');
const audit = require('../utils/audit');

/* ==================== 常量（对齐参考项目 accounting.js） ==================== */
/** 出入库移动类型（+ 入库 / - 出库） */
const MOVE_TYPES = ['采购入库', '销售出库', '采购退货', '销售退货', '调拨出库', '调拨入库', '盘点调整', '期初入库'];
/** 直接登记（手工）可用的移动类型：调拨/盘点由专用接口处理 */
const MANUAL_MOVE_TYPES = ['采购入库', '销售出库', '采购退货', '销售退货', '期初入库'];
/** 凭证状态 */
const VZ_STATUS = ['待审核', '已审核'];
/** 库存调整状态 */
const ADJ_STATUS = ['审批中', '已生效', '驳回'];
/** 折旧/资产 */
const ASSET_STATUS = ['审批中', '通过', '驳回'];
const DEP_STATUS = ['待审核', '已审核'];
const ASSET_CATEGORIES = ['电子设备', '办公家具', '医疗器械', '交通工具', '仪器仪表', '其他'];
const DEFAULT_DEP_YEARS = 5;
const DEFAULT_SALVAGE = 0.05;
/** 默认预警线（对齐参考项目 min_stock 缺省 5） */
const DEFAULT_WARN = 5;

/** 自动凭证记账规则模板（借 → 贷；单位=万元，与业务单据一致；对齐参考 VZ_RULES） */
const VZ_RULES = {
  采购入库: { d: ['1405', '库存商品'], c: ['2202', '应付账款-暂估'], summary: '采购入库暂估入账' },
  应付付款: { d: ['2202', '应付账款'], c: ['1002', '银行存款'], summary: '支付供应商货款' },
  销售发货: { d: ['1122', '应收账款'], c: ['6001', '主营业务收入'], summary: '经销商发货确认收入' },
  合同验收: { d: ['1122', '应收账款'], c: ['6001', '主营业务收入'], summary: '合同验收确认收入' },
  销售成本: { d: ['6401', '主营业务成本'], c: ['1405', '库存商品'], summary: '销售出库结转成本' },
  销售出库: { d: ['6401', '主营业务成本'], c: ['1405', '库存商品'], summary: '销售出库结转成本' },
  采购退货: { d: ['2202', '应付账款'], c: ['1405', '库存商品'], summary: '采购退货红冲暂估' },
  销售退货: { d: ['1405', '库存商品'], c: ['6401', '主营业务成本'], summary: '销售退货冲回成本' },
  回款: { d: ['1002', '银行存款'], c: ['1122', '应收账款'], summary: '收到客户回款' },
  折旧计提: { d: ['6602', '管理费用-折旧'], c: ['1602', '累计折旧'], summary: '固定资产月度折旧' },
  库存调整: {
    gain: { d: ['1405', '库存商品'], c: ['6301', '营业外收入'], summary: '库存盘盈调整' },
    loss: { d: ['6711', '营业外支出'], c: ['1405', '库存商品'], summary: '库存盘亏调整' },
  },
};
/** 支出类型 → 借方科目（贷方统一银行存款；对齐参考 PAYOUT_ACCOUNT） */
const PAYOUT_ACCOUNT = {
  员工报销付款: ['6601', '管理费用-员工报销'], 采购付款: ['2202', '应付账款'], 市场推广费用: ['6601', '销售费用-市场推广'],
  工资薪酬: ['2211', '应付职工薪酬'], 税费: ['2221', '应交税费'], 固定开支: ['6602', '管理费用-固定开支'],
  物流仓储费: ['6601', '销售费用-物流仓储'], 售后服务费: ['6601', '销售费用-售后服务'], 其他支出: ['6602', '管理费用-其他'],
};
const ACC_NAMES = {
  1405: '库存商品', 2202: '应付账款', 1002: '银行存款', 1122: '应收账款', 6001: '主营业务收入',
  6401: '主营业务成本', 6601: '销售费用', 6602: '管理费用', 2211: '应付职工薪酬', 2221: '应交税费',
  6301: '营业外收入', 6711: '营业外支出', 1602: '累计折旧',
};
/** 财务/管理层：凭证审核、折旧计提、资产审批、库存调整审批、转采购申请 */
const FIN_ROLES = ['超级管理员', '总经理', '副总'];

/* ==================== 工具函数 ==================== */
const money = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
const fmt2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const now = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};
const today = () => now().slice(0, 10);
const curPeriod = () => now().slice(0, 7);
const genNo = (p) => p + now().replace(/[-: ]/g, '').slice(2) + Math.floor(Math.random() * 900 + 100);

/** 财务权限：财务部 + 管理层（对齐参考 requirePerm('bizflow'/'finance',1)） */
const isFinance = (req) => !!req.user && (FIN_ROLES.includes(req.user.role) || req.user.dept === '财务部');

function kvGet(key) {
  const row = db.prepare('SELECT value FROM kv_store WHERE key=?').get(key);
  if (!row || row.value == null) return null;
  try { return JSON.parse(row.value); } catch (e) { return null; }
}
function kvSet(key, obj) {
  const v = JSON.stringify(obj || {});
  const row = db.prepare('SELECT key FROM kv_store WHERE key=?').get(key);
  if (row) db.prepare("UPDATE kv_store SET value=?, updated_at=datetime('now','localtime') WHERE key=?").run(v, key);
  else db.prepare("INSERT INTO kv_store(key,value,updated_at) VALUES(?,?,datetime('now','localtime'))").run(key, v);
}
/** 库存预警线（无 min_stock 列，存 kv，缺省 5） */
const warnLines = () => kvGet('bizflow:warn_lines') || {};
const warnOf = (id) => {
  const v = Number((warnLines())[String(id)]);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_WARN;
};
/** 资产折旧参数（无 dep_* 列，存 kv，缺省 5年/5%） */
const depParams = () => kvGet('bizflow:dep_params') || {};
function depParamOf(asset) {
  const p = (depParams())[String(asset.id)] || {};
  return {
    years: Number(p.years) > 0 ? Number(p.years) : DEFAULT_DEP_YEARS,
    salvage: Number.isFinite(Number(p.salvage)) ? Number(p.salvage) : DEFAULT_SALVAGE,
    start: /^\d{4}-\d{2}$/.test(p.start || '') ? p.start : (asset.purchase_date || asset.created_at || curPeriod()).slice(0, 7),
  };
}

/** 创建审批单 + 审批步骤（对齐 qual.controller 的 createApproval） */
function createApproval(user, type, title, refId, amount, chain) {
  const n = db.prepare('SELECT COUNT(*) c FROM approvals').get().c + 1;
  const approvalNo = 'AP' + now().slice(0, 10).replace(/-/g, '') + String(n).padStart(4, '0');
  const info = db.prepare(`INSERT INTO approvals
    (approval_no,type,title,ref_id,amount,applicant_id,applicant_name,current_step,total_steps,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(approvalNo, type, title, Number(refId) || 0, Number(amount) || 0,
      Number(user.id) || 0, user.name || '', 1, chain.length, '待审批');
  const stepStmt = db.prepare('INSERT INTO approval_steps (approval_id,seq,step_name,approver_name,action) VALUES (?,?,?,?,?)');
  chain.forEach((name, i) => stepStmt.run(info.lastInsertRowid, i + 1, name, name, '待审批'));
  return { id: info.lastInsertRowid, approval_no: approvalNo };
}

/* ==================== 凭证生成（幂等：同一业务源单不重复建） ==================== */
/**
 * 对齐参考项目 createVoucher：借贷平衡校验 + 源单幂等
 * opts: {source_type, source_table, source_id, source_no, summary, biz_date, entries:[{direction,account_code,account_name,amount}], emp, remark}
 */
function createVoucher(opts) {
  if (opts.source_id != null) {
    const dup = db.prepare('SELECT * FROM finance_vouchers WHERE source_type=? AND source_id=?').get(opts.source_type, opts.source_id);
    if (dup) return { exists: true, id: dup.id, voucher_no: dup.voucher_no };
  } else if (opts.source_no) {
    const dup = db.prepare('SELECT * FROM finance_vouchers WHERE source_type=? AND source_no=? AND source_id IS NULL').get(opts.source_type, opts.source_no);
    if (dup) return { exists: true, id: dup.id, voucher_no: dup.voucher_no };
  }
  const entries = (opts.entries || []).filter((e) => (Number(e.amount) || 0) > 0);
  const debit = money(entries.filter((e) => e.direction === '借').reduce((s, e) => s + Number(e.amount), 0));
  const credit = money(entries.filter((e) => e.direction === '贷').reduce((s, e) => s + Number(e.amount), 0));
  if (!entries.length || Math.abs(debit - credit) > 0.0001) throw new Error(`凭证借贷不平衡 借${debit} 贷${credit}`);

  const ts = now();
  const bizDate = opts.biz_date || ts.slice(0, 10);
  const emp = opts.emp || {};
  let voucherNo = null;
  let vid = null;
  for (let i = 0; i < 6; i++) {
    voucherNo = 'VZ' + ts.replace(/[-: ]/g, '').slice(2, 12) + Math.floor(Math.random() * 900 + 100);
    try {
      const info = db.prepare(`INSERT INTO finance_vouchers(voucher_no,period,biz_date,source_type,source_table,source_id,source_no,summary,debit_total,credit_total,status,maker_id,maker_name,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'待审核',?,?,?)`)
        .run(voucherNo, bizDate.slice(0, 7), bizDate, opts.source_type,
          opts.source_table || '', opts.source_id != null ? opts.source_id : null, opts.source_no || '',
          opts.summary || (VZ_RULES[opts.source_type] && VZ_RULES[opts.source_type].summary) || opts.source_type,
          debit, credit, Number(emp.id) || null, emp.name || '系统', ts);
      vid = info.lastInsertRowid;
      break;
    } catch (e) {
      if (i >= 5 || !String(e.message || e).includes('UNIQUE')) throw e;
    }
  }
  const insE = db.prepare('INSERT INTO voucher_entries(voucher_id,seq,direction,account_code,account_name,amount,summary) VALUES(?,?,?,?,?,?,?)');
  entries.forEach((e, i) => insE.run(vid, i + 1, e.direction, e.account_code, e.account_name, money(e.amount), e.summary || ''));
  return { id: vid, voucher_no: voucherNo, debit_total: debit, credit_total: credit };
}

/**
 * 库存变动（+入库 / -出库，加权平均成本；对齐参考项目 stockMove）
 * 调用方必须放在 db.transaction 内，保证流水与库存同步
 */
function stockMove({ move_type, ref_table, ref_id, ref_no, item_name, model, warehouse, unit, qty, unit_cost, amount, emp, biz_date, remark }) {
  if (!item_name || !qty) return null;
  const w = warehouse || '总部仓库';
  const mdl = model || '';
  const un = unit || '件';
  const amt = amount != null ? amount : money((Number(unit_cost) || 0) * qty);
  const cur = db.prepare('SELECT * FROM warehouse_stock WHERE item_name=? AND model=? AND warehouse=?').get(item_name, mdl, w);
  const ts = now();
  let nqty;
  let navg;
  let namt;
  if (cur) {
    nqty = money(Number(cur.qty) + Number(qty));
    namt = money(Number(cur.amount || 0) + Number(amt));
    // 出库后数量归零时成本价归零，避免负数均价漂移；其余情况按加权平均重算
    navg = Math.abs(nqty) < 1e-9 ? 0 : money(namt / nqty);
    db.prepare('UPDATE warehouse_stock SET qty=?, avg_cost=?, amount=?, updated_at=? WHERE id=?').run(nqty, navg, namt, ts, cur.id);
  } else {
    nqty = money(qty);
    namt = money(amt);
    navg = Math.abs(nqty) < 1e-9 ? 0 : money(namt / nqty);
    db.prepare('INSERT INTO warehouse_stock(item_name,model,warehouse,unit,qty,avg_cost,amount,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(item_name, mdl, w, un, nqty, navg, namt, ts);
  }
  let moveNo = null;
  for (let i = 0; i < 6; i++) {
    const no = 'ST' + ts.replace(/[-: ]/g, '').slice(2, 12) + Math.floor(Math.random() * 900 + 100);
    try {
      db.prepare(`INSERT INTO stock_movements(move_no,move_type,ref_table,ref_id,ref_no,item_name,model,warehouse,unit,qty,unit_cost,amount,operator_id,operator_name,biz_date,remark,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(no, move_type, ref_table || '', ref_id != null ? ref_id : null, ref_no || '', item_name, mdl, w, un,
          qty, Number(unit_cost) || 0, amt, Number(emp && emp.id) || null, (emp && emp.name) || '系统',
          biz_date || ts.slice(0, 10), remark || '', ts);
      moveNo = no;
      break;
    } catch (e) {
      if (i >= 5 || !String(e.message || e).includes('UNIQUE')) throw e;
    }
  }
  return { move_no: moveNo, qty: nqty, avg_cost: navg, amount: namt };
}

/** 出入库是否自动生成凭证：有记账规则且调用方未关闭 */
function voucherForMovement(mv, emp, bizDate) {
  const rule = VZ_RULES[mv.move_type];
  if (!rule || !rule.d) return null;
  const amt = Math.abs(Number(mv.amount) || 0);
  if (amt <= 0.0001) return null;
  return createVoucher({
    source_type: mv.move_type,
    source_table: mv.ref_table || 'stock_movements',
    source_id: mv.ref_id != null ? mv.ref_id : null,
    source_no: mv.move_no,
    summary: `${rule.summary} ${mv.item_name} ${Math.abs(mv.qty)}${mv.unit || '件'} ${amt}万元`,
    biz_date: bizDate,
    emp,
    entries: [
      { direction: '借', account_code: rule.d[0], account_name: rule.d[1], amount: amt },
      { direction: '贷', account_code: rule.c[0], account_name: rule.c[1], amount: amt },
    ],
  });
}

/** 库存行：附加预警线与低库存判定（无 min_stock 列，预警线取自 kv） */
function decorateStock(row) {
  const warn = warnOf(row.id);
  const qty = Number(row.qty) || 0;
  return {
    ...row,
    warn_line: warn,
    is_low: qty < warn,
    // 补货建议：补到 2 倍预警线（避免刚补货又触警），单价按当前加权平均成本估算
    suggest_qty: qty < warn ? Math.max(money(warn * 2 - qty), money(warn - qty)) : 0,
    suggest_amount: qty < warn ? fmt2(Math.max(warn * 2 - qty, 0) * (Number(row.avg_cost) || 0)) : 0,
  };
}

/** 资产卡片：附加折旧参数 / 累计折旧 / 净值（累计折旧由 fixed_dep_records 汇总派生） */
function decorateAsset(a) {
  const p = depParamOf(a);
  const originalWan = money((Number(a.purchase_price) || 0) / 10000);
  const accWan = money(db.prepare('SELECT COALESCE(SUM(dep_amount),0) v FROM fixed_dep_records WHERE asset_id=?').get(a.id).v);
  const monthlyWan = money((Number(a.purchase_price) || 0) * (1 - p.salvage) / p.years / 12 / 10000);
  const netWan = money(originalWan - accWan);
  return {
    ...a,
    purchase_wan: originalWan,
    dep_life_years: p.years,
    dep_salvage_rate: p.salvage,
    dep_start: p.start,
    monthly_dep_wan: monthlyWan,
    acc_dep_wan: accWan,
    net_wan: netWan,
    dep_months: db.prepare('SELECT COUNT(*) c FROM fixed_dep_records WHERE asset_id=?').get(a.id).c,
    dep_status: netWan <= 0.0005 ? '已提完' : (accWan > 0 ? '计提中' : '未计提'),
  };
}

/* ==================== 元信息 / 统计 ==================== */
async function meta(req, res) {
  return res.json(ok({
    move_types: MOVE_TYPES,
    manual_move_types: MANUAL_MOVE_TYPES,
    voucher_status: VZ_STATUS,
    adj_status: ADJ_STATUS,
    asset_status: ASSET_STATUS,
    asset_categories: ASSET_CATEGORIES,
    default_warn_line: DEFAULT_WARN,
    default_dep_years: DEFAULT_DEP_YEARS,
    default_salvage: DEFAULT_SALVAGE,
    rules: VZ_RULES,
    payout_accounts: PAYOUT_ACCOUNT,
    account_names: ACC_NAMES,
  }));
}

async function stats(req, res) {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : curPeriod();
  const stock = db.prepare('SELECT COUNT(*) items, COALESCE(SUM(qty),0) qty, COALESCE(SUM(amount),0) amount FROM warehouse_stock').get();
  const all = db.prepare('SELECT * FROM warehouse_stock').all().map(decorateStock);
  const low = all.filter((x) => x.is_low);
  const vz = db.prepare('SELECT COUNT(*) n FROM finance_vouchers').get().n;
  const vzPending = db.prepare("SELECT COUNT(*) n FROM finance_vouchers WHERE status='待审核'").get().n;
  const vzMonth = db.prepare('SELECT COALESCE(SUM(debit_total),0) amount FROM finance_vouchers WHERE period=?').get(month).amount;
  const movMonth = db.prepare('SELECT COUNT(*) n FROM stock_movements WHERE substr(biz_date,1,7)=?').get(month).n;
  const adjPending = db.prepare("SELECT COUNT(*) n FROM stock_adjustments WHERE status='审批中'").get().n;
  const ar = db.prepare("SELECT COALESCE(SUM(total_amount-received_amount),0) v FROM ar_ledgers WHERE status!='已结清'").get().v;
  const ap = db.prepare("SELECT COALESCE(SUM(total_amount-paid_amount),0) v FROM ap_ledgers WHERE status!='已支付'").get().v;
  const assets = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(purchase_price),0) v FROM asset_registrations WHERE status='通过'").get();
  const depAcc = db.prepare('SELECT COALESCE(SUM(dep_amount),0) v FROM fixed_dep_records').get().v;
  const petty = db.prepare("SELECT COALESCE(SUM(amount-COALESCE(used_amount,0)),0) v FROM petty_funds WHERE status IN ('审批中','待放款','使用中','待核销')").get().v;
  return res.json(ok({
    month,
    stock_items: stock.items,
    stock_qty: fmt2(stock.qty),
    stock_amount: fmt2(stock.amount),
    low_count: low.length,
    low_amount: fmt2(low.reduce((s, x) => s + Number(x.amount || 0), 0)),
    movements_month: movMonth,
    vouchers: vz,
    vouchers_pending: vzPending,
    vouchers_month_amount: fmt2(vzMonth),
    adjustments_pending: adjPending,
    ar_balance: fmt2(ar),
    ap_balance: fmt2(ap),
    assets: assets.n,
    assets_original_wan: fmt2((assets.v || 0) / 10000),
    dep_acc_wan: fmt2(depAcc),
    petty_outstanding: fmt2(petty),
  }));
}

/* ==================== 库存台账 ==================== */
async function stockList(req, res) {
  const { q, warehouse } = req.query;
  let sql = 'SELECT * FROM warehouse_stock WHERE 1=1';
  const p = [];
  if (q) { sql += ' AND (item_name LIKE ? OR model LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  if (warehouse) { sql += ' AND warehouse=?'; p.push(warehouse); }
  sql += ' ORDER BY item_name, warehouse';
  let rows = db.prepare(sql).all(...p).map(decorateStock);
  if (req.query.low === '1') rows = rows.filter((x) => x.is_low);
  const total = db.prepare('SELECT COUNT(*) items, COALESCE(SUM(qty),0) qty, COALESCE(SUM(amount),0) amount FROM warehouse_stock').get();
  return res.json(ok({
    rows,
    total: { items: total.items, qty: fmt2(total.qty), amount: fmt2(total.amount) },
    warehouses: db.prepare('SELECT DISTINCT warehouse FROM warehouse_stock ORDER BY warehouse').all().map((x) => x.warehouse),
  }));
}

/** 设置库存预警线（对齐参考 PUT /stock/:id/min，无 min_stock 列改存 kv） */
async function setWarnLine(req, res) {
  const st = db.prepare('SELECT * FROM warehouse_stock WHERE id=?').get(req.params.id);
  if (!st) return res.json(notfound('库存记录不存在'));
  const v = Number((req.body || {}).warn_line);
  if (!(v >= 0)) return res.json(bad('预警线须 ≥ 0'));
  const m = warnLines();
  m[String(st.id)] = v;
  kvSet('bizflow:warn_lines', m);
  audit('BIZFLOW_SET_WARN', req.userId, st.item_name, `${st.item_name}(${st.model || '-'}@${st.warehouse}) 预警线 ${warnOf(st.id)} → ${v}`);
  return res.json(ok({ warn_line: v }, '预警线已更新'));
}

/* ==================== 出入库流水 ==================== */
async function movements(req, res) {
  const { move_type, item, warehouse } = req.query;
  let sql = 'SELECT * FROM stock_movements WHERE 1=1';
  const p = [];
  if (move_type) { sql += ' AND move_type=?'; p.push(move_type); }
  if (item) { sql += ' AND item_name=?'; p.push(item); }
  if (warehouse) { sql += ' AND warehouse=?'; p.push(warehouse); }
  if (/^\d{4}-\d{2}$/.test(req.query.month || '')) { sql += ' AND substr(biz_date,1,7)=?'; p.push(req.query.month); }
  sql += ' ORDER BY id DESC LIMIT 300';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/**
 * 手工出入库登记（对齐参考项目 stockMove 的加权平均口径）
 * 入库：按金额/数量滚动加权平均成本；出库：按当前加权平均成本结转，库存不足直接拒绝
 */
async function createMovement(req, res) {
  const b = req.body || {};
  const move_type = b.move_type;
  if (!MANUAL_MOVE_TYPES.includes(move_type)) return res.json(bad(`移动类型须为 ${MANUAL_MOVE_TYPES.join('/')}（调拨/盘点请用专用入口）`));
  if (!b.item_name) return res.json(bad('物料名称必填'));
  const qty = Number(b.qty);
  if (!(qty > 0)) return res.json(bad('数量须大于 0'));
  const warehouse = b.warehouse || '总部仓库';
  const isOut = ['销售出库', '采购退货'].includes(move_type);
  const signedQty = isOut ? -qty : qty;

  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  const bizDate = b.biz_date || today();
  try {
    const result = db.transaction(() => {
      const cur = db.prepare('SELECT * FROM warehouse_stock WHERE item_name=? AND model=? AND warehouse=?')
        .get(b.item_name, b.model || '', warehouse);
      if (isOut) {
        const curQty = cur ? Number(cur.qty) : 0;
        if (curQty < qty - 0.0001) {
          throw new Error(`库存不足：${b.item_name}@${warehouse} 当前 ${curQty}${cur ? cur.unit || '件' : '件'}，无法出库 ${qty}`);
        }
      }
      const unitCost = b.unit_cost != null ? Number(b.unit_cost) : (cur ? Number(cur.avg_cost) : 0);
      let amount = b.amount != null && Number(b.amount) > 0 ? Number(b.amount) : money(unitCost * qty);
      if (isOut) amount = -Math.abs(amount);
      const mv = stockMove({
        move_type, ref_table: b.ref_table || '', ref_id: b.ref_id != null ? b.ref_id : null,
        ref_no: b.ref_no || '', item_name: b.item_name, model: b.model || '', warehouse, unit: b.unit || (cur ? cur.unit : '件') || '件',
        qty: signedQty, unit_cost: unitCost, amount, emp, biz_date: bizDate, remark: b.remark || '',
      });
      if (!mv) throw new Error('库存变动失败');
      const vz = (b.voucher === false || b.voucher === '0') ? null : voucherForMovement(
        { ...mv, move_type, ref_table: b.ref_table || '', ref_id: b.ref_id != null ? b.ref_id : null, ref_no: b.ref_no || '', item_name: b.item_name, unit: b.unit || '件', qty: signedQty, amount },
        emp, bizDate
      );
      return { mv, vz };
    })();
    audit('BIZFLOW_STOCK_MOVE', req.userId, b.item_name, `${move_type} ${b.item_name} ${signedQty}${b.unit || '件'} @${warehouse}${result.vz ? '，凭证' + (result.vz.voucher_no || '') : ''}`);
    return res.json(ok({ move_no: result.mv.move_no, qty: result.mv.qty, avg_cost: result.mv.avg_cost, voucher_no: result.vz && result.vz.voucher_no }, `已登记${move_type}流水`));
  } catch (e) {
    return res.json(bad(e.message || '出入库登记失败'));
  }
}

/** 仓库调拨：一出一入两条流水，同一事务（对齐参考「调拨后必须同步更新库存数量」） */
async function transfer(req, res) {
  const b = req.body || {};
  if (!b.item_name) return res.json(bad('物料名称必填'));
  const qty = Number(b.qty);
  if (!(qty > 0)) return res.json(bad('调拨数量须大于 0'));
  const from = b.from_warehouse;
  const to = b.to_warehouse;
  if (!from || !to) return res.json(bad('调出仓库与调入仓库均必填'));
  if (from === to) return res.json(bad('调出与调入仓库不能相同'));
  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  const bizDate = b.biz_date || today();
  try {
    const result = db.transaction(() => {
      const src = db.prepare('SELECT * FROM warehouse_stock WHERE item_name=? AND model=? AND warehouse=?').get(b.item_name, b.model || '', from);
      const curQty = src ? Number(src.qty) : 0;
      if (curQty < qty - 0.0001) throw new Error(`调出仓库库存不足：${b.item_name}@${from} 当前 ${curQty}${src ? src.unit || '件' : '件'}`);
      const unitCost = src ? Number(src.avg_cost) : 0;
      const amt = money(unitCost * qty);
      const out = stockMove({
        move_type: '调拨出库', ref_table: 'warehouse_stock', ref_id: src ? src.id : null, ref_no: b.ref_no || '',
        item_name: b.item_name, model: b.model || '', warehouse: from, unit: (src && src.unit) || '件',
        qty: -qty, unit_cost: unitCost, amount: -amt, emp, biz_date: bizDate, remark: `调往 ${to}｜${b.remark || ''}`,
      });
      const inn = stockMove({
        move_type: '调拨入库', ref_table: 'warehouse_stock', ref_id: src ? src.id : null, ref_no: b.ref_no || '',
        item_name: b.item_name, model: b.model || '', warehouse: to, unit: (src && src.unit) || '件',
        qty, unit_cost: unitCost, amount: amt, emp, biz_date: bizDate, remark: `由 ${from} 调入｜${b.remark || ''}`,
      });
      return { out, inn, amt };
    })();
    audit('BIZFLOW_TRANSFER', req.userId, b.item_name, `${b.item_name} ${qty} 由 ${from} 调往 ${to}（${result.amt}万元）`);
    return res.json(ok({ out_no: result.out.move_no, in_no: result.inn.move_no, amount: result.amt }, '调拨已完成，双方库存已同步'));
  } catch (e) {
    return res.json(bad(e.message || '调拨失败'));
  }
}

/* ==================== 库存调整（盘点，审批后生效） ==================== */
async function adjustments(req, res) {
  const { status } = req.query;
  let sql = 'SELECT * FROM stock_adjustments WHERE 1=1';
  const p = [];
  if (status) { sql += ' AND status=?'; p.push(status); }
  sql += ' ORDER BY id DESC';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/** 提交盘点调整：生成调整单 + 审批链（对齐参考 POST /stock/adjust） */
async function createAdjustment(req, res) {
  const b = req.body || {};
  const st = b.stock_id
    ? db.prepare('SELECT * FROM warehouse_stock WHERE id=?').get(b.stock_id)
    : (b.item_name ? db.prepare('SELECT * FROM warehouse_stock WHERE item_name=? AND model=? AND warehouse=?').get(b.item_name, b.model || '', b.warehouse || '总部仓库') : null);
  if (!st) return res.json(notfound('未找到对应库存记录'));
  const newQty = Number(b.new_qty);
  if (!(newQty >= 0)) return res.json(bad('盘点数量不合法'));
  const diff = money(newQty - Number(st.qty || 0));
  if (Math.abs(diff) < 1e-9) return res.json(bad('数量无变化，无需调整'));
  const amt = money(diff * (Number(st.avg_cost) || 0));
  const no = 'SA' + now().replace(/[-: ]/g, '').slice(0, 14) + Math.floor(Math.random() * 900 + 100);
  try {
    const out = db.transaction(() => {
      const info = db.prepare(`INSERT INTO stock_adjustments(adj_no,stock_id,item_name,model,warehouse,unit,old_qty,new_qty,diff,amount,avg_cost,reason,status,created_by,created_name,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'审批中',?,?,?)`)
        .run(no, st.id, st.item_name, st.model || '', st.warehouse, st.unit || '件', Number(st.qty || 0), newQty, diff, amt,
          Number(st.avg_cost) || 0, b.reason || '盘点调整', empId(req) || null, (req.user && req.user.name) || '', now());
      const ap = createApproval(req.user, '库存调整审批',
        `库存调整：${st.item_name} ${st.qty}→${newQty}（${diff > 0 ? '盘盈' : '盘亏'}${Math.abs(diff)}${st.unit || ''}）`,
        info.lastInsertRowid, Math.abs(amt), ['财务部', '总经理']);
      db.prepare('UPDATE stock_adjustments SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
      return { id: info.lastInsertRowid, ap };
    })();
    audit('BIZFLOW_ADJUST_SUBMIT', req.userId, st.item_name, `${st.item_name} ${st.qty}→${newQty}（差异${diff > 0 ? '+' : ''}${diff}，金额${amt}万元），审批 ${out.ap.approval_no}`);
    return res.json(ok({ adj_no: no, approval_no: out.ap.approval_no }, '库存调整已提交审批，通过后自动入账并生成凭证'));
  } catch (e) {
    return res.json(bad(e.message || '提交失败'));
  }
}

/** 库存调整审批：通过 → 库存同步到盘点数量 + 写流水 + 生成盘盈/盘亏凭证（对齐参考 #304 闭环） */
async function approveAdjustment(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可审批库存调整'));
  const { action } = req.body || {};
  const row = db.prepare('SELECT * FROM stock_adjustments WHERE id=?').get(req.params.id);
  if (!row) return res.json(notfound('调整单不存在'));
  if (row.status !== '审批中') return res.json(bad(`当前状态[${row.status}]不可审批`));

  if (action === 'reject') {
    db.prepare("UPDATE stock_adjustments SET status='驳回' WHERE id=?").run(row.id);
    if (row.approval_id) db.prepare("UPDATE approvals SET status='驳回', finished_at=? WHERE id=?").run(now(), row.approval_id);
    audit('BIZFLOW_ADJUST_REJECT', req.userId, row.adj_no, `库存调整 ${row.adj_no} 驳回`);
    return res.json(ok(null, '已驳回'));
  }
  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  const bizDate = today();
  try {
    const out = db.transaction(() => {
      const st = db.prepare('SELECT * FROM warehouse_stock WHERE id=?').get(row.stock_id);
      if (!st) throw new Error('关联库存记录不存在');
      const diffQty = money(Number(row.new_qty) - Number(st.qty || 0));
      const diffAmt = money(diffQty * (Number(st.avg_cost) || 0));
      const mv = stockMove({
        move_type: '盘点调整', ref_table: 'stock_adjustments', ref_id: row.id, ref_no: row.adj_no,
        item_name: row.item_name, model: row.model || '', warehouse: row.warehouse, unit: row.unit || '件',
        qty: diffQty, unit_cost: Number(st.avg_cost) || 0, amount: diffAmt, emp, biz_date: bizDate,
        remark: `盘点调整 ${row.old_qty}→${row.new_qty}（${row.reason || ''}）`,
      });
      let vz = null;
      const rule = diffQty > 0 ? VZ_RULES['库存调整'].gain : VZ_RULES['库存调整'].loss;
      const amt = Math.abs(diffAmt);
      if (amt > 0.0001) {
        vz = createVoucher({
          source_type: '库存调整', source_table: 'stock_adjustments', source_id: row.id, source_no: row.adj_no,
          summary: `${rule.summary} ${row.item_name} ${Math.abs(diffQty)}${row.unit || '件'} ${amt}万元`,
          biz_date: bizDate, emp,
          entries: [
            { direction: '借', account_code: rule.d[0], account_name: rule.d[1], amount: amt },
            { direction: '贷', account_code: rule.c[0], account_name: rule.c[1], amount: amt },
          ],
        });
      }
      db.prepare("UPDATE stock_adjustments SET status='已生效', amount=?, diff=? WHERE id=?").run(diffAmt, diffQty, row.id);
      if (row.approval_id) db.prepare("UPDATE approvals SET status='通过', finished_at=? WHERE id=?").run(now(), row.approval_id);
      return { mv, vz, diffQty, diffAmt };
    })();
    audit('BIZFLOW_ADJUST_APPROVE', req.userId, row.adj_no, `库存调整 ${row.adj_no} 生效：${row.item_name} ${row.old_qty}→${row.new_qty}（${out.diffQty}），凭证${(out.vz && out.vz.voucher_no) || '无'}`);
    return res.json(ok({ move_no: out.mv && out.mv.move_no, voucher_no: out.vz && out.vz.voucher_no }, '调整已生效，库存与凭证已同步'));
  } catch (e) {
    return res.json(bad(e.message || '审批失败'));
  }
}

/* ==================== 记账凭证 ==================== */
async function vouchers(req, res) {
  const { period, source_type, status, q } = req.query;
  let sql = 'SELECT v.*, (SELECT COUNT(*) FROM voucher_entries e WHERE e.voucher_id=v.id) entries FROM finance_vouchers v WHERE 1=1';
  const p = [];
  if (period) { sql += ' AND v.period=?'; p.push(period); }
  if (source_type) { sql += ' AND v.source_type=?'; p.push(source_type); }
  if (status) { sql += ' AND v.status=?'; p.push(status); }
  if (q) { sql += ' AND (v.source_no LIKE ? OR v.summary LIKE ? OR v.voucher_no LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY v.id DESC LIMIT 500';
  const rows = db.prepare(sql).all(...p);
  let sumSql = 'SELECT status, COUNT(*) n, COALESCE(SUM(debit_total),0) amount FROM finance_vouchers WHERE 1=1';
  const sp = [];
  if (period) { sumSql += ' AND period=?'; sp.push(period); }
  const sums = db.prepare(sumSql + ' GROUP BY status').all(...sp);
  return res.json(ok({ rows, sums }));
}

async function voucherDetail(req, res) {
  const v = db.prepare('SELECT * FROM finance_vouchers WHERE id=?').get(req.params.id);
  if (!v) return res.json(notfound('凭证不存在'));
  const entries = db.prepare('SELECT * FROM voucher_entries WHERE voucher_id=? ORDER BY seq').all(v.id);
  return res.json(ok({ ...v, entries, balanced: Math.abs((v.debit_total || 0) - (v.credit_total || 0)) < 0.0001 }));
}

/** 凭证审核：借贷必须平衡（对齐参考 POST /vouchers/:id/verify） */
async function verifyVoucher(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可审核凭证'));
  const v = db.prepare('SELECT * FROM finance_vouchers WHERE id=?').get(req.params.id);
  if (!v) return res.json(notfound('凭证不存在'));
  if (v.status === '已审核') return res.json(bad('凭证已审核'));
  const d = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM voucher_entries WHERE voucher_id=? AND direction='借'").get(v.id).v;
  const c = db.prepare("SELECT COALESCE(SUM(amount),0) v FROM voucher_entries WHERE voucher_id=? AND direction='贷'").get(v.id).v;
  if (Math.abs(d - c) > 0.0001) return res.json(bad(`借贷不平衡（借${d} 贷${c}），禁止审核`));
  db.prepare("UPDATE finance_vouchers SET status='已审核', auditor_id=?, auditor_name=?, audited_at=? WHERE id=?")
    .run(empId(req) || null, (req.user && req.user.name) || '', now(), v.id);
  audit('BIZFLOW_VOUCHER_VERIFY', req.userId, v.voucher_no, `凭证 ${v.voucher_no}（${v.source_type} ${v.source_no || ''}）已审核`);
  return res.json(ok({ voucher_no: v.voucher_no }, '凭证已审核'));
}

/** 手工制单：分录借贷必须平衡（补充自动凭证未覆盖的业务） */
async function createVoucherManually(req, res) {
  const b = req.body || {};
  const entries = Array.isArray(b.entries) ? b.entries : [];
  if (!b.source_type) return res.json(bad('业务类型必填'));
  if (entries.length < 2) return res.json(bad('至少两行分录（一借一贷）'));
  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  try {
    const vz = db.transaction(() => createVoucher({
      source_type: b.source_type, source_table: b.source_table || '', source_id: null,
      source_no: b.source_no || genNo('SN'), summary: b.summary || '', biz_date: b.biz_date || today(), emp,
      entries: entries.map((e) => ({
        direction: e.direction, account_code: e.account_code || '',
        account_name: e.account_name || ACC_NAMES[e.account_code] || '', amount: Number(e.amount) || 0, summary: e.summary || '',
      })),
    }))();
    audit('BIZFLOW_VOUCHER_CREATE', req.userId, vz.voucher_no, `手工制单 ${vz.voucher_no}（${b.source_type}）`);
    return res.json(ok({ voucher_no: vz.voucher_no, id: vz.id }, '凭证已生成'));
  } catch (e) {
    return res.json(bad(e.message || '制单失败'));
  }
}

/* ==================== 低库存预警 / 补货 ==================== */
async function lowStock(req, res) {
  const rows = db.prepare('SELECT * FROM warehouse_stock ORDER BY item_name, warehouse').all().map(decorateStock);
  const low = rows.filter((x) => x.is_low).sort((a, b) => Number(a.qty) - Number(b.qty));
  return res.json(ok({
    low,
    rows,
    total_suggest_amount: fmt2(low.reduce((s, x) => s + Number(x.suggest_amount || 0), 0)),
  }));
}

/** 低库存一键转采购申请（对齐参考 POST /stock-warn/to-pr，每行生成一条采购申请并走采购审批） */
async function lowStockToPr(req, res) {
  const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
  if (!items.length) return res.json(bad('请选择需要补货的库存项'));
  const user = req.user || {};
  try {
    const created = db.transaction(() => {
      const out = [];
      for (const it of items) {
        const st = it.stock_id ? db.prepare('SELECT * FROM warehouse_stock WHERE id=?').get(it.stock_id) : null;
        if (!st) continue;
        const qty = Number(it.qty) || 0;
        const amount = Number(it.amount);
        if (qty <= 0 || !(amount > 0)) throw new Error(`「${st.item_name}」补货数量与预估金额（万元）须大于0`);
        const no = genNo('PR');
        const info = db.prepare(`INSERT INTO purchase_requests(pr_no,applicant_id,applicant_name,dept,supplier_id,supplier_name,category,item_name,spec,qty,unit,amount,need_date,purpose,budget_type,status)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'待审批')`)
          .run(no, Number(user.id) || 0, user.name || '', user.dept || '', null, '', '库存补货', st.item_name, st.model || '',
            qty, st.unit || '件', amount, '', `安全库存预警自动补货（当前${st.qty}${st.unit || '件'} ≤ 预警线${warnOf(st.id)}）`, '采购预算');
        const ap = createApproval(user, '采购审批', `库存补货：${st.item_name} ${amount}万元（低库存预警）`, info.lastInsertRowid, amount, ['采购部', '财务部', '总经理']);
        db.prepare('UPDATE purchase_requests SET approval_id=?, approval_no=? WHERE id=?').run(ap.id, ap.approval_no, info.lastInsertRowid);
        out.push({ pr_no: no, item_name: st.item_name, approval_no: ap.approval_no });
      }
      return out;
    })();
    audit('BIZFLOW_LOW_STOCK_PR', req.userId, '低库存补货', `生成补货申请 ${created.length} 条：${created.map((x) => x.pr_no).join(',')}`);
    return res.json(ok({ count: created.length, created }, `已生成 ${created.length} 条补货采购申请`));
  } catch (e) {
    return res.json(bad(e.message || '转采购申请失败'));
  }
}

/* ==================== 固定资产 + 折旧计提 ==================== */
async function assets(req, res) {
  const { status } = req.query;
  let sql = "SELECT * FROM asset_registrations WHERE 1=1";
  const p = [];
  if (status) { sql += ' AND status=?'; p.push(status); }
  else sql += " AND status='通过'";
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...p).map(decorateAsset);
  return res.json(ok({
    rows,
    total: {
      count: rows.length,
      original_wan: fmt2(rows.reduce((s, x) => s + Number(x.purchase_wan), 0)),
      acc_dep_wan: fmt2(rows.reduce((s, x) => s + Number(x.acc_dep_wan), 0)),
      net_wan: fmt2(rows.reduce((s, x) => s + Number(x.net_wan), 0)),
    },
  }));
}

/** 资产登记：走审批（对齐参考：审批通过写入台账） */
async function createAsset(req, res) {
  const b = req.body || {};
  if (!b.name) return res.json(bad('资产名称必填'));
  const price = Number(b.purchase_price);
  if (!(price > 0)) return res.json(bad('采购原值（元）须大于 0'));
  const no = 'AS' + now().replace(/[-: ]/g, '').slice(2) + Math.floor(Math.random() * 900 + 100);
  try {
    const out = db.transaction(() => {
      const info = db.prepare(`INSERT INTO asset_registrations(asset_no,name,category,brand,model,sn,dept_name,custodian_id,custodian_name,location,purchase_date,purchase_price,applicant_id,applicant_name,status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'审批中')`)
        .run(no, b.name, ASSET_CATEGORIES.includes(b.category) ? b.category : '其他', b.brand || '', b.model || '', b.sn || '',
          b.dept_name || (req.user && req.user.dept) || '', Number(b.custodian_id) || null, b.custodian_name || '',
          b.location || '', b.purchase_date || today(), price, empId(req) || 0, (req.user && req.user.name) || '');
      const ap = createApproval(req.user, '固定资产登记审批', `固定资产登记：${b.name} ${fmt2(price / 10000)}万元`, info.lastInsertRowid, fmt2(price / 10000), ['财务部', '总经理']);
      db.prepare('UPDATE asset_registrations SET approval_id=? WHERE id=?').run(ap.id, info.lastInsertRowid);
      return { id: info.lastInsertRowid, ap };
    })();
    audit('BIZFLOW_ASSET_ADD', req.userId, no, `固定资产登记 ${no} ${b.name} ${price}元，审批 ${out.ap.approval_no}`);
    return res.json(ok({ asset_no: no, approval_no: out.ap.approval_no }, '资产登记已提交审批'));
  } catch (e) {
    return res.json(bad(e.message || '登记失败'));
  }
}

/** 资产审批：通过 → 台账生效；驳回 → 归档留痕 */
async function approveAsset(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可审批资产登记'));
  const { action } = req.body || {};
  const a = db.prepare('SELECT * FROM asset_registrations WHERE id=?').get(req.params.id);
  if (!a) return res.json(notfound('资产登记不存在'));
  if (a.status !== '审批中') return res.json(bad(`当前状态[${a.status}]不可审批`));
  const st = action === 'reject' ? '驳回' : '通过';
  db.prepare('UPDATE asset_registrations SET status=? WHERE id=?').run(st, a.id);
  if (a.approval_id) db.prepare('UPDATE approvals SET status=?, finished_at=? WHERE id=?').run(st === '通过' ? '通过' : '驳回', now(), a.approval_id);
  audit('BIZFLOW_ASSET_APPROVE', req.userId, a.asset_no, `固定资产 ${a.asset_no} ${a.name} 登记${st}`);
  return res.json(ok(null, `资产登记已${st}`));
}

/** 折旧参数维护（对齐参考 PUT /fixed-assets/:id/dep，无 dep_* 列改存 kv） */
async function setDepParams(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可维护折旧参数'));
  const a = db.prepare('SELECT * FROM asset_registrations WHERE id=?').get(req.params.id);
  if (!a) return res.json(notfound('资产不存在'));
  const b = req.body || {};
  const years = Number(b.dep_life_years);
  const salvage = Number(b.dep_salvage_rate);
  if (!(years >= 1 && years <= 50)) return res.json(bad('折旧年限须在 1-50 年之间'));
  if (!(salvage >= 0 && salvage < 1)) return res.json(bad('残值率须为 0~0.95 之间的小数（如 0.05=5%）'));
  const start = /^\d{4}-\d{2}$/.test(b.dep_start || '') ? b.dep_start : depParamOf(a).start;
  const m = depParams();
  m[String(a.id)] = { years, salvage, start };
  kvSet('bizflow:dep_params', m);
  audit('BIZFLOW_DEP_PARAM', req.userId, a.asset_no, `${a.asset_no} ${a.name} 年限${years}年 残值率${salvage} 起提${start}`);
  return res.json(ok({ dep_life_years: years, dep_salvage_rate: salvage, dep_start: start }, '折旧参数已保存'));
}

/**
 * 月度折旧计提（对齐参考 POST /fixed-dep/run）：直线法，资产+期间幂等，末月提足为止，每资产独立折旧凭证
 * 月折旧(元) = 原值 × (1 - 残值率) / 年限 / 12
 */
async function runDepreciation(req, res) {
  if (!isFinance(req)) return res.json(forbidden('仅财务/管理层可执行折旧计提'));
  const period = /^\d{4}-\d{2}$/.test((req.body || {}).period || '') ? req.body.period : curPeriod();
  const list = db.prepare("SELECT * FROM asset_registrations WHERE status='通过' ORDER BY id").all();
  const emp = { id: empId(req) || null, name: (req.user && req.user.name) || '系统' };
  let created = 0;
  let skipped = 0;
  const createdList = [];
  const errors = [];
  for (const a of list) {
    try {
      const out = db.transaction(() => {
        const p = depParamOf(a);
        const original = Number(a.purchase_price) || 0; // 元
        if (original <= 0 || p.years <= 0) return { skip: true };
        if (p.start > period) return { skip: true };                     // 未到起提月份
        const accWan = money(db.prepare('SELECT COALESCE(SUM(dep_amount),0) v FROM fixed_dep_records WHERE asset_id=?').get(a.id).v);
        const accYuan = money(accWan * 10000);
        const totalYuan = money(original * (1 - p.salvage));
        const remainYuan = money(totalYuan - accYuan);
        if (remainYuan <= 0.5) return { skip: true };                    // 已提完
        const monthlyYuan = Math.min(money(totalYuan / p.years / 12), remainYuan);
        const depWan = money(monthlyYuan / 10000);
        if (depWan <= 0) return { skip: true };
        const dup = db.prepare('SELECT id FROM fixed_dep_records WHERE asset_id=? AND period=?').get(a.id, period);
        if (dup) return { skip: true, done: true };                        // 幂等
        const info = db.prepare(`INSERT INTO fixed_dep_records(asset_id,asset_no,asset_name,period,dep_amount,acc_dep,net_value,status,operator_id,operator_name)
          VALUES(?,?,?,?,?,?,?,'待审核',?,?)`)
          .run(a.id, a.asset_no, a.name, period, depWan, money(accWan + depWan), money(money(original / 10000) - accWan - depWan),
            empId(req) || null, (req.user && req.user.name) || '');
        const vz = createVoucher({
          source_type: '折旧计提', source_table: 'fixed_dep_records', source_id: info.lastInsertRowid,
          source_no: `${a.asset_no}-${period}`, summary: `固定资产折旧 ${period} ${a.name}（${a.asset_no}）${depWan}万元`,
          biz_date: `${period}-01`, emp,
          entries: [
            { direction: '借', account_code: '6602', account_name: '管理费用-折旧', amount: depWan },
            { direction: '贷', account_code: '1602', account_name: '累计折旧', amount: depWan },
          ],
        });
        db.prepare('UPDATE fixed_dep_records SET voucher_id=? WHERE id=?').run(vz.id, info.lastInsertRowid);
        return { id: info.lastInsertRowid, asset_no: a.asset_no, name: a.name, dep_amount: depWan, voucher_no: vz.voucher_no };
      })();
      if (out && out.skip) { skipped++; continue; }
      created++;
      createdList.push(out);
    } catch (e) {
      errors.push(`${a.asset_no}:${e.message}`);
    }
  }
  audit('BIZFLOW_DEP_RUN', req.userId, period, `${period} 折旧计提：新增 ${created} 条，跳过 ${skipped} 条`);
  return res.json(ok({ period, created, skipped, errors: errors.slice(0, 5), created_list: createdList }, `${period} 折旧计提完成`));
}

async function depRecords(req, res) {
  let sql = 'SELECT fdr.*, v.status voucher_status, v.voucher_no FROM fixed_dep_records fdr LEFT JOIN finance_vouchers v ON fdr.voucher_id=v.id WHERE 1=1';
  const p = [];
  if (req.query.period) { sql += ' AND fdr.period=?'; p.push(req.query.period); }
  if (req.query.asset_id) { sql += ' AND fdr.asset_id=?'; p.push(req.query.asset_id); }
  sql += ' ORDER BY fdr.id DESC LIMIT 500';
  return res.json(ok(db.prepare(sql).all(...p)));
}

/* ==================== 单据流实时共享总览 / 时间线 ==================== */
/** 对齐参考 GET /flow：采购订单 → 采购入库 → 发货/应收 → 回款 → 应付付款 → 费用支出 */
async function flow(req, res) {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : curPeriod();
  const pct = (x) => fmt2(x).toFixed(2);
  const stock = db.prepare('SELECT COUNT(*) items, COALESCE(SUM(qty),0) qty, COALESCE(SUM(amount),0) amount FROM warehouse_stock').get();
  const po = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) amount FROM purchase_orders WHERE substr(order_date,1,7)=?').get(month);
  const rc = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) amount FROM purchase_receipts WHERE substr(receipt_date,1,7)=?').get(month);
  const ship = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount),0) amount FROM dms_orders WHERE status='已发货' AND substr(created_at,1,7)=?").get(month);
  const arM = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(total_amount),0) amount FROM ar_ledgers WHERE substr(created_at,1,7)=?').get(month);
  const payIn = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) amount FROM payments WHERE substr(pay_date,1,7)=?').get(month);
  const payOut = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) amount FROM ap_payments WHERE substr(pay_date,1,7)=?').get(month);
  const exp = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(amount),0) amount FROM finance_payouts WHERE substr(pay_date,1,7)=?').get(month);
  const ar = db.prepare("SELECT COALESCE(SUM(total_amount-received_amount),0) amount FROM ar_ledgers WHERE status!='已结清'").get();
  const ap = db.prepare("SELECT COALESCE(SUM(total_amount-paid_amount),0) amount FROM ap_ledgers WHERE status!='已支付'").get();
  const vz = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(debit_total),0) amount FROM finance_vouchers WHERE period=?').get(month);
  const vzV = db.prepare("SELECT COUNT(*) n FROM finance_vouchers WHERE period=? AND status='已审核'").get(month);
  return res.json(ok({
    month,
    chain: [
      { step: '采购订单', count: po.n, amount: pct(po.amount) },
      { step: '采购入库(→库存)', count: rc.n, amount: pct(rc.amount) },
      { step: '经销商发货(→应收)', count: ship.n + arM.n, amount: pct(Number(ship.amount) + Number(arM.amount)) },
      { step: '回款到账', count: payIn.n, amount: pct(payIn.amount) },
      { step: '应付付款', count: payOut.n, amount: pct(payOut.amount) },
      { step: '费用支出', count: exp.n, amount: pct(exp.amount) },
    ],
    kpi: {
      stock_items: stock.items, stock_qty: pct(stock.qty), stock_amount: pct(stock.amount),
      ar_balance: pct(ar.amount), ap_balance: pct(ap.amount),
      vouchers: vz.n, voucher_amount: pct(vz.amount), vouchers_verified: vzV.n,
    },
  }));
}

/** 单据流时间线：一个业务单号从入库 → 应付 → 付款（或 发货 → 应收 → 回款）的全链路追踪 */
async function trace(req, res) {
  const no = String(req.query.no || '').trim();
  if (!no) return res.json(ok({ no: '', timeline: [] }));
  const tl = [];
  const push = (date, node, title, amount, status, extra) => tl.push({
    date: date || '', node, title, amount: amount != null ? fmt2(amount) : null, status: status || '', extra: extra || '',
  });
  db.prepare('SELECT * FROM purchase_orders WHERE po_no=?').all(no).forEach((x) => push(x.order_date, '采购订单', `${x.po_no} ${x.item_name}`, x.amount, x.status, x.supplier_name));
  db.prepare('SELECT * FROM purchase_receipts WHERE rc_no=? OR po_no=?').all(no, no).forEach((x) => push(x.receipt_date, '采购入库', `${x.rc_no} 入库 ${x.item_name} ${x.qty}${x.unit || ''}`, x.amount, x.status, x.warehouse));
  db.prepare('SELECT * FROM stock_movements WHERE ref_no=? OR move_no=?').all(no, no).forEach((x) => push(x.biz_date, '库存流水', `${x.move_type} ${x.item_name} ${x.qty}${x.unit || ''}`, x.amount, '', x.warehouse));
  db.prepare('SELECT * FROM dms_orders WHERE order_no=?').all(no).forEach((x) => push((x.created_at || '').slice(0, 10), '经销商订单', `${x.order_no} ${x.product || ''}`, x.amount, x.status, ''));
  const ars = db.prepare('SELECT * FROM ar_ledgers WHERE ar_no=? OR contract_no=?').all(no, no);
  ars.forEach((x) => push((x.created_at || '').slice(0, 10), '应收台账', `${x.ar_no} ${x.customer_name}`, x.total_amount, x.status, `已回款 ${fmt2(x.received_amount)}`));
  ars.forEach((x) => db.prepare('SELECT * FROM payments WHERE ar_id=?').all(x.id)
    .forEach((p) => push(p.pay_date, '回款到账', `${p.pay_no} ${p.method || ''}`, p.amount, '', `应收 ${x.ar_no}`)));
  const aps = db.prepare('SELECT * FROM ap_ledgers WHERE ap_no=? OR source_no=?').all(no, no);
  aps.forEach((x) => push((x.created_at || '').slice(0, 10), '应付台账', `${x.ap_no} ${x.supplier_name}`, x.total_amount, x.status, `已付 ${fmt2(x.paid_amount)}`));
  aps.forEach((x) => db.prepare('SELECT * FROM ap_payments WHERE ap_id=?').all(x.id)
    .forEach((p) => push(p.pay_date, '应付付款', `${p.ap_no} ${p.method || ''}`, p.amount, '', '')));
  db.prepare('SELECT * FROM finance_vouchers WHERE source_no=? OR voucher_no=?').all(no, no)
    .forEach((x) => push(x.biz_date, '记账凭证', `${x.voucher_no} ${x.summary || x.source_type}`, x.debit_total, x.status, ''));
  db.prepare('SELECT * FROM purchase_invoices WHERE rc_no=? OR po_no=? OR ap_no=?').all(no, no, no)
    .forEach((x) => push(x.invoice_date, '进项发票', `${x.invoice_no} ${x.supplier_name}`, x.amount, x.status, x.deduct_status));
  db.prepare('SELECT * FROM sale_invoices WHERE ar_no=? OR sin_no=?').all(no, no)
    .forEach((x) => push(x.invoice_date, '销项发票', `${x.invoice_no || x.sin_no} ${x.customer_name}`, x.amount, x.status, ''));
  tl.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return res.json(ok({ no, timeline: tl }));
}

// 记账规则说明（参考项目 accounting.js 的 /rules，对齐 /api/accounting/rules）
function rules(req, res) {
  return res.json(ok({
    rules: VZ_RULES,
    payout_accounts: PAYOUT_ACCOUNT,
    account_names: ACC_NAMES,
    note: '业务单据自动生成复式凭证（单位：万元），借贷自动平衡校验，财务审核后归档',
  }));
}

module.exports = {
  meta, stats, rules,
  stockList, setWarnLine,
  movements, createMovement, transfer,
  adjustments, createAdjustment, approveAdjustment,
  vouchers, voucherDetail, verifyVoucher, createVoucherManually,
  lowStock, lowStockToPr,
  assets, createAsset, approveAsset, setDepParams, runDepreciation, depRecords,
  flow, trace,
  // 供 invoicing 等模块复用（对齐参考项目 accounting.js 的导出）
  stockMove, createVoucher, VZ_RULES, PAYOUT_ACCOUNT, ACC_NAMES, money, fmt2, now, today, genNo, isFinance, createApproval,
};
