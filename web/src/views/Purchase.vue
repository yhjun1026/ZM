<template>
  <div class="purchase-page" v-loading="loading" element-loading-text="加载中...">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div v-for="s in stats" :key="s.label" class="stat-card">
        <div class="stat-bar" :style="{ background: s.color }"></div>
        <div class="stat-inner">
          <div>
            <p class="stat-label">{{ s.label }}</p>
            <p class="stat-value" :style="{ color: s.color }">{{ s.value }}</p>
          </div>
          <div class="stat-icon" :style="{ background: s.color + '15' }">
            <el-icon :size="22" :color="s.color"><component :is="s.icon" /></el-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- 采购列表 -->
    <div class="card">
      <div class="card-header space-between">
        <h3>采购管理</h3>
        <el-button v-if="canCreate" type="primary" size="small" @click="openCreate">
          <el-icon><Plus /></el-icon> 采购申请
        </el-button>
      </div>
      <div class="card-body">
        <el-table :data="rows" stripe>
          <el-table-column prop="id" label="编号" width="150" />
          <el-table-column label="标题" min-width="160">
            <template #default="{ row }">
              <el-link type="primary" :underline="false" @click="openDetail(row)">{{ row.title }}</el-link>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="类别" width="100" />
          <el-table-column label="金额(¥)" width="120">
            <template #default="{ row }">¥{{ Number(row.amount || 0).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="applicant" label="申请人" width="100" />
          <el-table-column prop="applicant_dept" label="部门" width="100" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="info" title="详情" @click="openDetail(row)"><el-icon><View /></el-icon></el-button>
              <template v-if="canApproveRow(row)">
                <el-button size="small" type="success" title="通过" @click="onApprove(row)"><el-icon><Check /></el-icon></el-button>
                <el-button size="small" type="danger" title="驳回" @click="onReject(row)"><el-icon><Close /></el-icon></el-button>
              </template>
              <el-button size="small" title="流程" @click="openWorkflow(row)"><el-icon><Share /></el-icon></el-button>
            </template>
          </el-table-column>
          <template #empty><span style="color:#9ca3af;">暂无采购</span></template>
        </el-table>
      </div>
    </div>

    <!-- 采购申请 -->
    <el-dialog v-model="form.visible" :title="`采购申请（${auth.user?.dept || ''}）`" width="520px">
      <el-form :model="form.data" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="form.data.title" placeholder="采购物品名称" />
        </el-form-item>
        <div class="form-2col">
          <el-form-item label="类别">
            <el-select v-model="form.data.category" style="width:100%;">
              <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
          <el-form-item label="金额(¥)" required>
            <el-input-number v-model="form.data.amount" :min="0" :precision="2" style="width:100%;" controls-position="right" />
          </el-form-item>
        </div>
        <div class="form-2col">
          <el-form-item label="数量">
            <el-input-number v-model="form.data.qty" :min="1" style="width:100%;" controls-position="right" />
          </el-form-item>
          <el-form-item label="单位"><el-input v-model="form.data.unit" /></el-form-item>
        </div>
        <el-form-item label="供应商"><el-input v-model="form.data.vendor" placeholder="供应商名称" /></el-form-item>
        <el-form-item label="采购说明">
          <el-input v-model="form.data.desc" type="textarea" :rows="3" placeholder="详细说明采购需求和用途" />
        </el-form-item>
        <div class="form-tip">
          <el-icon><InfoFilled /></el-icon>
          <span v-if="isMarket">提交后需<strong>市场部负责人 → 销售总监 → 财务负责人 → 总经理</strong>四级审批</span>
          <span v-else>提交后需<strong>部门负责人 → 副总 → 总经理</strong>审批</span>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="form.visible = false">取消</el-button>
        <el-button type="primary" :loading="form.saving" @click="onSubmit">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 采购详情 -->
    <el-dialog v-model="detail.visible" :title="`采购详情 — ${detail.row?.title || ''}`" width="680px">
      <template v-if="detail.row">
        <div class="detail-grid">
          <div><strong>编号：</strong>{{ detail.row.id }}</div>
          <div><strong>类别：</strong>{{ detail.row.category }}</div>
          <div><strong>金额：</strong>¥{{ Number(detail.row.amount || 0).toLocaleString() }}</div>
          <div><strong>数量：</strong>{{ detail.row.qty || 0 }}{{ detail.row.unit || '' }}</div>
          <div><strong>申请人：</strong>{{ detail.row.applicant }}</div>
          <div><strong>部门：</strong>{{ detail.row.applicant_dept }}</div>
          <div><strong>供应商：</strong>{{ detail.row.vendor || '—' }}</div>
          <div><strong>状态：</strong><el-tag :type="statusTagType(detail.row.status)" size="small">{{ detail.row.status }}</el-tag></div>
        </div>
        <div v-if="detail.row.desc" class="detail-desc"><strong>采购说明：</strong>{{ detail.row.desc }}</div>
        <h4 style="margin:0 0 12px;font-size:15px;">审批流程</h4>
        <div v-if="detail.flow.length" class="wf-container">
          <div class="wf-track">
            <template v-for="(f, i) in detail.flow" :key="i">
              <div class="wf-step" :class="wfClass(detail.flow, f, i)">
                <div class="wf-icon">
                  <el-icon v-if="f.done" :size="20"><CircleCheck /></el-icon>
                  <el-icon v-else-if="isCurrent(detail.flow, i)" :size="20" class="is-loading"><Loading /></el-icon>
                  <span v-else class="wf-dot">○</span>
                </div>
                <div class="wf-name">{{ f.step }}</div>
                <div class="wf-user">{{ f.user || (f.done ? '已完成' : '待处理') }}</div>
                <div v-if="f.time && f.time !== '—'" class="wf-time">{{ f.time }}</div>
              </div>
              <div v-if="i < detail.flow.length - 1" class="wf-arrow"><el-icon><Right /></el-icon></div>
            </template>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="detail.visible = false">关闭</el-button>
        <template v-if="detail.row && canApproveRow(detail.row)">
          <el-button type="success" @click="detail.visible = false; onApprove(detail.row)"><el-icon><Check /></el-icon> 通过</el-button>
          <el-button type="danger" @click="detail.visible = false; onReject(detail.row)"><el-icon><Close /></el-icon> 驳回</el-button>
        </template>
        <el-button type="info" @click="printFlow(detail.row)"><el-icon><Printer /></el-icon> 打印</el-button>
      </template>
    </el-dialog>

    <!-- 审批流程详情 -->
    <el-dialog v-model="wf.visible" title="审批流程详情" width="750px">
      <template v-if="wf.row">
        <table class="wf-table">
          <tbody>
            <tr><th>标题</th><td>{{ wf.row.title }}</td><th>类别</th><td>{{ wf.row.category }}</td></tr>
            <tr><th>金额</th><td>¥{{ Number(wf.row.amount || 0).toLocaleString() }}</td><th>数量</th><td>{{ wf.row.qty || 0 }}{{ wf.row.unit || '' }}</td></tr>
            <tr>
              <th>状态</th>
              <td><el-tag :type="statusTagType(wf.row.status)" size="small">{{ wf.row.status }}</el-tag></td>
              <th>供应商</th><td>{{ wf.row.vendor || '' }}</td>
            </tr>
          </tbody>
        </table>
        <h4 style="margin:0 0 12px;font-size:15px;">工作流程</h4>
        <div v-if="wf.flow.length" class="wf-container">
          <div class="wf-track">
            <template v-for="(f, i) in wf.flow" :key="i">
              <div class="wf-step" :class="wfClass(wf.flow, f, i)">
                <div class="wf-icon">
                  <el-icon v-if="f.done" :size="20"><CircleCheck /></el-icon>
                  <el-icon v-else-if="isCurrent(wf.flow, i)" :size="20" class="is-loading"><Loading /></el-icon>
                  <span v-else class="wf-dot">○</span>
                </div>
                <div class="wf-name">{{ f.step }}</div>
                <div class="wf-user">{{ f.user || (f.done ? '已完成' : '待处理') }}</div>
                <div v-if="f.time && f.time !== '—'" class="wf-time">{{ f.time }}</div>
              </div>
              <div v-if="i < wf.flow.length - 1" class="wf-arrow"><el-icon><Right /></el-icon></div>
            </template>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button @click="wf.visible = false">关闭</el-button>
        <el-button type="primary" @click="printFlow(wf.row)"><el-icon><Printer /></el-icon> 打印流程</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, View, Check, Close, Share, Printer, ShoppingCart, Clock, Van, CircleCheck,
  Loading, Right, InfoFilled,
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const rows = ref([]);
const categories = ['电子设备', '办公用品', 'IT设备', '商务礼品', '原材料', '其他'];

