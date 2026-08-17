<template>
  <div v-loading="loading" element-loading-text="加载中..." class="cockpit-page">
    <div v-if="!loading && d" class="cockpit">
      <!-- 深色头部横幅 + 实时数据徽章 -->
      <div class="cockpit-header">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">智能数据驾驶舱</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.65);font-size:13px;">公司经营核心指标实时看板 · {{ today }}</p>
        </div>
        <div class="cockpit-live">
          <span class="live-dot"></span> 实时数据
        </div>
      </div>

      <!-- 6 个彩色指标卡 -->
      <div class="cockpit-kpi-grid">
        <div v-for="k in kpis" :key="k.label" class="cockpit-kpi-card" :style="{ '--accent': k.color }">
          <div class="kpi-icon"><el-icon :size="22"><component :is="k.icon" /></el-icon></div>
          <div class="kpi-body">
            <div class="kpi-label">{{ k.label }}</div>
            <div class="kpi-value">{{ k.value }}<span class="kpi-unit">{{ k.unit }}</span></div>
            <div class="kpi-trend"><el-icon class="trend-icon"><component :is="k.trendIcon" /></el-icon> {{ k.trend }}</div>
          </div>
        </div>
      </div>

      <!-- 4 个图表 -->
      <div class="cockpit-charts">
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>销售趋势分析</h3></div>
          <div class="chart-container"><div ref="salesChartEl" class="chart-el"></div></div>
        </div>
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>客户分级分布</h3></div>
          <div class="chart-container"><div ref="customerChartEl" class="chart-el"></div></div>
        </div>
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>合同状态统计</h3></div>
          <div class="chart-container"><div ref="contractChartEl" class="chart-el"></div></div>
        </div>
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>部门人员分布</h3></div>
          <div class="chart-container"><div ref="deptChartEl" class="chart-el"></div></div>
        </div>
      </div>

      <!-- 智能预警 -->
      <div class="cockpit-alerts">
        <div class="chart-card-header"><h3>智能预警</h3></div>
        <div class="alerts-grid">
          <div v-for="(a, i) in alerts" :key="i" class="alert-item" :class="'alert-' + a.type">
            <el-icon :size="20" style="margin-top:2px;"><component :is="a.icon" /></el-icon>
            <div>
              <strong>{{ a.title }}</strong>
              <p>{{ a.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <el-card v-if="!loading && !d">
      <p style="color:#909399;">驾驶舱加载失败: {{ errorMsg }}</p>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import {
  Money, TrendCharts, User, Connection, Box, Bell,
  ArrowUp, UserFilled, Star, Clock,
  Warning, CircleClose, InfoFilled, CircleCheck,
} from '@element-plus/icons-vue';
import request from '../api/request';

const loading = ref(true);
const errorMsg = ref('');
const d = ref(null);
const today = new Date().toLocaleDateString('zh-CN');

const salesChartEl = ref(null);
const customerChartEl = ref(null);
const contractChartEl = ref(null);
const deptChartEl = ref(null);
let chartInsts = [];

// 兼容 {code:200,data} 与 {success:true,data} 两种响应格式
function unwrap(res, fallback) {
  if (res && (res.code === 200 || res.success === true)) return res.data ?? fallback;
  return fallback;
}

const kpis = computed(() => {
  const v = d.value || {};
  return [
    { label: '合同总额', value: '¥' + (v.contractTotal / 10000).toFixed(1), unit: '万', trend: v.contracts.length + '笔合同', color: '#2563eb', icon: Money, trendIcon: ArrowUp },
    { label: '销售收入', value: '¥' + ((v.sales.totalRevenue || 0) / 10000).toFixed(1), unit: '万', trend: '完成率' + (v.sales.rate || 0) + '%', color: '#10b981', icon: TrendCharts, trendIcon: ArrowUp },
    { label: '在职员工', value: v.hr.total || (v.dash.stats || {}).totalStaff || 0, unit: '人', trend: '本月入职' + (v.hr.newHires || 0) + '人', color: '#f59e0b', icon: User, trendIcon: UserFilled },
    { label: '客户总数', value: v.customers.length, unit: '家', trend: 'A级' + v.customerA + ' · B级' + v.customerB + ' · C级' + v.customerC, color: '#8b5cf6', icon: Connection, trendIcon: Star },
    { label: '固定资产净值', value: '¥' + (v.totalAssets / 10000).toFixed(1), unit: '万', trend: (v.fin.assets || []).length + '项资产', color: '#06b6d4', icon: Box, trendIcon: Box },
    { label: '待审批事项', value: v.pendingAppr, unit: '项', trend: '请及时处理', color: '#ef4444', icon: Bell, trendIcon: Clock },
  ];
});

const alerts = computed(() => {
  const v = d.value || {};
  const list = [];
  if (v.pendingAppr > 0) {
    list.push({ type: 'warning', icon: Warning, title: v.pendingAppr + '项审批待处理', desc: '合同/采购/假期/报销等待审批中' });
  }
  const overdue = (v.fin.receivable || []).filter(r => r.status === '逾期').length;
  if (overdue > 0) {
    list.push({ type: 'danger', icon: CircleClose, title: '应收账款逾期', desc: overdue + '笔应收账款已逾期' });
  }
  if ((v.sales.rate || 0) < 50) {
    list.push({ type: 'info', icon: InfoFilled, title: '销售目标进度', desc: '当前完成率' + (v.sales.rate || 0) + '%，距年度目标尚有差距' });
  } else {
    list.push({ type: 'success', icon: CircleCheck, title: '销售进度良好', desc: '已完成' + (v.sales.rate || 0) + '%年度目标' });
  }
  if (v.hr.turnoverRate > 10) {
    list.push({ type: 'warning', icon: User, title: '人员流动关注', desc: '当前离职率' + (v.hr.turnoverRate || 0) + '%，建议关注' });
  }
  return list;
});

async function load() {
  loading.value = true;
  try {
    const results = await Promise.allSettled([
      request.get('/dashboard'),
      request.get('/sales/overview'),
      request.get('/sales/monthly'),
      request.get('/finance/overview'),
      request.get('/hr/stats'),
      request.get('/customers'),
      request.get('/contracts'),
      request.get('/hr/employees'),
    ]);
    const val = (i, fb) => (results[i].status === 'fulfilled' ? unwrap(results[i].value, fb) : fb);

    const dash = val(0, {});
    const sales = val(1, {});
    const monthly = val(2, []);
    const fin = val(3, {});
    const hr = val(4, {});
    const customers = val(5, []);
    const contracts = val(6, []);
    const employees = val(7, []);

    const totalAssets = (fin.assets || []).reduce((s, a) => s + (a.net_value || 0), 0);
    const contractTotal = contracts.reduce((s, c) => s + (c.amount || 0), 0);
    const customerA = customers.filter(c => (c.level || '').includes('A')).length;
    const customerB = customers.filter(c => (c.level || '').includes('B')).length;
    const customerC = customers.filter(c => (c.level || '').includes('C')).length;
    const pendingAppr = (dash.stats || {}).pendingApprovals || 0;

    // 部门人员分布（从实际员工数据统计）
    const deptMap = {};
    employees.forEach(e => { deptMap[e.dept] = (deptMap[e.dept] || 0) + 1; });
    const deptLabels = Object.keys(deptMap);
    const deptData = deptLabels.map(x => deptMap[x]);

    // 合同状态统计
    const contPending = contracts.filter(c => (c.status || '') === '待审批').length;
    const contApproved = contracts.filter(c => (c.status || '') === '执行中').length;
    const contRejected = contracts.filter(c => (c.status || '') === '已驳回').length;

    d.value = {
      dash, sales, monthly, fin, hr, customers, contracts, employees,
      totalAssets, contractTotal, customerA, customerB, customerC, pendingAppr,
      deptLabels, deptData, contPending, contApproved, contRejected,
    };
    loading.value = false;
    await nextTick();
    initCharts();
  } catch (e) {
    errorMsg.value = e.message || String(e);
    d.value = null;
    loading.value = false;
  }
}

function makeChart(el, option) {
  if (!el) return;
  const inst = echarts.init(el);
  inst.setOption(option);
  chartInsts.push(inst);
}

function initCharts() {
  const v = d.value;
  if (!v) return;

  // 销售趋势 — 折线图（面积填充）
  const labels = v.monthly.map(m => m.month);
  const data = v.monthly.map(m => m.revenue);
  makeChart(salesChartEl.value, {
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const p = ps[0] || {};
        const m = v.monthly[p.dataIndex] || {};
        return p.name + '<br/>销售额(万): ' + p.value + '<br/>成交' + (m.deals ?? 0) + '笔';
      },
    },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: labels, boundaryGap: false, splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } } },
    series: [{
      name: '销售额(万)', type: 'line', data, smooth: true,
      symbol: 'circle', symbolSize: 8,
      lineStyle: { color: '#2563eb', width: 2 },
      itemStyle: { color: '#2563eb' },
      areaStyle: { color: 'rgba(37,99,235,0.1)' },
    }],
  });

  // 客户分级分布 — 环形图
  makeChart(customerChartEl.value, {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 12 }, itemWidth: 14, itemGap: 15 },
    color: ['#2563eb', '#f59e0b', '#06b6d4'],
    series: [{
      type: 'pie', radius: ['60%', '80%'], center: ['50%', '44%'],
      label: { show: false },
      itemStyle: { borderWidth: 0 },
      data: [
        { name: 'A级客户', value: v.customerA },
        { name: 'B级客户', value: v.customerB },
        { name: 'C级客户', value: v.customerC },
      ],
    }],
  });

  // 合同状态统计 — 饼图
  makeChart(contractChartEl.value, {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 12 }, itemWidth: 14, itemGap: 15 },
    color: ['#f59e0b', '#10b981', '#ef4444'],
    series: [{
      type: 'pie', radius: '68%', center: ['50%', '44%'],
      label: { show: false },
      itemStyle: { borderWidth: 0 },
      data: [
        { name: '待审批', value: v.contPending },
        { name: '执行中', value: v.contApproved },
        { name: '已驳回', value: v.contRejected },
      ],
    }],
  });

  // 部门人员分布 — 柱状图
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#6366f1', '#ec4899'];
  makeChart(deptChartEl.value, {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: v.deptLabels, splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, minInterval: 1, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } } },
    series: [{
      name: '人数', type: 'bar', data: v.deptData,
      itemStyle: { borderRadius: 6, color: (p) => colors[p.dataIndex % colors.length] },
    }],
  });
}

