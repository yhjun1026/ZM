<template>
  <div class="seal">
    <div class="page-header">
      <h2>印章管理</h2>
      <p>印章登记 → 用印申请 → 用印审批 → 登记用印（借出） → 归还入柜 → 台账留痕</p>
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

    <el-tabs v-model="tab">
      <!-- ============ 印章登记 ============ -->
      <el-tab-pane label="印章登记" name="seals">
        <div class="tab-toolbar">
          <span class="muted">印章由行政人事部统一登记与保管，停用前须无在途用印申请。</span>
          <el-button type="primary" @click="openSealCreate">
            <el-icon style="margin-right:4px"><Plus /></el-icon>登记印章
          </el-button>
        </div>
        <el-table :data="sealRows" stripe size="small" v-loading="loading">
          <el-table-column prop="seal_no" label="印章编号" width="110" />
          <el-table-column prop="name" label="印章名称" width="120" />
          <el-table-column prop="keeper_name" label="保管人" width="100" />
          <el-table-column prop="location" label="存放位置" width="150" show-overflow-tooltip />
          <el-table-column label="用印次数" width="100" align="center">
            <template #default="{ row }">{{ row.app_count || 0 }}</template>
          </el-table-column>
          <el-table-column label="在用" width="80" align="center">
            <template #default="{ row }">{{ row.using_count || 0 }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="sealStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openSealEdit(row)">维护</el-button>
              <el-button size="small" @click="applySeal(row)">申请用印</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无印章，点击「登记印章」新增</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 用印申请 ============ -->
      <el-tab-pane label="用印申请" name="apps">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="appFilter.status" placeholder="全部状态" style="width:130px" clearable @change="loadApps">
              <el-option v-for="s in meta.app_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select v-model="appFilter.seal_id" placeholder="全部印章" style="width:140px" clearable @change="loadApps">
              <el-option v-for="s in sealRows" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
          <el-button type="primary" @click="openAppCreate">
            <el-icon style="margin-right:4px"><Plus /></el-icon>用印申请
          </el-button>
        </div>
        <el-table :data="appRows" stripe size="small" v-loading="appLoading">
          <el-table-column prop="app_no" label="申请单号" width="150" />
          <el-table-column prop="seal_name" label="印章" width="100" />
          <el-table-column prop="emp_name" label="申请人" width="90" />
          <el-table-column prop="dept_name" label="部门" width="110" show-overflow-tooltip />
          <el-table-column prop="purpose" label="用印事由" min-width="180" show-overflow-tooltip />
          <el-table-column prop="file_desc" label="用印文件" min-width="150" show-overflow-tooltip />
          <el-table-column label="份数" width="70" align="center">
            <template #default="{ row }">{{ row.copies || 1 }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="appStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="用印时间" width="140">
            <template #default="{ row }">{{ (row.used_at || '—').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="260" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '审批中'" size="small" type="success" @click="auditApp(row, 'approve')">通过</el-button>
              <el-button v-if="row.status === '审批中'" size="small" type="danger" plain @click="auditApp(row, 'reject')">驳回</el-button>
              <el-button v-if="row.status === '通过' && !row.used_at" size="small" type="primary" @click="markUsed(row)">登记用印</el-button>
              <el-button v-if="row.status === '通过' && row.used_at" size="small" @click="markReturn(row)">归还</el-button>
              <el-button v-if="row.status === '审批中'" size="small" plain @click="cancelApp(row)">撤销</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无用印申请，点击「用印申请」发起</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 打印下载留痕 ============ -->
      <el-tab-pane label="打印下载留痕" name="prints">
        <div class="tab-toolbar">
          <span class="muted">用印文件打印/下载须经审批，通过后发放一次性令牌（24 小时有效）并留痕使用次数。</span>
          <el-button type="primary" @click="openPrintCreate">
            <el-icon style="margin-right:4px"><Plus /></el-icon>打印申请
          </el-button>
        </div>
        <el-table :data="printRows" stripe size="small" v-loading="printLoading">
          <el-table-column prop="req_no" label="申请单号" width="160" />
          <el-table-column prop="biz_name" label="对象" min-width="160" show-overflow-tooltip />
          <el-table-column prop="purpose" label="用途说明" min-width="180" show-overflow-tooltip />
          <el-table-column prop="applicant_name" label="申请人" width="90" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.status === '通过' ? 'success' : row.status === '驳回' ? 'danger' : 'warning'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="token" label="令牌" width="150" show-overflow-tooltip />
          <el-table-column label="使用次数" width="90" align="center">
            <template #default="{ row }">{{ row.used_count || 0 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待审批'" size="small" type="success" @click="auditPrint(row, 'approve')">通过</el-button>
              <el-button v-if="row.status === '待审批'" size="small" type="danger" plain @click="auditPrint(row, 'reject')">驳回</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无打印/下载申请</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 登记/维护印章 -->
    <el-dialog v-model="sealDlg.visible" :title="sealDlg.id ? '维护印章 · ' + sealDlg.name : '登记印章'" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="印章名称" required>
          <el-select v-model="sealDlg.form.name" style="width:100%" :disabled="!!sealDlg.id" placeholder="选择印章类型">
            <el-option v-for="t in meta.seal_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="保管人">
          <el-select v-model="sealDlg.form.keeper_id" filterable clearable style="width:100%">
            <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="存放位置">
          <el-input v-model="sealDlg.form.location" placeholder="默认行政人事部" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="sealDlg.form.status" style="width:100%">
            <el-option v-for="s in meta.seal_status" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sealDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="sealDlg.saving" @click="submitSeal">提交</el-button>
      </template>
    </el-dialog>

    <!-- 用印申请 -->
    <el-dialog v-model="appDlg.visible" title="用印申请" width="560px">
      <el-form label-width="100px" size="small">
        <el-form-item label="印章" required>
          <el-select v-model="appDlg.form.seal_id" style="width:100%" placeholder="选择印章">
            <el-option v-for="s in sealRows" :key="s.id" :label="`${s.name}（${s.status}）`" :value="s.id" :disabled="s.status === '停用'" />
          </el-select>
        </el-form-item>
        <el-form-item label="用印事由" required>
          <el-input v-model="appDlg.form.purpose" type="textarea" :rows="2" placeholder="如：与客户签订年度框架合同" />
        </el-form-item>
        <el-form-item label="用印文件">
          <el-input v-model="appDlg.form.file_desc" placeholder="文件名称与相对方，如：XX医院采购合同（XX公司）" />
        </el-form-item>
        <el-form-item label="份数">
          <el-input-number v-model="appDlg.form.copies" :min="1" :max="999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="appDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="appDlg.saving" @click="submitApp">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 打印/下载申请 -->
    <el-dialog v-model="printDlg.visible" title="打印/下载申请" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="关联对象" required>
          <el-select v-model="printDlg.form.biz_id" filterable style="width:100%" placeholder="选择用印申请">
            <el-option v-for="a in appRows" :key="a.id" :label="`${a.app_no} ${a.seal_name}`" :value="String(a.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="用途说明" required>
          <el-input v-model="printDlg.form.purpose" type="textarea" :rows="2" placeholder="如：归档留存 / 提供给客户" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="printDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="printDlg.saving" @click="submitPrint">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Stamp, Clock, Checked, Document, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('seals');
