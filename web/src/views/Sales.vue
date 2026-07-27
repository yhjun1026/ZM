<template>
  <div>
    <div class="page-header"><h2>销售统计</h2><p>销售业绩与漏斗分析</p></div>
    <el-row :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6">
        <el-card><div style="font-size: 13px; color: #909399;">本月收入</div><div style="font-size: 22px; font-weight: 700; color: #2563eb;">¥{{ fmt(tm.revenue) }}</div><div style="font-size: 12px; color: #909399;">目标达成 {{ tm.rate }}%</div></el-card>
      </el-col>
      <el-col :span="6">
        <el-card><div style="font-size: 13px; color: #909399;">成单数</div><div style="font-size: 22px; font-weight: 700;">{{ tm.deals }}</div><div style="font-size: 12px; color: #909399;">均价 ¥{{ fmt(tm.avgDeal) }}</div></el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <div style="font-size: 13px; color: #909399; margin-bottom: 8px;">销售漏斗</div>
          <div style="display: flex; gap: 8px;">
            <div v-for="(v, k) in pipeline" :key="k" style="flex: 1; text-align: center; background: #f5f7fa; border-radius: 6px; padding: 10px 4px;">
              <div style="font-size: 20px; font-weight: 700; color: #2563eb;">{{ v }}</div>
              <div style="font-size: 12px; color: #909399;">{{ k }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card>
          <template #header>各区域销售</template>
          <el-table :data="territory" size="small">
            <el-table-column prop="region" label="区域" />
            <el-table-column prop="revenue" label="收入(万)" />
            <el-table-column prop="deals" label="单数" />
            <el-table-column label="达成率">
              <template #default="{ row }">{{ row.rate }}%</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>产品收入分布</template>
          <div ref="chart" style="height: 300px;"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as echarts from 'echarts';
import { getSales } from '../api/modules';

const data = ref({});
const chart = ref(null);
let inst = null;
const tm = computed(() => data.value.thisMonth || {});
const pipeline = computed(() => data.value.pipeline || {});
const territory = computed(() => data.value.territory || []);
function fmt(n) { return Number(n || 0).toLocaleString(); }

function rz() { inst && inst.resize(); }
onMounted(async () => {
  const r = await getSales();
  if (r.success) data.value = r.data || {};
  inst = echarts.init(chart.value);
  const labels = data.value.productRevenue?.labels || [];
  const vals = data.value.productRevenue?.data || [];
  inst.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['40%', '70%'], data: labels.map((l, i) => ({ name: l, value: vals[i] })) }],
  });
  window.addEventListener('resize', rz);
});
onUnmounted(() => { window.removeEventListener('resize', rz); inst && inst.dispose(); });
</script>
