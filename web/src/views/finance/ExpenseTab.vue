<template>
  <div v-loading="loading">
    <div class="tab-toolbar">
      <h3><el-icon><Document /></el-icon> 费用报销 ({{ total }})</h3>
      <div style="display: flex; gap: 8px;">
        <el-select v-model="filterStatus" size="small" style="width: 120px;" @change="load">
          <el-option label="全部状态" value="all" />
          <el-option v-for="s in ['草稿', '待审批', '审批中', '已通过', '已付款', '已驳回']" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" size="small" :icon="Plus" @click="showForm">新建报销</el-button>
      </div>
    </div>

    <el-table :data="list" size="default">
      <el-table-column label="单号" min-width="120">
        <template #default="{ row }">
          <el-link type="primary" @click="viewRow(row.id)">{{ row.form_no }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="applicant" label="申请人" width="90" />
      <el-table-column prop="applicant_dept" label="部门" width="100" />
      <el-table-column label="类型" width="110">
        <template #default="{ row }"><el-tag type="primary" size="small">{{ row.expense_type }}</el-tag></template>
      </el-table-column>
      <el-table-column label="报销金额" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.total_amount) }}</template>
      </el-table-column>
      <el-table-column label="差旅补贴" width="100">
        <template #default="{ row }">{{ row.travel_subsidy ? '¥' + fmtAmt(row.travel_subsidy) : '—' }}</template>
      </el-table-column>
      <el-table-column label="借款抵扣" width="100">
        <template #default="{ row }">{{ row.loan_deduct ? '¥' + fmtAmt(row.loan_deduct) : '—' }}</template>
      </el-table-column>
      <el-table-column label="实付金额" width="110">
        <template #default="{ row }"><strong>¥{{ fmtAmt(row.actual_amount) }}</strong></template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="reimburse_date" label="日期" width="110" />
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
          <el-button v-if="row.status === '已通过'" type="primary" size="small" :icon="Money" circle title="付款" @click="payRow(row.id)" />
        </template>
      </el-table-column>
      <template #empty>
        <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无报销记录</div>
      </template>
    </el-table>

    <!-- 新建报销 -->
    <el-dialog v-model="formVisible" title="新建费用报销" width="520px" draggable>
      <el-form label-width="120px">
        <el-form-item label="报销类型">
          <el-select v-model="form.expense_type" style="width: 100%;">
            <el-option v-for="t in EXPENSE_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="报销总金额(¥)">
          <el-input-number v-model="form.total_amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item v-if="form.expense_type === '差旅报销'" label="出差天数">
          <el-input-number v-model="form.travel_days" :min="0" :precision="0" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="收款银行账号"><el-input v-model="form.bank_account" placeholder="银行账号" /></el-form-item>
        <el-form-item label="开户行"><el-input v-model="form.bank_name" placeholder="开户行名称" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" placeholder="备注说明" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button :loading="saving" @click="saveForm('草稿')">存草稿</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm('待审批')">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 报销详情 -->
    <el-dialog v-model="detailVisible" :title="'报销详情 - ' + (detail?.form_no || '')" width="760px" draggable top="6vh">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="申请人">{{ detail.applicant }} ({{ detail.applicant_dept }})</el-descriptions-item>
          <el-descriptions-item label="类型">{{ detail.expense_type }}</el-descriptions-item>
          <el-descriptions-item label="报销金额">¥{{ fmtAmt(detail.total_amount) }}</el-descriptions-item>
          <el-descriptions-item label="差旅补贴">{{ detail.travel_subsidy ? '¥' + fmtAmt(detail.travel_subsidy) : '—' }}</el-descriptions-item>
          <el-descriptions-item label="借款抵扣">{{ detail.loan_deduct ? '¥' + fmtAmt(detail.loan_deduct) : '—' }}</el-descriptions-item>
          <el-descriptions-item label="实付金额"><strong>¥{{ fmtAmt(detail.actual_amount) }}</strong></el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(detail.status)" size="small">{{ detail.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="日期">{{ detail.reimburse_date }}</el-descriptions-item>
          <el-descriptions-item label="收款账号" :span="2">{{ detail.bank_account }} {{ detail.bank_name }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '' }}</el-descriptions-item>
        </el-descriptions>

        <template v-if="detail.details && detail.details.length">
          <h4 class="sec-title">费用明细</h4>
          <el-table :data="detail.details" size="small">
            <el-table-column prop="category" label="类别" />
            <el-table-column label="金额" width="110">
              <template #default="{ row }">¥{{ fmtAmt(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="occur_date" label="发生日期" width="110" />
            <el-table-column prop="desc" label="摘要" />
            <el-table-column label="超标" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.is_over_standard" type="danger" size="small">超标</el-tag>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
        </template>

        <template v-if="detail.approval_flow && detail.approval_flow.length">
          <h4 class="sec-title"><el-icon><Share /></el-icon> 审批流程图</h4>
          <FlowSteps :flow="detail.approval_flow" />
        </template>

        <div class="voucher-sec">
          <h4 class="sec-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span><el-icon><Paperclip /></el-icon> 凭证管理 ({{ (detail.vouchers || []).length }})</span>
            <el-button type="primary" size="small" :icon="Plus" @click="showVoucherForm">录入凭证</el-button>
          </h4>
          <el-table v-if="(detail.vouchers || []).length" :data="detail.vouchers" size="small">
            <el-table-column label="类型" width="90">
              <template #default="{ row }"><el-tag type="primary" size="small">{{ row.voucher_type }}</el-tag></template>
            </el-table-column>
            <el-table-column label="凭证号" width="120">
              <template #default="{ row }"><code style="font-size: 12px;">{{ row.voucher_no || '—' }}</code></template>
            </el-table-column>
            <el-table-column label="金额" width="100">
              <template #default="{ row }">¥{{ fmtAmt(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="voucher_date" label="日期" width="110" />
            <el-table-column prop="description" label="摘要" min-width="120" />
            <el-table-column label="照片" width="70">
              <template #default="{ row }">
                <a v-if="row.file_path" :href="row.file_path" target="_blank">
                  <img :src="row.file_path" :title="row.file_name || ''" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid var(--el-border-color); cursor: pointer;" />
                </a>
                <span v-else style="color: var(--el-text-color-secondary);">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="uploaded_by" label="上传人" width="90" />
            <el-table-column label="操作" width="70">
              <template #default="{ row }">
                <el-button type="danger" size="small" :icon="Delete" circle title="删除" @click="deleteVoucher(row.id)" />
              </template>
            </el-table-column>
          </el-table>
          <p v-else style="color: var(--el-text-color-secondary); padding: 8px 0;">暂无凭证，请录入报销凭证</p>
        </div>
      </template>
      <template #footer>
        <el-button size="small" :icon="Printer" @click="printRow(detail.id)">打印报销单</el-button>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 录入凭证 -->
    <el-dialog v-model="voucherVisible" title="录入凭证" width="480px" draggable append-to-body>
      <el-form label-width="100px">
        <el-form-item label="凭证类型">
          <el-select v-model="vchForm.voucher_type" style="width: 100%;">
            <el-option v-for="t in ['发票', '收据', '银行回单', '电子凭证', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="凭证号码"><el-input v-model="vchForm.voucher_no" placeholder="凭证编号" /></el-form-item>
        <el-form-item label="金额(¥)">
          <el-input-number v-model="vchForm.amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="凭证日期">
          <el-date-picker v-model="vchForm.voucher_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="摘要说明"><el-input v-model="vchForm.description" type="textarea" :rows="2" placeholder="凭证摘要" /></el-form-item>
        <el-form-item label="凭证照片">
          <div>
            <input ref="vchFileRef" type="file" accept="image/*" @change="previewVoucherPhoto" />
            <div style="font-size: 12px; color: var(--el-text-color-secondary);">支持JPG/PNG/GIF等图片格式</div>
            <div v-if="vchPreview" style="margin-top: 8px;">
              <img :src="vchPreview" style="max-width: 200px; max-height: 150px; border-radius: 6px; border: 1px solid var(--el-border-color);" />
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="voucherVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveVoucher">保存凭证</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Document, Plus, View, Printer, Promotion, Delete, Check, Close, Money, Share, Paperclip,
} from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { fmtAmt, statusType, canPrint, esc, openPrintWindow, printFlowHtml } from './finUtils';
import FlowSteps from './FlowSteps.vue';

