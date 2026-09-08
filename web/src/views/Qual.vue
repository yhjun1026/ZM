<template>
  <div class="qual">
    <div class="page-header">
      <h2>资质合规</h2>
      <p>证照登记 → 审批入册 → 到期预警（30/60/90 天）→ 续证办理 → 主体资质核验（经营范围比对）</p>
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
        <el-select v-model="filter.side" placeholder="全部归属" style="width:130px" clearable @change="loadList">
          <el-option v-for="s in sides" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select v-model="filter.category" placeholder="全部类型" style="width:180px" clearable @change="loadList">
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="filter.level" placeholder="全部预警级别" style="width:140px" clearable @change="loadList">
          <el-option v-for="l in levels" :key="l" :label="l" :value="l" />
        </el-select>
        <el-input v-model="filter.keyword" placeholder="搜索证照名称/证照号/发证机关" style="width:240px" clearable @change="loadList" />
      </div>
      <div style="display:flex;gap:8px;">
        <el-button @click="openVerify">
          <el-icon style="margin-right:4px"><CircleCheck /></el-icon>资质核验
        </el-button>
        <el-button @click="pushWarn" :loading="pushing">预警推送</el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon style="margin-right:4px"><Plus /></el-icon>证照登记
        </el-button>
      </div>
    </div>

    <!-- 列表 -->
    <el-table :data="rows" stripe size="small" v-loading="loading">
      <el-table-column prop="qual_no" label="资质编号" width="150" />
      <el-table-column prop="name" label="证照名称" min-width="160" show-overflow-tooltip />
      <el-table-column label="归属" width="110">
        <template #default="{ row }">{{ row.data_side }}</template>
      </el-table-column>
      <el-table-column prop="category" label="类型" width="150" show-overflow-tooltip />
      <el-table-column prop="cert_no" label="证照号" width="150" show-overflow-tooltip />
      <el-table-column prop="issuer" label="发证机关" width="140" show-overflow-tooltip />
      <el-table-column prop="owner_name" label="责任人" width="100" />
      <el-table-column label="有效期至" width="120">
        <template #default="{ row }">{{ row.expire_date || '—' }}</template>
      </el-table-column>
      <el-table-column label="剩余" width="90" align="right">
        <template #default="{ row }">
          <b v-if="row.days_left !== null">{{ row.days_left }} 天</b>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="预警" width="90">
        <template #default="{ row }"><el-tag :type="levelType(row.level)" size="small">{{ row.level }}</el-tag></template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openRenew(row)">续证</el-button>
          <el-button size="small" @click="openEdit(row)">维护</el-button>
          <el-button size="small" v-if="row.status === '审批中' || row.status === '续证中'" @click="openApprove(row)">审批</el-button>
          <el-button size="small" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无资质记录，点击右上角「证照登记」录入</span></template>
    </el-table>

    <!-- 续期待办 -->
    <div class="pending-block" v-if="renewals.length">
      <h3>续期待办（审批通过后更新到期日）</h3>
      <el-table :data="renewals" stripe size="small">
        <el-table-column prop="qual_no" label="资质编号" width="150" />
        <el-table-column prop="name" label="证照名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="现到期" width="120">
          <template #default="{ row }">{{ row.expire_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="续证后到期" width="130">
          <template #default="{ row }"><b>{{ row.new_expire_date }}</b></template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column label="审批单" width="150">
          <template #default="{ row }">{{ row.approval_no || '—' }}</template>
        </el-table-column>
        <el-table-column label="审批状态" width="100">
          <template #default="{ row }">{{ row.ap_status || '—' }}</template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 证照登记 -->
    <el-dialog v-model="createDlg.visible" title="证照登记" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="资料归属" required>
          <el-select v-model="createDlg.side" style="width:100%" @change="createDlg.form.category = ''">
            <el-option v-for="s in sides" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="证照类型" required>
          <el-select v-model="createDlg.form.category" style="width:100%">
            <el-option v-for="c in (sideCategories[createDlg.side] || [])" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="证照名称" required>
          <el-input v-model="createDlg.form.name" placeholder="如：医疗器械经营许可证" />
        </el-form-item>
        <el-form-item label="证照编号">
          <el-input v-model="createDlg.form.cert_no" placeholder="注册证号/许可证号" />
        </el-form-item>
        <el-form-item label="发证机关">
          <el-input v-model="createDlg.form.issuer" placeholder="如：重庆市药品监督管理局" />
        </el-form-item>
        <el-form-item label="发证日期">
          <el-date-picker v-model="createDlg.form.issue_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="有效期至" required>
          <el-date-picker v-model="createDlg.form.expire_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="预警提前(天)">
          <el-input-number v-model="createDlg.form.warn_days" :min="1" :max="365" style="width:100%" />
        </el-form-item>
        <el-form-item label="责任部门">
          <el-input v-model="createDlg.form.owner_dept" placeholder="默认 质量部" />
        </el-form-item>
        <el-form-item label="适用范围">
          <el-input v-model="createDlg.form.scope" placeholder="如：全国 / 某产品线" />
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:4px 0 0;">
        提交后进入审批链：市场部负责人 → 销售总监 → 质量负责人 → 副总 → 总经理，通过后入册生效。
      </p>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交登记</el-button>
      </template>
    </el-dialog>

    <!-- 续证 -->
    <el-dialog v-model="renewDlg.visible" title="资质续证" width="460px">
      <p class="muted" style="margin-bottom:12px;">
        {{ renewDlg.qualName }} · 现有效期至 {{ renewDlg.expireDate || '—' }}
      </p>
      <el-form label-width="110px" size="small">
        <el-form-item label="新到期日期" required>
          <el-date-picker v-model="renewDlg.form.expire_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="续证说明">
          <el-input v-model="renewDlg.form.renewal_note" type="textarea" :rows="2" placeholder="办理进展/备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renewDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="renewDlg.saving" @click="submitRenew">提交续证</el-button>
      </template>
    </el-dialog>

    <!-- 维护 -->
    <el-dialog v-model="editDlg.visible" title="维护资质信息" width="460px">
      <el-form label-width="110px" size="small">
        <el-form-item label="责任人">
          <el-input v-model="editDlg.form.owner_name" />
        </el-form-item>
        <el-form-item label="责任部门">
          <el-input v-model="editDlg.form.owner_dept" />
        </el-form-item>
        <el-form-item label="预警提前(天)">
          <el-input-number v-model="editDlg.form.warn_days" :min="1" :max="365" style="width:100%" />
        </el-form-item>
        <el-form-item label="适用范围">
          <el-input v-model="editDlg.form.scope" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="editDlg.saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 审批 -->
    <el-dialog v-model="apprDlg.visible" title="资质审批" width="440px">
      <p class="muted" style="margin-bottom:12px;">
        {{ apprDlg.qualName }} · 当前状态 <el-tag size="small">{{ apprDlg.status }}</el-tag>
      </p>
      <el-form-item label="审批意见">
        <el-input v-model="apprDlg.comment" type="textarea" :rows="2" placeholder="选填" />
      </el-form-item>
      <template #footer>
        <el-button @click="submitApprove('驳回')">驳回</el-button>
        <el-button type="primary" :loading="apprDlg.saving" @click="submitApprove('通过')">通过并生效</el-button>
      </template>
    </el-dialog>

    <!-- 主体资质核验 -->
    <el-dialog v-model="verifyDlg.visible" title="主体资质核验（经营范围比对）" width="720px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <el-select v-model="verifyDlg.dataType" style="width:130px">
          <el-option v-for="(n, t) in verifyTypes" :key="t" :label="n" :value="t" />
        </el-select>
        <el-input v-model="verifyDlg.scope" style="width:340px" placeholder="粘贴营业执照经营范围原文" />
        <el-button size="small" @click="previewVerify">试算</el-button>
      </div>
      <div v-if="verifyDlg.preview" class="preview-box">
        匹配状态：<el-tag size="small">{{ verifyDlg.preview.status }}</el-tag>
        覆盖率：<b>{{ verifyDlg.preview.coverage }}%</b>
        风险：<el-tag size="small" :type="verifyDlg.preview.risk === '高' ? 'danger' : 'warning'">{{ verifyDlg.preview.risk }}</el-tag>
        <div class="muted" style="margin-top:4px;">已覆盖：{{ (verifyDlg.preview.matched || []).join('、') || '—' }}</div>
        <div class="muted">未覆盖：{{ (verifyDlg.preview.missing || []).join('、') || '—' }}</div>
      </div>
      <el-table :data="verifyDlg.rows" stripe size="small" max-height="300" style="margin-top:12px;">
        <el-table-column prop="verify_no" label="核验单号" width="150" />
        <el-table-column prop="unit_name" label="主体" min-width="150" show-overflow-tooltip />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">{{ verifyTypes[row.data_type] || row.data_type }}</template>
        </el-table-column>
        <el-table-column label="覆盖率" width="90" align="right">
          <template #default="{ row }">{{ row.coverage }}%</template>
        </el-table-column>
        <el-table-column label="匹配状态" width="100">
          <template #default="{ row }"><el-tag size="small" :type="row.match_status === '完全匹配' ? 'success' : 'warning'">{{ row.match_status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="风险" width="70">
          <template #default="{ row }">{{ row.risk_level }}</template>
        </el-table-column>
        <el-table-column prop="verify_date" label="核验日" width="110" />
        <template #empty><span class="muted">暂无核验记录</span></template>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Document, WarningFilled, Clock, CircleClose, CircleCheck, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const rows = ref([]);
