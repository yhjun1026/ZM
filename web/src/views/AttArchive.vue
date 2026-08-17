<template>
  <div class="zm-archive">
    <!-- 无权限提示 -->
    <div v-if="!canView" class="card">
      <div class="card-body">
        <p class="text-muted"><el-icon><Lock /></el-icon> 归档管理为行政部及总经理/副总可查看, 其他部门无归档权限</p>
      </div>
    </div>

    <div v-else class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3><el-icon><Box /></el-icon> 请假出差归档管理{{ isAdmin ? '' : '（查看）' }}</h3>
        <button v-if="isAdmin" class="btn btn-secondary btn-sm" @click="exportCsv"><el-icon><Download /></el-icon> 导出Excel台账</button>
      </div>
      <div class="card-body">
        <div class="ca-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
          <button v-for="t in tabs" :key="t.k" class="btn btn-sm" :class="tab === t.k ? 'btn-primary' : 'btn-secondary'" @click="switchTab(t.k)">
            <el-icon><component :is="t.icon" /></el-icon> {{ t.t }}
          </button>
        </div>

        <div v-if="loading" class="loading"><el-icon class="is-loading"><Loading /></el-icon> 加载中...</div>
        <p v-else-if="errorMsg" class="text-muted">{{ errorMsg }}</p>

        <!-- 归档台账 -->
        <template v-else-if="tab === 'list'">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:14px;">
            <div v-for="x in kpiCards" :key="x[0]" class="card" style="padding:12px;text-align:center;">
              <div class="text-muted" style="font-size:12px;">{{ x[0] }}</div>
              <div style="font-size:22px;font-weight:700;" :style="{ color: x[2] }">{{ x[1] == null ? 0 : x[1] }}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <select v-model="filters.status" class="form-control" style="width:120px;" @change="load">
              <option value="">全部归档状态</option>
              <option>待归档</option>
              <option>已归档</option>
              <option>异常</option>
            </select>
            <select v-model="filters.form_type" class="form-control" style="width:120px;" @change="load">
              <option value="">全部类型</option>
              <option value="leave">请假单</option>
              <option value="trip">出差单</option>
            </select>
            <input v-model="filters.month" type="month" class="form-control" style="width:150px;" @change="load">
            <input v-model="filters.dept" class="form-control" style="width:140px;" placeholder="部门" @change="load">
          </div>
          <div class="table-wrap" style="overflow-x:auto;">
            <table class="table">
              <thead><tr><th>档案编号</th><th>类型</th><th>单据号</th><th>申请人</th><th>部门</th><th>单据状态</th><th>归档状态</th><th>归档人/时间</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="r in rows" :key="r.id">
                  <td style="font-family:monospace;font-size:12px;">{{ r.archive_no || '—' }}</td>
                  <td>
                    <span v-if="r.form_type === 'leave'" class="tag tag-purple" style="background:#ede9fe;color:#7c3aed;">请假单</span>
                    <span v-else class="tag tag-blue">出差单</span>
                  </td>
                  <td style="font-family:monospace;font-size:12px;">{{ r.form_id }}</td>
                  <td>{{ r.applicant }}</td>
                  <td>{{ r.dept }}</td>
                  <td><span class="tag" :class="statusTag(snapStatus(r))">{{ snapStatus(r) }}</span></td>
                  <td><span class="tag" :class="archiveStatusTag(r.status)">{{ r.status }}</span></td>
                  <td class="text-muted" style="font-size:12px;">{{ r.filed_by || '—' }}<br>{{ r.filed_at || '' }}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-secondary" title="查看详情" @click="viewDetail(r.id)"><el-icon><View /></el-icon></button>
                    <button v-if="canPrint" class="btn btn-sm btn-secondary" title="打印" @click="printArchive(r.id)"><el-icon><Printer /></el-icon></button>
                    <button v-if="isAdmin && r.status === '待归档'" class="btn btn-sm btn-primary" title="归档确认+生成档案编号" @click="fileArchive(r.id)"><el-icon><Check /></el-icon> 归档确认</button>
                    <template v-if="isAdmin">
                      <button v-if="r.status !== '异常'" class="btn btn-sm btn-secondary" title="标记异常" @click="markArchive(r.id, '异常')"><el-icon><Flag /></el-icon></button>
                      <button v-else class="btn btn-sm btn-secondary" title="取消异常" @click="markArchive(r.id, '待归档')"><el-icon><RefreshLeft /></el-icon></button>
                    </template>
                  </td>
                </tr>
                <tr v-if="!rows.length"><td colspan="9" class="text-center text-muted" style="padding:24px;">暂无归档记录</td></tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- 月度汇总 -->
        <template v-else-if="tab === 'monthly'">
          <p class="text-muted" style="margin-bottom:10px;"><el-icon><InfoFilled /></el-icon> 系统自动归集完结单据(含驳回/作废), 行政部每月完成一次归档整理, 每季度完成一次台账备份</p>
          <table class="table">
            <thead><tr><th>月份</th><th>请假单(份)</th><th>出差单(份)</th><th>合计</th></tr></thead>
            <tbody>
              <tr v-for="r in monthly" :key="r.month">
                <td><b>{{ r.month }}</b></td>
                <td>{{ r.leave || 0 }}</td>
                <td>{{ r.trip || 0 }}</td>
                <td><b>{{ r.total || 0 }}</b></td>
              </tr>
              <tr v-if="!monthly.length"><td colspan="4" class="text-center text-muted" style="padding:24px;">暂无汇总数据</td></tr>
            </tbody>
          </table>
        </template>

        <!-- 预警待处理 -->
        <template v-else-if="tab === 'alerts'">
          <table class="table">
            <thead><tr><th>预警类型</th><th>级别</th><th>内容</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in alerts" :key="i">
                <td><span class="tag tag-blue">{{ r.alert_type }}</span></td>
                <td><span class="tag" :class="alertLevelTag(r.level)">{{ r.level }}</span></td>
                <td>{{ r.msg }}</td>
              </tr>
              <tr v-if="!alerts.length"><td colspan="3" class="text-center text-muted" style="padding:24px;"><el-icon><CircleCheck /></el-icon> 暂无预警, 一切正常</td></tr>
            </tbody>
          </table>
        </template>
      </div>
    </div>

    <!-- 归档详情弹窗 -->
    <div v-if="detail.visible" class="modal-overlay" @click.self="detail.visible = false">
      <div class="modal-box" style="max-width:750px;">
        <div class="modal-header">
          <h3><el-icon><Document /></el-icon> 归档详情 — {{ detail.data.form_type === 'leave' ? '请假单' : '出差单' }}</h3>
          <button class="modal-close" @click="detail.visible = false">&times;</button>
        </div>
        <div class="modal-body" style="max-height:65vh;overflow-y:auto;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
            <div class="card" style="padding:10px;"><div class="text-muted" style="font-size:12px;">档案编号</div><div style="font-weight:600;">{{ detail.data.archive_no || '—' }}</div></div>
            <div class="card" style="padding:10px;"><div class="text-muted" style="font-size:12px;">归档状态</div><div><span class="tag" :class="archiveStatusTag(detail.data.status)">{{ detail.data.status }}</span></div></div>
            <div class="card" style="padding:10px;"><div class="text-muted" style="font-size:12px;">申请人 / 部门</div><div>{{ detail.data.applicant || '—' }} / {{ detail.data.dept || '—' }}</div></div>
            <div class="card" style="padding:10px;"><div class="text-muted" style="font-size:12px;">归档人 / 时间</div><div>{{ detail.data.filed_by || '—' }} · {{ detail.data.filed_at || '—' }}</div></div>
          </div>
          <template v-if="detailForm.id">
            <h4 style="margin-bottom:8px;"><el-icon><Tickets /></el-icon> 原始表单信息</h4>
            <table class="table" style="margin-bottom:12px;">
              <tbody>
                <tr>
                  <td style="width:120px;">单据编号</td><td style="font-family:monospace;">{{ detailForm.id }}</td>
                  <td style="width:120px;">单据状态</td><td>{{ detailForm.status || '' }}</td>
                </tr>
                <tr><td>申请人</td><td>{{ detailForm.applicant || '' }}</td><td>部门</td><td>{{ detailForm.dept || '' }}</td></tr>
                <template v-if="detail.data.form_type === 'leave'">
                  <tr><td>请假类型</td><td>{{ detailForm.leave_type || '' }}</td><td>申请天数</td><td>{{ detailForm.days || 0 }}天</td></tr>
                  <tr>
                    <td>开始日期</td><td>{{ detailForm.start_date || '' }} {{ detailForm.start_half || '全天' }}</td>
                    <td>结束日期</td><td>{{ detailForm.end_date || '' }} {{ detailForm.end_half || '全天' }}</td>
                  </tr>
                  <tr><td>实际天数</td><td>{{ detailForm.actual_days || 0 }}天</td><td>联系人</td><td>{{ detailForm.contact || '' }}</td></tr>
                  <tr><td>请假事由</td><td colspan="3">{{ detailForm.reason || '' }}</td></tr>
                  <tr><td>销假备注</td><td colspan="3">{{ detailForm.settle_note || '—' }}</td></tr>
                </template>
                <template v-else>
                  <tr><td>出差类型</td><td>{{ detailForm.trip_type || '' }}</td><td>出差天数</td><td>{{ detailForm.days || 0 }}天</td></tr>
                  <tr><td>开始日期</td><td>{{ detailForm.start_date || '' }}</td><td>结束日期</td><td>{{ detailForm.end_date || '' }}</td></tr>
                  <tr><td>目的地</td><td>{{ detailForm.destination || '' }}</td><td>实际天数</td><td>{{ detailForm.actual_days || 0 }}天</td></tr>
                  <tr><td>出差事由</td><td colspan="3">{{ detailForm.purpose || '' }}</td></tr>
                  <tr><td>行程安排</td><td colspan="3">{{ detailForm.itinerary || '—' }}</td></tr>
                  <tr><td>销差总结</td><td colspan="3">{{ detailForm.summary || '—' }}</td></tr>
                </template>
              </tbody>
            </table>
            <div v-if="detailFlow.length" style="margin-top:16px;">
              <h4 style="margin-bottom:8px;"><el-icon><Connection /></el-icon> 审批流程</h4>
              <div class="wf-container" style="display:flex;flex-wrap:wrap;gap:4px;">
                <template v-for="(f, i) in detailFlow" :key="i">
                  <div class="wf-node" style="padding:8px 12px;border-radius:8px;border:1px solid #e5e7eb;" :style="f.done ? 'background:#dcfce7;border-color:#86efac;' : 'background:#f9fafb;'">
                    <div style="font-size:13px;font-weight:600;">{{ f.step }}</div>
                    <div style="font-size:11px;color:var(--text-muted);">{{ f.user || '—' }} · {{ f.time || '—' }}</div>
                    <div v-if="f.remark" style="font-size:11px;color:var(--text-muted);">备注：{{ f.remark }}</div>
                    <span v-if="f.done" style="color:#16a34a;font-size:12px;"><el-icon><Check /></el-icon> 已完成</span>
                    <span v-else style="color:var(--text-muted);font-size:12px;"><el-icon><Clock /></el-icon> 待处理</span>
                  </div>
                  <div v-if="i < detailFlow.length - 1" style="display:flex;align-items:center;color:var(--text-muted);"><el-icon><ArrowRight /></el-icon></div>
                </template>
              </div>
            </div>
          </template>
          <p v-else class="text-muted">原始表单数据不可用</p>
          <div v-if="detailSnap.reason" style="margin-top:12px;padding:8px;background:#fef3c7;border-radius:8px;font-size:13px;">
            <el-icon><InfoFilled /></el-icon> 归档原因：{{ detailSnap.reason }}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="detail.visible = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Loading, Lock, Box, Calendar, Bell, Download, View, Printer, Check, Flag,
  RefreshLeft, CircleCheck, InfoFilled, Document, Tickets, Connection, Clock, ArrowRight,
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const user = computed(() => auth.user || {});

