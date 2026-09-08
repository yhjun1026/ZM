<template>
  <div class="audit">
    <div class="page-header">
      <h2>审计日志</h2>
      <p>全系统操作留痕查询（时间 / 操作人 / 模块 / 动作）与合规归档 —— 仅总经理、副总、行政人事部负责人、超级管理员可见</p>
    </div>

    <el-alert v-if="denied" type="error" :closable="false" show-icon title="无权限：仅总经理、副总、行政人事部负责人、超级管理员可查询审计日志" style="margin-bottom:16px;" />

    <template v-if="!denied">
      <!-- KPI -->
      <div class="kpi-grid" v-if="stats">
        <div class="kpi-card" v-for="k in kpis" :key="k.title">
          <div class="kpi-icon" :style="{ background: k.color + '20' }">
            <el-icon :size="18" :color="k.color"><component :is="k.icon" /></el-icon>
          </div>
          <div>
            <div class="kpi-title">{{ k.title }}</div>
            <div class="kpi-value">{{ k.value }}</div>
            <div class="kpi-sub">{{ k.sub }}</div>
          </div>
        </div>
      </div>

      <!-- 查询条件 -->
      <div class="tab-toolbar">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <el-select v-model="filter.module" placeholder="全部模块" style="width:150px" clearable filterable @change="onModuleChange">
            <el-option v-for="m in modules" :key="m.name" :label="`${m.name}（${m.n}）`" :value="m.name" />
          </el-select>
          <el-select v-model="filter.action" placeholder="全部动作" style="width:180px" clearable filterable>
            <el-option v-for="a in actions" :key="a.name" :label="`${a.name}（${a.n}）`" :value="a.name" />
          </el-select>
          <el-input v-model="filter.operator" placeholder="操作人姓名" style="width:130px" clearable />
          <el-input v-model="filter.keyword" placeholder="关键词（详情/模块/动作/工号）" style="width:220px" clearable />
          <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" style="width:250px" />
        </div>
        <div>
          <el-button size="small" @click="resetFilter">重置</el-button>
          <el-button type="primary" size="small" @click="loadLogs">查询</el-button>
        </div>
      </div>

      <el-table :data="rows" stripe size="small" v-loading="loading">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ (row.created_at || '').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column prop="emp_no" label="工号/账号" width="120" show-overflow-tooltip />
        <el-table-column prop="emp_name" label="操作人" width="100" />
        <el-table-column prop="role" label="角色" width="120" show-overflow-tooltip />
        <el-table-column label="模块" width="130">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.module }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="action" label="动作" width="180" show-overflow-tooltip />
        <el-table-column prop="detail" label="详情" min-width="280" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP" width="120" />
        <template #empty><span class="muted">暂无审计日志</span></template>
      </el-table>

      <div class="pager">
        <el-pagination background layout="total, prev, pager, next" :total="total" :page-size="pageSize" :current-page="page"
          @current-change="(p) => { page = p; loadLogs(); }" />
      </div>

      <!-- 归档 -->
      <el-divider content-position="left">合规归档（JSONL + SHA256 存证）</el-divider>
      <div class="tab-toolbar">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <el-date-picker v-model="archiveBefore" type="date" value-format="YYYY-MM-DD" :placeholder="`归档此日期之前（最早 ${minDate}）`" style="width:220px" />
          <el-button size="small" :disabled="!archiveBefore" @click="previewArchive">预览</el-button>
          <el-button type="primary" size="small" :disabled="!archiveBefore || !preview.count" @click="runArchive">
            执行归档（{{ preview.count }} 条）
          </el-button>
          <span class="muted" v-if="stats">仅归档 {{ stats.archive_min_age_days }} 天前的日志，归档后主表对应记录移除、文件留存于 server/data/audit_archive/</span>
        </div>
      </div>
      <el-table :data="archives" stripe size="small" v-loading="archLoading">
        <el-table-column prop="file" label="归档文件" min-width="260" show-overflow-tooltip />
        <el-table-column label="日志区间" width="200">
          <template #default="{ row }">{{ row.from_date || '—' }} ~ {{ row.to_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="行数" width="80">
          <template #default="{ row }">{{ row.rows != null ? row.rows : row.lines }}</template>
        </el-table-column>
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ sizeText(row.size) }}</template>
        </el-table-column>
        <el-table-column prop="archived_by" label="归档人" width="110" />
        <el-table-column label="归档时间" width="160">
          <template #default="{ row }">{{ (row.archived_at || '').slice(0, 16) || '—' }}</template>
        </el-table-column>
        <el-table-column label="存证" width="110">
          <template #default="{ row }">
            <el-tag :type="row.registered ? 'success' : 'warning'" size="small">{{ row.registered ? '已存证' : '未登记' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button size="small" :disabled="!row.registered" @click="verifyArchive(row)">校验</el-button>
          </template>
        </el-table-column>
        <template #empty><span class="muted">暂无归档文件</span></template>
      </el-table>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { View, Document, Clock, Folder, Timer } from '@element-plus/icons-vue';
import request from '../api/request';

const denied = ref(false);
const loading = ref(false);
const archLoading = ref(false);
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const stats = ref(null);
const modules = ref([]);
const actions = ref([]);
const archives = ref([]);
const dateRange = ref('');
const archiveBefore = ref('');
const preview = reactive({ count: 0, oldest: '', newest: '' });
const filter = reactive({ module: '', action: '', operator: '', keyword: '' });

const minDate = computed(() => {
  if (!stats.value) return '';
  const d = new Date(Date.now() - (stats.value.archive_min_age_days || 30) * 86400000);
  return d.toISOString().slice(0, 10);
});

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '日志总数', value: s.total, sub: `最早 ${(s.oldest || '—').slice(0, 10)}`, icon: Document, color: '#2563eb' },
    { title: '今日留痕', value: s.today, sub: '当日操作记录', icon: Clock, color: '#f59e0b' },
    { title: '近 7 天', value: s.week, sub: '滚动一周', icon: Timer, color: '#8b5cf6' },
    { title: '归档文件', value: s.archives, sub: s.can_archive ? '可执行归档' : '仅查看', icon: Folder, color: '#10b981' },
  ];
});

