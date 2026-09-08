<template>
  <div class="orgchange">
    <div class="page-header">
      <h2>组织变更</h2>
      <p>变更申请（部门新增/合并/撤销、人员调整、权限调整…）→ 副总审批 → 总经理终审 → 通过后自动写回组织数据；驳回不生效</p>
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
        <el-select v-model="filter.status" placeholder="全部状态" style="width:120px" clearable @change="loadList">
          <el-option v-for="s in meta.statuses" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select v-model="filter.change_type" placeholder="全部类型" style="width:150px" clearable @change="loadList">
          <el-option v-for="t in meta.change_types" :key="t" :label="t" :value="t" />
        </el-select>
        <el-input v-model="filter.keyword" placeholder="搜索单号/标题" style="width:220px" clearable @change="loadList" />
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon style="margin-right:4px"><Plus /></el-icon>发起变更申请
      </el-button>
    </div>

    <el-table :data="rows" stripe size="small" v-loading="loading">
      <el-table-column prop="change_no" label="变更单号" width="160" />
      <el-table-column prop="change_type" label="类型" width="120" />
      <el-table-column prop="title" label="变更标题" min-width="200" show-overflow-tooltip />
      <el-table-column prop="summary" label="变更摘要" min-width="240" show-overflow-tooltip />
      <el-table-column prop="operator_name" label="发起人" width="100" />
      <el-table-column label="审批进度" width="130">
        <template #default="{ row }">
          <span v-if="row.status === '待审批'">
            <el-tag size="small" type="warning">{{ row.step_name || ('第 ' + row.current_step + ' 级') }}</el-tag>
            <span class="muted"> {{ row.current_step }}/{{ row.total_steps }}</span>
          </span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === '已通过' ? 'success' : (row.status === '已驳回' ? 'danger' : 'warning')">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="生效时间" width="150">
        <template #default="{ row }">{{ (row.applied_at || '').slice(0, 16) || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
          <el-button v-if="row.status === '待审批'" size="small" type="success" @click="approve(row, '通过')">审批</el-button>
          <el-button v-if="row.status === '待审批'" size="small" type="danger" @click="approve(row, '驳回')">驳回</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无组织变更申请，点击右上角「发起变更申请」</span></template>
    </el-table>

    <!-- 发起变更申请 -->
    <el-dialog v-model="dlg.visible" title="发起组织变更申请" width="640px">
      <el-form label-width="110px" size="small">
        <el-form-item label="变更类型" required>
          <el-select v-model="dlg.form.change_type" style="width:100%" @change="onTypeChange">
            <el-option v-for="t in meta.change_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>

        <!-- 新增单位/部门 -->
        <template v-if="['单位新增', '部门新增'].includes(dlg.form.change_type)">
          <el-form-item label="编码" required><el-input v-model="dlg.form.payload.code" placeholder="如 ZM-D1-008" /></el-form-item>
          <el-form-item label="名称" required><el-input v-model="dlg.form.payload.name" /></el-form-item>
          <el-form-item label="层级" v-if="dlg.form.change_type === '单位新增'">
            <el-select v-model="dlg.form.payload.type" style="width:100%">
              <el-option v-for="t in meta.unit_types" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <el-form-item label="上级单位">
            <el-select v-model="dlg.form.payload.parent_id" clearable filterable style="width:100%">
              <el-option v-for="u in units" :key="u.id" :label="u.name" :value="u.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="负责人">
            <el-select v-model="dlg.form.payload.manager_emp_id" clearable filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="e.name" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="编制人数"><el-input-number v-model="dlg.form.payload.headcount" :min="0" style="width:100%" /></el-form-item>
          <el-form-item label="区域"><el-input v-model="dlg.form.payload.region" /></el-form-item>
          <el-form-item label="职责"><el-input v-model="dlg.form.payload.func" type="textarea" :rows="2" /></el-form-item>
        </template>

        <!-- 调整单位/部门 -->
        <template v-else-if="['单位调整', '部门调整'].includes(dlg.form.change_type)">
          <el-form-item label="单位/部门" required>
            <el-select v-model="dlg.form.payload.unit_id" filterable style="width:100%">
              <el-option v-for="u in units" :key="u.id" :label="u.name" :value="u.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="新名称"><el-input v-model="dlg.form.payload.name" /></el-form-item>
          <el-form-item label="新职责"><el-input v-model="dlg.form.payload.func" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="新编制"><el-input-number v-model="dlg.form.payload.headcount" :min="0" style="width:100%" /></el-form-item>
          <el-form-item label="新负责人">
            <el-select v-model="dlg.form.payload.manager_emp_id" clearable filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="e.name" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="区域"><el-input v-model="dlg.form.payload.region" /></el-form-item>
        </template>

        <!-- 部门合并 -->
        <template v-else-if="dlg.form.change_type === '部门合并'">
          <el-form-item label="源部门" required>
            <el-select v-model="dlg.form.payload.src_unit_id" filterable style="width:100%">
              <el-option v-for="u in units" :key="u.id" :label="u.name" :value="u.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="并入部门" required>
            <el-select v-model="dlg.form.payload.dst_unit_id" filterable style="width:100%">
              <el-option v-for="u in units" :key="u.id" :label="u.name" :value="u.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="人员迁移">
            <el-switch v-model="dlg.form.payload.move_emp" active-text="在职人员同步迁移" />
          </el-form-item>
          <el-form-item label="原因"><el-input v-model="dlg.form.payload.reason" type="textarea" :rows="2" /></el-form-item>
        </template>

        <!-- 撤销/停用 -->
        <template v-else-if="['部门撤销', '单位停用'].includes(dlg.form.change_type)">
          <el-form-item label="单位/部门" required>
            <el-select v-model="dlg.form.payload.unit_id" filterable style="width:100%">
              <el-option v-for="u in units" :key="u.id" :label="u.name" :value="u.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="原因"><el-input v-model="dlg.form.payload.reason" type="textarea" :rows="2" placeholder="须先完成人员分流，否则校验不通过" /></el-form-item>
        </template>

        <!-- 人员调整 -->
        <template v-else-if="dlg.form.change_type === '人员调整'">
          <el-form-item label="员工" required>
            <el-select v-model="dlg.form.payload.emp_id" filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="新职位"><el-input v-model="dlg.form.payload.title" /></el-form-item>
          <el-form-item label="新角色">
            <el-select v-model="dlg.form.payload.role" clearable filterable style="width:100%">
              <el-option v-for="r in roles" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
          <el-form-item label="新部门">
            <el-select v-model="dlg.form.payload.org_id" clearable filterable style="width:100%">
              <el-option v-for="u in units" :key="u.id" :label="u.name" :value="u.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="新直属上级">
            <el-select v-model="dlg.form.payload.report1_id" clearable filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="e.name" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="新区域"><el-input v-model="dlg.form.payload.region" /></el-form-item>
        </template>

        <!-- 人员停用 -->
        <template v-else-if="dlg.form.change_type === '人员停用'">
          <el-form-item label="员工" required>
            <el-select v-model="dlg.form.payload.emp_id" filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="原因"><el-input v-model="dlg.form.payload.reason" type="textarea" :rows="2" /></el-form-item>
        </template>

        <!-- 权限调整 -->
        <template v-else-if="dlg.form.change_type === '权限调整'">
          <el-form-item label="员工" required>
            <el-select v-model="dlg.form.payload.emp_id" filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="模块" required>
            <el-select v-model="dlg.form.payload.module" filterable style="width:100%">
              <el-option v-for="m in meta.perm_modules || []" :key="m" :label="m" :value="m" />
            </el-select>
          </el-form-item>
          <el-form-item label="权限字段" required>
            <el-select v-model="dlg.form.payload.field" style="width:100%">
              <el-option v-for="f in meta.perm_fields || []" :key="f" :label="f" :value="f" />
            </el-select>
          </el-form-item>
          <el-form-item label="设为"><el-switch v-model="dlg.form.payload.value" active-text="允许" inactive-text="禁止" /></el-form-item>
        </template>

        <!-- 权限恢复 -->
        <template v-else-if="dlg.form.change_type === '权限恢复'">
          <el-form-item label="员工" required>
            <el-select v-model="dlg.form.payload.emp_id" filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="`${e.name}（${e.emp_no}）`" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="模块" required>
            <el-select v-model="dlg.form.payload.module" filterable style="width:100%">
              <el-option v-for="m in meta.perm_modules || []" :key="m" :label="m" :value="m" />
            </el-select>
          </el-form-item>
        </template>

        <!-- 区域负责人任命 -->
        <template v-else-if="dlg.form.change_type === '区域负责人任命'">
          <el-form-item label="销售区域" required>
            <el-select v-model="dlg.form.payload.region_id" filterable style="width:100%">
              <el-option v-for="r in regions" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="负责人" required>
            <el-select v-model="dlg.form.payload.emp_id" filterable style="width:100%">
              <el-option v-for="e in emps" :key="e.id" :label="`${e.name}（${e.role}）`" :value="e.id" />
            </el-select>
          </el-form-item>
        </template>

        <el-form-item label="变更标题">
          <el-input v-model="dlg.form.title" placeholder="留空则按类型自动生成" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button :loading="dlg.previewing" @click="preview">预览</el-button>
        <el-button type="primary" :loading="dlg.saving" @click="submit">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailDlg.visible" :title="`变更详情 · ${detailDlg.row.change_no || ''}`" width="620px">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="变更类型">{{ detailDlg.row.change_type }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small" :type="detailDlg.row.status === '已通过' ? 'success' : (detailDlg.row.status === '已驳回' ? 'danger' : 'warning')">{{ detailDlg.row.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="标题" :span="2">{{ detailDlg.row.title }}</el-descriptions-item>
        <el-descriptions-item label="摘要" :span="2">{{ detailDlg.row.summary }}</el-descriptions-item>
        <el-descriptions-item label="发起人">{{ detailDlg.row.operator_name }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">{{ (detailDlg.row.created_at || '').slice(0, 16) }}</el-descriptions-item>
        <el-descriptions-item label="生效人">{{ detailDlg.row.applied_by || '—' }}</el-descriptions-item>
        <el-descriptions-item label="生效时间">{{ (detailDlg.row.applied_at || '').slice(0, 16) || '—' }}</el-descriptions-item>
        <el-descriptions-item label="驳回原因" :span="2">{{ detailDlg.row.reject_reason || '—' }}</el-descriptions-item>
      </el-descriptions>
      <div class="section-title">变更内容</div>
      <pre class="payload">{{ JSON.stringify(detailDlg.payload, null, 2) }}</pre>
      <div class="section-title">审批流（副总 → 总经理）</div>
      <el-table :data="detailDlg.steps" size="small">
        <el-table-column prop="seq" label="级次" width="70" />
        <el-table-column prop="step_name" label="审批节点" width="120" />
        <el-table-column prop="approver_name" label="审批人" width="120" />
        <el-table-column prop="action" label="动作" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.action === '通过' ? 'success' : (row.action === '驳回' ? 'danger' : 'info')">{{ row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="意见" min-width="160" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Clock, CircleCheck, CircleClose, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const rows = ref([]);
const stats = ref(null);
const loading = ref(false);
const filter = reactive({ status: '', change_type: '', keyword: '' });
const meta = ref({ change_types: [], statuses: [], unit_types: [], perm_fields: [], perm_modules: [] });
const units = ref([]);
const emps = ref([]);
const regions = ref([]);
const roles = ref([]);

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '待审批', value: s.pending, sub: '副总→总经理流转中', icon: Clock, color: '#f59e0b' },
    { title: '已生效', value: s.applied, sub: '已写回组织数据', icon: CircleCheck, color: '#10b981' },
    { title: '已驳回', value: s.rejected, sub: '变更未生效', icon: CircleClose, color: '#ef4444' },
    { title: '变更总数', value: s.pending + s.applied + s.rejected, sub: '变更台账累计', icon: Refresh, color: '#2563eb' },
  ];
});