const stats = ref(null);
const renewals = ref([]);
const loading = ref(false);
const pushing = ref(false);
const filter = reactive({ side: '', category: '', level: '', keyword: '' });

const sides = ref([]);
const sideCategories = ref({});
const levels = ref(['已过期', '紧急', '预警', '正常']);
const verifyTypes = ref({ supplier: '供应商', factory: '厂家', channel: '渠道商', distributor: '经销商' });

const categories = computed(() => {
  if (!filter.side) return Object.values(sideCategories.value).flat();
  return sideCategories.value[filter.side] || [];
});

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '在册资质', value: s.total, sub: `待审批 ${s.pending} · 续证中 ${s.renewing}`, icon: Document, color: '#2563eb' },
    { title: '有效', value: s.valid, sub: '无到期风险', icon: CircleCheck, color: '#10b981' },
    { title: '即将到期', value: s.expiring, sub: `30天内 ${s.windows ? s.windows.d30 : 0} · 60天内 ${s.windows ? s.windows.d60 : 0} · 90天内 ${s.windows ? s.windows.d90 : 0}`, icon: Clock, color: '#f59e0b' },
    { title: '已过期', value: s.expired, sub: '须立即办理续证', icon: WarningFilled, color: '#ef4444' },
    { title: '续证 / 待审', value: s.renewing + s.pending, sub: '审批通过后入册生效', icon: CircleClose, color: '#8b5cf6' },
  ];
});

