<template>
  <div class="trade-finance">
    <div class="page-header">
      <h2>财务互通中心</h2>
      <p>业务单据财务同步 · 应收应付 · 凭证 · 异常捕捉</p>
    </div>

    <!-- KPI 卡片 -->
    <div class="kpi-grid" v-if="dash">
      <div class="kpi-card" v-for="k in kpis" :key="k.title">
        <div class="kpi-icon" :style="{ background: k.color + '20' }">
          <el-icon :size="18" :color="k.color"><component :is="k.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-title">{{ k.title }}</div>
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </div>
      </div>
    </div>

    <el-tabs v-model="tab" @tab-change="loadTab">
      <el-tab-pane label="总览" name="overview" />
      <el-tab-pane label="应付账款" name="ap" />
      <el-tab-pane label="应收账款" name="ar" />
      <el-tab-pane label="记账凭证" name="vouchers" />
      <el-tab-pane label="同步日志" name="sync" />
      <el-tab-pane label="异常捕捉" name="alerts" />
      <el-tab-pane label="往来单位" name="partners" />
      <el-tab-pane label="进销存报表" name="report" />
    </el-tabs>

    <div v-loading="tabLoading">
      <!-- 总览 -->
      <template v-if="tab === 'overview'">
        <p class="muted" style="font-size:13px;">业务单据生效时财务自动同步；打开本中心会自动重试失败同步（最多3次）。付款/回款由财务登记后反向更新业务单据状态。</p>
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <h4>最近付款（采购）</h4>
            <el-table :data="payRows" stripe size="small">
              <el-table-column prop="id" label="单号" width="150" />
              <el-table-column prop="supplier_name" label="供应商" min-width="140" show-overflow-tooltip />
              <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
              <el-table-column prop="po_no" label="订单" width="140" show-overflow-tooltip />
              <template #empty><span class="muted">暂无付款</span></template>
            </el-table>
          </el-col>
          <el-col :xs="24" :md="12">
            <h4>最近回款（销售）</h4>
            <el-table :data="rcRows" stripe size="small">
              <el-table-column prop="id" label="单号" width="150" />
              <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
              <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
              <el-table-column prop="so_no" label="订单" width="140" show-overflow-tooltip />
              <template #empty><span class="muted">暂无回款</span></template>
            </el-table>
          </el-col>
        </el-row>
      </template>

      <!-- 应付账款 -->
      <template v-else-if="tab === 'ap'">
        <div class="tab-toolbar"><span class="muted">采购订单生效→待确认；入库生效→正式应付；退货生效→冲减</span></div>
        <el-table :data="apRows" stripe size="small">
          <el-table-column prop="source_no" label="来源单号" width="150" show-overflow-tooltip />
          <el-table-column prop="supplier_name" label="供应商" min-width="140" show-overflow-tooltip />
          <el-table-column label="订单金额" width="110"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
          <el-table-column label="确认应付" width="110"><template #default="{ row }">¥{{ money(row.confirmed_amount || row.amount) }}</template></el-table-column>
          <el-table-column label="已付款" width="110"><template #default="{ row }">¥{{ money(row.pay_amount) }}</template></el-table-column>
          <el-table-column label="余额" width="110">
            <template #default="{ row }">
              <b :style="{ color: apBal(row) > 0.01 ? '#f59e0b' : '#909399' }">¥{{ money(apBal(row)) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="stType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="凭证" width="140" show-overflow-tooltip><template #default="{ row }">{{ row.voucher_no || '—' }}</template></el-table-column>
          <el-table-column v-if="isFinance" label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button v-if="['正式', '部分核销'].includes(row.status)" size="small" type="primary" @click="openPay(row)">付款</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无应付账款</span></template>
        </el-table>
      </template>

      <!-- 应收账款 -->
      <template v-else-if="tab === 'ar'">
        <div class="tab-toolbar"><span class="muted">销售订单生效→待确认；出库生效→正式应收（含销项税）；退货生效→冲减</span></div>
        <el-table :data="arRows" stripe size="small">
          <el-table-column prop="source_no" label="来源单号" width="150" show-overflow-tooltip />
          <el-table-column prop="customer_name" label="客户" min-width="140" show-overflow-tooltip />
          <el-table-column label="订单金额" width="110"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
          <el-table-column label="确认应收" width="110"><template #default="{ row }">¥{{ money(row.confirmed_amount || row.amount) }}</template></el-table-column>
          <el-table-column label="已回款" width="110"><template #default="{ row }">¥{{ money(row.received_amount) }}</template></el-table-column>
          <el-table-column label="余额" width="110">
            <template #default="{ row }">
              <b :style="{ color: arBal(row) > 0.01 ? '#f59e0b' : '#909399' }">¥{{ money(arBal(row)) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="stType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="凭证" width="140" show-overflow-tooltip><template #default="{ row }">{{ row.voucher_no || '—' }}</template></el-table-column>
          <el-table-column v-if="isFinance" label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button v-if="['正式', '部分核销'].includes(row.status)" size="small" type="primary" @click="openRcv(row)">回款</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无应收账款</span></template>
        </el-table>
      </template>

      <!-- 记账凭证 -->
      <template v-else-if="tab === 'vouchers'">
        <el-table :data="voucherRows" stripe size="small">
          <el-table-column prop="voucher_no" label="凭证号" width="150" show-overflow-tooltip />
          <el-table-column prop="vtype" label="类型" width="100" />
          <el-table-column prop="ref_no" label="关联单号" width="150" show-overflow-tooltip />
          <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
          <el-table-column label="方向" width="90">
            <template #default="{ row }"><el-tag :type="stType(row.direction === '支出' ? '部分付款' : '部分回款')" size="small">{{ row.direction }}</el-tag></template>
          </el-table-column>
          <el-table-column label="摘要" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ (row.summary || '').slice(0, 30) }}</template></el-table-column>
          <el-table-column prop="created_by" label="制单人" width="90" />
          <el-table-column prop="created_at" label="时间" width="150"><template #default="{ row }"><span style="font-size:11px;">{{ row.created_at || '' }}</span></template></el-table-column>
          <template #empty><span class="muted">暂无凭证</span></template>
        </el-table>
      </template>

      <!-- 同步日志 -->
      <template v-else-if="tab === 'sync'">
        <div class="tab-toolbar">
          <span class="muted">同步失败自动重试3次；仍失败可手动重试（红色高亮）</span>
          <span class="muted">失败 {{ syncFailedCount }} 条</span>
        </div>
        <el-table :data="syncRows" stripe size="small" :row-style="syncRowStyle">
          <el-table-column prop="biz_type" label="业务类型" width="110" />
          <el-table-column prop="biz_no" label="业务单号" width="150" show-overflow-tooltip />
          <el-table-column label="动作" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ (row.action || '').slice(0, 30) }}</template></el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="stType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="重试次数" width="80"><template #default="{ row }">{{ row.retries }}/3</template></el-table-column>
          <el-table-column label="错误信息" min-width="160" show-overflow-tooltip>
            <template #default="{ row }"><span :style="{ fontSize: '11px', color: row.error_msg ? '#ef4444' : 'inherit' }">{{ (row.error_msg || '').slice(0, 40) }}</span></template>
          </el-table-column>
          <el-table-column label="时间" width="150"><template #default="{ row }"><span style="font-size:11px;">{{ row.synced_at || '' }}</span></template></el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'failed' && row.retries < 3" size="small" type="primary" @click="onRetrySync(row)">手动重试</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无同步日志</span></template>
        </el-table>
      </template>

      <!-- 异常捕捉 -->
      <template v-else-if="tab === 'alerts'">
        <p class="muted" style="font-size:13px;margin-bottom:12px;">自动捕捉：单笔金额≥50万 / 税率非0·6·9·13 / 关键字段缺失，命中即生成待复核告警</p>
        <el-table :data="alertRows" stripe size="small">
          <el-table-column prop="biz_type" label="业务" width="100" />
          <el-table-column prop="biz_no" label="单号" width="150" show-overflow-tooltip />
          <el-table-column prop="alert_type" label="告警类型" width="110" />
          <el-table-column label="级别" width="90">
            <template #default="{ row }">
              <el-tag :type="row.level === '高' ? 'danger' : row.level === '中' ? 'warning' : 'success'" size="small">{{ row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="内容" min-width="200">
            <template #default="{ row }">
              <span style="font-size:12px;">{{ row.msg }}</span>
              <div v-if="row.review_note" class="muted" style="font-size:12px;">复核: {{ row.review_note }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="stType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待复核'" size="small" type="primary" @click="onReviewAlert(row)">复核</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无异常告警</span></template>
        </el-table>
      </template>

      <!-- 往来单位 -->
      <template v-else-if="tab === 'partners'">
        <div class="tab-toolbar">
          <span class="muted">往来单位 = 供应商 + 客户主档自动同步（打开时全量刷新）</span>
          <span class="muted">共 {{ partnerRows.length }} 家</span>
        </div>
        <el-table :data="partnerRows" stripe size="small">
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag :type="row.partner_type === 'supplier' ? 'warning' : 'primary'" size="small">{{ row.partner_type === 'supplier' ? '供应商' : '客户' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="联系人" width="100"><template #default="{ row }">{{ row.contact || '—' }}</template></el-table-column>
          <el-table-column label="电话" width="130"><template #default="{ row }">{{ row.phone || '—' }}</template></el-table-column>
          <el-table-column label="税率" width="80"><template #default="{ row }">{{ row.tax_rate || '—' }}</template></el-table-column>
          <el-table-column label="结算周期" width="100"><template #default="{ row }">{{ row.settle_cycle || '—' }}</template></el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="stType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="同步时间" width="150"><template #default="{ row }"><span style="font-size:11px;">{{ row.synced_at || '' }}</span></template></el-table-column>
          <template #empty><span class="muted">暂无往来单位</span></template>
        </el-table>
      </template>

      <!-- 进销存报表 -->
      <template v-else-if="tab === 'report'">
        <div class="tab-toolbar">
          <span class="muted">近12个月采购 vs 销售（价税合计），支持CSV导出</span>
          <el-button type="primary" @click="onExportCsv"><el-icon><Download /></el-icon> 导出月度对账CSV</el-button>
        </div>
        <el-table :data="reportRows" stripe size="small">
          <el-table-column prop="month" label="月份" width="120" />
          <el-table-column label="采购额" width="140"><template #default="{ row }">¥{{ money(row.purchase) }}</template></el-table-column>
          <el-table-column label="销售额" width="140"><template #default="{ row }">¥{{ money(row.sales) }}</template></el-table-column>
          <el-table-column label="差额(销售-采购)" min-width="150">
            <template #default="{ row }"><b :style="{ color: row.diff >= 0 ? '#10b981' : '#ef4444' }">¥{{ money(row.diff) }}</b></template>
          </el-table-column>
          <template #empty><span class="muted">暂无报表数据</span></template>
        </el-table>
      </template>
    </div>

    <!-- 付款登记 -->
    <el-dialog v-model="payDlg.visible" title="付款登记" width="460px">
      <p class="muted" style="font-size:12px;margin-top:0;">采购订单：{{ payDlg.poId }} · 应付余额 ¥{{ money(payDlg.bal) }}</p>
      <el-form label-width="90px">
        <el-form-item label="付款金额" required>
          <el-input-number v-model="payDlg.amount" :min="0.01" :max="payDlg.bal" :precision="2" :step="0.01" style="width:100%;" :placeholder="'不超过 ' + payDlg.bal" />
        </el-form-item>
        <el-form-item label="付款日期">
          <el-date-picker v-model="payDlg.pay_date" type="date" value-format="YYYY-MM-DD" style="width:100%;" />
        </el-form-item>
        <el-form-item label="付款方式">
          <el-select v-model="payDlg.way" style="width:100%;">
            <el-option v-for="w in ['银行转账', '承兑汇票', '现金', '支票']" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="payDlg.saving" @click="submitPay">确认付款</el-button>
      </template>
    </el-dialog>

    <!-- 回款登记 -->
    <el-dialog v-model="rcvDlg.visible" title="回款登记" width="460px">
      <p class="muted" style="font-size:12px;margin-top:0;">销售订单：{{ rcvDlg.soId }} · 应收余额 ¥{{ money(rcvDlg.bal) }}</p>
      <el-form label-width="90px">
        <el-form-item label="回款金额" required>
          <el-input-number v-model="rcvDlg.amount" :min="0.01" :max="rcvDlg.bal" :precision="2" :step="0.01" style="width:100%;" :placeholder="'不超过 ' + rcvDlg.bal" />
        </el-form-item>
        <el-form-item label="回款日期">
          <el-date-picker v-model="rcvDlg.receipt_date" type="date" value-format="YYYY-MM-DD" style="width:100%;" />
        </el-form-item>
        <el-form-item label="回款方式">
          <el-select v-model="rcvDlg.way" style="width:100%;">
            <el-option v-for="w in ['银行转账', '承兑汇票', '现金', '支付宝', '微信']" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rcvDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="rcvDlg.saving" @click="submitRcv">确认回款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CreditCard, Money, Tickets, WarningFilled, Connection, Download } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const today = new Date().toISOString().slice(0, 10);

function money(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return '0.00';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function stType(s) {
  const map = {
    '待审批': 'warning', '审批中': 'primary', '已生效': 'success', '已通过': 'success', '已驳回': 'danger', '已作废': 'info',
    '待确认': 'warning', '正式': 'primary', '部分核销': 'primary', '已核销': 'success',
    '未付款': 'info', '部分付款': 'warning', '已全额付款': 'success',
    '未回款': 'info', '部分回款': 'warning', '已全额回款': 'success', '财务已入账': 'primary',
    '待复核': 'danger', '已复核': 'success', success: 'success', failed: 'danger'
  };
  return map[s] || 'info';
}
// 财务权限（与参考项目一致：超管/总经理/财务部）
const isFinance = computed(() => {
  const u = auth.user;
  if (!u) return false;
  if (['超级管理员', '总经理'].includes(u.role)) return true;
  return u.dept === '财务部';
});

const tab = ref('overview');
const tabLoading = ref(false);
const dash = ref(null);
const payRows = ref([]);
const rcRows = ref([]);
const apRows = ref([]);
const arRows = ref([]);
const voucherRows = ref([]);
const syncRows = ref([]);
const alertRows = ref([]);
const partnerRows = ref([]);
const reportRows = ref([]);

const kpis = computed(() => {
  if (!dash.value) return [];
  const d = dash.value;
  return [
    { title: '应付余额', value: '¥' + money(d.ap.balance), sub: '总额¥' + money(d.ap.total) + ' 已付¥' + money(d.ap.paid), icon: CreditCard, color: '#f59e0b' },
    { title: '应收余额', value: '¥' + money(d.ar.balance), sub: '总额¥' + money(d.ar.total) + ' 已收¥' + money(d.ar.received), icon: Money, color: '#10b981' },
    { title: '自动凭证', value: d.vouchers.count + ' 张', sub: '¥' + money(d.vouchers.amount), icon: Tickets, color: '#8b5cf6' },
    { title: '同步异常', value: (d.sync.failed || 0) + ' 条', sub: '待复核告警 ' + (d.sync.pendingAlerts || 0) + ' 条', icon: WarningFilled, color: d.sync.failed > 0 ? '#ef4444' : '#2563eb' },
    { title: '往来单位', value: d.partners + ' 家', sub: '供应商+客户', icon: Connection, color: '#06b6e4' }
  ];
});
const syncFailedCount = computed(() => syncRows.value.filter(x => x.status === 'failed').length);
const apBal = (a) => (Number(a.confirmed_amount) || Number(a.amount) || 0) - (Number(a.pay_amount) || 0);
const arBal = (a) => (Number(a.confirmed_amount) || Number(a.amount) || 0) - (Number(a.received_amount) || 0);
const syncRowStyle = ({ row }) => (row.status === 'failed' ? { background: 'rgba(239,68,68,0.06)' } : {});

async function loadDashboard() {
  const r = await request.get('/trade-finance/dashboard');
  if (r.code === 200) dash.value = r.data;
  else ElMessage.error('加载失败: ' + (r.msg || ''));
}

async function loadTab() {
  tabLoading.value = true;
  try {
    if (tab.value === 'overview') {
      const [pays, rcs] = await Promise.all([request.get('/trade-finance/pays'), request.get('/trade-finance/receipts')]);
      payRows.value = pays.code === 200 ? (pays.data || []).slice(0, 10) : [];
      rcRows.value = rcs.code === 200 ? (rcs.data || []).slice(0, 10) : [];
    } else if (tab.value === 'ap') {
      const r = await request.get('/trade-finance/ap');
      apRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'ar') {
      const r = await request.get('/trade-finance/ar');
      arRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'vouchers') {
      const r = await request.get('/trade-finance/vouchers');
      voucherRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'sync') {
      const r = await request.get('/trade-finance/sync-logs');
      syncRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'alerts') {
      const r = await request.get('/trade-finance/alerts');
      alertRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'partners') {
      const r = await request.get('/trade-finance/partners');
      partnerRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'report') {
      const r = await request.get('/trade-finance/report/monthly');
      reportRows.value = r.code === 200 ? r.data || [] : [];
    }
  } finally {
    tabLoading.value = false;
  }
}

onMounted(async () => {
  await loadDashboard();
  await loadTab();
});

/* ---- 付款登记 ---- */
const payDlg = reactive({ visible: false, saving: false, poId: '', bal: 0, amount: null, pay_date: today, way: '银行转账' });
function openPay(row) {
  payDlg.poId = row.source_id;
  payDlg.bal = apBal(row);
  payDlg.amount = null;
  payDlg.pay_date = today;
  payDlg.way = '银行转账';
  payDlg.visible = true;
}
async function submitPay() {
  if (!(payDlg.amount > 0)) { ElMessage.warning('请输入正确的付款金额'); return; }
  payDlg.saving = true;
  const r = await request.post('/trade-finance/pay', { po_id: payDlg.poId, amount: payDlg.amount, pay_date: payDlg.pay_date, way: payDlg.way });
  payDlg.saving = false;
  if (r.code === 200) {
    payDlg.visible = false;
    ElMessage.success(r.msg || '付款成功');
    await loadDashboard();
    tab.value = 'ap';
    await loadTab();
  } else ElMessage.error(r.msg || '付款失败');
}

/* ---- 回款登记 ---- */
const rcvDlg = reactive({ visible: false, saving: false, soId: '', bal: 0, amount: null, receipt_date: today, way: '银行转账' });
function openRcv(row) {
  rcvDlg.soId = row.source_id;
  rcvDlg.bal = arBal(row);
  rcvDlg.amount = null;
  rcvDlg.receipt_date = today;
  rcvDlg.way = '银行转账';
  rcvDlg.visible = true;
}
async function submitRcv() {
  if (!(rcvDlg.amount > 0)) { ElMessage.warning('请输入正确的回款金额'); return; }
  rcvDlg.saving = true;
  const r = await request.post('/trade-finance/receipt', { so_id: rcvDlg.soId, amount: rcvDlg.amount, receipt_date: rcvDlg.receipt_date, way: rcvDlg.way });
  rcvDlg.saving = false;
  if (r.code === 200) {
    rcvDlg.visible = false;
    ElMessage.success(r.msg || '回款成功');
    await loadDashboard();
    tab.value = 'ar';
    await loadTab();
  } else ElMessage.error(r.msg || '回款失败');
}

/* ---- 同步重试 ---- */
async function onRetrySync(row) {
  const r = await request.post('/trade-finance/sync-retry/' + row.id);
  if (r.code === 200) { ElMessage.success(r.msg || '重试完成'); loadTab(); }
  else ElMessage.error(r.msg || '重试失败');
}

/* ---- 告警复核 ---- */
async function onReviewAlert(row) {
  let note;
  try {
    const { value } = await ElMessageBox.prompt('复核意见（可留空）：', '告警复核', { confirmButtonText: '确定', cancelButtonText: '取消' });
    note = value;
  } catch { return; }
  const r = await request.post(`/trade-finance/alerts/${row.id}/review`, { remark: (note || '').trim() });
  if (r.code === 200) { ElMessage.success('已复核'); loadTab(); }
  else ElMessage.error(r.msg || '操作失败');
}

/* ---- CSV 导出 ---- */
async function onExportCsv() {
  const token = localStorage.getItem('zm_token');
  const resp = await fetch('/api/trade-finance/export', { headers: { Authorization: 'Bearer ' + token } });
  if (!resp.ok) { ElMessage.error('导出失败'); return; }
  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '进销存月度对账_' + today + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<style scoped>
.trade-finance { padding: 20px; }
.muted { color: #909399; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
</style>
