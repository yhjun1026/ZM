<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>部门管理</h2><p>组织架构管理</p></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新增部门</el-button>
    </div>
    <el-card>
      <el-table :data="departments" row-key="id" :tree-props="{ children: 'children' }" border default-expand-all>
        <el-table-column prop="name" label="部门名称" min-width="200" />
        <el-table-column prop="head" label="负责人" width="120" />
        <el-table-column prop="count" label="人数" width="80" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }"><el-button size="small" type="danger" @click="onDelete(row)">删除</el-button></template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="新增部门" width="460px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="dlg.form.name" /></el-form-item>
        <el-form-item label="负责人"><el-input v-model="dlg.form.head" /></el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="dlg.form.parentId" clearable placeholder="无（顶级部门）">
            <el-option v-for="d in flatDepts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">添加</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getDepartments, addDepartment, deleteDepartment } from '../api/modules';

const departments = ref([]);
const flatDepts = computed(() => {
  const out = [];
  departments.value.forEach((d) => { out.push({ id: d.id, name: d.name }); (d.children || []).forEach((c) => out.push({ id: c.id, name: c.name })); });
  return out;
});
async function load() {
  const r = await getDepartments();
  if (r.success) departments.value = r.data || [];
}
onMounted(load);

const dlg = reactive({ visible: false, saving: false, form: {} });
function openCreate() { dlg.form = { name: '', head: '', parentId: null }; dlg.visible = true; }
async function onSubmit() {
  if (!dlg.form.name) { ElMessage.warning('请填写部门名称'); return; }
  dlg.saving = true;
  const r = await addDepartment(dlg.form);
  dlg.saving = false;
  if (r.success) { ElMessage.success('已添加'); dlg.visible = false; load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm(`确认删除部门「${row.name}」？`, '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteDepartment(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>
