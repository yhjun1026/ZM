<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>项目管理</h2><p>项目立项、审批与进度</p></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新建项目</el-button>
    </div>
    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="id" label="编号" width="120" />
        <el-table-column prop="name" label="项目名称" min-width="180" />
        <el-table-column prop="customer" label="客户" width="150" />
        <el-table-column label="优先级" width="80"><template #default="{ row }"><el-tag :type="row.priority === '高' ? 'danger' : row.priority === '中' ? 'warning' : 'info'" size="small">{{ row.priority }}</el-tag></template></el-table-column>
        <el-table-column prop="manager" label="经理" width="90" />
        <el-table-column label="预算/已用" width="180"><template #default="{ row }">¥{{ (row.budget / 10000).toFixed(1) }}万 / ¥{{ (row.spent / 10000).toFixed(1) }}万</template></el-table-column>
        <el-table-column label="进度" width="120"><template #default="{ row }"><el-progress :percentage="row.progress || 0" /></template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === '立项审批中' || row.status === '待立项'" size="small" type="success" @click="onApprove(row)">审批</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="新建项目" width="560px">
      <el-form :model="dlg.form" label-width="90px">
        <el-form-item label="项目名称" required><el-input v-model="dlg.form.name" /></el-form-item>
        <el-form-item label="客户"><el-input v-model="dlg.form.customer" /></el-form-item>
        <el-row>
          <el-col :span="12"><el-form-item label="预算"><el-input-number v-model="dlg.form.budget" :min="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="优先级"><el-select v-model="dlg.form.priority"><el-option label="高" value="高" /><el-option label="中" value="中" /><el-option label="低" value="低" /></el-select></el-form-item></el-col>
        </el-row>
        <el-form-item label="经理"><el-input v-model="dlg.form.manager" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交立项</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getProjects, addProject, approveProject, deleteProject } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const records = ref([]);
async function load() {
  const r = await getProjects();
  if (r.success) records.value = r.data || [];
}
onMounted(load);
function statusType(s) { return s === '执行中' ? 'success' : s === '立项审批中' ? 'warning' : s === '已完成' ? 'info' : 'danger'; }

const dlg = reactive({ visible: false, saving: false, form: {} });
function openCreate() { dlg.form = { name: '', customer: '', budget: 0, priority: '中', manager: auth.userName }; dlg.visible = true; }
async function onSubmit() {
  if (!dlg.form.name) { ElMessage.warning('请填写项目名称'); return; }
  dlg.saving = true;
  const r = await addProject({ ...dlg.form, startDate: '-', endDate: '-' });
  dlg.saving = false;
  if (r.success) { ElMessage.success('立项申请已提交'); dlg.visible = false; load(); }
}
async function onApprove(row) {
  const r = await approveProject(row.id, { status: '执行中', approver: auth.userName });
  if (r.success) { ElMessage.success('审批已通过'); load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm(`确认删除项目「${row.name}」？`, '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteProject(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>
