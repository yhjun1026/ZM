<template>
  <div class="supply">
    <div class="page-header">
      <h2>渠道履约</h2>
      <p>供货登记（审批通过入明细） → 供货申请（审批通过扣库存） → 库存预警联动 → DMS 订单查看</p>
    </div>

    <div class="kpi-grid" v-if="stats">
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

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <!-- ============ 明细台账 ============ -->
      <el-tab-pane label="供货明细" name="items">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="itemFilter.category" placeholder="全部分类" style="width:130px" clearable @change="loadItems">
              <el-option v-for="c in meta.categories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-input v-model="itemFilter.keyword" placeholder="搜索名称/规格" style="width:220px" clearable @change="loadItems" />
          </div>
          <el-button type="primary" @click="openReg">
            <el-icon style="margin-right:4px"><Plus /></el-icon>供货登记
          </el-button>
        </div>
        <el-table :data="itemRows" stripe size="small" v-loading="itemLoading">
          <el-table-column prop="name" label="用品名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="category" label="分类" width="110" />
          <el-table-column prop="spec" label="规格" min-width="130" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" width="70" />
          <el-table-column label="库存" width="90" align="right">
            <template #default="{ row }"><b>{{ row.stock }}</b></template>
          </el-table-column>
          <el-table-column label="预警线" width="90" align="right">
            <template #default="{ row }">{{ row.warn_level }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="itemStatusType(row)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openStock(row)">库存调整</el-button>
              <el-button size="small" type="primary" @click="openApply(row)">申请</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无供货明细，点击右上角「供货登记」新增</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 供货申请 ============ -->
      <el-tab-pane label="供货申请" name="apps">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="appFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadApps">
              <el-option v-for="s in meta.app_status" :key="s" :label="s" :value="s" />
            </el-select>
          </div>
          <el-button type="primary" @click="openApply()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>发起申请
          </el-button>
        </div>
        <el-table :data="appRows" stripe size="small" v-loading="appLoading">
          <el-table-column prop="app_no" label="申请单号" width="150" />
          <el-table-column prop="item_name" label="用品" min-width="140" show-overflow-tooltip />
          <el-table-column label="数量" width="90" align="right">
            <template #default="{ row }">{{ row.qty }}{{ row.unit || '' }}</template>
          </el-table-column>
          <el-table-column prop="applicant_name" label="申请人" width="100" />
          <el-table-column prop="dept_name" label="部门" width="110" />
          <el-table-column prop="reason" label="用途" min-width="160" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="时间" width="140">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === '审批中'">
                <el-button size="small" type="success" @click="dealApp(row, '通过')">通过</el-button>
                <el-button size="small" type="danger" @click="dealApp(row, '驳回')">驳回</el-button>
                <el-button size="small" @click="dealApp(row, '已撤销')">撤销</el-button>
              </template>
              <span v-else class="muted">已处理</span>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无供货申请</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 供货登记 ============ -->
      <el-tab-pane label="供货登记" name="regs">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="regFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadRegs">
              <el-option v-for="s in meta.reg_status" :key="s" :label="s" :value="s" />
            </el-select>
          </div>
          <el-button type="primary" @click="openReg">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增登记
          </el-button>
        </div>
        <el-table :data="regRows" stripe size="small" v-loading="regLoading">
          <el-table-column prop="name" label="用品名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="category" label="分类" width="110" />
          <el-table-column prop="spec" label="规格" min-width="130" show-overflow-tooltip />
          <el-table-column label="数量" width="100" align="right">
            <template #default="{ row }">{{ row.stock }}{{ row.unit || '' }}</template>
          </el-table-column>
          <el-table-column label="预警线" width="90" align="right">
            <template #default="{ row }">{{ row.warn_level }}</template>
          </el-table-column>
          <el-table-column prop="applicant_name" label="登记人" width="100" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="时间" width="140">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === '审批中'">
                <el-button size="small" type="success" @click="dealReg(row, '通过')">通过</el-button>
                <el-button size="small" type="danger" @click="dealReg(row, '驳回')">驳回</el-button>
              </template>
              <span v-else class="muted">已处理</span>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无供货登记</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ DMS 订单 ============ -->
      <el-tab-pane label="DMS 订单" name="orders">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-input v-model="orderFilter.keyword" placeholder="搜索订单号/产品/经销商" style="width:230px" clearable @change="loadOrders" />
            <el-select v-model="orderFilter.status" placeholder="全部状态" style="width:120px" clearable @change="loadOrders">
              <el-option v-for="s in orderStatusList" :key="s" :label="s" :value="s" />
            </el-select>
          </div>
          <span class="muted">订单由经销商 DMS 下单生成，此处只读</span>
        </div>
        <el-table :data="orderRows" stripe size="small" v-loading="orderLoading">
          <el-table-column prop="order_no" label="订单号" width="140" />
          <el-table-column prop="distributor_name" label="经销商" min-width="160" show-overflow-tooltip />
          <el-table-column prop="distributor_identity" label="身份" width="110" />
          <el-table-column prop="product_line" label="产品线" width="110" />
          <el-table-column prop="product" label="产品" min-width="150" show-overflow-tooltip />
          <el-table-column label="数量" width="80" align="right">
            <template #default="{ row }">{{ row.qty }}</template>
          </el-table-column>
          <el-table-column label="金额(万)" width="100" align="right">
            <template #default="{ row }"><b>{{ row.amount }}</b></template>
          </el-table-column>
          <el-table-column prop="sales_name" label="销售" width="90" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="orderStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="时间" width="140">
            <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <template #empty><span class="muted">暂无 DMS 订单</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 供货登记 -->
    <el-dialog v-model="regDlg.visible" title="供货登记" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="用品名称" required>
          <el-input v-model="regDlg.form.name" placeholder="如：A4 复印纸" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="regDlg.form.category" style="width:100%">
            <el-option v-for="c in meta.categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="规格">
          <el-input v-model="regDlg.form.spec" placeholder="如：70g/500张" />
        </el-form-item>
        <el-form-item label="单位">
          <el-input v-model="regDlg.form.unit" placeholder="个/包/箱" />
        </el-form-item>
        <el-form-item label="入库数量">
          <el-input-number v-model="regDlg.form.stock" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="库存预警线">
          <el-input-number v-model="regDlg.form.warn_level" :min="0" style="width:100%" />
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:0;">
        登记后进入「审批中」，审批通过后写入供货明细台账；入库数量 ≤ 预警线 自动标记「库存预警」。
      </p>
      <template #footer>
        <el-button @click="regDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="regDlg.saving" @click="submitReg">提交登记</el-button>
      </template>
    </el-dialog>

    <!-- 供货申请 -->
    <el-dialog v-model="appDlg.visible" title="供货申请" width="500px">
      <el-form label-width="100px" size="small">
        <el-form-item label="用品" required>
          <el-select v-model="appDlg.form.item_id" filterable style="width:100%" @change="onItemChange">
            <el-option v-for="i in itemRows" :key="i.id" :label="`${i.name}（余 ${i.stock}${i.unit}）`" :value="i.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="申请数量" required>
          <el-input-number v-model="appDlg.form.qty" :min="1" style="width:100%" />
        </el-form-item>
        <el-form-item label="用途说明">
          <el-input v-model="appDlg.form.reason" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="appDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="appDlg.saving" @click="submitApp">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 库存调整 -->
    <el-dialog v-model="stockDlg.visible" :title="'库存调整 · ' + stockDlg.name" width="420px">
      <el-form label-width="100px" size="small">
        <el-form-item label="当前库存">
          <el-input-number v-model="stockDlg.stock" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="预警线">
          <el-input-number v-model="stockDlg.warn_level" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="stockDlg.status" style="width:100%">
            <el-option v-for="s in meta.item_status" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:0;">不指定状态时，系统按「库存 ≤ 预警线」自动判定。</p>
      <template #footer>
        <el-button @click="stockDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="stockDlg.saving" @click="submitStock">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Box, Warning, Clock, Coin, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('items');
