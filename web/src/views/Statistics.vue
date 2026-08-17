<template>
  <div v-loading="loading" element-loading-text="加载中..." class="statistics-page">
    <div v-if="!loading && d" class="stats-page">
      <!-- 头部横幅 -->
      <div class="stats-header">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">多维度统计分析</h2>
          <p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:13px;">销售趋势 · 客户分布 · 人事指标 · 资产分析</p>
        </div>
      </div>

      <!-- 6 个统计卡 -->
      <div class="stats-grid">
        <div v-for="c in statCards" :key="c.label" class="stat-card-enhanced">
          <div class="stat-top-bar" :style="{ background: c.color }"></div>
          <div class="stat-card-inner">
            <div>
              <p class="stat-label">{{ c.label }}</p>
              <p class="stat-value" :style="{ color: c.color }">{{ c.value }}</p>
            </div>
            <div class="stat-icon-box" :style="{ background: c.color + '15' }">
              <el-icon :size="22" :color="c.color"><component :is="c.icon" /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- 4 个图表 -->
      <div class="stats-charts-grid">
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>月度销售趋势</h3></div>
          <div class="chart-container"><div ref="salesChartEl" class="chart-el"></div></div>
        </div>
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>客户行业分布</h3></div>
          <div class="chart-container"><div ref="industryChartEl" class="chart-el"></div></div>
        </div>
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>人事核心指标雷达图</h3></div>
          <div class="chart-container"><div ref="radarChartEl" class="chart-el"></div></div>
        </div>
        <div class="cockpit-chart-card">
          <div class="chart-card-header"><h3>固定资产分类</h3></div>
          <div class="chart-container"><div ref="assetChartEl" class="chart-el"></div></div>
        </div>
      </div>

      <!-- 各维度数据对比 -->
      <div class="cockpit-chart-card mt-16">
        <div class="chart-card-header"><h3>各维度数据对比</h3></div>
        <div class="chart-container" style="height:280px;"><div ref="compareChartEl" class="chart-el"></div></div>
      </div>
    </div>
    <el-card v-if="!loading && !d">
      <p style="color:#909399;">统计加载失败: {{ errorMsg }}</p>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import { Money, Connection, User, Star, Box, Present } from '@element-plus/icons-vue';
import request from '../api/request';

const loading = ref(true);
const errorMsg = ref('');
const d = ref(null);

const salesChartEl = ref(null);
const industryChartEl = ref(null);
const radarChartEl = ref(null);
const assetChartEl = ref(null);
const compareChartEl = ref(null);
let chartInsts = [];

// 兼容 {code:200,data} 与 {success:true,data} 两种响应格式
function unwrap(res, fallback) {
  if (res && (res.code === 200 || res.success === true)) return res.data ?? fallback;
  return fallback;
}

const statCards = computed(() => {
  const v = d.value || {};
  return [
    { label: '年度销售额', value: '¥' + ((v.sales.totalRevenue || 0) / 10000).toFixed(1) + '万', icon: Money, color: '#10b981' },
    { label: '成交笔数', value: (v.sales.deals || 0) + '笔', icon: Connection, color: '#2563eb' },
    { label: '在职人数', value: (v.hr.total || 0) + '人', icon: User, color: '#8b5cf6' },
    { label: '客户总数', value: (v.customers.length || 0) + '家', icon: Star, color: '#f59e0b' },
    { label: '资产净值', value: '¥' + (v.totalAssets / 10000).toFixed(1) + '万', icon: Box, color: '#06b6d4' },
    { label: '平均年龄', value: (v.hr.avgAge || 0) + '岁', icon: Present, color: '#ef4444' },
  ];
});

