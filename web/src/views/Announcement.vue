<template>
  <div class="announcement-page">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div v-for="s in statCards" :key="s.label" class="stat-card">
        <div class="stat-top" :style="{ background: s.color }"></div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
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

    <!-- 录入公告按钮 -->
    <div v-if="canCreate" style="margin-bottom: 16px;">
      <el-button type="primary" @click="openForm">
        <el-icon><Plus /></el-icon> 录入公告
      </el-button>
    </div>

    <!-- 待审批公告 -->
    <el-card v-if="pending.length > 0 && canReview" class="mb-16">
      <template #header><h3 style="margin: 0;">待审批公告</h3></template>
      <el-table :data="pending" stripe>
        <el-table-column label="类别" width="130">
          <template #default="{ row }">
            <span class="cat-tag" :style="catStyle(row.category)">{{ row.category }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="author" label="录入人" width="100" />
        <el-table-column prop="author_dept" label="部门" width="110" />
        <el-table-column prop="created_at" label="时间" width="170" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="success" title="审批" @click="approve(row)">
              <el-icon><Check /></el-icon>
            </el-button>
            <el-button size="small" type="danger" title="驳回" @click="reject(row)">
              <el-icon><Close /></el-icon>
            </el-button>
            <el-button size="small" type="info" title="详情" @click="showDetail(row)">
              <el-icon><View /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 已发布公告 -->
    <el-card>
      <template #header><h3 style="margin: 0;">已发布公告</h3></template>
      <template v-if="published.length > 0">
        <div v-for="a in published" :key="a.id" class="doc-item">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
              <span class="cat-tag" :style="catStyle(a.category)">{{ a.category }}</span>
              <strong style="font-size: 15px;">{{ a.title }}</strong>
              <p style="margin: 8px 0 4px; font-size: 13px; color: #909399;">
                {{ (a.content || '').substring(0, 100) }}{{ a.content && a.content.length > 100 ? '...' : '' }}
              </p>
              <p style="margin: 0; font-size: 12px; color: #909399;">
                发布人：{{ a.author }} · 部门：{{ a.author_dept }} · 时间：{{ a.created_at || '' }}
              </p>
            </div>
            <el-button size="small" title="查看" @click="showDetail(a)">
              <el-icon><View /></el-icon>
            </el-button>
          </div>
        </div>
      </template>
      <p v-else class="text-muted">暂无已发布公告</p>
    </el-card>

    <!-- 已驳回公告 -->
    <el-card v-if="rejected.length > 0" style="margin-top: 16px;">
      <template #header><h3 style="margin: 0;">已驳回公告</h3></template>
      <el-table :data="rejected" stripe>
        <el-table-column label="类别" width="130">
          <template #default="{ row }">
            <el-tag type="danger" size="small">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="author" label="录入人" width="120" />
        <el-table-column prop="created_at" label="时间" width="170" />
      </el-table>
    </el-card>

    <!-- 录入公告对话框 -->
    <el-dialog v-model="formDlg.visible" title="录入公司公告" width="600px">
      <el-form label-width="80px">
        <el-form-item label="公告标题">
          <el-input v-model="formDlg.form.title" placeholder="请输入公告标题" />
        </el-form-item>
        <el-form-item label="公告类别">
          <el-select v-model="formDlg.form.category" placeholder="请选择类别" style="width: 100%;">
            <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="公告内容">
          <el-input v-model="formDlg.form.content" type="textarea" :rows="6" placeholder="请输入公告详细内容" />
        </el-form-item>
      </el-form>
      <p class="text-muted" style="font-size: 13px;">审批流程：行政部录入 → 行政部负责人审批 → 总经理审批 → 发布</p>
      <template #footer>
        <el-button @click="formDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="formDlg.saving" @click="submitForm">提交</el-button>
      </template>
    </el-dialog>

    <!-- 公告详情对话框 -->
    <el-dialog v-model="detailDlg.visible" title="公告详情" width="650px">
      <template v-if="detailDlg.data">
        <div style="margin-bottom: 16px;">
          <span class="cat-tag" :style="catStyle(detailDlg.data.category)">
            {{ detailDlg.data.category }}
          </span>
          <strong style="font-size: 18px;">{{ detailDlg.data.title }}</strong>
        </div>
        <p class="text-muted" style="font-size: 13px; margin-bottom: 16px;">
          录入人：{{ detailDlg.data.author }} · 部门：{{ detailDlg.data.author_dept }} · 时间：{{ detailDlg.data.created_at || '' }}
        </p>
        <div class="detail-content">{{ detailDlg.data.content || '无内容' }}</div>
        <h4 style="margin: 16px 0 8px;">审批流程</h4>
        <div v-if="detailFlow.length" class="wf-container">
          <div class="wf-track">
            <template v-for="(f, i) in detailFlow" :key="i">
              <div class="wf-step" :class="stepClass(i)">
                <div class="wf-icon">
                  <el-icon v-if="f.done" :size="20"><CircleCheckFilled /></el-icon>
                  <el-icon v-else-if="isCurrentStep(i)" :size="20" class="is-loading"><Loading /></el-icon>
                  <span v-else class="wf-hollow"></span>
                </div>
                <div class="wf-info">
                  <div class="wf-name">{{ f.step }}</div>
                  <div class="wf-user">{{ f.user || (f.done ? '已完成' : '待处理') }}</div>
                  <div v-if="f.time && f.time !== '—'" class="wf-time">{{ f.time }}</div>
                </div>
              </div>
              <div v-if="i < detailFlow.length - 1" class="wf-arrow">
                <el-icon><ArrowRight /></el-icon>
              </div>
            </template>
          </div>
        </div>
      </template>
      <template #footer>
        <template v-if="detailDlg.data && detailDlg.data.status === '待审批' && canReview">
          <el-button type="success" @click="approve(detailDlg.data)">
            <el-icon><Check /></el-icon> 审批通过
          </el-button>
          <el-button type="danger" @click="reject(detailDlg.data)">
            <el-icon><Close /></el-icon> 驳回
          </el-button>
        </template>
        <el-button @click="detailDlg.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, Check, Close, View, ArrowRight,
  CircleCheckFilled, Loading, Bell, Clock, CircleCloseFilled
} from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

