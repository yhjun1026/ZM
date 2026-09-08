<template>
  <div class="org">
    <div class="page-header">
      <h2>组织架构</h2>
      <p>总部 HQ → 产品线 PRODUCT / 分公司 BRANCH → 部门 DEPT：部门职责、编制与负责人维护 → 单位信息与变更历史（变更须副总/总经理审批）</p>
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
      <!-- ============ 组织树 ============ -->
      <el-tab-pane label="组织树" name="tree">
        <div class="tab-toolbar">
          <el-input v-model="treeKeyword" placeholder="搜索部门/员工姓名" style="width:240px" clearable />
          <div class="muted">共 {{ units.length }} 个组织单元 / {{ emps.length }} 名在职员工</div>
        </div>
        <el-tree
          :data="filteredTree"
          :props="treeProps"
          node-key="id"
          default-expand-all
          :expand-on-click-node="false"
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <div class="tree-node">
              <el-tag size="small" :type="typeTag(data.type)">{{ data.type_name }}</el-tag>
              <b class="node-name">{{ data.name }}</b>
              <span class="muted">{{ data.code }}</span>
              <span class="muted">负责人：{{ data.manager || '未设置' }}</span>
              <span class="muted">编制 {{ data.headcount || 0 }} / 在编 {{ data.staff_count }}</span>
              <el-tag size="small" :type="data.gap < 0 ? 'danger' : (data.gap > 0 ? 'warning' : 'success')">
                {{ data.gap < 0 ? '超编' + Math.abs(data.gap) : (data.gap > 0 ? '缺编' + data.gap : '满编') }}
              </el-tag>
              <span v-if="data.func" class="muted func">职责：{{ data.func }}</span>
            </div>
          </template>
        </el-tree>
        <div v-if="!filteredTree.length" class="muted empty">暂无组织单元数据</div>

        <div class="section-title">部门在编人员（点击组织树节点所属部门查看）</div>
        <el-table :data="treeEmps" stripe size="small" max-height="320">
          <el-table-column prop="emp_no" label="工号" width="100" />
          <el-table-column prop="name" label="姓名" width="100" />
          <el-table-column prop="title" label="职位" min-width="120" show-overflow-tooltip />
          <el-table-column prop="role" label="角色" width="120" />
          <el-table-column prop="report1" label="实线上级" width="100" />
          <el-table-column prop="report2" label="虚线上级" width="100" />
          <el-table-column prop="region" label="区域" width="100" />
          <el-table-column label="入职日期" width="110">
            <template #default="{ row }">{{ row.hire_date || '—' }}</template>
          </el-table-column>
          <template #empty><span class="muted">请选择左侧部门或暂无在职员工</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 部门设置 ============ -->
      <el-tab-pane label="部门设置" name="depts">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="deptFilter.type" placeholder="全部层级" style="width:130px" clearable @change="loadDepts">
              <el-option v-for="t in meta.unit_types" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
            <el-input v-model="deptFilter.keyword" placeholder="搜索名称/编码/职责" style="width:220px" clearable @change="loadDepts" />
          </div>
          <el-button type="primary" @click="openDeptCreate">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增部门
          </el-button>
        </div>
        <el-table :data="deptRows" stripe size="small" v-loading="deptLoading">
          <el-table-column prop="code" label="编码" width="120" />
          <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
          <el-table-column label="层级" width="90">
            <template #default="{ row }"><el-tag size="small" :type="typeTag(row.type)">{{ row.type_name }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="parent_name" label="上级" width="120" show-overflow-tooltip />
          <el-table-column prop="manager" label="负责人" width="100" />
          <el-table-column label="编制/在编" width="110" align="right">
            <template #default="{ row }">{{ row.headcount || 0 }} / <b>{{ row.staff_count }}</b></template>
          </el-table-column>
          <el-table-column prop="region" label="区域" width="100" />
          <el-table-column prop="func" label="部门职责" min-width="180" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === '启用' ? 'success' : 'info'">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openDeptEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="disableDept(row)">停用</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无部门，点击右上角「新增部门」创建</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 单位信息 ============ -->
      <el-tab-pane label="单位信息" name="profile">
        <div class="tab-toolbar">
          <div class="muted">
            单位信息变更须提交审批（副总 → 总经理），审批通过后覆盖生效；
            <el-tag v-if="profile.pending" type="warning" size="small">有 1 笔变更审批中</el-tag>
          </div>
          <el-button type="primary" @click="openProfileEdit">
            <el-icon style="margin-right:4px"><Edit /></el-icon>提交变更
          </el-button>
        </div>

        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="单位全称">{{ profile.unit_name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="公司简称">{{ profile.short_name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="统一社会信用代码">{{ profile.credit_code || '—' }}</el-descriptions-item>
          <el-descriptions-item label="法定代表人">{{ profile.legal_person || '—' }}</el-descriptions-item>
          <el-descriptions-item label="注册资本(万)">{{ profile.reg_capital || '—' }}</el-descriptions-item>
          <el-descriptions-item label="成立日期">{{ profile.established_date || '—' }}</el-descriptions-item>
          <el-descriptions-item label="企业类型">{{ profile.company_type || '—' }}</el-descriptions-item>
          <el-descriptions-item label="登记机关">{{ profile.reg_authority || '—' }}</el-descriptions-item>
          <el-descriptions-item label="注册地址">{{ profile.reg_address || '—' }}</el-descriptions-item>
          <el-descriptions-item label="办公地址">{{ profile.office_address || '—' }}</el-descriptions-item>
          <el-descriptions-item label="所属行业">{{ profile.industry || '—' }}</el-descriptions-item>
          <el-descriptions-item label="员工规模(人)">{{ profile.employee_count || '—' }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ profile.contact_person || '—' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ profile.contact_phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="电子邮箱">{{ profile.email || '—' }}</el-descriptions-item>
          <el-descriptions-item label="公司网址">{{ profile.website || '—' }}</el-descriptions-item>
          <el-descriptions-item label="开户银行">{{ profile.bank_name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="银行账号">{{ profile.bank_account || '—' }}</el-descriptions-item>
          <el-descriptions-item label="OA启用日期">{{ profile.oa_start || '—' }}</el-descriptions-item>
          <el-descriptions-item label="经营范围" :span="2">{{ profile.biz_scope || '—' }}</el-descriptions-item>
          <el-descriptions-item label="公司简介" :span="2">{{ profile.company_intro || '—' }}</el-descriptions-item>
        </el-descriptions>

        <div class="section-title">变更历史</div>
        <el-table :data="historyRows" stripe size="small">
          <el-table-column label="提交时间" width="150">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column prop="unit_name" label="单位全称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="submitted_by_name" label="提交人" width="100" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === '已通过' ? 'success' : (row.status === '已驳回' ? 'danger' : 'warning')">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="生效时间" width="150">
            <template #default="{ row }">{{ (row.effective_at || '').slice(0, 16) || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '审批中' && canApprove" size="small" type="success" @click="approveProfile(row, '通过')">通过</el-button>
              <el-button v-if="row.status === '审批中' && canApprove" size="small" type="danger" @click="approveProfile(row, '驳回')">驳回</el-button>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无变更历史</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增/编辑部门 -->
    <el-dialog v-model="deptDlg.visible" :title="deptDlg.isEdit ? '编辑部门' : '新增部门'" width="560px">
      <el-form label-width="100px" size="small">
        <el-form-item label="编码" required>
          <el-input v-model="deptDlg.form.code" placeholder="如 ZM-D1-007" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="deptDlg.form.name" placeholder="如 商务部" />
        </el-form-item>
        <el-form-item label="层级">
          <el-select v-model="deptDlg.form.type" style="width:100%">
            <el-option v-for="t in meta.unit_types" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="上级单位">
          <el-select v-model="deptDlg.form.parent_id" clearable filterable style="width:100%">
            <el-option v-for="u in units" :key="u.id" :label="u.name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="deptDlg.form.manager_emp_id" clearable filterable style="width:100%">
            <el-option v-for="e in emps" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="编制人数">
          <el-input-number v-model="deptDlg.form.headcount" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="deptDlg.form.region" placeholder="分公司填所属大区" />
        </el-form-item>
        <el-form-item label="部门职责">
          <el-input v-model="deptDlg.form.func" type="textarea" :rows="2" placeholder="细化部门职责" />
        </el-form-item>
        <el-form-item label="状态" v-if="deptDlg.isEdit">
          <el-select v-model="deptDlg.form.status" style="width:100%">
            <el-option v-for="s in meta.unit_status" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deptDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="deptDlg.saving" @click="submitDept">保存</el-button>
      </template>
    </el-dialog>

    <!-- 单位信息变更 -->
    <el-dialog v-model="profileDlg.visible" title="提交单位信息变更" width="720px">
      <el-form label-width="120px" size="small">
        <el-form-item label="单位全称" required><el-input v-model="profileDlg.form.unit_name" /></el-form-item>
        <el-form-item label="公司简称"><el-input v-model="profileDlg.form.short_name" /></el-form-item>
        <el-form-item label="统一社会信用代码"><el-input v-model="profileDlg.form.credit_code" /></el-form-item>
        <el-form-item label="法定代表人"><el-input v-model="profileDlg.form.legal_person" /></el-form-item>
        <el-form-item label="注册资本(万)"><el-input v-model="profileDlg.form.reg_capital" /></el-form-item>
        <el-form-item label="成立日期"><el-input v-model="profileDlg.form.established_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="企业类型"><el-input v-model="profileDlg.form.company_type" /></el-form-item>
        <el-form-item label="登记机关"><el-input v-model="profileDlg.form.reg_authority" /></el-form-item>
        <el-form-item label="注册地址"><el-input v-model="profileDlg.form.reg_address" /></el-form-item>
        <el-form-item label="办公地址"><el-input v-model="profileDlg.form.office_address" /></el-form-item>
        <el-form-item label="所属行业"><el-input v-model="profileDlg.form.industry" /></el-form-item>
        <el-form-item label="经营范围"><el-input v-model="profileDlg.form.biz_scope" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="员工规模(人)"><el-input v-model="profileDlg.form.employee_count" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="profileDlg.form.contact_person" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="profileDlg.form.contact_phone" /></el-form-item>
        <el-form-item label="电子邮箱"><el-input v-model="profileDlg.form.email" /></el-form-item>
        <el-form-item label="公司网址"><el-input v-model="profileDlg.form.website" /></el-form-item>
        <el-form-item label="开户银行"><el-input v-model="profileDlg.form.bank_name" /></el-form-item>
        <el-form-item label="银行账号"><el-input v-model="profileDlg.form.bank_account" /></el-form-item>
        <el-form-item label="OA启用日期"><el-input v-model="profileDlg.form.oa_start" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="公司简介"><el-input v-model="profileDlg.form.company_intro" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="profileDlg.form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profileDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="profileDlg.saving" @click="submitProfile">提交审批</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Share, OfficeBuilding, Document, User, Plus, Edit } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('tree');
const stats = ref(null);
const meta = ref({ unit_types: [], unit_status: [], profile_fields: [], roles: [] });
const units = ref([]);
const emps = ref([]);
const tree = ref([]);
const treeKeyword = ref('');
const deptRows = ref([]);
const deptLoading = ref(false);
const deptFilter = reactive({ type: '', keyword: '' });
const profile = ref({});
const historyRows = ref([]);
const canApprove = ref(false);
const selectedUnitId = ref(null);

const treeProps = { label: 'name', children: 'children' };

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '组织单元', value: s.units, sub: `部门 ${s.depts} 个`, icon: Share, color: '#2563eb' },
    { title: '在职员工', value: s.staff, sub: `编制 ${s.headcount} 人`, icon: User, color: '#10b981' },
    { title: '编制执行率', value: s.fill_rate + '%', sub: `${s.staff} / ${s.headcount}`, icon: OfficeBuilding, color: '#f59e0b' },
    { title: '超编部门', value: s.over_count, sub: `未设负责人 ${s.no_manager} 个`, icon: Document, color: '#ef4444' },
  ];
});

const filteredTree = computed(() => {
  const kw = treeKeyword.value.trim();
  if (!kw) return tree.value;
  const hit = (n) => (n.name || '').includes(kw) || (n.code || '').includes(kw)
    || (n.employees || []).some((e) => (e.name || '').includes(kw) || (e.emp_no || '').includes(kw));
  const walk = (list) => list.map((n) => ({ ...n, children: walk(n.children || []) }))
    .filter((n) => hit(n) || (n.children && n.children.length));
  return walk(tree.value);
});

const treeEmps = computed(() => {
  if (selectedUnitId.value) return emps.value.filter((e) => e.org_id === selectedUnitId.value);
  return emps.value;
});

function onNodeClick(data) {
  selectedUnitId.value = selectedUnitId.value === data.id ? null : data.id;
}
function typeTag(t) {
  const map = { HQ: 'danger', PRODUCT: 'warning', BRANCH: 'primary', DEPT: 'info' };
  return map[t] || 'info';
}

async function loadMeta() {
  const r = await request.get('/org/meta');
  if (r.code === 200) meta.value = r.data || meta.value;
}
async function loadStats() {
  const r = await request.get('/org/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadTree() {
  const r = await request.get('/org/tree');
  if (r.code === 200) {
    units.value = r.data.units || [];
    tree.value = r.data.tree || [];
    emps.value = r.data.emps || [];
  }
}
async function loadDepts() {
  deptLoading.value = true;
  try {
    const params = {};
    if (deptFilter.type) params.type = deptFilter.type;
    if (deptFilter.keyword) params.keyword = deptFilter.keyword;
    const r = await request.get('/org/depts', { params });
    deptRows.value = r.code === 200 ? r.data || [] : [];
  } finally { deptLoading.value = false; }
}
async function loadProfile() {
  const r = await request.get('/org/profile');
  if (r.code === 200) profile.value = r.data || {};
  // 单位资料变更审批由副总/总经理完成（与后端 isVP 一致），此处仅用于控制按钮显示
  try {
    const u = JSON.parse(localStorage.getItem('zm_user') || '{}');
    canApprove.value = ['副总', '总经理', '超级管理员'].includes(u.role);
  } catch (e) { canApprove.value = false; }
  const h = await request.get('/org/profile/history');
  if (h.code === 200) historyRows.value = h.data || [];
}
function onTabChange(name) {
  if (name === 'depts') loadDepts();
  if (name === 'profile') loadProfile();
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadTree(); });

/* ---------- 部门 CRUD ---------- */
const deptDlg = reactive({
  visible: false, saving: false, isEdit: false, id: null,
  form: { code: '', name: '', type: 'DEPT', parent_id: null, manager_emp_id: null, headcount: 0, region: '', func: '', status: '启用' },
});
function resetDeptForm() {
  Object.assign(deptDlg.form, { code: '', name: '', type: 'DEPT', parent_id: null, manager_emp_id: null, headcount: 0, region: '', func: '', status: '启用' });
}
function openDeptCreate() { deptDlg.isEdit = false; deptDlg.id = null; resetDeptForm(); deptDlg.visible = true; }
function openDeptEdit(row) {
  deptDlg.isEdit = true; deptDlg.id = row.id;
  Object.assign(deptDlg.form, {
    code: row.code, name: row.name, type: row.type, parent_id: row.parent_id || null,
    manager_emp_id: row.manager_emp_id || null, headcount: row.headcount || 0,
    region: row.region || '', func: row.func || '', status: row.status || '启用',
  });
  deptDlg.visible = true;
}
async function submitDept() {
  if (!deptDlg.form.code || !deptDlg.form.name) { ElMessage.warning('编码与名称必填'); return; }
  deptDlg.saving = true;
  const r = deptDlg.isEdit
    ? await request.put(`/org/depts/${deptDlg.id}`, deptDlg.form)
    : await request.post('/org/depts', deptDlg.form);
  deptDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已保存'); deptDlg.visible = false; loadDepts(); loadTree(); loadStats(); }
  else ElMessage.error(r.msg || '保存失败');
}
async function disableDept(row) {
  try { await ElMessageBox.confirm(`确认停用「${row.name}」？该部门须先完成人员分流。`, '停用部门', { type: 'warning' }); }
  catch (e) { return; }
  const r = await request.delete(`/org/depts/${row.id}`);
  if (r.code === 200) { ElMessage.success(r.msg || '已停用'); loadDepts(); loadTree(); loadStats(); }
  else ElMessage.error(r.msg || '停用失败');
}

/* ---------- 单位信息 ---------- */
const profileDlg = reactive({ visible: false, saving: false, form: {} });
function openProfileEdit() {
  const f = {};
  (meta.value.profile_fields || []).forEach((k) => { f[k] = profile.value[k] || ''; });
  profileDlg.form = f;
  profileDlg.visible = true;
}
async function submitProfile() {
  if (!profileDlg.form.unit_name) { ElMessage.warning('单位全称必填'); return; }
  profileDlg.saving = true;
  const r = await request.put('/org/profile', profileDlg.form);
  profileDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交审批'); profileDlg.visible = false; loadProfile(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function approveProfile(row, result) {
  let comment = '';
  if (result === '驳回') {
    try { const p = await ElMessageBox.prompt('请填写驳回原因', '驳回变更', { inputType: 'textarea' }); comment = p.value || ''; }
    catch (e) { return; }
  }
  const r = await request.post(`/org/profile/history/${row.id}/approve`, { result, comment });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadProfile(); }
  else ElMessage.error(r.msg || '处理失败');
}
</script>

<style scoped>
.org { padding: 20px; }
.muted { color: #909399; }
.empty { padding: 12px 0; }
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
.section-title { margin: 18px 0 8px; font-size: 14px; font-weight: 600; }
.tree-node { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.node-name { min-width: 110px; }
.func { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.el-form-item { margin-bottom: 12px; }
</style>
