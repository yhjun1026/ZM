<template>
  <div>
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div><h2>采购管理</h2><p>采购申请、审批与入库</p></div>
      <el-button v-if="canCreate" type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新建采购</el-button>
    </div>
    <el-row :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">采购申请</div><div style="font-size:22px;font-weight:700;">{{ records.length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">待审批</div><div style="font-size:22px;font-weight:700;color:#f59e0b;">{{ records.filter(p=>p.status==='待审批').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">已入库</div><div style="font-size:22px;font-weight:700;color:#10b981;">{{ records.filter(p=>p.status==='已入库').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">采购总额</div><div style="font-size:22px;font-weight:700;color:#2563eb;">¥{{ total }}万</div></el-card></el-col>
    </el-row>
    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="id" label="编号" width="130" />
        <el-table-column prop="title" label="名称" min-width="160" />
        <el-table-column prop="category" label="类别" width="100" />
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ Number(row.amount || 0).toLocaleString() }}</template></el-table-column>
        <el-table-column label="数量" width="90"><template #default="{ row }">{{ row.qty }}{{ row.unit }}</template></el-table-column>
        <el-table-column prop="vendor" label="供应商" width="140" />
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === '待审批' && canApprove" size="small" type="success" @click="onApprove(row)">审批</el-button>
            <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg.visible" title="新建采购" width="520px">
      <el-form :model="dlg.form" label-width="80px">
        <el-form-item label="名称" required><el-input v-model="dlg.form.title" /></el-form-item>
        <el-form-item label="类别"><el-select v-model="dlg.form.category"><el-option label="电子设备" value="电子设备" /><el-option label="办公用品" value="办公用品" /><el-option label="IT设备" value="IT设备" /><el-option label="其他" value="其他" /></el-select></el-form-item>
        <el-row>
          <el-col :span="12"><el-form-item label="金额"><el-input-number v-model="dlg.form.amount" :min="0" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="数量"><el-input-number v-model="dlg.form.qty" :min="1" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="供应商"><el-input v-model="dlg.form.vendor" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg.visible = false">取消</el-button><el-button type="primary" :loading="dlg.saving" @click="onSubmit">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { getPurchases, addPurchase, approvePurchase, deletePurchase } from '../api/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const records = ref([]);
const total = computed(() => (records.value.reduce((s, p) => s + Number(p.amount || 0), 0) / 10000).toFixed(1));

// 新增采购权限：管理层 + 后勤/财务/技术部普通员工
const canCreate = computed(() => {
  if (!auth.user) return false;
  const role = auth.user.role;
  const dept = auth.user.dept;
  // 管理层
  if (['总经理', '副总', '销售总监', '部门经理', '区域经理'].includes(role)) return true;
  // 后勤/财务/技术部普通员工可发起
  if (role === '普通员工' && ['后勤管理部', '财务部', '技术部'].includes(dept)) return true;
  // 专员角色
  if (role === '后勤专员' || role === '财务专员') return true;
  return false;
});

// 审批权限：非普通员工才能审批
const canApprove = computed(() => {
  return auth.user && auth.user.role !== '普通员工';
});

async function load() {
  const r = await getPurchases();
  if (r.success) records.value = r.data || [];
}
onMounted(load);
function statusType(s) { return s === '已入库' ? 'success' : s === '采购中' ? 'info' : 'warning'; }

const dlg = reactive({ visible: false, saving: false, form: {} });
function openCreate() { dlg.form = { title: '', category: '办公用品', amount: 0, qty: 1, unit: '件', vendor: '' }; dlg.visible = true; }
async function onSubmit() {
  if (!dlg.form.title) { ElMessage.warning('请填写名称'); return; }
  dlg.saving = true;
  const r = await addPurchase({ ...dlg.form, applicant: auth.userName });
  dlg.saving = false;
  if (r.success) { ElMessage.success('提交成功'); dlg.visible = false; load(); }
}
async function onApprove(row) {
  const r = await approvePurchase(row.id, { status: '采购中', approver: auth.userName });
  if (r.success) { ElMessage.success('审批已更新'); load(); }
}
async function onDelete(row) {
  try { await ElMessageBox.confirm(`确认删除「${row.title}」？`, '提示', { type: 'warning' }); } catch { return; }
  const r = await deletePurchase(row.id);
  if (r.success) { ElMessage.success('已删除'); load(); }
}
</script>
