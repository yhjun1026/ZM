<template>
  <div class="page">
    <div class="page-header"><h2>日常办公</h2></div>
    <el-tabs v-model="tab">
      <!-- 用品 -->
      <el-tab-pane label="用品申领" name="supplies">
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="6"><el-input v-model="fSup.keyword" placeholder="名称" size="small" clearable /></el-col>
          <el-col :span="4"><el-select v-model="fSup.category" placeholder="分类" clearable size="small"><el-option label="办公耗材" value="办公耗材" /><el-option label="IT设备" value="IT设备" /><el-option label="印刷品" value="印刷品" /></el-select></el-col>
          <el-col :span="4"><el-button type="primary" @click="loadSupplies" size="small">查询</el-button><el-button @click="openSupply" type="success" size="small">+ 用品</el-button></el-col>
        </el-row>
        <el-table :data="supplies" border>
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="category" label="分类" width="100" />
          <el-table-column prop="unit" label="单位" width="80" />
          <el-table-column prop="stock" label="库存" width="80" />
          <el-table-column prop="warn_qty" label="预警线" width="80" />
          <el-table-column prop="status" label="状态" width="80" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }"><el-button size="small" type="primary" @click="openApply(row)">申领</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 车辆 -->
      <el-tab-pane label="车辆申请" name="vehicle">
        <el-button @click="openVehicle" type="primary" size="small">+ 申请用车</el-button>
        <el-table :data="vehicles" border style="margin-top:8px">
          <el-table-column prop="app_no" label="单号" width="160" />
          <el-table-column prop="vehicle_plate_real" label="车牌" width="100" />
          <el-table-column prop="applicant_name" label="申请人" width="100" />
          <el-table-column prop="start_at" label="起始" width="160" />
          <el-table-column prop="end_at" label="截止" width="160" />
          <el-table-column prop="destination" label="目的地" width="150" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="row.status==='通过'?'success':(row.status==='驳回'?'danger':'warning')">{{ row.status }}</el-tag></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 备用金 -->
      <el-tab-pane label="备用金" name="petty">
        <el-row :gutter="12" style="margin-bottom:8px">
          <el-col :span="6"><el-card><h3>¥{{ pettyStats.in_use || 0 }}</h3><p>在用金额</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>¥{{ pettyStats.used || 0 }}</h3><p>已核销</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ pettyStats.pending || 0 }}</h3><p>在办数</p></el-card></el-col>
        </el-row>
        <el-button @click="openPetty" type="primary" size="small">+ 申请备用金</el-button>
        <el-table :data="pettyList" border style="margin-top:8px">
          <el-table-column prop="fund_no" label="单号" width="160" />
          <el-table-column prop="emp_name" label="申请人" width="100" />
          <el-table-column prop="amount" label="金额(元)" width="100" />
          <el-table-column prop="purpose" label="用途" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }"><el-tag size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button v-if="row.status==='审批中'" size="small" @click="doPF(row.id, 'cancel')" type="danger">撤销</el-button>
              <el-button v-if="row.status==='待放款'" size="small" @click="doPF(row.id, 'pay')" type="primary">放款</el-button>
              <el-button v-if="row.status==='使用中'" size="small" @click="openSettle(row)" type="warning">核销</el-button>
              <el-button v-if="row.status==='待核销'" size="small" @click="doPF(row.id, 'confirm')" type="success">确认</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 公告增强 -->
      <el-tab-pane label="公告增强" name="announce">
        <el-button @click="loadUnread" type="primary" size="small">查看未读</el-button>
        <el-table :data="unreadList" border style="margin-top:8px">
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="category" label="分类" width="100" />
          <el-table-column prop="created_at" label="时间" width="160" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }"><el-button size="small" @click="markRead(row.id)">标记已读</el-button></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 考勤设置 -->
      <el-tab-pane label="考勤设置" name="checkin">
        <el-button @click="loadCheckinSettings" size="small">加载</el-button>
        <el-button @click="saveCheckinSettings" type="primary" size="small">保存</el-button>
        <el-form :model="checkinSettings" label-width="120px" style="margin-top:8px" v-if="Object.keys(checkinSettings).length">
          <el-form-item label="上午上班"><el-time-picker v-model="checkinSettings.am_start" format="HH:mm" /></el-form-item>
          <el-form-item label="上午下班"><el-time-picker v-model="checkinSettings.am_end" format="HH:mm" /></el-form-item>
          <el-form-item label="下午上班"><el-time-picker v-model="checkinSettings.pm_start" format="HH:mm" /></el-form-item>
          <el-form-item label="下午下班"><el-time-picker v-model="checkinSettings.pm_end" format="HH:mm" /></el-form-item>
          <el-form-item label="弹性(分钟)"><el-input-number v-model="checkinSettings.flexible_minutes" :min="0" :max="120" /></el-form-item>
          <el-form-item label="工作日"><el-input v-model="checkinSettings.work_days" placeholder="1,2,3,4,5" /></el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <!-- 用品新增 -->
    <el-dialog v-model="supplyDlg" title="新增用品" width="400px">
      <el-form :model="supplyForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="supplyForm.name" /></el-form-item>
        <el-form-item label="分类"><el-select v-model="supplyForm.category"><el-option label="办公耗材" value="办公耗材" /><el-option label="IT设备" value="IT设备" /><el-option label="印刷品" value="印刷品" /><el-option label="礼品" value="礼品" /><el-option label="其他" value="其他" /></el-select></el-form-item>
        <el-form-item label="单位"><el-input v-model="supplyForm.unit" placeholder="件" /></el-form-item>
        <el-form-item label="初始库存"><el-input-number v-model="supplyForm.stock" :min="0" /></el-form-item>
        <el-form-item label="预警线"><el-input-number v-model="supplyForm.warn_qty" :min="0" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="supplyDlg=false">取消</el-button><el-button @click="doCreateSupply" type="primary">提交</el-button></template>
    </el-dialog>

    <!-- 申领 -->
    <el-dialog v-model="applyDlg" title="用品申领" width="400px">
      <el-form :model="applyForm" label-width="80px">
        <el-form-item label="物品">{{ currentSupply?.name }}</el-form-item>
        <el-form-item label="数量"><el-input-number v-model="applyForm.qty" :min="1" /></el-form-item>
        <el-form-item label="原因"><el-input v-model="applyForm.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="applyDlg=false">取消</el-button><el-button @click="doApply" type="primary">提交</el-button></template>
    </el-dialog>

    <!-- 用车申请 -->
    <el-dialog v-model="vehicleDlg" title="用车申请" width="500px">
      <el-form :model="vehicleForm" label-width="100px">
        <el-form-item label="车辆ID"><el-input-number v-model="vehicleForm.vehicle_id" /></el-form-item>
        <el-form-item label="车牌"><el-input v-model="vehicleForm.vehicle_plate" /></el-form-item>
        <el-form-item label="起始时间"><el-input v-model="vehicleForm.start_at" placeholder="YYYY-MM-DD HH:mm" /></el-form-item>
        <el-form-item label="截止时间"><el-input v-model="vehicleForm.end_at" placeholder="YYYY-MM-DD HH:mm" /></el-form-item>
        <el-form-item label="目的地"><el-input v-model="vehicleForm.destination" /></el-form-item>
        <el-form-item label="事由"><el-input v-model="vehicleForm.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="vehicleDlg=false">取消</el-button><el-button @click="doApplyVehicle" type="primary">提交</el-button></template>
    </el-dialog>

    <!-- 备用金申请 -->
    <el-dialog v-model="pettyDlg" title="备用金申请" width="500px">
      <el-form :model="pettyForm" label-width="100px">
        <el-form-item label="金额(元)"><el-input-number v-model="pettyForm.amount" :precision="2" /></el-form-item>
        <el-form-item label="用途"><el-input v-model="pettyForm.purpose" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="预计核销日"><el-input v-model="pettyForm.expect_return_date" placeholder="YYYY-MM-DD" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="pettyDlg=false">取消</el-button><el-button @click="doCreatePetty" type="primary">提交</el-button></template>
    </el-dialog>

    <!-- 核销 -->
    <el-dialog v-model="settleDlg" title="备用金核销" width="500px">
      <el-form :model="settleForm" label-width="100px">
        <el-form-item label="已使用金额"><el-input-number v-model="settleForm.used_amount" :precision="2" /></el-form-item>
        <el-form-item label="退回金额"><el-input-number v-model="settleForm.return_amount" :precision="2" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="settleForm.settle_note" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="凭证"><el-input v-model="settleForm.voucher_path" placeholder="附件路径" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="settleDlg=false">取消</el-button><el-button @click="doSettle" type="primary">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../api/request'

