<template>
  <div class="trade-finance">
    <div class="page-header">
      <h2>交易财务中心</h2>
      <p>业务单据财务同步与往来管理</p>
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

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <el-card>
          <template #header><strong>应付账款</strong></template>
          <el-table :data="apItems" stripe size="small">
            <el-table-column prop="source_no" label="来源单号" width="120" />
            <el-table-column prop="supplier_name" label="供应商" width="150" />
            <el-table-column label="金额" width="120">
              <template #default="{ row }">
                ¥{{ row.amount || 0 }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100" />
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card>
          <template #header><strong>应收账款</strong></template>
          <el-table :data="arItems" stripe size="small">
            <el-table-column prop="source_no" label="来源单号" width="120" />
            <el-table-column prop="customer_name" label="客户" width="150" />
            <el-table-column label="金额" width="120">
              <template #default="{ row }">
                ¥{{ row.amount || 0 }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '../api/request';

const kpis = ref([]);
const apItems = ref([]);
const arItems = ref([]);

async function loadData() {
  try {
    const [dashboardRes, apRes, arRes] = await Promise.all([
      request.get('/trade-finance/dashboard'),
      request.get('/trade-finance/ap'),
      request.get('/trade-finance/ar')
    ]);

    if (dashboardRes.data.success) {
      const d = dashboardRes.data.data;
      kpis.value = [
        { label: '应付余额', value: '¥' + d.ap_balance, color: '#ef4444' },
        { label: '应收余额', value: '¥' + d.ar_balance, color: '#10b981' },
        { label: '自动凭证', value: d.voucher_count, color: '#8b5cf6' },
        { label: '同步异常', value: d.sync_errors, color: '#f59e0b' }
      ];
    }

    if (apRes.data.success) {
      apItems.value = apRes.data.data;
    }

    if (arRes.data.success) {
      arItems.value = arRes.data.data;
    }
  } catch (e) {
    console.error('加载财务数据失败:', e);
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.trade-finance {
  padding: 20px;
}
</style>
