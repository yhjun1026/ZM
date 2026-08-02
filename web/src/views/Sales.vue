<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>销售统计</h2><p>销售业绩与明细录入</p></div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 录入销售</el-button>
    </div>

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

    <el-row :gutter="16" style="margin-bottom: 16px;">
      <el-col :span="12">
        <el-card>
          <template #header>各区域销售</template>
          <el-table :data="territory" size="small">
            <el-table-column prop="region" label="区域" />
            <el-table-column prop="revenue" label="收入(万)" />
            <el-table-column prop="deals" label="单数" />
            <el-table-column label="达成率"><template #default="{ row }">{{ row.rate }}%</template></el-table-column>
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

    <!-- 销售明细录入 -->
    <el-card>
      <template #header>销售明细（录入）</template>
      <el-table :data="records" stripe>
        <el-table-column prop="customer" label="客户" min-width="140" />
        <el-table-column prop="product" label="产品" width="120" />
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ Number(row.amount || 0).toLocaleString() }}</template></el-table-column>
        <el-table-column prop="sale_date" label="日期" width="110" />
        <el-table-column prop="salesperson" label="销售员" width="100" />
        <el-table-column prop="notes" label="备注" min-width="120" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }"><el-button size="small" type="danger" @click="onDelete(row)">删</el-button></template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!records.length" description="暂无销售明细，点右上角「录入销售」添加" :image-size="60" />
    </el-card>

    <el-dialog v-model="dlg.visible" title="录入销售" width="500px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="客户"><el-input v-model="dlg.form.customer" placeholder="客户名称" /></el-form-item>
        <el-form-item label="产品"><el-input v-model="dlg.form.product" placeholder="产品/服务" /></el-form-item>
        <el-form-item label="金额"><el-input-number v-model="dlg.form.amount" :min="0" :precision="2" style="width: 100%;" /></el-form-item>
        <el-form-item label="日期"><el-date-picker v-model="dlg.form.saleDate" value-format="YYYY-MM-DD" style="width: 100%;" /></el-form-item>
        <el-form-item label="销售员"><el-input v-model="dlg.form.salesperson" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="dlg.form.notes" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import * as echarts from 'echarts';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getSales, getSalesRecords, addSalesRecord, deleteSalesRecord } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const data = ref({});
const chart = ref(null);
let inst = null;
const records = ref([]);

const tm = computed(() => data.value.thisMonth || {});
const pipeline = computed(() => data.value.pipeline || {});
const territory = computed(() => data.value.territory || []);
function fmt(n) { return Number(n || 0).toLocaleString(); }

function rz() { inst && inst.resize(); }
async function loadRecords() {
  const r = await getSalesRecords();
  if (r.success) records.value = r.data || [];
}

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
  loadRecords();
});
onUnmounted(() => { window.removeEventListener('resize', rz); inst && inst.dispose(); });

const dlg = reactive({ visible: false, saving: false, form: {} });
function openCreate() {
  dlg.form = { customer: '', product: '', amount: 0, saleDate: new Date().toISOString().slice(0, 10), salesperson: auth.userName, notes: '' };
  dlg.visible = true;
}
async function onSubmit() {
  dlg.saving = true;
  const r = await addSalesRecord(dlg.form);
  dlg.saving = false;
  if (r.success) { ElMessage.success('录入成功'); dlg.visible = false; loadRecords(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm('确认删除该销售记录？', '提示', { type: 'warning' }); } catch { return; }
  const r = await deleteSalesRecord(row.id);
  if (r.success) { ElMessage.success('已删除'); loadRecords(); }
}
</script>