const CATEGORIES = ['产品会议', '公司团建', '会议通知', '放假通知', '人事任命', '外出参访通知', '公司培训通知'];
const categoryColors = {
  '产品会议': '#2563eb', '公司团建': '#10b981', '会议通知': '#f59e0b',
  '放假通知': '#ef4444', '人事任命': '#8b5cf6', '外出参访通知': '#06b6d4', '公司培训通知': '#0d9488'
};

// 与参考项目 rbac.js canAccess 保持一致
const canCreate = computed(() => {
  const u = auth.user || {};
  if (u.role === '总经理' || u.role === '超级管理员') return true;
  if (u.role === '普通员工' && u.dept === '行政部') return true;
  if (u.role === '部门经理' && u.dept === '行政部') return true;
  return false;
});
const canReview = computed(() => {
  const u = auth.user || {};
  if (u.role === '总经理' || u.role === '超级管理员') return true;
  if (u.role === '副总') return true;
  if (u.role === '部门经理' && u.dept === '行政部') return true;
  return false;
});

const list = ref([]);
const published = computed(() => list.value.filter(a => a.status === '已发布'));
const pending = computed(() => list.value.filter(a => a.status === '待审批'));
const rejected = computed(() => list.value.filter(a => a.status === '已驳回'));

const statCards = computed(() => [
  { label: '已发布公告', value: published.value.length, icon: Bell, color: '#10b981' },
  { label: '待审批', value: pending.value.length, icon: Clock, color: '#f59e0b' },
  { label: '已驳回', value: rejected.value.length, icon: CircleCloseFilled, color: '#ef4444' }
]);

function catStyle(category) {
  const c = categoryColors[category] || '#666';
  return { background: c + '15', color: c, marginRight: '8px' };
}

async function load() {
  const res = await request.get('/announcements');
  if (res.code !== 200) {
    ElMessage.error(res.msg || '加载失败');
    return;
  }
  list.value = res.data || [];
}

/* ===== 录入公告 ===== */
const formDlg = reactive({
  visible: false,
  saving: false,
  form: { title: '', category: '', content: '' }
});

