<template>
  <div>
    <!-- 统计卡片 -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-bottom:20px;">
      <div v-for="c in statCards" :key="c.label" class="stat-card-enhanced"
           style="position:relative;padding:20px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden;">
        <div :style="`position:absolute;top:0;left:0;right:0;height:3px;background:${c.color};`"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <p style="font-size:12px;margin:0 0 6px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:#909399;">{{ c.label }}</p>
            <p :style="`font-size:26px;font-weight:700;margin:0;color:${c.color};`">{{ c.value }}</p>
          </div>
          <div :style="`width:48px;height:48px;border-radius:14px;background:${c.color}15;display:flex;align-items:center;justify-content:center;flex-shrink:0;`">
            <el-icon :style="`font-size:22px;color:${c.color};`"><component :is="c.icon" /></el-icon>
          </div>
        </div>
      </div>
    </div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>合同台账</strong>
          <el-button size="small" @click="printLedger"><el-icon><Printer /></el-icon> 打印台账</el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="合同编号" width="130" />
        <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="customer" label="客户" width="130" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="90" />
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">¥{{ (row.amount || 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="签订日期" width="110">
          <template #default="{ row }">{{ row.sign_date || row.start_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="到期日期" width="110">
          <template #default="{ row }">{{ row.end_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :class="`tag ${row.status === '执行中' ? 'tag-green' : row.status === '待审批' ? 'tag-yellow' : row.status === '已终止' ? 'tag-red' : 'tag-blue'}`">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="执行情况" width="90">
          <template #default="{ row }">{{ row.execution_status || '—' }}</template>
        </el-table-column>
        <el-table-column label="归档位置" width="110">
          <template #default="{ row }">{{ row.archive_loc || '—' }}</template>
        </el-table-column>
        <template #empty>暂无合同</template>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Printer, Document, Clock, VideoPlay, CircleCheck, CircleClose, Money } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { printContractLedger } from './utils';

const auth = useAuthStore();
const rows = ref([]);
const loading = ref(false);

const stats = computed(() => ({
  total: rows.value.length,
  pending: rows.value.filter(r => r.status === '待审批').length,
  active: rows.value.filter(r => r.status === '执行中').length,
  completed: rows.value.filter(r => r.status === '已完成').length,
  terminated: rows.value.filter(r => r.status === '已终止').length,
  totalAmount: rows.value.reduce((s, r) => s + (r.amount || 0), 0),
}));

const statCards = computed(() => [
  { label: '合同总数', value: stats.value.total + '份', icon: Document, color: '#2563eb' },
  { label: '待审批', value: stats.value.pending + '份', icon: Clock, color: '#f59e0b' },
  { label: '执行中', value: stats.value.active + '份', icon: VideoPlay, color: '#10b981' },
  { label: '已完成', value: stats.value.completed + '份', icon: CircleCheck, color: '#8b5cf6' },
  { label: '已终止', value: stats.value.terminated + '份', icon: CircleClose, color: '#ef4444' },
  { label: '合同总额', value: '¥' + stats.value.totalAmount.toLocaleString(), icon: Money, color: '#06b6d4' },
]);

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/contracts');
    if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
    rows.value = resp.data || [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function printLedger() {
  printContractLedger(rows.value, auth.user?.name);
}
</script>

<style scoped>
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-green { background: #d1fae5; color: #065f46; }
.tag-red { background: #fee2e2; color: #991b1b; }
.tag-yellow { background: #fef3c7; color: #92400e; }
.tag-blue { background: #dbeafe; color: #1e40af; }
.stat-card-enhanced { cursor: default; transition: transform .2s; }
.stat-card-enhanced:hover { transform: translateY(-2px); }
</style>