/* ===== 权限（对齐参考项目 rbac.js canAccess + checkPurchaseApprovePermission） ===== */
function canAccess(action) {
  const u = auth.user;
  if (!u) return false;
  const { role, dept } = u;
  if (action === 'createPurchase') {
    return role === '总经理' || role === '超级管理员' || role === '部门经理'
      || (role === '普通员工' && (dept === '市场部' || dept === '财务部' || dept === '技术部'));
  }
  if (action === 'approvePurchase') {
    return role === '总经理' || role === '超级管理员' || role === '副总'
      || role === '部门经理' || role === '销售总监';
  }
  return false;
}
const canCreate = computed(() => canAccess('createPurchase'));
const isMarket = computed(() => auth.user?.dept === '市场部');

function currentStep(r) {
  return (r.flow || []).find((f) => !f.done) || null;
}
function checkApprovePermission(stepName) {
  const u = auth.user;
  if (!u) return false;
  const { role, dept } = u;
  if (role === '超级管理员' || role === '总经理') return true;
  if (stepName.includes('市场部负责人')) return role === '部门经理' && dept === '市场部';
  if (stepName.includes('销售总监')) return role === '销售总监';
  if (stepName.includes('财务负责人')) return dept === '财务部' && (role === '普通员工' || role === '部门经理');
  if (stepName.includes('总经理')) return false;
  if (stepName.includes('副总')) return role === '副总';
  if (stepName.includes('部门负责人')) return role === '部门经理';
  return canAccess('approvePurchase');
}
function canApproveRow(r) {
  const step = currentStep(r);
  return canAccess('approvePurchase') && r.status === '待审批' && !!step && checkApprovePermission(step.step);
}

