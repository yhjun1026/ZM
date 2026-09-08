<template>
  <div class="dealer">
    <div class="page-header">
      <h2>经销商管理</h2>
      <p>资料录入 → 建档审批 → 准入评审五项 → 产品线授权 → 分级管控 → 周期考核（季度/年度）</p>
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
      <!-- ============ 档案 ============ -->
      <el-tab-pane label="经销商档案" name="list">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="filter.status" style="width:110px" @change="loadList">
              <el-option label="已启用" value="启用" />
              <el-option label="待审批" value="草稿" />
              <el-option label="已停用" value="停用" />
              <el-option label="全部" value="全部" />
            </el-select>
            <el-select v-model="filter.tier" placeholder="全部层级" style="width:120px" clearable @change="loadList">
              <el-option v-for="t in meta.tiers" :key="t" :label="t" :value="t" />
            </el-select>
            <el-select v-model="filter.admission_status" placeholder="全部准入状态" style="width:140px" clearable @change="loadList">
              <el-option v-for="s in meta.admission_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="filter.keyword" placeholder="搜索名称/编号/大区/联系人" style="width:230px" clearable @change="loadList" />
          </div>
          <el-button type="primary" @click="openCreate">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增经销商
          </el-button>
        </div>

        <el-table :data="rows" stripe size="small" v-loading="loading">
          <el-table-column prop="code" label="经销商编号" width="130" />
          <el-table-column prop="name" label="经销商名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="region" label="大区" width="100" />
          <el-table-column prop="identity" label="身份" width="110" />
          <el-table-column label="层级" width="90">
            <template #default="{ row }"><el-tag :type="tierType(row.tier)" size="small">{{ row.tier }}</el-tag></template>
          </el-table-column>
          <el-table-column label="准入状态" width="110">
            <template #default="{ row }"><el-tag :type="admissionType(row.admission_status)" size="small">{{ row.admission_status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }"><el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="信用(万)" width="100" align="right">
            <template #default="{ row }">{{ row.credit_used }} / {{ row.credit_limit }}</template>
          </el-table-column>
          <el-table-column label="授权线" width="80" align="center">
            <template #default="{ row }">{{ row.pl_count || 0 }}</template>
          </el-table-column>
          <el-table-column prop="contact_name" label="联系人" width="90" />
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openAdmission(row)">准入评审</el-button>
              <el-button size="small" @click="openPl(row)">授权</el-button>
              <el-button size="small" @click="openManage(row)">管控</el-button>
              <el-button size="small" @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无经销商，点击右上角「新增经销商」录入</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 考核台账 ============ -->
      <el-tab-pane label="周期考核" name="assess">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="assessFilter.period" placeholder="考核周期，如 2026Q3" style="width:180px" clearable @change="loadAssessments" />
          </div>
          <el-button type="primary" @click="openAssess">
            <el-icon style="margin-right:4px"><Plus /></el-icon>录入考核
          </el-button>
        </div>
        <el-table :data="assessRows" stripe size="small" v-loading="assessLoading">
          <el-table-column prop="distributor_name" label="经销商" min-width="160" show-overflow-tooltip />
          <el-table-column prop="period" label="考核周期" width="110" />
          <el-table-column label="销售额(万)" width="110" align="right">
            <template #default="{ row }">{{ row.sales_amount }}</template>
          </el-table-column>
          <el-table-column label="达成率" width="90" align="right">
            <template #default="{ row }">{{ row.task_rate }}%</template>
          </el-table-column>
          <el-table-column label="信用分" width="80" align="right">
            <template #default="{ row }">{{ row.credit_score }}</template>
          </el-table-column>
          <el-table-column label="渠道分" width="80" align="right">
            <template #default="{ row }">{{ row.channel_score }}</template>
          </el-table-column>
          <el-table-column label="总分" width="80" align="right">
            <template #default="{ row }"><b>{{ row.total_score }}</b></template>
          </el-table-column>
          <el-table-column label="等级" width="90">
            <template #default="{ row }"><el-tag :type="gradeType(row.grade)" size="small">{{ row.grade }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="suggestion" label="建议" width="110" />
          <el-table-column label="时间" width="140">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <template #empty><span class="muted">暂无考核记录，点击右上角「录入考核」新增</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增经销商 -->
    <el-dialog v-model="createDlg.visible" title="新增经销商" width="540px">
      <el-form label-width="110px" size="small">
        <el-form-item label="经销商名称" required>
          <el-input v-model="createDlg.form.name" placeholder="如：四川康达医疗器械有限公司" />
        </el-form-item>
        <el-form-item label="所属大区" required>
          <el-input v-model="createDlg.form.region" placeholder="如：西南" />
        </el-form-item>
        <el-form-item label="身份">
          <el-select v-model="createDlg.form.identity" style="width:100%">
            <el-option v-for="i in meta.identities" :key="i" :label="i" :value="i" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="createDlg.form.contact_name" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="createDlg.form.contact_phone" />
        </el-form-item>
        <el-form-item label="经营许可证号">
          <el-input v-model="createDlg.form.license_no" placeholder="医疗器械经营许可证" />
        </el-form-item>
        <el-form-item label="信用额度(万)">
          <el-input-number v-model="createDlg.form.credit_limit" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:4px 0 0;">
        提交后生成草稿档案（层级「观察」、准入状态「准入评审中」），需管理层建档审批通过后正式启用。
      </p>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <!-- 准入评审 -->
    <el-dialog v-model="admissionDlg.visible" :title="'准入评审 · ' + admissionDlg.name" width="660px">
      <el-form label-width="90px" size="small" :inline="true">
        <el-form-item label="评审项">
          <el-select v-model="admissionDlg.form.item" style="width:150px">
            <el-option v-for="i in meta.admission_items" :key="i" :label="i" :value="i" />
          </el-select>
        </el-form-item>
        <el-form-item label="得分">
          <el-input-number v-model="admissionDlg.form.score" :min="0" :max="100" style="width:140px" />
        </el-form-item>
        <el-form-item label="结论">
          <el-select v-model="admissionDlg.form.conclusion" style="width:100px">
            <el-option label="通过" value="通过" />
            <el-option label="不通过" value="不通过" />
            <el-option label="待定" value="待定" />
          </el-select>
        </el-form-item>
        <el-button type="primary" size="small" :loading="admissionDlg.saving" @click="submitAdmission">记录评审</el-button>
      </el-form>
      <p class="muted" style="font-size:12px;margin:0 0 8px;">
        五项（证照核验/质量体系/资金实力/渠道能力/合规审查）全部「通过」且均分 ≥ 85 分，系统自动置为「准入合格」。
      </p>
      <el-table :data="admissionDlg.rows" stripe size="small" max-height="260">
        <el-table-column prop="item" label="评审项" width="110" />
        <el-table-column prop="score" label="得分" width="80" align="right" />
        <el-table-column label="结论" width="90">
          <template #default="{ row }">
            <el-tag :type="row.conclusion === '通过' ? 'success' : 'warning'" size="small">{{ row.conclusion }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reviewer" label="评审人" width="100" />
        <el-table-column label="时间" width="140">
          <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
        </el-table-column>
        <template #empty><span class="muted">暂无评审记录</span></template>
      </el-table>
      <template #footer><el-button @click="admissionDlg.visible = false">关闭</el-button></template>
    </el-dialog>

    <!-- 产品线授权 -->
    <el-dialog v-model="plDlg.visible" :title="'产品线授权 · ' + plDlg.name" width="620px">
      <el-form label-width="90px" size="small" :inline="true">
        <el-form-item label="产品线">
          <el-input v-model="plDlg.form.product_line" placeholder="如：影像类" style="width:140px" />
        </el-form-item>
        <el-form-item label="授权起">
          <el-date-picker v-model="plDlg.form.auth_from" type="date" value-format="YYYY-MM-DD" style="width:150px" />
        </el-form-item>
        <el-form-item label="授权止">
          <el-date-picker v-model="plDlg.form.auth_to" type="date" value-format="YYYY-MM-DD" style="width:150px" />
        </el-form-item>
        <el-button type="primary" size="small" :loading="plDlg.saving" @click="submitPl">授权</el-button>
      </el-form>
      <el-table :data="plDlg.rows" stripe size="small" max-height="260">
        <el-table-column prop="product_line" label="产品线" min-width="140" />
        <el-table-column prop="auth_from" label="授权起" width="110" />
        <el-table-column prop="auth_to" label="授权止" width="110" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === '授权中' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="togglePl(row)">{{ row.status === '授权中' ? '暂停' : '恢复' }}</el-button>
          </template>
        </el-table-column>
        <template #empty><span class="muted">暂无授权产品线（准入合格后方可授权）</span></template>
      </el-table>
      <template #footer><el-button @click="plDlg.visible = false">关闭</el-button></template>
    </el-dialog>

    <!-- 分级 / 准入状态 / 建档审批 -->
    <el-dialog v-model="manageDlg.visible" :title="'分级与准入管控 · ' + manageDlg.name" width="440px">
      <el-form label-width="100px" size="small">
        <el-form-item label="经销商层级">
          <el-select v-model="manageDlg.tier" style="width:100%">
            <el-option v-for="t in meta.tiers" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="准入状态">
          <el-select v-model="manageDlg.admission_status" style="width:100%">
            <el-option v-for="s in meta.admission_status" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="manageDlg.status !== '启用'" type="success" :loading="manageDlg.approving" @click="submitApprove">建档审批通过</el-button>
        <el-button @click="manageDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="manageDlg.saving" @click="submitManage">保存</el-button>
      </template>
    </el-dialog>

    <!-- 录入考核 -->
    <el-dialog v-model="assessDlg.visible" title="录入周期考核" width="520px">
      <el-form label-width="110px" size="small">
        <el-form-item label="经销商" required>
          <el-select v-model="assessDlg.form.distributor_id" filterable style="width:100%">
            <el-option v-for="d in rows" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="考核周期" required>
          <el-input v-model="assessDlg.form.period" placeholder="如：2026Q3 / 2026年度" />
        </el-form-item>
        <el-form-item label="销售额(万)">
          <el-input-number v-model="assessDlg.form.sales_amount" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="任务达成率%">
          <el-input-number v-model="assessDlg.form.task_rate" :min="0" :max="200" style="width:100%" />
        </el-form-item>
        <el-form-item label="回款信用分">
          <el-input-number v-model="assessDlg.form.credit_score" :min="0" :max="100" style="width:100%" />
        </el-form-item>
        <el-form-item label="渠道秩序分">
          <el-input-number v-model="assessDlg.form.channel_score" :min="0" :max="100" style="width:100%" />
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:0;">
        总分 = 达成率×0.4 + 信用分×0.3 + 渠道分×0.3；≥90 优秀 / ≥80 良好 / ≥60 合格 / 其余不合格。
      </p>
      <template #footer>
        <el-button @click="assessDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="assessDlg.saving" @click="submitAssess">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Shop, Star, CircleCheck, Coin, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('list');
const rows = ref([]);
const assessRows = ref([]);
const stats = ref(null);
const loading = ref(false);
const assessLoading = ref(false);
const filter = reactive({ status: '启用', tier: '', admission_status: '', keyword: '' });
const assessFilter = reactive({ period: '' });
const meta = reactive({ tiers: [], identities: [], admission_status: [], admission_items: [], status: [], grades: [] });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const tierText = (s.tiers || []).map((t) => `${t.tier}${t.count}`).join(' · ');
  const qualified = (s.admissions || []).find((a) => a.status === '合格');
  return [
    { title: '经销商总数', value: s.total, sub: tierText, icon: Shop, color: '#2563eb' },
    { title: '层级分布', value: (s.tiers || []).find((t) => t.tier === '核心')?.count ?? 0, sub: '核心经销商数量', icon: Star, color: '#f59e0b' },
    { title: '准入合格', value: qualified ? qualified.count : 0, sub: '可授权产品线', icon: CircleCheck, color: '#10b981' },
    { title: '信用额度使用率', value: s.credit_usage + '%', sub: `已用 ${s.credit_used} / 额度 ${s.credit_limit} 万`, icon: Coin, color: '#8b5cf6' },
  ];
});

