<template>
  <div class="finance-module">
    <div class="module-header">
      <h2><el-icon><Money /></el-icon> 财务管理中心</h2>
    </div>
    <el-tabs v-model="activeTab" class="fin-tabs" @tab-change="onTabChange">
      <el-tab-pane v-for="t in visibleTabs" :key="t.id" :name="t.id">
        <template #label>
          <span class="fin-tab-label">
            <el-icon><component :is="t.icon" /></el-icon> {{ t.label }}
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>
    <div class="fin-tab-content">
      <component :is="activeComponent" :key="activeTab" @switch-tab="switchTab" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Money, Odometer, Download, Document, Coin, Tickets, CreditCard, PieChart, Tools,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { getAllowedFinTabs } from './finance/finUtils';
import OverviewTab from './finance/OverviewTab.vue';
import ReceivableTab from './finance/ReceivableTab.vue';
import ExpenseTab from './finance/ExpenseTab.vue';
import LoanTab from './finance/LoanTab.vue';
import InvoiceTab from './finance/InvoiceTab.vue';
import PaymentTab from './finance/PaymentTab.vue';
import BudgetTab from './finance/BudgetTab.vue';
import ConfigTab from './finance/ConfigTab.vue';

const auth = useAuthStore();

// 对应 FIN_TAB_DEFS
const FIN_TAB_DEFS = [
  { id: 'overview', icon: Odometer, label: '总览看板', comp: OverviewTab },
  { id: 'receivable', icon: Download, label: '应收账款', comp: ReceivableTab },
  { id: 'expense', icon: Document, label: '费用报销', comp: ExpenseTab },
  { id: 'loan', icon: Coin, label: '借款管理', comp: LoanTab },
  { id: 'invoice', icon: Tickets, label: '发票管理', comp: InvoiceTab },
  { id: 'payment', icon: CreditCard, label: '对公付款', comp: PaymentTab },
  { id: 'budget', icon: PieChart, label: '预算管控', comp: BudgetTab },
  { id: 'config', icon: Tools, label: '配置中心', comp: ConfigTab },
];

const allowed = getAllowedFinTabs(auth.user);
const visibleTabs = FIN_TAB_DEFS.filter((t) => allowed.includes(t.id));

const activeTab = ref(allowed[0] || 'overview');
const activeComponent = computed(
  () => (FIN_TAB_DEFS.find((t) => t.id === activeTab.value) || FIN_TAB_DEFS[0]).comp
);

// 对应 switchFinTab: 越权访问拦截
function switchTab(tab) {
  if (!allowed.includes(tab)) {
    ElMessage.warning('您无权限访问此功能');
    return;
  }
  activeTab.value = tab;
}
function onTabChange(tab) {
  switchTab(tab);
}
</script>

<style scoped>
.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  flex-wrap: wrap;
  gap: 12px;
}
.module-header h2 {
  margin: 0;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.fin-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.fin-tab-content {
  min-height: 400px;
}
</style>