/* ===== 数据加载 ===== */
async function load() {
  loading.value = true;
  try {
    const res = await request.get('/purchases');
    if (res.code === 200) rows.value = res.data || [];
    else ElMessage.error(res.msg || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const stats = computed(() => [
  { label: '采购总数', value: rows.value.length + '件', icon: ShoppingCart, color: '#2563eb' },
  { label: '待审批', value: rows.value.filter((r) => r.status === '待审批').length + '件', icon: Clock, color: '#f59e0b' },
  { label: '采购中', value: rows.value.filter((r) => r.status === '采购中').length + '件', icon: Van, color: '#8b5cf6' },
  { label: '已入库', value: rows.value.filter((r) => r.status === '已入库').length + '件', icon: CircleCheck, color: '#10b981' },
]);

function statusTagType(s) {
  return s === '已入库' || s === '采购中' ? 'success' : s === '待审批' ? 'warning' : s === '已驳回' ? 'danger' : 'primary';
}

/* ===== 工作流图 ===== */
function isCurrent(flow, i) {
  return !flow[i].done && (i === 0 || flow.slice(0, i).every((s) => s.done));
}
function wfClass(flow, f, i) {
  return f.done ? 'wf-done' : isCurrent(flow, i) ? 'wf-current' : 'wf-pending';
}

/* ===== 采购申请 ===== */
const form = reactive({
  visible: false, saving: false,
  data: { title: '', category: '电子设备', amount: null, qty: 1, unit: '个', vendor: '', desc: '' },
});
function openCreate() {
  if (!canAccess('createPurchase')) { ElMessage.warning('无权发起采购'); return; }
  form.data = { title: '', category: '电子设备', amount: null, qty: 1, unit: '个', vendor: '', desc: '' };
  form.visible = true;
}
async function onSubmit() {
  if (!form.data.title) { ElMessage.warning('请输入标题'); return; }
  if (!form.data.amount) { ElMessage.warning('请输入金额'); return; }
  form.saving = true;
  try {
    const res = await request.post('/purchases', { ...form.data });
    if (res.code === 200) {
      ElMessage.success(res.msg || '采购申请已提交');
      form.visible = false;
      load();
    } else ElMessage.error(res.msg || '提交失败');
  } finally {
    form.saving = false;
  }
}

/* ===== 审批 / 驳回 ===== */
async function onApprove(row) {
  try {
    await ElMessageBox.confirm('确认审批通过？', '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.post(`/purchases/${row.id}/approve`);
  if (res.code === 200) { ElMessage.success(res.msg || '审批通过'); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function onReject(row) {
  let remark;
  try {
    const ret = await ElMessageBox.prompt('请输入驳回原因：', '驳回采购申请', {
      confirmButtonText: '确定', cancelButtonText: '取消', inputPlaceholder: '驳回原因',
    });
    remark = ret.value;
  } catch { return; }
  const res = await request.post(`/purchases/${row.id}/reject`, { remark });
  if (res.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(res.msg || '操作失败');
}

/* ===== 详情 / 流程 ===== */
const detail = reactive({ visible: false, row: null, flow: [] });
function openDetail(row) {
  detail.row = row;
  detail.flow = row.flow || [];
  detail.visible = true;
}
const wf = reactive({ visible: false, row: null, flow: [] });
function openWorkflow(row) {
  wf.row = row;
  wf.flow = row.flow || [];
  wf.visible = true;
}

/* ===== 打印流程（对齐参考项目 printWorkflow） ===== */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function printFlow(row) {
  if (!row) return;
  const flow = row.flow || [];
  const statusCls = row.status === '已入库' ? 'tag-green' : row.status === '待审批' ? 'tag-yellow' : 'tag-blue';
  const stepsHtml = flow.map((f, i) => {
    const cls = f.done ? 'wf-done' : (i === 0 || flow.slice(0, i).every((s) => s.done)) ? 'wf-current' : 'wf-pending';
    const arrow = i < flow.length - 1 ? '<span class="wf-arrow">›</span>' : '';
    return `<span class="wf-step ${cls}"><div class="wf-name">${esc(f.step)}</div><div>${esc(f.user || (f.done ? '已完成' : '待处理'))}</div>${f.time && f.time !== '—' ? `<div class="wf-time">${esc(f.time)}</div>` : ''}</span>${arrow}`;
  }).join('');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>审批流程</title><style>
    body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:750px;margin:0 auto;}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}
    th{background:#f5f5f5;}
    .wf-step{display:inline-block;text-align:center;padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:12px;vertical-align:middle;}
    .wf-arrow{display:inline-block;color:#999;margin:0 2px;}
    .wf-done{background:#d1fae5;border-color:#10b981;}
    .wf-current{background:#fef3c7;border-color:#f59e0b;}
    .wf-pending{background:#f9fafb;border-color:#d1d5db;}
    .wf-name{font-weight:bold;margin-bottom:4px;}
    .wf-time{color:#666;font-size:11px;}
    h4{font-size:16px;}h3{font-size:18px;}
    .tag-green{color:#10b981;font-weight:bold;}.tag-yellow{color:#f59e0b;font-weight:bold;}.tag-blue{color:#2563eb;font-weight:bold;}
  </style></head><body>
  <h3>采购详情 — ${esc(row.title)}</h3>
  <table>
    <tr><th>标题</th><td>${esc(row.title)}</td><th>类别</th><td>${esc(row.category)}</td></tr>
    <tr><th>金额</th><td>¥${Number(row.amount || 0).toLocaleString()}</td><th>数量</th><td>${row.qty || 0}${esc(row.unit || '')}</td></tr>
    <tr><th>状态</th><td><span class="${statusCls}">${esc(row.status)}</span></td><th>供应商</th><td>${esc(row.vendor || '')}</td></tr>
    ${row.desc ? `<tr><th>采购说明</th><td colspan="3">${esc(row.desc)}</td></tr>` : ''}
  </table>
  <h4>工作流程</h4>
  <div>${stepsHtml}</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
</script>

<style scoped>
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card { position: relative; padding: 20px; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
.stat-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 12px 12px 0 0; }
.stat-inner { display: flex; align-items: center; justify-content: space-between; }
.stat-label { font-size: 12px; margin: 0 0 6px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
.stat-value { font-size: 26px; font-weight: 700; margin: 0; }
.stat-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 24px; }
.card-header { padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
.card-header.space-between { display: flex; justify-content: space-between; align-items: center; }
.card-header h3 { margin: 0; font-size: 16px; }
.card-body { padding: 20px; }

.form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-tip { padding: 8px 12px; border-radius: 8px; background: #f5f7fa; font-size: 13px; color: #606266; margin-bottom: 10px; }
.form-tip .el-icon { vertical-align: -2px; margin-right: 4px; }

.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; font-size: 14px; }
.detail-desc { margin-bottom: 16px; padding: 12px; background: #f5f7fa; border-radius: 8px; font-size: 13px; }

.wf-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
.wf-table th, .wf-table td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
.wf-table th { background: #f5f7fa; width: 90px; }

/* 工作流图（抄自参考项目 style.css wf-*） */
.wf-container { overflow-x: auto; padding: 16px 8px; background: #f5f7fa; border-radius: 10px; margin-top: 8px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px; }
.wf-track { display: flex; align-items: center; gap: 4px; min-width: max-content; }
.wf-step { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 16px; border-radius: 10px; border: 2px solid; min-width: 100px; text-align: center; }
.wf-step .wf-icon { font-size: 20px; line-height: 1; }
.wf-name { font-size: 13px; font-weight: 600; white-space: nowrap; }
.wf-user { font-size: 11px; color: #9ca3af; white-space: nowrap; }
.wf-time { font-size: 10px; color: #9ca3af; opacity: 0.8; }
.wf-done { background: #ecfdf5; border-color: #10b981; }
.wf-done .wf-icon { color: #10b981; }
.wf-current { background: #fef3c7; border-color: #f59e0b; animation: wfPulse 2s ease-in-out infinite; }
.wf-current .wf-icon { color: #f59e0b; }
.wf-pending { background: #fff; border-color: #e5e7eb; opacity: 0.65; }
.wf-pending .wf-icon { color: #9ca3af; }
.wf-dot { font-size: 18px; }
.wf-arrow { flex-shrink: 0; color: #9ca3af; font-size: 14px; padding: 0 2px; }
@keyframes wfPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
}
</style>