// 行政部及总经理/副总/超级管理员可查看
const canView = computed(() => user.value.dept === '行政部' || ['总经理', '副总', '超级管理员'].includes(user.value.role));
const isAdmin = computed(() => user.value.dept === '行政部');
// 打印权限：财务部/行政部/总经理/副总/超级管理员
const canPrint = computed(() => user.value.dept === '财务部' || user.value.dept === '行政部' || ['总经理', '副总', '超级管理员'].includes(user.value.role));

const tabs = [
  { k: 'list', t: '归档台账', icon: Box },
  { k: 'monthly', t: '月度汇总', icon: Calendar },
  { k: 'alerts', t: '预警待处理', icon: Bell },
];

const tab = ref('list');
const loading = ref(false);
const errorMsg = ref('');
const rows = ref([]);
const kpi = ref({});
const monthly = ref([]);
const alerts = ref([]);
const filters = reactive({ status: '', form_type: '', dept: '', month: '' });

const kpiCards = computed(() => {
  const k = kpi.value || {};
  return [
    ['归档总数', k.total, '#6366f1'], ['待归档', k.pending, '#f59e0b'], ['已归档', k.filed, '#10b981'],
    ['异常单据', k.abnormal, '#ef4444'], ['请假单', k.leave_cnt, '#8b5cf6'], ['出差单', k.trip_cnt, '#2563eb'],
  ];
});

