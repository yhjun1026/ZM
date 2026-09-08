<template>
  <div class="kpi">
    <div class="page-header">
      <h2>绩效管理</h2>
      <p>系统取数生成（回款/签约/商机）→ 管理层人工调分 → 合规一票否决 → 绩效归档，薪酬核算按评价分联动</p>
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

    <div class="tab-toolbar">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <el-date-picker v-model="filter.period" type="month" value-format="YYYY-MM" placeholder="考核月份" style="width:150px" @change="loadList" />
        <el-select v-model="filter.dept" placeholder="全部部门" style="width:140px" clearable @change="loadList">
          <el-option v-for="d in options.depts" :key="d" :label="d" :value="d" />
        </el-select>
        <el-input v-model="filter.q" placeholder="搜索工号/姓名" style="width:180px" clearable @change="loadList" />
      </div>
      <div style="display:flex;gap:8px;">
        <el-button @click="loadList"><el-icon style="margin-right:4px"><Refresh /></el-icon>刷新</el-button>
        <el-button type="primary" :loading="generating" @click="submitGenerate" :disabled="!options.can_manage">
          <el-icon style="margin-right:4px"><TrendCharts /></el-icon>生成绩效
        </el-button>
      </div>
    </div>

    <el-table :data="rows" stripe size="small" v-loading="loading">
      <el-table-column prop="emp_no" label="工号" width="100" />
      <el-table-column prop="emp_name" label="姓名" width="100" />
      <el-table-column prop="dept_name" label="部门" width="110" show-overflow-tooltip />
      <el-table-column prop="role" label="岗位" width="110" show-overflow-tooltip />
      <el-table-column label="签约(万)" width="100" align="right"><template #default="{ row }">{{ row.sales_amount }}</template></el-table-column>
      <el-table-column label="回款(万)" width="100" align="right"><template #default="{ row }"><b>{{ row.collection_amount }}</b></template></el-table-column>
      <el-table-column label="目标(万)" width="100" align="right"><template #default="{ row }">{{ row.target_amount }}</template></el-table-column>
      <el-table-column label="达成率" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="rateType(row.completion_rate)">{{ row.completion_rate }}%</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="新增商机" width="90" align="right"><template #default="{ row }">{{ row.opp_entry_rate }}</template></el-table-column>
      <el-table-column label="绩效分" width="100" align="right">
        <template #default="{ row }"><b :class="scoreClass(row.score)">{{ row.score }}</b></template>
      </el-table-column>
      <el-table-column prop="remark" label="说明" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.veto" type="danger" size="small">已否决</el-tag>
          <el-tag v-else type="success" size="small">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" :disabled="!options.can_manage || row.veto" @click="openAdjust(row)">调分</el-button>
          <el-button v-if="!row.veto" size="small" type="danger" :disabled="!options.can_manage" @click="openVeto(row)">否决</el-button>
          <el-button v-else size="small" :disabled="!options.can_manage" @click="revokeVeto(row)">撤销</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无绩效记录，选择月份后点击「生成绩效」</span></template>
    </el-table>

    <!-- 部门达成统计 -->
    <div class="section-title">部门达成统计（{{ statsYear }} 年）</div>
    <el-table :data="deptStats" stripe size="small" v-loading="loadingStats" max-height="280">
      <el-table-column prop="dept" label="部门" width="140" />
      <el-table-column label="人数" width="80" align="right"><template #default="{ row }">{{ row.emps }}</template></el-table-column>
      <el-table-column label="目标(万)" width="110" align="right"><template #default="{ row }">{{ row.target }}</template></el-table-column>
      <el-table-column label="回款(万)" width="110" align="right"><template #default="{ row }">{{ row.collection }}</template></el-table-column>
      <el-table-column label="达成率" width="110"><template #default="{ row }"><el-tag size="small" :type="rateType(row.rate)">{{ row.rate }}%</el-tag></template></el-table-column>
      <el-table-column label="平均绩效分" width="110" align="right"><template #default="{ row }">{{ row.score }}</template></el-table-column>
      <el-table-column label="达标人数" width="100" align="right"><template #default="{ row }">{{ row.reached }}</template></el-table-column>
      <template #empty><span class="muted">暂无统计数据</span></template>
    </el-table>

    <!-- 调分 -->
    <el-dialog v-model="adjustDlg.visible" :title="'绩效调分 · ' + adjustDlg.name" width="440px">
      <p class="muted" style="margin-top:0;">当前得分：<b>{{ adjustDlg.current }}</b>（管理层可调，范围 0~150）</p>
      <el-form label-width="90px" size="small">
        <el-form-item label="调整后得分"><el-input-number v-model="adjustDlg.score" :min="0" :max="150" style="width:100%" /></el-form-item>
        <el-form-item label="调整说明"><el-input v-model="adjustDlg.remark" type="textarea" :rows="3" placeholder="选填，写入备注" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="adjustDlg.saving" @click="submitAdjust">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- 合规否决 -->
    <el-dialog v-model="vetoDlg.visible" :title="'合规一票否决 · ' + vetoDlg.name" width="440px">
      <p class="muted" style="margin-top:0;">否决后该员工本期绩效分直接归零，且不可再调分，需先撤销否决。</p>
      <el-form label-width="80px" size="small">
        <el-form-item label="否决原因" required><el-input v-model="vetoDlg.reason" type="textarea" :rows="3" placeholder="如：窜货/虚假报备/重大合规事故" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="vetoDlg.visible = false">取消</el-button>
        <el-button type="danger" :loading="vetoDlg.saving" @click="submitVeto">确认否决</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { TrendCharts, User, Trophy, Warning, Refresh } from '@element-plus/icons-vue';