function tierType(t) {
  return { 核心: 'danger', 普通: 'primary', 观察: 'info' }[t] || 'info';
}
function admissionType(s) {
  return { 合格: 'success', 准入评审中: 'warning', 暂停合作: 'danger', 淘汰: 'info' }[s] || 'info';
}
function gradeType(g) {
  return { 优秀: 'success', 良好: 'primary', 合格: 'warning', 不合格: 'danger' }[g] || 'info';
}

async function loadMeta() {
  const r = await request.get('/dealer/meta');
  if (r.code === 200) Object.assign(meta, r.data || {});
}
async function loadStats() {
  const r = await request.get('/dealer/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['status', 'tier', 'admission_status', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/dealer', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally {
    loading.value = false;
  }
}
async function loadAssessments() {
  assessLoading.value = true;
  try {
    const params = {};
    if (assessFilter.period) params.period = assessFilter.period;
    const r = await request.get('/dealer/assessments', { params });
    assessRows.value = r.code === 200 ? r.data || [] : [];
  } finally {
    assessLoading.value = false;
  }
}
function onTabChange(name) {
  if (name === 'assess') loadAssessments();
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); });

/* ---------- 新增 ---------- */
const createDlg = reactive({
  visible: false, saving: false,
  form: { name: '', region: '', identity: '下游经销商', contact_name: '', contact_phone: '', license_no: '', credit_limit: 0 },
});
function openCreate() {
  Object.assign(createDlg.form, { name: '', region: '', identity: '下游经销商', contact_name: '', contact_phone: '', license_no: '', credit_limit: 0 });
  createDlg.visible = true;
}
async function submitCreate() {
  if (!createDlg.form.name || !createDlg.form.region) { ElMessage.warning('经销商名称与所属大区必填'); return; }
  createDlg.saving = true;
  const r = await request.post('/dealer', createDlg.form);
  createDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); createDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 准入评审 ---------- */