const meta = ref({ seal_types: [], seal_status: [], app_status: [], is_admin: false });
const stats = ref(null);
const sealRows = ref([]);
const appRows = ref([]);
const printRows = ref([]);
const employees = ref([]);
const loading = ref(false);
const appLoading = ref(false);
const printLoading = ref(false);
const appFilter = reactive({ status: '', seal_id: '' });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const using = s.by_status?.find((x) => x.status === '在用')?.count ?? 0;
  const pending = s.by_app_status?.find((x) => x.status === '审批中')?.count ?? 0;
  const returned = s.by_app_status?.find((x) => x.status === '已归还')?.count ?? 0;
  return [
    { title: '印章总数', value: s.seal_total, sub: `在库 ${s.by_status?.find((x) => x.status === '在库')?.count ?? 0} 枚`, icon: Stamp, color: '#2563eb' },
    { title: '在用印章', value: using, sub: `待归还 ${s.by_app_status?.find((x) => x.status === '通过')?.count ?? 0} 笔`, icon: Clock, color: '#f59e0b' },
    { title: '待审批用印', value: pending, sub: `已归还 ${returned} 笔`, icon: Document, color: '#8b5cf6' },
    { title: '本月用印份数', value: s.month_copies, sub: `累计 ${s.total_copies} 份`, icon: Checked, color: '#10b981' },
  ];
});

