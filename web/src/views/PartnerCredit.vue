<template>
  <div class="pc-page">
    <div class="pc-header">
      <h2><el-icon><Connection /></el-icon> 合作方信用档案</h2>
      <div v-if="canManage">
        <el-button size="small" @click="autoSyncPartners"><el-icon><Refresh /></el-icon> 自动同步</el-button>
        <el-button type="primary" size="small" @click="showPartnerForm()"><el-icon><Plus /></el-icon> 新增档案</el-button>
      </div>
    </div>

    <div class="pc-kpi-grid">
      <div class="pc-kpi-card">
        <div class="pc-kpi-icon" style="background:#2563eb;"><el-icon><UserFilled /></el-icon></div>
        <div class="pc-kpi-body">
          <div class="pc-kpi-value">{{ stats.total || 0 }}</div>
          <div class="pc-kpi-label">合作方总数</div>
        </div>
      </div>
      <div class="pc-kpi-card">
        <div class="pc-kpi-icon" style="background:#22c55e;"><el-icon><Money /></el-icon></div>
        <div class="pc-kpi-body">
          <div class="pc-kpi-value">¥{{ ((stats.totalAmount || 0) / 10000).toFixed(1) }}万</div>
          <div class="pc-kpi-label">合同总金额</div>
        </div>
      </div>
      <div class="pc-kpi-card">
        <div class="pc-kpi-icon" style="background:#8b5cf6;"><el-icon><Odometer /></el-icon></div>
        <div class="pc-kpi-body">
          <div class="pc-kpi-value">{{ stats.avgOnTimeRate || 100 }}%</div>
          <div class="pc-kpi-label">平均准时率</div>
        </div>
      </div>
      <div class="pc-kpi-card">
        <div class="pc-kpi-icon" style="background:#eab308;"><el-icon><Star /></el-icon></div>
        <div class="pc-kpi-body">
          <div class="pc-kpi-value">{{ aLevelCount }}</div>
          <div class="pc-kpi-label">A级合作方</div>
        </div>
      </div>
    </div>

    <div class="pc-filter-bar">
      <el-input v-model="filters.keyword" placeholder="搜索合作方名称/代码/联系人..." class="pc-search" clearable
        @keyup.enter="filterPartners" />
      <el-select v-model="filters.rating" placeholder="全部评级" style="width:130px;" @change="filterPartners">
        <el-option label="全部评级" value="" />
        <el-option label="A级" value="A" />
        <el-option label="B级" value="B" />
        <el-option label="C级" value="C" />
        <el-option label="D级" value="D" />
      </el-select>
      <el-select v-model="filters.risk" placeholder="全部风险" style="width:130px;" @change="filterPartners">
        <el-option label="全部风险" value="" />
        <el-option label="低风险" value="低" />
        <el-option label="中风险" value="中" />
        <el-option label="高风险" value="高" />
      </el-select>
      <el-button @click="filterPartners"><el-icon><Search /></el-icon> 筛选</el-button>
    </div>

    <div v-loading="loading" style="min-height:120px;">
      <div v-if="list.length === 0 && !loading" class="pc-empty">
        <el-icon style="font-size:48px;"><Box /></el-icon>
        <p>{{ searched ? '未找到匹配的合作方档案' : '暂无合作方信用档案' }}</p>
        <el-button v-if="canManage && !searched" type="primary" size="small" @click="autoSyncPartners">
          <el-icon><Refresh /></el-icon> 从合同数据同步
        </el-button>
      </div>
      <table v-else-if="list.length > 0" class="pc-table">
        <thead>
          <tr>
            <th>合作方名称</th><th>信用代码</th><th>联系人</th><th>电话</th><th>评级</th>
            <th>合同数</th><th>总金额</th><th>准时率</th><th>风险</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in list" :key="p.id">
            <td class="pc-name">{{ p.partner_name }}</td>
            <td>{{ p.social_credit_code || '—' }}</td>
            <td>{{ p.contact_person || '—' }}</td>
            <td>{{ p.contact_phone || '—' }}</td>
            <td>
              <span class="pc-rating-badge" :style="{ background: ratingColors[p.credit_rating] || '#6b7280' }">{{ p.credit_rating || 'B' }}</span>
            </td>
            <td>{{ p.total_contracts || 0 }}</td>
            <td>¥{{ (p.total_amount || 0).toLocaleString() }}</td>
            <td>{{ p.on_time_rate || 100 }}%</td>
            <td>
              <span class="pc-risk-badge" :style="{ color: riskColors[p.risk_level] || '#6b7280' }">{{ p.risk_level || '低' }}</span>
            </td>
            <td class="pc-actions">
              <el-button size="small" text title="详情" @click="viewPartnerDetail(p)"><el-icon><View /></el-icon></el-button>
              <el-button v-if="canManage" size="small" text title="编辑" @click="showPartnerForm(p)"><el-icon><Edit /></el-icon></el-button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pc-pagination">
      <el-button size="small" :disabled="page <= 1" @click="loadPartnersPage(page - 1)">上一页</el-button>
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <el-button size="small" :disabled="page >= totalPages" @click="loadPartnersPage(page + 1)">下一页</el-button>
    </div>

    <!-- ===== 新增/编辑档案对话框 ===== -->
    <el-dialog v-model="formDlg.visible" :title="formDlg.isEdit ? '编辑合作方档案' : '新增合作方档案'" width="560px">
      <el-form label-position="top">
        <el-form-item label="合作方名称" required>
          <el-input v-model="formDlg.form.partner_name" placeholder="公司全称" />
        </el-form-item>
        <el-form-item label="统一社会信用代码">
          <el-input v-model="formDlg.form.social_credit_code" placeholder="18位统一社会信用代码" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="formDlg.form.contact_person" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="formDlg.form.contact_phone" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="信用评级">
              <el-select v-model="formDlg.form.credit_rating" style="width:100%;">
                <el-option v-for="r in ['A','B','C','D']" :key="r" :label="r + '级'" :value="r" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="风险等级">
              <el-select v-model="formDlg.form.risk_level" style="width:100%;">
                <el-option v-for="r in ['低','中','高']" :key="r" :label="r + '风险'" :value="r" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item v-if="formDlg.isEdit" label="履约准时率(%)">
          <el-input-number v-model="formDlg.form.on_time_rate" :min="0" :max="100" style="width:100%;" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="formDlg.form.remark" type="textarea" :rows="3" placeholder="合作方评价、特别约定等..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="formDlg.saving" @click="savePartner">
          <el-icon><Select /></el-icon> {{ formDlg.isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 合作方详情抽屉 ===== -->
    <el-drawer v-model="detailDrawer.visible" size="640px">
      <template #header>
        <span><el-icon><Connection /></el-icon> 合作方详情</span>
      </template>
      <div v-loading="detailDrawer.loading">
        <template v-if="!detailDrawer.loading && detailDrawer.partner">
          <table class="pc-detail-table">
            <tbody>
              <tr><td class="pc-dt-label">合作方名称</td><td>{{ detailDrawer.partner.partner_name }}</td></tr>
              <tr><td class="pc-dt-label">信用代码</td><td>{{ detailDrawer.partner.social_credit_code || '—' }}</td></tr>
              <tr><td class="pc-dt-label">联系人</td><td>{{ detailDrawer.partner.contact_person || '—' }}</td></tr>
              <tr><td class="pc-dt-label">联系电话</td><td>{{ detailDrawer.partner.contact_phone || '—' }}</td></tr>
              <tr><td class="pc-dt-label">信用评级</td><td>
                <span class="pc-rating-badge" :style="{ background: ratingColors[detailDrawer.partner.credit_rating] || '#6b7280' }">{{ detailDrawer.partner.credit_rating || 'B' }}</span>
              </td></tr>
              <tr><td class="pc-dt-label">合同总数</td><td>{{ detailDrawer.partner.total_contracts || 0 }}</td></tr>
              <tr><td class="pc-dt-label">合同总金额</td><td>¥{{ (detailDrawer.partner.total_amount || 0).toLocaleString() }}</td></tr>
              <tr><td class="pc-dt-label">履约准时率</td><td>{{ detailDrawer.partner.on_time_rate || 100 }}%</td></tr>
              <tr><td class="pc-dt-label">风险等级</td><td>{{ detailDrawer.partner.risk_level || '低' }}</td></tr>
              <tr><td class="pc-dt-label">创建人</td><td>{{ detailDrawer.partner.creator || '' }}</td></tr>
              <tr><td class="pc-dt-label">创建时间</td><td>{{ detailDrawer.partner.created_at || '' }}</td></tr>
              <tr><td class="pc-dt-label">备注</td><td><div class="pc-content-box">{{ detailDrawer.partner.remark || '（无）' }}</div></td></tr>
            </tbody>
          </table>

          <div class="pc-contract-section">
            <h4><el-icon><Document /></el-icon> 关联合同（{{ detailDrawer.contracts.length }}）</h4>
            <p v-if="detailDrawer.contracts.length === 0" class="pc-muted">暂无关联合同</p>
            <table v-else class="pc-table">
              <thead>
                <tr><th>合同编号</th><th>名称</th><th>类型</th><th>金额</th><th>状态</th><th>到期日</th></tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in detailDrawer.contracts" :key="i">
                  <td>{{ c.contract_no || '—' }}</td>
                  <td>{{ c.contract_name || '' }}</td>
                  <td>{{ c.contract_type || '—' }}</td>
                  <td>¥{{ (c.amount || 0).toLocaleString() }}</td>
                  <td>{{ c.contract_status || '' }}</td>
                  <td>{{ c.end_date || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="display:flex;gap:8px;margin-top:16px;">
            <el-button v-if="canManage" @click="detailDrawer.visible = false; showPartnerForm(detailDrawer.partner)">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button @click="detailDrawer.visible = false">关闭</el-button>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Connection, Refresh, Plus, UserFilled, Money, Odometer, Star, Search, Box,
  View, Edit, Select, Document
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();

// 权限：超管/总经理/副总/行政部部门经理/法务专员（contract_role）
const canManage = computed(() => {
  const u = auth.user;
  return u && (
    u.role === '超级管理员' || u.role === '总经理' || u.role === '副总' ||
    (u.role === '部门经理' && u.dept === '行政部') ||
    ((u.contract_role || '') === '法务专员')
  );
});

const ratingColors = { 'A': '#22c55e', 'B': '#2563eb', 'C': '#eab308', 'D': '#dc2626' };
const riskColors = { '低': '#22c55e', '中': '#eab308', '高': '#dc2626' };

const loading = ref(false);
const list = ref([]);
const stats = ref({});
const page = ref(1);
const totalPages = ref(1);
const searched = ref(false);
const filters = reactive({ keyword: '', rating: '', risk: '' });

const aLevelCount = computed(() =>
  (stats.value.ratingDistribution || [])
    .filter(r => r.credit_rating === 'A')
    .map(r => r.count)
    .reduce((a, b) => a + b, 0) || 0
);

function buildParams(extra) {
  const params = { ...(extra || {}) };
  if (filters.keyword) params.keyword = filters.keyword;
  if (filters.rating) params.rating = filters.rating;
  if (filters.risk) params.risk = filters.risk;
  return params;
}

async function loadAll() {
  loading.value = true;
  try {
    const [listResp, statsResp] = await Promise.all([
      request.get('/partner-credit/'),
      request.get('/partner-credit/stats')
    ]);
    if (listResp.code !== 200) {
      ElMessage.error('加载失败: ' + (listResp.msg || ''));
      return;
    }
    list.value = listResp.data.list || [];
    page.value = listResp.data.page || 1;
    totalPages.value = listResp.data.totalPages || 1;
    stats.value = statsResp.data || {};
    searched.value = false;
  } catch (e) {
    console.error('[PartnerCredit]', e);
    ElMessage.error('加载合作方信用档案失败: ' + (e.message || ''));
  } finally {
    loading.value = false;
  }
}

async function filterPartners() {
  const resp = await request.get('/partner-credit/', { params: buildParams() });
  if (resp.code !== 200) { ElMessage.error('筛选失败'); return; }
  list.value = resp.data.list || [];
  page.value = resp.data.page || 1;
  totalPages.value = resp.data.totalPages || 1;
  searched.value = true;
}

async function loadPartnersPage(p) {
  const resp = await request.get('/partner-credit/', { params: buildParams({ page: p, pageSize: 20 }) });
  if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
  list.value = resp.data.list || [];
  page.value = resp.data.page || p;
  totalPages.value = resp.data.totalPages || 1;
}

// ===== 新增/编辑档案 =====
const formDlg = reactive({
  visible: false, saving: false, isEdit: false, id: '',
  form: { partner_name: '', social_credit_code: '', contact_person: '', contact_phone: '', credit_rating: 'A', risk_level: '低', on_time_rate: 100, remark: '' }
});

function showPartnerForm(p) {
  formDlg.isEdit = !!p;
  formDlg.id = p ? p.id : '';
  formDlg.form = {
    partner_name: p ? p.partner_name : '',
    social_credit_code: p ? (p.social_credit_code || '') : '',
    contact_person: p ? (p.contact_person || '') : '',
    contact_phone: p ? (p.contact_phone || '') : '',
    credit_rating: p ? (p.credit_rating || 'A') : 'A',
    risk_level: p ? (p.risk_level || '低') : '低',
    on_time_rate: p ? (p.on_time_rate || 100) : 100,
    remark: p ? (p.remark || '') : ''
  };
  formDlg.visible = true;
}

async function savePartner() {
  const name = (formDlg.form.partner_name || '').trim();
  if (!name) { ElMessage.error('合作方名称不能为空'); return; }
  const data = {
    partner_name: name,
    social_credit_code: (formDlg.form.social_credit_code || '').trim(),
    contact_person: (formDlg.form.contact_person || '').trim(),
    contact_phone: (formDlg.form.contact_phone || '').trim(),
    credit_rating: formDlg.form.credit_rating,
    risk_level: formDlg.form.risk_level,
    remark: (formDlg.form.remark || '').trim()
  };
  if (formDlg.isEdit) data.on_time_rate = parseFloat(formDlg.form.on_time_rate) || 100;

  formDlg.saving = true;
  try {
    if (formDlg.isEdit) {
      const resp = await request.put('/partner-credit/' + formDlg.id, data);
      if (resp.code === 200) {
        ElMessage.success('档案更新成功');
        formDlg.visible = false;
        loadAll();
      } else {
        ElMessage.error('更新失败: ' + resp.msg);
      }
    } else {
      const resp = await request.post('/partner-credit/', data);
      if (resp.code === 200) {
        ElMessage.success('档案创建成功');
        formDlg.visible = false;
        loadAll();
      } else {
        ElMessage.error('创建失败: ' + resp.msg);
      }
    }
  } finally {
    formDlg.saving = false;
  }
}

// ===== 详情抽屉 =====
const detailDrawer = reactive({ visible: false, loading: false, partner: null, contracts: [] });

async function viewPartnerDetail(p) {
  detailDrawer.visible = true;
  detailDrawer.loading = true;
  detailDrawer.partner = null;
  detailDrawer.contracts = [];
  try {
    const resp = await request.get('/partner-credit/' + p.id);
    if (resp.code !== 200) { ElMessage.error('获取详情失败'); detailDrawer.visible = false; return; }
    detailDrawer.partner = resp.data.partner;
    detailDrawer.contracts = resp.data.contracts || [];
  } finally {
    detailDrawer.loading = false;
  }
}

// ===== 自动同步 =====
async function autoSyncPartners() {
  try {
    await ElMessageBox.confirm(
      '确定要从合同数据自动同步合作方档案吗？\n\n系统将扫描所有已生效合同，自动创建或更新合作方档案。',
      '自动同步', { type: 'warning' }
    );
  } catch { return; }
  const resp = await request.post('/partner-credit/auto-sync');
  if (resp.code === 200) {
    ElMessage.success('同步完成: 新建' + resp.data.created + '个, 更新' + resp.data.updated + '个');
    loadAll();
  } else {
    ElMessage.error('同步失败: ' + resp.msg);
  }
}

onMounted(loadAll);
</script>

<style scoped>
.pc-page { padding: 0; }
.pc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.pc-header h2 { font-size: 20px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px; }
.pc-muted { color: #9ca3af; }

.pc-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }
.pc-kpi-card { display: flex; align-items: center; gap: 12px; padding: 18px; border-radius: 10px; background: #fff; border: 1px solid #e5e7eb; transition: box-shadow .2s; }
.pc-kpi-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); }
.pc-kpi-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #fff; flex-shrink: 0; }
.pc-kpi-body { flex: 1; }
.pc-kpi-value { font-size: 24px; font-weight: 700; line-height: 1; color: #111827; }
.pc-kpi-label { font-size: 12px; color: #6b7280; margin-top: 4px; }

.pc-filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.pc-search { width: 280px; max-width: 100%; }

.pc-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
.pc-table th { text-align: left; padding: 10px 12px; background: #f9fafb; color: #6b7280; font-weight: 600; border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
.pc-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
.pc-table tr:hover td { background: #f9fafb; }
.pc-name { font-weight: 600; color: #111827; }
.pc-actions { white-space: nowrap; }
.pc-actions .el-button { margin-left: 0; padding: 4px 6px; }

.pc-rating-badge { display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; color: #fff; border-radius: 50%; font-size: 11px; font-weight: 700; }
.pc-risk-badge { font-weight: 600; font-size: 12px; }

.pc-empty { text-align: center; padding: 60px 20px; color: #9ca3af; }
.pc-empty p { margin: 12px 0 16px; }

.pc-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }

.pc-detail-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.pc-detail-table td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; font-size: 13px; vertical-align: top; }
.pc-dt-label { width: 110px; color: #6b7280; font-weight: 600; white-space: nowrap; }
.pc-content-box { max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; background: #f9fafb; padding: 8px 10px; border-radius: 6px; }

.pc-contract-section { margin-top: 16px; }
.pc-contract-section h4 { font-size: 15px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }

@media (max-width: 768px) {
  .pc-kpi-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .pc-kpi-grid { grid-template-columns: 1fr; }
}
</style>
