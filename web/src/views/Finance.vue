<template>
  <div>
    <div class="page-header"><h2>财务管理</h2><p>应收应付与费用结构</p></div>

    <!-- 桌面端：4列KPI -->
    <el-row v-if="!isMobile" :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6" v-for="k in kpis" :key="k.label">
        <el-card shadow="hover"><div style="font-size: 13px; color: #909399;">{{ k.label }}</div><div style="font-size: 20px; font-weight: 700; margin-top: 4px;" :style="{ color: k.color }">{{ k.value }}</div></el-card>
      </el-col>
    </el-row>

    <!-- 移动端：2x2网格KPI -->
    <div v-else class="mobile-kpi-grid">
      <div v-for="k in kpis" :key="k.label" class="mobile-kpi-item">
        <div class="mobile-kpi-label">{{ k.label }}</div>
        <div class="mobile-kpi-value" :style="{ color: k.color }">{{ k.value }}</div>
      </div>
    </div>

    <!-- 桌面端：表格 + 图表 -->
    <el-row v-if="!isMobile" :gutter="16">
      <el-col :span="12">
        <el-card>
          <template #header>应收账款</template>
          <el-table :data="receivable" size="small">
            <el-table-column prop="customer" label="客户" min-width="140" />
            <el-table-column prop="amount" label="金额(万)" width="90" />
            <el-table-column prop="dueDate" label="到期日" width="110" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === '逾期' ? 'danger' : row.status === '即将到期' ? 'warning' : 'success'" size="small">{{ row.status }}</el-tag></template></el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>费用结构</template>
          <div ref="chart" style="height: 300px;"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 移动端：可折叠卡片 -->
    <div v-else class="mobile-finance">
      <el-collapse v-model="activeCollapse">
        <el-collapse-item title="💰 应收账款" name="receivable">
          <div v-if="receivable.length === 0" class="empty-text">暂无数据</div>
          <div v-for="item in receivable" :key="item.customer" class="receivable-item">
            <div class="receivable-header">
              <span class="customer-name">{{ item.customer }}</span>
              <el-tag :type="item.status === '逾期' ? 'danger' : item.status === '即将到期' ? 'warning' : 'success'" size="small">{{ item.status }}</el-tag>
            </div>
            <div class="receivable-detail">
              <span>金额：{{ item.amount }}万</span>
              <span>到期：{{ item.dueDate }}</span>
            </div>
          </div>
        </el-collapse-item>
        <el-collapse-item title="📊 费用结构" name="chart">
          <div ref="chart" style="height: 250px;"></div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as echarts from 'echarts';
import { getFinance } from '../api/modules';
import { useDevice } from '../composables/useDevice';

const { isMobile } = useDevice();
const data = ref({});
const chart = ref(null);
const activeCollapse = ref(['receivable']);
let inst = null;
const tm = computed(() => data.value.thisMonth || {});
const receivable = computed(() => data.value.receivable || []);
const kpis = computed(() => [
  { label: '本月收入(万)', value: tm.value.revenue ?? '-', color: '#2563eb' },
  { label: '本月支出(万)', value: tm.value.expense ?? '-', color: '#f59e0b' },
  { label: '利润(万)', value: tm.value.profit ?? '-', color: '#10b981' },
  { label: '预算执行率', value: (tm.value.budgetRate ?? '-') + '%', color: '#8b5cf6' },
]);

function rz() { inst && inst.resize(); }
onMounted(async () => {
  const r = await getFinance();
  if (r.success) data.value = r.data || {};
  inst = echarts.init(chart.value);
  const labels = data.value.expenseBreakdown?.labels || [];
  const vals = data.value.expenseBreakdown?.data || [];
  inst.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 20 } },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: vals, itemStyle: { color: '#f59e0b' } }],
  });
  window.addEventListener('resize', rz);
});
onUnmounted(() => { window.removeEventListener('resize', rz); inst && inst.dispose(); });
</script>

<style scoped>
.mobile-kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.mobile-kpi-item {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.mobile-kpi-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.mobile-kpi-value {
  font-size: 20px;
  font-weight: 700;
}

.mobile-finance {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.receivable-item {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.receivable-item:last-child {
  border-bottom: none;
}

.receivable-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.customer-name {
  font-weight: 600;
  color: #1f2937;
}

.receivable-detail {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

.empty-text {
  text-align: center;
  color: #909399;
  padding: 20px;
}
</style>
