<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>权限管理</h2><p>权限矩阵与审批</p></div>
      <el-button type="primary" @click="openApply"><el-icon><Plus /></el-icon> 申请权限</el-button>
    </div>
    <el-card style="margin-bottom: 16px;">
      <template #header>功能模块权限矩阵</template>
      <el-table :data="matrixData" size="small" border>
        <el-table-column prop="module" label="模块" width="130" fixed />
        <el-table-column v-for="(role, i) in pm.roles" :key="i" :label="role" min-width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.vals[i] === 1 ? 'success' : row.vals[i] === 0.5 ? 'warning' : 'info'" size="small">
              {{ row.vals[i] === 1 ? '完全' : row.vals[i] === 0.5 ? '部分' : '无' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    <el-card>
      <template #header>权限审批</template>
      <el-table :data="approvals" stripe>
        <el-table-column prop="id" label="编号" width="100" />
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="目标权限" min-width="160"><template #default="{ row }"><el-tag v-for="m in (row.target_modules || [])" :key="m" size="small" style="margin-right: 4px;">{{ m }}</el-tag></template></el-table-column>
        <el-table-column prop="reason" label="原因" min-width="160" />
        <el-table-column prop="urgency" label="紧急度" width="80"><template #default="{ row }"><el-tag :type="row.urgency === '紧急' ? 'danger' : 'info'" size="small">{{ row.urgency }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === '已通过' ? 'success' : row.status === '已拒绝' ? 'danger' : 'warning'" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === '待审批'">
              <el-button size="small" type="success" @click="onApprove(row, '已通过')">通过</el-button>
              <el-button size="small" type="danger" @click="onApprove(row, '已拒绝')">拒绝</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="申请权限" width="480px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="目标角色"><el-select v-model="dlg.form.targetRole"><el-option v-for="r in pm.roles" :key="r" :label="r" :value="r" /></el-select></el-form-item>
        <el-form-item label="目标模块">
          <el-checkbox-group v-model="dlg.form.targetModules">
            <el-checkbox v-for="m in pm.modules" :key="m" :label="m" :value="m">{{ m }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="紧急度"><el-radio-group v-model="dlg.form.urgency"><el-radio value="普通">普通</el-radio><el-radio value="紧急">紧急</el-radio></el-radio-group></el-form-item>
        <el-form-item label="原因"><el-input v-model="dlg.form.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getPermission, applyPermission, approvePermission } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const pm = ref({ modules: [], roles: [], data: [] });
const approvals = ref([]);
const matrixData = computed(() => (pm.value.modules || []).map((m, i) => ({ module: m, vals: pm.value.data[i] || [] })));
async function load() {
  const r = await getPermission();
  if (r.success) { pm.value = r.data.permMatrix || {}; approvals.value = r.data.approvals || []; }
}
onMounted(load);

const dlg = reactive({ visible: false, saving: false, form: { targetRole: '', targetModules: [], urgency: '普通', reason: '' } });
function openApply() { dlg.form = { targetRole: pm.value.roles?.[0] || '', targetModules: [], urgency: '普通', reason: '' }; dlg.visible = true; }
async function onSubmit() {
  if (!dlg.form.targetModules.length || !dlg.form.reason) { ElMessage.warning('请选择模块并填写原因'); return; }
  dlg.saving = true;
  const r = await applyPermission({ applicant: auth.userName, applicantRole: auth.userRole, ...dlg.form, approver: '直属主管' });
  dlg.saving = false;
  if (r.success) { ElMessage.success('申请已提交'); dlg.visible = false; load(); }
}
async function onApprove(row, status) {
  const r = await approvePermission(row.id, { status, remark: status === '已通过' ? '审批通过' : '审批拒绝' });
  if (r.success) { ElMessage.success(status === '已通过' ? '已通过' : '已拒绝'); load(); }
}
</script>