async function load() {
  loading.value = true;
  try {
    const results = await Promise.allSettled([
      request.get('/sales/overview', { silent: true }),
      request.get('/sales/monthly', { silent: true }),
      request.get('/hr/stats', { silent: true }),
      request.get('/customers', { silent: true }),
      request.get('/finance/overview', { silent: true }),
      request.get('/dashboard', { silent: true }),
      request.get('/hr/employees', { silent: true }),
    ]);
    const val = (i, fb) => (results[i].status === 'fulfilled' ? unwrap(results[i].value, fb) : fb);

    const sales = val(0, {});
    const monthly = val(1, []);
    const hr = val(2, {});
    const customers = val(3, []);
    const fin = val(4, {});
    const dash = val(5, {});
    const employees = val(6, []);

    const totalAssets = (fin.assets || []).reduce((s, a) => s + (a.net_value || 0), 0);

    // 客户行业分布
    const indMap = {};
    customers.forEach(c => { const ind = c.industry || '其他'; indMap[ind] = (indMap[ind] || 0) + 1; });
    const indLabels = Object.keys(indMap);
    const indData = Object.values(indMap);

    // 固定资产分类
    const cats = {};
    (fin.assets || []).forEach(a => { const c = a.category || '其他'; cats[c] = (cats[c] || 0) + 1; });

    d.value = { sales, monthly, hr, customers, fin, dash, employees, totalAssets, indLabels, indData, cats };
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

  // 月度销售趋势 — 柱状图
  makeChart(salesChartEl.value, {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: v.monthly.map(m => m.month), splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } } },
    series: [{
      name: '销售额(万)', type: 'bar', data: v.monthly.map(m => m.revenue),
      itemStyle: { color: '#2563eb', borderRadius: 6 },
    }],
  });

  // 客户行业分布 — 环形图
  const indColors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#ec4899'];
  makeChart(industryChartEl.value, {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 11 }, itemWidth: 12, itemGap: 12 },
    color: indColors.slice(0, Math.max(v.indLabels.length, 1)),
    series: [{
      type: 'pie', radius: ['55%', '75%'], center: ['50%', '44%'],
      label: { show: false },
      itemStyle: { borderWidth: 0 },
      data: v.indLabels.map((name, i) => ({ name, value: v.indData[i] })),
    }],
  });

  // 人事核心指标雷达图
  const maxVal = Math.max(v.hr.total || 27, 30);
  makeChart(radarChartEl.value, {
    tooltip: {},
    radar: {
      indicator: ['总人数', '在职率', '试用期', '平均工龄', '平均年龄', '新入职'].map(name => ({ name, max: maxVal })),
      radius: '65%', center: ['50%', '52%'],
    },
    series: [{
      name: '人事指标', type: 'radar',
      data: [{
        value: [v.hr.total || 0, v.hr.total || 0, v.hr.trial || 0, 2, v.hr.avgAge || 0, v.hr.newHires || 0],
        name: '人事指标',
        lineStyle: { color: '#8b5cf6', width: 2 },
        itemStyle: { color: '#8b5cf6' },
        areaStyle: { color: 'rgba(139,92,246,0.15)' },
        symbol: 'circle', symbolSize: 6,
      }],
    }],
  });

  // 固定资产分类 — 饼图（图例在右）
  makeChart(assetChartEl.value, {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { fontSize: 11 }, itemWidth: 12, itemGap: 10 },
    color: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'],
    series: [{
      type: 'pie', radius: '70%', center: ['38%', '50%'],
      label: { show: false },
      itemStyle: { borderWidth: 0 },
      data: Object.keys(v.cats).map(name => ({ name, value: v.cats[name] })),
    }],
  });

  // 各维度数据对比 — 横向柱状图
  const cmpColors = ['#2563eb', '#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ef4444'];
  makeChart(compareChartEl.value, {
    tooltip: { trigger: 'axis' },
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } } },
    yAxis: {
      type: 'category', inverse: true,
      data: ['销售额(万)', '合同额(万)', '资产净值(万)', '客户数', '员工数', '审批数'],
      splitLine: { show: false },
    },
    series: [{
      name: '当前值', type: 'bar',
      data: [
        Number(((v.sales.totalRevenue || 0) / 10000).toFixed(1)),
        Number((((v.dash.stats || {}).contractTotal || 0) / 10000).toFixed(1)),
        Number((v.totalAssets / 10000).toFixed(1)),
        v.customers.length,
        v.hr.total || 0,
        (v.dash.stats || {}).pendingApprovals || 0,
      ],
      itemStyle: { borderRadius: 8, color: (p) => cmpColors[p.dataIndex % cmpColors.length] },
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
.statistics-page { min-height: 200px; }
.stats-page { display: flex; flex-direction: column; gap: 20px; }
.mt-16 { margin-top: 16px; }

/* 头部横幅 */
.stats-header {
  padding: 20px 24px; border-radius: 12px;
  background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  color: #fff; box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
}
.stats-header h2 { color: #fff; }

/* 统计卡 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.stat-card-enhanced {
  position: relative; padding: 20px; background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
  transition: all .2s;
  overflow: hidden;
  cursor: default;
}
.stat-card-enhanced:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}
.stat-top-bar {
  position: absolute; top: 0; left: 0; right: 0; height: 3px;
  border-radius: 12px 12px 0 0;
}
.stat-card-inner {
  display: flex; align-items: center; justify-content: space-between;
}
.stat-label {
  font-size: 12px; margin: 0 0 6px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: #9ca3af;
}
.stat-value { font-size: 26px; font-weight: 700; margin: 0; }
.stat-icon-box {
  width: 48px; height: 48px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

/* 图表卡片 */
.stats-charts-grid {
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

@media (max-width: 768px) {
  .stats-charts-grid { grid-template-columns: 1fr; }
}
</style>
