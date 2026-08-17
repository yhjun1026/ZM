<template>
  <div class="supplier-page" v-loading="loading" element-loading-text="加载中...">
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

    <!-- 供应商档案矩阵 -->
    <div class="card">
      <div class="card-header space-between">
        <h3><el-icon color="#2563eb" style="margin-right:6px;vertical-align:-2px;"><Van /></el-icon>供应商档案矩阵</h3>
        <el-button v-if="canCreate" type="primary" size="small" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增供应商
        </el-button>
      </div>
      <div class="card-body">
        <div v-if="rows.length" class="matrix-grid">
          <div v-for="r in rows" :key="r.id" class="matrix-card">
            <div class="mc-top">
              <div>
                <div class="mc-name">
                  <el-icon :size="18" :color="levelColor(r.level)"><Van /></el-icon>
                  <strong style="font-size:15px;">{{ r.name }}</strong>
                </div>
                <div class="mc-id">{{ r.id }} · {{ r.short_name || r.category || '—' }}</div>
              </div>
              <span class="status-pill" :style="{ background: statusColor(r.status) + '15', color: statusColor(r.status) }">{{ r.status }}</span>
            </div>
            <div class="mc-grid">
              <div><el-icon><User /></el-icon> {{ r.contact || '—' }}</div>
              <div><el-icon><Phone /></el-icon> {{ r.phone || '—' }}</div>
              <div><el-icon><Folder /></el-icon> {{ r.category || '—' }}</div>
              <div><el-icon><Flag /></el-icon> <span :style="{ color: levelColor(r.level), fontWeight: 600 }">{{ r.level || 'C' }}</span></div>
              <div v-if="r.coop_date"><el-icon><Calendar /></el-icon> {{ r.coop_date }}</div>
              <div v-if="r.submitter"><el-icon><UserFilled /></el-icon> {{ r.submitter }}</div>
            </div>
            <div v-if="r.rating" class="mc-rating">
              <span class="stars">{{ starText(r.rating) }}</span>
              <span class="rating-num">{{ Number(r.rating).toFixed(1) }} 分</span>
            </div>
            <div v-if="r.business_scope" class="mc-block"><el-icon style="margin-right:6px;"><Suitcase /></el-icon>{{ r.business_scope }}</div>
            <div v-if="r.address" class="mc-block"><el-icon style="margin-right:6px;"><MapLocation /></el-icon>{{ r.address }}</div>
            <div v-if="currentStep(r)" class="mc-step" :style="{ background: statusColor(r.status) + '08' }">
              <el-icon :color="statusColor(r.status)"><ArrowRight /></el-icon>
              当前步骤：<strong :style="{ color: statusColor(r.status) }">{{ currentStep(r).step }}</strong>
            </div>
            <div class="mc-actions">
              <el-button size="small" title="详情" @click="openDetail(r)"><el-icon><View /></el-icon></el-button>
              <el-button size="small" type="info" title="打印档案" @click="printArchive(r.id)"><el-icon><Printer /></el-icon></el-button>
              <template v-if="canApproveCard(r)">
                <el-button size="small" type="primary" title="通过" @click="onApprove(r)"><el-icon><Check /></el-icon></el-button>
                <el-button size="small" title="驳回" @click="onReject(r)"><el-icon><Close /></el-icon></el-button>
              </template>
              <el-button v-if="canCreate" size="small" type="warning" title="编辑" @click="openEdit(r)"><el-icon><Edit /></el-icon></el-button>
              <el-button v-if="canCreate" size="small" type="danger" title="删除" @click="onDelete(r)"><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
        </div>
        <p v-else class="empty-text">暂无供应商数据</p>
      </div>
    </div>

    <!-- 供应商档案详情 -->
    <el-dialog v-model="detail.visible" title="供应商档案详情" width="700px">
      <template v-if="detail.row">
        <div style="margin-bottom:16px;">
          <h4 style="font-size:18px;font-weight:700;margin:0 0 8px;">{{ detail.row.name }}</h4>
          <div class="detail-meta">
            <span><el-icon><PriceTag /></el-icon> {{ detail.row.id }}</span>
            <span><el-icon><User /></el-icon> {{ detail.row.contact || '—' }}</span>
            <span><el-icon><Phone /></el-icon> {{ detail.row.phone || '—' }}</span>
            <span><el-icon><Flag /></el-icon> {{ detail.row.level || 'C' }}</span>
            <span><el-icon><Sunny /></el-icon> {{ detail.row.status }}</span>
            <span v-if="detail.row.submitter"><el-icon><UserFilled /></el-icon> {{ detail.row.submitter }}</span>
          </div>
          <div v-if="detail.row.rating" class="mc-rating" style="margin-top:8px;">
            <span class="stars">{{ starText(detail.row.rating) }}</span>
            <span class="rating-num">{{ Number(detail.row.rating).toFixed(1) }} 分</span>
          </div>
        </div>
        <div v-if="detail.row.address" class="detail-block"><el-icon style="margin-right:6px;"><MapLocation /></el-icon>{{ detail.row.address }}</div>
        <div v-if="detail.row.business_scope" class="detail-block"><el-icon style="margin-right:6px;"><Suitcase /></el-icon>{{ detail.row.business_scope }}</div>
        <div v-if="detail.row.remark" class="detail-block remark"><el-icon style="margin-right:6px;"><ChatDotRound /></el-icon>{{ detail.row.remark }}</div>

        <!-- 资质证书 -->
        <template v-if="detail.row.qualifications && detail.row.qualifications.length">
          <h4 class="sec-title">资质证书</h4>
          <div style="margin-bottom:16px;">
            <el-tag v-for="(q, i) in detail.row.qualifications" :key="i" size="small" style="margin:0 8px 8px 0;">
              {{ typeof q === 'string' ? q : (q.name || q.title || JSON.stringify(q)) }}
            </el-tag>
          </div>
        </template>

        <!-- 合作时间线 -->
        <template v-if="detail.row.timeline && detail.row.timeline.length">
          <h4 class="sec-title">合作时间线</h4>
          <el-timeline style="margin-bottom:16px;padding-left:4px;">
            <el-timeline-item
              v-for="(t, i) in detail.row.timeline"
              :key="i"
              :timestamp="t.date || t.time || ''"
              placement="top"
            >
              {{ t.event || t.content || t.title || '' }}
            </el-timeline-item>
          </el-timeline>
        </template>

        <!-- 审批流程 -->
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
        <el-button type="info" @click="printArchive(detail.row.id)"><el-icon><Printer /></el-icon> 打印档案</el-button>
      </template>
    </el-dialog>

    <!-- 供应商录入 / 编辑 -->
    <el-dialog v-model="form.visible" :title="form.isEdit ? '编辑供应商' : '供应商录入申请'" width="520px">
      <div v-if="!form.isEdit" class="form-tip">
        <el-icon><InfoFilled /></el-icon> 供应商录入需经五级审批：市场部负责人→行政部负责人→销售总监→总经理→执行
      </div>
      <el-form :model="form.data" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.data.name" placeholder="请输入供应商名称" />
        </el-form-item>
        <div class="form-2col">
          <el-form-item label="简称"><el-input v-model="form.data.short_name" placeholder="供应商简称" /></el-form-item>
          <el-form-item label="类别">
            <el-select v-model="form.data.category" style="width:100%;">
              <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-2col">
          <el-form-item label="等级">
            <el-select v-model="form.data.level" style="width:100%;">
              <el-option label="A级" value="A级" /><el-option label="B级" value="B级" /><el-option label="C级" value="C级" />
            </el-select>
          </el-form-item>
          <el-form-item label="联系人"><el-input v-model="form.data.contact" placeholder="联系人姓名" /></el-form-item>
        </div>
        <div class="form-2col">
          <el-form-item label="联系电话"><el-input v-model="form.data.phone" placeholder="联系电话" /></el-form-item>
          <el-form-item label="电子邮箱"><el-input v-model="form.data.email" placeholder="电子邮箱" /></el-form-item>
        </div>
        <template v-if="form.isEdit">
          <div class="form-2col">
            <el-form-item label="评级">
              <el-input-number v-model="form.data.rating" :min="0" :max="5" :step="0.5" style="width:100%;" controls-position="right" />
            </el-form-item>
            <el-form-item label="合作状态">
              <el-select v-model="form.data.status" style="width:100%;" clearable>
                <el-option label="待审批" value="待审批" /><el-option label="审批中" value="审批中" />
                <el-option label="合作中" value="合作中" /><el-option label="已驳回" value="已驳回" />
                <el-option label="已停用" value="已停用" />
              </el-select>
            </el-form-item>
          </div>
          <div class="form-2col">
            <el-form-item label="开户银行"><el-input v-model="form.data.bank" placeholder="开户银行" /></el-form-item>
            <el-form-item label="银行账号"><el-input v-model="form.data.account" placeholder="银行账号" /></el-form-item>
          </div>
        </template>
        <el-form-item label="地址"><el-input v-model="form.data.address" placeholder="供应商地址" /></el-form-item>
        <el-form-item label="经营范围"><el-input v-model="form.data.business_scope" placeholder="经营范围" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="form.visible = false">取消</el-button>
        <el-button type="primary" :loading="form.saving" @click="onSubmit">{{ form.isEdit ? '保存' : '提交申请' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, View, Printer, Check, Close, Edit, Delete, User, UserFilled, Phone, Folder, Flag,
  Calendar, MapLocation, ArrowRight, Van, Clock, Star, Loading, Right, InfoFilled,
  PriceTag, Sunny, ChatDotRound, Suitcase, CircleCheck, Link,
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const rows = ref([]);
const categories = ['电子设备', '办公用品', 'IT设备', '商务服务', '物流运输', '其他'];

/* ===== 权限（对齐参考项目 rbac.js canAccess） ===== */
function canAccess(action) {
  const u = auth.user;
  if (!u) return false;
  const { role, dept } = u;
  if (action === 'createSupplierApplication') {
    return role === '总经理' || role === '超级管理员'
      || (dept === '行政部' && (role === '普通员工' || role === '部门经理'));
  }
  if (action === 'approveSupplierApplication') {
    return role === '总经理' || role === '超级管理员' || role === '副总' || role === '销售总监'
      || (role === '部门经理' && dept === '行政部');
  }
  return false;
}
const canCreate = computed(() => canAccess('createSupplierApplication'));

/* ===== 数据加载 ===== */
async function load() {
  loading.value = true;
  try {
    const res = await request.get('/suppliers');
    if (res.code === 200) rows.value = res.data || [];
    else ElMessage.error(res.msg || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const stats = computed(() => [
  { label: '供应商总数', value: rows.value.length + '家', icon: Van, color: '#2563eb' },
  { label: '合作中', value: rows.value.filter((r) => r.status === '合作中').length + '家', icon: Link, color: '#10b981' },
  { label: '待审批', value: rows.value.filter((r) => r.status === '待审批' || r.status === '审批中').length + '家', icon: Clock, color: '#f59e0b' },
  { label: 'A级供应商', value: rows.value.filter((r) => r.level === 'A级').length + '家', icon: Star, color: '#8b5cf6' },
]);

/* ===== 卡片辅助 ===== */
function levelColor(level) {
  return level === 'A级' ? '#10b981' : level === 'B级' ? '#2563eb' : '#f59e0b';
}
function statusColor(status) {
  return status === '待审批' ? '#f59e0b' : status === '合作中' ? '#10b981'
    : status === '已驳回' ? '#ef4444' : status === '审批中' ? '#3b82f6' : '#6b7280';
}
function starText(rating) {
  const n = Math.round(rating || 0);
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
}
function currentStep(r) {
  return (r.approval_flow || []).find((f) => !f.done) || null;
}
function canApproveCard(r) {
  const u = auth.user;
  if (!u) return false;
  const step = currentStep(r);
  if (!step || !canAccess('approveSupplierApplication')) return false;
  const { role, dept } = u;
  const s = step.step;
  return (
    (s.includes('市场部负责人') && ((role === '部门经理' && dept === '市场部') || role === '超级管理员'))
    || (s.includes('行政部负责人') && ((role === '部门经理' && dept === '行政部') || role === '超级管理员'))
    || (s.includes('销售总监') && (role === '销售总监' || role === '超级管理员'))
    || (s.includes('总经理') && (role === '总经理' || role === '超级管理员'))
  );
}

/* ===== 工作流图 ===== */
function isCurrent(flow, i) {
  return !flow[i].done && (i === 0 || flow.slice(0, i).every((s) => s.done));
}
function wfClass(flow, f, i) {
  return f.done ? 'wf-done' : isCurrent(flow, i) ? 'wf-current' : 'wf-pending';
}

/* ===== 详情 ===== */
const detail = reactive({ visible: false, row: null, flow: [] });
async function openDetail(r) {
  const res = await request.get('/suppliers/' + r.id);
  if (res.code === 200) {
    detail.row = res.data;
    detail.flow = res.data.approval_flow || [];
    detail.visible = true;
  } else ElMessage.error(res.msg || '加载失败');
}

/* ===== 新增 / 编辑 ===== */
const blankForm = () => ({
  name: '', short_name: '', category: '电子设备', level: 'A级', contact: '',
  phone: '', email: '', address: '', business_scope: '', bank: '', account: '', rating: 0, status: '',
});
const form = reactive({ visible: false, isEdit: false, saving: false, id: null, data: blankForm() });
function openCreate() {
  if (!canAccess('createSupplierApplication')) { ElMessage.warning('无权录入供应商'); return; }
  form.isEdit = false; form.id = null; form.data = blankForm(); form.visible = true;
}
function openEdit(r) {
  form.isEdit = true; form.id = r.id;
  form.data = {
    name: r.name || '', short_name: r.short_name || '', category: r.category || '其他',
    level: r.level || 'C级', contact: r.contact || '', phone: r.phone || '', email: r.email || '',
    address: r.address || '', business_scope: r.business_scope || '',
    bank: r.bank || '', account: r.account || '', rating: r.rating || 0, status: r.status || '',
  };
  form.visible = true;
}
async function onSubmit() {
  if (!form.data.name) { ElMessage.warning('请输入供应商名称'); return; }
  form.saving = true;
  try {
    let res;
    if (form.isEdit) {
      res = await request.put('/suppliers/' + form.id, form.data);
    } else {
      const { name, short_name, category, level, contact, phone, email, address, business_scope } = form.data;
      res = await request.post('/suppliers', { name, short_name, category, level, contact, phone, email, address, business_scope });
    }
    if (res.code === 200) {
      ElMessage.success(form.isEdit ? (res.msg || '供应商更新成功') : '供应商申请已提交，等待审批');
      form.visible = false;
      load();
    } else ElMessage.error(res.msg || '提交失败');
  } finally {
    form.saving = false;
  }
}

/* ===== 审批 / 驳回 / 删除 ===== */
async function onApprove(r) {
  try {
    await ElMessageBox.confirm('确认审批通过？', '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.post(`/suppliers/${r.id}/approve`);
  if (res.code === 200) { ElMessage.success(res.msg || '审批通过'); load(); }
  else ElMessage.error(res.msg || '审批失败');
}
async function onReject(r) {
  let remark;
  try {
    const ret = await ElMessageBox.prompt('请输入驳回原因：', '驳回供应商申请', {
      confirmButtonText: '确定', cancelButtonText: '取消', inputPlaceholder: '驳回原因',
    });
    remark = ret.value || '';
  } catch { return; }
  const res = await request.post(`/suppliers/${r.id}/reject`, { remark });
  if (res.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function onDelete(r) {
  try {
    await ElMessageBox.confirm(`确认删除供应商「${r.name}」？`, '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.delete('/suppliers/' + r.id);
  if (res.code === 200) { ElMessage.success(res.msg || '供应商已删除'); load(); }
  else ElMessage.error(res.msg || '删除失败');
}

/* ===== 打印档案（对齐参考项目 printSupplierArchive） ===== */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function printArchive(id) {
  const res = await request.get('/suppliers/' + id);
  if (res.code !== 200) { ElMessage.error(res.msg || '加载失败'); return; }
  const r = res.data;
  const flow = r.approval_flow || [];
  const stars = '★'.repeat(Math.round(r.rating || 0)) + '☆'.repeat(Math.max(0, 5 - Math.round(r.rating || 0)));
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>供应商档案 - ${esc(r.name)}</title>
    <style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:40px;color:#333;}
      h1{text-align:center;font-size:24px;margin:0 0 8px;}
      .subtitle{text-align:center;color:#666;font-size:14px;margin-bottom:30px;}
      .info-table{width:100%;border-collapse:collapse;margin-bottom:24px;}
      .info-table td{border:1px solid #ddd;padding:10px 14px;font-size:14px;}
      .info-table td.label{background:#f5f5f5;font-weight:bold;width:120px;}
      .flow-section{margin:24px 0;}
      .flow-step{display:flex;align-items:center;margin-bottom:12px;}
      .flow-step .icon{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;font-size:14px;}
      .flow-step.done .icon{background:#10b981;color:#fff;}
      .flow-step.pending .icon{background:#f5f5f5;color:#999;}
      .flow-step .info{flex:1;}
      .flow-step .step-name{font-weight:bold;font-size:14px;}
      .flow-step .step-user{font-size:12px;color:#666;}
      .flow-arrow{text-align:center;color:#999;margin:4px 0 4px 14px;}
      .footer{margin-top:40px;text-align:right;font-size:12px;color:#999;}
    </style></head><body>
    <h1>供应商档案登记表</h1>
    <p class="subtitle">四川卓盟科技有限公司 · 卓盟智办公平台</p>
    <table class="info-table">
      <tr><td class="label">供应商编号</td><td>${esc(r.id)}</td><td class="label">供应商名称</td><td>${esc(r.name)}</td></tr>
      <tr><td class="label">简称</td><td>${esc(r.short_name || '—')}</td><td class="label">类别</td><td>${esc(r.category || '—')}</td></tr>
      <tr><td class="label">等级</td><td>${esc(r.level || 'C')}</td><td class="label">评级</td><td>${stars}</td></tr>
      <tr><td class="label">联系人</td><td>${esc(r.contact || '—')}</td><td class="label">联系电话</td><td>${esc(r.phone || '—')}</td></tr>
      <tr><td class="label">电子邮箱</td><td>${esc(r.email || '—')}</td><td class="label">合作状态</td><td>${esc(r.status)}</td></tr>
      <tr><td class="label">合作日期</td><td>${esc(r.coop_date || '—')}</td><td class="label">订单总数</td><td>${r.total_orders || 0}</td></tr>
      <tr><td class="label">订单总额</td><td>¥${Number(r.total_amount || 0).toLocaleString()}</td><td class="label">开户银行</td><td>${esc(r.bank || '—')}</td></tr>
      <tr><td class="label">银行账号</td><td>${esc(r.account || '—')}</td><td class="label">经营范围</td><td>${esc(r.business_scope || '—')}</td></tr>
      <tr><td class="label">供应商地址</td><td colspan="3">${esc(r.address || '—')}</td></tr>
      <tr><td class="label">录入人</td><td>${esc(r.submitter || '—')}</td><td class="label">录入部门</td><td>${esc(r.applicant_dept || '—')}</td></tr>
      ${r.remark ? `<tr><td class="label">备注</td><td colspan="3">${esc(r.remark)}</td></tr>` : ''}
    </table>
    ${flow && flow.length ? `
    <div class="flow-section">
      <h3 style="font-size:16px;border-bottom:2px solid #2563eb;padding-bottom:6px;">审批流程</h3>
      ${flow.map((f) => `
        <div class="flow-step ${f.done ? 'done' : 'pending'}">
          <div class="icon">${f.done ? '✓' : '○'}</div>
          <div class="info">
            <div class="step-name">${esc(f.step)}</div>
            <div class="step-user">${esc(f.user || '')} ${f.time && f.time !== '—' ? '· ' + esc(f.time) : ''}</div>
          </div>
        </div>
      `).join('<div class="flow-arrow">↓</div>')}
    </div>` : ''}
    <div class="footer">打印日期：${new Date().toLocaleDateString('zh-CN')} · 卓盟智办公平台</div>
    </body></html>
  `);
  w.document.close();
  w.print();
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

.matrix-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.matrix-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: #fff; transition: box-shadow 0.2s; }
.matrix-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
.mc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.mc-name { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.mc-id { font-size: 12px; color: #9ca3af; }
.status-pill { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.mc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #4b5563; margin-bottom: 12px; }
.mc-grid .el-icon { width: 16px; color: #9ca3af; vertical-align: -2px; }
.mc-rating { margin-bottom: 12px; font-size: 13px; }
.mc-rating .stars { color: #f59e0b; letter-spacing: 2px; margin-right: 8px; }
.mc-rating .rating-num { color: #9ca3af; font-size: 12px; }
.mc-block { font-size: 12px; color: #6b7280; margin-bottom: 12px; padding: 8px; background: #f5f7fa; border-radius: 6px; }
.mc-step { font-size: 12px; padding: 6px 10px; border-radius: 6px; margin-bottom: 12px; }
.mc-step .el-icon { vertical-align: -2px; }
.mc-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.mc-actions .el-button { margin-left: 0; }
.empty-text { text-align: center; color: #9ca3af; padding: 40px 0; }

.detail-meta { display: flex; gap: 20px; font-size: 13px; color: #6b7280; flex-wrap: wrap; }
.detail-meta .el-icon { vertical-align: -2px; }
.detail-block { margin-bottom: 12px; padding: 10px; background: #f5f7fa; border-radius: 8px; font-size: 13px; }
.detail-block.remark { background: #fef3c7; }
.sec-title { margin: 0 0 12px; font-size: 15px; }

.form-tip { margin-bottom: 12px; padding: 10px; background: #dbeafe; border-radius: 8px; font-size: 13px; color: #1e40af; }
.form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

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
