<template>
  <div class="trade-archive">
    <div class="page-header">
      <h2>合作方档案归档中心</h2>
      <p>客户和供应商档案归档管理</p>
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
        <el-table-column prop="apply_no" label="工单号" width="150" />
        <el-table-column prop="archive_no" label="档案编号" width="150">
          <template #default="{ row }">
            {{ row.archive_no || '未编号' }}
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ row.target_type === 'customer' ? '客户' : '供应商' }}
          </template>
        </el-table-column>
        <el-table-column prop="target_name" label="对象" width="150" />
        <el-table-column prop="biz_type" label="业务" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '已归档' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="filed_by" label="归档人" width="100" />
        <el-table-column prop="filed_at" label="归档时间" width="160" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '../api/request';

const kpis = ref([]);
const archives = ref([]);

async function loadData() {
  try {
    const [statsRes, listRes] = await Promise.all([
      request.get('/trade-archive/stats'),
      request.get('/trade-archive')
    ]);

    if (statsRes.data.success) {
      const s = statsRes.data.data;
      kpis.value = [
        { label: '归档总数', value: s.total, color: '#2563eb' },
        { label: '待归档', value: s.pending, color: '#f59e0b' },
        { label: '已归档', value: s.filed, color: '#10b981' },
        { label: '借阅中', value: s.borrowed, color: '#8b5cf6' }
      ];
    }

    if (listRes.data.success) {
      archives.value = listRes.data.data;
    }
  } catch (e) {
    console.error('加载归档数据失败:', e);
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.trade-archive {
  padding: 20px;
}
</style>
