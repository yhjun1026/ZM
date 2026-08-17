<template>
  <div class="permission-page">
    <!-- 权限分配（仅超级管理员） -->
    <el-card v-if="canEdit" class="mb-16" style="border-left: 4px solid #dc2626;">
      <template #header>
        <div>
          <h3 style="margin: 0;">
            <el-icon color="#dc2626" style="margin-right: 8px; vertical-align: -2px;"><Key /></el-icon>权限分配
          </h3>
          <p class="text-muted" style="font-size: 13px; margin: 4px 0 0;">仅超级管理员可操作 — 选择用户后修改其系统角色和合同角色</p>
        </div>
      </template>
      <el-table :data="users" stripe>
        <el-table-column label="工号" width="100">
          <template #default="{ row }">{{ row.emp_id || row.id }}</template>
        </el-table-column>
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="dept" label="部门" width="110" />
        <el-table-column label="系统角色" width="110">
          <template #default="{ row }">
            <el-tag type="primary" size="small">{{ row.role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分配系统角色" min-width="150">
          <template #default="{ row }">
            <el-select
              v-model="row._newRole"
              size="small"
              style="width: 140px;"
              :disabled="row.role === '超级管理员'"
            >
              <el-option v-for="r in ROLES" :key="r" :label="r" :value="r" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="合同角色" width="130">
          <template #default="{ row }">
            <span
              class="role-tag"
              :style="row.contract_role
                ? 'background:#7c3aed;color:#fff;'
                : 'background:#e5e7eb;color:#6b7280;'"
            >{{ row.contract_role || '（自动映射）' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="分配合同角色" min-width="150">
          <template #default="{ row }">
            <el-select v-model="row._newContractRole" size="small" style="width: 140px;">
              <el-option label="自动映射" value="" />
              <el-option v-for="r in CONTRACT_ROLES" :key="r" :label="r" :value="r" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <span v-if="row.role === '超级管理员'" class="text-muted" style="margin-right: 8px;">超管</span>
            <el-button v-else size="small" type="primary" @click="saveUserRole(row)">
              <el-icon><Check /></el-icon> 角色
            </el-button>
            <el-button size="small" class="btn-purple" @click="saveUserContractRole(row)">
              <el-icon><Lock /></el-icon> 合同角色
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 角色列表 -->
    <el-card class="mb-16">
      <template #header><h3 style="margin: 0;">角色列表</h3></template>
      <div class="role-grid">
        <div v-for="r in roles" :key="r.name" class="role-card">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="role-dot" :style="{ background: r.color }"></div>
            <strong>{{ r.name }}</strong>
          </div>
          <p class="text-muted" style="font-size: 13px; margin: 8px 0 4px;">{{ r.desc }}</p>
          <p style="font-size: 12px; margin: 0;" :style="{ color: r.color }">用户数：{{ r.users }}</p>
        </div>
      </div>
    </el-card>

    <!-- 权限矩阵 -->
    <el-card class="mb-16">
      <template #header><h3 style="margin: 0;">权限矩阵</h3></template>
      <div style="overflow-x: auto;">
        <el-table :data="matrixRows" size="small" border>
          <el-table-column prop="module" label="模块\角色" width="130" fixed>
            <template #default="{ row }"><strong>{{ row.module }}</strong></template>
          </el-table-column>
          <el-table-column
            v-for="(role, i) in matrix.roles"
            :key="role"
            :label="role"
            min-width="70"
            align="center"
          >
            <template #default="{ row }">
              <span class="matrix-cell" :style="{ background: cellBg(row.cells[i]) }">
                {{ cellText(row.cells[i]) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <!-- 权限审计日志 -->
    <el-card>
      <template #header><h3 style="margin: 0;">权限审计日志</h3></template>
      <el-table :data="logs" stripe>
        <el-table-column prop="time" label="时间" width="170" />
        <el-table-column prop="operator" label="操作人" width="110" />
        <el-table-column prop="action" label="操作" width="130" />
        <el-table-column prop="target" label="目标" min-width="140" />
        <el-table-column prop="detail" label="详情" min-width="200" />
        <template #empty><span class="text-muted">暂无日志</span></template>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Key, Check, Lock } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

const ROLES = [
  '超级管理员', '总经理', '副总', '销售总监', '部门经理',
  '区域经理', '普通员工', '人事专员'
];
const CONTRACT_ROLES = [
  '经办人', '部门负责人', '法务专员', '财务审核', '分管领导',
  '总经理', '印章管理员', '合同档案管理员', '系统超级管理员'
];

const canEdit = computed(() => auth.user?.role === '超级管理员');

const roles = ref([]);
const matrix = ref({ modules: [], roles: [], data: [] });
const users = ref([]);
const logs = ref([]);

// 参考项目：matrix.data 按角色为行，列下标对应模块
const matrixRows = computed(() =>
  (matrix.value.modules || []).map((mod, mi) => ({
    module: mod,
    cells: (matrix.value.data || []).map(row => row[mi])
  }))
);

function cellBg(v) {
  return v === 1 ? '#d1fae5' : v === 0.5 ? '#fef3c7' : '#f3f4f6';
}
function cellText(v) {
  return v === 1 ? '完全' : v === 0.5 ? '部分' : '无';
}

async function load() {
  const [rolesResp, matrixResp, usersResp, logsResp] = await Promise.all([
    request.get('/permissions/roles'),
    request.get('/permissions/matrix'),
    request.get('/permissions/system-users'),
    request.get('/permissions/audit-logs')
  ]);
  if (rolesResp.code !== 200) {
    ElMessage.error(rolesResp.msg || '加载失败');
    return;
  }
  roles.value = rolesResp.data || [];
  matrix.value = matrixResp.data || { modules: [], roles: [], data: [] };
  users.value = (usersResp.data || []).map(u => ({
    ...u,
    _newRole: u.role,
    _newContractRole: u.contract_role || ''
  }));
  logs.value = logsResp.data || [];
}

async function saveUserRole(row) {
  const newRole = row._newRole;
  try {
    await ElMessageBox.confirm(`确认将此用户的角色修改为「${newRole}」？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  const res = await request.put(`/permissions/users/${row.id}/role`, { role: newRole });
  if (res.code === 200) {
    ElMessage.success(res.msg || '权限已更新');
    load();
  } else {
    ElMessage.error(res.msg || '操作失败');
  }
}

async function saveUserContractRole(row) {
  const newContractRole = row._newContractRole;
  const label = newContractRole || '自动映射（根据系统角色推断）';
  try {
    await ElMessageBox.confirm(`确认将此用户的合同角色修改为「${label}」？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  const res = await request.put(`/permissions/users/${row.id}/contract-role`, { contractRole: newContractRole });
  if (res.code === 200) {
    ElMessage.success(res.msg || '合同角色已更新');
    load();
  } else {
    ElMessage.error(res.msg || '操作失败');
  }
}

onMounted(load);
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}
.text-muted {
  color: #909399;
}
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.role-card {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
}
.role-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.role-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
}
.matrix-cell {
  display: block;
  padding: 4px 0;
  border-radius: 4px;
  text-align: center;
  font-size: 12px;
}
.btn-purple {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}
.btn-purple:hover,
.btn-purple:focus {
  background: #6d28d9;
  border-color: #6d28d9;
  color: #fff;
}
</style>