function openForm() {
  formDlg.form = { title: '', category: '', content: '' };
  formDlg.visible = true;
}

async function submitForm() {
  const title = (formDlg.form.title || '').trim();
  const category = formDlg.form.category;
  const content = (formDlg.form.content || '').trim();
  if (!title) { ElMessage.error('请输入公告标题'); return; }
  if (!category) { ElMessage.error('请选择公告类别'); return; }
  formDlg.saving = true;
  const res = await request.post('/announcements', { title, category, content });
  formDlg.saving = false;
  if (res.code === 200) {
    ElMessage.success('公告已提交，等待审批');
    formDlg.visible = false;
    load();
  } else {
    ElMessage.error(res.msg || '提交失败');
  }
}

/* ===== 审批 / 驳回 ===== */
async function approve(row) {
  try {
    await ElMessageBox.confirm('确认审批通过？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  const res = await request.post(`/announcements/${row.id}/approve`, { remark: '同意' });
  if (res.code === 200) {
    ElMessage.success(res.msg || '审批成功');
    detailDlg.visible = false;
    load();
  } else {
    ElMessage.error(res.msg || '审批失败');
  }
}

async function reject(row) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('请输入驳回原因：', '驳回公告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '驳回原因'
    });
    remark = r.value;
  } catch {
    return;
  }
  const res = await request.post(`/announcements/${row.id}/reject`, { remark: remark || '不合适' });
  if (res.code === 200) {
    ElMessage.success('公告已驳回');
    detailDlg.visible = false;
    load();
  } else {
    ElMessage.error(res.msg || '操作失败');
  }
}

/* ===== 详情 ===== */
const detailDlg = reactive({ visible: false, data: null });

const detailFlow = computed(() => {
  const a = detailDlg.data;
  if (!a) return [];
  return typeof a.flow === 'string' ? JSON.parse(a.flow || '[]') : (a.flow || []);
});

function isCurrentStep(i) {
  const flow = detailFlow.value;
  return !flow[i].done && (i === 0 || flow.slice(0, i).every(s => s.done));
}

function stepClass(i) {
  const f = detailFlow.value[i];
  if (f.done) return 'wf-done';
  return isCurrentStep(i) ? 'wf-current' : 'wf-pending';
}

function showDetail(a) {
  detailDlg.data = a;
  detailDlg.visible = true;
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}
.text-muted {
  color: #909399;
}

/* 统计卡片（还原参考 renderStatCard） */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  position: relative;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.stat-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
}
.stat-label {
  color: #909399;
  font-size: 12px;
  margin: 0 0 6px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 类别彩色标签 */
.cat-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
}

/* 已发布公告条目 */
.doc-item {
  padding: 16px 0;
  border-bottom: 1px solid #e4e7ed;
}
.doc-item:last-child {
  border-bottom: none;
}

/* 详情内容 */
.detail-content {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 16px;
  white-space: pre-wrap;
}

/* 工作流程图（还原参考 style.css wf-*） */
.wf-container {
  overflow-x: auto;
  padding: 16px 8px;
  background: #f5f7fa;
  border-radius: 10px;
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px;
}
.wf-track {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: max-content;
}
.wf-step {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 2px solid;
  min-width: 100px;
  text-align: center;
}
.wf-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.wf-user {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
}
.wf-time {
  font-size: 10px;
  color: #909399;
  opacity: 0.8;
}
.wf-done {
  background: #ecfdf5;
  border-color: #10b981;
}
.wf-done .wf-icon {
  color: #10b981;
}
.wf-current {
  background: #fffbeb;
  border-color: #f59e0b;
  animation: wfPulse 2s ease-in-out infinite;
}
.wf-current .wf-icon {
  color: #f59e0b;
}
.wf-pending {
  background: #fff;
  border-color: #e5e7eb;
  opacity: 0.65;
}
.wf-hollow {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #9ca3af;
  border-radius: 50%;
}
.wf-arrow {
  flex-shrink: 0;
  color: #9ca3af;
  font-size: 14px;
  padding: 0 2px;
}
@keyframes wfPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
}
</style>