function sealStatusType(s) { return { 在库: 'info', 在用: 'warning', 停用: 'danger' }[s] || 'info'; }
function appStatusType(s) {
  return { 审批中: 'warning', 通过: 'success', 驳回: 'danger', 已撤销: 'info', 已归还: 'info' }[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/seal/meta');
  if (r.code === 200) meta.value = r.data || meta.value;
}
async function loadStats() {
  const r = await request.get('/seal/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadSeals() {
  loading.value = true;
  try {
    const r = await request.get('/seal');
    sealRows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadApps() {
  appLoading.value = true;
  try {
    const params = {};
    ['status', 'seal_id'].forEach((k) => { if (appFilter[k]) params[k] = appFilter[k]; });
    const r = await request.get('/seal/applications', { params });
    appRows.value = r.code === 200 ? r.data || [] : [];
  } finally { appLoading.value = false; }
}
async function loadPrints() {
  printLoading.value = true;
  try {
    const r = await request.get('/seal/prints');
    printRows.value = r.code === 200 ? r.data || [] : [];
  } finally { printLoading.value = false; }
}
async function loadEmployees() {
  const r = await request.get('/directory');
  if (r.code === 200) employees.value = (r.data || []).map((e) => ({ id: e.id, name: e.name }));
}
onMounted(async () => {
  await loadMeta();
  await Promise.all([loadStats(), loadSeals(), loadApps(), loadPrints(), loadEmployees()]);
});

function refreshAll() { loadStats(); loadSeals(); loadApps(); loadPrints(); }

/* ---------- 印章 ---------- */
const sealDlg = reactive({
  visible: false, saving: false, id: null, name: '',
  form: { name: '公章', keeper_id: null, location: '行政人事部', status: '在库' },
});
function openSealCreate() {
  sealDlg.id = null; sealDlg.name = '';
  sealDlg.form = { name: '公章', keeper_id: null, location: '行政人事部', status: '在库' };
  sealDlg.visible = true;
}
function openSealEdit(row) {
  sealDlg.id = row.id; sealDlg.name = row.name;
  sealDlg.form = { name: row.name, keeper_id: row.keeper_id || null, location: row.location || '', status: row.status };
  sealDlg.visible = true;
}
async function submitSeal() {
  sealDlg.saving = true;
  const r = sealDlg.id
    ? await request.put(`/seal/${sealDlg.id}`, sealDlg.form)
    : await request.post('/seal', sealDlg.form);
  sealDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); sealDlg.visible = false; refreshAll(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------- 用印申请 ---------- */
const appDlg = reactive({ visible: false, saving: false, form: { seal_id: null, purpose: '', file_desc: '', copies: 1 } });
function openAppCreate() {
  appDlg.form = { seal_id: null, purpose: '', file_desc: '', copies: 1 };
  appDlg.visible = true;
}
function applySeal(row) {
  tab.value = 'apps';
  openAppCreate();
  appDlg.form.seal_id = row.id;
}
async function submitApp() {
  if (!appDlg.form.seal_id || !appDlg.form.purpose) { ElMessage.warning('印章与用印事由必填'); return; }
  appDlg.saving = true;
  const r = await request.post('/seal/applications', appDlg.form);
  appDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); appDlg.visible = false; refreshAll(); }
  else ElMessage.error(r.msg || '提交失败');
}

async function auditApp(row, act) {
  try {
    await ElMessageBox.confirm(`确认${act === 'approve' ? '通过' : '驳回'}用印申请 ${row.app_no}？`, '审批确认', { type: 'warning' });
  } catch (e) { return; }
  const r = await request.put(`/seal/applications/${row.id}`, { action: act });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); refreshAll(); }
  else ElMessage.error(r.msg || '处理失败');
}
async function markUsed(row) {
  const r = await request.put(`/seal/applications/${row.id}`, { action: 'used' });
  if (r.code === 200) { ElMessage.success('用印已登记，印章置为在用'); refreshAll(); }
  else ElMessage.error(r.msg || '登记失败');
}
async function markReturn(row) {
  const r = await request.put(`/seal/applications/${row.id}`, { action: 'return' });
  if (r.code === 200) { ElMessage.success('印章已归还'); refreshAll(); }
  else ElMessage.error(r.msg || '归还失败');
}
async function cancelApp(row) {
  try { await ElMessageBox.confirm(`确认撤销用印申请 ${row.app_no}？`, '撤销确认', { type: 'warning' }); }
  catch (e) { return; }
  const r = await request.put(`/seal/applications/${row.id}`, { action: 'cancel' });
  if (r.code === 200) { ElMessage.success('已撤销'); refreshAll(); }
  else ElMessage.error(r.msg || '撤销失败');
}

/* ---------- 打印下载 ---------- */
const printDlg = reactive({ visible: false, saving: false, form: { biz_id: '', purpose: '' } });
function openPrintCreate() {
  printDlg.form = { biz_id: '', purpose: '' };
  printDlg.visible = true;
}
async function submitPrint() {
  if (!printDlg.form.biz_id || !printDlg.form.purpose) { ElMessage.warning('关联对象与用途说明必填'); return; }
  printDlg.saving = true;
  const r = await request.post('/seal/prints', printDlg.form);
  printDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); printDlg.visible = false; refreshAll(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function auditPrint(row, act) {
  const r = await request.put(`/seal/prints/${row.id}`, { action: act });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); refreshAll(); }
  else ElMessage.error(r.msg || '处理失败');
}
</script>

<style scoped>
.seal { padding: 20px; }
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
