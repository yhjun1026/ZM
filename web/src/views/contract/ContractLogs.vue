<template>
  <el-card>
    <template #header>
      <div style="display:flex;align-items:baseline;gap:8px;">
        <strong>操作日志</strong>
        <span style="font-size:13px;color:#909399;">(最近500条)</span>
      </div>
    </template>
    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ row.created_at || '—' }}</template>
      </el-table-column>
      <el-table-column label="合同编号" width="130">
        <template #default="{ row }">{{ row.contract_id || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="110">
        <template #default="{ row }">{{ row.action || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作人" width="100">
        <template #default="{ row }">{{ row.operator || '—' }}</template>
      </el-table-column>
      <el-table-column label="部门" width="110">
        <template #default="{ row }">{{ row.operator_dept || '—' }}</template>
      </el-table-column>
      <el-table-column label="详情" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.detail || '—' }}</template>
      </el-table-column>
      <template #empty>暂无操作日志</template>
    </el-table>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../../api/request';

const rows = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/contracts/logs/list');
    if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
    rows.value = resp.data || [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