function resizeAll() { chartInsts.forEach(c => c && c.resize()); }

onMounted(() => {
  load();
  window.addEventListener('resize', resizeAll);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeAll);
  chartInsts.forEach(c => c && c.dispose());
  chartInsts = [];
});
</script>

<style scoped>
.cockpit-page { min-height: 200px; }
.cockpit { display: flex; flex-direction: column; gap: 20px; }

/* 深色头部横幅 */
.cockpit-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-radius: 12px;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: #fff; box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
}
.cockpit-header h2 { color: #fff; }
.cockpit-live {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; padding: 6px 14px;
  background: rgba(16,185,129,0.15); border-radius: 20px;
  color: #34d399; font-weight: 600;
}
.live-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #34d399; animation: livePulse 1.5s infinite;
}
@keyframes livePulse {
  0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.7); }
  70% { box-shadow: 0 0 0 8px rgba(52,211,153,0); }
  100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
}

/* KPI 卡片 */
.cockpit-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.cockpit-kpi-card {
  position: relative;
  display: flex; align-items: center; gap: 16px;
  padding: 20px; border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
  transition: all .2s;
  overflow: hidden;
}
.cockpit-kpi-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: var(--accent);
  border-radius: 12px 12px 0 0;
}
.cockpit-kpi-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(0,0,0,0.12);
}
.kpi-icon {
  width: 52px; height: 52px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  background: var(--accent);
  box-shadow: 0 4px 12px rgba(0,0,0,0.18);
  flex-shrink: 0;
}
.kpi-body { flex: 1; min-width: 0; }
.kpi-label { font-size: 12px; color: #9ca3af; margin-bottom: 4px; font-weight: 500; }
.kpi-value { font-size: 24px; font-weight: 700; color: #1f2937; line-height: 1.2; }
.kpi-unit { font-size: 13px; font-weight: 500; color: #6b7280; margin-left: 4px; }
.kpi-trend { font-size: 12px; color: #6b7280; margin-top: 4px; }
.kpi-trend .trend-icon { color: var(--accent); margin-right: 2px; vertical-align: -2px; }

/* 图表卡片 */
.cockpit-charts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48%, 1fr));
  gap: 16px;
}
.cockpit-chart-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
  overflow: hidden;
  transition: all .2s;
}
.cockpit-chart-card:hover {
  box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
}
.chart-card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}
.chart-card-header h3 { font-size: 15px; font-weight: 600; margin: 0; }
.chart-container {
  padding: 16px 20px;
  height: 240px;
  position: relative;
}
.chart-el { width: 100%; height: 100%; }

/* 智能预警 */
.cockpit-alerts {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
  overflow: hidden;
}
.alerts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  padding: 16px 20px;
}
.alert-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 16px; border-radius: 6px;
  border-left: 3px solid;
}
.alert-item strong { font-size: 13px; }
.alert-item p { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
.alert-warning { background: #fef3c7; border-color: #f59e0b; }
.alert-warning .el-icon { color: #f59e0b; }
.alert-danger { background: #fee2e2; border-color: #ef4444; }
.alert-danger .el-icon { color: #ef4444; }
.alert-success { background: #d1fae5; border-color: #10b981; }
.alert-success .el-icon { color: #10b981; }
.alert-info { background: #dbeafe; border-color: #2563eb; }
.alert-info .el-icon { color: #2563eb; }

@media (max-width: 768px) {
  .cockpit-charts { grid-template-columns: 1fr; }
  .alerts-grid { grid-template-columns: 1fr; }
}
</style>
