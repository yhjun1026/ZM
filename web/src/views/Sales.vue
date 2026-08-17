<template>
  <div>
    <div class="page-header"><h2>销售统计</h2><p>销售业绩概览与明细录入</p></div>

    <div v-loading="loading">
      <!-- 概览卡 -->
      <div class="stats-grid">
        <div v-for="k in kpis" :key="k.label" class="stat-card">
          <div class="stat-bar" :style="{ background: k.color }"></div>
          <div class="stat-body">
            <div>
              <p class="stat-label">{{ k.label }}</p>
              <p class="stat-value" :style="{ color: k.color }">{{ k.value }}</p>
            </div>
            <div class="stat-icon" :style="{ background: k.color + '15' }">
              <el-icon :size="22" :color="k.color"><component :is="k.icon" /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- 月度趋势图 -->
      <el-card style="margin-bottom: 16px;">
        <template #header><h3 class="card-title">月度销售趋势</h3></template>
        <div ref="trendChart" style="height: 300px;"></div>
      </el-card>

      <!-- 销售记录 -->
      <el-card>
        <template #header>
          <div class="card-header">
            <h3>销售记录</h3>
            <div style="display: flex; gap: 8px;">
              <el-button v-if="canCreateSale" type="primary" size="small" @click="openSaleForm">录入数据</el-button>
              <el-button type="info" size="small" @click="printSalesReport"><el-icon><Printer /></el-icon> 打印报表</el-button>
            </div>
          </div>
        </template>
        <el-table :data="records" size="small" stripe>
          <el-table-column prop="id" label="编号" width="100" />
          <el-table-column prop="date" label="日期" width="105" />
          <el-table-column prop="salesperson" label="销售员" width="90" />
          <el-table-column prop="customer" label="客户" min-width="130" show-overflow-tooltip />
          <el-table-column prop="product" label="产品" min-width="110" show-overflow-tooltip />
          <el-table-column label="金额(¥)" width="120">
            <template #default="{ row }">¥{{ fmt(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="region" label="区域" width="90" />
          <el-table-column label="状态" width="85">
            <template #default="{ row }">
              <el-tag :type="row.status === '已确认' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无记录</span></template>
        </el-table>
      </el-card>
    </div>

    <!-- 录入销售数据 -->
    <el-dialog v-model="saleDlg.visible" title="录入销售数据" width="500px">
      <el-form label-position="top">
        <el-form-item label="日期">
          <el-date-picker v-model="saleDlg.form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="销售员">
          <el-input v-model="saleDlg.form.salesperson" />
        </el-form-item>
        <el-form-item label="客户">
          <el-input v-model="saleDlg.form.customer" />
        </el-form-item>
        <el-form-item label="产品">
          <el-input v-model="saleDlg.form.product" />
        </el-form-item>
        <el-form-item label="金额(¥)">
          <el-input-number v-model="saleDlg.form.amount" :min="0" :controls="false" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="saleDlg.form.region" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saleDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="saleDlg.saving" @click="submitSale">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import { ElMessage } from 'element-plus';
import { Printer, Coin, ShoppingCart, Odometer, Aim } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const records = ref([]);
const overview = ref({});
const monthly = ref([]);
const trendChart = ref(null);
let chartInst = null;

// createSale 权限（对齐参考项目 rbac.js）：
// 超管/总经理/销售总监/区域经理/人事专员/部门经理（市场部、技术部除外）可录入；副总/普通员工不可
const canCreateSale = computed(() => {
  const u = auth.user;
  if (!u) return false;
  if (u.role === '超级管理员' || u.role === '总经理') return true;
  if (u.role === '副总' || u.role === '普通员工') return false;
  if (u.role === '部门经理' && ['市场部', '技术部'].includes(u.dept)) return false;
  return true;
});

const kpis = computed(() => [
  { label: '总收入(¥)', value: fmt(overview.value.totalRevenue), icon: Coin, color: '#10b981' },
  { label: '成交数', value: overview.value.deals || 0, icon: ShoppingCart, color: '#2563eb' },
  { label: '客单价(¥)', value: fmt(overview.value.avgDeal), icon: Odometer, color: '#f59e0b' },
  { label: '目标完成率', value: (overview.value.rate || 0) + '%', icon: Aim, color: '#8b5cf6' },
]);

function fmt(n) { return Number(n || 0).toLocaleString(); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderChart() {
  if (!trendChart.value) return;
  if (!chartInst) chartInst = echarts.init(trendChart.value);
  const labels = monthly.value.map(m => m.month);
  const vals = monthly.value.map(m => m.revenue);
  chartInst.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0];
        const m = monthly.value[p.dataIndex];
        return `${p.name}<br/>收入：${fmt(p.value)}万元<br/>成交${m ? m.deals : 0}笔`;
      },
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#dcdfe6' } } },
    yAxis: { type: 'value', name: '万元', splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } } },
    series: [{ type: 'bar', data: vals, barMaxWidth: 36, itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] } }],
  });
}
function rz() { chartInst && chartInst.resize(); }

async function load() {
  loading.value = true;
  try {
    const [recordsResp, overviewResp, monthlyResp] = await Promise.all([
      request.get('/sales/records'),
      request.get('/sales/overview'),
      request.get('/sales/monthly'),
    ]);
    if (recordsResp.code !== 200) { ElMessage.error('加载失败'); return; }
    records.value = recordsResp.data || [];
    overview.value = overviewResp.code === 200 ? (overviewResp.data || {}) : {};
    monthly.value = monthlyResp.code === 200 ? (monthlyResp.data || []) : [];
    renderChart();
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  load();
  window.addEventListener('resize', rz);
});
onUnmounted(() => {
  window.removeEventListener('resize', rz);
  chartInst && chartInst.dispose();
  chartInst = null;
});

