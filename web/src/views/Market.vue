<template>
  <div class="market">
    <div class="page-header">
      <h2>市场活动</h2>
      <p>活动申请（审批中） → 审批通过 → 活动推进 → 复盘登记（实际费用/线索/成交） + 市场费用台账与统计</p>
    </div>

    <div class="kpi-grid" v-if="stats">
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

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <!-- ============ 活动台账 ============ -->
      <el-tab-pane label="活动台账" name="acts">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="filter.type" placeholder="全部类型" style="width:130px" clearable @change="loadList">
              <el-option v-for="t in meta.types" :key="t" :label="t" :value="t" />
            </el-select>
            <el-select v-model="filter.status" placeholder="全部状态" style="width:120px" clearable @change="loadList">
              <el-option v-for="s in meta.status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="filter.keyword" placeholder="搜索活动名称/编号" style="width:220px" clearable @change="loadList" />
          </div>
          <el-button type="primary" @click="openCreate">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增活动
          </el-button>
        </div>
        <el-table :data="rows" stripe size="small" v-loading="loading">
          <el-table-column prop="act_no" label="活动编号" width="150" />
          <el-table-column prop="name" label="活动名称" min-width="170" show-overflow-tooltip />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="region" label="大区" width="90" />
          <el-table-column prop="start_date" label="开始" width="110" />
          <el-table-column prop="end_date" label="结束" width="110" />
          <el-table-column label="预算(万)" width="100" align="right">
            <template #default="{ row }">{{ row.budget }}</template>
          </el-table-column>
          <el-table-column label="实际(万)" width="100" align="right">
            <template #default="{ row }">{{ row.actual_cost === null || row.actual_cost === undefined ? '—' : row.actual_cost }}</template>
          </el-table-column>
          <el-table-column label="线索" width="70" align="right">
            <template #default="{ row }">{{ row.leads || 0 }}</template>
          </el-table-column>
          <el-table-column prop="owner_name" label="发起人" width="90" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '审批中'" size="small" type="success" @click="dealAct(row, '通过')">通过</el-button>
              <el-button v-if="row.status === '审批中'" size="small" type="danger" @click="dealAct(row, '驳回')">驳回</el-button>
              <el-button v-if="row.status === '通过'" size="small" @click="dealAct(row, '进行中')">推进</el-button>
              <el-button v-if="['通过', '进行中', '已结束'].includes(row.status)" size="small" type="primary" @click="openFinish(row)">复盘</el-button>
              <el-button size="small" @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无市场活动，点击右上角「新增活动」创建</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 市场费用 ============ -->
      <el-tab-pane label="市场费用" name="fees">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="feeFilter.category" placeholder="全部类别" style="width:130px" clearable @change="loadFees">
              <el-option v-for="c in meta.fee_categories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select v-model="feeFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadFees">
              <el-option v-for="s in feeStatusList" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="feeFilter.fee_period" placeholder="所属期间，如 2026-Q1" style="width:180px" clearable @change="loadFees" />
          </div>
          <el-button type="primary" @click="openFee">
            <el-icon style="margin-right:4px"><Plus /></el-icon>登记费用
          </el-button>
        </div>

        <div class="fee-summary" v-if="feeStats">
          <span class="muted">费用总额</span>
          <b>{{ feeStats.total }} 万</b>
          <span class="muted">（{{ feeStats.count }} 笔）</span>
          <span v-for="c in feeStats.by_category" :key="c.category" class="fee-chip">
            {{ c.category }} {{ c.amount }} 万
          </span>
        </div>

        <el-table :data="feeRows" stripe size="small" v-loading="feeLoading">
          <el-table-column prop="fee_no" label="费用单号" width="170" />
          <el-table-column prop="title" label="费用事项" min-width="180" show-overflow-tooltip />
          <el-table-column prop="category" label="类别" width="100" />
          <el-table-column prop="fee_period" label="所属期间" width="110" />
          <el-table-column label="金额(万)" width="100" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <el-table-column prop="region" label="大区" width="90" />
          <el-table-column prop="owner_name" label="登记人" width="90" />
          <el-table-column prop="purpose" label="用途" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === '审批中'">
                <el-button size="small" type="success" @click="dealFee(row, '通过')">通过</el-button>
                <el-button size="small" type="danger" @click="dealFee(row, '驳回')">驳回</el-button>
              </template>
              <span v-else class="muted">已处理</span>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无市场费用，点击右上角「登记费用」新增</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增活动 -->
    <el-dialog v-model="createDlg.visible" :title="createDlg.editing ? '编辑活动' : '新增市场活动'" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="活动名称" required>
          <el-input v-model="createDlg.form.name" placeholder="如：华西区域学术推广会" />
        </el-form-item>
        <el-form-item label="活动类型" required>
          <el-select v-model="createDlg.form.type" style="width:100%">
            <el-option v-for="t in meta.types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="覆盖大区">
          <el-input v-model="createDlg.form.region" placeholder="默认：全国" />
        </el-form-item>
        <el-form-item label="开始日期" required>
          <el-date-picker v-model="createDlg.form.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker v-model="createDlg.form.end_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="预算(万)" required>
          <el-input-number v-model="createDlg.form.budget" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="目标/预期">
          <el-input v-model="createDlg.form.target" placeholder="目标客户群 / 预期人次" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <!-- 活动复盘 -->
    <el-dialog v-model="finishDlg.visible" :title="'活动复盘 · ' + finishDlg.name" width="520px">
      <el-form label-width="120px" size="small">
        <el-form-item label="实际费用(万)">
          <el-input-number v-model="finishDlg.form.actual_cost" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="产出线索数">
          <el-input-number v-model="finishDlg.form.leads" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="关联成交(万)">
          <el-input-number v-model="finishDlg.form.deal_amount" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="复盘总结">
          <el-input v-model="finishDlg.form.summary" type="textarea" :rows="3" placeholder="活动效果、经验与改进" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="finishDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="finishDlg.saving" @click="submitFinish">登记复盘</el-button>
      </template>
    </el-dialog>

    <!-- 市场费用登记 -->
    <el-dialog v-model="feeDlg.visible" title="市场费用登记" width="540px">
      <el-form label-width="110px" size="small">
        <el-form-item label="费用事项" required>
          <el-input v-model="feeDlg.form.title" placeholder="如：华西区域学术推广会议费用" />
        </el-form-item>
        <el-form-item label="费用类别" required>
          <el-select v-model="feeDlg.form.category" style="width:100%">
            <el-option v-for="c in meta.fee_categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额(万)" required>
          <el-input-number v-model="feeDlg.form.amount" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="所属期间">
          <el-input v-model="feeDlg.form.fee_period" placeholder="如：2026-Q1" />
        </el-form-item>
        <el-form-item label="覆盖大区">
          <el-input v-model="feeDlg.form.region" placeholder="默认：全国" />
        </el-form-item>
        <el-form-item label="用途说明">
          <el-input v-model="feeDlg.form.purpose" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="feeDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="feeDlg.saving" @click="submitFee">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Present, Clock, CircleCheck, Coin, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('acts');