const EXPENSE_TYPES = [
  '普通报销', '差旅报销', '办公费报销', '会议费报销', '培训费报销', '招待费报销',
  '通讯费报销', '交通费报销', '广告宣传费报销', '维修维护费报销', '咨询服务费报销', '其他费用报销',
];

const auth = useAuthStore();
const printable = computed(() => canPrint(auth.user));

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const filterStatus = ref('all');

const formVisible = ref(false);
const form = ref({});
const detailVisible = ref(false);
const detail = ref(null);
const voucherVisible = ref(false);
const vchForm = ref({});
const vchFileRef = ref(null);
const vchFile = ref(null);
const vchPreview = ref('');

async function load() {
  loading.value = true;
  try {
    const params = { pageSize: 50 };
    if (filterStatus.value && filterStatus.value !== 'all') params.status = filterStatus.value;
    const resp = await request.get('/fin-expense', { params });
    list.value = resp.code === 200 ? resp.data?.list || [] : [];
    total.value = resp.code === 200 ? resp.data?.total || 0 : 0;
  } finally {
    loading.value = false;
  }
}

function showForm() {
  form.value = { expense_type: '普通报销', total_amount: undefined, travel_days: 0, bank_account: '', bank_name: '', remark: '' };
  formVisible.value = true;
}

