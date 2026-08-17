<template>
  <div class="contract-risk">
    <!-- 加载中 -->
    <div v-if="pageLoading" class="cr-loading">
      <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载合同风险数据...
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="error-box">
      <el-icon><WarningFilled /></el-icon> 加载失败: {{ loadError }}
      <br />
      <el-button size="small" type="primary" style="margin-top: 10px;" @click="loadOverview">重试</el-button>
    </div>

    <template v-else>
      <!-- 风险概览KPI -->
      <div class="cr-header">
        <h2><el-icon><Lock /></el-icon> 合同风险评分与智能预警</h2>
        <el-button size="small" type="primary" @click="refreshRiskScores">
          <el-icon><Refresh /></el-icon> 刷新评分
        </el-button>
      </div>

      <div class="cr-kpi-grid">
        <div class="cr-kpi-card cr-kpi-high">
          <div class="cr-kpi-icon"><el-icon :size="20"><WarningFilled /></el-icon></div>
          <div class="cr-kpi-body">
            <div class="cr-kpi-value">{{ highCount }}</div>
            <div class="cr-kpi-label">高风险合同</div>
          </div>
        </div>
        <div class="cr-kpi-card cr-kpi-mid">
          <div class="cr-kpi-icon"><el-icon :size="20"><InfoFilled /></el-icon></div>
          <div class="cr-kpi-body">
            <div class="cr-kpi-value">{{ midCount }}</div>
            <div class="cr-kpi-label">中风险合同</div>
          </div>
        </div>
        <div class="cr-kpi-card cr-kpi-low">
          <div class="cr-kpi-icon"><el-icon :size="20"><CircleCheck /></el-icon></div>
          <div class="cr-kpi-body">
            <div class="cr-kpi-value">{{ lowCount }}</div>
            <div class="cr-kpi-label">低风险合同</div>
          </div>
        </div>
        <div class="cr-kpi-card cr-kpi-alert">
          <div class="cr-kpi-icon"><el-icon :size="20"><Bell /></el-icon></div>
          <div class="cr-kpi-body">
            <div class="cr-kpi-value">{{ pendingAlerts }}</div>
            <div class="cr-kpi-label">待处理预警</div>
          </div>
        </div>
        <div class="cr-kpi-card cr-kpi-total">
          <div class="cr-kpi-icon"><el-icon :size="20"><Document /></el-icon></div>
          <div class="cr-kpi-body">
            <div class="cr-kpi-value">{{ totalContracts }}</div>
            <div class="cr-kpi-label">已评估合同</div>
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div class="cr-charts-grid">
        <div class="cr-chart-card">
          <h3>风险等级分布</h3>
          <div class="cr-chart-box" ref="distChartRef"></div>
        </div>
        <div class="cr-chart-card">
          <h3>风险因子分析</h3>
          <div class="cr-chart-box" ref="factorChartRef"></div>
        </div>
        <div class="cr-chart-card" style="grid-column: 1 / -1;">
          <h3>风险趋势（近12个月）</h3>
          <div class="cr-chart-box" ref="trendChartRef"></div>
        </div>
      </div>

      <!-- Tab切换 -->
      <div class="cr-tabs">
        <button class="cr-tab" :class="{ active: activeTab === 'riskList' }" @click="switchTab('riskList')">风险合同列表</button>
        <button class="cr-tab" :class="{ active: activeTab === 'alerts' }" @click="switchTab('alerts')">
          预警管理 <span class="cr-badge">{{ pendingAlerts }}</span>
        </button>
        <button class="cr-tab" :class="{ active: activeTab === 'deptRisk' }" @click="switchTab('deptRisk')">部门风险分析</button>
      </div>

      <!-- 风险合同列表 -->
      <div v-show="activeTab === 'riskList'" class="cr-tab-content active">
        <div class="cr-filter-bar">
          <label>风险等级：</label>
          <select v-model="riskLevelFilter" class="cr-select" @change="loadRiskList">
            <option value="all">全部</option>
            <option value="极高">极高</option>
            <option value="高">高</option>
            <option value="中">中</option>
            <option value="低">低</option>
          </select>
        </div>
        <div v-if="riskListLoading" class="cr-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载中...
        </div>
        <div v-else-if="riskList.length === 0" class="empty-state">
          <el-icon :size="48"><Box /></el-icon>
          <p>暂无符合条件的风险评分记录</p>
        </div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>合同编号</th>
              <th>合同名称</th>
              <th>风险分</th>
              <th>等级</th>
              <th>主要风险因子</th>
              <th>金额</th>
              <th>状态</th>
              <th>到期日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in riskList" :key="item.contract_id">
              <td>{{ item.contract_no || '—' }}</td>
              <td :title="item.contract_name">
                {{ (item.contract_name || '').substring(0, 20) }}{{ (item.contract_name || '').length > 20 ? '...' : '' }}
              </td>
              <td :style="{ fontWeight: 'bold', color: levelColorMap[item.risk_level] || '#6b7280' }">{{ item.risk_score }}</td>
              <td><span class="cr-level-tag" :style="{ background: levelColorMap[item.risk_level] || '#6b7280' }">{{ item.risk_level }}</span></td>
              <td>
                <span v-if="mainFactors(item).length > 0">{{ mainFactors(item).join('、') }}</span>
                <span v-else style="color: #909399;">—</span>
              </td>
              <td>{{ item.amount > 0 ? '¥' + (item.amount >= 10000 ? (item.amount / 10000).toFixed(1) + '万' : item.amount) : '—' }}</td>
              <td>{{ item.contract_status || '—' }}</td>
              <td>{{ item.end_date || '—' }}</td>
              <td>
                <button class="btn btn-xs btn-outline" @click="viewRiskDetail(item.contract_id)">详情</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="riskListError" class="error-box">加载失败: {{ riskListError }}</div>
      </div>

      <!-- 预警管理 -->
      <div v-show="activeTab === 'alerts'" class="cr-tab-content active">
        <div class="cr-filter-bar">
          <label>预警类型：</label>
          <select v-model="alertTypeFilter" class="cr-select" @change="loadAlerts">
            <option value="all">全部</option>
            <option value="expiring">即将到期</option>
            <option value="expired">已过期</option>
            <option value="stale_draft">草稿停滞</option>
            <option value="high_risk">高风险</option>
            <option value="missing_info">信息缺失</option>
          </select>
          <label style="margin-left: 15px;">状态：</label>
          <select v-model="alertStatusFilter" class="cr-select" @change="loadAlerts">
            <option value="待处理">待处理</option>
            <option value="已处理">已处理</option>
            <option value="已忽略">已忽略</option>
            <option value="all">全部</option>
          </select>
        </div>
        <div v-if="alertsLoading" class="cr-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载中...
        </div>
        <div v-else-if="alertList.length === 0" class="empty-state">
          <el-icon :size="48"><CircleCheck /></el-icon>
          <p>暂无预警</p>
        </div>
        <div v-else class="cr-alert-list">
          <div v-for="a in alertList" :key="a.id" class="cr-alert-item"
            :style="{ borderLeft: '4px solid ' + (sevColorMap[a.severity] || '#6b7280') }">
            <div class="cr-alert-header">
              <div>
                <span class="cr-alert-type">{{ typeLabelMap[a.alert_type] || a.alert_type }}</span>
                <span class="cr-alert-sev" :style="{ background: sevColorMap[a.severity] || '#6b7280' }">{{ a.severity }}</span>
                <span style="font-weight: bold; margin-left: 8px;">{{ a.title }}</span>
              </div>
              <span class="cr-alert-status" :style="{ background: alertStatusColor(a.status) }">{{ a.status }}</span>
            </div>
            <div class="cr-alert-desc">{{ a.description }}</div>
            <div class="cr-alert-meta">
              <span><el-icon><Document /></el-icon> {{ a.contract_no || '—' }}</span>
              <span><el-icon><Clock /></el-icon> {{ a.created_at }}</span>
              <template v-if="a.handled_by">
                <span><el-icon><User /></el-icon> 处理人: {{ a.handled_by }}</span>
                <span><el-icon><Check /></el-icon> {{ a.handled_at }}</span>
              </template>
            </div>
            <div v-if="a.status === '待处理'" class="cr-alert-actions">
              <button class="btn btn-xs btn-success" @click="handleAlert(a.id, '已处理')">
                <el-icon><Check /></el-icon> 标记已处理
              </button>
              <button class="btn btn-xs btn-outline" @click="handleAlert(a.id, '已忽略')">
                <el-icon><Close /></el-icon> 忽略
              </button>
            </div>
          </div>
        </div>
        <div v-if="alertsError" class="error-box">加载失败: {{ alertsError }}</div>
      </div>

      <!-- 部门风险分析 -->
      <div v-show="activeTab === 'deptRisk'" class="cr-tab-content active">
        <div v-if="deptRiskLoading" class="cr-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon> 加载中...
        </div>
        <div v-else-if="deptRiskList.length === 0" class="empty-state">
          <el-icon :size="48"><Box /></el-icon>
          <p>暂无部门风险数据</p>
        </div>
        <template v-else>
          <table class="data-table">
            <thead>
              <tr>
                <th>部门</th>
                <th>合同数</th>
                <th>平均分</th>
                <th>高风险数</th>
                <th>金额</th>
                <th>期限</th>
                <th>状态</th>
                <th>到期</th>
                <th>缺失</th>
                <th>备注</th>
                <th>机密</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in deptRiskList" :key="d.dept">
                <td style="font-weight: bold;">{{ d.dept || '—' }}</td>
                <td>{{ d.count }}</td>
                <td :style="{ fontWeight: 'bold', color: scoreColor(d.avg_score) }">{{ d.avg_score || 0 }}</td>
                <td :style="{ color: (d.high_count || 0) > 0 ? '#dc2626' : '#9ca3af', fontWeight: 'bold' }">{{ d.high_count || 0 }}</td>
                <td>{{ (d.avg_amount || 0).toFixed(1) }}</td>
                <td>{{ (d.avg_duration || 0).toFixed(1) }}</td>
                <td>{{ (d.avg_status || 0).toFixed(1) }}</td>
                <td>{{ (d.avg_expiry || 0).toFixed(1) }}</td>
                <td>{{ (d.avg_missing || 0).toFixed(1) }}</td>
                <td>{{ (d.avg_risk_remark || 0).toFixed(1) }}</td>
                <td>{{ (d.avg_confidential || 0).toFixed(1) }}</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 10px; color: #9ca3af; font-size: 12px;">
            <el-icon><InfoFilled /></el-icon> 数值为各部门各风险因子的平均分
          </div>
        </template>
        <div v-if="deptRiskError" class="error-box">加载失败: {{ deptRiskError }}</div>
      </div>
    </template>

    <!-- 风险详情弹窗 -->
    <el-dialog v-model="detailVisible" width="700px">
      <template #header>
        <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
          <el-icon><Lock /></el-icon> 合同风险详情
        </span>
      </template>
      <div v-if="detailData">
        <div style="text-align: center; margin-bottom: 20px;">
          <div :style="{ fontSize: '48px', fontWeight: 'bold', color: levelColorMap[detailData.risk_level] || '#6b7280' }">
            {{ detailData.risk_score }}<span style="font-size: 16px; color: #9ca3af;">/100</span>
          </div>
          <span class="cr-level-tag"
            :style="{ background: levelColorMap[detailData.risk_level] || '#6b7280', fontSize: '14px', padding: '4px 16px' }">
            {{ detailData.risk_level }}
          </span>
          <div style="color: #9ca3af; font-size: 12px; margin-top: 5px;">评估时间: {{ detailData.evaluated_at || '—' }}</div>
        </div>

        <h4 style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">合同信息</h4>
        <table class="data-table" style="margin-bottom: 15px;">
          <tbody>
            <tr><td style="width: 120px;"><b>合同编号</b></td><td>{{ detailData.contract_no || detailContract.contract_no || '—' }}</td></tr>
            <tr><td><b>合同名称</b></td><td>{{ detailData.contract_name || detailContract.contract_name || '—' }}</td></tr>
            <tr><td><b>合同类型</b></td><td>{{ detailContract.contract_type || '—' }}</td></tr>
            <tr><td><b>对方公司</b></td><td>{{ detailContract.partner_company || '—' }}</td></tr>
            <tr><td><b>合同金额</b></td><td>{{ detailContract.amount ? '¥' + detailContract.amount.toLocaleString() : '—' }}</td></tr>
            <tr><td><b>合同状态</b></td><td>{{ detailContract.contract_status || '—' }}</td></tr>
            <tr><td><b>起止日期</b></td><td>{{ detailContract.start_date || '—' }} ~ {{ detailContract.end_date || '—' }}</td></tr>
          </tbody>
        </table>

        <h4 style="margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">风险因子分解</h4>
        <table class="data-table">
          <thead>
            <tr><th>风险因子</th><th>得分</th><th>最大分</th><th>占比</th><th>风险条</th></tr>
          </thead>
          <tbody>
            <tr v-for="f in detailFactorList" :key="f.name">
              <td>{{ f.name }}</td>
              <td style="font-weight: bold;">{{ f.val }}</td>
              <td>{{ f.max }}</td>
              <td>{{ f.pct }}%</td>
              <td>
                <div style="background: #e5e7eb; border-radius: 3px; height: 8px; width: 100px; overflow: hidden;">
                  <div :style="{ background: f.barColor, height: '100%', width: f.pct + '%' }"></div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <template v-if="detailData.relatedAlerts && detailData.relatedAlerts.length > 0">
          <h4 style="margin: 15px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 5px;">相关预警</h4>
          <div v-for="(a, i) in detailData.relatedAlerts" :key="i" class="cr-alert-item"
            :style="{ borderLeft: '3px solid ' + (sevColorMap[a.severity] || '#6b7280') }">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: bold;">{{ a.title }}</span>
              <span class="cr-alert-sev" :style="{ background: sevColorMap[a.severity] || '#6b7280' }">{{ a.severity }}</span>
            </div>
            <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">{{ a.description }}</div>
            <div style="color: #9ca3af; font-size: 11px; margin-top: 4px;">{{ a.status }} | {{ a.created_at }}</div>
          </div>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Loading, Refresh, WarningFilled, Lock, InfoFilled, CircleCheck, Bell,
  Document, Box, Clock, User, Check, Close
} from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import request from '../api/request';

