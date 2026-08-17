// 财务模块共享工具 (移植自参考项目 app.js renderFinanceModule 辅助函数)

// HTML 转义 (用于打印窗口拼接 HTML)
export function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 金额格式化 (整数, 千分位) — 对应 _fmtMoney
export function fmtMoney(n) {
  if (!n) return '0';
  return parseFloat(n).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

// 金额格式化 (保留两位) — 列表列内使用
export function fmtAmt(n) {
  return (Number(n) || 0).toLocaleString();
}

// 状态 → el-tag type — 对应 _statusColor
const STATUS_TYPE = {
  草稿: 'info',
  待审批: 'warning',
  审批中: 'primary',
  已通过: 'success',
  已驳回: 'danger',
  已付款: 'success',
  已还款: 'success',
  已逾期: 'danger',
  已审批: 'success',
  已执行: 'success',
  已冻结: 'primary',
  正常: 'success',
  作废: 'info',
  异常: 'danger',
};
export function statusType(status) {
  return STATUS_TYPE[status] || 'primary';
}

// 发票状态 → el-tag type
export function invStatusType(s) {
  return s === '正常' ? 'success' : s === '作废' ? 'info' : 'danger';
}

// 发票校验状态 → el-tag type
export function verifiedType(v) {
  return v === '已校验' ? 'success' : v === '存疑' ? 'warning' : 'info';
}

// 打印权限 — 对应 _canPrint
export function canPrint(user) {
  const u = user || {};
  return u.dept === '财务部' || u.dept === '行政部' || ['总经理', '副总', '超级管理员'].includes(u.role);
}

// 财务数据录入权限 — 对应 canAccess('createFinanceRecord')
export function canFinanceEntry(user) {
  const u = user || {};
  if (u.role === '总经理' || u.role === '超级管理员') return true;
  return u.dept === '财务部';
}

// 财务标签页权限 — 对应 _getAllowedFinTabs
export function getAllowedFinTabs(user) {
  const u = user || {};
  if (u.role === '超级管理员' || u.role === '总经理' || u.role === '副总' || u.dept === '财务部') {
    return ['overview', 'receivable', 'expense', 'loan', 'invoice', 'payment', 'budget', 'config'];
  }
  return ['overview', 'expense', 'loan'];
}

// 打印窗口公共样式 — 对应 _openPrintWindow 内联样式
const PRINT_STYLE = `
  body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333;}
  h2{text-align:center;margin-bottom:8px;}
  .print-subtitle{text-align:center;color:#666;font-size:13px;margin-bottom:24px;border-bottom:2px solid #2563eb;padding-bottom:12px;}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}
  th{background:#f5f5f5;width:15%;}
  .wf-step{display:inline-block;text-align:center;padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:12px;min-width:80px;}
  .wf-arrow{display:inline-block;color:#999;margin:0 4px;}
  .wf-done{background:#d1fae5;border-color:#10b981;}
  .wf-pending{background:#f9fafb;border-color:#d1d5db;}
  .wf-name{font-weight:bold;margin-bottom:4px;}
  .wf-time{color:#666;font-size:11px;}
  h4{font-size:16px;margin:20px 0 10px;border-left:3px solid #2563eb;padding-left:8px;}
  .footer{margin-top:40px;text-align:center;color:#999;font-size:12px;border-top:1px solid #eee;padding-top:12px;}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;}
  .tag-green{background:#d1fae5;color:#065f46;}
  .tag-red{background:#fee2e2;color:#991b1b;}
  .tag-yellow{background:#fef3c7;color:#92400e;}
  .tag-blue{background:#dbeafe;color:#1e40af;}
  @media print{body{padding:20px;}}
`;

// 通用打印窗口 — 对应 _openPrintWindow
export function openPrintWindow(title, bodyHTML, userName) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${PRINT_STYLE}</style></head><body>
  <h2>${esc(title)}</h2>
  <div class="print-subtitle">四川卓盟科技有限公司</div>
  ${bodyHTML}
  <div class="footer">打印人：${esc(userName || '')} · 打印时间：${new Date().toLocaleString('zh-CN')}</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
  return true;
}

// 打印用审批流程 HTML — 对应打印函数内 flowHTML 生成
export function printFlowHtml(flow) {
  const arr = flow || [];
  return arr
    .map(
      (f, i) =>
        `<span class="wf-step ${f.done ? 'wf-done' : 'wf-pending'}"><div class="wf-name">${esc(f.step)}</div><div style="font-size:11px;">${esc(f.user || '—')}</div><div class="wf-time">${esc(f.time || '—')}</div></span>${i < arr.length - 1 ? '<span class="wf-arrow">→</span>' : ''}`
    )
    .join('');
}

// 打印状态 tag 色 — 对应打印内 _statusColor 的 green/red/yellow/blue
const PRINT_TAG = {
  已通过: 'green', 已付款: 'green', 已还款: 'green', 已审批: 'green', 已执行: 'green', 正常: 'green',
  已驳回: 'red', 已逾期: 'red', 异常: 'red',
  待审批: 'yellow', 审批中: 'blue', 草稿: 'blue', 已冻结: 'blue', 作废: 'blue',
};
export function printTagColor(status) {
  return PRINT_TAG[status] || 'blue';
}