async function loadMeta() {
  const r = await request.get('/orgchange/meta');
  if (r.code === 200) meta.value = r.data || meta.value;
  const o = await request.get('/org/dept-stats');
  if (o.code === 200) units.value = o.data || [];
  const e = await request.get('/org/employees');
  if (e.code === 200) emps.value = e.data || [];
  const m = await request.get('/org/meta');
  if (m.code === 200) roles.value = m.data.roles || [];
  const g = await request.get('/ops/overview').catch(() => null);
  if (g && g.code === 200) regions.value = g.data.regions || [];
}
async function loadStats() {
  const r = await request.get('/orgchange/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['status', 'change_type', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/orgchange/changes', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); });

/* ---------- 发起变更 ---------- */
const dlg = reactive({
  visible: false, saving: false, previewing: false,
  form: { change_type: '部门新增', title: '', payload: {} },
});
function resetPayload(type) {
  const base = {};
  if (['单位新增', '部门新增'].includes(type)) Object.assign(base, { code: '', name: '', type: 'DEPT', parent_id: null, manager_emp_id: null, headcount: 0, region: '', func: '' });
  else if (['单位调整', '部门调整'].includes(type)) Object.assign(base, { unit_id: null, name: '', func: '', headcount: 0, manager_emp_id: null, region: '' });
  else if (type === '部门合并') Object.assign(base, { src_unit_id: null, dst_unit_id: null, move_emp: true, reason: '' });
  else if (['部门撤销', '单位停用'].includes(type)) Object.assign(base, { unit_id: null, reason: '' });
  else if (type === '人员调整') Object.assign(base, { emp_id: null, title: '', role: '', org_id: null, report1_id: null, region: '' });
  else if (type === '人员停用') Object.assign(base, { emp_id: null, reason: '' });
  else if (type === '权限调整') Object.assign(base, { emp_id: null, module: '', field: 'can_view', value: true });
  else if (type === '权限恢复') Object.assign(base, { emp_id: null, module: '' });
  else if (type === '区域负责人任命') Object.assign(base, { region_id: null, emp_id: null });
  return base;
}
function openCreate() {
  dlg.form.change_type = '部门新增';
  dlg.form.title = '';
  dlg.form.payload = resetPayload('部门新增');
  dlg.visible = true;
}
function onTypeChange(t) { dlg.form.payload = resetPayload(t); }
function cleanPayload(p) {
  const o = {};
  Object.keys(p || {}).forEach((k) => {
    const v = p[k];
    if (v === '' || v === null || v === undefined) return;
    o[k] = v;
  });
  return o;
}
async function preview() {
  dlg.previewing = true;
  const r = await request.post('/orgchange/changes/preview', {
    change_type: dlg.form.change_type, payload: cleanPayload(dlg.form.payload),
  });
  dlg.previewing = false;
  if (r.code === 200) {
    ElMessageBox.alert(`标题：${r.data.title}\n\n摘要：${r.data.summary}`, '变更预览', { confirmButtonText: '关闭' });
  } else ElMessage.error(r.msg || '校验未通过');
}
async function submit() {
  if (!dlg.form.change_type) { ElMessage.warning('请选择变更类型'); return; }
  dlg.saving = true;
  const r = await request.post('/orgchange/changes', {
    change_type: dlg.form.change_type,
    title: dlg.form.title || undefined,
    payload: cleanPayload(dlg.form.payload),
  });
  dlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已提交，副总→总经理审批通过后生效');
    dlg.visible = false; loadList(); loadStats();
  } else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 审批（两级） ---------- */