// ===== 录入销售数据 =====
const saleDlg = reactive({ visible: false, saving: false, form: {} });
function openSaleForm() {
  if (!canCreateSale.value) { ElMessage.warning('无权录入销售数据'); return; }
  saleDlg.form = {
    date: new Date().toISOString().slice(0, 10),
    salesperson: auth.user?.name || '',
    customer: '', product: '', amount: undefined, region: '',
  };
  saleDlg.visible = true;
}
async function submitSale() {
  const f = saleDlg.form;
  if (!f.customer || !f.amount) { ElMessage.warning('请填写完整'); return; }
  saleDlg.saving = true;
  try {
    const resp = await request.post('/sales/records', {
      date: f.date, salesperson: f.salesperson, customer: f.customer,
      product: f.product, amount: f.amount, region: f.region,
    });
    if (resp.code === 200) {
      ElMessage.success('录入成功');
      saleDlg.visible = false;
      load();
    } else ElMessage.error(resp.msg || '录入失败');
  } finally {
    saleDlg.saving = false;
  }
}

// ===== 打印报表 =====
function printSalesReport() {
  const rows = records.value;
  const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const confirmedCount = rows.filter(r => r.status === '已确认').length;
  const pendingCount = rows.filter(r => r.status === '待确认').length;
  const regionStats = {};
  rows.forEach(r => {
    if (!regionStats[r.region]) regionStats[r.region] = { count: 0, amount: 0 };
    regionStats[r.region].count++;
    regionStats[r.region].amount += (r.amount || 0);
  });
  const style = `body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:900px;margin:0 auto;}h2{text-align:center;margin-bottom:8px;border-bottom:2px solid #2563eb;padding-bottom:12px;}.subtitle{text-align:center;color:#666;font-size:14px;margin-bottom:24px;}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;}.summary-card{border:1px solid #ddd;border-radius:8px;padding:16px;text-align:center;}.summary-card .label{font-size:13px;color:#666;margin-bottom:4px;}.summary-card .value{font-size:22px;font-weight:bold;color:#2563eb;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}th,td{border:1px solid #ddd;padding:6px 10px;text-align:center;font-size:13px;}th{background:#f5f5f5;font-weight:bold;}tr:nth-child(even){background:#fafafa;}h3{font-size:16px;margin:24px 0 10px;border-left:4px solid #2563eb;padding-left:8px;}.footer{margin-top:40px;text-align:center;color:#999;font-size:12px;}`;
  const detailRows = rows.length
    ? rows.map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.date)}</td><td>${esc(r.salesperson)}</td><td>${esc(r.customer)}</td><td>${esc(r.product)}</td><td>¥${fmt(r.amount)}</td><td>${esc(r.region)}</td><td>${esc(r.status)}</td></tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:#999;">暂无数据</td></tr>';
  const detailFoot = rows.length
    ? `<tfoot><tr style="font-weight:bold;background:#e5e7eb;"><td colspan="5">合计</td><td>¥${totalAmount.toLocaleString()}</td><td colspan="2"></td></tr></tfoot>` : '';
  const regionRows = Object.keys(regionStats).length
    ? Object.entries(regionStats).map(([region, d]) => `<tr><td>${esc(region)}</td><td>${d.count}</td><td>¥${d.amount.toLocaleString()}</td><td>${totalAmount > 0 ? (d.amount / totalAmount * 100).toFixed(1) : 0}%</td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:#999;">暂无数据</td></tr>';
  const body = `<h2>销售订单管理报表</h2><div class="subtitle">四川卓盟科技有限公司</div><div class="summary-grid"><div class="summary-card"><div class="label">总成交额</div><div class="value">¥${totalAmount.toLocaleString()}</div></div><div class="summary-card"><div class="label">成交笔数</div><div class="value">${rows.length}</div></div><div class="summary-card"><div class="label">已确认</div><div class="value">${confirmedCount}</div></div><div class="summary-card"><div class="label">待确认</div><div class="value">${pendingCount}</div></div></div><h3>销售明细</h3><table><thead><tr><th>编号</th><th>日期</th><th>销售员</th><th>客户</th><th>产品</th><th>金额(¥)</th><th>区域</th><th>状态</th></tr></thead><tbody>${detailRows}</tbody>${detailFoot}</table><h3>区域统计</h3><table><thead><tr><th>区域</th><th>成交笔数</th><th>成交金额(¥)</th><th>占比</th></tr></thead><tbody>${regionRows}</tbody></table><div class="footer">打印时间：${new Date().toLocaleString('zh-CN')}</div>`;
  const w = window.open('', '_blank');
  if (!w) { ElMessage.error('请允许弹出窗口以打印'); return; }
  w.document.write(`<html><head><title>销售订单管理报表</title><style>${style}</style></head><body>${body}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  position: relative;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.stat-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}
.stat-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-label {
  font-size: 12px;
  margin: 0 0 6px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #909399;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-header h3 {
  margin: 0;
  font-size: 15px;
}
.card-title {
  margin: 0;
  font-size: 15px;
}
.text-muted {
  color: #909399;
}
</style>