function levelType(l) {
  const map = { 已过期: 'danger', 紧急: 'danger', 预警: 'warning', 正常: 'success' };
  return map[l] || 'info';
}
function statusType(s) {
  const map = { 有效: 'success', 审批中: 'warning', 续证中: 'warning', 驳回: 'danger' };
  return map[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/qual/meta');
  if (r.code === 200) {
    sides.value = r.data.sides || [];
    sideCategories.value = r.data.sideCategories || {};
    levels.value = r.data.levels || levels.value;
    verifyTypes.value = r.data.verify_types || verifyTypes.value;
  }
}
async function loadStats() {
  const r = await request.get('/qual/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadRenewals() {
  const r = await request.get('/qual/renewals');
  renewals.value = r.code === 200 ? r.data || [] : [];
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['side', 'category', 'level', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/qual', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally {
    loading.value = false;
  }
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); await loadRenewals(); });

/* ---------- 证照登记 ---------- */
const createDlg = reactive({
  visible: false, saving: false, side: '公司资质',
  form: { name: '', category: '', cert_no: '', issuer: '', issue_date: '', expire_date: '', warn_days: 90, owner_dept: '质量部', scope: '' },
});
function openCreate() {
  createDlg.side = '公司资质';
  Object.assign(createDlg.form, { name: '', category: '', cert_no: '', issuer: '', issue_date: '', expire_date: '', warn_days: 90, owner_dept: '质量部', scope: '' });
  createDlg.visible = true;
}
async function submitCreate() {
  if (!createDlg.form.name || !createDlg.form.category || !createDlg.form.expire_date) {
    ElMessage.warning('证照名称、类型、到期日期为必填项'); return;
  }
  createDlg.saving = true;
  const r = await request.post('/qual', { ...createDlg.form, data_side: createDlg.side });
  createDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交登记'); createDlg.visible = false; loadList(); loadStats(); loadRenewals(); }
  else ElMessage.error(r.msg || '登记失败');
}