function statusTag(s) {
  const m = { 草稿: 'tag-gray', 待审批: 'tag-yellow', 审批中: 'tag-blue', 审批通过: 'tag-green', 已驳回: 'tag-red', 已销假: 'tag-green', 已归档: 'tag-gray', 已作废: 'tag-gray' };
  return m[s] || 'tag-yellow';
}
function archiveStatusTag(s) {
  return s === '已归档' ? 'tag-green' : s === '异常' ? 'tag-red' : 'tag-yellow';
}
function alertLevelTag(l) {
  return { 高: 'tag-red', 中: 'tag-yellow', 低: 'tag-gray' }[l] || 'tag-gray';
}
function snapStatus(r) {
  return (r.snapshot || {}).status || '';
}

async function load() {
  if (!canView.value) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    if (tab.value === 'list') {
      const p = {};
      if (filters.status) p.status = filters.status;
      if (filters.form_type) p.form_type = filters.form_type;
      if (filters.dept) p.dept = filters.dept;
      if (filters.month) p.month = filters.month;
      const [res, st] = await Promise.all([
        request.get('/att-archive', { params: p }),
        request.get('/att-archive/stats'),
      ]);
      if (res.code !== 200) { errorMsg.value = res.msg || '加载失败'; return; }
      rows.value = res.data || [];
      kpi.value = (st.data || {}).kpi || {};
    } else if (tab.value === 'monthly') {
      const res = await request.get('/att-archive/monthly');
      if (res.code !== 200) { errorMsg.value = res.msg || '加载失败'; return; }
      monthly.value = res.data || [];
    } else if (tab.value === 'alerts') {
      const res = await request.get('/leaves/alerts');
      if (res.code !== 200) { errorMsg.value = res.msg || '加载失败'; return; }
      alerts.value = res.data || [];
    }
  } finally {
    loading.value = false;
  }
}
function switchTab(k) {
  tab.value = k;
  load();
}
onMounted(load);

