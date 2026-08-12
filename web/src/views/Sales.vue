<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>销售统计</h2><p>销售业绩与明细录入</p></div>
      <el-button v-if="!isMobile && canCreate" type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 录入销售</el-button>
      <el-button v-else-if="isMobile && canCreate" type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon> 录入</el-button>
    </div>

    <!-- 桌面端：统计卡片 -->
    <el-row v-if="!isMobile" :gutter="12" style="margin-bottom: 16px;">
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

    <!-- 移动端：简化统计 -->
    <div v-else class="mobile-sales-stats">
      <div class="sales-stat-item primary">
        <div class="stat-value">¥{{ fmt(tm.revenue) }}</div>
        <div class="stat-label">本月收入</div>
        <div class="stat-sub">达成 {{ tm.rate }}%</div>
      </div>
      <div class="sales-stat-item">
        <div class="stat-value">{{ tm.deals }}</div>
        <div class="stat-label">成单数</div>
        <div class="stat-sub">均价 ¥{{ fmt(tm.avgDeal) }}</div>
      </div>
    </div>

    <!-- 移动端：销售漏斗（可折叠） -->
    <div v-if="isMobile" class="mobile-pipeline">
      <el-collapse>
        <el-collapse-item title="🔍 销售漏斗" name="pipeline">
          <div class="pipeline-grid">
            <div v-for="(v, k) in pipeline" :key="k" class="pipeline-item">
              <div class="pipeline-value">{{ v }}</div>
              <div class="pipeline-label">{{ k }}</div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- 桌面端：区域销售 + 产品分布 -->
    <el-row v-if="!isMobile" :gutter="16" style="margin-bottom: 16px;">
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

    <!-- 移动端：可折叠的区域和产品 -->
    <div v-else class="mobile-sales-detail">
      <el-collapse v-model="activeCollapse">
        <el-collapse-item title="🗺️ 各区域销售" name="territory">
          <div v-for="item in territory" :key="item.region" class="territory-item">
            <div class="territory-header">
              <span class="region-name">{{ item.region }}</span>
              <el-tag size="small">{{ item.rate }}%</el-tag>
            </div>
            <div class="territory-info">
              <span>收入：{{ item.revenue }}万</span>
              <span>单数：{{ item.deals }}</span>
            </div>
          </div>
        </el-collapse-item>
        <el-collapse-item title="📊 产品收入分布" name="chart">
          <div ref="chart" style="height: 250px;"></div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <!-- 销售明细录入 -->
    <el-card style="margin-top: 16px;">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>销售明细（录入）</span>
          <el-button v-if="isMobile && canCreate" type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon></el-button>
        </div>
      </template>

      <!-- 桌面端：表格 -->
      <el-table v-if="!isMobile" :data="records" stripe>
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

      <!-- 移动端：卡片列表 -->
      <div v-else class="mobile-records">
        <div v-for="record in records" :key="record.id" class="record-item">
          <div class="record-header">
            <span class="customer">{{ record.customer }}</span>
            <el-button size="small" type="danger" text @click="onDelete(record)">删除</el-button>
          </div>
          <div class="record-body">
            <div class="record-info">
              <span class="amount">¥{{ Number(record.amount || 0).toLocaleString() }}</span>
              <span class="product">{{ record.product }}</span>
            </div>
            <div class="record-meta">
              <span>{{ record.sale_date }}</span>
              <span>{{ record.salesperson }}</span>
            </div>
            <div v-if="record.notes" class="record-notes">{{ record.notes }}</div>
          </div>
        </div>
        <el-empty v-if="!records.length" description="暂无销售明细，点右上角「录入」添加" :image-size="60" />
      </div>
    </el-card>

    <el-dialog v-model="dlg.visible" title="录入销售" :width="isMobile ? '90%' : '500px'">
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
import { useDevice } from '../composables/useDevice';

const { isMobile } = useDevice();
const auth = useAuthStore();
const data = ref({});
const chart = ref(null);
const activeCollapse = ref(['territory']);
let inst = null;
const records = ref([]);

// 销售录入权限：销售部员工 + 管理层
const canCreate = computed(() => {
  if (!auth.user) return false;
  const role = auth.user.role;
  const dept = auth.user.dept;
  // 管理层
  if (['总经理', '副总', '销售总监', '部门经理', '区域经理'].includes(role)) return true;
  // 销售部员工
  if (dept === '销售部') return true;
  return false;
});

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

<style scoped>
.mobile-sales-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.sales-stat-item {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.sales-stat-item.primary {
  background: linear-gradient(135deg, #2563eb, #1e40af);
  color: #fff;
}

.sales-stat-item.primary .stat-label,
.sales-stat-item.primary .stat-sub {
  color: rgba(255,255,255,0.9);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.stat-sub {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}

.mobile-pipeline {
  margin-bottom: 12px;
}

.pipeline-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.pipeline-item {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 10px;
  text-align: center;
}

.pipeline-value {
  font-size: 20px;
  font-weight: 700;
  color: #2563eb;
}

.pipeline-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.mobile-sales-detail {
  margin-bottom: 12px;
}

.territory-item {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.territory-item:last-child {
  border-bottom: none;
}

.territory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.region-name {
  font-weight: 600;
  color: #1f2937;
}

.territory-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

.mobile-records {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-item {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px;
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.customer {
  font-weight: 600;
  color: #1f2937;
}

.record-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.record-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.amount {
  font-size: 18px;
  font-weight: 700;
  color: #2563eb;
}

.product {
  font-size: 13px;
  color: #606266;
}

.record-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
}

.record-notes {
  font-size: 12px;
  color: #909399;
  padding: 6px;
  background: #fff;
  border-radius: 4px;
}
</style>