/* ---------- 续证 ---------- */
const renewDlg = reactive({ visible: false, saving: false, id: null, qualName: '', expireDate: '', form: { expire_date: '', renewal_note: '' } });
function openRenew(row) {
  renewDlg.id = row.id;
  renewDlg.qualName = row.name;
  renewDlg.expireDate = row.expire_date;
  renewDlg.form.expire_date = '';
  renewDlg.form.renewal_note = '';
  renewDlg.visible = true;
}
async function submitRenew() {
  if (!renewDlg.form.expire_date) { ElMessage.warning('新到期日期为必填项'); return; }
  renewDlg.saving = true;
  const r = await request.post(`/qual/${renewDlg.id}/renew`, renewDlg.form);
  renewDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '续证已提交'); renewDlg.visible = false; loadList(); loadStats(); loadRenewals(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 维护 ---------- */
const editDlg = reactive({ visible: false, saving: false, id: null, form: { owner_name: '', owner_dept: '', warn_days: 90, scope: '' } });
function openEdit(row) {
  editDlg.id = row.id;
  Object.assign(editDlg.form, { owner_name: row.owner_name || '', owner_dept: row.owner_dept || '', warn_days: row.warn_days || 90, scope: row.scope || '' });
  editDlg.visible = true;
}
async function submitEdit() {
  editDlg.saving = true;
  const r = await request.put(`/qual/${editDlg.id}`, editDlg.form);
  editDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); editDlg.visible = false; loadList(); }
  else ElMessage.error(r.msg || '保存失败');
}

/* ---------- 审批 ---------- */
const apprDlg = reactive({ visible: false, saving: false, id: null, qualName: '', status: '', comment: '' });
function openApprove(row) {
  apprDlg.id = row.id;
  apprDlg.qualName = row.name;
  apprDlg.status = row.status;
  apprDlg.comment = '';
  apprDlg.visible = true;
}
async function submitApprove(result) {
  apprDlg.saving = true;
  const r = await request.post(`/qual/${apprDlg.id}/approve`, { result, comment: apprDlg.comment });
  apprDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); apprDlg.visible = false; loadList(); loadStats(); loadRenewals(); }
  else ElMessage.error(r.msg || '处理失败');
}

/* ---------- 预警推送 ---------- */
async function pushWarn() {
  pushing.value = true;
  const r = await request.post('/qual/warnings/push');
  pushing.value = false;
  if (r.code === 200) ElMessage.success(`已检查 ${r.data.checked} 条，发送 ${r.data.sent} 条预警`);
  else ElMessage.error(r.msg || '推送失败');
}

/* ---------- 核验 ---------- */
const verifyDlg = reactive({ visible: false, dataType: 'supplier', scope: '', preview: null, rows: [] });
async function openVerify() {
  verifyDlg.preview = null;
  verifyDlg.visible = true;
  const r = await request.get('/qual/verify');
  verifyDlg.rows = r.code === 200 ? (r.data.rows || []) : [];
}
async function previewVerify() {
  if (!verifyDlg.scope) { ElMessage.warning('请填写营业执照经营范围'); return; }
  const r = await request.post('/qual/verify/preview', { business_scope: verifyDlg.scope });
  if (r.code === 200) verifyDlg.preview = r.data;
  else ElMessage.error(r.msg || '试算失败');
}

/* ---------- 详情 ---------- */
function openDetail(row) {
  const lines = [
    ['资质编号', row.qual_no], ['证照名称', row.name], ['资料归属', row.data_side],
    ['类型', row.category], ['证照号', row.cert_no], ['发证机关', row.issuer],
    ['责任人', row.owner_name], ['责任部门', row.owner_dept],
    ['发证日期', row.issue_date], ['有效期至', row.expire_date],
    ['预警级别', `${row.level}${row.days_left !== null ? `（${row.days_left} 天）` : ''}`],
    ['状态', row.status], ['适用范围', row.scope], ['续证备注', row.renewal_note],
  ];
  import('element-plus').then(({ ElMessageBox }) => {
    ElMessageBox.alert(
      lines.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0"><span style="color:#909399">${k}</span><b>${v || '—'}</b></div>`).join(''),
      '资质详情', { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
    );
  });
}
</script>

<style scoped>
.qual { padding: 20px; }
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
.pending-block { margin-top: 24px; }
.pending-block h3 { font-size: 15px; margin: 0 0 10px; }
.preview-box { background: var(--el-fill-color-light); border-radius: 8px; padding: 10px 12px; font-size: 12px; }
</style>
