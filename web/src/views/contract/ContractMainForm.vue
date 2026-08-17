<template>
  <div>
    <!-- 统计卡片 -->
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <div v-for="c in statCards" :key="c.label" class="stat-card"
           :style="`flex:1;min-width:120px;background:linear-gradient(135deg,${c.from},${c.to});color:#fff;border-radius:12px;padding:16px;`">
        <div style="font-size:28px;font-weight:700;">{{ c.value }}</div>
        <div style="font-size:13px;opacity:.85;">{{ c.label }}</div>
      </div>
    </div>
    <!-- 标题与筛选 -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <h3 style="margin:0;"><el-icon style="vertical-align:-2px;"><EditPen /></el-icon> 合同主信息表单</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <el-select v-model="filterStatus" style="width:130px;" @change="load">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-input v-model="filterKeyword" placeholder="搜索合同名称/编号/合作方" style="width:220px;" clearable @keyup.enter="load" @clear="load" />
        <el-button v-if="canCreate" type="primary" @click="$emit('open', 'new')"><el-icon><Plus /></el-icon> 新建合同</el-button>
      </div>
    </div>
    <!-- 列表 -->
    <div v-loading="loading">
      <el-empty v-if="!loading && list.length === 0" description="暂无合同数据" />
      <el-table v-else :data="list" stripe style="width:100%;">
        <el-table-column label="合同编号" width="160">
          <template #default="{ row }">
            <span v-if="row.contract_no" style="font-family:monospace;">{{ row.contract_no }}</span>
            <span v-else style="color:#9ca3af;">未生成</span>
          </template>
        </el-table-column>
        <el-table-column prop="contract_name" label="合同名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="partner_company" label="合作方" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.partner_company || '-' }}</template>
        </el-table-column>
        <el-table-column prop="contract_type" label="类型" width="100">
          <template #default="{ row }">{{ row.contract_type || '-' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">{{ fmtAmt(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="handler" label="经办人" width="90">
          <template #default="{ row }">{{ row.handler || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :style="`padding:3px 10px;border-radius:12px;font-size:12px;color:#fff;background:${statusColor(row.contract_status)};`">{{ row.contract_status }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$emit('open', row.id)">查看/编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, EditPen } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { fmtAmt, contractStatusColors, canCreateContractForm } from './utils';

defineEmits(['open']);

const auth = useAuthStore();
const canCreate = computed(() => canCreateContractForm(auth.user || {}));

const stats = ref({ total: 0, draft: 0, approving: 0, active: 0, archived: 0, voided: 0, totalAmount: 0 });
const list = ref([]);
const loading = ref(false);
const filterStatus = ref('全部');
const filterKeyword = ref('');

const statusOptions = [
  { value: '全部', label: '全部状态' }, { value: '草稿', label: '草稿' }, { value: '审批中', label: '审批中' },
  { value: '已生效', label: '已生效' }, { value: '变更中', label: '变更中' }, { value: '终止中', label: '终止中' },
  { value: '已终止', label: '已终止' }, { value: '已归档', label: '已归档' }, { value: '已作废', label: '已作废' },
];

const statCards = computed(() => [
  { label: '合同总数', value: stats.value.total || 0, from: '#667eea', to: '#764ba2' },
  { label: '草稿', value: stats.value.draft || 0, from: '#f59e0b', to: '#f97316' },
  { label: '审批中', value: stats.value.approving || 0, from: '#3b82f6', to: '#06b6d4' },
  { label: '已生效', value: stats.value.active || 0, from: '#10b981', to: '#059669' },
  { label: '生效合同总额', value: fmtAmt(stats.value.totalAmount || 0), from: '#6366f1', to: '#8b5cf6' },
]);

const statusColor = (s) => contractStatusColors[s] || '#6b7280';

async function loadStats() {
  try {
    const r = await request.get('/contract-form/stats');
    if (r.code === 200 && r.data) stats.value = r.data;
  } catch (e) { /* ignore */ }
}

async function load() {
  loading.value = true;
  try {
    const r = await request.get('/contract-form/list', { params: { status: filterStatus.value, keyword: filterKeyword.value } });
    if (r.code !== 200) { ElMessage.error('加载失败: ' + (r.msg || '')); list.value = []; return; }
    list.value = r.data?.list || [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => { loadStats(); load(); });
defineExpose({ reload: () => { loadStats(); load(); } });
</script>

<style scoped>
.stat-card { transition: transform .2s; }
.stat-card:hover { transform: translateY(-2px); }
</style>
