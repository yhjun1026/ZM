<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>权限管理</h2><p>权限矩阵与审批</p></div>
      <el-button type="primary" @click="openApply"><el-icon><Plus /></el-icon> 申请权限</el-button>
    </div>

    <!-- 角色列表卡片 -->
    <el-card style="margin-bottom: 16px;">
      <template #header>角色列表</template>
      <el-row :gutter="16">
        <el-col v-for="(role, index) in roles" :key="index" :xs="24" :sm="12" :md="8" :lg="6" style="margin-bottom: 16px;">
          <div class="role-card" :style="{ borderColor: role.color }">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <div class="role-dot" :style="{ backgroundColor: role.color }"></div>
              <strong style="font-size: 16px;">{{ role.name }}</strong>
            </div>
            <p style="color: #909399; font-size: 13px; margin: 8px 0;">{{ role.desc }}</p>
            <p :style="{ color: role.color, fontSize: '12px', fontWeight: 'bold' }">
              用户数：{{ role.users }}
            </p>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 功能模块权限矩阵 -->
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

    <!-- 权限审批 -->
    <el-card style="margin-bottom: 16px;">
      <template #header>权限审批</template>
      <el-table :data="approvals" stripe>
        <el-table-column prop="id" label="编号" width="100" />
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="目标权限" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="m in (row.target_modules || [])" :key="m" size="small" style="margin-right: 4px;">
              {{ m }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="160" />
        <el-table-column prop="urgency" label="紧急度" width="80">
          <template #default="{ row }">
            <el-tag :type="row.urgency === '紧急' ? 'danger' : 'info'" size="small">
              {{ row.urgency }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === '已通过' ? 'success' : row.status === '已拒绝' ? 'danger' : 'warning'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
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

    <!-- 审计日志 -->
    <el-card>
      <template #header>权限审计日志</template>
      <!-- 桌面端表格 -->
      <el-table :data="auditLogs" stripe class="hidden-sm-and-down">
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column prop="operator" label="操作人" width="120" />
        <el-table-column prop="action" label="操作" width="120" />
        <el-table-column prop="target" label="目标" min-width="150" />
        <el-table-column prop="detail" label="详情" min-width="200" />
      </el-table>

      <!-- 移动端卡片展示 -->
      <div class="hidden-md-and-up">
        <div v-if="auditLogs.length === 0" style="text-align: center; color: #909399; padding: 20px;">
          暂无日志
        </div>
        <el-card v-for="(log, index) in auditLogs" :key="index" shadow="hover" style="margin-bottom: 12px;">
          <div style="font-size: 13px;">
            <div style="margin-bottom: 8px;">
              <span style="color: #606266;">时间：</span>
              <span>{{ log.time }}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #606266;">操作人：</span>
              <el-tag size="small">{{ log.operator }}</el-tag>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #606266;">操作：</span>
              <el-tag type="info" size="small">{{ log.action }}</el-tag>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="color: #606266;">目标：</span>
              <span>{{ log.target }}</span>
            </div>
            <div>
              <span style="color: #606266;">详情：</span>
              <span>{{ log.detail }}</span>
            </div>
          </div>
        </el-card>
      </div>
    </el-card>

    <el-dialog v-model="dlg.visible" title="申请权限" width="480px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="目标角色">
          <el-select v-model="dlg.form.targetRole">
            <el-option v-for="r in pm.roles" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标模块">
          <el-checkbox-group v-model="dlg.form.targetModules">
            <el-checkbox v-for="m in pm.modules" :key="m" :label="m" :value="m">{{ m }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="紧急度">
          <el-radio-group v-model="dlg.form.urgency">
            <el-radio value="普通">普通</el-radio>
            <el-radio value="紧急">紧急</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="dlg.form.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getPermission, applyPermission, approvePermission, getPermissionRoles, getPermissionAuditLogs } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const pm = ref({ modules: [], roles: [], data: [] });
const approvals = ref([]);
const roles = ref([]);
const auditLogs = ref([]);
const matrixData = computed(() => (pm.value.modules || []).map((m, i) => ({ module: m, vals: pm.value.data[i] || [] })));

async function load() {
  const r = await getPermission();
  if (r.success) {
    pm.value = r.data.permMatrix || {};
    approvals.value = r.data.approvals || [];
  }

  // 加载角色列表
  const rolesResp = await getPermissionRoles();
  if (rolesResp.success) {
    roles.value = rolesResp.data || [];
  }

  // 加载审计日志
  const logsResp = await getPermissionAuditLogs();
  if (logsResp.success) {
    auditLogs.value = logsResp.data || [];
  }
}

onMounted(load);

const dlg = reactive({ visible: false, saving: false, form: { targetRole: '', targetModules: [], urgency: '普通', reason: '' } });

function openApply() {
  dlg.form = { targetRole: pm.value.roles?.[0] || '', targetModules: [], urgency: '普通', reason: '' };
  dlg.visible = true;
}

async function onSubmit() {
  if (!dlg.form.targetModules.length || !dlg.form.reason) {
    ElMessage.warning('请选择模块并填写原因');
    return;
  }
  dlg.saving = true;
  const r = await applyPermission({
    applicant: auth.userName,
    applicantRole: auth.userRole,
    ...dlg.form,
    approver: '直属主管'
  });
  dlg.saving = false;
  if (r.success) {
    ElMessage.success('申请已提交');
    dlg.visible = false;
    load();
  }
}

async function onApprove(row, status) {
  const r = await approvePermission(row.id, {
    status,
    remark: status === '已通过' ? '审批通过' : '审批拒绝'
  });
  if (r.success) {
    ElMessage.success(status === '已通过' ? '已通过' : '已拒绝');
    load();
  }
}
</script>

<style scoped>
.role-card {
  padding: 16px;
  border-radius: 12px;
  border: 2px solid #e4e7ed;
  transition: all 0.3s ease;
  height: 100%;
  box-sizing: border-box;
}

.role-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.role-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

/* 响应式隐藏类 */
@media (max-width: 768px) {
  .hidden-sm-and-down {
    display: none !important;
  }
}

@media (min-width: 769px) {
  .hidden-md-and-up {
    display: none !important;
  }
}
</style>