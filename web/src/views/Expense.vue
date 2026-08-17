<template>
  <div class="zm-expense">
    <div class="card">
      <div class="card-header">
        <h3>费用报销</h3>
        <button class="btn btn-primary btn-sm" @click="openForm">申请报销</button>
      </div>
      <div class="card-body">
        <div v-if="loading" class="loading"><el-icon class="is-loading"><Loading /></el-icon> 加载中...</div>
        <p v-else-if="loadError" class="text-muted">加载失败</p>
        <table v-else class="table">
          <thead>
            <tr>
              <th>申请人</th><th>类别</th><th>金额(¥)</th><th>日期</th><th>说明</th><th>状态</th><th>详情</th><th>流程</th>
              <th v-if="canApprove">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="r.id">
              <td>{{ r.applicant }}</td>
              <td>{{ r.category }}</td>
              <td>¥{{ r.amount }}</td>
              <td>{{ r.date }}</td>
              <td>{{ r.desc }}</td>
              <td><span class="tag" :class="statusTag(r.status)">{{ r.status }}</span></td>
              <td>
                <button class="btn btn-sm btn-info" title="详情" @click="viewDetail(r.id)"><el-icon><Document /></el-icon></button>
              </td>
              <td>
                <button class="btn btn-sm btn-secondary" title="查看流程" @click="showWorkflow(r)"><el-icon><Connection /></el-icon></button>
                <button class="btn btn-sm btn-info" title="打印" @click="printNodeRecord(i)"><el-icon><Printer /></el-icon></button>
              </td>
              <td v-if="canApprove">
                <template v-if="r.status === '待审批'">
                  <button class="btn btn-sm btn-primary" title="通过" @click="approve(r.id)"><el-icon><Check /></el-icon></button>
                  <button class="btn btn-sm btn-secondary" title="驳回" @click="reject(r.id)"><el-icon><Close /></el-icon></button>
                </template>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="10" class="text-center text-muted">暂无记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 申请报销弹窗 -->
    <div v-if="form.visible" class="modal-overlay" @click.self="form.visible = false">
      <div class="modal-box" style="max-width:450px;">
        <div class="modal-header">
          <h3>费用报销</h3>
          <button class="modal-close" @click="form.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>费用类别</label>
            <select v-model="form.category" class="form-control">
              <option v-for="c in categories" :key="c">{{ c }}</option>
            </select>
          </div>
          <div class="form-group"><label>金额(¥)</label><input v-model.number="form.amount" type="number" class="form-control" min="0" step="0.01"></div>
          <div class="form-group"><label>日期</label><input v-model="form.date" type="date" class="form-control"></div>
          <div class="form-group"><label>说明</label><textarea v-model="form.desc" class="form-control" rows="3"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="form.visible = false">取消</button>
          <button class="btn btn-primary" @click="submit">提交</button>
        </div>
      </div>
    </div>

    <!-- 报销详情弹窗 -->
    <div v-if="detail.visible" class="modal-overlay" @click.self="detail.visible = false">
      <div class="modal-box" style="max-width:600px;">
        <div class="modal-header">
          <h3>费用报销详情</h3>
          <button class="modal-close" @click="detail.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="detail.loading" class="loading"><el-icon class="is-loading"><Loading /></el-icon> 加载中...</div>
          <p v-else-if="detail.error" class="text-muted">加载失败</p>
          <template v-else>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
              <div class="info-item"><span class="info-label">申请人</span><span class="info-value">{{ detail.data.applicant }}</span></div>
              <div class="info-item"><span class="info-label">部门</span><span class="info-value">{{ detail.data.dept }}</span></div>
              <div class="info-item"><span class="info-label">费用类别</span><span class="info-value">{{ detail.data.category }}</span></div>
              <div class="info-item"><span class="info-label">金额</span><span class="info-value">¥{{ (detail.data.amount || 0).toLocaleString() }}</span></div>
              <div class="info-item"><span class="info-label">日期</span><span class="info-value">{{ detail.data.date }}</span></div>
              <div class="info-item"><span class="info-label">状态</span><span class="info-value"><span class="tag" :class="statusTag(detail.data.status)">{{ detail.data.status }}</span></span></div>
              <div class="info-item"><span class="info-label">提交时间</span><span class="info-value">{{ detail.data.created_at || '—' }}</span></div>
            </div>
            <div v-if="detail.data.desc" class="info-item" style="margin-bottom:16px;"><span class="info-label">说明</span><span class="info-value">{{ detail.data.desc }}</span></div>
            <div v-if="detail.data.remark" class="info-item" style="margin-bottom:16px;"><span class="info-label">备注</span><span class="info-value">{{ detail.data.remark }}</span></div>
            <h4 style="margin:16px 0 8px;">审批流程</h4>
            <div style="text-align:center;overflow-x:auto;padding:8px 0;">
              <template v-if="detailFlow.length">
                <template v-for="(f, i) in detailFlow" :key="i">
                  <span class="wf-step" :class="flowStepClass(detailFlow, i)">
                    <div class="wf-name">{{ f.step }}</div>
                    <div style="font-size:11px;">{{ f.user || '—' }}</div>
                    <div class="wf-time">{{ f.time || '—' }}</div>
                  </span>
                  <span v-if="i < detailFlow.length - 1" class="wf-arrow">→</span>
                </template>
              </template>
              <span v-else class="text-muted">无流程数据</span>
            </div>
            <div style="margin-top:20px;text-align:right;">
              <button class="btn btn-secondary btn-sm" @click="printDetail(detail.data.id)"><el-icon><Printer /></el-icon> 打印</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 审批流程弹窗 -->
    <div v-if="wf.visible" class="modal-overlay" @click.self="wf.visible = false">
      <div class="modal-box" style="max-width:750px;">
        <div class="modal-header">
          <h3>审批流程详情</h3>
          <button class="modal-close" @click="wf.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <table class="table" style="margin-bottom:20px;">
            <tbody>
              <tr><th>申请人</th><td>{{ wf.row.applicant }}</td><th>类别</th><td>{{ wf.row.category }}</td></tr>
              <tr>
                <th>金额</th><td>¥{{ (wf.row.amount || 0).toLocaleString() }}</td>
                <th>状态</th><td><span class="tag" :class="statusTag(wf.row.status)">{{ wf.row.status }}</span></td>
              </tr>
              <tr><th>说明</th><td colspan="3">{{ wf.row.desc || '' }}</td></tr>
            </tbody>
          </table>
          <h4 style="margin:0 0 12px;font-size:15px;">工作流程</h4>
          <div v-if="wfFlow.length" class="wf-container">
            <div class="wf-track">
              <template v-for="(f, i) in wfFlow" :key="i">
                <div class="wf-step" :class="flowStepClass(wfFlow, i)">
                  <div class="wf-icon">
                    <el-icon v-if="f.done"><CircleCheck /></el-icon>
                    <el-icon v-else-if="isCurrentStep(wfFlow, i)" class="is-loading"><Loading /></el-icon>
                    <span v-else class="wf-hollow"></span>
                  </div>
                  <div class="wf-info">
                    <div class="wf-name">{{ f.step }}</div>
                    <div class="wf-user">{{ f.user || (f.done ? '已完成' : '待处理') }}</div>
                    <div v-if="f.time && f.time !== '—'" class="wf-time">{{ f.time }}</div>
                  </div>
                </div>
                <div v-if="i < wfFlow.length - 1" class="wf-arrow"><el-icon><ArrowRight /></el-icon></div>
              </template>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="wf.visible = false">关闭</button>
          <button class="btn btn-primary" @click="printWorkflow"><el-icon><Printer /></el-icon> 打印流程</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Loading, Document, Connection, Printer, Check, Close, CircleCheck, ArrowRight } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const rows = ref([]);