const tab = ref('supplies')
const fSup = reactive({ keyword: '', category: '' })
const supplies = ref([])
const supplyDlg = ref(false)
const supplyForm = reactive({ name: '', category: '办公耗材', unit: '件', stock: 0, warn_qty: 0 })
const applyDlg = ref(false)
const applyForm = reactive({ qty: 1, reason: '' })
const currentSupply = ref(null)
const vehicles = ref([])
const vehicleDlg = ref(false)
const vehicleForm = reactive({ vehicle_id: null, vehicle_plate: '', start_at: '', end_at: '', destination: '', reason: '' })
const pettyList = ref([])
const pettyStats = ref({})
const pettyDlg = ref(false)
const pettyForm = reactive({ amount: 0, purpose: '', expect_return_date: '' })
const settleDlg = ref(false)
const settleForm = reactive({ used_amount: 0, return_amount: 0, settle_note: '', voucher_path: '' })
const currentPetty = ref(null)
const unreadList = ref([])
const checkinSettings = ref({})

async function loadSupplies() { const r = await request.get('/supplies-app', { params: fSup }); supplies.value = r.data?.list || [] }
async function loadVehicles() { const r = await request.get('/vehicles-app'); vehicles.value = r.data?.list || [] }
async function loadPetty() {
  const r1 = await request.get('/petty-funds'); pettyList.value = r1.data?.list || [];
  const r2 = await request.get('/petty-funds/stats'); pettyStats.value = r2.data || {};
}
async function loadUnread() { const r = await request.get('/announcement/unread'); unreadList.value = r.data || [] }
async function loadCheckinSettings() { const r = await request.get('/checkin/settings'); checkinSettings.value = r.data || {} }