const levelColorMap = { '极高': '#dc2626', '高': '#f97316', '中': '#eab308', '低': '#22c55e' };
const sevColorMap = { '紧急': '#dc2626', '高': '#f97316', '中': '#eab308', '低': '#22c55e' };
const typeLabelMap = {
  'expiring': '即将到期', 'expired': '已过期', 'stale_draft': '草稿停滞',
  'high_risk': '高风险', 'missing_info': '信息缺失'
};

const pageLoading = ref(true);
const loadError = ref('');
const activeTab = ref('riskList');

// KPI数据
const highCount = ref(0);
const midCount = ref(0);
const lowCount = ref(0);
const pendingAlerts = ref(0);
const totalContracts = ref(0);

// 风险列表
const riskLevelFilter = ref('all');
const riskList = ref([]);
const riskListLoading = ref(false);
const riskListError = ref('');

// 预警
const alertTypeFilter = ref('all');
const alertStatusFilter = ref('待处理');
const alertList = ref([]);
const alertsLoading = ref(false);
const alertsError = ref('');
const alertsLoaded = ref(false);

// 部门风险
const factorDataCache = ref(null);
const deptRiskList = ref([]);
const deptRiskLoading = ref(false);
const deptRiskError = ref('');
const deptRiskLoaded = ref(false);

