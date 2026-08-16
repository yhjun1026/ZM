<template>
  <div class="trade-supplier">
    <div class="page-header">
      <h2>交易供应商管理</h2>
      <p>供应商管理与采购数据互通</p>
    </div>

    <el-card>
      <template #header><strong>供应商台账</strong></template>
      <el-table :data="suppliers" stripe>
        <el-table-column prop="id" label="编号" width="120" />
        <el-table-column prop="name" label="供应商名称" min-width="200" />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '合作中' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="rating" label="评级" width="100" />
        <el-table-column label="采购额" width="120">
          <template #default="{ row }">
            ¥{{ row.po_amount || 0 }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '../api/request';

const suppliers = ref([]);

async function loadSuppliers() {
  try {
    const res = await request.get('/trade-supplier');
    if (res.data.success) {
      suppliers.value = res.data.data;
    }
  } catch (e) {
    console.error('加载供应商列表失败:', e);
  }
}

onMounted(() => {
  loadSuppliers();
});
</script>

<style scoped>
.trade-supplier {
  padding: 20px;
}
</style>
