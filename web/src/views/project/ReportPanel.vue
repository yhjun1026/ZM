<template>
  <div v-loading="loading">
    <template v-if="report">
      <div class="pm-stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
        <StatCard label="项目总数" :value="report.overview?.total || 0" :icon="Folder" color="#2563eb" />
        <StatCard label="已完结" :value="report.overview?.finished || 0" :icon="CircleCheck" color="#10b981" />
        <StatCard label="逾期任务" :value="report.overview?.overdueTasks || 0" :icon="Warning" color="#ef4444" />
        <StatCard label="销售回款率" :value="(report.sales?.paymentRate ?? 0) + '%'" :icon="Coin" color="#0ea5e9" />
        <StatCard label="销售交付完成率" :value="(report.sales?.deliverRate ?? 0) + '%'" :icon="Van" color="#f59e0b" />
        <StatCard label="AI延期率" :value="(report.ai?.delayRate ?? 0) + '%'" :icon="Clock" color="#dc2626" />
        <StatCard label="AI落地率" :value="(report.ai?.landingRate ?? 0) + '%'" :icon="Promotion" color="#8b5cf6" />
        <StatCard label="缺陷修复率" :value="(report.ai?.bugFixRate ?? 0) + '%'" :icon="Tools" color="#7c3aed" />
      </div>
      <el-row :gutter="20">
        <el-col :xs="24" :md="12">
          <h4 style="margin-bottom: 8px;">各部门项目排行</h4>
          <el-table :data="report.deptRanking || []" size="small" border>
            <el-table-column prop="dept" label="部门" />
            <el-table-column prop="total" label="项目数" width="100" />
            <el-table-column label="销售合同额" width="140">
              <template #default="{ row }">{{ fmtMoney(row.amount) }}</template>
            </el-table-column>
            <template #empty><span class="pm-muted">暂无数据</span></template>
          </el-table>
        </el-col>
        <el-col :xs="24" :md="12">
          <h4 style="margin-bottom: 8px;">成员工作负荷</h4>
          <el-table :data="(report.workload || []).slice(0, 10)" size="small" border>
            <el-table-column prop="owner" label="成员" />
            <el-table-column prop="total" label="任务总数" width="90" />
            <el-table-column prop="done" label="已完成" width="80" />
            <el-table-column label="逾期" width="80">
              <template #default="{ row }">
                <span :style="{ color: row.overdue ? '#ef4444' : 'inherit' }">{{ row.overdue }}</span>
              </template>
            </el-table-column>
            <template #empty><span class="pm-muted">暂无数据</span></template>
          </el-table>
        </el-col>
      </el-row>
    </template>
    <p v-else-if="!loading" class="pm-muted">报表加载失败</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { Folder, CircleCheck, Warning, Coin, Van, Clock, Promotion, Tools } from '@element-plus/icons-vue';
import StatCard from './StatCard.vue';
import { projectsApi, fmtMoney } from './api';

const loading = ref(false);
const report = ref(null);

onMounted(async () => {
  loading.value = true;
  const resp = await projectsApi.report();
  loading.value = false;
  if (resp.code === 200) report.value = resp.data || {};
});
</script>

<style scoped>
.pm-stats-grid {
  display: grid;
  gap: 16px;
  margin-bottom: 20px;
}
.pm-muted {
  color: var(--el-text-color-secondary);
}
</style>
