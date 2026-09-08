<template>
  <div class="directory">
    <div class="page-header">
      <h2>内部通讯录</h2>
      <p>全员可查阅；通讯录字段（部门职位/联系方式/邮箱/微信号等）由行政人事部统一编制维护</p>
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
        <el-select v-model="filter.dept_id" placeholder="全部部门" style="width:170px" clearable filterable @change="loadList">
          <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <el-input v-model="filter.keyword" placeholder="搜索姓名/工号/手机/邮箱/岗位" style="width:250px" clearable @change="loadList" />
      </div>
      <el-tag v-if="!canEdit" type="info" size="small">只读（行政人事部可编辑）</el-tag>
    </div>

    <el-table :data="rows" stripe size="small" v-loading="loading">
      <el-table-column prop="emp_no" label="工号" width="100" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="dept_name" label="部门" width="140" show-overflow-tooltip />
      <el-table-column prop="title" label="岗位" min-width="140" show-overflow-tooltip />
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column label="分机" width="90">
        <template #default="{ row }">{{ row.extension || '—' }}</template>
      </el-table-column>
      <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
      <el-table-column prop="wechat" label="微信号" width="120" show-overflow-tooltip />
      <el-table-column label="工龄(年)" width="90" align="center">
        <template #default="{ row }">{{ row.seniority === null ? '—' : row.seniority }}</template>
      </el-table-column>
      <el-table-column prop="report1_name" label="直属上级" width="100" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" :disabled="!canEdit" @click="openEdit(row)">编制</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无在职员工通讯录</span></template>
    </el-table>

    <!-- 编制通讯录 -->
    <el-dialog v-model="editDlg.visible" :title="'编制通讯录 · ' + editDlg.name" width="560px">
      <el-form label-width="100px" size="small">
        <el-form-item label="工号">
          <el-input :model-value="editDlg.form.emp_no" disabled />
        </el-form-item>
        <el-form-item label="部门职位">
          <el-input v-model="editDlg.form.title" placeholder="如：行政专员 / 销售工程师" />
        </el-form-item>
        <el-form-item label="联系方式">
          <el-input v-model="editDlg.form.phone" placeholder="手机号" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="editDlg.form.email" placeholder="企业邮箱" />
        </el-form-item>
        <el-form-item label="微信号">
          <el-input v-model="editDlg.form.wechat" />
        </el-form-item>
        <el-form-item label="大区">
          <el-input v-model="editDlg.form.region" placeholder="如：西南 / 华东" />
        </el-form-item>
        <el-form-item label="学历">
          <el-input v-model="editDlg.form.degree" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="editDlg.saving" @click="submitEdit">提交变更</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { User, OfficeBuilding, Phone, Postcard } from '@element-plus/icons-vue';
import request from '../api/request';

const rows = ref([]);
const stats = ref(null);
const departments = ref([]);
const canEdit = ref(false);
const loading = ref(false);
const filter = reactive({ dept_id: '', keyword: '' });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const top = s.by_dept && s.by_dept.length ? s.by_dept[0] : null;
  return [
    { title: '在职员工', value: s.total, sub: '通讯录可查阅全员', icon: User, color: '#2563eb' },
    { title: '部门数', value: s.dept_count, sub: '按组织架构统计', icon: OfficeBuilding, color: '#10b981' },
    { title: '人数最多部门', value: top ? top.dept_name : '—', sub: top ? `${top.count} 人` : '暂无', icon: Postcard, color: '#8b5cf6' },
    { title: '编辑权限', value: canEdit.value ? '可编辑' : '只读', sub: '行政人事部可编制', icon: Phone, color: '#f59e0b' },
  ];
});

async function loadMeta() {
  const r = await request.get('/directory/meta');
  if (r.code === 200) {
    departments.value = r.data.departments || [];
    canEdit.value = !!r.data.can_edit;
  }
}
async function loadStats() {
  const r = await request.get('/directory/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['dept_id', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/directory', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); });

const editDlg = reactive({
  visible: false, saving: false, id: null, name: '',
  form: { emp_no: '', title: '', phone: '', email: '', wechat: '', region: '', degree: '' },
});
function openEdit(row) {
  if (!canEdit.value) { ElMessage.warning('仅行政人事部可编制通讯录'); return; }
  editDlg.id = row.id;
  editDlg.name = row.name;
  editDlg.form = {
    emp_no: row.emp_no,
    title: row.title === '—' ? '' : row.title,
    phone: row.phone === '—' ? '' : row.phone,
    email: row.email === '—' ? '' : row.email,
    wechat: row.wechat === '—' ? '' : row.wechat,
    region: row.region === '—' ? '' : row.region,
    degree: row.degree || '',
  };
  editDlg.visible = true;
}
async function submitEdit() {
  editDlg.saving = true;
  const r = await request.put(`/directory/${editDlg.id}`, editDlg.form);
  editDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已更新'); editDlg.visible = false; loadList(); }
  else ElMessage.error(r.msg || '更新失败');
}
</script>

<style scoped>
.directory { padding: 20px; }
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