async function saveForm(status) {
  const f = form.value;
  if (!f.total_amount) { ElMessage.warning('请输入金额'); return; }
  const data = {
    expense_type: f.expense_type,
    total_amount: parseFloat(f.total_amount) || 0,
    travel_days: parseInt(f.travel_days) || 0,
    bank_account: f.bank_account || '',
    bank_name: f.bank_name || '',
    remark: f.remark || '',
    status,
  };
  saving.value = true;
  try {
    const resp = await request.post('/fin-expense', data);
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
  const resp = await request.get('/fin-expense/' + id);
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); return; }
  detail.value = resp.data;
  detailVisible.value = true;
}

async function submitRow(id) {
  try {
    await ElMessageBox.confirm('确认提交审批？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-expense/${id}/submit`);
  if (resp.code === 200) { ElMessage.success('已提交审批'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function approveRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('审批意见(可留空):', '审批', {
      inputValue: '同意', confirmButtonText: '确定', cancelButtonText: '取消',
    });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-expense/${id}/approve`, { remark });
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批成功'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function rejectRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('驳回意见(必填):', '驳回', {
      inputValue: '', confirmButtonText: '确定', cancelButtonText: '取消',
      inputValidator: (v) => (v && v.trim() ? true : '驳回意见必填'),
    });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-expense/${id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function payRow(id) {
  try {
    await ElMessageBox.confirm('确认执行付款？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-expense/${id}/pay`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '付款成功'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function deleteRow(id) {
  try {
    await ElMessageBox.confirm('确认删除该草稿？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/fin-expense/' + id);
  if (resp.code === 200) { ElMessage.success('已删除'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// ===== 凭证管理 =====
function showVoucherForm() {
  vchForm.value = {
    voucher_type: '发票',
    voucher_no: '',
    amount: undefined,
    voucher_date: new Date().toISOString().slice(0, 10),
    description: '',
  };
  vchFile.value = null;
  vchPreview.value = '';
  if (vchFileRef.value) vchFileRef.value.value = '';
  voucherVisible.value = true;
}

function previewVoucherPhoto(e) {
  const file = e.target.files && e.target.files[0];
  vchFile.value = file || null;
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => { vchPreview.value = ev.target.result; };
    reader.readAsDataURL(file);
  } else {
    vchPreview.value = '';
  }
}

async function saveVoucher() {
  const v = vchForm.value;
  if (!v.voucher_type) { ElMessage.warning('请选择凭证类型'); return; }
  const fd = new FormData();
  fd.append('voucher_type', v.voucher_type);
  fd.append('voucher_no', v.voucher_no || '');
  fd.append('amount', parseFloat(v.amount) || 0);
  fd.append('voucher_date', v.voucher_date || '');
  fd.append('description', v.description || '');
  if (vchFile.value) fd.append('photo', vchFile.value);
  saving.value = true;
  try {
    const resp = await request.post(`/fin-expense/${detail.value.id}/vouchers`, fd);
    if (resp.code === 200) {
      voucherVisible.value = false;
      ElMessage.success('凭证录入成功');
      viewRow(detail.value.id);
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

async function deleteVoucher(vId) {
  try {
    await ElMessageBox.confirm('确认删除该凭证？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete(`/fin-expense/${detail.value.id}/vouchers/${vId}`);
  if (resp.code === 200) {
    ElMessage.success('凭证已删除');
    viewRow(detail.value.id);
  } else {
    ElMessage.error(resp.msg || '操作失败');
  }
}

// ===== 打印报销单 — 对应 _printExpenseDetail =====
async function printRow(id) {
  const resp = await request.get('/fin-expense/' + id);
  if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
  const e = resp.data;
  const flowHTML = printFlowHtml(e.approval_flow);
  const voucherHTML = (e.vouchers || []).length
    ? `<h4>凭证列表</h4><table><thead><tr><th>类型</th><th>凭证号</th><th>金额</th><th>日期</th><th>摘要</th><th>照片</th></tr></thead><tbody>${e.vouchers
        .map(
          (v) =>
            `<tr><td>${esc(v.voucher_type)}</td><td>${esc(v.voucher_no || '—')}</td><td>¥${fmtAmt(v.amount)}</td><td>${esc(v.voucher_date || '')}</td><td>${esc(v.description || '')}</td><td>${v.file_path ? '<img src="' + v.file_path + '" style="max-width:60px;max-height:60px;" />' : '—'}</td></tr>`
        )
        .join('')}</tbody></table>`
    : '';
  const body = `<table>
    <tr><th>单号</th><td>${esc(e.form_no)}</td><th>状态</th><td>${esc(e.status)}</td></tr>
    <tr><th>申请人</th><td>${esc(e.applicant)} (${esc(e.applicant_dept)})</td><th>类型</th><td>${esc(e.expense_type)}</td></tr>
    <tr><th>报销金额</th><td>¥${fmtAmt(e.total_amount)}</td><th>差旅补贴</th><td>${e.travel_subsidy ? '¥' + fmtAmt(e.travel_subsidy) : '—'}</td></tr>
    <tr><th>借款抵扣</th><td>${e.loan_deduct ? '¥' + fmtAmt(e.loan_deduct) : '—'}</td><th>实付金额</th><td><strong>¥${fmtAmt(e.actual_amount)}</strong></td></tr>
    <tr><th>日期</th><td>${esc(e.reimburse_date)}</td><th>收款账号</th><td>${esc(e.bank_account)} ${esc(e.bank_name)}</td></tr>
    ${e.remark ? `<tr><th>备注</th><td colspan="3">${esc(e.remark)}</td></tr>` : ''}
  </table>
  <h4>审批流程</h4><div style="text-align:center;">${flowHTML || '<span style="color:#999;">无流程数据</span>'}</div>
  ${voucherHTML}`;
  if (!openPrintWindow('费用报销单 - ' + (e.form_no || ''), body, auth.user?.name)) {
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
.voucher-sec { margin-top: 16px; border-top: 1px solid var(--el-border-color); padding-top: 12px; }
</style>
