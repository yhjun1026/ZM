<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>合同审批</h2><p>合同提交、审批与进度</p></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新建合同</el-button>
    </div>
    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="id" label="合同编号" width="130" />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column prop="customer" label="客户" width="160" />
        <el-table-column prop="type" label="类型" width="90" />
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ Number(row.amount || 0).toLocaleString() }}</template></el-table-column>
        <el-table-column label="进度" width="120"><template #default="{ row }"><el-progress :percentage="row.progress || 0" /></template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === '待审批' && canApprove">
              <el-button size="small" type="success" @click="onApprove(row, '执行中')">通过</el-button>
              <el-button size="small" type="danger" @click="onApprove(row, '已驳回')">驳回</el-button>
            </template>
            <el-button size="small" type="danger" @click="onDelete(row)" :icon="Delete"></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="新建合同" width="560px">
      <el-form :model="dlg.form" label-width="90px">
        <el-form-item label="合同编号" required><el-input v-model="dlg.form.id" /></el-form-item>
        <el-form-item label="合同名称" required><el-input v-model="dlg.form.name" /></el-form-item>
        <el-form-item label="客户"><el-input v-model="dlg.form.customer" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="dlg.form.type"><el-option label="销售合同" value="销售合同" /><el-option label="服务合同" value="服务合同" /><el-option label="采购合同" value="采购合同" /></el-select></el-form-item>
        <el-form-item label="金额"><el-input-number v-model="dlg.form.amount" :min="0" /></el-form-item>
        <el-row><el-col :span="12"><el-form-item label="开始日期"><el-date-picker v-model="dlg.form.startDate" value-format="YYYY-MM-DD" /></el-form-item></el-col><el-col :span="12"><el-form-item label="结束日期"><el-date-picker v-model="dlg.form.endDate" value-format="YYYY-MM-DD" /></el-form-item></el-col></el-row>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import { getContracts, addContract, approveContract, deleteContract } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const records = ref([]);

// 审批权限：非普通员工才能审批
const canApprove = computed(() => {
  return auth.user && auth.user.role !== '普通员工';
});

async function load() {
  const r = await getContracts();
  if (r.success) records.value = r.data || [];
}
onMounted(load);
function statusType(s) { return s === '执行中' ? 'success' : s === '已完成' ? 'info' : s === '已驳回' ? 'danger' : 'warning'; }

const dlg = reactive({ visible: false, saving: false, form: {} });
function openCreate() {
  dlg.form = { id: '', name: '', customer: '', type: '销售合同', amount: 0, startDate: '', endDate: '' };
  dlg.visible = true;
}
async function onSubmit() {
  if (!dlg.form.id || !dlg.form.name) { ElMessage.warning('请填写编号和名称'); return; }
  dlg.saving = true;
  const r = await addContract({ ...dlg.form, creator: auth.userName });
  dlg.saving = false;
  if (r.success) { ElMessage.success('提交成功'); dlg.visible = false; load(); }
}
async function onApprove(row, status) {
  const r = await approveContract(row.id, { status, approver: auth.userName });
  if (r.success) { ElMessage.success('已更新'); load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm(`确认删除合同「${row.id}」？`, '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteContract(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>
