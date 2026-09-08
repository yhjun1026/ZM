<template>
  <div class="opportunity">
    <div class="page-header">
      <h2>商机管理</h2>
      <p>商机录入 → 终端报备 → 项目立项 → 价格审批 → 投标管理 → 合同评审 → 验收归档 → 赢单/输单</p>
    </div>

    <!-- KPI 卡片 -->
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

    <!-- 工具栏 -->
    <div class="tab-toolbar">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <el-select v-model="filter.stage" placeholder="全部阶段" style="width:130px" clearable @change="loadList">
          <el-option v-for="s in stageList" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select v-model="filter.sales_mode" placeholder="全部模式" style="width:120px" clearable @change="loadList">
          <el-option v-for="s in modeList" :key="s" :label="s" :value="s" />
        </el-select>
        <el-input v-model="filter.keyword" placeholder="搜索商机号/名称/客户/终端" style="width:230px" clearable @change="loadList" />
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon style="margin-right:4px"><Plus /></el-icon>新增商机
      </el-button>
    </div>

    <!-- 列表 -->
    <el-table :data="rows" stripe size="small" v-loading="loading">
      <el-table-column prop="opp_no" label="商机号" width="130" />
      <el-table-column prop="name" label="商机名称" min-width="170" show-overflow-tooltip />
      <el-table-column prop="customer_name" label="客户" width="140" show-overflow-tooltip />
      <el-table-column prop="terminal" label="终端" width="120" show-overflow-tooltip />
      <el-table-column label="金额(万)" width="100" align="right">
        <template #default="{ row }"><b>{{ row.amount }}</b></template>
      </el-table-column>
      <el-table-column label="阶段" width="110">
        <template #default="{ row }"><el-tag :type="stageType(row.stage)" size="small">{{ row.stage }}</el-tag></template>
      </el-table-column>
      <el-table-column label="赢率" width="80">
        <template #default="{ row }">{{ row.probability }}%</template>
      </el-table-column>
      <el-table-column prop="sales_name" label="负责销售" width="100" />
      <el-table-column prop="distributor_name" label="经销商" width="130" show-overflow-tooltip />
      <el-table-column prop="sales_mode" label="模式" width="80" />
      <el-table-column label="预计成交" width="110">
        <template #default="{ row }">{{ row.expected_date || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openStage(row)">推进</el-button>
          <el-button size="small" @click="openFollow(row)">跟进</el-button>
          <el-button size="small" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无商机，点击右上角「新增商机」创建</span></template>
    </el-table>

    <!-- 新增商机 -->
    <el-dialog v-model="createDlg.visible" title="新增商机" width="560px">
      <el-form label-width="100px" size="small">
        <el-form-item label="商机名称" required>
          <el-input v-model="createDlg.form.name" placeholder="如：遂宁中心医院彩超采购" />
        </el-form-item>
        <el-form-item label="绑定客户" required>
          <el-select v-model="createDlg.form.customer_id" filterable placeholder="选择客户" style="width:100%">
            <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责销售">
          <el-select v-model="createDlg.form.sales_id" filterable clearable placeholder="默认取客户负责销售" style="width:100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="经销商">
          <el-select v-model="createDlg.form.distributor_id" filterable clearable placeholder="分销/终端报备时必填" style="width:100%">
            <el-option v-for="d in dealers" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品线">
          <el-input v-model="createDlg.form.product_line" placeholder="如：影像类" />
        </el-form-item>
        <el-form-item label="终端">
          <el-input v-model="createDlg.form.terminal" placeholder="终端医院/科室" />
        </el-form-item>
        <el-form-item label="预计金额(万)" required>
          <el-input-number v-model="createDlg.form.amount" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="销售模式">
          <el-select v-model="createDlg.form.sales_mode" style="width:100%">
            <el-option v-for="s in modeList" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="预计成交">
          <el-date-picker v-model="createDlg.form.expected_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <!-- 阶段推进 -->
    <el-dialog v-model="stageDlg.visible" title="阶段推进" width="440px">
      <p class="muted" style="margin-bottom:12px;">
        当前阶段：<el-tag size="small">{{ stageDlg.current }}</el-tag>
        <span v-if="nextStage"> → 可推进至：<el-tag type="success" size="small">{{ nextStage }}</el-tag></span>
        <span v-else>（已到终点）</span>
      </p>
      <el-form-item label="目标阶段">
        <el-select v-model="stageDlg.stage" style="width:100%">
          <el-option v-for="s in stageOptions" :key="s" :label="s" :value="s" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="stageDlg.note" type="textarea" :rows="2" placeholder="选填，将写入跟进记录" />
      </el-form-item>
      <template #footer>
        <el-button @click="stageDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="stageDlg.saving" @click="submitStage">确认推进</el-button>
      </template>
    </el-dialog>

    <!-- 跟进记录 -->
    <el-dialog v-model="followDlg.visible" :title="'跟进记录 · ' + followDlg.oppName" width="640px">
      <el-form-item label="新增跟进">
        <el-input v-model="followDlg.content" type="textarea" :rows="2" placeholder="本次沟通内容" />
      </el-form-item>
      <el-form-item label="下一步">
        <el-input v-model="followDlg.next_action" placeholder="下一步动作" />
      </el-form-item>
      <el-button size="small" type="primary" :loading="followDlg.saving" @click="submitFollow" style="margin-bottom:12px;">记录跟进</el-button>
      <el-table :data="followDlg.rows" stripe size="small" max-height="280">
        <el-table-column prop="emp_name" label="跟进人" width="90" />
        <el-table-column prop="content" label="内容" min-width="220" show-overflow-tooltip />
        <el-table-column prop="next_action" label="下一步" width="130" show-overflow-tooltip />
        <el-table-column label="时间" width="140">
          <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
        </el-table-column>
        <template #empty><span class="muted">暂无跟进记录</span></template>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { TrendCharts, Loading, CircleCheck, CircleClose, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const rows = ref([]);
