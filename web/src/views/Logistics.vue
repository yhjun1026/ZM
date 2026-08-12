<template>
  <div>
    <div class="page-header">
      <div><h2>后勤管理</h2><p>后勤工单与车辆管理</p></div>
    </div>

    <!-- 移动端：Tab切换 -->
    <el-tabs v-if="isMobile" v-model="activeTab" class="logistics-tabs">
      <el-tab-pane label="后勤工单" name="items">
        <div class="mobile-items">
          <div v-for="item in logisticsItems" :key="item.id" class="logistics-card">
            <div class="card-header">
              <span class="type-tag">{{ item.type }}</span>
              <el-tag :type="item.status === '已完成' ? 'success' : 'warning'" size="small">{{ item.status }}</el-tag>
            </div>
            <div class="card-body">
              <h4 class="title">{{ item.title }}</h4>
              <div class="meta">
                <span>申请人：{{ item.applicant }}</span>
                <span>部门：{{ item.dept }}</span>
              </div>
              <div class="meta">
                <span>日期：{{ item.date }}</span>
                <span v-if="item.cost">费用：¥{{ item.cost }}</span>
              </div>
              <div v-if="item.detail" class="detail">{{ item.detail }}</div>
            </div>
          </div>
          <el-empty v-if="!logisticsItems.length" description="暂无工单" :image-size="60" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="车辆管理" name="vehicles">
        <div class="mobile-vehicles">
          <div v-for="vehicle in vehicles" :key="vehicle.id" class="vehicle-card">
            <div class="card-header">
              <span class="plate">{{ vehicle.plate }}</span>
              <el-tag :type="vehicle.status === '可用' ? 'success' : 'danger'" size="small">{{ vehicle.status }}</el-tag>
            </div>
            <div class="card-body">
              <div class="info-row">
                <span class="label">车型：</span>
                <span>{{ vehicle.model }}</span>
              </div>
              <div class="info-row">
                <span class="label">驾驶员：</span>
                <span>{{ vehicle.driver }}</span>
              </div>
              <div class="info-row">
                <span class="label">里程数：</span>
                <span>{{ vehicle.mileage || 0 }} km</span>
              </div>
              <div v-if="vehicle.next_maintenance" class="info-row">
                <span class="label">下次保养：</span>
                <span>{{ vehicle.next_maintenance }}</span>
              </div>
            </div>
          </div>
          <el-empty v-if="!vehicles.length" description="暂无车辆" :image-size="60" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 桌面端：双栏展示 -->
    <el-row v-else :gutter="16">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>后勤工单</span>
              <el-button type="primary" size="small" @click="openCreateItem"><el-icon><Plus /></el-icon> 新增工单</el-button>
            </div>
          </template>
          <el-table :data="logisticsItems" stripe size="small">
            <el-table-column prop="type" label="类型" width="80" />
            <el-table-column prop="title" label="标题" min-width="140" />
            <el-table-column prop="applicant" label="申请人" width="90" />
            <el-table-column prop="dept" label="部门" width="100" />
            <el-table-column prop="date" label="日期" width="100" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === '已完成' ? 'success' : 'warning'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>车辆管理</span>
              <el-button type="primary" size="small" @click="openCreateVehicle"><el-icon><Plus /></el-icon> 添加车辆</el-button>
            </div>
          </template>
          <el-table :data="vehicles" stripe size="small">
            <el-table-column prop="plate" label="车牌" width="100" />
            <el-table-column prop="model" label="车型" width="120" />
            <el-table-column prop="driver" label="驾驶员" width="90" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === '可用' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="里程(km)" width="100">
              <template #default="{ row }">{{ row.mileage || 0 }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增工单对话框 -->
    <el-dialog v-model="itemDialog.visible" title="新增后勤工单" :width="isMobile ? '90%' : '480px'">
      <el-form :model="itemDialog.form" label-width="80px">
        <el-form-item label="工单类型">
          <el-select v-model="itemDialog.form.type" placeholder="选择类型" style="width: 100%;">
            <el-option label="设施维修" value="设施维修" />
            <el-option label="办公设备" value="办公设备" />
            <el-option label="车辆调度" value="车辆调度" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="itemDialog.form.title" placeholder="工单标题" />
        </el-form-item>
        <el-form-item label="详情">
          <el-input v-model="itemDialog.form.detail" type="textarea" :rows="3" placeholder="详细说明" />
        </el-form-item>
        <el-form-item label="费用">
          <el-input-number v-model="itemDialog.form.cost" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="itemDialog.saving" @click="onSubmitItem">提交</el-button>
      </template>
    </el-dialog>

    <!-- 添加车辆对话框 -->
    <el-dialog v-model="vehicleDialog.visible" title="添加车辆" :width="isMobile ? '90%' : '480px'">
      <el-form :model="vehicleDialog.form" label-width="80px">
        <el-form-item label="车牌号" required>
          <el-input v-model="vehicleDialog.form.plate" placeholder="车牌号" />
        </el-form-item>
        <el-form-item label="车型">
          <el-input v-model="vehicleDialog.form.model" placeholder="车型" />
        </el-form-item>
        <el-form-item label="驾驶员">
          <el-input v-model="vehicleDialog.form.driver" placeholder="驾驶员姓名" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="vehicleDialog.form.status" style="width: 100%;">
            <el-option label="可用" value="可用" />
            <el-option label="维修中" value="维修中" />
            <el-option label="停用" value="停用" />
          </el-select>
        </el-form-item>
        <el-form-item label="里程数">
          <el-input-number v-model="vehicleDialog.form.mileage" :min="0" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="vehicleDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="vehicleDialog.saving" @click="onSubmitVehicle">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const isMobile = computed(() => window.innerWidth <= 768);

