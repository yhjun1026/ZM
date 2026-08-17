<template>
  <div v-loading="loading">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <StatCard title="报销总额" :value="'¥' + fmtMoney(d.expense?.total)" :sub="(d.expense?.count || 0) + '笔'" :icon="Document" color="#2563eb" />
      <StatCard title="借款余额" :value="'¥' + fmtMoney(d.loan?.outstanding)" :sub="(d.loan?.count || 0) + '笔'" :icon="Coin" color="#f59e0b" />
      <StatCard title="付款总额" :value="'¥' + fmtMoney(d.payment?.total)" :sub="(d.payment?.count || 0) + '笔'" :icon="CreditCard" color="#10b981" />
      <StatCard title="发票总额" :value="'¥' + fmtMoney(d.invoice?.total)" :sub="(d.invoice?.count || 0) + '张'" :icon="Tickets" color="#8b5cf6" />
      <StatCard title="预算执行率" :value="(d.budget?.usage_rate || 0) + '%'" :sub="'¥' + fmtMoney(d.budget?.used) + '/' + fmtMoney(d.budget?.total)" :icon="PieChart" color="#ef4444" />
    </div>

    <!-- 月度趋势 -->
    <el-card shadow="never" style="margin-bottom: 24px;">
      <template #header>
        <span><el-icon><TrendCharts /></el-icon> 月度趋势 ({{ year }}年)</span>
      </template>
      <div ref="chartRef" style="height: 300px;"></div>
    </el-card>

    <!-- 近期报销 / 超期借款 -->
    <el-row :gutter="24">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>近期报销</span>
              <el-button link type="primary" size="small" @click="$emit('switch-tab', 'expense')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentExpenses" size="small">
            <el-table-column prop="form_no" label="单号" min-width="120" />
            <el-table-column prop="applicant" label="申请人" width="90" />
            <el-table-column label="金额" width="110">
              <template #default="{ row }">¥{{ fmtAmt(row.actual_amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <template #empty><span style="color: var(--el-text-color-secondary);">暂无</span></template>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>超期借款</span>
              <el-button link type="primary" size="small" @click="$emit('switch-tab', 'loan')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="overdueLoans" size="small">
            <el-table-column prop="form_no" label="单号" min-width="120" />
            <el-table-column prop="applicant" label="申请人" width="90" />
            <el-table-column label="未还金额" width="110">
              <template #default="{ row }">¥{{ fmtAmt(row.outstanding_amount) }}</template>
            </el-table-column>
            <el-table-column label="超期天数" width="90">
              <template #default="{ row }">
                <el-tag type="danger" size="small">{{ row.overdue_days || 0 }}天</el-tag>
              </template>
            </el-table-column>
            <template #empty><span style="color: var(--el-text-color-secondary);">无超期</span></template>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import { Document, Coin, CreditCard, Tickets, PieChart, TrendCharts } from '@element-plus/icons-vue';
import request from '../../api/request';
import { fmtMoney, fmtAmt, statusType } from './finUtils';
import StatCard from './StatCard.vue';

defineEmits(['switch-tab']);

const year = new Date().getFullYear();
const loading = ref(false);
const d = ref({});
const months = ref([]);
const recentExpenses = ref([]);
const overdueLoans = ref([]);
const chartRef = ref(null);
let chartInst = null;

async function load() {
  loading.value = true;
  try {
    const [ov, trend] = await Promise.all([
      request.get('/fin-ledger/stats/overview', { params: { year } }),
      request.get('/fin-ledger/stats/monthly-trend', { params: { year } }),
    ]);
    d.value = ov.code === 200 ? ov.data || {} : {};
    months.value = trend.code === 200 ? trend.data?.months || [] : [];
    await nextTick();
    renderChart();
    // 近期报销和超期借款 (静默失败)
    try {
      const [expResp, loanResp] = await Promise.all([
        request.get('/fin-expense', { params: { pageSize: 5 } }),
        request.get('/fin-loan/overdue-list'),
      ]);
      recentExpenses.value = expResp.code === 200 ? expResp.data?.list || [] : [];
      overdueLoans.value = loanResp.code === 200 ? (loanResp.data || []).slice(0, 5) : [];
    } catch { /* 静默 */ }
  } finally {
    loading.value = false;
  }
}

function renderChart() {
  if (!chartRef.value || !months.value.length) return;
  if (chartInst) chartInst.dispose();
  chartInst = echarts.init(chartRef.value);
  chartInst.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['报销', '付款', '借款'] },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: months.value.map((m) => m.month + '月') },
    yAxis: { type: 'value' },
    series: [
      { name: '报销', type: 'line', smooth: true, data: months.value.map((m) => m.expense.amount), itemStyle: { color: '#2563eb' }, areaStyle: { color: 'rgba(37,99,235,0.1)' } },
      { name: '付款', type: 'line', smooth: true, data: months.value.map((m) => m.payment.amount), itemStyle: { color: '#10b981' }, areaStyle: { color: 'rgba(16,185,129,0.1)' } },
      { name: '借款', type: 'line', smooth: true, data: months.value.map((m) => m.loan.amount), itemStyle: { color: '#f59e0b' }, areaStyle: { color: 'rgba(245,158,11,0.1)' } },
    ],
  });
}

onMounted(load);
onBeforeUnmount(() => { if (chartInst) chartInst.dispose(); });
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
</style>