const loading = ref(true);
const loadError = ref(false);
const categories = ['交通费', '餐饮费', '住宿费', '办公用品', '通讯费', '差旅费', '招待费', '其他'];

// 审批权限：非普通员工才能审批
const canApprove = computed(() => !!auth.user && auth.user.role !== '普通员工');

function statusTag(s) {
  return s === '已通过' ? 'tag-green' : s === '已驳回' ? 'tag-red' : 'tag-yellow';
}
function isCurrentStep(flow, i) {
  return !flow[i].done && (i === 0 || flow.slice(0, i).every((s) => s.done));
}
function flowStepClass(flow, i) {
  return flow[i].done ? 'wf-done' : isCurrentStep(flow, i) ? 'wf-current' : 'wf-pending';
}

async function load() {
  loading.value = true;
  loadError.value = false;
  const res = await request.get('/expenses');
  loading.value = false;
  if (res.code !== 200) { loadError.value = true; return; }
  rows.value = res.data || [];
}
onMounted(load);

/* ===== 申请报销 ===== */
const form = reactive({ visible: false, category: '交通费', amount: null, date: '', desc: '' });
function openForm() {
  form.category = '交通费';
  form.amount = null;
  form.date = new Date().toISOString().slice(0, 10);
  form.desc = '';
  form.visible = true;
}
async function submit() {
  const data = { category: form.category, amount: parseFloat(form.amount), date: form.date, desc: form.desc };
  if (!data.amount) { ElMessage.warning('请输入金额'); return; }
  const res = await request.post('/expenses', data);
  if (res.code === 200) {
    ElMessage.success('报销申请已提交');
    form.visible = false;
    load();
  } else ElMessage.error(res.msg || '提交失败');
}

