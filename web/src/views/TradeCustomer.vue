<template>
  <div class="trade-customer">
    <div class="page-header">
      <h2>交易客户管理</h2>
      <p>客户管理与销售数据互通</p>
    </div>

    <el-card>
      <template #header><strong>客户台账</strong></template>
      <el-table :data="customers" stripe>
        <el-table-column prop="id" label="编号" width="120" />
        <el-table-column prop="name" label="客户名称" min-width="200" />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '合作中' ? 'success' : 'info'" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="80" />
        <el-table-column prop="owner_name" label="归属" width="100" />
        <el-table-column label="销售订单额" width="120">
          <template #default="{ row }">
            ¥{{ row.so_amount || 0 }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import request from '../api/request';

const customers = ref([]);

async function loadCustomers() {
  try {
    const res = await request.get('/trade-customer');
    if (res.data.success) {
      customers.value = res.data.data;
    }
  } catch (e) {
    console.error('加载客户列表失败:', e);
  }
}

onMounted(() => {
  loadCustomers();
});
</script>

<style scoped>
.trade-customer {
  padding: 20px;
}
</style>
