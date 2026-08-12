<template>
  <div>
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;">
      <div><h2>假期申请</h2><p>在线申请与审批</p></div>
      <el-button type="primary" @click="openApply"><el-icon><Plus /></el-icon> 申请假期</el-button>
    </div>
    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="applicant" label="申请人" width="100" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }"><el-tag>{{ row.type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="startDate" label="起始" width="120" />
        <el-table-column prop="endDate" label="结束" width="120" />
        <el-table-column prop="days" label="天数" width="80" />
        <el-table-column prop="reason" label="原因" min-width="160" />
        <el-table-column prop="approver" label="审批人" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === '待审批' && canApprove">
              <el-button size="small" type="success" @click="onApprove(row, '已通过')">通过</el-button>
              <el-button size="small" type="danger" @click="onApprove(row, '已驳回')">驳回</el-button>
            </template>
            <span v-else style="color: #c0c4cc;">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="apply.visible" title="申请假期" width="480px">
      <el-form :model="apply.form" label-width="80px">
        <el-form-item label="类型">
          <el-select v-model="apply.form.type">
            <el-option v-for="t in leaveTypes" :key="t.type" :label="t.type" :value="t.type" />
          </el-select>
        </el-form-item>
        <el-form-item label="起止">
          <el-date-picker v-model="apply.range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" />
        </el-form-item>
        <el-form-item label="原因"><el-input v-model="apply.form.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="apply.visible = false">取消</el-button>
        <el-button type="primary" :loading="apply.saving" @click="onApply">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getLeave, applyLeave, approveLeave } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const records = ref([]);
const leaveTypes = ref([]);

// 审批权限：非普通员工才能审批
const canApprove = computed(() => {
  return auth.user && auth.user.role !== '普通员工';
});

async function load() {
  const r = await getLeave();
  if (r.success) {
    records.value = r.data.records || [];
    leaveTypes.value = r.data.leaveTypes || [];
  }
}
onMounted(load);

function statusType(s) {
  return s === '已通过' ? 'success' : s === '待审批' ? 'warning' : 'danger';
}

const apply = reactive({ visible: false, saving: false, form: { type: '', reason: '' }, range: [] });
function openApply() {
  apply.form = { type: leaveTypes.value[0]?.type || '年假', reason: '' };
  apply.range = [];
  apply.visible = true;
}
async function onApply() {
  if (!apply.range || !apply.range.length || !apply.form.reason) {
    ElMessage.warning('请填写起止日期和原因');
    return;
  }
  apply.saving = true;
  const days = Math.max(1, Math.round((new Date(apply.range[1]) - new Date(apply.range[0])) / 86400000) + 1);
  const r = await applyLeave({
    applicant: auth.userName,
    type: apply.form.type,
    startDate: apply.range[0],
    endDate: apply.range[1],
    days,
    reason: apply.form.reason,
    approver: '直属主管',
  });
  apply.saving = false;
  if (r.success) {
    ElMessage.success('申请已提交');
    apply.visible = false;
    load();
  }
}

async function onApprove(row, status) {
  const r = await approveLeave(row.id, { status, approver: auth.userName });
  if (r.success) {
    ElMessage.success(status === '已通过' ? '已通过' : '已驳回');
    load();
  }
}
</script>
