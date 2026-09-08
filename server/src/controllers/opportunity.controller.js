/**
 * 商机管理控制器（迁移自参考项目 routes/crm.js 的 /opps 段）
 * 对齐参考项目业务逻辑：强制绑定客户与销售、阶段严格顺序推进、赢单率自动换算。
 * 数据表：opportunities / opp_follows（009 迁移建立）
 */
const db = require('../db');
const { ok, bad, notfound, forbidden, buildWhere, empId } = require('../utils/resp');

/** 商机阶段（顺序即流程，参考项目 STAGES） */
const STAGES = ['商机录入', '终端报备', '项目立项', '价格审批', '投标管理', '合同评审', '验收归档', '赢单', '输单'];
/** 阶段 → 赢率 */
const PROB = {
  商机录入: 30, 终端报备: 40, 项目立项: 55, 价格审批: 65,
  投标管理: 70, 合同评审: 90, 验收归档: 95, 赢单: 100, 输单: 0,
};
const SALES_MODES = ['直销', '分销', '代理'];

/** 列表：左连客户/销售/经销商，支持阶段与关键字筛选 */
async function list(req, res) {
  const { stage, keyword, sales_mode, region } = req.query;
  // 注意：当前项目 customers 表用 level 表示等级、owner 是负责人姓名（无 tier / owner_sales_id 列）
  let sql = `SELECT o.*,
      c.name customer_name, c.level customer_tier,
      e.name sales_name, d.name distributor_name
    FROM opportunities o
    LEFT JOIN customers c ON CAST(o.customer_id AS TEXT) = c.id
    LEFT JOIN employees e ON o.sales_id = e.id
    LEFT JOIN distributors d ON o.distributor_id = d.id
    WHERE 1=1`;
  const p = [];
  if (stage) { sql += ' AND o.stage = ?'; p.push(stage); }
  if (sales_mode) { sql += ' AND o.sales_mode = ?'; p.push(sales_mode); }
  if (region) { sql += ' AND o.region = ?'; p.push(region); }
  if (keyword) {
    sql += ' AND (o.name LIKE ? OR o.opp_no LIKE ? OR c.name LIKE ? OR o.terminal LIKE ?)';
    p.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  // 销售岗只看自己负责的商机
  if (req.user && req.userRole === '销售员') {
    sql += ' AND o.sales_id = ?'; p.push(empId(req) || 0);
  }
  sql += ' ORDER BY o.id DESC';
  const rows = db.prepare(sql).all(...p);
  return res.json(ok(rows));
}

/** 统计：总数 / 进行中 / 赢单 / 输单 / 金额 / 阶段分布 */
async function stats(req, res) {
  const total = db.prepare('SELECT COUNT(*) c FROM opportunities').get().c;
  const running = db.prepare("SELECT COUNT(*) c FROM opportunities WHERE stage NOT IN ('赢单','输单')").get().c;
  const won = db.prepare("SELECT COUNT(*) c FROM opportunities WHERE stage='赢单'").get().c;
  const lost = db.prepare("SELECT COUNT(*) c FROM opportunities WHERE stage='输单'").get().c;
  const amountRow = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM opportunities').get();
  const wonAmount = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM opportunities WHERE stage='赢单'").get();
  const funnel = STAGES.map((s) => ({
    stage: s,
    count: db.prepare('SELECT COUNT(*) c FROM opportunities WHERE stage=?').get(s).c,
    amount: db.prepare('SELECT COALESCE(SUM(amount),0) s FROM opportunities WHERE stage=?').get(s).s,
  }));
  return res.json(ok({
    total, running, won, lost,
    win_rate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0,
    amount: Math.round((amountRow.s || 0) * 100) / 100,
    won_amount: Math.round((wonAmount.s || 0) * 100) / 100,
    funnel,
  }));
}

/** 阶段枚举与赢率（前端下拉用，避免硬编码） */
async function stages(req, res) {
  return res.json(ok({ stages: STAGES, probability: PROB, sales_modes: SALES_MODES }));
}

/** 新增：必须绑定客户 + 销售；终端报备须绑定经销商 */
async function create(req, res) {
  const b = req.body || {};
  const { name, customer_id, sales_id, distributor_id, product_line, terminal, amount, expected_date, remark } = b;
  if (!name || !customer_id || !amount) return res.json(bad('商机名称、绑定客户、预计金额必填'));

  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(String(customer_id));
  if (!cust) return res.json(bad('绑定的客户不存在'));

  let sales = sales_id;
  if (!sales) {
    // customers 无 owner_sales_id 列，退回到提交人；都没有则要求调用方显式指定
    sales = cust.submitter_id || null;
    if (!sales) return res.json(bad('商机必须绑定销售（该客户暂无负责销售，请手动指定）'));
  }
  const sales_mode = SALES_MODES.includes(b.sales_mode) ? b.sales_mode : (distributor_id ? '分销' : '直销');

  let stage = '商机录入';
  if (b.stage === '终端报备') {
    if (!distributor_id) return res.json(bad('进入终端报备阶段必须绑定经销商'));
    stage = '终端报备';
  }
  const n = db.prepare('SELECT COUNT(*) c FROM opportunities').get().c + 1;
  const opp_no = 'OPP' + new Date().getFullYear() + String(n).padStart(4, '0');

  const info = db.prepare(`INSERT INTO opportunities
    (opp_no,name,customer_id,sales_id,distributor_id,product_line,terminal,amount,stage,probability,expected_date,region,sales_mode,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(opp_no, name, customer_id, Number(sales) || null, distributor_id || null,
      product_line || '', terminal || '', Number(amount), stage, PROB[stage],
      expected_date || '', b.region || '', sales_mode, req.userId);
  return res.json(ok({ id: info.lastInsertRowid, opp_no, stage }, '商机已创建'));
}

/** 阶段推进：只能顺序前进，或直接输单 */
async function updateStage(req, res) {
  const { stage, note } = req.body || {};
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.json(notfound('商机不存在'));
  if (!STAGES.includes(stage)) return res.json(bad('非法阶段'));

  const cur = STAGES.indexOf(opp.stage);
  const nxt = STAGES.indexOf(stage);
  const isLost = stage === '输单' && cur >= 0;
  if (nxt !== cur + 1 && !isLost) {
    return res.json(bad(`流程只能顺序推进：当前 [${opp.stage}] → 只能进入 [${STAGES[cur + 1] || '终点'}]`));
  }
  if (stage === '终端报备' && !opp.distributor_id) return res.json(bad('终端报备前必须绑定经销商'));

  db.prepare('UPDATE opportunities SET stage=?, probability=? WHERE id=?')
    .run(stage, PROB[stage] || opp.probability, req.params.id);
  if (note) {
    db.prepare('INSERT INTO opp_follows (opp_id, emp_id, content, next_action) VALUES (?,?,?,?)')
      .run(opp.id, empId(req) || null, `【阶段推进】${opp.stage} → ${stage}`, note);
  }
  return res.json(ok({ stage, probability: PROB[stage] }, `已推进至 ${stage}`));
}

/** 跟进记录列表 */
async function follows(req, res) {
  const rows = db.prepare(`SELECT f.*, e.name emp_name
    FROM opp_follows f LEFT JOIN employees e ON f.emp_id = e.id
    WHERE f.opp_id = ? ORDER BY f.id DESC`).all(req.params.id);
  return res.json(ok(rows));
}

/** 新增跟进 */
async function addFollow(req, res) {
  const { content, next_action } = req.body || {};
  if (!content) return res.json(bad('跟进内容必填'));
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.json(notfound('商机不存在'));
  db.prepare('INSERT INTO opp_follows (opp_id, emp_id, content, next_action) VALUES (?,?,?,?)')
    .run(opp.id, empId(req) || null, content, next_action || '');
  return res.json(ok(null, '跟进已记录'));
}

/** 详情 */
async function detail(req, res) {
  const row = db.prepare(`SELECT o.*, c.name customer_name, e.name sales_name, d.name distributor_name
    FROM opportunities o
    LEFT JOIN customers c ON CAST(o.customer_id AS TEXT) = c.id
    LEFT JOIN employees e ON o.sales_id = e.id
    LEFT JOIN distributors d ON o.distributor_id = d.id
    WHERE o.id = ?`).get(req.params.id);
  if (!row) return res.json(notfound('商机不存在'));
  return res.json(ok(row));
}

/** 删除（软删：置为输单，避免历史数据断裂） */
async function remove(req, res) {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.json(notfound('商机不存在'));
  db.prepare("UPDATE opportunities SET stage='输单', probability=0 WHERE id=?").run(opp.id);
  return res.json(ok(null, '商机已关闭（置为输单）'));
}

module.exports = { list, stats, stages, create, updateStage, follows, addFollow, detail, remove, STAGES };
