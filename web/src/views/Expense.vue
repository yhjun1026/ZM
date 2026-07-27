<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>费用报销</h2><p>报销申请与审批</p></div>
      <el-button type="primary" @click="openApply"><el-icon><Plus /></el-icon> 申请报销</el-button>
    </div>
    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="applicant" label="申请人" width="100" />
        <el-table-column prop="category" label="类别" width="100"><template #default="{ row }"><el-tag size="small">{{ row.category }}</el-tag></template></el-table-column>
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ Number(row.amount || 0).toLocaleString() }}</template></el-table-column>
        <el-table-column prop="date" label="日期" width="110" />
        <el-table-column prop="desc" label="说明" min-width="180" />
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === '待审批'">
              <el-button size="small" type="success" @click="onApprove(row, '已通过')">通过</el-button>
              <el-button size="small" type="danger" @click="onApprove(row, '已驳回')">驳回</el-button>
            </template>
            <span v-else style="color: #c0c4cc;">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="申请报销" width="480px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="类别"><el-select v-model="dlg.form.category"><el-option v-for="c in categories" :key="c" :label="c" :value="c" /></el-select></el-form-item>
        <el-form-item label="金额"><el-input-number v-model="dlg.form.amount" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="日期"><el-date-picker v-model="dlg.form.date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="dlg.form.desc" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getExpense, applyExpense, approveExpense } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const records = ref([]);
const categories = ref([]);
async function load() {
  const r = await getExpense();
  if (r.success) { records.value = r.data.records || []; categories.value = r.data.categories || []; }
}
onMounted(load);
function statusType(s) { return s === '已通过' ? 'success' : s === '待审批' ? 'warning' : 'danger'; }

const dlg = reactive({ visible: false, saving: false, form: { category: '', amount: 0, date: '', desc: '' } });
function openApply() { dlg.form = { category: categories.value[0] || '交通费', amount: 0, date: new Date().toISOString().slice(0, 10), desc: '' }; dlg.visible = true; }
async function onSubmit() {
  dlg.saving = true;
  const r = await applyExpense({ applicant: auth.userName, ...dlg.form });
  dlg.saving = false;
  if (r.success) { ElMessage.success('申请已提交'); dlg.visible = false; load(); }
}
async function onApprove(row, status) {
  const r = await approveExpense(row.id, { status });
  if (r.success) { ElMessage.success(status === '已通过' ? '已通过' : '已驳回'); load(); }
}
</script>
