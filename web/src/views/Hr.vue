<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>人事管理</h2><p>员工档案管理</p></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新增员工</el-button>
    </div>
    <el-row :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">员工总数</div><div style="font-size:22px;font-weight:700;">{{ hrStats.total ?? employees.length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">在职</div><div style="font-size:22px;font-weight:700;color:#10b981;">{{ hrStats.active ?? employees.filter(e=>e.status==='在职').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">试用期</div><div style="font-size:22px;font-weight:700;color:#f59e0b;">{{ hrStats.trial ?? employees.filter(e=>e.status==='试用期').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">本月入职</div><div style="font-size:22px;font-weight:700;color:#2563eb;">{{ hrStats.newHires ?? '-' }}</div></el-card></el-col>
    </el-row>
    <el-card>
      <el-table :data="employees" stripe>
        <el-table-column prop="id" label="工号" width="90" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="dept" label="部门" width="100" />
        <el-table-column prop="role" label="职位" width="120" />
        <el-table-column prop="level" label="职级" width="80"><template #default="{ row }"><el-tag size="small">{{ row.level }}</el-tag></template></el-table-column>
        <el-table-column prop="education" label="学历" width="70" />
        <el-table-column prop="joinDate" label="入职日期" width="120" />
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === '在职' ? 'success' : row.status === '试用期' ? 'warning' : 'info'" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" :title="dlg.isEdit ? '编辑员工' : '新增员工'" width="520px">
      <el-form :model="dlg.form" label-width="80px">
        <el-row>
          <el-col :span="12"><el-form-item label="工号" required><el-input v-model="dlg.form.id" :disabled="dlg.isEdit" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="姓名" required><el-input v-model="dlg.form.name" /></el-form-item></el-col>
        </el-row>
        <el-row>
          <el-col :span="12"><el-form-item label="部门"><el-input v-model="dlg.form.dept" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="职位"><el-input v-model="dlg.form.role" /></el-form-item></el-col>
        </el-row>
        <el-row>
          <el-col :span="12"><el-form-item label="职级"><el-input v-model="dlg.form.level" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="状态"><el-select v-model="dlg.form.status"><el-option label="在职" value="在职" /><el-option label="试用期" value="试用期" /><el-option label="请假" value="请假" /></el-select></el-form-item></el-col>
        </el-row>
        <el-form-item label="手机"><el-input v-model="dlg.form.phone" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getUsers, addUser, updateUser, deleteUser } from '../api/modules';

const employees = ref([]);
const hrStats = ref({});
async function load() {
  const r = await getUsers();
  if (r.success) { employees.value = r.data.employees || []; hrStats.value = r.data.hrStats || {}; }
}
onMounted(load);

const dlg = reactive({ visible: false, isEdit: false, saving: false, form: {} });
function openCreate() { dlg.isEdit = false; dlg.form = { id: '', name: '', dept: '', role: '', level: 'P3', status: '试用期', phone: '', education: '本科' }; dlg.visible = true; }
function openEdit(row) { dlg.isEdit = true; dlg.form = { ...row }; dlg.visible = true; }
async function onSubmit() {
  if (!dlg.form.id || !dlg.form.name) { ElMessage.warning('请填写工号和姓名'); return; }
  dlg.saving = true;
  const r = dlg.isEdit ? await updateUser(dlg.form.id, dlg.form) : await addUser(dlg.form);
  dlg.saving = false;
  if (r.success) { ElMessage.success('保存成功'); dlg.visible = false; load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm(`确认删除员工「${row.name}」？`, '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteUser(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>
