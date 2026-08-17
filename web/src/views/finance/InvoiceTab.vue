<template>
  <div v-loading="loading">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <StatCard title="发票总数" :value="(s.total || 0) + '张'" :sub="'正常:' + countBy(s.by_status, 'status', '正常')" :icon="Tickets" color="#8b5cf6" />
      <StatCard title="已校验" :value="countBy(s.by_verified, 'verified', '已校验') + '张'" :sub="'存疑:' + countBy(s.by_verified, 'verified', '存疑')" :icon="CircleCheck" color="#10b981" />
      <StatCard title="金额合计" :value="'¥' + fmtMoney(s.total_amount)" sub="价税合计" :icon="Money" color="#2563eb" />
      <StatCard title="查重拦截" :value="(s.duplicate_count || 0) + '次'" sub="重复发票" :icon="Warning" color="#ef4444" />
    </div>

    <div class="tab-toolbar">
      <h3><el-icon><Tickets /></el-icon> 发票台账 ({{ total }})</h3>
      <div style="display: flex; gap: 8px;">
        <el-button type="info" size="small" :icon="Camera" @click="ocrVisible = true">AI识别</el-button>
        <el-button type="primary" size="small" :icon="Plus" @click="showForm">手动录入</el-button>
        <el-button type="success" size="small" :icon="Finished" @click="batchVerify">批量校验</el-button>
      </div>
    </div>

    <el-table :data="list" @selection-change="(rows) => (selectedIds = rows.map((r) => r.id))">
      <el-table-column type="selection" width="45" />
      <el-table-column prop="invoice_code" label="发票代码" width="120" />
      <el-table-column prop="invoice_no" label="发票号码" width="110" />
      <el-table-column label="类型" width="130">
        <template #default="{ row }"><el-tag type="primary" size="small">{{ row.invoice_type }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="seller" label="销方" min-width="140" show-overflow-tooltip />
      <el-table-column label="价税合计" width="110">
        <template #default="{ row }">¥{{ fmtAmt(row.total_amount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }"><el-tag :type="invStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="校验" width="80">
        <template #default="{ row }"><el-tag :type="verifiedType(row.verified)" size="small">{{ row.verified }}</el-tag></template>
      </el-table-column>
      <el-table-column label="来源" width="90">
        <template #default="{ row }"><el-tag type="info" size="small">{{ row.source }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button type="info" size="small" :icon="View" circle title="详情" @click="viewRow(row.id)" />
          <el-button v-if="printable" type="info" size="small" plain :icon="Printer" circle title="打印" @click="printRow(row)" />
          <el-button v-if="row.verified === '未校验'" type="success" size="small" :icon="Check" circle title="校验" @click="verifyRow(row.id)" />
          <el-button v-if="row.status === '正常'" type="danger" size="small" :icon="CircleClose" circle title="标记异常" @click="rejectRow(row.id)" />
          <el-button v-if="row.status === '异常' || row.status === '作废'" type="danger" size="small" :icon="Delete" circle title="删除" @click="deleteRow(row.id)" />
        </template>
      </el-table-column>
      <template #empty>
        <div style="text-align: center; padding: 20px; color: var(--el-text-color-secondary);">暂无发票</div>
      </template>
    </el-table>

    <!-- 手动录入 -->
    <el-dialog v-model="formVisible" title="手动录入发票" width="520px" draggable>
      <el-form label-width="120px">
        <el-form-item label="发票类型">
          <el-select v-model="form.invoice_type" style="width: 100%;">
            <el-option v-for="t in ['增值税专用发票', '增值税普通发票', '全电发票']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="发票代码" required><el-input v-model="form.invoice_code" placeholder="发票代码" /></el-form-item>
        <el-form-item label="发票号码" required><el-input v-model="form.invoice_no" placeholder="发票号码" /></el-form-item>
        <el-form-item label="销方名称"><el-input v-model="form.seller" placeholder="销售方名称" /></el-form-item>
        <el-form-item label="不含税金额(¥)">
          <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="税额(¥)">
          <el-input-number v-model="form.tax_amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="价税合计(¥)">
          <el-input-number v-model="form.total_amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker v-model="form.invoice_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">录入</el-button>
      </template>
    </el-dialog>

    <!-- AI OCR 识别 -->
    <el-dialog v-model="ocrVisible" title="AI OCR发票识别" width="600px" draggable @closed="resetOcr">
      <div style="padding: 10px; text-align: center;">
        <div class="ocr-drop" @click="ocrFileRef?.click()">
          <el-icon :size="40" color="var(--el-text-color-secondary)"><UploadFilled /></el-icon>
          <p style="margin: 12px 0 4px;">点击上传发票图片</p>
          <p style="font-size: 12px; color: var(--el-text-color-secondary);">支持JPG/PNG，AI自动识别发票信息</p>
          <input ref="ocrFileRef" type="file" accept="image/*" style="display: none;" @change="doOcr" />
        </div>
        <div style="margin-top: 16px; text-align: left;">
          <div v-if="ocrLoading" style="text-align: center; padding: 16px;">
            <el-icon class="is-loading"><Loading /></el-icon> AI识别中...
          </div>
          <div v-else-if="ocrError" style="color: var(--el-color-danger);">识别失败: {{ ocrError }}</div>
          <div v-else-if="ocrResult" class="ocr-result">
            <h4 style="margin: 0 0 8px;">
              识别结果 <el-tag type="success" size="small">置信度{{ (ocrResult.ocr_confidence * 100).toFixed(0) }}%</el-tag>
            </h4>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="发票代码">{{ ocrResult.invoice_code }}</el-descriptions-item>
              <el-descriptions-item label="发票号码">{{ ocrResult.invoice_no }}</el-descriptions-item>
              <el-descriptions-item label="类型">{{ ocrResult.invoice_type }}</el-descriptions-item>
              <el-descriptions-item label="销方">{{ ocrResult.seller }}</el-descriptions-item>
              <el-descriptions-item label="不含税">¥{{ ocrResult.amount }}</el-descriptions-item>
              <el-descriptions-item label="税额">¥{{ ocrResult.tax_amount }}</el-descriptions-item>
              <el-descriptions-item label="价税合计"><strong>¥{{ ocrResult.total_amount }}</strong></el-descriptions-item>
              <el-descriptions-item label="税率">{{ ocrResult.tax_rate }}</el-descriptions-item>
              <el-descriptions-item label="开票日期">{{ ocrResult.invoice_date }}</el-descriptions-item>
              <el-descriptions-item label="校验码">{{ ocrResult.check_code }}</el-descriptions-item>
            </el-descriptions>
            <div v-if="ocrDuplicate" style="color: var(--el-color-danger); margin-top: 8px;">
              <el-icon><Warning /></el-icon> 发票查重拦截: 该发票已录入(ID: {{ ocrDuplicateId }})
            </div>
            <div v-else style="margin-top: 12px; text-align: right;">
              <el-button type="primary" :loading="saving" @click="saveOcr">保存到台账</el-button>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="ocrVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 发票详情 -->
    <el-dialog v-model="detailVisible" :title="'发票详情 - ' + (detail?.invoice_code || '') + ' ' + (detail?.invoice_no || '')" width="620px" draggable>
      <el-descriptions v-if="detail" :column="2" border size="small">
        <el-descriptions-item label="类型">{{ detail.invoice_type }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="detail.status === '正常' ? 'success' : 'danger'" size="small">{{ detail.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="销方">{{ detail.seller }}</el-descriptions-item>
        <el-descriptions-item label="买方">{{ detail.buyer }}</el-descriptions-item>
        <el-descriptions-item label="不含税">¥{{ fmtAmt(detail.amount) }}</el-descriptions-item>
        <el-descriptions-item label="税额">¥{{ fmtAmt(detail.tax_amount) }}</el-descriptions-item>
        <el-descriptions-item label="价税合计"><strong>¥{{ fmtAmt(detail.total_amount) }}</strong></el-descriptions-item>
        <el-descriptions-item label="税率">{{ detail.tax_rate }}</el-descriptions-item>
        <el-descriptions-item label="开票日期">{{ detail.invoice_date }}</el-descriptions-item>
        <el-descriptions-item label="校验码">{{ detail.check_code }}</el-descriptions-item>
        <el-descriptions-item label="校验">
          <el-tag :type="verifiedType(detail.verified)" size="small">{{ detail.verified }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="来源">{{ detail.source }}</el-descriptions-item>
        <el-descriptions-item label="校验结果" :span="2">{{ detail.verified_result || '' }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Tickets, CircleCheck, Money, Warning, Camera, Plus, Finished, View, Printer, Check,
  CircleClose, Delete, UploadFilled, Loading,
} from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { fmtAmt, fmtMoney, invStatusType, verifiedType, canPrint, esc, openPrintWindow } from './finUtils';
import StatCard from './StatCard.vue';

const auth = useAuthStore();
const printable = computed(() => canPrint(auth.user));

const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const total = ref(0);
const s = ref({});
const selectedIds = ref([]);

const formVisible = ref(false);
const form = ref({});
const detailVisible = ref(false);
const detail = ref(null);

const ocrVisible = ref(false);
const ocrFileRef = ref(null);
const ocrLoading = ref(false);
const ocrError = ref('');
const ocrResult = ref(null);
const ocrDuplicate = ref(false);
const ocrDuplicateId = ref('');

function countBy(arr, key, val) {
  return (arr || []).find((b) => b[key] === val)?.c || 0;
}

async function load() {
  loading.value = true;
  try {
    const [listResp, statsResp] = await Promise.all([
      request.get('/fin-invoice', { params: { pageSize: 50 } }),
      request.get('/fin-invoice/stats/summary'),
    ]);
    list.value = listResp.code === 200 ? listResp.data?.list || [] : [];
    total.value = listResp.code === 200 ? listResp.data?.total || 0 : 0;
    s.value = statsResp.code === 200 ? statsResp.data || {} : {};
  } finally {
    loading.value = false;
  }
}

function showForm() {
  form.value = {
    invoice_type: '增值税专用发票', invoice_code: '', invoice_no: '', seller: '',
    amount: undefined, tax_amount: undefined, total_amount: undefined, invoice_date: '',
  };
  formVisible.value = true;
}

async function saveForm() {
  const f = form.value;
  if (!f.invoice_code || !f.invoice_no) { ElMessage.warning('发票代码和号码必填'); return; }
  const data = {
    invoice_type: f.invoice_type,
    invoice_code: f.invoice_code,
    invoice_no: f.invoice_no,
    seller: f.seller,
    amount: parseFloat(f.amount) || 0,
    tax_amount: parseFloat(f.tax_amount) || 0,
    total_amount: parseFloat(f.total_amount) || 0,
    invoice_date: f.invoice_date || '',
  };
  saving.value = true;
  try {
    const resp = await request.post('/fin-invoice', data);
    if (resp.code === 200) {
      formVisible.value = false;
      ElMessage.success('录入成功');
      load();
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

// ===== OCR 识别 =====
function resetOcr() {
  ocrResult.value = null;
  ocrError.value = '';
  ocrLoading.value = false;
  ocrDuplicate.value = false;
  ocrDuplicateId.value = '';
  if (ocrFileRef.value) ocrFileRef.value.value = '';
}

function doOcr(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  ocrLoading.value = true;
  ocrError.value = '';
  ocrResult.value = null;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const resp = await request.post('/fin-invoice/ocr-recognize', {
        image_data: ev.target.result,
        image_name: file.name,
      });
      if (resp.code === 200) {
        ocrResult.value = resp.data.ocr_result;
        const dup = resp.data.duplicate_check || {};
        ocrDuplicate.value = !!dup.is_duplicate;
        ocrDuplicateId.value = dup.existing_id || '';
      } else {
        ocrError.value = resp.msg || '未知错误';
      }
    } finally {
      ocrLoading.value = false;
    }
  };
  reader.readAsDataURL(file);
}

async function saveOcr() {
  saving.value = true;
  try {
    const resp = await request.post('/fin-invoice/save-ocr', { ocr_result: ocrResult.value });
    if (resp.code === 200) {
      ocrVisible.value = false;
      ElMessage.success('已保存到台账');
      load();
    } else {
      ElMessage.error(resp.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

async function viewRow(id) {
  const resp = await request.get('/fin-invoice/' + id);
  if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); return; }
  detail.value = resp.data;
  detailVisible.value = true;
}

async function verifyRow(id) {
  try {
    await ElMessageBox.confirm('确认校验发票真伪？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.post(`/fin-invoice/${id}/verify`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '校验完成'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function batchVerify() {
  if (!selectedIds.value.length) { ElMessage.warning('请先选择发票'); return; }
  const resp = await request.post('/fin-invoice/batch-verify', { ids: selectedIds.value });
  if (resp.code === 200) { ElMessage.success(resp.msg || '批量校验完成'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function rejectRow(id) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('异常原因:', '标记异常', {
      inputValue: '发票信息有误',
      inputValidator: (v) => (v && v.trim() ? true : '异常原因必填'),
    });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/fin-invoice/${id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success('已标记异常'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

async function deleteRow(id) {
  try {
    await ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' });
  } catch { return; }
  const resp = await request.delete('/fin-invoice/' + id);
  if (resp.code === 200) { ElMessage.success('已删除'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// 打印发票 — 对应 _printInvoiceDetail
function printRow(r) {
  const body = `<table>
    <tr><th>发票代码</th><td>${esc(r.invoice_code)}</td><th>发票号码</th><td>${esc(r.invoice_no)}</td></tr>
    <tr><th>发票类型</th><td>${esc(r.invoice_type)}</td><th>开票日期</th><td>${esc(r.invoice_date || '')}</td></tr>
    <tr><th>销方名称</th><td>${esc(r.seller || '')}</td><th>购方名称</th><td>${esc(r.buyer || '')}</td></tr>
    <tr><th>金额</th><td>¥${fmtAmt(r.amount)}</td><th>税额</th><td>¥${fmtAmt(r.tax_amount)}</td></tr>
    <tr><th>价税合计</th><td colspan="3"><strong>¥${fmtAmt(r.total_amount)}</strong></td></tr>
    <tr><th>状态</th><td><span class="tag tag-${r.status === '正常' ? 'green' : 'red'}">${esc(r.status || '')}</span></td><th>校验状态</th><td>${esc(r.verified_status || '未校验')}</td></tr>
  </table>`;
  if (!openPrintWindow('发票详情', body, auth.user?.name)) {
    ElMessage.warning('请允许弹出窗口以使用打印功能');
  }
}

onMounted(load);
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
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
.ocr-drop {
  border: 2px dashed var(--el-border-color);
  border-radius: 12px;
  padding: 40px;
  cursor: pointer;
}
.ocr-result {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 16px;
}
</style>
