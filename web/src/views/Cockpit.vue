<template>
  <div>
    <div class="page-header"><h2>智能驾驶舱</h2><p>企业经营核心指标</p></div>
    <el-row :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="4" v-for="k in kpis" :key="k.label">
        <el-card shadow="hover">
          <div style="font-size: 13px; color: #909399;">{{ k.label }}</div>
          <div style="font-size: 22px; font-weight: 700; margin-top: 6px;" :style="{ color: k.color }">{{ k.value }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="16">
        <el-card>
          <template #header>收入 / 支出趋势（万元）</template>
          <div ref="chart" style="height: 320px;"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>预警提醒</template>
          <el-alert v-for="(a, i) in alerts" :key="i" :title="a.msg" :type="a.type" show-icon :closable="false" style="margin-bottom: 8px;" />
          <el-empty v-if="!alerts.length" description="暂无预警" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as echarts from 'echarts';
import { getCockpit } from '../api/modules';

const data = ref({});
const chart = ref(null);
let inst = null;

const kpis = computed(() => {
  const d = data.value;
  return [
    { label: '收入(万)', value: d.revenue ?? '-', color: '#2563eb' },
    { label: '支出(万)', value: d.expense ?? '-', color: '#f59e0b' },
    { label: '利润(万)', value: d.profit ?? '-', color: '#10b981' },
    { label: '员工数', value: d.headcount ?? '-', color: '#8b5cf6' },
    { label: '客户数', value: d.customerTotal ?? '-', color: '#06b6d4' },
    { label: '执行合同', value: d.activeContracts ?? '-', color: '#ef4444' },
  ];
});
const alerts = computed(() => data.value.alerts || []);

function rz() { inst && inst.resize(); }
onMounted(async () => {
  const r = await getCockpit();
  if (r.success) data.value = r.data || {};
  inst = echarts.init(chart.value);
  inst.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['收入', '支出'] },
    xAxis: { type: 'category', data: data.value.revenueTrend?.labels || [] },
    yAxis: { type: 'value' },
    series: [
      { name: '收入', type: 'line', smooth: true, data: data.value.revenueTrend?.data || [], itemStyle: { color: '#2563eb' } },
      { name: '支出', type: 'line', smooth: true, data: data.value.expenseTrend?.data || [], itemStyle: { color: '#f59e0b' } },
    ],
  });
  window.addEventListener('resize', rz);
});
onUnmounted(() => { window.removeEventListener('resize', rz); inst && inst.dispose(); });
</script>