const stats = ref(null);
const loading = ref(false);
const filter = reactive({ stage: '', sales_mode: '', keyword: '' });
const stageList = ref([]);
const modeList = ref([]);
const customers = ref([]);
const employees = ref([]);
const dealers = ref([]);

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '商机总数', value: s.total, sub: `金额合计 ${s.amount} 万`, icon: TrendCharts, color: '#2563eb' },
    { title: '进行中', value: s.running, sub: '未赢单未输单', icon: Loading, color: '#f59e0b' },
    { title: '已赢单', value: s.won, sub: `赢单金额 ${s.won_amount} 万`, icon: CircleCheck, color: '#10b981' },
    { title: '赢单率', value: s.win_rate + '%', sub: `输单 ${s.lost} 个`, icon: CircleClose, color: '#8b5cf6' },
  ];
});

function stageType(s) {
  const map = {
    商机录入: 'info', 终端报备: 'primary', 项目立项: 'primary', 价格审批: 'warning',
    投标管理: 'warning', 合同评审: 'warning', 验收归档: 'success', 赢单: 'success', 输单: 'danger',
  };
  return map[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/opportunity/stages');
  if (r.code === 200) {
    stageList.value = r.data.stages || [];
    modeList.value = r.data.sales_modes || [];
  }
  const c = await request.get('/customers');
  if (c.code === 200) customers.value = c.data || [];
  const e = await request.get('/users');
  if (e.code === 200) employees.value = (e.data || []).map((u) => ({ id: Number(u.id), name: u.name }));
  const d = await request.get('/dealer');
  if (d.code === 200) dealers.value = d.data || [];
}
async function loadStats() {
  const r = await request.get('/opportunity/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['stage', 'sales_mode', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/opportunity', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally {
    loading.value = false;
  }
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); });

