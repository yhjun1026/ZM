<template>
  <div class="archive">
    <div class="page-header">
      <h2>资料档案中心</h2>
      <p>市场部统一录入 → 资料审批准入 → 生效入档案库 → 归档文件登记 → 变更/续期走档案变更审批 → 借阅留痕</p>
    </div>

    <!-- KPI -->
    <div class="kpi-grid" v-if="summary">
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

    <el-tabs v-model="tab" @tab-change="onTab">
      <!-- ===== 五类资料统一查看 ===== -->
      <el-tab-pane label="档案总览" name="directory">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="dirType" style="width:130px" @change="loadDirectory">
              <el-option v-for="t in meta.types" :key="t.key" :label="t.name" :value="t.key" />
            </el-select>
            <el-input v-model="dirKeyword" placeholder="搜索名称/联系人/品类" style="width:240px" clearable @change="loadDirectory" />
          </div>
          <div style="display:flex;gap:8px;">
            <el-button v-if="dirType === 'factory'" type="primary" @click="openFactory">
              <el-icon style="margin-right:4px"><Plus /></el-icon>录入厂家
            </el-button>
            <el-button v-if="dirType === 'channel'" type="primary" @click="openChannel">
              <el-icon style="margin-right:4px"><Plus /></el-icon>录入渠道
            </el-button>
            <el-button @click="openPending">待归档登记</el-button>
          </div>
        </div>
        <el-table :data="dirRows" stripe size="small" v-loading="loading">
          <el-table-column prop="name" label="单位名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="code" label="编码" width="110" v-if="dirType !== 'customer' && dirType !== 'supplier'" />
          <el-table-column prop="type" label="类型" width="110" v-if="['factory', 'channel'].includes(dirType)" />
          <el-table-column prop="category" label="品类" width="120" show-overflow-tooltip v-if="['factory', 'supplier'].includes(dirType)" />
          <el-table-column prop="level" label="等级" width="90" v-if="['customer', 'supplier'].includes(dirType)" />
          <el-table-column prop="tier" label="层级" width="90" v-if="dirType === 'distributor'" />
          <el-table-column prop="region" label="区域" width="110" v-if="['channel', 'distributor'].includes(dirType)" />
          <el-table-column label="联系人" width="110">
            <template #default="{ row }">{{ row.contact_name || row.contact || '—' }}</template>
          </el-table-column>
          <el-table-column label="联系电话" width="130">
            <template #default="{ row }">{{ row.contact_phone || row.phone || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag size="small" :type="row.status === '有效' || row.status === '启用' ? 'success' : 'info'">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="归档文件" width="90" align="right">
            <template #default="{ row }">{{ row.file_count }}</template>
          </el-table-column>
          <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openFiles(row)">归档文件</el-button>
              <el-button size="small" type="primary" @click="openChange(row)">变更/续期</el-button>
              <el-button size="small" v-if="['factory', 'channel'].includes(dirType) && ['草稿', '已驳回'].includes(row.status)" @click="openAdmit(row)">准入审批</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无档案数据</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ===== 待归档 / 变更单 ===== -->
      <el-tab-pane label="待归档与变更" name="pending">
        <el-table :data="pendings" stripe size="small" v-loading="loading">
          <el-table-column prop="pend_no" label="变更单号" width="160" />
          <el-table-column label="档案类型" width="90">
            <template #default="{ row }">{{ row.type_name }}</template>
          </el-table-column>
          <el-table-column prop="unit_name" label="单位名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="变更类型" width="90">
            <template #default="{ row }"><el-tag size="small">{{ row.change_type }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="reason" label="变更事由" min-width="160" show-overflow-tooltip />
          <el-table-column label="变更字段" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ Object.keys(row.payload || {}).join('、') || '—' }}</template>
          </el-table-column>
          <el-table-column prop="approval_no" label="审批单" width="150" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="pendType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" v-if="row.status === '待审批'" @click="approvePending(row, '通过')">通过</el-button>
              <el-button size="small" v-if="row.status === '待审批'" @click="approvePending(row, '驳回')">驳回</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无待归档 / 变更单</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ===== 借阅留痕 ===== -->
      <el-tab-pane label="借阅留痕" name="borrow">
        <div class="tab-toolbar">
          <el-select v-model="borrowStatus" placeholder="全部状态" style="width:130px" clearable @change="loadBorrows">
            <el-option label="借阅中" value="借阅中" />
            <el-option label="已归还" value="已归还" />
          </el-select>
        </div>
        <el-table :data="borrows" stripe size="small" v-loading="loading">
          <el-table-column prop="file_name" label="文件名称" min-width="200" show-overflow-tooltip />
          <el-table-column label="档案类型" width="90">
            <template #default="{ row }">{{ typeNames[row.data_type] || row.data_type }}</template>
          </el-table-column>
          <el-table-column prop="borrower_name" label="借阅人" width="100" />
          <el-table-column prop="borrower_dept" label="部门" width="100" />
          <el-table-column prop="borrow_date" label="借阅日" width="120" />
          <el-table-column label="应归还" width="120">
            <template #default="{ row }">{{ row.expected_return || '—' }}</template>
          </el-table-column>
          <el-table-column label="实际归还" width="120">
            <template #default="{ row }">{{ row.actual_return || '—' }}</template>
          </el-table-column>
          <el-table-column prop="purpose" label="借阅用途" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag size="small" :type="row.status === '已归还' ? 'success' : 'warning'">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" v-if="row.status === '借阅中'" @click="returnBorrow(row)">归还</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无借阅记录</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 录入厂家 -->
    <el-dialog v-model="facDlg.visible" title="厂家资料录入（审批通过后进入档案中心）" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="厂家名称" required><el-input v-model="facDlg.form.name" /></el-form-item>
        <el-form-item label="厂家类型">
          <el-select v-model="facDlg.form.type" style="width:100%">
            <el-option v-for="t in meta.fact_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="厂家身份">
          <el-select v-model="facDlg.form.identity" style="width:100%">
            <el-option v-for="t in meta.fact_identities" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="经营品类"><el-input v-model="facDlg.form.category" /></el-form-item>
        <el-form-item label="产品范围"><el-input v-model="facDlg.form.product_spec" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="facDlg.form.contact_name" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="facDlg.form.contact_phone" /></el-form-item>
        <el-form-item label="许可证号"><el-input v-model="facDlg.form.license_no" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="facDlg.form.address" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="facDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="facDlg.saving" @click="submitFactory">提交准入</el-button>
      </template>
    </el-dialog>

    <!-- 录入渠道 -->
    <el-dialog v-model="chanDlg.visible" title="渠道资料录入（审批通过后进入档案中心）" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="渠道名称" required><el-input v-model="chanDlg.form.name" /></el-form-item>
        <el-form-item label="渠道类型">
          <el-select v-model="chanDlg.form.type" style="width:100%">
            <el-option v-for="t in meta.chan_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="覆盖区域"><el-input v-model="chanDlg.form.region" /></el-form-item>
        <el-form-item label="产品范围"><el-input v-model="chanDlg.form.product_spec" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="chanDlg.form.contact_name" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="chanDlg.form.contact_phone" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="chanDlg.form.address" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chanDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="chanDlg.saving" @click="submitChannel">提交准入</el-button>
      </template>
    </el-dialog>

    <!-- 归档文件 -->
    <el-dialog v-model="fileDlg.visible" :title="'归档文件 · ' + fileDlg.unitName" width="760px">
      <el-form label-width="90px" size="small">
        <el-form-item label="文件名称" required><el-input v-model="fileDlg.form.file_name" placeholder="如：营业执照.pdf" /></el-form-item>
        <el-form-item label="文件路径">
          <el-input v-model="fileDlg.form.file_path" placeholder="/uploads/archive_files/xxx.pdf（也可上传 PDF 原件）" />
        </el-form-item>
        <el-form-item label="PDF 原件">
          <input type="file" accept="application/pdf" @change="onPickFile" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="fileDlg.form.remark" /></el-form-item>
      </el-form>
      <el-button size="small" type="primary" :loading="fileDlg.saving" @click="submitFile" style="margin-bottom:12px;">登记归档</el-button>
      <el-table :data="fileDlg.rows" stripe size="small" max-height="280">
        <el-table-column prop="file_name" label="文件名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="uploader_name" label="登记人" width="100" />
        <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag size="small" :type="row.status === '有效' ? 'success' : 'warning'">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="时间" width="140">
          <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="borrowRow(row)">借阅</el-button>
            <el-button size="small" type="danger" @click="delFile(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty><span class="muted">暂无归档文件</span></template>
      </el-table>
    </el-dialog>

    <!-- 变更 / 续期 -->
    <el-dialog v-model="chgDlg.visible" :title="'档案变更 · ' + chgDlg.unitName" width="520px">
      <el-form label-width="110px" size="small">
        <el-form-item label="变更类型">
          <el-select v-model="chgDlg.form.change_type" style="width:100%">
            <el-option v-for="t in meta.change_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更事由" required>
          <el-input v-model="chgDlg.form.reason" type="textarea" :rows="2" placeholder="说明变更/续期原因" />
        </el-form-item>
        <el-form-item label="变更字段">
          <el-input v-model="chgDlg.form.field_name" placeholder="如：contact_name（留空则只登记事由）" />
        </el-form-item>
        <el-form-item label="新值">
          <el-input v-model="chgDlg.form.field_value" placeholder="字段新值" />
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:4px 0 0;">
        提交后进入档案变更审批（市场部负责人 → 副总 → 总经理），通过后写入档案中心。
      </p>
      <template #footer>
        <el-button @click="chgDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="chgDlg.saving" @click="submitChange">提交变更</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Files, OfficeBuilding, Shop, Document, Clock, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('directory');
