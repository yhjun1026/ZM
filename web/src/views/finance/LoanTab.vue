<template>
  <div v-loading="loading">
    <div class="tab-toolbar">
      <h3><el-icon><Coin /></el-icon> 借款管理 ({{ total }})</h3>
      <el-button type="primary" size="small" :icon="Plus" @click="showForm">新建借款</el-button>
    </div>

    <el-table :data="list">
      <el-table-column label="单号" min-width="120">
        <template #default="{ row }">
          <el-link type="primary" @click="viewRow(row.id)">{{ row.form_no }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="applicant" label="申请人" width="90" />
      <el-table-column prop="applicant_dept" label="部门" width="100" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }"><el-tag type="primary" size="small">{{ row.loan_type }}</el-tag></template>
      </el-table-column>
      <el-table-column label="借款金额" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="未还金额" width="120">
        <template #default="{ row }">
          <strong :style="{ color: row.outstanding_amount > 0 ? 'var(--el-color-warning)' : 'var(--el-color-success)' }">
            ¥{{ fmtAmt(row.outstanding_amount) }}
          </strong>
        </template>
      </el-table-column>
      <el-table-column prop="expected_repay_date" label="预计还款" width="110" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button type="info" size="small" :icon="View" circle title="详情" @click="viewRow(row.id)" />
          <el-button v-if="printable" type="info" size="small" plain :icon="Printer" circle title="打印" @click="printRow(row.id)" />
          <template v-if="row.status === '草稿'">
            <el-button type="success" size="small" :icon="Promotion" circle title="提交" @click="submitRow(row.id)" />
            <el-button type="danger" size="small" :icon="Delete" circle title="删除" @click="deleteRow(row.id)" />
          </template>
          <template v-if="row.status === '待审批' || row.status === '审批中'">
            <el-button type="success" size="small" :icon="Check" circle title="审批" @click="approveRow(row.id)" />
            <el-button type="danger" size="small" :icon="Close" circle title="驳回" @click="rejectRow(row.id)" />
          </template>
          <el-button v-if="row.status === '已通过' && row.outstanding_amount > 0" type="primary" size="small" :icon="Money" circle title="还款" @click="showRepay(row.id)" />
        </template>
      </el-table-column>
      <template #empty>
        <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无借款记录</div>
      </template>
    </el-table>

    <!-- 新建借款 -->
    <el-dialog v-model="formVisible" title="新建借款申请" width="520px" draggable>
      <el-form label-width="110px">
        <el-form-item label="借款类型">
          <el-select v-model="form.loan_type" style="width: 100%;">
            <el-option v-for="t in ['备用金', '差旅借款', '采购借款', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="借款金额(¥)">
          <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="借款事由">
          <el-input v-model="form.purpose" type="textarea" :rows="2" placeholder="借款用途" />
        </el-form-item>
        <el-form-item label="预计还款日期">
          <el-date-picker v-model="form.expected_repay_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button :loading="saving" @click="saveForm('草稿')">存草稿</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm('待审批')">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 借款详情 -->
    <el-dialog v-model="detailVisible" :title="'借款详情 - ' + (detail?.form_no || '')" width="680px" draggable>
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="申请人">{{ detail.applicant }} ({{ detail.applicant_dept }})</el-descriptions-item>
          <el-descriptions-item label="类型">{{ detail.loan_type }}</el-descriptions-item>
          <el-descriptions-item label="借款金额">¥{{ fmtAmt(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="已还金额">¥{{ fmtAmt(detail.repaid_amount) }}</el-descriptions-item>
          <el-descriptions-item label="未还金额">
            <strong style="color: var(--el-color-warning);">¥{{ fmtAmt(detail.outstanding_amount) }}</strong>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detail.status)" size="small">{{ detail.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="预计还款">{{ detail.expected_repay_date }}</el-descriptions-item>
          <el-descriptions-item label="实际还款">{{ detail.actual_repay_date || '—' }}</el-descriptions-item>
          <el-descriptions-item label="事由" :span="2">{{ detail.purpose }}</el-descriptions-item>
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

    <!-- 还款 -->
    <el-dialog v-model="repayVisible" title="借款还款" width="420px" draggable>
      <el-form label-width="90px">
        <el-form-item label="还款金额" required>
          <el-input-number v-model="repayForm.repay_amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="还款方式">
          <el-select v-model="repayForm.settle_type" style="width: 100%;">
            <el-option v-for="t in ['现金归还', '银行转账', '报销冲抵']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="repayVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doRepay">
          确认还款 ¥{{ fmtAmt(repayForm.repay_amount) }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Coin, Plus, View, Printer, Promotion, Delete, Check, Close, Money, Share } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { fmtAmt, statusType, canPrint, esc, openPrintWindow, printFlowHtml, printTagColor } from './finUtils';
import FlowSteps from './FlowSteps.vue';

const auth = useAuthStore();
const printable = computed(() => canPrint(auth.user));

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);

const formVisible = ref(false);
const form = ref({});
const detailVisible = ref(false);
const detail = ref(null);
const repayVisible = ref(false);
const repayForm = ref({});

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/fin-loan', { params: { pageSize: 50 } });
    list.value = resp.code === 200 ? resp.data?.list || [] : [];
    total.value = resp.code === 200 ? resp.data?.total || 0 : 0;
  } finally {
    loading.value = false;
  }
}

