import request from '../../api/request';
import { ElMessage } from 'element-plus';

export const fmtAmt = (v) => '¥' + Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtInt = (v) => '¥' + Number(v || 0).toLocaleString();

export const contractStatusColors = {
  '草稿': '#f59e0b', '审批中': '#3b82f6', '已生效': '#10b981', '变更中': '#8b5cf6',
  '终止中': '#f97316', '已终止': '#ef4444', '已归档': '#6366f1', '已作废': '#9ca3af',
};

export const borrowStatusColors = {
  '草稿': '#f59e0b', '审批中': '#3b82f6', '已驳回': '#ef4444',
  '已批准': '#10b981', '已归还': '#6366f1', '已逾期': '#f97316',
};

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// canAccess('createContract')：总经理/超管/行政部（含普通员工、部门经理）
export function canCreateContract(u) {
  if (!u) return false;
  if (u.role === '总经理' || u.role === '超级管理员') return true;
  if (u.role === '普通员工' && u.dept === '行政部') return true;
  if (u.role === '部门经理' && u.dept === '行政部') return true;
  return false;
}

// 合同主信息表单的新建权限（超管不可直接创建）
export function canCreateContractForm(u) {
  if (!u) return false;
  if (u.role === '超级管理员') return false;
  return u.role === '总经理' || u.dept === '行政部' || u.role === '普通员工' || u.role === '部门经理';
}

// canApprove()：非普通员工
export function canApproveUser(u) {
  return !!u && u.role !== '普通员工';
}

// _canPrint()：财务部/行政部/总经理/副总/超管
export function canPrintUser(u) {
  if (!u) return false;
  return u.dept === '财务部' || u.dept === '行政部' || ['总经理', '副总', '超级管理员'].includes(u.role);
}

