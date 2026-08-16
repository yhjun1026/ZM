<template>
  <div class="contract-analytics">
    <div class="page-header">
      <h2>合同分析仪表板</h2>
      <p>合同全生命周期数据看板</p>
    </div>

    <!-- KPI卡片 -->
    <el-row :gutter="16" style="margin-bottom: 20px;">
      <el-col :xs="12" :sm="6" :lg="3" v-for="kpi in kpis" :key="kpi.label">
        <el-card shadow="hover">
          <div style="text-align: center;">
            <div style="font-size: 13px; color: #909399;">{{ kpi.label }}</div>
            <div style="font-size: 24px; font-weight: 700; margin-top: 8px;" :style="{ color: kpi.color }">
              {{ kpi.value }}
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="16" style="margin-bottom: 20px;">
      <el-col :xs="24" :lg="8">
        <el-card>
          <template #header><strong>状态分布</strong></template>
          <div ref="statusChart" style="height: 300px;"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card>
          <template #header><strong>类型分布</strong></template>
          <div ref="typeChart" style="height: 300px;"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card>
          <template #header><strong>月度趋势</strong></template>
          <div ref="trendChart" style="height: 300px;"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 部门统计表 -->
    <el-card>
      <template #header><strong>部门合同统计</strong></template>
      <el-table :data="departmentStats" stripe>
        <el-table-column prop="department" label="部门" width="150" />
        <el-table-column prop="total" label="合同总数" width="100" />
        <el-table-column prop="effective" label="已生效" width="90" />
        <el-table-column prop="pending" label="审批中" width="90" />
        <el-table-column prop="draft" label="草稿" width="90" />
        <el-table-column prop="archived" label="已归档" width="90" />
        <el-table-column label="总金额" min-width="150">
          <template #default="{ row }">
            ¥{{ formatAmount(row.totalAmount) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import request from '../api/request';

const kpis = ref([]);
const departmentStats = ref([]);
const statusChart = ref(null);
const typeChart = ref(null);
const trendChart = ref(null);

let charts = [];

async function loadData() {
  try {
    const [overviewRes, deptRes, trendRes] = await Promise.all([
      request.get('/contract-analytics/overview'),
      request.get('/contract-analytics/department-stats'),
      request.get('/contract-analytics/monthly-trend')
    ]);

    if (overviewRes.data.success) {
      const ov = overviewRes.data.data;
      kpis.value = [
        { label: '合同总数', value: ov.total, color: '#2563eb' },
        { label: '总金额', value: formatAmount(ov.amount.total), color: '#10b981' },
        { label: '即将到期', value: ov.expiringWithin30Days, color: '#f59e0b' },
        { label: '已过期', value: ov.expiredCount, color: '#ef4444' },
        { label: '审批中', value: ov.pendingApproval, color: '#8b5cf6' },
        { label: '草稿', value: ov.draft, color: '#94a3b8' }
      ];

      renderStatusChart(ov.statusDistribution);
      renderTypeChart(ov.typeDistribution);
    }

    if (deptRes.data.success) {
      departmentStats.value = deptRes.data.data;
    }

    if (trendRes.data.success) {
      renderTrendChart(trendRes.data.data);
    }
  } catch (e) {
    console.error('加载合同分析数据失败:', e);
  }
}

function formatAmount(amount) {
  if (!amount) return '0';
  if (amount >= 10000) {
    return (amount / 10000).toFixed(1) + '万';
  }
  return amount.toLocaleString();
}

function renderStatusChart(data) {
  if (!statusChart.value) return;
  const chart = echarts.init(statusChart.value);
  charts.push(chart);

  const statusColors = {
    '草稿': '#94a3b8',
    '审批中': '#f59e0b',
    '已生效': '#10b981',
    '已盖章': '#2563eb',
    '已归档': '#6366f1',
    '已驳回': '#ef4444'
  };

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: data.map(item => ({
        name: item.status,
        value: item.count,
        itemStyle: { color: statusColors[item.status] || '#64748b' }
      })),
      label: { show: true, formatter: '{b}\n{d}%' }
    }]
  });
}

function renderTypeChart(data) {
  if (!typeChart.value) return;
  const chart = echarts.init(typeChart.value);
  charts.push(chart);

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: data.map(item => ({
        name: item.type,
        value: item.count
      })),
      label: { show: true, formatter: '{b}\n{d}%' }
    }]
  });
}

function renderTrendChart(data) {
  if (!trendChart.value) return;
  const chart = echarts.init(trendChart.value);
  charts.push(chart);

  chart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map(d => d.month)
    },
    yAxis: { type: 'value' },
    series: [{
      data: data.map(d => d.count),
      type: 'line',
      smooth: true,
      areaStyle: { opacity: 0.3 },
      itemStyle: { color: '#2563eb' }
    }]
  });
}

onMounted(() => {
  loadData();
  window.addEventListener('resize', () => {
    charts.forEach(chart => chart.resize());
  });
});

onUnmounted(() => {
  charts.forEach(chart => chart.dispose());
  window.removeEventListener('resize', () => {});
});
</script>

<style scoped>
.contract-analytics {
  padding: 20px;
}
</style>