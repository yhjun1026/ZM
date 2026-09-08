<template>
  <div class="search-page">
    <div class="page-header">
      <h2>全局搜索</h2>
      <p>一次检索员工 / 客户 / 商机 / 合同 / 公文 / 投标 —— 结果按模块分组，数据范围按角色隔离</p>
    </div>

    <div class="search-bar">
      <el-input v-model="q" size="large" placeholder="输入关键字：客户名 / 商机号 / 合同号 / 员工姓名 / 公文标题 / 投标编号" clearable @keyup.enter="doSearch">
        <template #prefix><el-icon><Search /></el-icon></template>
        <template #append>
          <el-button type="primary" :loading="loading" @click="doSearch">搜索</el-button>
        </template>
      </el-input>
      <div class="search-meta">
        <span v-if="scope.role" class="muted">
          当前身份：{{ scope.role }} · {{ scope.emp_name || '—' }}
          <el-tag size="small" :type="scope.scoped ? 'warning' : 'success'" style="margin-left:6px;">
            {{ scope.scoped ? '受限：仅本人负责的客户与商机' : scope.full ? '管理层：全量可检索' : '标准范围' }}
          </el-tag>
        </span>
        <el-select v-model="limit" size="small" style="width:130px" @change="doSearch">
          <el-option :value="5" label="每类 5 条" />
          <el-option :value="10" label="每类 10 条" />
          <el-option :value="20" label="每类 20 条" />
        </el-select>
      </div>
    </div>

    <!-- 分组概览 -->
    <div class="kpi-grid" v-if="searched">
      <div class="kpi-card">
        <div class="kpi-icon" style="background:#2563eb20"><el-icon :size="18" color="#2563eb"><Search /></el-icon></div>
        <div>
          <div class="kpi-title">命中总数</div>
          <div class="kpi-value">{{ total }}</div>
          <div class="kpi-sub">关键字「{{ lastQ }}」</div>
        </div>
      </div>
      <div class="kpi-card" v-for="g in groupCards" :key="g.type">
        <div class="kpi-icon" :style="{ background: g.color + '20' }">
          <el-icon :size="18" :color="g.color"><component :is="g.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-title">{{ g.label }}</div>
          <div class="kpi-value">{{ g.count }}</div>
          <div class="kpi-sub">{{ g.count ? '点击查看明细' : '无匹配' }}</div>
        </div>
      </div>
    </div>

    <el-tabs v-if="searched" v-model="tab">
      <el-tab-pane v-for="g in groupCards" :key="g.type" :name="g.type">
        <template #label>{{ g.label }}（{{ g.count }}）</template>
        <el-table :data="grouped[g.type] || []" stripe size="small" v-loading="loading">
          <el-table-column prop="code" label="编号/工号" width="160" show-overflow-tooltip />
          <el-table-column prop="name" label="名称" min-width="220" show-overflow-tooltip />
          <el-table-column prop="sub" label="概要" min-width="260" show-overflow-tooltip />
          <el-table-column label="金额(万)" width="100" align="right" v-if="g.type === 'opportunity'">
            <template #default="{ row }"><b>{{ row.amount || '—' }}</b></template>
          </el-table-column>
          <el-table-column label="金额" width="120" align="right" v-if="g.type === 'contract' || g.type === 'bid'">
            <template #default="{ row }">{{ row.amount || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="goto(row)">前往</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">该模块没有匹配结果</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <div v-else class="empty-tip">
      <el-empty description="输入关键字开始全局检索" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Search, User, OfficeBuilding, TrendCharts, Tickets, Document, Trophy } from '@element-plus/icons-vue';
import request from '../api/request';

const router = useRouter();
const q = ref('');
const lastQ = ref('');
const limit = ref(10);
const loading = ref(false);
const searched = ref(false);
const total = ref(0);
const grouped = reactive({});
const scope = reactive({ role: '', emp_name: '', scoped: false, full: false });
const tab = ref('employee');

const GROUPS = [
  { type: 'employee', label: '员工', icon: User, color: '#2563eb' },
  { type: 'customer', label: '客户', icon: OfficeBuilding, color: '#10b981' },
  { type: 'opportunity', label: '商机', icon: TrendCharts, color: '#f59e0b' },
  { type: 'contract', label: '合同', icon: Tickets, color: '#8b5cf6' },
  { type: 'document', label: '公文', icon: Document, color: '#0ea5e9' },
  { type: 'bid', label: '投标', icon: Trophy, color: '#ef4444' },
];

const groupCards = computed(() => GROUPS.map((g) => Object.assign({}, g, { count: (grouped[g.type] || []).length })));

async function loadScope() {
  const r = await request.get('/search/scope');
  if (r.code === 200) Object.assign(scope, r.data || {});
}

async function doSearch() {
  const kw = q.value.trim();
  if (!kw) return;
  loading.value = true;
  searched.value = true;
  lastQ.value = kw;
  try {
    const r = await request.get('/search', { params: { q: kw, limit: limit.value } });
    Object.keys(grouped).forEach((k) => { delete grouped[k]; });
    if (r.code === 200) {
      const d = r.data || {};
      total.value = d.total || 0;
      Object.assign(grouped, d.grouped || {});
      const first = GROUPS.find((g) => (grouped[g.type] || []).length);
      tab.value = first ? first.type : 'employee';
    } else {
      total.value = 0;
    }
  } finally { loading.value = false; }
}

function goto(row) {
  if (row.path) router.push(row.path);
}

onMounted(loadScope);
</script>

<style scoped>
.search-page { padding: 20px; }
.muted { color: #909399; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.search-bar { margin-bottom: 20px; }
.search-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.empty-tip { padding: 40px 0; }
</style>