// 通用打印窗口（对应 _openPrintWindow）
export function openPrintWindow(title, bodyHTML, userName) {
  const w = window.open('', '_blank');
  if (!w) { ElMessage.warning('请允许弹出窗口以使用打印功能'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333;}
    h2{text-align:center;margin-bottom:8px;}
    .print-subtitle{text-align:center;color:#666;font-size:13px;margin-bottom:24px;border-bottom:2px solid #2563eb;padding-bottom:12px;}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}
    th{background:#f5f5f5;width:15%;}
    .wf-step{display:inline-block;text-align:center;padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:12px;min-width:80px;}
    .wf-arrow{display:inline-block;color:#999;margin:0 4px;}
    .wf-done{background:#d1fae5;border-color:#10b981;}
    .wf-current{background:#fef3c7;border-color:#f59e0b;}
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
    .content-box{background:#f9fafb;padding:16px;border-radius:8px;font-size:14px;line-height:1.8;white-space:pre-wrap;border:1px solid #e5e7eb;}
    @media print{body{padding:20px;}}
  </style></head><body>
  <h2>${title}</h2>
  <div class="print-subtitle">四川卓盟科技有限公司</div>
  ${bodyHTML}
  <div class="footer">打印人：${esc(userName || '')} · 打印时间：${new Date().toLocaleString('zh-CN')}</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// 旧格式审批流程（数组）打印/展示 HTML
export function wfFlowHtml(flow, withCurrent) {
  const arr = flow || [];
  return arr.map((f, i) => {
    const cls = f.done ? 'wf-done' : withCurrent && (i === 0 || arr.slice(0, i).every(s => s.done)) ? 'wf-current' : 'wf-pending';
    return `<span class="wf-step ${cls}"><div class="wf-name">${esc(f.step)}</div><div style="font-size:11px;">${esc(f.user || '—')}</div><div class="wf-time">${esc(f.time || '—')}</div></span>${i < arr.length - 1 ? '<span class="wf-arrow">→</span>' : ''}`;
  }).join('');
}

function _statusColor(status) {
  const map = { '草稿': 'gray', '待审批': 'yellow', '审批中': 'blue', '已通过': 'green', '已驳回': 'red', '已生效': 'green', '已归档': 'blue', '已作废': 'gray' };
  return map[status] || 'blue';
}

// 打印合同主信息表单详情（对应 _printContractDetail）
export async function printContractFormDetail(id, userName) {
  const resp = await request.get('/contract-form/detail/' + id);
  if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
  const d = resp.data || {};
  const body = `<table>
    <tr><th>合同编号</th><td>${esc(d.contract_no || '')}</td><th>合同名称</th><td>${esc(d.contract_name || '')}</td></tr>
    <tr><th>合同类型</th><td>${esc(d.contract_type || '')}</td><th>合同状态</th><td><span class="tag tag-${_statusColor(d.contract_status)}">${esc(d.contract_status)}</span></td></tr>
    <tr><th>合作方</th><td>${esc(d.partner_company || '')}</td><th>经办人</th><td>${esc(d.handler || '')}</td></tr>
    <tr><th>合同金额</th><td><strong>¥${(d.amount || 0).toLocaleString()}</strong></td><th>币种</th><td>${esc(d.currency || '人民币')}</td></tr>
    <tr><th>起始日期</th><td>${esc(d.start_date || '')}</td><th>到期日期</th><td>${esc(d.end_date || '')}</td></tr>
    <tr><th>付款方式</th><td colspan="3">${esc(d.payment_method || '')}</td></tr>
    <tr><th>签订地点</th><td>${esc(d.sign_location || '')}</td><th>联系人</th><td>${esc(d.contact_person || '')} ${esc(d.contact_phone || '')}</td></tr>
    ${d.external_remark ? `<tr><th>备注</th><td colspan="3">${esc(d.external_remark)}</td></tr>` : ''}
  </table>`;
  openPrintWindow('合同详情', body, userName);
}

// 打印旧版合同管理单（对应 printContractDetail）
export function printOldContractDetail(r, userName) {
  if (!r) { ElMessage.error('合同不存在'); return; }
  const flowHTML = wfFlowHtml(r.flow || [], false);
  const body = `<table>
    <tr><th>合同编号</th><td>${esc(r.id)}</td><th>合同名称</th><td>${esc(r.name)}</td></tr>
    <tr><th>客户</th><td>${esc(r.customer)}</td><th>类型</th><td>${esc(r.type)}</td></tr>
    <tr><th>金额</th><td>¥${(r.amount || 0).toLocaleString()}</td><th>签订日期</th><td>${esc(r.sign_date || r.start_date || '—')}</td></tr>
    <tr><th>到期日期</th><td>${esc(r.end_date || '—')}</td><th>创建人</th><td>${esc(r.creator || '—')}</td></tr>
    <tr><th>审批状态</th><td>${esc(r.status)}</td><th>执行状态</th><td>${esc(r.execution_status || '未执行')}</td></tr>
    ${r.execution_desc ? `<tr><th>执行说明</th><td colspan="3">${esc(r.execution_desc)}</td></tr>` : ''}
  </table>
  ${r.content ? `<h4>合同内容</h4><div class="content-box">${esc(r.content)}</div>` : ''}
  <h4>审批流程</h4><div style="text-align:center;">${flowHTML}</div>`;
  openPrintWindow('合同管理单', body, userName);
}

// 打印工作节点记录（对应 printNodeRecord('contract')）
export function printContractNodeRecord(r, userName) {
  if (!r) { ElMessage.error('记录不存在'); return; }
  const flowHTML = wfFlowHtml(r.flow || [], true);
  const body = `<table>
    <tr><th>合同编号</th><td>${esc(r.id)}</td><th>合同名称</th><td>${esc(r.name)}</td></tr>
    <tr><th>客户</th><td>${esc(r.customer)}</td><th>类型</th><td>${esc(r.type)}</td></tr>
    <tr><th>金额</th><td>¥${(r.amount || 0).toLocaleString()}</td><th>状态</th><td>${esc(r.status)}</td></tr>
  </table>
  <h4>审批流程</h4><div style="text-align:center;">${flowHTML}</div>`;
  openPrintWindow('合同管理单', body, userName);
}

// 打印合同台账（对应 printContractLedger）
export function printContractLedger(rows, userName) {
  const body = `<table><thead><tr><th>合同编号</th><th>名称</th><th>客户</th><th>类型</th><th>金额</th><th>签订日期</th><th>到期日期</th><th>状态</th><th>执行情况</th></tr></thead><tbody>${(rows || []).map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${esc(r.customer)}</td><td>${esc(r.type)}</td><td>¥${(r.amount || 0).toLocaleString()}</td><td>${esc(r.sign_date || r.start_date || '—')}</td><td>${esc(r.end_date || '—')}</td><td>${esc(r.status)}</td><td>${esc(r.execution_status || '—')}</td></tr>`).join('')}</tbody></table>`;
  openPrintWindow('合同台账', body, userName);
}