const stats = ref(null);
const meta = reactive({ categories: [], reg_status: [], app_status: [], item_status: [] });

const itemRows = ref([]);
const appRows = ref([]);
const regRows = ref([]);
const orderRows = ref([]);
const itemLoading = ref(false);
const appLoading = ref(false);
const regLoading = ref(false);
const orderLoading = ref(false);
const itemFilter = reactive({ category: '', keyword: '' });
const appFilter = reactive({ status: '' });
const regFilter = reactive({ status: '' });
const orderFilter = reactive({ keyword: '', status: '' });
const orderStatusList = ['待确认', '已确认', '已发货', '已完成', '已拒绝'];

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '明细种类', value: s.item_count, sub: `库存合计 ${s.item_stock}`, icon: Box, color: '#2563eb' },
    { title: '库存预警', value: s.warn_count, sub: '低于预警线，需补货', icon: Warning, color: '#ef4444' },
    { title: '待审批申请', value: s.app_pending, sub: `申请合计 ${s.app_count} 单`, icon: Clock, color: '#f59e0b' },
    { title: 'DMS 订单金额', value: s.order_amount + ' 万', sub: `订单 ${s.order_count} 单`, icon: Coin, color: '#10b981' },
  ];
});

function statusType(s) {
  return { 审批中: 'warning', 通过: 'success', 驳回: 'danger', 已撤销: 'info' }[s] || 'info';
}
function itemStatusType(row) {
  if (row.status === '停用') return 'info';
  return row.stock <= row.warn_level ? 'danger' : 'success';
}
function orderStatusType(s) {
  return { 待确认: 'warning', 已确认: 'primary', 已发货: 'success', 已完成: 'success', 已拒绝: 'danger' }[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/supply/meta');
  if (r.code === 200) Object.assign(meta, r.data || {});
}
async function loadStats() {
  const r = await request.get('/supply/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadItems() {
  itemLoading.value = true;
  try {
    const params = {};
    if (itemFilter.category) params.category = itemFilter.category;
    if (itemFilter.keyword) params.keyword = itemFilter.keyword;
    const r = await request.get('/supply/items', { params });
    itemRows.value = r.code === 200 ? r.data || [] : [];
  } finally { itemLoading.value = false; }
}
async function loadApps() {
  appLoading.value = true;
  try {
    const params = {};
    if (appFilter.status) params.status = appFilter.status;
    const r = await request.get('/supply/applications', { params });
    appRows.value = r.code === 200 ? r.data || [] : [];
  } finally { appLoading.value = false; }
}
async function loadRegs() {
  regLoading.value = true;
  try {
    const params = {};
    if (regFilter.status) params.status = regFilter.status;
    const r = await request.get('/supply/registrations', { params });
    regRows.value = r.code === 200 ? r.data || [] : [];
  } finally { regLoading.value = false; }
}
async function loadOrders() {
  orderLoading.value = true;
  try {
    const params = {};
    if (orderFilter.keyword) params.keyword = orderFilter.keyword;
    if (orderFilter.status) params.status = orderFilter.status;
    const r = await request.get('/supply/orders', { params });
    orderRows.value = r.code === 200 ? r.data || [] : [];
  } finally { orderLoading.value = false; }
}
function onTabChange(name) {
  if (name === 'apps') loadApps();
  else if (name === 'regs') loadRegs();
  else if (name === 'orders') loadOrders();
  else if (name === 'items') loadItems();
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadItems(); });

/* ---------- 供货登记 ---------- */
const regDlg = reactive({
  visible: false, saving: false,
  form: { name: '', category: '办公文具', spec: '', unit: '个', stock: 0, warn_level: 10 },
});
function openReg() {
  Object.assign(regDlg.form, { name: '', category: '办公文具', spec: '', unit: '个', stock: 0, warn_level: 10 });
  regDlg.visible = true;
}
async function submitReg() {
  if (!regDlg.form.name) { ElMessage.warning('用品名称必填'); return; }
  regDlg.saving = true;
  const r = await request.post('/supply/registrations', regDlg.form);
  regDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已登记');
    regDlg.visible = false;
    loadStats(); loadRegs(); loadItems();
  } else ElMessage.error(r.msg || '登记失败');
}
async function dealReg(row, status) {
  const r = await request.put(`/supply/registrations/${row.id}/status`, { status });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadRegs(); loadItems(); loadStats(); }
  else ElMessage.error(r.msg || '处理失败');
}