// 图表ref
const distChartRef = ref(null);
const factorChartRef = ref(null);
const trendChartRef = ref(null);

let chartInstances = [];

function makeChart(el) {
  const chart = echarts.init(el);
  chartInstances.push(chart);
  return chart;
}

// ===== 加载概览 =====
async function loadOverview() {
  pageLoading.value = true;
  loadError.value = '';
  try {
    const [statsResp, distResp, trendResp, factorResp] = await Promise.all([
      request.get('/contract-risk/alerts/stats'),
      request.get('/contract-risk/risk-distribution'),
      request.get('/contract-risk/risk-trend'),
      request.get('/contract-risk/risk-factors')
    ]);

    const stats = (statsResp && statsResp.data) || {};
    const distData = (distResp && distResp.data) || {};
    const trendData = (trendResp && trendResp.data) || [];
    const factorData = (factorResp && factorResp.data) || [];

    const distArr = distData.distribution || [];
    highCount.value = (distArr.find(d => d.level === '高')?.count || 0) +
                      (distArr.find(d => d.level === '极高')?.count || 0);
    midCount.value = distArr.find(d => d.level === '中')?.count || 0;
    lowCount.value = distArr.find(d => d.level === '低')?.count || 0;
    pendingAlerts.value = stats.pendingAlerts || 0;
    totalContracts.value = distData.total || 0;
    factorDataCache.value = factorData;

    pageLoading.value = false;
    await nextTick();
    renderRiskCharts(distData, trendData);
    loadRiskList();
  } catch (e) {
    console.error('[ContractRisk] Error:', e);
    loadError.value = e.message || '未知错误';
    pageLoading.value = false;
  }
}

