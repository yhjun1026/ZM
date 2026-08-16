/**
 * 工具函数
 */

// 统一成功响应
function success(res, data, msg) {
  return res.json({ code: 200, msg: msg || 'OK', data });
}

// 统一错误响应
function error(res, code, msg) {
  return res.status(code).json({ code, msg });
}

// 生成ID (随机段碰撞时自动重试, 避免同日同前缀UNIQUE约束冲突)
function genId(prefix) {
  const now = new Date();
  const ymd = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  for (let i = 0; i < 30; i++) {
    const rand = Math.floor(Math.random() * 9000 + 1000); // 4位随机扩大空间
    const id = `${prefix}-${ymd}-${rand}`;
    if (!_idExists(id)) return id;
  }
  // 兜底: 时间戳后缀保证唯一
  return `${prefix}-${ymd}-${Date.now() % 100000}`;
}

// 检查ID是否已在任一含id列的表中存在 (懒加载db避免循环依赖)
function _idExists(id) {
  try {
    const db = require('./database').db;
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
    for (const t of tables) {
      try {
        const cols = db.prepare(`PRAGMA table_info(${t.name})`).all().map(c => c.name);
        if (cols.includes('id')) {
          if (db.prepare(`SELECT 1 FROM ${t.name} WHERE id = ? LIMIT 1`).get(id)) return true;
        }
      } catch (e) { /* 忽略虚拟表等异常 */ }
    }
  } catch (e) { /* db未就绪时跳过检测 */ }
  return false;
}

// 日期格式化
function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 当前日期时间
function now() {
  return new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}

// 安全解析 JSON
function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * 生成审批流程
 * 所有流程在"总经理审批"前均插入"副总审批"步骤
 */
