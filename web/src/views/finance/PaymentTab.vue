<template>
  <div v-loading="loading">
    <div class="tab-toolbar">
      <h3><el-icon><CreditCard /></el-icon> 对公付款 ({{ total }})</h3>
      <div style="display: flex; gap: 8px;">
        <el-button type="info" size="small" :icon="Notebook" @click="togglePayee">收款方档案</el-button>
        <el-button type="primary" size="small" :icon="Plus" @click="showForm">新建付款</el-button>
      </div>
    </div>

    <el-table :data="list">
      <el-table-column label="单号" min-width="120">
        <template #default="{ row }">
          <el-link type="primary" @click="viewRow(row.id)">{{ row.form_no }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="applicant" label="申请人" width="90" />
      <el-table-column label="类型" width="110">
        <template #default="{ row }"><el-tag type="primary" size="small">{{ row.payment_type }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="payee_name" label="收款方" min-width="130" show-overflow-tooltip />
      <el-table-column label="本次付款" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.this_amount) }}</template>
      </el-table-column>
      <el-table-column label="已付" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.paid_amount) }}</template>
      </el-table-column>
      <el-table-column label="阶段" width="90">
        <template #default="{ row }"><el-tag type="info" size="small">{{ row.payment_stage }}</el-tag></template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button type="info" size="small" :icon="View" circle title="详情" @click="viewRow(row.id)" />
          <template v-if="row.status === '草稿'">
            <el-button type="success" size="small" :icon="Promotion" circle title="提交" @click="submitRow(row.id)" />
            <el-button type="danger" size="small" :icon="Delete" circle title="删除" @click="deleteRow(row.id)" />
          </template>
          <template v-if="row.status === '待审批' || row.status === '审批中'">
            <el-button type="success" size="small" :icon="Check" circle title="审批" @click="approveRow(row.id)" />
            <el-button type="danger" size="small" :icon="Close" circle title="驳回" @click="rejectRow(row.id)" />
          </template>
          <el-button v-if="row.status === '已通过'" type="primary" size="small" :icon="Money" circle title="执行付款" @click="payRow(row.id)" />
        </template>
      </el-table-column>
      <template #empty>
        <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无付款记录</div>
      </template>
    </el-table>

    <!-- 收款方账户档案 (参考项目为页面内折叠区块) -->
    <el-card v-show="payeeVisible" shadow="never" style="margin-top: 24px;">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>收款方账户档案</span>
          <el-button type="primary" size="small" :icon="Plus" @click="showPayeeForm()">新增</el-button>
        </div>
      </template>
      <el-table :data="payees" size="small" v-loading="payeeLoading">
        <el-table-column prop="payee_name" label="收款方名称" min-width="150" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }"><el-tag size="small" type="primary">{{ row.payee_type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="bank_account" label="银行账号" min-width="150" />
        <el-table-column prop="bank_name" label="开户行" min-width="130" />
        <el-table-column prop="bank_branch" label="支行" min-width="110" />
        <el-table-column prop="creator" label="创建人" width="90" />
        <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button type="warning" size="small" :icon="Edit" circle title="编辑" @click="showPayeeForm(row)" />
            <el-button type="danger" size="small" :icon="Delete" circle title="停用" @click="deletePayee(row)" />
          </template>
        </el-table-column>
        <template #empty>
          <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无收款方档案</div>
        </template>
      </el-table>
    </el-card>

    <!-- 新建付款 -->
    <el-dialog v-model="formVisible" title="新建对公付款申请" width="520px" draggable>
      <el-form label-width="120px">
        <el-form-item label="付款类型">
          <el-select v-model="form.payment_type" style="width: 100%;">
            <el-option v-for="t in ['供应商付款', '合同付款', '预付款', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款方名称" required><el-input v-model="form.payee_name" placeholder="收款方" /></el-form-item>
        <el-form-item label="收款方账号"><el-input v-model="form.payee_account" placeholder="银行账号" /></el-form-item>
        <el-form-item label="收款方开户行"><el-input v-model="form.payee_bank" placeholder="开户行" /></el-form-item>
        <el-form-item label="本次付款金额(¥)" required>
          <el-input-number v-model="form.this_amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="付款阶段">
          <el-select v-model="form.payment_stage" style="width: 100%;">
            <el-option v-for="t in ['全款', '首付款', '进度款', '尾款']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="付款方式">
          <el-select v-model="form.payment_method" style="width: 100%;">
            <el-option v-for="t in ['银行转账', '支票', '承兑汇票']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="付款用途"><el-input v-model="form.purpose" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button :loading="saving" @click="saveForm('草稿')">存草稿</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm('待审批')">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 付款详情 -->
    <el-dialog v-model="detailVisible" :title="'付款详情 - ' + (detail?.form_no || '')" width="680px" draggable>
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="申请人">{{ detail.applicant }} ({{ detail.applicant_dept }})</el-descriptions-item>
          <el-descriptions-item label="类型">{{ detail.payment_type }}</el-descriptions-item>
          <el-descriptions-item label="收款方">{{ detail.payee_name }}</el-descriptions-item>
          <el-descriptions-item label="账号">{{ detail.payee_account }}</el-descriptions-item>
          <el-descriptions-item label="开户行">{{ detail.payee_bank }}</el-descriptions-item>
          <el-descriptions-item label="阶段">{{ detail.payment_stage }}</el-descriptions-item>
          <el-descriptions-item label="本次付款">¥{{ fmtAmt(detail.this_amount) }}</el-descriptions-item>
          <el-descriptions-item label="已付">¥{{ fmtAmt(detail.paid_amount) }}</el-descriptions-item>
          <el-descriptions-item label="付款方式">{{ detail.payment_method }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detail.status)" size="small">{{ detail.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="用途" :span="2">{{ detail.purpose }}</el-descriptions-item>
        </el-descriptions>
        <template v-if="detail.approval_flow && detail.approval_flow.length">
          <h4 class="sec-title"><el-icon><Share /></el-icon> 审批流程图</h4>
          <FlowSteps :flow="detail.approval_flow" />
        </template>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 收款方表单 -->
    <el-dialog v-model="payeeFormVisible" :title="payeeForm.id ? '编辑收款方' : '新增收款方'" width="480px" draggable>
      <el-form label-width="100px">
        <el-form-item label="收款方名称" required><el-input v-model="payeeForm.payee_name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="payeeForm.payee_type" style="width: 100%;">
            <el-option v-for="t in ['供应商', '客户', '员工', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="银行账号"><el-input v-model="payeeForm.bank_account" /></el-form-item>
        <el-form-item label="开户行"><el-input v-model="payeeForm.bank_name" /></el-form-item>
        <el-form-item label="支行"><el-input v-model="payeeForm.bank_branch" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="payeeForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payeeFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="savePayee">{{ payeeForm.id ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  CreditCard, Notebook, Plus, View, Promotion, Delete, Check, Close, Money, Share, Edit,
} from '@element-plus/icons-vue';
import request from '../../api/request';
import { fmtAmt, statusType } from './finUtils';
import FlowSteps from './FlowSteps.vue';

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);

