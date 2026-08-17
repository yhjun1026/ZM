<template>
  <div class="trade-archive">
    <div class="page-header">
      <h2>合作方档案归档中心</h2>
      <p>完结审批自动归档 · 行政确认编号 · 借阅登记 · 月度汇总</p>
    </div>

    <!-- KPI 卡片 -->
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

    <el-tabs v-model="tab" @tab-change="loadTab">
      <el-tab-pane label="归档台账" name="list" />
      <el-tab-pane label="月度汇总报表" name="monthly" />
    </el-tabs>

    <div v-loading="tabLoading">
      <!-- 归档台账 -->
      <template v-if="tab === 'list'">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="filter.target_type" placeholder="全部类型" style="width:130px;" @change="loadTab">
              <el-option label="全部类型" value="" />
              <el-option label="客户档案" value="customer" />
              <el-option label="供应商档案" value="supplier" />
            </el-select>
            <el-select v-model="filter.status" placeholder="全部状态" style="width:120px;" @change="loadTab">
              <el-option label="全部状态" value="" />
              <el-option v-for="s in ['待归档', '已归档', '借阅中']" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="filter.keyword" placeholder="搜索对象/工单号/档案号" style="width:200px;" clearable @change="loadTab" />
          </div>
          <span class="muted"><el-icon><MagicStick /></el-icon> 客户/供应商全部完结审批单自动归集至此{{ isXz ? '，归档确认为行政部专属权限' : '' }}</span>
        </div>
        <el-table :data="arcRows" stripe size="small">
          <el-table-column prop="apply_no" label="工单号" width="150" show-overflow-tooltip />
          <el-table-column label="档案编号" width="150">
            <template #default="{ row }">
              <b v-if="row.archive_no">{{ row.archive_no }}</b>
              <span v-else class="muted">未编号</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="80"><template #default="{ row }">{{ row.target_type === 'customer' ? '客户' : '供应商' }}</template></el-table-column>
          <el-table-column prop="target_name" label="对象" min-width="150" show-overflow-tooltip />
          <el-table-column label="业务" width="100"><template #default="{ row }">{{ PT_BIZ[row.biz_type] || row.biz_type }}</template></el-table-column>
          <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="ptType(row.status)" size="small">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="归档人/时间" width="130">
            <template #default="{ row }">
              {{ row.filed_by || '—' }}
              <div class="muted" style="font-size:11px;">{{ (row.filed_at || '').slice(0, 16) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="借阅次数" width="80"><template #default="{ row }">{{ (row.borrow_log || []).length }}</template></el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === '待归档' && isXz" size="small" type="primary" @click="onFile(row)">归档确认</el-button>
              <el-button v-if="row.status === '已归档'" size="small" @click="openBorrow(row)">借阅</el-button>
              <el-button v-if="row.status === '借阅中'" size="small" @click="onReturn(row)">归还</el-button>
              <el-button size="small" @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无归档记录，完结审批单将自动归集</span></template>
        </el-table>
      </template>

      <!-- 月度汇总报表 -->
      <template v-else-if="tab === 'monthly'">
        <p class="muted" style="margin-bottom:12px;">月度归档汇总（每月末核对确认），供行政部向管理层报送</p>
        <el-table :data="monthlyRows" stripe size="small">
          <el-table-column label="月份" width="140"><template #default="{ row }"><b>{{ row.month }}</b></template></el-table-column>
          <el-table-column prop="customer" label="客户档案" width="140" />
          <el-table-column prop="supplier" label="供应商档案" width="140" />
          <el-table-column label="合计" min-width="120"><template #default="{ row }"><b>{{ row.total }}</b></template></el-table-column>
          <template #empty><span class="muted">暂无数据</span></template>
        </el-table>
      </template>
    </div>

    <!-- 借阅登记 -->
    <el-dialog v-model="borrowDlg.visible" title="档案借阅登记" width="440px">
      <el-form-item label="借阅用途">
        <el-input v-model="borrowDlg.purpose" placeholder="如: 业务查阅/审计核验" />
      </el-form-item>
      <p class="muted" style="font-size:12px;">借阅期间档案仅可查阅不可修改，归还后恢复"已归档"状态</p>
      <template #footer>
        <el-button @click="borrowDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="borrowDlg.saving" @click="submitBorrow">登记借阅</el-button>
      </template>
    </el-dialog>

    <!-- 档案详情 -->
    <el-dialog v-model="detailDlg.visible" :title="(detailDlg.data.archive_no || '待编号') + ' · ' + (detailDlg.data.target_name || '')" width="680px">
      <template v-if="detailDlg.data.id">
        <div style="margin:4px 0 12px;">
          工单号 {{ detailDlg.data.apply_no }} · {{ detailDlg.data.target_type === 'customer' ? '客户' : '供应商' }} ·
          {{ PT_BIZ[detailDlg.data.biz_type] || detailDlg.data.biz_type }} ·
          <el-tag :type="ptType(detailDlg.data.status)" size="small">{{ detailDlg.data.status }}</el-tag>
        </div>
        <b style="font-size:13px;">归档快照</b>
        <el-table :data="snapRows" stripe size="small" border style="margin:6px 0 12px;">
          <el-table-column prop="label" label="字段" width="160" />
          <el-table-column prop="value" label="归档值" />
          <template #empty><span class="muted">无快照</span></template>
        </el-table>
        <b style="font-size:13px;">借阅记录</b>
        <el-table v-if="(detailDlg.data.borrow_log || []).length" :data="detailDlg.data.borrow_log" stripe size="small" style="margin-top:6px;">
          <el-table-column prop="borrower" label="借阅人" width="90" />
          <el-table-column prop="dept" label="部门" width="110" />
          <el-table-column label="用途" min-width="120"><template #default="{ row }">{{ row.purpose || '—' }}</template></el-table-column>
          <el-table-column label="借出时间" width="140"><template #default="{ row }">{{ (row.time || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="归还时间" width="140">
            <template #default="{ row }">
              <b v-if="!row.returned_at" style="color:#f59e0b;">未归还</b>
              <span v-else>{{ row.returned_at.slice(0, 16) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <p v-else class="muted" style="margin-top:6px;">暂无借阅记录</p>
        <div style="text-align:right;margin-top:16px;">
          <el-button @click="detailDlg.visible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { MagicStick, FolderOpened, MessageBox as InboxIcon, CircleCheck, Notebook } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

/* ---------------- 常量与工具 ---------------- */
const PT_BIZ = {
  cust_new: '新增建档', cust_change: '信息变更', cust_level: '等级评定', cust_disable: '停用注销',
  supp_new: '准入备案', supp_change: '信息变更', supp_review: '年审评定', supp_rating: '评级调整', supp_disable: '停用淘汰'
};
const PT_FORM_LABEL = {
  name: '名称', credit_code: '统一社会信用代码', address: '地址', contact: '联系人', phone: '联系电话',
  email: '邮箱', industry: '行业', source: '客户来源', expected_amount: '预计合作额(元)', license_expiry: '资质到期日',
  bank: '开户行', account: '银行账号', level: '目标等级', disable_type: '处理方式', legal_person: '法定代表人',
  category: '供应品类', coop_type: '合作类型', rating: '评级', next_review_date: '下次年审日', remark: '备注'
};
function ptType(s) {
  const map = {
    '意向': 'primary', '合作中': 'success', '已停用': 'info', '已注销': 'info',
    '备选': 'primary', '待整改': 'warning', '已淘汰': 'danger',
    '审批中': 'primary', '已通过': 'success', '已驳回': 'danger',
    '待归档': 'warning', '已归档': 'success', '借阅中': 'primary', '待处理': 'danger', '已处理': 'info'
  };
  return map[s] || 'info';
}
// 行政部权限（行政部 或 超级管理员）
const isXz = computed(() => {
  const u = auth.user;
  return !!u && (u.dept === '行政部' || u.role === '超级管理员');
});

/* ---------------- 统计与页签 ---------------- */
const stats = ref(null);
const tab = ref('list');
const tabLoading = ref(false);
const filter = reactive({ target_type: '', status: '', keyword: '' });
const arcRows = ref([]);
const monthlyRows = ref([]);

const kpis = computed(() => {
  if (!stats.value) return [];
  const s = stats.value;
  return [
    { title: '归档总数', value: s.total, sub: '客户 ' + s.customers + ' / 供应商 ' + s.suppliers, icon: FolderOpened, color: '#2563eb' },
    { title: '待归档', value: s.pending, sub: '行政部待确认编号', icon: InboxIcon, color: '#f59e0b' },
    { title: '已归档', value: s.filed, sub: '已编制档案编号', icon: CircleCheck, color: '#10b981' },
    { title: '借阅中', value: s.borrowed, sub: '跨部门查阅登记', icon: Notebook, color: '#8b5cf6' }
  ];
});

async function loadStats() {
  const r = await request.get('/trade-archive/stats');
  if (r.code === 200) stats.value = r.data;
  else ElMessage.error('加载失败: ' + (r.msg || ''));
}
async function loadTab() {
  tabLoading.value = true;
  try {
    if (tab.value === 'list') {
      const params = {};
      ['target_type', 'status', 'keyword'].forEach(k => { if (filter[k]) params[k] = filter[k]; });
      const r = await request.get('/trade-archive', { params });
      arcRows.value = r.code === 200 ? r.data || [] : [];
    } else if (tab.value === 'monthly') {
      const r = await request.get('/trade-archive/monthly');
      monthlyRows.value = r.code === 200 ? r.data || [] : [];
    }
  } finally {
    tabLoading.value = false;
  }
}
onMounted(async () => { await loadStats(); await loadTab(); });

/* ---------------- 归档确认 ---------------- */
async function onFile(row) {
  try { await ElMessageBox.confirm('确认完成归档？系统将自动编制档案编号（KHGD/GYSGD前缀）', '提示', { type: 'warning' }); } catch { return; }
  const r = await request.post(`/trade-archive/${row.id}/file`, {});
  if (r.code === 200) { ElMessage.success(r.msg || '归档完成'); loadTab(); loadStats(); }
  else ElMessage.error(r.msg || '归档失败');
}

/* ---------------- 借阅 / 归还 ---------------- */
const borrowDlg = reactive({ visible: false, saving: false, id: null, purpose: '' });
function openBorrow(row) {
  borrowDlg.id = row.id;
  borrowDlg.purpose = '';
  borrowDlg.visible = true;
}
async function submitBorrow() {
  borrowDlg.saving = true;
  const r = await request.post(`/trade-archive/${borrowDlg.id}/borrow`, { purpose: borrowDlg.purpose.trim() });
  borrowDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '借阅成功'); borrowDlg.visible = false; loadTab(); loadStats(); }
  else ElMessage.error(r.msg || '借阅失败');
}
async function onReturn(row) {
  try { await ElMessageBox.confirm('确认归还该档案？', '提示', { type: 'warning' }); } catch { return; }
  const r = await request.post(`/trade-archive/${row.id}/return`);
  if (r.code === 200) { ElMessage.success(r.msg || '已归还'); loadTab(); loadStats(); }
  else ElMessage.error(r.msg || '归还失败');
}

/* ---------------- 详情 ---------------- */
const detailDlg = reactive({ visible: false, data: {} });
const snapRows = computed(() =>
  Object.entries(detailDlg.data.snapshot || {}).slice(0, 20).map(([k, v]) => ({
    label: PT_FORM_LABEL[k] || k,
    value: String(v).slice(0, 60)
  }))
);
function openDetail(row) {
  // 与参考项目一致：详情数据取当前列表中的行
  detailDlg.data = arcRows.value.find(y => y.id === Number(row.id)) || row;
  detailDlg.visible = true;
}
</script>

<style scoped>
.trade-archive { padding: 20px; }
.muted { color: #909399; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.el-form-item { margin-bottom: 12px; }
</style>