// ===== 渲染风险图表 =====
function renderRiskCharts(distData, trendData) {
  const distribution = (distData && distData.distribution) || [];
  const factors = (distData && distData.factors) || [];
  const trendArr = Array.isArray(trendData) ? trendData : [];
  const total = (distData && distData.total) || 0;

  // 1. 风险等级分布 (环形图)
  if (distChartRef.value) {
    makeChart(distChartRef.value).setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p) => `${p.name}: ${p.value}份 (${total > 0 ? Math.round(p.value / total * 100) : 0}%)`
      },
      legend: { bottom: 0, itemGap: 15, textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '44%'],
        data: distribution.map(d => ({
          name: d.level,
          value: d.count,
          itemStyle: { color: levelColorMap[d.level] || '#6b7280', borderColor: '#fff', borderWidth: 2 }
        })),
        label: { show: false }
      }]
    });
  }

  // 2. 风险因子分析 (雷达图)
  if (factorChartRef.value) {
    const maxVal = Math.max(20, ...factors.map(f => Math.max(f.avg || 0, f.max || 0)));
    makeChart(factorChartRef.value).setOption({
      tooltip: {},
      legend: { bottom: 0, itemGap: 10, textStyle: { fontSize: 11 } },
      radar: {
        indicator: factors.map(f => ({ name: f.name, max: maxVal })),
        radius: '62%',
        center: ['50%', '46%']
      },
      series: [{
        type: 'radar',
        data: [
          {
            name: '平均得分',
            value: factors.map(f => f.avg),
            areaStyle: { color: 'rgba(37, 99, 235, 0.2)' },
            lineStyle: { color: '#2563eb', width: 2 },
            itemStyle: { color: '#2563eb' },
            symbolSize: 6
          },
          {
            name: '最大分值',
            value: factors.map(f => f.max),
            areaStyle: { color: 'rgba(220, 38, 38, 0.1)' },
            lineStyle: { color: 'rgba(220, 38, 38, 0.3)', width: 1, type: 'dashed' },
            itemStyle: { color: 'rgba(220, 38, 38, 0.5)' },
            symbolSize: 5
          }
        ]
      }]
    });
  }

  // 3. 风险趋势 (折线图, 双Y轴)
  if (trendChartRef.value) {
    makeChart(trendChartRef.value).setOption({
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, itemGap: 10, textStyle: { fontSize: 11 } },
      grid: { left: 45, right: 50, top: 20, bottom: 50 },
      xAxis: { type: 'category', data: trendArr.map(t => t.month), axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: 'value', name: '合同数', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 10 } },
        { type: 'value', name: '平均分', max: 100, position: 'right', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 10 }, splitLine: { show: false } }
      ],
      series: [
        {
          name: '高风险', type: 'line', data: trendArr.map(t => t.high),
          smooth: 0.3, lineStyle: { color: '#dc2626' }, itemStyle: { color: '#dc2626' },
          areaStyle: { color: 'rgba(220,38,38,0.1)' }
        },
        {
          name: '中风险', type: 'line', data: trendArr.map(t => t.mid),
          smooth: 0.3, lineStyle: { color: '#eab308' }, itemStyle: { color: '#eab308' },
          areaStyle: { color: 'rgba(234,179,8,0.1)' }
        },
        {
          name: '低风险', type: 'line', data: trendArr.map(t => t.low),
          smooth: 0.3, lineStyle: { color: '#22c55e' }, itemStyle: { color: '#22c55e' },
          areaStyle: { color: 'rgba(34,197,94,0.1)' }
        },
        {
          name: '平均分', type: 'line', yAxisIndex: 1, data: trendArr.map(t => t.avgScore),
          smooth: 0.3, lineStyle: { color: '#2563eb', width: 2 }, itemStyle: { color: '#2563eb' }
        }
      ]
    });
  }
}

