<template>
  <div>
    <div class="page-header"><h2>工作台</h2><p>今日办公概览</p></div>
    <el-row :gutter="16" style="margin-bottom: 16px;">
      <el-col :span="6" v-for="c in cards" :key="c.label">
        <div class="stat-card">
          <div class="stat-icon" :style="{ background: c.color }"><el-icon><component :is="c.icon" /></el-icon></div>
          <div>
            <div class="stat-value">{{ c.value }}</div>
            <div class="stat-label">{{ c.label }}</div>
          </div>
        </div>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="16">
        <el-card>
          <template #header>收入 / 支出趋势（万元）</template>
          <div ref="chartRef" style="height: 320px;"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>最近动态</template>
          <el-timeline>
            <el-timeline-item v-for="(a, i) in activities" :key="i" :timestamp="a.time" placement="top">
              {{ a.user }} {{ a.action }}
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as echarts from 'echarts';
import { getDashboard } from '../api/modules';
import request from '../api/request';

const stats = ref({});
const activities = ref([]);
const chartRef = ref(null);
let chart = null;

const cards = computed(() => {
  const s = stats.value || {};
  return [
    { label: '今日打卡', value: s.todayCheckin ?? '-', color: '#2563eb', icon: 'Location' },
    { label: '员工总数', value: s.totalStaff ?? '-', color: '#10b981', icon: 'User' },
    { label: '待审批', value: s.pendingApprovals ?? '-', color: '#f59e0b', icon: 'Bell' },
    { label: '本月新客', value: s.newCustomers ?? '-', color: '#8b5cf6', icon: 'UserFilled' },
  ];
});

function resize() {
  chart && chart.resize();
}

onMounted(async () => {
  const res = await getDashboard();
  if (res.success) {
    stats.value = res.data.stats || {};
    activities.value = res.data.activities || [];
  }
  const cr = await request.get('/cockpit');
  const cp = cr.success ? cr.data : {};
  chart = echarts.init(chartRef.value);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['收入', '支出'] },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: cp.revenueTrend?.labels || [] },
    yAxis: { type: 'value' },
    series: [
      { name: '收入', type: 'line', smooth: true, data: cp.revenueTrend?.data || [], itemStyle: { color: '#2563eb' } },
      { name: '支出', type: 'line', smooth: true, data: cp.expenseTrend?.data || [], itemStyle: { color: '#f59e0b' } },
    ],
  });
  window.addEventListener('resize', resize);
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  chart && chart.dispose();
});
</script>