const rows = ref([]);
const feeRows = ref([]);
const stats = ref(null);
const feeStats = ref(null);
const loading = ref(false);
const feeLoading = ref(false);
const filter = reactive({ type: '', status: '', keyword: '' });
const feeFilter = reactive({ category: '', status: '', fee_period: '' });
const meta = reactive({ types: [], status: [], fee_categories: [] });
const feeStatusList = ['审批中', '通过', '驳回', '已撤销'];

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '活动总数', value: s.total, sub: `预算合计 ${s.budgetTotal} 万`, icon: Present, color: '#2563eb' },
    { title: '待审批', value: s.pending, sub: `已通过 ${s.approved} 个`, icon: Clock, color: '#f59e0b' },
    { title: '进行中 / 已结束', value: `${s.ongoing} / ${s.finished}`, sub: `产出线索 ${s.leads} 条`, icon: CircleCheck, color: '#10b981' },
    { title: '实际费用', value: s.costTotal + ' 万', sub: `预算 ${s.budgetTotal} 万`, icon: Coin, color: '#8b5cf6' },
  ];
});

function statusType(s) {
  return {
    审批中: 'warning', 通过: 'success', 驳回: 'danger',
    已撤销: 'info', 进行中: 'primary', 已结束: 'success',
  }[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/market/meta');
  if (r.code === 200) Object.assign(meta, r.data || {});
}
async function loadStats() {
  const r = await request.get('/market/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['type', 'status', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/market', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadFees() {
  feeLoading.value = true;
  try {
    const params = {};
    ['category', 'status', 'fee_period'].forEach((k) => { if (feeFilter[k]) params[k] = feeFilter[k]; });
    const r = await request.get('/market/fees', { params });
    feeRows.value = r.code === 200 ? r.data || [] : [];
    const s = await request.get('/market/fee-stats');
    feeStats.value = s.code === 200 ? s.data : null;
  } finally { feeLoading.value = false; }
}
function onTabChange(name) {
  if (name === 'fees') loadFees();
  else loadList();
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); });

/* ---------- 新增 / 编辑活动 ---------- */
const createDlg = reactive({
  visible: false, saving: false, editing: false, id: null,
  form: { name: '', type: '学术会议', region: '', start_date: '', end_date: '', budget: 0, target: '' },
});
function openCreate() {
  createDlg.editing = false;
  createDlg.id = null;
  Object.assign(createDlg.form, { name: '', type: (meta.types || [])[0] || '学术会议', region: '', start_date: '', end_date: '', budget: 0, target: '' });
  createDlg.visible = true;
}
async function submitCreate() {
  const f = createDlg.form;
  if (!f.name || !f.type || !f.start_date || !f.budget) { ElMessage.warning('活动名称、类型、开始日期、预算为必填项'); return; }
  createDlg.saving = true;
  const r = createDlg.editing
    ? await request.put(`/market/${createDlg.id}`, f)
    : await request.post('/market', f);
  createDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); createDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 状态流转 ---------- */
async function dealAct(row, status) {
  const r = await request.put(`/market/${row.id}/status`, { status });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '处理失败');
}