/* ---------- 新增 ---------- */
const createDlg = reactive({
  visible: false, saving: false,
  form: { name: '', customer_id: null, sales_id: null, distributor_id: null, product_line: '', terminal: '', amount: 0, sales_mode: '直销', expected_date: '' },
});
function openCreate() {
  Object.assign(createDlg.form, { name: '', customer_id: null, sales_id: null, distributor_id: null, product_line: '', terminal: '', amount: 0, sales_mode: '直销', expected_date: '' });
  createDlg.visible = true;
}
async function submitCreate() {
  if (!createDlg.form.name || !createDlg.form.customer_id || !createDlg.form.amount) {
    ElMessage.warning('商机名称、绑定客户、预计金额必填'); return;
  }
  createDlg.saving = true;
  const r = await request.post('/opportunity', createDlg.form);
  createDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已创建'); createDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '创建失败');
}

/* ---------- 阶段推进 ---------- */
const stageDlg = reactive({ visible: false, saving: false, id: null, current: '', stage: '', note: '' });
const nextStage = computed(() => {
  const i = stageList.value.indexOf(stageDlg.current);
  return i >= 0 && i < stageList.value.length - 1 ? stageList.value[i + 1] : '';
});
const stageOptions = computed(() => {
  const i = stageList.value.indexOf(stageDlg.current);
  const opts = i >= 0 && i < stageList.value.length - 1 ? [stageList.value[i + 1]] : [];
  if (stageDlg.current !== '赢单' && stageDlg.current !== '输单') opts.push('输单');
  return opts;
});
function openStage(row) {
  stageDlg.id = row.id;
  stageDlg.current = row.stage;
  stageDlg.stage = nextStage.value || '';
  stageDlg.note = '';
  stageDlg.visible = true;
}
async function submitStage() {
  if (!stageDlg.stage) { ElMessage.warning('请选择目标阶段'); return; }
  stageDlg.saving = true;
  const r = await request.put(`/opportunity/${stageDlg.id}/stage`, { stage: stageDlg.stage, note: stageDlg.note });
  stageDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已推进'); stageDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '推进失败');
}

/* ---------- 跟进 ---------- */
const followDlg = reactive({ visible: false, saving: false, id: null, oppName: '', content: '', next_action: '', rows: [] });
async function openFollow(row) {
  followDlg.id = row.id;
  followDlg.oppName = row.name;
  followDlg.content = '';
  followDlg.next_action = '';
  followDlg.visible = true;
  const r = await request.get(`/opportunity/${row.id}/follows`);
  followDlg.rows = r.code === 200 ? r.data || [] : [];
}
async function submitFollow() {
  if (!followDlg.content.trim()) { ElMessage.warning('请填写跟进内容'); return; }
  followDlg.saving = true;
  const r = await request.post(`/opportunity/${followDlg.id}/follows`, { content: followDlg.content, next_action: followDlg.next_action });
  followDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success('已记录');
    followDlg.content = ''; followDlg.next_action = '';
    const r2 = await request.get(`/opportunity/${followDlg.id}/follows`);
    followDlg.rows = r2.code === 200 ? r2.data || [] : [];
  } else ElMessage.error(r.msg || '记录失败');
}

/* ---------- 详情 ---------- */
function openDetail(row) {
  const lines = [
    ['商机号', row.opp_no], ['名称', row.name], ['客户', row.customer_name],
    ['终端', row.terminal], ['金额(万)', row.amount], ['阶段', row.stage],
    ['赢率', (row.probability || 0) + '%'], ['销售', row.sales_name],
    ['经销商', row.distributor_name], ['模式', row.sales_mode], ['预计成交', row.expected_date],
  ];
  import('element-plus').then(({ ElMessageBox }) => {
    ElMessageBox.alert(
      lines.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0"><span style="color:#909399">${k}</span><b>${v || '—'}</b></div>`).join(''),
      '商机详情', { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
    );
  });
}
</script>

<style scoped>
.opportunity { padding: 20px; }
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
.el-form-item { margin-bottom: 12px; }
</style>
