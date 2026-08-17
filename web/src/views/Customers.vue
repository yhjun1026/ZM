<template>
  <div class="customers-page" v-loading="loading" element-loading-text="加载中...">
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

    <!-- 卡片矩阵（待审批区 + 全部档案区） -->
    <template v-for="sec in sections" :key="sec.title">
      <div v-if="sec.always || sec.list.length" class="card" :style="sec.border ? 'border-left:4px solid #f59e0b;' : ''">
        <div class="card-header" :class="{ 'space-between': sec.action }">
          <h3>
            <el-icon :color="sec.iconColor" style="margin-right:6px;vertical-align:-2px;"><component :is="sec.icon" /></el-icon>{{ sec.title }}
          </h3>
          <el-button v-if="sec.action && canCreate" type="primary" size="small" @click="openCreate">
            <el-icon><Plus /></el-icon> 录入客户
          </el-button>
        </div>
        <div class="card-body">
          <div v-if="sec.list.length" class="matrix-grid">
            <div v-for="r in sec.list" :key="r.id" class="matrix-card">
              <div class="mc-top">
                <div>
                  <div class="mc-name">
                    <el-icon :size="20" :color="levelColor(r.level)"><OfficeBuilding /></el-icon>
                    <strong style="font-size:15px;">{{ r.name }}</strong>
                  </div>
                  <div class="mc-id">{{ r.id }}</div>
                </div>
                <span class="status-pill" :style="{ background: statusColor(r.status) + '15', color: statusColor(r.status) }">{{ r.status }}</span>
              </div>
              <div class="mc-grid">
                <div><el-icon><User /></el-icon> {{ r.contact || '—' }}</div>
                <div><el-icon><Phone /></el-icon> {{ r.phone || '—' }}</div>
                <div><el-icon><Grid /></el-icon> {{ r.industry || '—' }}</div>
                <div><el-icon><Flag /></el-icon> <span :style="{ color: levelColor(r.level), fontWeight: 600 }">{{ r.level || 'C' }}</span></div>
                <div><el-icon><UserFilled /></el-icon> {{ r.owner || '—' }}</div>
                <div><el-icon><PriceTag /></el-icon> {{ r.source || '—' }}</div>
              </div>
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
          <p v-else class="empty-text">暂无客户数据</p>
        </div>
      </div>
    </template>

    <!-- 客户档案详情 -->
    <el-dialog v-model="detail.visible" title="客户档案详情" width="700px">
      <template v-if="detail.row">
        <div style="margin-bottom:16px;">
          <h4 style="font-size:18px;font-weight:700;margin:0 0 8px;">{{ detail.row.name }}</h4>
          <div class="detail-meta">
            <span><el-icon><PriceTag /></el-icon> {{ detail.row.id }}</span>
            <span><el-icon><User /></el-icon> {{ detail.row.contact || '—' }}</span>
            <span><el-icon><Phone /></el-icon> {{ detail.row.phone || '—' }}</span>
            <span><el-icon><Message /></el-icon> {{ detail.row.email || '—' }}</span>
            <span><el-icon><Grid /></el-icon> {{ detail.row.industry || '—' }}</span>
            <span><el-icon><Flag /></el-icon> {{ detail.row.level || 'C' }}</span>
            <span><el-icon><UserFilled /></el-icon> {{ detail.row.owner || '—' }}</span>
            <span><el-icon><Sunny /></el-icon> {{ detail.row.status }}</span>
          </div>
        </div>
        <div v-if="detail.row.address" class="detail-block"><el-icon style="margin-right:6px;"><MapLocation /></el-icon>{{ detail.row.address }}</div>
        <div v-if="detail.row.remark" class="detail-block remark"><el-icon style="margin-right:6px;"><ChatDotRound /></el-icon>{{ detail.row.remark }}</div>
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

    <!-- 客户录入 / 编辑 -->
    <el-dialog v-model="form.visible" :title="form.isEdit ? '编辑客户' : '客户录入申请'" width="520px">
      <div v-if="!form.isEdit" class="form-tip">
        <el-icon><InfoFilled /></el-icon> 客户录入需经四级审批：行政部负责人→销售总监→总经理→执行
      </div>
      <el-form :model="form.data" label-width="80px">
        <el-form-item label="客户名称" required>
          <el-input v-model="form.data.name" placeholder="请输入客户名称" />
        </el-form-item>
        <div class="form-2col">
          <el-form-item label="联系人"><el-input v-model="form.data.contact" placeholder="联系人姓名" /></el-form-item>
          <el-form-item label="联系电话"><el-input v-model="form.data.phone" placeholder="联系电话" /></el-form-item>
        </div>
        <div class="form-2col">
          <el-form-item label="客户等级">
            <el-select v-model="form.data.level" style="width:100%;">
              <el-option label="A级" value="A级" /><el-option label="B级" value="B级" /><el-option label="C级" value="C级" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属行业"><el-input v-model="form.data.industry" placeholder="如：IT/制造/金融" /></el-form-item>
        </div>
        <div class="form-2col">
          <el-form-item label="客户来源"><el-input v-model="form.data.source" placeholder="如：展会/推荐/网络" /></el-form-item>
          <el-form-item label="负责人"><el-input v-model="form.data.owner" placeholder="负责人姓名" /></el-form-item>
        </div>
        <el-form-item label="邮箱"><el-input v-model="form.data.email" placeholder="电子邮箱" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="form.data.address" placeholder="客户地址" /></el-form-item>
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
  Plus, View, Printer, Check, Close, Edit, Delete, User, UserFilled, Phone, Grid, Flag,
  PriceTag, MapLocation, ArrowRight, OfficeBuilding, Clock, CircleCheck, CircleClose,
  Loading, Right, InfoFilled, Message, Sunny, ChatDotRound,
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const rows = ref([]);