/* ---------- 供货申请 ---------- */
const appDlg = reactive({ visible: false, saving: false, form: { item_id: null, qty: 1, reason: '' } });
function onItemChange(id) {
  const it = itemRows.value.find((i) => i.id === id);
  if (it && appDlg.form.qty > it.stock) appDlg.form.qty = Math.max(1, it.stock);
}
function openApply(row) {
  appDlg.form.item_id = row ? row.id : null;
  appDlg.form.qty = 1;
  appDlg.form.reason = '';
  if (!itemRows.value.length) loadItems();
  appDlg.visible = true;
}
async function submitApp() {
  if (!appDlg.form.item_id || !appDlg.form.qty) { ElMessage.warning('用品与申请数量必填'); return; }
  appDlg.saving = true;
  const r = await request.post('/supply/applications', appDlg.form);
  appDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已提交');
    appDlg.visible = false;
    loadApps(); loadItems(); loadStats();
  } else ElMessage.error(r.msg || '提交失败');
}
async function dealApp(row, status) {
  const r = await request.put(`/supply/applications/${row.id}/status`, { status });
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); loadApps(); loadItems(); loadStats(); }
  else ElMessage.error(r.msg || '处理失败');
}

/* ---------- 库存调整 ---------- */
const stockDlg = reactive({ visible: false, saving: false, id: null, name: '', stock: 0, warn_level: 10, status: '在库' });
function openStock(row) {
  stockDlg.id = row.id;
  stockDlg.name = row.name;
  stockDlg.stock = row.stock;
  stockDlg.warn_level = row.warn_level;
  stockDlg.status = row.status;
  stockDlg.visible = true;
}
async function submitStock() {
  stockDlg.saving = true;
  const r = await request.put(`/supply/items/${stockDlg.id}`, {
    stock: stockDlg.stock, warn_level: stockDlg.warn_level, status: stockDlg.status,
  });
  stockDlg.saving = false;
  if (r.code === 200) { ElMessage.success('已调整'); stockDlg.visible = false; loadItems(); loadStats(); }
  else ElMessage.error(r.msg || '调整失败');
}
</script>

<style scoped>
.supply { padding: 20px; }
.muted { color: #909399; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.el-form-item { margin-bottom: 12px; }
</style>