const formVisible = ref(false);
const form = ref({});
const detailVisible = ref(false);
const detail = ref(null);

const payeeVisible = ref(false);
const payeeLoading = ref(false);
const payees = ref([]);
const payeeFormVisible = ref(false);
const payeeForm = ref({});

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/fin-payment', { params: { pageSize: 50 } });
    list.value = resp.code === 200 ? resp.data?.list || [] : [];
    total.value = resp.code === 200 ? resp.data?.total || 0 : 0;
  } finally {
    loading.value = false;
  }
}

function showForm() {
  form.value = {
    payment_type: '供应商付款', payee_name: '', payee_account: '', payee_bank: '',
    this_amount: undefined, payment_stage: '全款', payment_method: '银行转账', purpose: '',
  };
  formVisible.value = true;
}

async function saveForm(status) {
  const f = form.value;
  if (!f.payee_name) { ElMessage.warning('请填写收款方'); return; }
  if (!f.this_amount) { ElMessage.warning('请输入金额'); return; }
  const data = {
    payment_type: f.payment_type,
    payee_name: f.payee_name,
    payee_account: f.payee_account || '',
    payee_bank: f.payee_bank || '',
    this_amount: parseFloat(f.this_amount) || 0,
    payment_stage: f.payment_stage,
    payment_method: f.payment_method,
    purpose: f.purpose || '',
    status,
  };
  saving.value = true;
  try {
    const resp = await request.post('/fin-payment', data);
    if (resp.code === 200) {
      formVisible.value = false;
      ElMessage.success('操作成功');
      load();
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

async function viewRow(id) {
  const resp = await request.get('/fin-payment/' + id);
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); return; }
  detail.value = resp.data;
  detailVisible.value = true;
}

async function submitRow(id) {
  try {
    await ElMessageBox.confirm('确认提交？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-payment/${id}/submit`);
  if (resp.code === 200) { ElMessage.success('已提交'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function approveRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('审批意见:', '审批', { inputValue: '同意' });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-payment/${id}/approve`, { remark });
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批成功'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function rejectRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('驳回意见(必填):', '驳回', {
      inputValidator: (v) => (v && v.trim() ? true : '驳回意见必填'),
    });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-payment/${id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function payRow(id) {
  try {
    await ElMessageBox.confirm('确认执行付款？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-payment/${id}/pay`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '付款成功'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function deleteRow(id) {
  try {
    await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/fin-payment/' + id);
  if (resp.code === 200) { ElMessage.success('已删除'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// ===== 收款方档案 (参考项目 _showPayeeTab/_showPayeeForm 未实现, 按后端接口补齐) =====
async function togglePayee() {
  payeeVisible.value = !payeeVisible.value;
  if (payeeVisible.value) loadPayees();
}

async function loadPayees() {
  payeeLoading.value = true;
  try {
    const resp = await request.get('/fin-payment/payees/list', { params: { pageSize: 100 } });
    payees.value = resp.code === 200 ? resp.data?.list || [] : [];
  } finally {
    payeeLoading.value = false;
  }
}

function showPayeeForm(row) {
  payeeForm.value = row
    ? { ...row }
    : { id: '', payee_name: '', payee_type: '供应商', bank_account: '', bank_name: '', bank_branch: '', remark: '' };
  payeeFormVisible.value = true;
}

async function savePayee() {
  const f = payeeForm.value;
  if (!f.payee_name) { ElMessage.warning('收款方名称必填'); return; }
  const data = {
    payee_name: f.payee_name,
    payee_type: f.payee_type,
    bank_account: f.bank_account || '',
    bank_name: f.bank_name || '',
    bank_branch: f.bank_branch || '',
    remark: f.remark || '',
  };
  saving.value = true;
  try {
    const resp = f.id
      ? await request.put('/fin-payment/payees/' + f.id, data)
      : await request.post('/fin-payment/payees', data);
    if (resp.code === 200) {
      payeeFormVisible.value = false;
      ElMessage.success(resp.msg || '操作成功');
      loadPayees();
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

async function deletePayee(row) {
  try {
    await ElMessageBox.confirm('确认停用该收款方？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/fin-payment/payees/' + row.id);
  if (resp.code === 200) {
    ElMessage.success(resp.msg || '已停用');
    loadPayees();
  } else {
    ElMessage.error(resp.msg || '操作失败');
  }
}

onMounted(load);
</script>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.tab-toolbar h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sec-title { font-size: 15px; margin: 16px 0 8px; }
</style>
