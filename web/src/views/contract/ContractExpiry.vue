<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;gap:8px;">
          <strong>到期预警</strong>
          <span class="tag tag-yellow">{{ rows.length }}份即将到期</span>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="合同编号" width="140" />
        <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="customer" label="客户" width="150" show-overflow-tooltip />
        <el-table-column prop="end_date" label="到期日期" width="120" />
        <el-table-column label="剩余天数" width="100">
          <template #default="{ row }">
            <span :class="`tag ${daysLeft(row) <= 7 ? 'tag-red' : daysLeft(row) <= 15 ? 'tag-yellow' : 'tag-blue'}`">{{ daysLeft(row) }}天</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="openDetail(row)"><el-icon><View /></el-icon></el-button>
          </template>
        </el-table-column>
        <template #empty>暂无即将到期的合同</template>
      </el-table>
    </el-card>
    <OldContractDetail v-model="detailDlg.visible" :contract-id="detailDlg.id" @updated="load" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { View } from '@element-plus/icons-vue';
import request from '../../api/request';
import OldContractDetail from './OldContractDetail.vue';

const rows = ref([]);
const loading = ref(false);

function daysLeft(row) {
  return Math.ceil((new Date(row.end_date) - new Date()) / 86400000);
}

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/contracts/expiry/warning');
    if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
    rows.value = resp.data || [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const detailDlg = reactive({ visible: false, id: '' });
function openDetail(row) { detailDlg.id = row.id; detailDlg.visible = true; }
</script>

<style scoped>
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-red { background: #fee2e2; color: #991b1b; }
.tag-yellow { background: #fef3c7; color: #92400e; }
.tag-blue { background: #dbeafe; color: #1e40af; }
</style>