function sizeText(sz) {
  if (!sz) return '—';
  return sz > 1048576 ? (sz / 1048576).toFixed(2) + ' MB' : (sz / 1024).toFixed(1) + ' KB';
}

async function guard(r) {
  if (r && r.code === 403) { denied.value = true; return false; }
  return true;
}

async function loadStats() {
  const r = await request.get('/audit/stats');
  if (!(await guard(r))) return;
  if (r.code === 200) stats.value = r.data;
}
async function loadModules() {
  const r = await request.get('/audit/modules');
  if (r.code === 200) modules.value = r.data || [];
}
async function loadActions() {
  const params = {};
  if (filter.module) params.module = filter.module;
  const r = await request.get('/audit/actions', { params });
  if (r.code === 200) actions.value = r.data || [];
}
async function loadLogs() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    ['module', 'action', 'operator', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    if (Array.isArray(dateRange.value) && dateRange.value.length === 2) {
      params.from = dateRange.value[0];
      params.to = dateRange.value[1];
    }
    const r = await request.get('/audit/logs', { params });
    if (r.code === 200) {
      rows.value = (r.data && r.data.rows) || [];
      total.value = (r.data && r.data.total) || 0;
    } else { rows.value = []; total.value = 0; }
  } finally { loading.value = false; }
}
async function loadArchives() {
  archLoading.value = true;
  try {
    const r = await request.get('/audit/archives');
    if (r.code === 200) archives.value = (r.data && r.data.files) || [];
  } finally { archLoading.value = false; }
}
function onModuleChange() {
  filter.action = '';
  loadActions();
}
function resetFilter() {
  Object.assign(filter, { module: '', action: '', operator: '', keyword: '' });
  dateRange.value = '';
  page.value = 1;
  loadActions();
  loadLogs();
}

async function previewArchive() {
  const r = await request.get('/audit/archive/preview', { params: { before: archiveBefore.value } });
  if (r.code === 200) Object.assign(preview, r.data || {});
  else { ElMessage.error(r.msg || '预览失败'); Object.assign(preview, { count: 0 }); }
}
async function runArchive() {
  await ElMessageBox.confirm(`确认将 ${archiveBefore.value} 之前的 ${preview.count} 条审计日志归档为 JSONL 文件？归档后主表对应记录将被移除。`, '归档确认', { type: 'warning' }).catch(() => null);
  const r = await request.post('/audit/archive/run', { before: archiveBefore.value });
  if (r.code === 200) {
    ElMessage.success(r.msg || '归档完成');
    Object.assign(preview, { count: 0 });
    loadArchives(); loadStats(); loadLogs();
  } else ElMessage.error(r.msg || '归档失败');
}
async function verifyArchive(row) {
  const r = await request.post('/audit/archive/verify', { file: row.file });
  if (r.code === 200) {
    const d = r.data || {};
    if (d.match) ElMessage.success('SHA256 与存证一致，文件完整');
    else ElMessage.error('SHA256 与存证不一致，疑似被篡改或损坏！');
  } else ElMessage.error(r.msg || '校验失败');
}

onMounted(async () => {
  await loadStats();
  if (denied.value) return;
  await loadModules();
  await loadActions();
  await loadLogs();
  await loadArchives();
});
</script>

<style scoped>
.audit { padding: 20px; }
.muted { color: #909399; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.pager { display: flex; justify-content: flex-end; margin: 12px 0; }
</style>