function openSupply() { Object.assign(supplyForm, { name: '', category: '办公耗材', unit: '件', stock: 0, warn_qty: 0 }); supplyDlg.value = true }
async function doCreateSupply() {
  if (!supplyForm.name) return ElMessage.warning('请填名称');
  const r = await request.post('/supplies-app', supplyForm);
  if (r.code === 200) { ElMessage.success('已创建'); supplyDlg.value = false; loadSupplies(); }
}
function openApply(row) { currentSupply.value = row; applyForm.qty = 1; applyForm.reason = ''; applyDlg.value = true }
async function doApply() {
  const r = await request.post('/supplies-app/apply', { supply_id: currentSupply.value.id, ...applyForm });
  if (r.code === 200) { ElMessage.success(r.message); applyDlg.value = false; }
}
function openVehicle() { Object.assign(vehicleForm, { vehicle_id: null, vehicle_plate: '', start_at: '', end_at: '', destination: '', reason: '' }); vehicleDlg.value = true }
async function doApplyVehicle() {
  const r = await request.post('/vehicles-app/apply', vehicleForm);
  if (r.code === 200) { ElMessage.success(r.message); vehicleDlg.value = false; loadVehicles(); }
}
function openPetty() { Object.assign(pettyForm, { amount: 0, purpose: '', expect_return_date: '' }); pettyDlg.value = true }
async function doCreatePetty() {
  if (!pettyForm.purpose) return ElMessage.warning('请填用途');
  const r = await request.post('/petty-funds', pettyForm);
  if (r.code === 200) { ElMessage.success(r.message); pettyDlg.value = false; loadPetty(); }
}
function openSettle(row) { currentPetty.value = row; Object.assign(settleForm, { used_amount: row.amount, return_amount: 0, settle_note: '', voucher_path: '' }); settleDlg.value = true }
async function doSettle() {
  const r = await request.post('/petty-funds/' + currentPetty.value.id + '/settle', settleForm);
  if (r.code === 200) { ElMessage.success('已申请核销'); settleDlg.value = false; loadPetty(); }
}
async function doPF(id, action) {
  if (action === 'cancel') {
    await ElMessageBox.confirm('确认撤销？', '提示', { type: 'warning' });
    await request.put('/petty-funds/' + id + '/cancel');
  } else if (action === 'pay') {
    const r = await request.post('/petty-funds/' + id + '/pay', { method: '银行转账' });
    if (r.code !== 200) return ElMessage.error(r.message);
  } else if (action === 'confirm') {
    const r = await request.post('/petty-funds/' + id + '/confirm', { confirm_note: '财务确认' });
    if (r.code !== 200) return ElMessage.error(r.message);
  }
  ElMessage.success('已处理'); loadPetty();
}
async function markRead(id) { await request.post('/announcement/' + id + '/read'); ElMessage.success('已读'); loadUnread(); }
async function saveCheckinSettings() {
  const r = await request.put('/checkin/settings', checkinSettings.value);
  if (r.code === 200) ElMessage.success('已保存');
}

watch(tab, (v) => {
  if (v === 'supplies') loadSupplies();
  if (v === 'vehicle') loadVehicles();
  if (v === 'petty') loadPetty();
  if (v === 'announce') loadUnread();
  if (v === 'checkin') loadCheckinSettings();
})
onMounted(() => loadSupplies())
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; }
</style>