const loading = ref(false);
const summary = ref(null);
const meta = reactive({ types: [], type_names: {}, fact_types: [], fact_identities: [], chan_types: [], change_types: [] });
const typeNames = computed(() => meta.type_names || {});

const dirType = ref('customer');
const dirKeyword = ref('');
const dirRows = ref([]);
const pendings = ref([]);
const borrows = ref([]);
const borrowStatus = ref('');

const kpis = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return [
    { title: '客户档案', value: s.customers, sub: '客户资料库', icon: OfficeBuilding, color: '#2563eb' },
    { title: '厂家档案', value: s.factories, sub: '厂家资料库', icon: Shop, color: '#10b981' },
    { title: '供应商/渠道', value: s.suppliers + s.channels, sub: `供应商 ${s.suppliers} · 渠道 ${s.channels}`, icon: Files, color: '#f59e0b' },
    { title: '经销商档案', value: s.distributors, sub: '渠道经销商', icon: Document, color: '#8b5cf6' },
    { title: '待归档/待准入', value: s.pending_changes + s.pending_admission, sub: `归档文件 ${s.files} 份`, icon: Clock, color: '#ef4444' },
  ];
});
function pendType(s) {
  const map = { 待审批: 'warning', 已通过: 'success', 已驳回: 'danger' };
  return map[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/archive/meta');
  if (r.code === 200) Object.assign(meta, r.data);
}
async function loadSummary() {
  const r = await request.get('/archive/summary');
  if (r.code === 200) summary.value = r.data;
}
async function loadDirectory() {
  loading.value = true;
  try {
    const r = await request.get('/archive/directory', { params: { type: dirType.value, q: dirKeyword.value } });
    dirRows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadPendings() {
  loading.value = true;
  try {
    const r = await request.get('/archive/pendings');
    pendings.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadBorrows() {
  loading.value = true;
  try {
    const params = {};
    if (borrowStatus.value) params.status = borrowStatus.value;
    const r = await request.get('/archive/borrows', { params });
    borrows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
function onTab(name) {
  if (name === 'directory') loadDirectory();
  if (name === 'pending') loadPendings();
  if (name === 'borrow') loadBorrows();
}
onMounted(async () => {
  await loadMeta();
  await loadSummary();
  await loadDirectory();
});

/* ---------- 厂家 / 渠道录入 ---------- */
const facDlg = reactive({
  visible: false, saving: false,
  form: { name: '', type: '设备厂家', identity: '品牌厂家', category: '', product_spec: '', contact_name: '', contact_phone: '', license_no: '', address: '' },
});
function openFactory() {
  Object.assign(facDlg.form, { name: '', type: '设备厂家', identity: '品牌厂家', category: '', product_spec: '', contact_name: '', contact_phone: '', license_no: '', address: '' });
  facDlg.visible = true;
}
async function submitFactory() {
  if (!facDlg.form.name) { ElMessage.warning('厂家名称必填'); return; }
  facDlg.saving = true;
  const r = await request.post('/archive/factories', facDlg.form);
  facDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); facDlg.visible = false; loadDirectory(); loadSummary(); }
  else ElMessage.error(r.msg || '提交失败');
}

const chanDlg = reactive({
  visible: false, saving: false,
  form: { name: '', type: '区域代理', region: '', product_spec: '', contact_name: '', contact_phone: '', address: '' },
});
function openChannel() {
  Object.assign(chanDlg.form, { name: '', type: '区域代理', region: '', product_spec: '', contact_name: '', contact_phone: '', address: '' });
  chanDlg.visible = true;
}
async function submitChannel() {
  if (!chanDlg.form.name) { ElMessage.warning('渠道名称必填'); return; }
  chanDlg.saving = true;
  const r = await request.post('/archive/channels', chanDlg.form);
  chanDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); chanDlg.visible = false; loadDirectory(); loadSummary(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 归档文件 ---------- */
const fileDlg = reactive({
  visible: false, saving: false, unitName: '', data_type: '', ref_id: null, rows: [],
  form: { file_name: '', file_path: '', remark: '', file_base64: '' },
});
async function openFiles(row) {
  fileDlg.unitName = row.name;
  fileDlg.data_type = dirType.value;
  fileDlg.ref_id = row.id;
  Object.assign(fileDlg.form, { file_name: '', file_path: '', remark: '', file_base64: '' });
  fileDlg.visible = true;
  await loadFiles();
}
async function loadFiles() {
  const r = await request.get('/archive/files', { params: { data_type: fileDlg.data_type, ref_id: fileDlg.ref_id } });
  fileDlg.rows = r.code === 200 ? r.data || [] : [];
}
function onPickFile(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    fileDlg.form.file_base64 = String(reader.result);
    if (!fileDlg.form.file_name) fileDlg.form.file_name = f.name;
  };
  reader.readAsDataURL(f);
}
async function submitFile() {
  if (!fileDlg.form.file_name) { ElMessage.warning('文件名称必填'); return; }
  if (!fileDlg.form.file_path && !fileDlg.form.file_base64) { ElMessage.warning('请填写文件路径或上传 PDF 原件'); return; }
  fileDlg.saving = true;
  const r = await request.post('/archive/files', { ...fileDlg.form, data_type: fileDlg.data_type, ref_id: fileDlg.ref_id });
  fileDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已登记');
    Object.assign(fileDlg.form, { file_name: '', file_path: '', remark: '', file_base64: '' });
    await loadFiles(); loadSummary(); loadDirectory();
  } else ElMessage.error(r.msg || '登记失败');
}
async function delFile(row) {
  await ElMessageBox.confirm(`确认删除归档文件「${row.file_name}」？`, '提示', { type: 'warning' });
  const r = await request.delete(`/archive/files/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); await loadFiles(); loadSummary(); }
  else ElMessage.error(r.msg || '删除失败');
}

/* ---------- 借阅 ---------- */
async function borrowRow(row) {
  const { value } = await ElMessageBox.prompt('借阅用途（必填，全程留痕）', '借阅登记', { inputPattern: /\S+/, inputErrorMessage: '用途不能为空' });
  const r = await request.post('/archive/borrows', { file_id: row.id, purpose: value });
  if (r.code === 200) { ElMessage.success(r.msg || '借阅已登记'); loadSummary(); }
  else ElMessage.error(r.msg || '借阅失败');
}
async function returnBorrow(row) {
  const r = await request.post(`/archive/borrows/${row.id}/return`);
  if (r.code === 200) { ElMessage.success(r.msg || '归还已登记'); loadBorrows(); loadSummary(); }
  else ElMessage.error(r.msg || '归还失败');
}

/* ---------- 变更 / 续期 ---------- */
const chgDlg = reactive({
  visible: false, saving: false, unitName: '', data_type: '', ref_id: null,
  form: { change_type: '修改', reason: '', field_name: '', field_value: '' },
});
function openChange(row) {
  chgDlg.unitName = row.name;
  chgDlg.data_type = dirType.value;
  chgDlg.ref_id = row.id;
  Object.assign(chgDlg.form, { change_type: '修改', reason: '', field_name: '', field_value: '' });
  chgDlg.visible = true;
}
function openPending() {
  tab.value = 'pending';
  loadPendings();
}
async function submitChange() {
  if (!chgDlg.form.reason) { ElMessage.warning('变更事由必填'); return; }
  const fields = {};
  if (chgDlg.form.field_name) fields[chgDlg.form.field_name] = chgDlg.form.field_value;
  chgDlg.saving = true;
  const r = await request.post('/archive/pendings', {
    data_type: chgDlg.data_type, ref_id: chgDlg.ref_id, unit_name: chgDlg.unitName,
    change_type: chgDlg.form.change_type, reason: chgDlg.form.reason, fields,
  });
  chgDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); chgDlg.visible = false; loadPendings(); loadSummary(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function approvePending(row, result) {
  const r = await request.post(`/archive/pendings/${row.id}/approve`, { result });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadPendings(); loadSummary(); loadDirectory(); }
  else ElMessage.error(r.msg || '处理失败');
}
async function openAdmit(row) {
  const r = await request.post('/archive/admissions/approve', { data_type: dirType.value, ref_id: row.id, result: '通过' });
  if (r.code === 200) { ElMessage.success(r.msg || '已生效'); loadDirectory(); loadSummary(); }
  else ElMessage.error(r.msg || '处理失败');
}
</script>

<style scoped>
.archive { padding: 20px; }
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