function showForm() {
  form.value = { loan_type: '备用金', amount: undefined, purpose: '', expected_repay_date: '', remark: '' };
  formVisible.value = true;
}

async function saveForm(status) {
  const f = form.value;
  if (!f.amount) { ElMessage.warning('请输入金额'); return; }
  if (!f.purpose) { ElMessage.warning('请填写借款事由'); return; }
  const data = {
    loan_type: f.loan_type,
    amount: parseFloat(f.amount) || 0,
    purpose: f.purpose,
    expected_repay_date: f.expected_repay_date || '',
    remark: f.remark || '',
    status,
  };
  saving.value = true;
  try {
    const resp = await request.post('/fin-loan', data);
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
  const resp = await request.get('/fin-loan/' + id);
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); return; }
  detail.value = resp.data;
  detailVisible.value = true;
}

async function submitRow(id) {
  try {
    await ElMessageBox.confirm('确认提交？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-loan/${id}/submit`);
  if (resp.code === 200) { ElMessage.success('已提交'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function approveRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('审批意见:', '审批', { inputValue: '同意' });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-loan/${id}/approve`, { remark });
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
  const resp = await request.post(`/fin-loan/${id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

function showRepay(id) {
  repayForm.value = { id, repay_amount: undefined, settle_type: '现金归还' };
  repayVisible.value = true;
}

async function doRepay() {
  const r = repayForm.value;
  if (!r.repay_amount) { ElMessage.warning('请输入还款金额'); return; }
  saving.value = true;
  try {
    const resp = await request.post(`/fin-loan/${r.id}/repay`, {
      repay_amount: parseFloat(r.repay_amount),
      settle_type: r.settle_type,
    });
    if (resp.code === 200) {
      repayVisible.value = false;
      ElMessage.success(resp.msg || '还款成功');
      load();
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

async function deleteRow(id) {
  try {
    await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/fin-loan/' + id);
  if (resp.code === 200) { ElMessage.success('已删除'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// 打印借款单 — 对应 _printLoanDetail
async function printRow(id) {
  const resp = await request.get('/fin-loan/' + id);
  if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
  const l = resp.data;
  const flowHTML = printFlowHtml(l.approval_flow);
  const body = `<table>
    <tr><th>单号</th><td>${esc(l.form_no)}</td><th>状态</th><td><span class="tag tag-${printTagColor(l.status)}">${esc(l.status)}</span></td></tr>
    <tr><th>申请人</th><td>${esc(l.applicant)} (${esc(l.applicant_dept)})</td><th>类型</th><td>${esc(l.loan_type)}</td></tr>
    <tr><th>借款金额</th><td>¥${fmtAmt(l.amount)}</td><th>未还金额</th><td>¥${fmtAmt(l.outstanding_amount)}</td></tr>
    <tr><th>预计还款</th><td>${esc(l.expected_repay_date || '—')}</td><th>实际还款</th><td>${esc(l.actual_repay_date || '—')}</td></tr>
    <tr><th>借款事由</th><td colspan="3">${esc(l.purpose || '')}</td></tr>
    ${l.remark ? `<tr><th>备注</th><td colspan="3">${esc(l.remark)}</td></tr>` : ''}
  </table>
  <h4>审批流程</h4><div style="text-align:center;">${flowHTML || '<span style="color:#999;">无流程数据</span>'}</div>`;
  if (!openPrintWindow('借款申请单', body, auth.user?.name)) {
    ElMessage.warning('请允许弹出窗口以使用打印功能');
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