/* ===== 审批 / 驳回 ===== */
async function approve(id) {
  if (!canApprove.value) { ElMessage.warning('您无审批权限'); return; }
  const res = await request.post(`/expenses/${id}/approve`);
  if (res.code === 200) { ElMessage.success('审批通过'); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function reject(id) {
  if (!canApprove.value) { ElMessage.warning('您无审批权限'); return; }
  try {
    await ElMessageBox.confirm('确定驳回此报销申请？', '提示', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' });
  } catch { return; }
  const res = await request.post(`/expenses/${id}/reject`, { remark: undefined });
  if (res.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(res.msg || '操作失败');
}

/* ===== 详情弹窗 ===== */
const detail = reactive({ visible: false, loading: false, error: false, data: {} });
const detailFlow = computed(() => detail.data.approval_flow || detail.data.flow || []);
async function viewDetail(id) {
  detail.visible = true;
  detail.loading = true;
  detail.error = false;
  detail.data = {};
  const res = await request.get(`/expenses/${id}`);
  detail.loading = false;
  if (res.code !== 200) { detail.error = true; return; }
  detail.data = res.data || {};
}

/* ===== 流程弹窗 ===== */
const wf = reactive({ visible: false, row: {} });
const wfFlow = computed(() => wf.row.flow || []);
function showWorkflow(row) {
  wf.row = row;
  wf.visible = true;
}

/* ===== 打印 ===== */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const PRINT_STYLE = `body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:750px;margin:0 auto;}h2{text-align:center;margin-bottom:24px;border-bottom:2px solid #2563eb;padding-bottom:12px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}th{background:#f5f5f5;width:15%;}.wf-step{display:inline-block;text-align:center;padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:12px;min-width:80px;}.wf-arrow{display:inline-block;color:#999;margin:0 4px;}.wf-done{background:#d1fae5;border-color:#10b981;}.wf-current{background:#fef3c7;border-color:#f59e0b;}.wf-pending{background:#f9fafb;border-color:#d1d5db;}.wf-name{font-weight:bold;margin-bottom:4px;}.wf-time{color:#666;font-size:11px;}h4{font-size:16px;margin:20px 0 10px;}.footer{margin-top:40px;text-align:center;color:#999;font-size:12px;}`;

function flowStepsHTML(flow, withCurrent) {
  return (flow || []).map((f, i) => {
    const cls = f.done ? 'wf-done' : withCurrent && (i === 0 || flow.slice(0, i).every((s) => s.done)) ? 'wf-current' : 'wf-pending';
    return `<span class="wf-step ${cls}"><div class="wf-name">${esc(f.step)}</div><div style="font-size:11px;">${esc(f.user || '—')}</div><div class="wf-time">${esc(f.time || '—')}</div></span>${i < flow.length - 1 ? '<span class="wf-arrow">→</span>' : ''}`;
  }).join('');
}
function openPrint(title, body) {
  const w = window.open('', '_blank');
  if (!w) { ElMessage.warning('请允许弹出窗口以使用打印功能'); return; }
  w.document.write(`<html><head><title>${title}</title><style>${PRINT_STYLE}</style></head><body>${body}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

// 详情弹窗内打印(流程仅区分已完成/待处理)
function printDetail(id) {
  const r = rows.value.find((e) => e.id == id) || detail.data;
  if (!r || !r.id) { ElMessage.error('记录不存在'); return; }
  const flowHTML = flowStepsHTML(r.approval_flow || r.flow || [], false);
  const body = `<h2>费用报销单</h2><table><tr><th>申请人</th><td>${esc(r.applicant)}</td><th>部门</th><td>${esc(r.dept)}</td></tr><tr><th>费用类别</th><td>${esc(r.category)}</td><th>金额</th><td>¥${(r.amount || 0).toLocaleString()}</td></tr><tr><th>日期</th><td>${esc(r.date)}</td><th>状态</th><td>${esc(r.status)}</td></tr>${r.desc ? `<tr><th>说明</th><td colspan="3">${esc(r.desc)}</td></tr>` : ''}</table><h4>审批流程</h4><div style="text-align:center;">${flowHTML}</div><div class="footer">四川卓盟科技有限公司 · 打印时间：${new Date().toLocaleString('zh-CN')}</div>`;
  openPrint('费用报销单', body);
}

// 行内打印按钮(打印费用报销单)
function printNodeRecord(index) {
  const r = rows.value[index];
  if (!r) { ElMessage.error('记录不存在'); return; }
  const flowHTML = flowStepsHTML(r.flow || [], true);
  const detailHtml = `<tr><th>申请人</th><td>${esc(r.applicant)}</td><th>类别</th><td>${esc(r.category)}</td></tr><tr><th>金额</th><td>¥${(r.amount || 0).toLocaleString()}</td><th>日期</th><td>${esc(r.date)}</td></tr><tr><th>状态</th><td>${esc(r.status)}</td><th>说明</th><td>${esc(r.desc || '')}</td></tr>`;
  const body = `<h2>费用报销单</h2><table>${detailHtml}</table><h4>审批流程</h4><div style="text-align:center;">${flowHTML}</div><div class="footer">四川卓盟科技有限公司 · 打印时间：${new Date().toLocaleString('zh-CN')}</div>`;
  openPrint('费用报销单', body);
}

// 流程弹窗"打印流程"
function printWorkflow() {
  const r = wf.row;
  const flowHTML = flowStepsHTML(r.flow || [], true);
  const detailHtml = `<tr><th>申请人</th><td>${esc(r.applicant)}</td><th>类别</th><td>${esc(r.category)}</td></tr><tr><th>金额</th><td>¥${(r.amount || 0).toLocaleString()}</td><th>状态</th><td>${esc(r.status)}</td></tr><tr><th>说明</th><td colspan="3">${esc(r.desc || '')}</td></tr>`;
  const body = `<table>${detailHtml}</table><h4>工作流程</h4><div style="text-align:center;">${flowHTML}</div>`;
  openPrint('审批流程', body);
}
</script>

<style scoped>
.zm-expense {
  --primary: #2563eb; --primary-dark: #1d4ed8; --primary-light: #dbeafe;
  --success: #10b981; --success-light: #d1fae5;
  --warning: #f59e0b; --warning-light: #fef3c7;
  --danger: #ef4444; --danger-light: #fee2e2;
  --info: #06b6d4; --info-light: #cffafe;
  --purple: #8b5cf6; --purple-light: #ede9fe;
  --text-primary: #1e293b; --text-secondary: #64748b; --text-muted: #94a3b8;
  --border: #e2e8f0; --border-light: #f1f5f9;
  --bg-card: #ffffff; --bg-hover: #f8fafc; --bg-secondary: #f1f5f9;
  --radius: 12px; --radius-sm: 8px; --radius-lg: 16px;
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --transition: all 0.2s ease;
}
.card { background: var(--bg-card); border-radius: var(--radius); box-shadow: var(--shadow-md); overflow: hidden; }
.card-header { padding: 16px 20px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; }
.card-header h3 { font-size: 15px; font-weight: 600; }
.card-body { padding: 20px; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; transition: var(--transition); cursor: pointer; border: none; background: transparent; color: var(--text-primary); }
.btn-primary { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: #fff; box-shadow: 0 4px 12px rgba(37,99,235,0.3); }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37,99,235,0.4); }
.btn-success { background: var(--success); color: #fff; }
.btn-success:hover { background: #059669; }
.btn-info { background: var(--info); color: #fff; }
.btn-secondary { background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--bg-secondary); }
.btn-sm { padding: 5px 12px; font-size: 12px; }

.table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
.table th { padding: 10px 14px; font-size: 13px; font-weight: 700; color: #1e293b; background: #e2e8f0; border: 1px solid #94a3b8; white-space: nowrap; text-align: left; }
.table td { padding: 10px 14px; border: 1px solid #cbd5e1; font-size: 13px; color: #1e293b; }
.table tr:nth-child(even) td { background: #f1f5f9; }
.table tr:hover td { background: #dbeafe; }

.tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.tag-green { background: var(--success-light); color: var(--success); }
.tag-red { background: var(--danger-light); color: var(--danger); }
.tag-yellow { background: var(--warning-light); color: var(--warning); }
.tag-blue { background: var(--primary-light); color: var(--primary); }
.tag-gray { background: #f1f5f9; color: var(--text-secondary); }
.tag-purple { background: var(--purple-light); color: var(--purple); }

.text-muted { color: var(--text-muted); }
.text-center { text-align: center; }
.loading { text-align: center; padding: 40px; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 8px; }
.loading .el-icon { font-size: 20px; color: var(--primary); }

.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.form-control { width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 14px; background: var(--bg-card); transition: var(--transition); font-family: inherit; }
.form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }

.info-item { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; background: var(--bg-hover); border-radius: var(--radius-sm); }
.info-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.info-value { font-size: 14px; color: var(--text-primary); font-weight: 600; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; animation: zmFadeIn 0.2s ease; }
.modal-box { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-width: 600px; width: 90%; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; animation: zmModalIn 0.3s ease; }
.modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { font-size: 16px; font-weight: 700; }
.modal-close { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 20px; transition: var(--transition); border: none; background: transparent; cursor: pointer; }
.modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-light); display: flex; justify-content: flex-end; gap: 10px; }
@keyframes zmFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes zmModalIn { from { opacity: 0; transform: translateY(20px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

.wf-container { overflow-x: auto; padding: 16px 8px; background: var(--bg-secondary); border-radius: 10px; margin-top: 8px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px; }
.wf-track { display: flex; align-items: center; gap: 4px; min-width: max-content; }
.wf-step { flex-shrink: 0; display: inline-flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 16px; border-radius: 10px; border: 2px solid; min-width: 100px; text-align: center; transition: var(--transition); }
.modal-body > div > .wf-step, .wf-step { vertical-align: middle; }
.wf-icon { font-size: 20px; line-height: 1; }
.wf-hollow { display: inline-block; width: 18px; height: 18px; border: 2px solid #9ca3af; border-radius: 50%; }
.wf-name { font-size: 13px; font-weight: 600; white-space: nowrap; }
.wf-user { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.wf-time { font-size: 10px; color: var(--text-muted); opacity: 0.8; }
.wf-done { background: var(--success-light); border-color: var(--success); }
.wf-done .wf-icon { color: var(--success); }
.wf-current { background: var(--warning-light); border-color: var(--warning); animation: zmWfPulse 2s ease-in-out infinite; }
.wf-current .wf-icon { color: var(--warning); }
.wf-pending { background: var(--bg-card); border-color: #e5e7eb; opacity: 0.65; }
.wf-pending .wf-icon { color: #9ca3af; }
.wf-arrow { flex-shrink: 0; color: #9ca3af; font-size: 14px; padding: 0 2px; display: inline-flex; align-items: center; }
@keyframes zmWfPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.3); } 50% { box-shadow: 0 0 0 6px rgba(245,158,11,0); } }
</style>
