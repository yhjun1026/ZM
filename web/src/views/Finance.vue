<template>
  <div>
    <div class="page-header"><h2>财务管理</h2><p>应收应付与费用结构</p></div>
    <el-row :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6" v-for="k in kpis" :key="k.label">
        <el-card shadow="hover"><div style="font-size: 13px; color: #909399;">{{ k.label }}</div><div style="font-size: 20px; font-weight: 700; margin-top: 4px;" :style="{ color: k.color }">{{ k.value }}</div></el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card>
          <template #header>应收账款</template>
          <el-table :data="receivable" size="small">
            <el-table-column prop="customer" label="客户" min-width="140" />
            <el-table-column prop="amount" label="金额(万)" width="90" />
            <el-table-column prop="dueDate" label="到期日" width="110" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === '逾期' ? 'danger' : row.status === '即将到期' ? 'warning' : 'success'" size="small">{{ row.status }}</el-tag></template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>费用结构</template>
          <div ref="chart" style="height: 300px;"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as echarts from 'echarts';
import { getFinance } from '../api/modules';

const data = ref({});
const chart = ref(null);
let inst = null;
const tm = computed(() => data.value.thisMonth || {});
const receivable = computed(() => data.value.receivable || []);
const kpis = computed(() => [
  { label: '本月收入(万)', value: tm.value.revenue ?? '-', color: '#2563eb' },
  { label: '本月支出(万)', value: tm.value.expense ?? '-', color: '#f59e0b' },
  { label: '利润(万)', value: tm.value.profit ?? '-', color: '#10b981' },
  { label: '预算执行率', value: (tm.value.budgetRate ?? '-') + '%', color: '#8b5cf6' },
]);

function rz() { inst && inst.resize(); }
onMounted(async () => {
  const r = await getFinance();
  if (r.success) data.value = r.data || {};
  inst = echarts.init(chart.value);
  const labels = data.value.expenseBreakdown?.labels || [];
  const vals = data.value.expenseBreakdown?.data || [];
  inst.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 20 } },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: vals, itemStyle: { color: '#f59e0b' } }],
  });
  window.addEventListener('resize', rz);
});
onUnmounted(() => { window.removeEventListener('resize', rz); inst && inst.dispose(); });
</script>