// ===== Tab切换 =====
function switchTab(cat) {
  activeTab.value = cat;
  if (cat === 'alerts' && !alertsLoaded.value) loadAlerts();
  if (cat === 'deptRisk' && !deptRiskLoaded.value) loadDeptRisk();
}

// ===== 加载风险合同列表 =====
async function loadRiskList() {
  riskListLoading.value = true;
  riskListError.value = '';
  try {
    const level = riskLevelFilter.value;
    const qs = level && level !== 'all' ? '?level=' + level : '';
    const resp = await request.get('/contract-risk/risk-scores' + qs);
    riskList.value = (resp.data && resp.data.list) || [];
  } catch (e) {
    riskListError.value = e.message;
  }
  riskListLoading.value = false;
}

// 主要风险因子
function mainFactors(item) {
  const factors = [];
  if (item.factor_amount >= 15) factors.push('金额');
  if (item.factor_status >= 15) factors.push('状态');
  if (item.factor_expiry >= 15) factors.push('到期');
  if (item.factor_missing >= 6) factors.push('缺失');
  if (item.factor_risk_remark >= 10) factors.push('风险备注');
  if (item.factor_duration >= 10) factors.push('期限');
  return factors;
}

// ===== 查看风险详情 =====
const detailVisible = ref(false);
const detailData = ref(null);
const detailContract = computed(() => (detailData.value && detailData.value.contract) || {});

