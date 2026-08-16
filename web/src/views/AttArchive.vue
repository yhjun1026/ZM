<template>
  <div class="att-archive">
    <div class="page-header">
      <h2>请假出差归档管理</h2>
      <p>请假单和出差单归档台账</p>
    </div>

    <!-- KPI卡片 -->
    <el-row :gutter="16" style="margin-bottom: 20px;">
      <el-col :xs="12" :sm="6" v-for="kpi in kpis" :key="kpi.label">
        <el-card shadow="hover">
          <div style="text-align: center;">
            <div style="font-size: 13px; color: #909399;">{{ kpi.label }}</div>
            <div style="font-size: 24px; font-weight: 700; margin-top: 8px;" :style="{ color: kpi.color }">
              {{ kpi.value }}
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 归档列表 -->
    <el-card>
      <template #header><strong>归档台账</strong></template>
      <el-table :data="archives" stripe>
        <el-table-column prop="archive_no" label="档案编号" width="150">
          <template #default="{ row }">
            {{ row.archive_no || '未编号' }}
          </template>
        </el-table-column>
        <el-table-column prop="form_type_name" label="类型" width="100" />
        <el-table-column prop="applicant" label="申请人" width="100" />
        <el-table-column prop="dept" label="部门" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '已归档' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="filed_by" label="归档人" width="100" />
        <el-table-column prop="filed_at" label="归档时间" width="160" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.status === '待归档' && canFile" size="small" type="primary" @click="handleFile(row)">
              归档
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const canFile = computed(() => auth.user?.dept === '行政部');

const kpis = ref([]);
const archives = ref([]);

async function loadData() {
  try {
    const [statsRes, listRes] = await Promise.all([
      request.get('/att-archive/stats'),
      request.get('/att-archive')
    ]);

    if (statsRes.data.success) {
      const s = statsRes.data.data;
      kpis.value = [
        { label: '归档总数', value: s.total, color: '#2563eb' },
        { label: '待归档', value: s.pending, color: '#f59e0b' },
        { label: '已归档', value: s.filed, color: '#10b981' },
        { label: '异常单据', value: s.abnormal, color: '#ef4444' }
      ];
    }

    if (listRes.data.success) {
      archives.value = listRes.data.data;
    }
  } catch (e) {
    console.error('加载归档数据失败:', e);
  }
}

async function handleFile(row) {
  try {
    const res = await request.post(`/att-archive/${row.id}/file`);
    if (res.data.success) {
      ElMessage.success('归档成功');
      loadData();
    } else {
      ElMessage.error(res.data.message || '归档失败');
    }
  } catch (e) {
    ElMessage.error('归档失败');
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.att-archive {
  padding: 20px;
}
</style>