/* ---------- 复盘 ---------- */
const finishDlg = reactive({
  visible: false, saving: false, id: null, name: '',
  form: { actual_cost: 0, leads: 0, deal_amount: 0, summary: '' },
});
function openFinish(row) {
  finishDlg.id = row.id;
  finishDlg.name = row.name;
  Object.assign(finishDlg.form, {
    actual_cost: row.actual_cost || 0, leads: row.leads || 0, deal_amount: row.deal_amount || 0, summary: row.summary || '',
  });
  finishDlg.visible = true;
}
async function submitFinish() {
  finishDlg.saving = true;
  const r = await request.post(`/market/${finishDlg.id}/finish`, finishDlg.form);
  finishDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '复盘已登记'); finishDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '登记失败');
}

/* ---------- 市场费用 ---------- */
const feeDlg = reactive({
  visible: false, saving: false,
  form: { title: '', category: '学术推广', amount: 0, fee_period: '', region: '', purpose: '' },
});
function openFee() {
  Object.assign(feeDlg.form, { title: '', category: '学术推广', amount: 0, fee_period: '', region: '', purpose: '' });
  feeDlg.visible = true;
}
async function submitFee() {
  const f = feeDlg.form;
  if (!f.title || !f.category || !(f.amount > 0)) { ElMessage.warning('费用事项、类别、金额（>0）为必填项'); return; }
  feeDlg.saving = true;
  const r = await request.post('/market/fees', f);
  feeDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已登记'); feeDlg.visible = false; loadFees(); }
  else ElMessage.error(r.msg || '登记失败');
}
async function dealFee(row, status) {
  const r = await request.put(`/market/fees/${row.id}/status`, { status });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadFees(); }
  else ElMessage.error(r.msg || '处理失败');
}

/* ---------- 详情 ---------- */
function openDetail(row) {
  const lines = [
    ['活动编号', row.act_no], ['活动名称', row.name], ['类型', row.type], ['大区', row.region],
    ['开始日期', row.start_date], ['结束日期', row.end_date], ['预算(万)', row.budget],
    ['实际费用(万)', row.actual_cost], ['产出线索', row.leads], ['关联成交(万)', row.deal_amount],
    ['发起人', row.owner_name], ['状态', row.status], ['复盘总结', row.summary],
  ];
  import('element-plus').then(({ ElMessageBox }) => {
    ElMessageBox.alert(
      lines.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0"><span style="color:#909399">${k}</span><b>${v || '—'}</b></div>`).join(''),
      '活动详情', { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
    );
  });
}
</script>

<style scoped>
.market { padding: 20px; }
.muted { color: #909399; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.fee-summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; font-size: 13px; }
.fee-chip { background: var(--el-fill-color-light); border-radius: 10px; padding: 2px 10px; font-size: 12px; }
.el-form-item { margin-bottom: 12px; }
</style>