/* ===== 归档确认 / 标记异常 ===== */
async function fileArchive(id) {
  let remark = '';
  try {
    const r = await ElMessageBox.prompt('归档备注(选填):', '归档确认', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = r.value || '';
  } catch { return; }
  const res = await request.post(`/att-archive/${id}/file`, { remark });
  if (res.code === 200) { ElMessage.success(res.msg); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function markArchive(id, status) {
  let remark = '';
  try {
    const r = await ElMessageBox.prompt('标记备注(选填):', status === '异常' ? '标记异常' : '取消异常', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = r.value || '';
  } catch { return; }
  const res = await request.post(`/att-archive/${id}/mark`, { status, remark });
  if (res.code === 200) { ElMessage.success(res.msg); load(); }
  else ElMessage.error(res.msg || '操作失败');
}

/* ===== 导出Excel台账 ===== */
async function exportCsv() {
  try {
    const blob = await request.get('/att-archive/export', { responseType: 'blob' });
    if (!(blob instanceof Blob)) { ElMessage.error('导出失败'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '请假出差归档台账_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    ElMessage.success('台账已导出(含BOM头, 中文Excel可直接打开)');
  } catch (e) {
    ElMessage.error('导出失败: ' + e.message);
  }
}

/* ===== 归档详情 ===== */
const detail = reactive({ visible: false, data: {} });
const detailForm = computed(() => detail.data.original_form || {});
const detailSnap = computed(() => detail.data.snapshot || {});
const detailFlow = computed(() => detailForm.value.flow || []);
async function viewDetail(id) {
  const res = await request.get(`/att-archive/${id}/detail`);
  if (res.code !== 200) { ElMessage.error('获取详情失败: ' + (res.msg || '')); return; }
  detail.data = res.data;
  detail.visible = true;
}

/* ===== 打印归档记录 ===== */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function printArchive(id) {
  const res = await request.get(`/att-archive/${id}/detail`);
  if (res.code !== 200) { ElMessage.error('加载失败'); return; }
  const r = res.data;
  const formType = r.form_type === 'leave' ? '请假单' : '出差单';
  const orig = r.original_form || {};
  let detailHTML = '';
  if (r.form_type === 'leave') {
    detailHTML = `<tr><th>申请人</th><td>${esc(r.applicant)}</td><th>部门</th><td>${esc(r.dept)}</td></tr>
    <tr><th>假期类型</th><td>${esc(orig.type || '')}</td><th>天数</th><td>${esc(orig.days || '')}天</td></tr>
    <tr><th>开始日期</th><td>${esc(orig.start_date || '')}</td><th>结束日期</th><td>${esc(orig.end_date || '')}</td></tr>
    <tr><th>事由</th><td colspan="3">${esc(orig.reason || '')}</td></tr>`;
  } else {
    detailHTML = `<tr><th>申请人</th><td>${esc(r.applicant)}</td><th>部门</th><td>${esc(r.dept)}</td></tr>
    <tr><th>目的地</th><td>${esc(orig.destination || '')}</td><th>事由</th><td>${esc(orig.purpose || '')}</td></tr>
    <tr><th>出发日期</th><td>${esc(orig.start_date || '')}</td><th>返回日期</th><td>${esc(orig.end_date || '')}</td></tr>
    <tr><th>天数</th><td>${esc(orig.days || '')}天</td><th>预算</th><td>¥${(orig.budget || 0).toLocaleString()}</td></tr>`;
  }
  const flow = orig.flow || [];
  const flowHTML = flow.map((f, i) => `<span class="wf-step ${f.done ? 'wf-done' : 'wf-pending'}"><div class="wf-name">${esc(f.step)}</div><div style="font-size:11px;">${esc(f.user || '—')}</div><div class="wf-time">${esc(f.time || '—')}</div></span>${i < flow.length - 1 ? '<span class="wf-arrow">→</span>' : ''}`).join('');
  const tagCls = r.status === '已归档' ? 'green' : r.status === '异常' ? 'red' : 'yellow';
  const body = `<table>
    <tr><th>档案编号</th><td>${esc(r.archive_no || '—')}</td><th>归档状态</th><td><span class="tag tag-${tagCls}">${esc(r.status)}</span></td></tr>
    <tr><th>单据类型</th><td>${formType}</td><th>单据号</th><td>${esc(r.form_id)}</td></tr>
    ${detailHTML}
    <tr><th>归档人</th><td>${esc(r.filed_by || '—')}</td><th>归档时间</th><td>${esc(r.filed_at || '')}</td></tr>
  </table>
  <h4>审批流程</h4><div style="text-align:center;">${flowHTML || '<span style="color:#999;">无流程数据</span>'}</div>`;
  const w = window.open('', '_blank');
  if (!w) { ElMessage.warning('请允许弹出窗口以使用打印功能'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${formType}归档记录</title>
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
  </style></head><body>
  <h2>${formType}归档记录</h2>
  <div class="print-subtitle">四川卓盟科技有限公司</div>
  ${body}
  <div class="footer">打印人：${esc(user.value.name || '')} · 打印时间：${new Date().toLocaleString('zh-CN')}</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
</script>

<style scoped>
.zm-archive {
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
.card-header h3 { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.card-body { padding: 20px; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; transition: var(--transition); cursor: pointer; border: none; background: transparent; color: var(--text-primary); }
.btn-primary { background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: #fff; box-shadow: 0 4px 12px rgba(37,99,235,0.3); }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37,99,235,0.4); }
.btn-success { background: var(--success); color: #fff; }
.btn-info { background: var(--info); color: #fff; }
.btn-secondary { background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--bg-secondary); }
.btn-outline { background: #fff; color: var(--text-primary); border: 1px solid var(--border); }
.btn-outline:hover { border-color: var(--primary); color: var(--primary); }
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

.form-control { width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 14px; background: var(--bg-card); transition: var(--transition); font-family: inherit; }
.form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; animation: zmFadeIn 0.2s ease; }
.modal-box { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-width: 600px; width: 90%; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; animation: zmModalIn 0.3s ease; }
.modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.modal-close { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 20px; transition: var(--transition); border: none; background: transparent; cursor: pointer; }
.modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-light); display: flex; justify-content: flex-end; gap: 10px; }
@keyframes zmFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes zmModalIn { from { opacity: 0; transform: translateY(20px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