const detailFactorList = computed(() => {
  const factors = (detailData.value && detailData.value.factors) || {};
  const list = [
    { name: '金额风险', val: factors.amount, max: 20 },
    { name: '期限风险', val: factors.duration, max: 15 },
    { name: '状态风险', val: factors.status, max: 20 },
    { name: '到期风险', val: factors.expiry, max: 20 },
    { name: '缺失字段', val: factors.missing, max: 10 },
    { name: '风险备注', val: factors.riskRemark, max: 10 },
    { name: '机密性', val: factors.confidential, max: 5 }
  ];
  return list.map(f => {
    const pct = f.max > 0 ? Math.round((f.val || 0) / f.max * 100) : 0;
    const barColor = pct >= 80 ? '#dc2626' : pct >= 50 ? '#f97316' : pct >= 25 ? '#eab308' : '#22c55e';
    return { ...f, val: f.val || 0, pct, barColor };
  });
});

async function viewRiskDetail(contractId) {
  try {
    const resp = await request.get('/contract-risk/risk-score/' + contractId);
    detailData.value = resp.data || {};
    detailVisible.value = true;
  } catch (e) {
    ElMessage.error('加载风险详情失败: ' + e.message);
  }
}

// ===== 加载预警列表 =====
async function loadAlerts() {
  alertsLoading.value = true;
  alertsError.value = '';
  try {
    const type = alertTypeFilter.value;
    const status = alertStatusFilter.value;
    const params = [];
    if (type) params.push('type=' + type);
    if (status) params.push('status=' + status);
    const qs = params.length > 0 ? '?' + params.join('&') : '';
    const resp = await request.get('/contract-risk/alerts' + qs);
    alertList.value = resp.data || [];
    alertsLoaded.value = true;
  } catch (e) {
    alertsError.value = e.message;
  }
  alertsLoading.value = false;
}