import request from '../api/request';

const loading = ref(false);
const loadingStats = ref(false);
const generating = ref(false);
const rows = ref([]);
const stats = ref(null);
const deptStats = ref([]);
const options = ref({ depts: [], periods: [], can_manage: false, rules: {} });
const statsYear = ref(String(new Date().getFullYear()));
const filter = reactive({ period: new Date().toISOString().slice(0, 7), dept: '', q: '' });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '考核人数', value: s.total, sub: `回款合计 ${s.collection_amount} 万`, icon: User, color: '#2563eb' },
    { title: '平均达成率', value: s.avg_completion + '%', sub: `目标合计 ${s.target_amount} 万`, icon: TrendCharts, color: '#f59e0b' },
    { title: '平均绩效分', value: s.avg_score, sub: `≥60 分 ${s.over60} 人`, icon: Trophy, color: '#10b981' },
    { title: '达标 / 否决', value: `${s.reached} / ${s.vetoed}`, sub: '达成率≥100% / 合规否决', icon: Warning, color: '#8b5cf6' },
  ];
});

function rateType(r) {
  const v = Number(r || 0);
  if (v >= 100) return 'success';
  if (v >= 80) return 'primary';
  if (v >= 60) return 'warning';
  return 'danger';
}
function scoreClass(s) {
  const v = Number(s || 0);
  if (v >= 90) return 'score-high';
  if (v >= 60) return 'score-mid';
  return 'score-low';
}

async function loadOptions() {
  const r = await request.get('/kpi/options');
  if (r.code === 200) options.value = r.data || options.value;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['period', 'dept', 'q'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/kpi', { params });
    if (r.code === 200) {
      rows.value = (r.data && r.data.rows) || [];
      stats.value = (r.data && r.data.stats) || null;
      if (r.data && r.data.period) filter.period = r.data.period;
    } else rows.value = [];
  } finally { loading.value = false; }
}
async function loadStats() {
  loadingStats.value = true;
  try {
    const r = await request.get('/kpi/stats', { params: { year: statsYear.value } });
    deptStats.value = (r.code === 200 && r.data ? r.data.byDept : []) || [];
  } finally { loadingStats.value = false; }
}
onMounted(async () => { await loadOptions(); await loadList(); await loadStats(); });

async function submitGenerate() {
  if (!filter.period) { ElMessage.warning('请选择考核月份'); return; }
  generating.value = true;
  const r = await request.post('/kpi/generate', { period: filter.period });
  generating.value = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已生成'); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '生成失败');
}

const adjustDlg = reactive({ visible: false, saving: false, id: null, name: '', current: 0, score: 0, remark: '' });
function openAdjust(row) {
  adjustDlg.id = row.id;
  adjustDlg.name = row.emp_name;
  adjustDlg.current = row.score;
  adjustDlg.score = row.score;
  adjustDlg.remark = '';
  adjustDlg.visible = true;
}
async function submitAdjust() {
  if (adjustDlg.score === null || adjustDlg.score === undefined) { ElMessage.warning('请填写得分'); return; }
  adjustDlg.saving = true;
  const r = await request.put(`/kpi/${adjustDlg.id}`, { score: adjustDlg.score, remark: adjustDlg.remark });
  adjustDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已调整'); adjustDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '调整失败');
}

const vetoDlg = reactive({ visible: false, saving: false, id: null, name: '', reason: '' });
function openVeto(row) {
  vetoDlg.id = row.id;
  vetoDlg.name = row.emp_name;
  vetoDlg.reason = '';
  vetoDlg.visible = true;
}
async function submitVeto() {
  if (!vetoDlg.reason.trim()) { ElMessage.warning('请填写否决原因'); return; }
  vetoDlg.saving = true;
  const r = await request.post(`/kpi/${vetoDlg.id}/veto`, { reason: vetoDlg.reason });
  vetoDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已否决'); vetoDlg.visible = false; loadList(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function revokeVeto(row) {
  await ElMessageBox.confirm(`确认撤销 ${row.emp_name} 的合规否决？撤销后需重新生成或调分。`, '撤销确认', { type: 'warning' });
  const r = await request.post(`/kpi/${row.id}/veto`, { revoke: true });
  if (r.code === 200) { ElMessage.success(r.msg || '已撤销'); loadList(); }
  else ElMessage.error(r.msg || '操作失败');
}
</script>

<style scoped>
.kpi { padding: 20px; }
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
.section-title { margin: 22px 0 10px; font-size: 14px; font-weight: 600; }
.score-high { color: #10b981; }
.score-mid { color: #2563eb; }
.score-low { color: #f56c6c; }
.el-form-item { margin-bottom: 12px; }
</style>