async function approve(row, result) {
  let comment = '';
  const stepName = row.current_step === 1 ? '副总' : '总经理';
  if (result === '驳回') {
    try {
      const p = await ElMessageBox.prompt(`以${stepName}身份驳回「${row.title}」，请填写原因`, '驳回变更', { inputType: 'textarea' });
      comment = p.value || '';
    } catch (e) { return; }
  } else {
    try {
      await ElMessageBox.confirm(`以${stepName}身份审批通过「${row.title}」？${row.current_step === 1 ? '通过后流转总经理终审。' : '终审通过后变更立即生效。'}`, '组织变更审批', { type: 'warning' });
    } catch (e) { return; }
  }
  const r = await request.post(`/orgchange/changes/${row.id}/approve`, { result, comment });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadList(); loadStats(); loadMeta(); }
  else ElMessage.error(r.msg || '处理失败');
}

/* ---------- 详情 ---------- */
const detailDlg = reactive({ visible: false, row: {}, payload: {}, steps: [] });
async function openDetail(row) {
  const r = await request.get(`/orgchange/changes/${row.id}`);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  detailDlg.row = r.data || {};
  detailDlg.payload = r.data.payload_obj || {};
  detailDlg.steps = r.data.steps || [];
  detailDlg.visible = true;
}
</script>

<style scoped>
.orgchange { padding: 20px; }
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
.section-title { margin: 14px 0 8px; font-size: 13px; font-weight: 600; }
.payload { background: #f7f8fa; border: 1px solid var(--el-border-color-light); border-radius: 8px; padding: 10px; font-size: 12px; max-height: 200px; overflow: auto; }
.el-form-item { margin-bottom: 12px; }
</style>