function alertStatusColor(status) {
  return status === '待处理' ? '#f59e0b' : status === '已处理' ? '#22c55e' : '#9ca3af';
}

// ===== 处理预警 =====
async function handleAlert(id, status) {
  let remark = '忽略该预警';
  if (status === '已处理') {
    try {
      const { value } = await ElMessageBox.prompt('请输入处理备注（可选）:', '处理预警', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: ''
      });
      remark = value || '';
    } catch {
      return;
    }
  }
  try {
    await request.put('/contract-risk/alerts/' + id + '/handle', { status, remark });
    ElMessage.success('预警已' + (status === '已处理' ? '处理' : '忽略'));
    loadAlerts();
    // 更新预警数量
    const stats = await request.get('/contract-risk/alerts/stats');
    if (stats && stats.data) pendingAlerts.value = stats.data.pendingAlerts || 0;
  } catch (e) {
    ElMessage.error('处理失败: ' + e.message);
  }
}

// ===== 加载部门风险分析 =====
async function loadDeptRisk() {
  deptRiskLoading.value = true;
  deptRiskError.value = '';
  try {
    let list = factorDataCache.value;
    if (!list) {
      const resp = await request.get('/contract-risk/risk-factors');
      list = resp.data || [];
    }
    deptRiskList.value = list || [];
    deptRiskLoaded.value = true;
  } catch (e) {
    deptRiskError.value = e.message;
  }
  deptRiskLoading.value = false;
}

function scoreColor(avgScore) {
  const s = avgScore || 0;
  return s >= 51 ? '#dc2626' : s >= 26 ? '#eab308' : '#22c55e';
}

