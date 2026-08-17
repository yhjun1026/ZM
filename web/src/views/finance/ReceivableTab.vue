<template>
  <div v-loading="loading">
    <!-- 统计卡片 -->
    <div class="stats-grid">
      <StatCard title="应收总额" :value="'¥' + fmtMoney(st.total?.amt)" :sub="(st.total?.c || 0) + '笔'" :icon="Download" color="#2563eb" />
      <StatCard title="已回款" :value="'¥' + fmtMoney(st.received?.amt)" :sub="(st.received?.c || 0) + '笔'" :icon="CircleCheck" color="#10b981" />
      <StatCard title="待回款" :value="'¥' + fmtMoney(st.pending?.amt)" :sub="(st.pending?.c || 0) + '笔'" :icon="Clock" color="#f59e0b" />
      <StatCard title="逾期" :value="'¥' + fmtMoney(st.overdue?.amt)" :sub="(st.overdue?.c || 0) + '笔'" :icon="Warning" color="#ef4444" />
    </div>

    <!-- 付款类型分布 -->
    <el-card v-if="byType.length" shadow="never" style="margin-bottom: 20px;">
      <template #header>
        <span><el-icon><PieChart /></el-icon> 付款类型分布</span>
      </template>
      <el-table :data="byType" size="small">
        <el-table-column prop="pay_type" label="付款类型" />
        <el-table-column prop="c" label="笔数" width="80" />
        <el-table-column label="应收金额" width="130">
          <template #default="{ row }">¥{{ fmtMoney(row.amt) }}</template>
        </el-table-column>
        <el-table-column label="已收金额" width="130">
          <template #default="{ row }">¥{{ fmtMoney(row.recv) }}</template>
        </el-table-column>
        <el-table-column label="回款率" width="90">
          <template #default="{ row }">{{ row.amt > 0 ? Math.round(row.recv / row.amt * 100) : 0 }}%</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 应收明细 -->
    <el-card shadow="never">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span><el-icon><List /></el-icon> 应收账款明细</span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <el-select v-model="filterType" placeholder="全部类型" clearable size="small" style="width: 120px;" @change="loadList">
              <el-option v-for="t in PAY_TYPES" :key="t" :label="t" :value="t" />
            </el-select>
            <el-select v-model="filterStatus" placeholder="全部状态" clearable size="small" style="width: 120px;" @change="loadList">
              <el-option v-for="s in ['待回款', '部分回款', '已回款', '逾期']" :key="s" :label="s" :value="s" />
            </el-select>
            <el-button v-if="canEntry" type="primary" size="small" :icon="Plus" @click="showForm()">新增应收</el-button>
          </div>
        </div>
      </template>
      <el-table :data="rows" size="small">
        <el-table-column prop="receivable_no" label="编号" min-width="110" />
        <el-table-column prop="customer_name" label="客户名称" min-width="120" />
        <el-table-column label="合同编号" min-width="110">
          <template #default="{ row }">{{ row.contract_no || '—' }}</template>
        </el-table-column>
        <el-table-column label="付款类型" width="100">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.pay_type }}</el-tag></template>
        </el-table-column>
        <el-table-column label="合同金额" width="110">
          <template #default="{ row }">¥{{ fmtMoney(row.contract_amount) }}</template>
        </el-table-column>
        <el-table-column label="应收金额" width="110">
          <template #default="{ row }">¥{{ fmtMoney(row.receivable_amount) }}</template>
        </el-table-column>
        <el-table-column label="已收金额" width="110">
          <template #default="{ row }">¥{{ fmtMoney(row.received_amount) }}</template>
        </el-table-column>
        <el-table-column label="回款比例" width="130">
          <template #default="{ row }">{{ row.pay_ratio }}%（实收{{ recvRatio(row) }}%）</template>
        </el-table-column>
        <el-table-column label="计划回款日期" width="110">
          <template #default="{ row }">{{ row.plan_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="实际回款日期" width="110">
          <template #default="{ row }">{{ row.actual_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :style="{ color: recvStatusColor(row.status), fontWeight: 600 }">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== '已回款'" type="success" size="small" :icon="Money" @click="showPay(row)">回款</el-button>
            <el-button type="info" size="small" :icon="View" circle @click="showDetail(row)" />
            <template v-if="canEntry && row.status !== '已回款'">
              <el-button type="warning" size="small" :icon="Edit" circle @click="showForm(row)" />
              <el-button type="danger" size="small" :icon="Delete" circle @click="delRow(row)" />
            </template>
          </template>
        </el-table-column>
        <template #empty>
          <div style="text-align: center; padding: 24px; color: var(--el-text-color-secondary);">暂无应收账款记录</div>
        </template>
      </el-table>
    </el-card>

    <!-- 新增/编辑应收 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑应收账款' : '新增应收账款'" width="600px" draggable>
      <el-form label-width="120px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="客户名称" required><el-input v-model="form.customer_name" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同编号"><el-input v-model="form.contract_no" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="合同总金额">
              <el-input-number v-model="form.contract_amount" :min="0" :precision="2" style="width: 100%;" @change="calcRatio" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="付款类型" required>
              <el-select v-model="form.pay_type" style="width: 100%;">
                <el-option v-for="t in PAY_TYPES" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="应收金额" required>
              <el-input-number v-model="form.receivable_amount" :min="0" :precision="2" style="width: 100%;" @change="calcRatio" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="回款比例 (%)">
              <el-input-number v-model="form.pay_ratio" :min="0" :precision="1" placeholder="自动计算或手动输入" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="计划回款时间节点" required>
          <el-date-picker v-model="form.plan_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">{{ form.id ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 登记回款 -->
    <el-dialog v-model="payVisible" title="登记回款" width="420px" draggable>
      <el-form label-width="90px">
        <el-form-item label="回款金额" required>
          <el-input-number v-model="payForm.amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="回款日期">
          <el-date-picker v-model="payForm.receive_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="payForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payVisible = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="submitPay">确认回款</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailVisible" title="应收账款详情" width="560px" draggable>
      <el-descriptions v-if="detail" :column="1" border size="small">
        <el-descriptions-item label="编号">{{ detail.receivable_no }}</el-descriptions-item>
        <el-descriptions-item label="客户名称">{{ detail.customer_name }}</el-descriptions-item>
        <el-descriptions-item label="合同编号">{{ detail.contract_no || '—' }}</el-descriptions-item>
        <el-descriptions-item label="付款类型">{{ detail.pay_type }}</el-descriptions-item>
        <el-descriptions-item label="合同总金额">¥{{ fmtMoney(detail.contract_amount) }}</el-descriptions-item>
        <el-descriptions-item label="应收金额">¥{{ fmtMoney(detail.receivable_amount) }}</el-descriptions-item>
        <el-descriptions-item label="已收金额">¥{{ fmtMoney(detail.received_amount) }}</el-descriptions-item>
        <el-descriptions-item label="回款比例">{{ detail.pay_ratio }}%（实收{{ recvRatio(detail) }}%）</el-descriptions-item>
        <el-descriptions-item label="计划回款日期">{{ detail.plan_date || '—' }}</el-descriptions-item>
        <el-descriptions-item label="实际回款日期">{{ detail.actual_date || '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ detail.status }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ detail.creator_name }}（{{ detail.creator_dept }}）</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detail.created_at || '—' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detail.remark || '—' }}</el-descriptions-item>
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
import { Download, CircleCheck, Clock, Warning, PieChart, List, Plus, Money, View, Edit, Delete } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { fmtMoney, canFinanceEntry } from './finUtils';
import StatCard from './StatCard.vue';

const PAY_TYPES = ['首次付款', '进度付款', '节点付款', '合同尾款', '预付款'];

const auth = useAuthStore();
const canEntry = computed(() => canFinanceEntry(auth.user));

const loading = ref(false);
const saving = ref(false);
const rows = ref([]);
const st = ref({});
const byType = ref([]);
const filterType = ref('');
const filterStatus = ref('');

const formVisible = ref(false);
const form = ref({});
const payVisible = ref(false);
const payForm = ref({});
const detailVisible = ref(false);
const detail = ref(null);

function recvRatio(r) {
  return r.receivable_amount > 0 ? Math.round(r.received_amount / r.receivable_amount * 100) : 0;
}
function recvStatusColor(s) {
  return s === '已回款' ? '#10b981' : s === '逾期' ? '#ef4444' : s === '部分回款' ? '#f59e0b' : '#6366f1';
}

async function load() {
  loading.value = true;
  try {
    const [listRes, statsRes] = await Promise.all([
      request.get('/fin-receivable/list'),
      request.get('/fin-receivable/stats'),
    ]);
    rows.value = listRes.code === 200 ? listRes.data || [] : [];
    const s = statsRes.code === 200 ? statsRes.data || {} : {};
    st.value = s;
    byType.value = s.byType || [];
  } finally {
    loading.value = false;
  }
}

// 筛选后重新加载列表
async function loadList() {
  const params = {};
  if (filterType.value) params.pay_type = filterType.value;
  if (filterStatus.value) params.status = filterStatus.value;
  const res = await request.get('/fin-receivable/list', { params });
  rows.value = res.code === 200 ? res.data || [] : [];
}

function showForm(row) {
  form.value = row
    ? { ...row }
    : { id: '', customer_name: '', contract_no: '', contract_amount: undefined, pay_type: PAY_TYPES[0], receivable_amount: undefined, pay_ratio: undefined, plan_date: '', remark: '' };
  formVisible.value = true;
}

// 对应 _calcRecvRatio
function calcRatio() {
  const ca = parseFloat(form.value.contract_amount) || 0;
  const ra = parseFloat(form.value.receivable_amount) || 0;
  if (ca > 0 && ra > 0) form.value.pay_ratio = Math.round(ra / ca * 1000) / 10;
}

async function submitForm() {
  const f = form.value;
  if (!f.customer_name || !f.customer_name.trim()) { ElMessage.warning('请填写客户名称'); return; }
  if (!f.receivable_amount) { ElMessage.warning('请填写应收金额'); return; }
  if (!f.plan_date) { ElMessage.warning('请选择计划回款时间节点'); return; }
  const data = {
    customer_name: f.customer_name.trim(),
    contract_no: (f.contract_no || '').trim(),
    contract_amount: parseFloat(f.contract_amount) || 0,
    pay_type: f.pay_type,
    receivable_amount: parseFloat(f.receivable_amount) || 0,
    pay_ratio: parseFloat(f.pay_ratio) || 0,
    plan_date: f.plan_date,
    remark: (f.remark || '').trim(),
  };
  saving.value = true;
  try {
    const res = f.id
      ? await request.put('/fin-receivable/update/' + f.id, data)
      : await request.post('/fin-receivable/create', data);
    if (res.code === 200) {
      formVisible.value = false;
      ElMessage.success(f.id ? '已更新' : '已创建');
      loadList();
    } else {
      ElMessage.error(res.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

function showPay(row) {
  payForm.value = { id: row.id, amount: undefined, receive_date: '', remark: '' };
  payVisible.value = true;
}

async function submitPay() {
  const p = payForm.value;
  if (!p.amount) { ElMessage.warning('请填写回款金额'); return; }
  saving.value = true;
  try {
    const res = await request.post('/fin-receivable/receive/' + p.id, {
      amount: parseFloat(p.amount) || 0,
      receive_date: p.receive_date || '',
      remark: (p.remark || '').trim(),
    });
    if (res.code === 200) {
      payVisible.value = false;
      ElMessage.success('回款已登记');
      load();
    } else {
      ElMessage.error(res.msg || '操作失败');
    }
  } finally {
    saving.value = false;
  }
}

function showDetail(row) {
  detail.value = row;
  detailVisible.value = true;
}

async function delRow(row) {
  try {
    await ElMessageBox.confirm('确定删除此应收账款记录？', '提示', { type: 'warning' });
  } catch { return; }
  const res = await request.delete('/fin-receivable/delete/' + row.id);
  if (res.code === 200) {
    ElMessage.success('已删除');
    loadList();
  } else {
    ElMessage.error(res.msg || '删除失败');
  }
}

onMounted(load);
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
</style>
