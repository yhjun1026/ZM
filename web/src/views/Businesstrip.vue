<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>出差申请</h2><p>出差申请、审批与费用</p></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 申请出差</el-button>
    </div>
    <el-row :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">出差总数</div><div style="font-size:22px;font-weight:700;">{{ stats.totalTrips ?? 0 }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">待审批</div><div style="font-size:22px;font-weight:700;color:#f59e0b;">{{ stats.pending ?? 0 }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">已完成</div><div style="font-size:22px;font-weight:700;color:#10b981;">{{ stats.completed ?? 0 }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">预算总额</div><div style="font-size:22px;font-weight:700;color:#2563eb;">¥{{ stats.totalBudget ?? 0 }}</div></el-card></el-col>
    </el-row>
    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="id" label="编号" width="120" />
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="行程" width="160"><template #default="{ row }">{{ row.fromCity }} → {{ row.toCity }}</template></el-table-column>
        <el-table-column label="日期" width="200"><template #default="{ row }">{{ row.startDate }} ~ {{ row.endDate }}</template></el-table-column>
        <el-table-column prop="days" label="天数" width="70" />
        <el-table-column prop="purpose" label="目的" min-width="160" />
        <el-table-column label="预算" width="90"><template #default="{ row }">¥{{ row.budget?.total || 0 }}</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === '待审批'">
              <el-button size="small" type="success" @click="onApprove(row, '已通过')">批准</el-button>
              <el-button size="small" type="danger" @click="onApprove(row, '已驳回')">驳回</el-button>
            </template>
            <el-button size="small" type="danger" @click="onDelete(row)" :icon="Delete"></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="申请出差" width="560px">
      <el-form :model="dlg.form" label-width="90px">
        <el-row>
          <el-col :span="12"><el-form-item label="出发城市"><el-input v-model="dlg.form.fromCity" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目的城市" required><el-input v-model="dlg.form.toCity" /></el-form-item></el-col>
        </el-row>
        <el-row>
          <el-col :span="12"><el-form-item label="出发日期"><el-date-picker v-model="dlg.form.startDate" value-format="YYYY-MM-DD" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="返回日期"><el-date-picker v-model="dlg.form.endDate" value-format="YYYY-MM-DD" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="出差天数"><el-input-number v-model="dlg.form.days" :min="1" /></el-form-item>
        <el-form-item label="出差目的"><el-input v-model="dlg.form.purpose" type="textarea" :rows="2" /></el-form-item>
        <el-row>
          <el-col :span="6"><el-form-item label="交通"><el-input-number v-model="dlg.form.transport" :min="0" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="住宿"><el-input-number v-model="dlg.form.hotel" :min="0" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="餐饮"><el-input-number v-model="dlg.form.meal" :min="0" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="其他"><el-input-number v-model="dlg.form.other" :min="0" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import { getBusinessTrips, applyTrip, approveTrip, deleteTrip } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const records = ref([]);
const stats = ref({});
async function load() {
  const r = await getBusinessTrips();
  if (r.success) { records.value = r.data.trips || []; stats.value = r.data.stats || {}; }
}
onMounted(load);
function statusType(s) { return s === '已完成' ? 'success' : s === '已驳回' ? 'danger' : s === '出行中' ? 'info' : 'warning'; }

const dlg = reactive({ visible: false, saving: false, form: {} });
function openCreate() {
  dlg.form = { fromCity: '成都', toCity: '', startDate: '', endDate: '', days: 1, purpose: '', transport: 0, hotel: 0, meal: 0, other: 0 };
  dlg.visible = true;
}
async function onSubmit() {
  if (!dlg.form.toCity || !dlg.form.startDate) { ElMessage.warning('请填写目的城市和出发日期'); return; }
  dlg.saving = true;
  const total = (dlg.form.transport || 0) + (dlg.form.hotel || 0) + (dlg.form.meal || 0) + (dlg.form.other || 0);
  const r = await applyTrip({ applicant: auth.userName, ...dlg.form, budget: { transport: dlg.form.transport, hotel: dlg.form.hotel, meal: dlg.form.meal, other: dlg.form.other, total }, approver: '直属主管' });
  dlg.saving = false;
  if (r.success) { ElMessage.success('申请已提交'); dlg.visible = false; load(); }
}
async function onApprove(row, status) {
  const r = await approveTrip(row.id, { status, approver: auth.userName });
  if (r.success) { ElMessage.success(status === '已通过' ? '已批准' : '已驳回'); load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm(`确认删除出差申请「${row.id}」？`, '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteTrip(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>