function generateApprovalFlow(type, dept) {
  const nowStr = now();
  if (type === 'purchase') {
    // 市场部采购 — 四级审批流程（含副总审批）
    if (dept === '市场部') {
      return [
        { step: '市场部录入', user: '', time: nowStr, done: true },
        { step: '市场部负责人审批', user: '', time: '—', done: false },
        { step: '销售总监审批', user: '', time: '—', done: false },
        { step: '财务负责人审批', user: '', time: '—', done: false },
        { step: '副总审批', user: '', time: '—', done: false },
        { step: '总经理终审', user: '', time: '—', done: false },
        { step: '采购流程', user: '', time: '—', done: false }
      ];
    }
    // 后勤/财务/技术部 4级精简流程（已含副总审批）
    if (['后勤管理部', '财务部', '技术部'].indexOf(dept) !== -1) {
      return [
        { step: '申请', user: '', time: nowStr, done: true },
        { step: '部门负责人审批', user: '', time: '—', done: false },
        { step: '副总审批', user: '', time: '—', done: false },
        { step: '总经理审批', user: '', time: '—', done: false },
        { step: '采购入库', user: '', time: '—', done: false }
      ];
    }
    // 其他部门 7级完整流程（已含副总审批）
    return [
      { step: '申请', user: '', time: nowStr, done: true },
      { step: '区域负责人审批', user: '', time: '—', done: false },
      { step: '销售总监审批', user: '', time: '—', done: false },
      { step: '市场部负责人审批', user: '', time: '—', done: false },
      { step: '财务负责人审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '采购入库', user: '', time: '—', done: false }
    ];
  }
  if (type === 'document') {
    return [
      { step: '编写', user: '', time: nowStr, done: true, remark: '初稿完成' },
      { step: '行政部负责人审批', user: '', time: '—', done: false, remark: '' },
      { step: '副总审批', user: '', time: '—', done: false, remark: '' },
      { step: '总经理签署下发', user: '', time: '—', done: false, remark: '' }
    ];
  }
  if (type === 'leave' || type === 'expense' || type === 'businesstrip') {
    return [
      { step: '提交', user: '', time: nowStr, done: true },
      { step: '区域负责人审批', user: '', time: '—', done: false },
      { step: '部门审批', user: '', time: '—', done: false },
      { step: '财务审核', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false }
    ];
  }
  if (type === 'contract') {
    // 合同管理：行政部录入 → 行政部负责人审批 → 财务负责人审批 → 销售总监审批 → 副总审批 → 总经理审批 → 执行
    return [
      { step: '行政部录入', user: '', time: nowStr, done: true },
      { step: '行政部负责人审批', user: '', time: '—', done: false },
      { step: '财务负责人审批', user: '', time: '—', done: false },
      { step: '销售总监审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '执行', user: '', time: '—', done: false }
    ];
  }
  if (type === 'project') {
    const submitter = dept === '技术部' ? '技术部负责人提交' : '销售总监提交';
    return [
      { step: submitter, user: '', time: nowStr, done: true },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '项目立项', user: '', time: '—', done: false }
    ];
  }
  if (type === 'project_progress') {
    const submitter = dept === '技术部' ? '技术部负责人录入进度' : '销售总监录入进度';
    return [
      { step: submitter, user: '', time: nowStr, done: true },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '进度确认', user: '', time: '—', done: false }
    ];
  }
  if (type === 'finance') {
    return [
      { step: '财务部录入', user: '', time: nowStr, done: true },
      { step: '财务负责人审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理终审', user: '', time: '—', done: false }
    ];
  }
  if (type === 'announcement') {
    return [
      { step: '行政部录入', user: '', time: nowStr, done: true },
      { step: '行政部负责人审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '发布', user: '', time: '—', done: false }
    ];
  }
  if (type === 'hr') {
    return [
      { step: '行政部录入', user: '', time: nowStr, done: true },
      { step: '行政部负责人审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '执行', user: '', time: '—', done: false }
    ];
  }
  if (type === 'fixed_asset') {
    // 固定资产：财务部录入 → 财务负责人审批 → 副总审批 → 总经理审批 → 执行
    return [
      { step: '财务部录入', user: '', time: nowStr, done: true },
      { step: '财务负责人审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '执行', user: '', time: '—', done: false }
    ];
  }
  if (type === 'customer') {
    return [
      { step: '行政部录入', user: '', time: nowStr, done: true },
      { step: '行政部负责人审批', user: '', time: '—', done: false },
      { step: '销售总监审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '执行', user: '', time: '—', done: false }
    ];
  }
  if (type === 'supplier') {
    return [
      { step: '市场部录入', user: '', time: nowStr, done: true },
      { step: '市场部负责人审批', user: '', time: '—', done: false },
      { step: '行政部负责人审批', user: '', time: '—', done: false },
      { step: '销售总监审批', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '执行', user: '', time: '—', done: false }
    ];
  }
  if (type === 'report') {
    return [
      { step: '员工提交', user: '', time: nowStr, done: true },
      { step: '部门负责人审阅', user: '', time: '—', done: false },
      { step: '副总审阅', user: '', time: '—', done: false },
      { step: '总经理审阅', user: '', time: '—', done: false }
    ];
  }
  // 费用报销：>500元总经理终审，≤500元副总终审 (PRD 4.1)
  if (type === 'reimbursement') {
    return [
      { step: '提交报销', user: '', time: nowStr, done: true },
      { step: '部门负责人审批', user: '', time: '—', done: false },
      { step: '财务审核', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理终审', user: '', time: '—', done: false },
      { step: '财务付款', user: '', time: '—', done: false }
    ];
  }
  // 借款管理 (PRD 4.2)
  if (type === 'loan') {
    return [
      { step: '提交借款', user: '', time: nowStr, done: true },
      { step: '部门负责人审批', user: '', time: '—', done: false },
      { step: '财务审核', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '财务放款', user: '', time: '—', done: false }
    ];
  }
  // 对公付款 (PRD 4.3)
  if (type === 'payment') {
    return [
      { step: '提交付款申请', user: '', time: nowStr, done: true },
      { step: '部门负责人审批', user: '', time: '—', done: false },
      { step: '财务审核', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '财务付款', user: '', time: '—', done: false }
    ];
  }
  // 预算审批 (PRD 4.5)
  if (type === 'budget') {
    return [
      { step: '编制预算', user: '', time: nowStr, done: true },
      { step: '财务负责人审核', user: '', time: '—', done: false },
      { step: '副总审批', user: '', time: '—', done: false },
      { step: '总经理审批', user: '', time: '—', done: false },
      { step: '预算执行', user: '', time: '—', done: false }
    ];
  }
  return [];
}

module.exports = { success, error, genId, formatDate, now, safeParse, generateApprovalFlow };
