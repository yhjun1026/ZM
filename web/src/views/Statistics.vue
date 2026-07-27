<template>
  <div>
    <div class="page-header"><h2>统计分析</h2><p>全模块实时数据聚合</p></div>
    <el-row :gutter="12">
      <el-col :span="6" v-for="(v, k) in stats" :key="k" style="margin-bottom: 12px;">
        <el-card shadow="hover">
          <div style="font-size: 13px; color: #909399;">{{ labelMap[k] || k }}</div>
          <div style="font-size: 26px; font-weight: 700; margin-top: 4px;">{{ v.total }}</div>
          <div style="font-size: 12px; color: #10b981; margin-top: 2px;">活跃 {{ v.active ?? v.pending ?? v.submitted ?? '-' }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getStatistics } from '../api/modules';

const stats = ref({});
const labelMap = {
  users: '用户', customers: '客户', contracts: '合同', projects: '项目',
  leave: '假期', expense: '费用', purchases: '采购', trips: '出差', reports: '汇报',
};
onMounted(async () => {
  const r = await getStatistics();
  if (r.success) stats.value = r.data || {};
});
</script>