const activeTab = ref('items');
const logisticsItems = ref([]);
const vehicles = ref([]);

const itemDialog = reactive({
  visible: false,
  saving: false,
  form: {
    type: '设施维修',
    title: '',
    detail: '',
    cost: 0
  }
});

const vehicleDialog = reactive({
  visible: false,
  saving: false,
  form: {
    plate: '',
    model: '',
    driver: '',
    status: '可用',
    mileage: 0
  }
});

// 加载后勤工单
async function loadItems() {
  try {
    const res = await request.get('/logistics/items');
    if (res.data.success) {
      logisticsItems.value = res.data.data;
    }
  } catch (e) {
    ElMessage.error('加载工单失败');
  }
}

// 加载车辆列表
async function loadVehicles() {
  try {
    const res = await request.get('/logistics/vehicles');
    if (res.data.success) {
      vehicles.value = res.data.data;
    }
  } catch (e) {
    ElMessage.error('加载车辆列表失败');
  }
}

// 打开新增工单对话框
function openCreateItem() {
  itemDialog.visible = true;
  Object.assign(itemDialog.form, {
    type: '设施维修',
    title: '',
    detail: '',
    cost: 0
  });
}

// 打开添加车辆对话框
function openCreateVehicle() {
  vehicleDialog.visible = true;
  Object.assign(vehicleDialog.form, {
    plate: '',
    model: '',
    driver: '',
    status: '可用',
    mileage: 0
  });
}

// 提交工单
async function onSubmitItem() {
  if (!itemDialog.form.title) {
    ElMessage.warning('请输入工单标题');
    return;
  }

  itemDialog.saving = true;
  try {
    const res = await request.post('/logistics/items', itemDialog.form);
    if (res.data.success) {
      ElMessage.success('工单创建成功');
      itemDialog.visible = false;
      loadItems();
    } else {
      ElMessage.error(res.data.message || '操作失败');
    }
  } catch (e) {
    ElMessage.error('操作失败');
  } finally {
    itemDialog.saving = false;
  }
}

// 提交车辆
async function onSubmitVehicle() {
  if (!vehicleDialog.form.plate) {
    ElMessage.warning('请输入车牌号');
    return;
  }

  vehicleDialog.saving = true;
  try {
    const res = await request.post('/logistics/vehicles', vehicleDialog.form);
    if (res.data.success) {
      ElMessage.success('车辆添加成功');
      vehicleDialog.visible = false;
      loadVehicles();
    } else {
      ElMessage.error(res.data.message || '操作失败');
    }
  } catch (e) {
    ElMessage.error('操作失败');
  } finally {
    vehicleDialog.saving = false;
  }
}

onMounted(() => {
  loadItems();
  loadVehicles();
});
</script>

<style scoped>
.logistics-tabs {
  background: #fff;
  border-radius: 8px;
}

.mobile-items,
.mobile-vehicles {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.logistics-card,
.vehicle-card {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
}

.type-tag {
  background: #409eff;
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.plate {
  font-weight: 600;
  color: #303133;
  font-size: 16px;
}

.card-body {
  padding: 12px 16px;
}

.title {
  margin: 0 0 8px;
  font-size: 15px;
  color: #303133;
}

.meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 13px;
  color: #606266;
}

.detail {
  margin-top: 8px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
}

.info-row {
  display: flex;
  margin-bottom: 4px;
  font-size: 14px;
}

.info-row .label {
  color: #909399;
  min-width: 80px;
}
</style>