const admissionDlg = reactive({ visible: false, saving: false, id: null, name: '', rows: [], form: { item: '', score: 85, conclusion: '通过' } });
async function openAdmission(row) {
  admissionDlg.id = row.id;
  admissionDlg.name = row.name;
  admissionDlg.form.item = (meta.admission_items || [])[0] || '';
  admissionDlg.form.score = 85;
  admissionDlg.form.conclusion = '通过';
  admissionDlg.visible = true;
  await reloadAdmissions();
}
async function reloadAdmissions() {
  const r = await request.get(`/dealer/${admissionDlg.id}/admissions`);
  admissionDlg.rows = r.code === 200 ? r.data || [] : [];
}
async function submitAdmission() {
  if (!admissionDlg.form.item) { ElMessage.warning('请选择评审项目'); return; }
  admissionDlg.saving = true;
  const r = await request.post(`/dealer/${admissionDlg.id}/admissions`, admissionDlg.form);
  admissionDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已记录'); await reloadAdmissions(); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '记录失败');
}

/* ---------- 产品线授权 ---------- */
const plDlg = reactive({ visible: false, saving: false, id: null, name: '', rows: [], form: { product_line: '', auth_from: '', auth_to: '' } });
async function openPl(row) {
  plDlg.id = row.id;
  plDlg.name = row.name;
  plDlg.form.product_line = '';
  plDlg.form.auth_from = '';
  plDlg.form.auth_to = '';
  plDlg.visible = true;
  await reloadPls();
}
async function reloadPls() {
  const r = await request.get(`/dealer/${plDlg.id}/pls`);
  plDlg.rows = r.code === 200 ? r.data || [] : [];
}
async function submitPl() {
  if (!plDlg.form.product_line) { ElMessage.warning('产品线必填'); return; }
  plDlg.saving = true;
  const r = await request.post(`/dealer/${plDlg.id}/pls`, plDlg.form);
  plDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已授权'); plDlg.form.product_line = ''; await reloadPls(); loadList(); }
  else ElMessage.error(r.msg || '授权失败');
}
async function togglePl(row) {
  const r = await request.put(`/dealer/pls/${row.id}`, { status: row.status === '授权中' ? '暂停' : '授权中' });
  if (r.code === 200) { ElMessage.success('已更新'); await reloadPls(); loadList(); }
  else ElMessage.error(r.msg || '更新失败');
}

