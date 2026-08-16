<template>
  <div class="contract-template">
    <div class="page-header">
      <h2>合同模板库</h2>
      <p>合同模板管理与审批</p>
    </div>

    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>模板列表</strong>
          <el-button v-if="canManage" type="primary" size="small" @click="showDialog = true">
            <el-icon><Plus /></el-icon> 新增模板
          </el-button>
        </div>
      </template>
      <el-table :data="templates" stripe>
        <el-table-column prop="name" label="模板名称" min-width="200" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建人" width="100" />
        <el-table-column prop="created_at" label="创建时间" width="160" />
      </el-table>
    </el-card>

    <el-dialog v-model="showDialog" title="新增合同模板" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="模板名称">
          <el-input v-model="form.name" placeholder="请输入模板名称" />
        </el-form-item>
        <el-form-item label="模板分类">
          <el-select v-model="form.category" style="width: 100%;">
            <el-option label="采购合同" value="采购合同" />
            <el-option label="销售合同" value="销售合同" />
            <el-option label="服务合同" value="服务合同" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板内容">
          <el-input v-model="form.content" type="textarea" :rows="6" placeholder="请输入模板内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const canManage = computed(() => auth.user?.dept === '行政部');

const templates = ref([]);
const showDialog = ref(false);
const form = ref({ name: '', category: '', content: '' });

async function loadTemplates() {
  try {
    const res = await request.get('/contract-template');
    if (res.data.success) {
      templates.value = res.data.data;
    }
  } catch (e) {
    console.error('加载模板失败:', e);
  }
}

async function handleCreate() {
  try {
    const res = await request.post('/contract-template', form.value);
    if (res.data.success) {
      ElMessage.success('模板创建成功');
      showDialog.value = false;
      loadTemplates();
    } else {
      ElMessage.error(res.data.message || '创建失败');
    }
  } catch (e) {
    ElMessage.error('创建失败');
  }
}

onMounted(() => {
  loadTemplates();
});
</script>

<style scoped>
.contract-template {
  padding: 20px;
}
</style>
