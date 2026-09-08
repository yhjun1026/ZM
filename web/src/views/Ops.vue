<template>
  <div class="ops">
    <div class="page-header">
      <h2>经营驾驶舱</h2>
      <p>销售额 / 回款 / 商机金额 / 合同额 一屏总览 → 销售漏斗 → 目标达成（sales_targets 对比实际）→ 客户价值分层 → 近 6/12 个月趋势</p>
    </div>

    <div class="kpi-grid" v-if="ov">
      <div class="kpi-card" v-for="k in kpis" :key="k.title">
        <div class="kpi-icon" :style="{ background: k.color + '20' }">
          <el-icon :size="18" :color="k.color"><component :is="k.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-title">{{ k.title }}</div>
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </div>
      </div>
    </div>

    <!-- 经营解读 -->
    <div class="insights" v-if="ov && ov.insights && ov.insights.length">
      <div v-for="(it, i) in ov.insights" :key="i" class="insight" :class="it.tone">
        <el-icon><component :is="toneIcon(it.tone)" /></el-icon><span>{{ it.text }}</span>
      </div>
    </div>

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <!-- ============ 总览 ============ -->
      <el-tab-pane label="销售漏斗" name="funnel">
        <div class="tab-toolbar">
          <div class="muted">按商机阶段统计金额（万元）与数量；在途 = 未赢单 / 未输单 / 未验收归档</div>
          <el-button size="small" @click="loadOverview">刷新</el-button>
        </div>
        <div class="chart-box" v-if="funnelRows.length">
          <div v-for="f in funnelRows" :key="f.stage" class="bar-row">
            <div class="bar-label">{{ f.stage }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: barPct(f.amount) + '%', background: barColor(f.stage) }"></div>
            </div>
            <div class="bar-value">{{ f.amount }} 万 / {{ f.count }} 个</div>
          </div>
        </div>
        <div v-else class="muted empty">暂无商机数据，无法绘制漏斗</div>

        <div class="section-title">近 {{ trendMonths }} 个月趋势（万元）</div>
        <div class="tab-toolbar">
          <el-radio-group v-model="trendMonths" size="small" @change="loadTrends">
            <el-radio-button :label="6">近 6 个月</el-radio-button>
            <el-radio-button :label="12">近 12 个月</el-radio-button>
          </el-radio-group>
          <div class="legend">
            <span><i class="dot" style="background:#2563eb"></i>签约</span>
            <span><i class="dot" style="background:#10b981"></i>回款</span>
            <span><i class="dot" style="background:#f59e0b"></i>新增商机</span>
          </div>
        </div>
        <div class="chart-box" v-if="trend.labels && trend.labels.length">
          <div v-for="(l, i) in trend.labels" :key="l" class="trend-col">
            <div class="trend-bars">
              <div class="tb" :style="{ height: colPct(trend.sign[i]) + '%' }" :title="`签约 ${trend.sign[i]} 万`" style="background:#2563eb"></div>
              <div class="tb" :style="{ height: colPct(trend.pay[i]) + '%' }" :title="`回款 ${trend.pay[i]} 万`" style="background:#10b981"></div>
              <div class="tb" :style="{ height: colPct(trend.opp[i]) + '%' }" :title="`新增商机 ${trend.opp[i]} 万`" style="background:#f59e0b"></div>
            </div>
            <div class="trend-label">{{ l }}</div>
          </div>
        </div>
        <div v-else class="muted empty">暂无趋势数据</div>
      </el-tab-pane>

      <!-- ============ 目标达成 ============ -->
      <el-tab-pane label="目标达成" name="targets">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input-number v-model="tgYear" :min="2000" :max="2100" size="small" style="width:120px" @change="loadTargets" />
            <el-input-number v-model="tgMonth" :min="1" :max="12" size="small" style="width:110px" @change="loadTargets" />
            <el-select v-model="tgType" size="small" style="width:110px" @change="loadYearly">
              <el-option label="签约" value="签约" />
              <el-option label="回款" value="回款" />
            </el-select>
          </div>
          <el-button type="primary" size="small" @click="openTarget">
            <el-icon style="margin-right:4px"><Plus /></el-icon>设置目标
          </el-button>
        </div>

        <div class="target-summary" v-if="yearly">
          <div class="ts-item">
            <div class="muted">年度目标（{{ tgType }}）</div>
            <b>{{ yearly.annual.targetTotal }} 万</b>
          </div>
          <div class="ts-item">
            <div class="muted">年度实际</div>
            <b>{{ yearly.annual.actualTotal }} 万</b>
          </div>
          <div class="ts-item">
            <div class="muted">年度完成率</div>
            <b :class="yearly.annual.rate >= 100 ? 'good' : (yearly.annual.rate >= 60 ? 'warn' : 'bad')">{{ yearly.annual.rate }}%</b>
          </div>
        </div>

        <div class="section-title">12 个月目标 vs 实际（万元）</div>
        <div class="chart-box" v-if="yearly">
          <div v-for="m in yearly.months" :key="m.month" class="trend-col">
            <div class="trend-bars">
              <div class="tb" :style="{ height: colPct(m.target) + '%' }" :title="`目标 ${m.target} 万`" style="background:#cbd5e1"></div>
              <div class="tb" :style="{ height: colPct(m.actual) + '%' }" :title="`实际 ${m.actual} 万`" style="background:#2563eb"></div>
            </div>
            <div class="trend-label">{{ m.month }}月</div>
            <div class="trend-rate" :class="m.rate >= 100 ? 'good' : (m.rate >= 60 ? 'warn' : 'bad')">{{ m.rate }}%</div>
          </div>
        </div>

        <div class="section-title">目标明细（{{ tgYear }}-{{ String(tgMonth).padStart(2, '0') }}）</div>
        <el-table :data="targetRows" stripe size="small" v-loading="tgLoading">
          <el-table-column prop="year" label="年份" width="80" />
          <el-table-column prop="month" label="月份" width="70" />
          <el-table-column label="层级" width="100">
            <template #default="{ row }">{{ row.emp_id ? '个人' : (row.region ? '区域' : '公司') }}</template>
          </el-table-column>
          <el-table-column prop="region" label="区域/员工" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.region || row.emp_name || '公司' }}</template>
          </el-table-column>
          <el-table-column prop="target_type" label="类型" width="80" />
          <el-table-column label="目标(万)" width="100" align="right"><template #default="{ row }">{{ row.amount }}</template></el-table-column>
          <el-table-column label="实际(万)" width="100" align="right"><template #default="{ row }">{{ row.actual }}</template></el-table-column>
          <el-table-column label="完成率" min-width="160">
            <template #default="{ row }">
              <el-progress :percentage="Math.min(row.rate, 100)" :status="row.rate >= 100 ? 'success' : (row.rate >= 60 ? '' : 'exception')" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="danger" @click="removeTarget(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">该月暂无销售目标，点击右上角「设置目标」</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 客户价值 ============ -->
      <el-tab-pane label="客户价值" name="customers">
        <div class="tab-toolbar">
          <div class="muted">按累计合同额分层：战略 ≥300 万 / 重点 ≥100 万 / 成长 ≥30 万 / 一般 &gt;0 / 潜在 0</div>
          <el-button size="small" @click="loadCustomers">刷新</el-button>
        </div>
        <div class="tier-grid" v-if="cust && cust.tiers">
          <div class="tier-card" v-for="t in cust.tiers" :key="t.tier">
            <div class="tier-dot" :style="{ background: t.color }"></div>
            <div>
              <div class="muted">{{ t.tier }}</div>
              <b>{{ t.count }} 家 / {{ t.amount }} 万</b>
            </div>
          </div>
        </div>
        <div class="section-title">客户贡献 Top10</div>
        <el-table :data="cust.top || []" stripe size="small">
          <el-table-column prop="name" label="客户名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="level" label="客户等级" width="110" />
          <el-table-column prop="owner" label="负责人" width="100" />
          <el-table-column label="累计合同额(万)" width="140" align="right">
            <template #default="{ row }"><b>{{ row.contract_amt }}</b></template>
          </el-table-column>
          <el-table-column label="在途商机(万)" width="130" align="right">
            <template #default="{ row }">{{ row.opp_amt }}</template>
          </el-table-column>
          <el-table-column label="分层" width="110">
            <template #default="{ row }">
              <el-tag size="small" :style="{ background: row.color + '20', color: row.color, borderColor: row.color + '40' }">{{ row.tier }}</el-tag>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无客户数据</span></template>
        </el-table>
        <div class="section-title">沉睡预警（无合同且无在途商机）</div>
        <el-table :data="cust.sleeping || []" stripe size="small">
          <el-table-column prop="name" label="客户名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="level" label="等级" width="110" />
          <el-table-column prop="owner" label="负责人" width="110" />
          <el-table-column label="预警" width="120">
            <template #default><el-tag size="small" type="warning">需激活</el-tag></template>
          </el-table-column>
          <template #empty><span class="muted">暂无沉睡客户</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 区域 ============ -->
      <el-tab-pane label="区域对比" name="regions">
        <el-table :data="regionRows" stripe size="small">
          <el-table-column prop="region" label="销售区域" min-width="140" />
          <el-table-column prop="city" label="城市" width="100" />
          <el-table-column prop="manager_name" label="区域负责人" width="120" />
          <el-table-column label="在编人数" width="100" align="right"><template #default="{ row }">{{ row.staff_count }}</template></el-table-column>
          <el-table-column label="商机数" width="100" align="right"><template #default="{ row }">{{ row.opp_count }}</template></el-table-column>
          <el-table-column label="在途商机(万)" width="140" align="right">
            <template #default="{ row }"><b>{{ row.opp_amount }}</b></template>
          </el-table-column>
          <el-table-column label="占比" min-width="180">
            <template #default="{ row }">
              <el-progress :percentage="regionPct(row.opp_amount)" :stroke-width="10" />
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无销售区域数据</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 设置目标 -->
    <el-dialog v-model="tgDlg.visible" title="设置销售目标" width="480px">
      <el-form label-width="100px" size="small">
        <el-form-item label="层级" required>
          <el-select v-model="tgDlg.form.level" style="width:100%">
            <el-option label="公司" value="公司" />
            <el-option label="区域" value="区域" />
            <el-option label="个人" value="个人" />
          </el-select>
        </el-form-item>
        <el-form-item label="年份" required><el-input-number v-model="tgDlg.form.year" :min="2000" :max="2100" style="width:100%" /></el-form-item>
        <el-form-item label="月份" required><el-input-number v-model="tgDlg.form.month" :min="1" :max="12" style="width:100%" /></el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="tgDlg.form.target_type" style="width:100%">
            <el-option label="签约" value="签约" />
            <el-option label="回款" value="回款" />
          </el-select>
        </el-form-item>
        <el-form-item label="区域" v-if="tgDlg.form.level === '区域'">
          <el-select v-model="tgDlg.form.region" filterable style="width:100%">
            <el-option v-for="r in regionRows" :key="r.id" :label="r.region" :value="r.region" />
          </el-select>
        </el-form-item>
        <el-form-item label="员工" v-if="tgDlg.form.level === '个人'">
          <el-select v-model="tgDlg.form.emp_id" filterable style="width:100%">
            <el-option v-for="e in emps" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标(万元)" required>
          <el-input-number v-model="tgDlg.form.amount" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tgDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="tgDlg.saving" @click="submitTarget">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { TrendCharts, Money, ShoppingCart, Tickets, InfoFilled, CircleCheck, WarningFilled, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('funnel');
const ov = ref(null);
const trend = ref({ labels: [], sign: [], pay: [], opp: [] });
const trendMonths = ref(6);
const yearly = ref(null);
const targetRows = ref([]);
const tgLoading = ref(false);
const cust = ref(null);
const emps = ref([]);
const now = new Date();
const tgYear = ref(now.getFullYear());
const tgMonth = ref(now.getMonth() + 1);
const tgType = ref('签约');

const kpis = computed(() => {
  const k = ov.value && ov.value.kpi;
  if (!k) return [];
  const rate = (r) => (r === null || r === undefined ? '—' : (r >= 0 ? '+' : '') + r + '%');
  return [
    { title: '销售额(万)', value: k.sales.value, sub: `环比 ${rate(k.sales.rate)}`, icon: Money, color: '#2563eb' },
    { title: '回款额(万)', value: k.collection.value, sub: `环比 ${rate(k.collection.rate)}`, icon: ShoppingCart, color: '#10b981' },
    { title: '在途商机(万)', value: k.opp_amount.value, sub: `商机 ${k.opp_amount.count} 个`, icon: TrendCharts, color: '#f59e0b' },
    { title: '合同额(万)', value: k.contract.value, sub: `合同 ${k.contract.count} 份`, icon: Tickets, color: '#8b5cf6' },
  ];
});
const funnelRows = computed(() => (ov.value && ov.value.funnel) || []);
const regionRows = computed(() => (ov.value && ov.value.regions) || []);

function toneIcon(t) {
  if (t === 'good') return CircleCheck;
  if (t === 'warn') return WarningFilled;
  return InfoFilled;
}
/** 条形图百分比（相对最大值） */
function maxOf(list) { return Math.max(1, ...list.map((x) => Number(x) || 0)); }
function barPct(v) { return Math.round(((Number(v) || 0) / maxOf(funnelRows.value.map((f) => f.amount))) * 100); }
function colPct(v) {
  const all = [...(trend.value.sign || []), ...(trend.value.pay || []), ...(trend.value.opp || []),
    ...((yearly.value && yearly.value.months ? yearly.value.months.map((m) => Math.max(m.target, m.actual)) : []))];
  return Math.round(((Number(v) || 0) / maxOf(all)) * 100);
}
function barColor(stage) {
  const map = { 商机录入: '#94a3b8', 终端报备: '#64748b', 项目立项: '#0ea5e9', 价格审批: '#2563eb', 投标管理: '#6366f1', 合同评审: '#8b5cf6', 验收归档: '#10b981', 赢单: '#059669', 输单: '#ef4444' };
  return map[stage] || '#2563eb';
}
function regionPct(v) {
  const total = regionRows.value.reduce((s, r) => s + (Number(r.opp_amount) || 0), 0);
  return total > 0 ? Math.round(((Number(v) || 0) / total) * 100) : 0;
}

async function loadOverview() {
  const r = await request.get('/ops/overview');
  if (r.code === 200) ov.value = r.data;
}
async function loadTrends() {
  const r = await request.get('/ops/trends', { params: { months: trendMonths.value } });
  if (r.code === 200) trend.value = r.data || { labels: [], sign: [], pay: [], opp: [] };
}
async function loadTargets() {
  tgLoading.value = true;
  try {
    const r = await request.get('/ops/targets', { params: { year: tgYear.value, month: tgMonth.value } });
    targetRows.value = r.code === 200 ? (r.data.rows || []) : [];
  } finally { tgLoading.value = false; }
}
async function loadYearly() {
  const r = await request.get('/ops/targets/yearly', { params: { year: tgYear.value, target_type: tgType.value } });
  if (r.code === 200) yearly.value = r.data;
}
async function loadCustomers() {
  const r = await request.get('/ops/customers', { params: { days: 90 } });
  if (r.code === 200) cust.value = r.data;
}
function onTabChange(name) {
  if (name === 'targets') { loadTargets(); loadYearly(); }
  if (name === 'customers') loadCustomers();
}
onMounted(async () => {
  const e = await request.get('/org/employees');
  if (e.code === 200) emps.value = e.data || [];
  await loadOverview();
  await loadTrends();
});

/* ---------- 目标 ---------- */
const tgDlg = reactive({
  visible: false, saving: false,
  form: { level: '公司', year: now.getFullYear(), month: now.getMonth() + 1, target_type: '签约', region: '', emp_id: null, amount: 0 },
});
function openTarget() {
  Object.assign(tgDlg.form, {
    level: '公司', year: tgYear.value, month: tgMonth.value, target_type: tgType.value,
    region: '', emp_id: null, amount: 0,
  });
  tgDlg.visible = true;
}
async function submitTarget() {
  const f = tgDlg.form;
  if (!f.year || !f.month || !(Number(f.amount) >= 0)) { ElMessage.warning('年份、月份与目标金额必填'); return; }
  if (f.level === '区域' && !f.region) { ElMessage.warning('区域级目标必须选择区域'); return; }
  if (f.level === '个人' && !f.emp_id) { ElMessage.warning('个人级目标必须选择员工'); return; }
  tgDlg.saving = true;
  const r = await request.post('/ops/targets', f);
  tgDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '目标已设置'); tgDlg.visible = false; loadTargets(); loadYearly(); }
  else ElMessage.error(r.msg || '设置失败');
}
async function removeTarget(row) {
  try { await ElMessageBox.confirm('确认删除该目标？', '删除目标', { type: 'warning' }); } catch (e) { return; }
  const r = await request.delete(`/ops/targets/${row.id}`);
  if (r.code === 200) { ElMessage.success(r.msg || '已删除'); loadTargets(); loadYearly(); }
  else ElMessage.error(r.msg || '删除失败');
}
</script>

