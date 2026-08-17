<template>
  <div class="contract-page">
    <div class="page-header">
      <h2>合同管理</h2>
      <p>合同全生命周期管理：主信息、审批、变更、终止、借阅、台账与权限</p>
    </div>

    <!-- 标签页导航（1:1 还原参考项目 cm-tabs） -->
    <div class="cm-tabs">
      <button v-for="t in tabs" :key="t.key" class="cm-tab" :class="{ active: activeTab === t.key }" @click="switchTab(t.key)">
        <el-icon style="vertical-align:-2px;margin-right:4px;"><component :is="t.icon" /></el-icon>{{ t.label }}
      </button>
    </div>

    <div class="cm-content">
      <!-- 合同主信息：列表 / 详情编辑器 -->
      <template v-if="activeTab === 'main_form'">
        <ContractFormDetail
          v-if="formDetailId !== null"
          :id="formDetailId"
          @back="closeFormDetail"
          @goto="switchTab"
          @open="openFormDetail"
        />
        <ContractMainForm v-else :key="mainFormKey" @open="openFormDetail" />
      </template>
      <ContractList v-else-if="activeTab === 'list'" />
      <ContractChanges v-else-if="activeTab === 'changes'" />
      <ContractChangeFlow v-else-if="activeTab === 'change_flow'" />
      <ContractTerminations v-else-if="activeTab === 'terminations'" />
      <ContractEndFlow v-else-if="activeTab === 'end_flow'" />
      <ContractBorrowFlow v-else-if="activeTab === 'borrow_flow'" />
      <ContractBorrows v-else-if="activeTab === 'borrows'" />
      <ContractLedger v-else-if="activeTab === 'ledger'" />
      <ContractExpiry v-else-if="activeTab === 'expiry'" />
      <ContractTemplates v-else-if="activeTab === 'templates'" />
      <ContractLogs v-else-if="activeTab === 'logs'" />
      <ContractPermRules v-else-if="activeTab === 'perm_rules'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import {
  EditPen, Document, Edit, Share, CircleClose, CircleCloseFilled, Reading, Notebook,
  List, Warning, CopyDocument, Clock, Lock,
} from '@element-plus/icons-vue';
import ContractMainForm from './contract/ContractMainForm.vue';
import ContractFormDetail from './contract/ContractFormDetail.vue';
import ContractList from './contract/ContractList.vue';
import ContractChanges from './contract/ContractChanges.vue';
import ContractChangeFlow from './contract/ContractChangeFlow.vue';
import ContractTerminations from './contract/ContractTerminations.vue';
import ContractEndFlow from './contract/ContractEndFlow.vue';
import ContractBorrowFlow from './contract/ContractBorrowFlow.vue';
import ContractBorrows from './contract/ContractBorrows.vue';
import ContractLedger from './contract/ContractLedger.vue';
import ContractExpiry from './contract/ContractExpiry.vue';
import ContractTemplates from './contract/ContractTemplates.vue';
import ContractLogs from './contract/ContractLogs.vue';
import ContractPermRules from './contract/ContractPermRules.vue';

const tabs = [
  { key: 'main_form', label: '合同主信息', icon: EditPen },
  { key: 'list', label: '合同列表', icon: Document },
  { key: 'changes', label: '合同变更', icon: Edit },
  { key: 'change_flow', label: '变更审批', icon: Share },
  { key: 'terminations', label: '合同终止/解除', icon: CircleClose },
  { key: 'end_flow', label: '终止审批', icon: CircleCloseFilled },
  { key: 'borrow_flow', label: '借阅审批', icon: Reading },
  { key: 'borrows', label: '借阅记录', icon: Notebook },
  { key: 'ledger', label: '合同台账', icon: List },
  { key: 'expiry', label: '到期预警', icon: Warning },
  { key: 'templates', label: '模板库', icon: CopyDocument },
  { key: 'logs', label: '操作日志', icon: Clock },
  { key: 'perm_rules', label: '权限规则', icon: Lock },
];

const activeTab = ref('main_form');
const formDetailId = ref(null); // null = 主信息列表；'new' 或合同ID = 详情/编辑器
const mainFormKey = ref(0);

function switchTab(key) {
  activeTab.value = key;
  if (key !== 'main_form') formDetailId.value = null;
}

function openFormDetail(id) {
  formDetailId.value = id;
}

function closeFormDetail() {
  formDetailId.value = null;
  mainFormKey.value++; // 返回列表时刷新统计与列表
}
</script>

<style scoped>
.cm-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 20px;
  overflow-x: auto;
}
.cm-tab {
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: #606266;
  font-size: 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all .2s;
  white-space: nowrap;
}
.cm-tab:hover { color: var(--el-color-primary); }
.cm-tab.active { color: var(--el-color-primary); border-bottom-color: var(--el-color-primary); font-weight: 600; }
</style>