/* ===== 权限（对齐参考项目 rbac.js canAccess） ===== */
function canAccess(action) {
  const u = auth.user;
  if (!u) return false;
  const { role, dept } = u;
  if (action === 'createCustomerApplication') {
    return role === '总经理' || role === '超级管理员'
      || (dept === '行政部' && (role === '普通员工' || role === '部门经理'));
  }
  if (action === 'approveCustomerApplication') {
    return role === '总经理' || role === '超级管理员' || role === '副总' || role === '销售总监'
      || (role === '部门经理' && dept === '行政部');
  }
  return false;
}
const canCreate = computed(() => canAccess('createCustomerApplication'));

/* ===== 数据加载 ===== */
async function load() {
  loading.value = true;
  try {
    const res = await request.get('/customers');
    if (res.code === 200) rows.value = res.data || [];
    else ElMessage.error(res.msg || '加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const pending = computed(() => rows.value.filter((r) => r.status === '待审批'));
const approved = computed(() => rows.value.filter((r) => r.status === '已归档' || r.status === '潜在'));
const rejected = computed(() => rows.value.filter((r) => r.status === '已驳回'));

const stats = computed(() => [
  { label: '客户总数', value: rows.value.length + '家', icon: UserFilled, color: '#2563eb' },
  { label: '待审批', value: pending.value.length + '家', icon: Clock, color: '#f59e0b' },
  { label: '已归档', value: approved.value.length + '家', icon: CircleCheck, color: '#10b981' },
  { label: '已驳回', value: rejected.value.length + '家', icon: CircleClose, color: '#ef4444' },
]);

const sections = computed(() => [
  { title: '待审批客户', list: pending.value, icon: Clock, iconColor: '#f59e0b', border: true, always: false, action: false },
  { title: '客户档案矩阵', list: rows.value, icon: UserFilled, iconColor: '#2563eb', border: false, always: true, action: true },
]);

/* ===== 卡片辅助 ===== */
function levelColor(level) {
  return level === 'A级' ? '#10b981' : level === 'B级' ? '#2563eb' : '#f59e0b';
}
function statusColor(status) {
  return status === '待审批' ? '#f59e0b' : status === '已归档' ? '#10b981' : status === '已驳回' ? '#ef4444' : '#6b7280';
}
function currentStep(r) {
  return (r.approval_flow || []).find((f) => !f.done) || null;
}
function canApproveCard(r) {
  const u = auth.user;
  if (!u) return false;
  const step = currentStep(r);
  if (!step || !canAccess('approveCustomerApplication')) return false;
  const { role, dept } = u;
  const s = step.step;
  return (
    (s.includes('行政部负责人') && ((role === '部门经理' && dept === '行政部') || role === '超级管理员'))
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
  const res = await request.get('/customers/' + r.id);
  if (res.code === 200) {
    detail.row = res.data;
    detail.flow = res.data.approval_flow || [];
    detail.visible = true;
  } else ElMessage.error(res.msg || '加载失败');
}

/* ===== 新增 / 编辑 ===== */
const blankForm = () => ({ name: '', contact: '', phone: '', level: 'A级', industry: '', source: '', owner: '', email: '', address: '' });
const form = reactive({ visible: false, isEdit: false, saving: false, id: null, data: blankForm() });
function openCreate() {
  if (!canAccess('createCustomerApplication')) { ElMessage.warning('无权录入客户'); return; }
  form.isEdit = false; form.id = null; form.data = blankForm(); form.visible = true;
}
function openEdit(r) {
  form.isEdit = true; form.id = r.id;
  form.data = {
    name: r.name || '', contact: r.contact || '', phone: r.phone || '', level: r.level || 'C级',
    industry: r.industry || '', source: r.source || '', owner: r.owner || '', email: r.email || '', address: r.address || '',
  };
  form.visible = true;
}
async function onSubmit() {
  if (!form.data.name) { ElMessage.warning('请输入客户名称'); return; }
  form.saving = true;
  try {
    const res = form.isEdit
      ? await request.put('/customers/' + form.id, form.data)
      : await request.post('/customers', form.data);
    if (res.code === 200) {
      ElMessage.success(res.msg || (form.isEdit ? '客户更新成功' : '客户申请已提交'));
      form.visible = false;
      load();
    } else ElMessage.error(res.msg || '提交失败');
  } finally {
    form.saving = false;
  }
}

/* ===== 审批 / 驳回 / 删除 ===== */
async function onApprove(r) {
  const res = await request.post(`/customers/${r.id}/approve`);
  if (res.code === 200) { ElMessage.success(res.msg || '审批通过'); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function onReject(r) {
  let remark;
  try {
    const ret = await ElMessageBox.prompt('确定驳回此客户申请？请输入驳回原因：', '驳回客户申请', {
      confirmButtonText: '确定驳回', cancelButtonText: '取消', inputPlaceholder: '驳回原因',
    });
    remark = ret.value || '驳回';
  } catch { return; }
  const res = await request.post(`/customers/${r.id}/reject`, { remark });
  if (res.code === 200) { ElMessage.success(res.msg || '已驳回'); load(); }
  else ElMessage.error(res.msg || '操作失败');
}
async function onDelete(r) {
  try {
    await ElMessageBox.confirm(`确认删除客户「${r.name}」？`, '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.delete('/customers/' + r.id);
  if (res.code === 200) { ElMessage.success(res.msg || '客户已删除'); load(); }
  else ElMessage.error(res.msg || '删除失败');
}

/* ===== 打印档案（对齐参考项目 printCustomerArchive） ===== */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function printArchive(id) {
  const res = await request.get('/customers/' + id);
  if (res.code !== 200) { ElMessage.error(res.msg || '加载失败'); return; }
  const r = res.data;
  const flow = r.approval_flow || [];
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>客户档案 - ${esc(r.name)}</title>
    <style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:40px;color:#333;}
      h1{text-align:center;font-size:24px;margin:0 0 8px;}
      .subtitle{text-align:center;color:#666;font-size:14px;margin-bottom:30px;}
      .info-table{width:100%;border-collapse:collapse;margin-bottom:24px;}
      .info-table td{border:1px solid #ddd;padding:10px 14px;font-size:14px;}
      .info-table td.label{background:#f5f5f5;font-weight:bold;width:120px;}
      .flow{margin-top:20px;}
      .flow-step{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #eee;}
      .flow-step .dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;}
      .flow-step .dot.done{background:#10b981;}
      .flow-step .dot.todo{background:#d1d5db;}
      .footer{margin-top:40px;text-align:right;font-size:12px;color:#999;}
    </style></head><body>
    <h1>客户档案登记表</h1>
    <p class="subtitle">四川卓盟科技有限公司 · 卓盟智办公平台</p>
    <table class="info-table">
      <tr><td class="label">客户编号</td><td>${esc(r.id)}</td><td class="label">客户名称</td><td>${esc(r.name)}</td></tr>
      <tr><td class="label">联系人</td><td>${esc(r.contact || '—')}</td><td class="label">联系电话</td><td>${esc(r.phone || '—')}</td></tr>
      <tr><td class="label">电子邮箱</td><td>${esc(r.email || '—')}</td><td class="label">客户等级</td><td>${esc(r.level || 'C')}</td></tr>
      <tr><td class="label">所属行业</td><td>${esc(r.industry || '—')}</td><td class="label">客户来源</td><td>${esc(r.source || '—')}</td></tr>
      <tr><td class="label">负责人</td><td>${esc(r.owner || '—')}</td><td class="label">客户状态</td><td>${esc(r.status)}</td></tr>
      <tr><td class="label">客户地址</td><td colspan="3">${esc(r.address || '—')}</td></tr>
      <tr><td class="label">录入人</td><td>${esc(r.submitter || '—')}</td><td class="label">录入部门</td><td>${esc(r.applicant_dept || '—')}</td></tr>
      ${r.remark ? `<tr><td class="label">备注</td><td colspan="3">${esc(r.remark)}</td></tr>` : ''}
    </table>
    <h3 style="font-size:16px;margin:24px 0 12px;">审批流程</h3>
    <div class="flow">
      ${flow.map((s) => `<div class="flow-step"><div class="dot ${s.done ? 'done' : 'todo'}"></div><div style="flex:1;"><strong>${esc(s.step)}</strong> ${s.user ? '— ' + esc(s.user) : ''} ${s.time && s.time !== '—' ? '<span style="color:#999;font-size:12px;">' + esc(s.time) + '</span>' : ''}</div></div>`).join('')}
    </div>
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

.matrix-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.matrix-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: #fff; transition: box-shadow 0.2s; }
.matrix-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
.mc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.mc-name { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.mc-id { font-size: 12px; color: #9ca3af; }
.status-pill { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.mc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #4b5563; margin-bottom: 12px; }
.mc-grid .el-icon { width: 16px; color: #9ca3af; vertical-align: -2px; }
.mc-block { font-size: 13px; color: #6b7280; margin-bottom: 12px; padding: 8px; background: #f5f7fa; border-radius: 6px; }
.mc-step { font-size: 12px; padding: 6px 10px; border-radius: 6px; margin-bottom: 12px; }
.mc-step .el-icon { vertical-align: -2px; }
.mc-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.mc-actions .el-button { margin-left: 0; }
.empty-text { text-align: center; color: #9ca3af; padding: 40px 0; }

.detail-meta { display: flex; gap: 20px; font-size: 13px; color: #6b7280; flex-wrap: wrap; }
.detail-meta .el-icon { vertical-align: -2px; }
.detail-block { margin-bottom: 12px; padding: 10px; background: #f5f7fa; border-radius: 8px; font-size: 13px; }
.detail-block.remark { background: #fef3c7; }

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
