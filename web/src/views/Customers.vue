<template>
  <div>
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;">
      <div><h2>客户管理</h2><p>分级管理客户档案</p></div>
      <el-button v-if="canCreate" type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新增客户</el-button>
    </div>
    <el-card style="margin-bottom: 16px;">
      <el-row :gutter="12">
        <el-col :span="6">
          <el-select v-model="filter.level" placeholder="全部级别" clearable @change="() => {}">
            <el-option v-for="l in levels" :key="l.level" :label="`${l.level} - ${l.name}`" :value="l.level" />
          </el-select>
        </el-col>
        <el-col :span="6">
          <el-input v-model="filter.keyword" placeholder="搜索名称 / 联系人" clearable :prefix-icon="Search" />
        </el-col>
      </el-row>
    </el-card>
    <el-card>
      <el-table :data="filtered" stripe>
        <el-table-column prop="name" label="客户名称" min-width="180" />
        <el-table-column label="级别" width="90">
          <template #default="{ row }"><el-tag :color="lvlColor(row.level)" effect="dark">{{ row.level }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column prop="owner" label="负责人" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="成交额" width="130">
          <template #default="{ row }">¥{{ (row.dealAmount || 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openFollowup(row)">跟进</el-button>
            <el-button size="small" type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑客户' : '新增客户'" width="560px">
      <el-form :model="dialog.form" label-width="90px">
        <el-form-item label="客户名称" required><el-input v-model="dialog.form.name" /></el-form-item>
        <el-form-item label="简称"><el-input v-model="dialog.form.shortName" /></el-form-item>
        <el-form-item label="联系人" required><el-input v-model="dialog.form.contact" /></el-form-item>
        <el-form-item label="电话" required><el-input v-model="dialog.form.phone" /></el-form-item>
        <el-form-item label="级别">
          <el-select v-model="dialog.form.level">
            <el-option v-for="l in levels" :key="l.level" :label="`${l.level} - ${l.name}`" :value="l.level" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人"><el-input v-model="dialog.form.owner" /></el-form-item>
        <el-form-item label="行业"><el-input v-model="dialog.form.industry" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 跟进 -->
    <el-dialog v-model="followup.visible" title="添加跟进记录" width="480px">
      <el-form label-width="80px">
        <el-form-item label="客户">{{ followup.customer?.name }}</el-form-item>
        <el-form-item label="方式">
          <el-select v-model="followup.form.type">
            <el-option label="拜访" value="拜访" />
            <el-option label="电话" value="电话" />
            <el-option label="会议" value="会议" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容"><el-input v-model="followup.form.content" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="followup.visible = false">取消</el-button>
        <el-button type="primary" :loading="followup.saving" @click="onFollowup">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { getCustomers, addCustomer, updateCustomer, deleteCustomer, addFollowUp } from '../api/modules';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const list = ref([]);
const levels = ref([]);
const filter = reactive({ level: '', keyword: '' });

// 新增客户权限：管理层 + 财务专员 + 人事专员
const canCreate = computed(() => {
  if (!auth.user) return false;
  const role = auth.user.role;
  // 管理层
  if (['总经理', '副总', '销售总监', '部门经理', '区域经理'].includes(role)) return true;
  // 特定角色
  if (role === '财务专员' || role === '人事专员') return true;
  return false;
});

const filtered = computed(() =>
  list.value.filter((c) => {
    if (filter.level && c.level !== filter.level) return false;
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      if (!(c.name || '').toLowerCase().includes(kw) && !(c.contact || '').toLowerCase().includes(kw)) return false;
    }
    return true;
  })
);

async function load() {
  const [cres, lres] = await Promise.all([getCustomers(), request.get('/customerLevels')]);
  if (cres.success) list.value = cres.data || [];
  if (lres.success) levels.value = lres.data || [];
}
onMounted(load);

function lvlColor(l) {
  return levels.value.find((x) => x.level === l)?.color || '#94a3b8';
}
function statusType(s) {
  return s === '合作中' ? 'success' : s === '跟进中' ? 'warning' : s === '谈判中' ? 'primary' : 'info';
}

const dialog = reactive({ visible: false, isEdit: false, saving: false, form: {} });
function openCreate() {
  dialog.isEdit = false;
  dialog.form = { level: 'D', owner: '', industry: '', shortName: '', contact: '', phone: '', name: '' };
  dialog.visible = true;
}
function openEdit(row) {
  dialog.isEdit = true;
  dialog.form = { ...row };
  dialog.visible = true;
}
async function onSubmit() {
  if (!dialog.form.name || !dialog.form.contact || !dialog.form.phone) {
    ElMessage.warning('请填写必填项（名称、联系人、电话）');
    return;
  }
  dialog.saving = true;
  const r = dialog.isEdit ? await updateCustomer(dialog.form.id, dialog.form) : await addCustomer(dialog.form);
  dialog.saving = false;
  if (r.success) {
    ElMessage.success('保存成功');
    dialog.visible = false;
    load();
  }
}

const followup = reactive({ visible: false, saving: false, customer: null, form: { type: '拜访', content: '' } });
function openFollowup(row) {
  followup.customer = row;
  followup.form = { type: '拜访', content: '' };
  followup.visible = true;
}
async function onFollowup() {
  if (!followup.form.content) {
    ElMessage.warning('请输入跟进内容');
    return;
  }
  followup.saving = true;
  const r = await addFollowUp(followup.customer.id, {
    date: new Date().toISOString().slice(0, 10),
    type: followup.form.type,
    content: followup.form.content,
    operator: auth.userName,
  });
  followup.saving = false;
  if (r.success) {
    ElMessage.success('跟进已添加');
    followup.visible = false;
    load();
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除客户「${row.name}」？`, '提示', { type: 'warning' });
  } catch {
    return;
  }
  const r = await deleteCustomer(row.id);
  if (r.success) {
    ElMessage.success('已删除');
    load();
  }
}
</script>