<style scoped>
.ops { padding: 20px; }
.muted { color: #909399; }
.empty { padding: 12px 0; }
.good { color: #10b981; }
.warn { color: #f59e0b; }
.bad { color: #ef4444; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.insights { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.insight { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; padding: 8px 12px; border-radius: 8px; background: #f7f8fa; }
.insight.good { background: #ecfdf5; color: #047857; }
.insight.warn { background: #fffbeb; color: #b45309; }
.insight.info { background: #eff6ff; color: #1d4ed8; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.section-title { margin: 18px 0 8px; font-size: 14px; font-weight: 600; }
.chart-box { border: 1px solid var(--el-border-color-light); border-radius: 10px; padding: 14px; }
.bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.bar-label { width: 90px; font-size: 12px; color: #606266; }
.bar-track { flex: 1; height: 16px; background: #f1f5f9; border-radius: 8px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 8px; transition: width .3s; }
.bar-value { width: 140px; text-align: right; font-size: 12px; }
.trend-col { display: inline-flex; flex-direction: column; align-items: center; width: calc(100% / 12); min-width: 46px; vertical-align: bottom; }
.trend-bars { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
.tb { width: 10px; min-height: 2px; border-radius: 3px 3px 0 0; }
.trend-label { font-size: 11px; color: #909399; margin-top: 4px; }
.trend-rate { font-size: 11px; }
.legend { display: flex; gap: 12px; font-size: 12px; color: #606266; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.target-summary { display: flex; gap: 24px; padding: 12px 16px; border: 1px solid var(--el-border-color-light); border-radius: 10px; margin-bottom: 8px; }
.ts-item b { font-size: 18px; }
.tier-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.tier-card { display: flex; align-items: center; gap: 10px; border: 1px solid var(--el-border-color-light); border-radius: 10px; padding: 12px; }
.tier-dot { width: 10px; height: 32px; border-radius: 5px; }
.el-form-item { margin-bottom: 12px; }
</style>
