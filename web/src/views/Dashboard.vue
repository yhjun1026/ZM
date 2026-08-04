<template>
  <div>
    <div class="page-header"><h2>工作台</h2><p>今日办公概览</p></div>

    <!-- 桌面端布局：4列网格 -->
    <el-row v-if="!isMobile" :gutter="16" style="margin-bottom: 16px;">
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

    <!-- 移动端布局：滑动卡片 -->
    <div v-else class="mobile-cards">
      <div class="mobile-card" v-for="c in cards" :key="c.label" :style="{ borderColor: c.color }">
        <el-icon :size="28" :style="{ color: c.color }"><component :is="c.icon" /></el-icon>
        <div class="mobile-card-content">
          <div class="mobile-card-value">{{ c.value }}</div>
          <div class="mobile-card-label">{{ c.label }}</div>
        </div>
      </div>
    </div>

    <!-- 桌面端：图表 + 动态 -->
    <el-row v-if="!isMobile" :gutter="16">
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

    <!-- 移动端：可折叠的图表和动态 -->
    <div v-else class="mobile-sections">
      <el-collapse v-model="activeCollapse">
        <el-collapse-item title="📊 收入/支出趋势" name="chart">
          <div ref="chartRef" style="height: 250px;"></div>
        </el-collapse-item>
        <el-collapse-item title="🔔 最近动态" name="activity">
          <div class="mobile-activities">
            <div v-for="(a, i) in activities" :key="i" class="activity-item">
              <div class="activity-text">{{ a.user }} {{ a.action }}</div>
              <div class="activity-time">{{ a.time }}</div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as echarts from 'echarts';
import { getDashboard } from '../api/modules';
import request from '../api/request';
import { useDevice } from '../composables/useDevice';

const { isMobile } = useDevice();
const stats = ref({});
const activities = ref([]);
const chartRef = ref(null);
const activeCollapse = ref(['chart']);
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

<style scoped>
.mobile-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.mobile-card {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  border-left: 3px solid;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.mobile-card-content {
  text-align: center;
}

.mobile-card-value {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
}

.mobile-card-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.mobile-sections {
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
}

.mobile-activities {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-item {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 6px;
}

.activity-text {
  font-size: 13px;
  color: #1f2937;
  margin-bottom: 4px;
}

.activity-time {
  font-size: 11px;
  color: #909399;
}

@media (max-width: 768px) {
  .page-header {
    margin-bottom: 12px;
  }
}
</style>