// ===== 刷新风险评分 =====
async function refreshRiskScores() {
  try {
    await ElMessageBox.confirm('确定要刷新所有合同的风险评分吗？此操作将重新评估所有合同并重新生成预警。', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post('/contract-risk/refresh-scores');
  if (resp && resp.code === 200) {
    const d = resp.data || {};
    ElMessage.success(`评分刷新完成：评估${d.evaluated}份合同，生成${d.alerts}条预警`);
    // 重置懒加载状态并重新加载整个页面
    alertsLoaded.value = false;
    deptRiskLoaded.value = false;
    factorDataCache.value = null;
    loadOverview();
  } else if (resp && resp.code === 403) {
    ElMessage.error('权限不足，仅管理员可刷新评分');
  } else {
    ElMessage.error((resp && resp.msg) || '刷新失败');
  }
}

// ===== 生命周期 =====
const resizeHandler = () => chartInstances.forEach(c => c.resize());

onMounted(() => {
  loadOverview();
  window.addEventListener('resize', resizeHandler);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler);
  chartInstances.forEach(c => c.dispose());
  chartInstances = [];
});
</script>

<style scoped>
.contract-risk { padding: 20px; }

.cr-loading { padding: 30px; text-align: center; color: #909399; }

.cr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.cr-header h2 { font-size: 20px; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 8px; margin: 0; }

.cr-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.cr-kpi-card { display: flex; align-items: center; gap: 14px; padding: 20px; border-radius: 12px; background: #fff; border: 1px solid #e5e7eb; transition: box-shadow .2s; }
.cr-kpi-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); }
.cr-kpi-icon { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
.cr-kpi-body { flex: 1; }
.cr-kpi-value { font-size: 28px; font-weight: 700; line-height: 1; }
.cr-kpi-label { font-size: 13px; color: #6b7280; margin-top: 4px; }
.cr-kpi-high .cr-kpi-icon { background: #f97316; }
.cr-kpi-high .cr-kpi-value { color: #f97316; }
.cr-kpi-mid .cr-kpi-icon { background: #eab308; }
.cr-kpi-mid .cr-kpi-value { color: #eab308; }
.cr-kpi-low .cr-kpi-icon { background: #22c55e; }
.cr-kpi-low .cr-kpi-value { color: #22c55e; }
.cr-kpi-alert .cr-kpi-icon { background: #dc2626; }
.cr-kpi-alert .cr-kpi-value { color: #dc2626; }
.cr-kpi-total .cr-kpi-icon { background: #2563eb; }
.cr-kpi-total .cr-kpi-value { color: #2563eb; }

.cr-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
.cr-chart-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
.cr-chart-card h3 { font-size: 15px; font-weight: 600; color: #374151; margin: 0 0 16px; }
.cr-chart-box { height: 280px; }

.cr-tabs { display: flex; gap: 4px; border-bottom: 2px solid #e5e7eb; margin-bottom: 20px; }
.cr-tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 14px; color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; display: flex; align-items: center; gap: 6px; }
.cr-tab:hover { color: #2563eb; }
.cr-tab.active { color: #2563eb; border-bottom-color: #2563eb; font-weight: 600; }
.cr-badge { background: #dc2626; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.cr-tab.active .cr-badge { background: #2563eb; }

.cr-filter-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 12px 16px; background: #f9fafb; border-radius: 8px; }
.cr-select { padding: 6px 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; color: #374151; background: #fff; }

.cr-level-tag { display: inline-block; padding: 2px 10px; border-radius: 4px; color: #fff; font-size: 12px; font-weight: 600; }

.cr-alert-list { display: flex; flex-direction: column; gap: 12px; }
.cr-alert-item { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; transition: box-shadow .2s; margin-bottom: 12px; }
.cr-alert-item:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.cr-alert-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cr-alert-type { display: inline-block; padding: 2px 8px; background: #eff6ff; color: #2563eb; border-radius: 4px; font-size: 12px; font-weight: 600; }
.cr-alert-sev { display: inline-block; padding: 2px 8px; color: #fff; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 6px; }
.cr-alert-status { display: inline-block; padding: 2px 8px; color: #fff; border-radius: 4px; font-size: 11px; font-weight: 600; }
.cr-alert-desc { color: #4b5563; font-size: 13px; line-height: 1.5; margin-bottom: 8px; }
.cr-alert-meta { display: flex; gap: 16px; color: #9ca3af; font-size: 12px; flex-wrap: wrap; }
.cr-alert-meta span { display: inline-flex; align-items: center; gap: 4px; }
.cr-alert-actions { margin-top: 12px; display: flex; gap: 8px; }

.empty-state { text-align: center; padding: 40px; color: #9ca3af; }
.empty-state p { font-size: 14px; margin: 12px 0 0; }
.error-box { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 8px; padding: 16px; margin-top: 12px; }

/* 按钮 */
.btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 8px 16px; border-radius: 8px;
  font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;
  background: none;
}
.btn-xs { padding: 3px 10px; font-size: 12px; border-radius: 4px; }
.btn-outline { background: #fff; color: #475569; border-color: #e5e7eb; }
.btn-outline:hover { border-color: #2563eb; color: #2563eb; }
.btn-success { background: #22c55e; color: #fff; border-color: #22c55e; }
.btn-success:hover { background: #16a34a; }

/* 数据表 */
table.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
table.data-table th {
  text-align: left; padding: 10px 12px; background: #f1f5f9; color: #475569;
  font-weight: 600; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
}
table.data-table td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #1f2937; }
table.data-table tr:nth-child(even) td { background: #f8fafc; }
table.data-table tr:hover td { background: #eff6ff; }
table.data-table tr:last-child td { border-bottom: none; }

@media (max-width: 768px) {
  .cr-charts-grid { grid-template-columns: 1fr; }
}
</style>
