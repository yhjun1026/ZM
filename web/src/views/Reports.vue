<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>工作汇报</h2><p>提交与审批工作汇报</p></div>
      <el-button type="primary" @click="openApply"><el-icon><Plus /></el-icon> 写汇报</el-button>
    </div>
    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="user_name" label="申请人" width="100" />
        <el-table-column label="类型" width="80"><template #default="{ row }"><el-tag size="small">{{ row.type }}</el-tag></template></el-table-column>
        <el-table-column prop="date" label="日期" width="110" />
        <el-table-column label="完成情况" min-width="220"><template #default="{ row }"><span style="white-space: pre-wrap;">{{ (row.content || '').slice(0, 60) }}</span></template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === '已审批' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === '已提交'" size="small" type="success" @click="onApprove(row)">审批</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="写工作汇报" width="560px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="类型"><el-select v-model="dlg.form.type"><el-option label="日报" value="日报" /><el-option label="周报" value="周报" /></el-select></el-form-item>
        <el-form-item label="日期"><el-date-picker v-model="dlg.form.date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="完成情况"><el-input v-model="dlg.form.content" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="工作计划"><el-input v-model="dlg.form.plan" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getReports, submitReport, approveReport, deleteReport } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const records = ref([]);
async function load() {
  const r = await getReports();
  if (r.success) records.value = r.data.reports || [];
}
onMounted(load);

const dlg = reactive({ visible: false, saving: false, form: { type: '日报', date: '', content: '', plan: '' } });
function openApply() {
  dlg.form = { type: '日报', date: new Date().toISOString().slice(0, 10), content: '', plan: '' };
  dlg.visible = true;
}
async function onSubmit() {
  if (!dlg.form.content) { ElMessage.warning('请填写完成情况'); return; }
  dlg.saving = true;
  const r = await submitReport({ userName: auth.userName, ...dlg.form });
  dlg.saving = false;
  if (r.success) { ElMessage.success('提交成功'); dlg.visible = false; load(); }
}
async function onApprove(row) {
  const r = await approveReport(row.id, {});
  if (r.success) { ElMessage.success('已审批'); load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm('确认删除该汇报？', '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteReport(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>
