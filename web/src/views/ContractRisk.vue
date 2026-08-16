<template>
  <div class="contract-risk">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2>合同风险评分与智能预警</h2>
        <p>风险等级分布与预警管理</p>
      </div>
      <el-button v-if="canRefresh" type="primary" @click="handleRefresh">
        <el-icon><Refresh /></el-icon> 刷新评分
      </el-button>
    </div>

    <!-- Tab切换 -->
    <el-tabs v-model="activeTab" style="margin-bottom: 20px;">
      <el-tab-pane label="风险总览" name="overview">
        <!-- KPI卡片 -->
        <el-row :gutter="16" style="margin-bottom: 20px;">
          <el-col :xs="12" :sm="6" v-for="kpi in kpis" :key="kpi.label">
            <el-card shadow="hover" :body-style="{ padding: '20px' }">
              <div style="text-align: center;">
                <div style="font-size: 13px; color: #909399;">{{ kpi.label }}</div>
                <div style="font-size: 28px; font-weight: 700; margin-top: 8px;" :style="{ color: kpi.color }">
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
              <template #header><strong>风险等级分布</strong></template>
              <div ref="distributionChart" style="height: 300px;"></div>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="8">
            <el-card>
              <template #header><strong>风险因子分析</strong></template>
              <div ref="factorsChart" style="height: 300px;"></div>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="8">
            <el-card>
              <template #header><strong>风险趋势</strong></template>
              <div ref="trendChart" style="height: 300px;"></div>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane label="风险合同" name="contracts">
        <el-card>
          <template #header><strong>风险合同列表</strong></template>
          <el-table :data="riskContracts" stripe>
            <el-table-column prop="contract_no" label="合同编号" width="120" />
            <el-table-column prop="title" label="合同名称" min-width="200" />
            <el-table-column label="风险等级" width="100">
              <template #default="{ row }">
                <el-tag :type="row.riskLevel === '高' || row.riskLevel === '极高' ? 'danger' : row.riskLevel === '中' ? 'warning' : 'success'" size="small">
                  {{ row.riskLevel }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="riskScore" label="风险评分" width="100">
              <template #default="{ row }">
                <span :style="{ color: row.riskLevel === '高' || row.riskLevel === '极高' ? '#ef4444' : '#606266', fontWeight: 'bold' }">
                  {{ row.riskScore }}分
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column label="金额" width="120">
              <template #default="{ row }">¥{{ formatAmount(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="end_date" label="到期日期" width="110" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" @click="viewContract(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="预警管理" name="alerts">
        <el-card>
          <template #header><strong>预警列表</strong></template>
          <el-table :data="alerts" stripe>
            <el-table-column prop="id" label="预警ID" width="150" />
            <el-table-column prop="title" label="预警标题" min-width="200" />
            <el-table-column label="严重程度" width="100">
              <template #default="{ row }">
                <el-tag :type="row.severity === '紧急' ? 'danger' : 'warning'" size="small">{{ row.severity }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="alert_type" label="预警类型" width="120" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === '已处理' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="160" />
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button v-if="row.status === '待处理'" size="small" type="primary" @click="handleAlert(row)">处理</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const canRefresh = computed(() => ['超级管理员', '总经理'].includes(auth.user?.role));

const activeTab = ref('overview');
const kpis = ref([]);
const riskContracts = ref([]);
const alerts = ref([]);
const distributionChart = ref(null);
const factorsChart = ref(null);
const trendChart = ref(null);

let charts = [];

function formatAmount(amount) {
  if (!amount) return '0';
  if (amount >= 10000) return (amount / 10000).toFixed(1) + '万';
  return amount.toLocaleString();
}

async function loadData() {
  try {
    const [statsRes, scoresRes, alertsRes, trendRes, factorsRes] = await Promise.all([
      request.get('/contract-risk/stats'),
      request.get('/contract-risk/risk-scores'),
      request.get('/contract-risk/alerts'),
      request.get('/contract-risk/trend'),
      request.get('/contract-risk/factors')
    ]);

    if (statsRes.data.success) {
      const data = statsRes.data.data;
      kpis.value = [
        { label: '高风险合同', value: data.highRisk, color: '#ef4444' },
        { label: '中风险合同', value: data.mediumRisk, color: '#f59e0b' },
        { label: '低风险合同', value: data.lowRisk, color: '#10b981' },
        { label: '预警数量', value: data.alertCount, color: '#8b5cf6' }
      ];
      renderDistributionChart(data.distribution || []);
    }

    if (scoresRes.data.success) {
      riskContracts.value = scoresRes.data.data;
    }

    if (alertsRes.data.success) {
      alerts.value = alertsRes.data.data;
    }

    if (trendRes.data.success) {
      renderTrendChart(trendRes.data.data);
    }

    if (factorsRes.data.success) {
      renderFactorsChart(factorsRes.data.data);
    }
  } catch (e) {
    console.error('加载风险数据失败:', e);
  }
}

function renderDistributionChart(data) {
  if (!distributionChart.value) return;
  const chart = echarts.init(distributionChart.value);
  charts.push(chart);

  const colors = { '极高': '#ef4444', '高': '#f59e0b', '中': '#f59e0b', '低': '#10b981' };

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c}个 ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: data.map(item => ({
        name: item.level,
        value: item.count,
        itemStyle: { color: colors[item.level] }
      })),
      label: { show: true, formatter: '{b}\n{d}%' }
    }]
  });
}

function renderFactorsChart(data) {
  if (!factorsChart.value) return;
  const chart = echarts.init(factorsChart.value);
  charts.push(chart);

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.map(f => f.factor) },
    series: [{
      type: 'bar',
      data: data.map(f => f.weight),
      itemStyle: { color: '#2563eb' },
      label: { show: true, position: 'right', formatter: '{c}分' }
    }]
  });
}

function renderTrendChart(data) {
  if (!trendChart.value) return;
  const chart = echarts.init(trendChart.value);
  charts.push(chart);

  chart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: data.map(d => d.month) },
    yAxis: { type: 'value' },
    series: [{
      data: data.map(d => d.avgRisk),
      type: 'line',
      smooth: true,
      areaStyle: { opacity: 0.3 },
      itemStyle: { color: '#8b5cf6' }
    }]
  });
}

async function handleRefresh() {
  try {
    const res = await request.post('/contract-risk/refresh');
    if (res.data.success) {
      ElMessage.success('风险评分已刷新');
      loadData();
    } else {
      ElMessage.error(res.data.message || '刷新失败');
    }
  } catch (e) {
    ElMessage.error('刷新失败');
  }
}

async function handleAlert(row) {
  try {
    const res = await request.put(`/contract-risk/alerts/${row.id}/handle`, { status: '已处理' });
    if (res.data.success) {
      ElMessage.success('预警已处理');
      loadData();
    }
  } catch (e) {
    ElMessage.error('处理失败');
  }
}

function viewContract(row) {
  window.location.href = `/contract?id=${row.id}`;
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
.contract-risk {
  padding: 20px;
}
</style>