/* ---------- 分级 / 准入 / 建档审批 ---------- */
const manageDlg = reactive({ visible: false, saving: false, approving: false, id: null, name: '', status: '', tier: '观察', admission_status: '准入评审中' });
function openManage(row) {
  manageDlg.id = row.id;
  manageDlg.name = row.name;
  manageDlg.status = row.status;
  manageDlg.tier = row.tier;
  manageDlg.admission_status = row.admission_status;
  manageDlg.visible = true;
}
async function submitManage() {
  manageDlg.saving = true;
  const a = await request.put(`/dealer/${manageDlg.id}/tier`, { tier: manageDlg.tier });
  const b = await request.put(`/dealer/${manageDlg.id}/admission`, { admission_status: manageDlg.admission_status });
  manageDlg.saving = false;
  if (a.code === 200 && b.code === 200) { ElMessage.success('已保存'); manageDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error((a.code !== 200 ? a.msg : b.msg) || '保存失败');
}
async function submitApprove() {
  manageDlg.approving = true;
  const r = await request.put(`/dealer/${manageDlg.id}/approve`);
  manageDlg.approving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '审批通过'); manageDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '审批失败');
}

/* ---------- 考核 ---------- */
const assessDlg = reactive({
  visible: false, saving: false,
  form: { distributor_id: null, period: '', sales_amount: 0, task_rate: 0, credit_score: 0, channel_score: 0 },
});
function openAssess() {
  Object.assign(assessDlg.form, { distributor_id: null, period: '', sales_amount: 0, task_rate: 0, credit_score: 0, channel_score: 0 });
  assessDlg.visible = true;
}
async function submitAssess() {
  if (!assessDlg.form.distributor_id || !assessDlg.form.period) { ElMessage.warning('经销商与考核周期必填'); return; }
  assessDlg.saving = true;
  const r = await request.post('/dealer/assessments', assessDlg.form);
  assessDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(`考核已录入：${r.data.grade}（${r.data.total_score} 分，${r.data.suggestion}）`);
    assessDlg.visible = false;
    loadAssessments();
  } else ElMessage.error(r.msg || '录入失败');
}

/* ---------- 详情 ---------- */
function openDetail(row) {
  const lines = [
    ['经销商编号', row.code], ['名称', row.name], ['大区', row.region], ['身份', row.identity],
    ['层级', row.tier], ['准入状态', row.admission_status], ['档案状态', row.status],
    ['联系人', row.contact_name], ['联系电话', row.contact_phone], ['经营许可证', row.license_no],
    ['信用额度(万)', row.credit_limit], ['已用额度(万)', row.credit_used], ['授权产品线数', row.pl_count],
  ];
  import('element-plus').then(({ ElMessageBox }) => {
    ElMessageBox.alert(
      lines.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0"><span style="color:#909399">${k}</span><b>${v || '—'}</b></div>`).join(''),
      '经销商详情', { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
    );
  });
}
</script>

<style scoped>
.dealer { padding: 20px; }
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
