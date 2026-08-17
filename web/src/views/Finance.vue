<template>
  <div>
    <div class="page-header"><h2>财务管理</h2><p>应收应付、固定资产与审批流</p></div>

    <div v-loading="loading">
      <!-- 概览统计卡 -->
      <div class="stats-grid">
        <div v-for="k in kpis" :key="k.label" class="stat-card">
          <div class="stat-bar" :style="{ background: k.color }"></div>
          <div class="stat-body">
            <div>
              <p class="stat-label">{{ k.label }}</p>
              <p class="stat-value" :style="{ color: k.color }">{{ k.value }}</p>
            </div>
            <div class="stat-icon" :style="{ background: k.color + '15' }">
              <el-icon :size="22" :color="k.color"><component :is="k.icon" /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- 应收 / 应付 -->
      <el-row :gutter="24">
        <el-col :xs="24" :md="12">
          <el-card>
            <template #header>
              <div class="card-header">
                <h3>应收账款</h3>
                <el-button v-if="canEntry" type="primary" size="small" @click="openRecordForm('receivable')">
                  <el-icon><Plus /></el-icon> 录入
                </el-button>
              </div>
            </template>
            <el-table :data="receivable" size="small">
              <el-table-column prop="desc" label="摘要" min-width="140" show-overflow-tooltip />
              <el-table-column label="金额(¥)" width="110">
                <template #default="{ row }">¥{{ fmt(row.amount) }}</template>
              </el-table-column>
              <el-table-column prop="date" label="到期日" width="105" />
              <el-table-column label="状态" width="85">
                <template #default="{ row }"><el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" :width="canReview ? 170 : 60" fixed="right">
                <template #default="{ row }">
                  <template v-if="canReview && row.status === '待审批'">
                    <el-button size="small" type="success" title="审批" @click="approveRecord(row)"><el-icon><Check /></el-icon></el-button>
                    <el-button size="small" type="danger" title="驳回" @click="rejectRecord(row)"><el-icon><Close /></el-icon></el-button>
                    <el-button size="small" type="info" title="流程" @click="showRecordWorkflow(row)"><el-icon><Share /></el-icon></el-button>
                    <el-button size="small" title="打印" @click="printFinanceRecord(row)"><el-icon><Printer /></el-icon></el-button>
                  </template>
                  <template v-else-if="canReview">
                    <el-button size="small" type="info" title="流程" @click="showRecordWorkflow(row)"><el-icon><Share /></el-icon></el-button>
                    <el-button size="small" title="打印" @click="printFinanceRecord(row)"><el-icon><Printer /></el-icon></el-button>
                  </template>
                  <el-button v-else size="small" title="打印" @click="printFinanceRecord(row)"><el-icon><Printer /></el-icon></el-button>
                </template>
              </el-table-column>
              <template #empty><span class="text-muted">暂无</span></template>
            </el-table>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card>
            <template #header>
              <div class="card-header">
                <h3>应付账款</h3>
                <el-button v-if="canEntry" type="primary" size="small" @click="openRecordForm('payable')">
                  <el-icon><Plus /></el-icon> 录入
                </el-button>
              </div>
            </template>
            <el-table :data="payable" size="small">
              <el-table-column prop="desc" label="摘要" min-width="140" show-overflow-tooltip />
              <el-table-column label="金额(¥)" width="110">
                <template #default="{ row }">¥{{ fmt(row.amount) }}</template>
              </el-table-column>
              <el-table-column prop="date" label="到期日" width="105" />
              <el-table-column label="状态" width="85">
                <template #default="{ row }"><el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" :width="canReview ? 170 : 60" fixed="right">
                <template #default="{ row }">
                  <template v-if="canReview && row.status === '待审批'">
                    <el-button size="small" type="success" title="审批" @click="approveRecord(row)"><el-icon><Check /></el-icon></el-button>
                    <el-button size="small" type="danger" title="驳回" @click="rejectRecord(row)"><el-icon><Close /></el-icon></el-button>
                    <el-button size="small" type="info" title="流程" @click="showRecordWorkflow(row)"><el-icon><Share /></el-icon></el-button>
                    <el-button size="small" title="打印" @click="printFinanceRecord(row)"><el-icon><Printer /></el-icon></el-button>
                  </template>
                  <template v-else-if="canReview">
                    <el-button size="small" type="info" title="流程" @click="showRecordWorkflow(row)"><el-icon><Share /></el-icon></el-button>
                    <el-button size="small" title="打印" @click="printFinanceRecord(row)"><el-icon><Printer /></el-icon></el-button>
                  </template>
                  <el-button v-else size="small" title="打印" @click="printFinanceRecord(row)"><el-icon><Printer /></el-icon></el-button>
                </template>
              </el-table-column>
              <template #empty><span class="text-muted">暂无</span></template>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <!-- 固定资产 -->
      <el-card style="margin-top: 16px;">
        <template #header>
          <div class="card-header">
            <h3>固定资产</h3>
            <el-button v-if="canCreateAsset" type="primary" size="small" @click="openAssetForm">
              <el-icon><Plus /></el-icon> 录入
            </el-button>
          </div>
        </template>
        <el-table :data="assets" size="small">
          <el-table-column prop="id" label="编号" width="100" />
          <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
          <el-table-column prop="category" label="类别" width="100" />
          <el-table-column prop="dept" label="部门" width="100" />
          <el-table-column label="原值(¥)" width="120">
            <template #default="{ row }">¥{{ fmt(row.original_value) }}</template>
          </el-table-column>
          <el-table-column label="净值" width="120">
            <template #default="{ row }">¥{{ fmt(row.net_value) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="85">
            <template #default="{ row }"><el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column v-if="canReview" label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === '待审批'">
                <el-button size="small" type="success" title="审批" @click="approveAsset(row)"><el-icon><Check /></el-icon></el-button>
                <el-button size="small" type="danger" title="驳回" @click="rejectAsset(row)"><el-icon><Close /></el-icon></el-button>
                <el-button size="small" type="info" title="流程" @click="showAssetWorkflow(row)"><el-icon><Share /></el-icon></el-button>
                <el-button size="small" title="打印" @click="printFixedAssetRecord(row)"><el-icon><Printer /></el-icon></el-button>
              </template>
              <template v-else>
                <el-button size="small" type="info" title="流程" @click="showAssetWorkflow(row)"><el-icon><Share /></el-icon></el-button>
                <el-button size="small" title="打印" @click="printFixedAssetRecord(row)"><el-icon><Printer /></el-icon></el-button>
              </template>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无</span></template>
        </el-table>
      </el-card>

      <!-- 固定资产领用单 -->
      <el-card style="margin-top: 16px;">
        <template #header>
          <div class="card-header">
            <h3>固定资产领用单</h3>
            <el-button v-if="canCreateAsset" type="primary" size="small" @click="openReqForm">
              <el-icon><Plus /></el-icon> 领用申请
            </el-button>
          </div>
        </template>
        <el-table :data="assetReqs" size="small">
          <el-table-column prop="id" label="领用编号" width="110" />
          <el-table-column prop="asset_name" label="资产名称" min-width="130" show-overflow-tooltip />
          <el-table-column prop="requisitioner" label="领用人" width="90" />
          <el-table-column prop="dept" label="部门" width="90" />
          <el-table-column prop="req_date" label="领用日期" width="105" />
          <el-table-column prop="purpose" label="用途" min-width="120" show-overflow-tooltip />
          <el-table-column label="状态" width="85">
            <template #default="{ row }"><el-tag :type="reqStatusTag(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <template v-if="canReview">
            <el-table-column label="流程" width="70">
              <template #default="{ row }">
                <el-button size="small" type="info" title="流程" @click="showReqWorkflow(row)"><el-icon><Share /></el-icon></el-button>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === '待审批'">
                  <el-button size="small" type="success" title="通过" @click="approveReq(row)"><el-icon><Check /></el-icon></el-button>
                  <el-button size="small" type="danger" title="驳回" @click="rejectReq(row)"><el-icon><Close /></el-icon></el-button>
                  <el-button size="small" title="打印" @click="printAssetReq(row)"><el-icon><Printer /></el-icon></el-button>
                </template>
                <el-button v-else size="small" title="打印" @click="printAssetReq(row)"><el-icon><Printer /></el-icon></el-button>
              </template>
            </el-table-column>
          </template>
          <el-table-column v-else label="打印" width="70">
            <template #default="{ row }">
              <el-button size="small" title="打印" @click="printAssetReq(row)"><el-icon><Printer /></el-icon></el-button>
            </template>
          </el-table-column>
          <template #empty><span class="text-muted">暂无领用记录</span></template>
        </el-table>
      </el-card>
    </div>

    <!-- 录入应收/应付 -->
    <el-dialog v-model="recordDlg.visible" :title="`录入${recordDlg.type === 'receivable' ? '应收账款' : '应付账款'}（财务部）`" width="500px">
      <el-form label-position="top">
        <el-form-item label="摘要">
          <el-input v-model="recordDlg.form.desc" placeholder="如：智联科技第一期款" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="类别">
              <el-select v-model="recordDlg.form.category" style="width: 100%;">
                <el-option v-for="c in ['合同款', '服务费', '采购款', '其他']" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="金额(¥)">
              <el-input-number v-model="recordDlg.form.amount" :min="0" :controls="false" placeholder="金额" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="到期日">
          <el-date-picker v-model="recordDlg.form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-alert type="info" :closable="false">
          <template #title>提交后需<strong>财务负责人审批 → 副总审批 → 总经理终审</strong></template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="recordDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="recordDlg.saving" @click="submitRecord">提交</el-button>
      </template>
    </el-dialog>

    <!-- 固定资产录入 -->
    <el-dialog v-model="assetDlg.visible" title="固定资产录入（财务部）" width="560px">
      <el-form label-position="top">
        <el-form-item label="资产名称">
          <el-input v-model="assetDlg.form.name" placeholder="如：联想笔记本电脑ThinkPad T14" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="类别">
              <el-select v-model="assetDlg.form.category" style="width: 100%;">
                <el-option v-for="c in ['电子设备', '办公家具', '车辆', '房屋建筑', '其他设备']" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="使用部门">
              <el-input v-model="assetDlg.form.dept" placeholder="如：行政部" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="使用人">
              <el-input v-model="assetDlg.form.user" placeholder="使用人姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="购置日期">
              <el-date-picker v-model="assetDlg.form.purchase_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="原值(¥)">
              <el-input-number v-model="assetDlg.form.original_value" :min="0" :controls="false" placeholder="原值" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="残值率(%)">
              <el-input-number v-model="assetDlg.form.salvage_pct" :min="0" :max="100" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="使用年限(月)">
              <el-input-number v-model="assetDlg.form.useful_life" :min="1" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-alert type="info" :closable="false">
          <template #title>提交后需<strong>财务负责人审批 → 副总审批 → 总经理审批</strong>后方可执行</template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="assetDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="assetDlg.saving" @click="submitAsset">提交</el-button>
      </template>
    </el-dialog>

    <!-- 固定资产领用申请 -->
    <el-dialog v-model="reqDlg.visible" title="固定资产领用申请" width="500px">
      <el-form label-position="top">
        <el-form-item label="选择资产" required>
          <el-select v-model="reqDlg.form.asset_id" placeholder="请选择..." style="width: 100%;">
            <el-option v-for="a in usableAssets" :key="a.id" :label="`${a.name} - ${a.id}`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="领用人">
              <el-input v-model="reqDlg.form.requisitioner" readonly />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部门">
              <el-input v-model="reqDlg.form.dept" readonly />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="领用日期">
          <el-date-picker v-model="reqDlg.form.req_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="用途说明" required>
          <el-input v-model="reqDlg.form.purpose" type="textarea" :rows="3" placeholder="请说明领用用途" />
        </el-form-item>
        <el-alert type="info" :closable="false">
          <template #title>领用审批流程：<strong>财务负责人 → 副总审批 → 总经理审批</strong></template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="reqDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="reqDlg.saving" @click="submitReq">提交</el-button>
      </template>
    </el-dialog>

    <!-- 财务记录审批流程 -->
    <el-dialog v-model="recordWf.visible" :title="`财务审批流程 — ${recordWf.record?.desc || ''}`" width="680px">
      <div v-if="recordWf.record">
        <div class="wf-meta">
          <strong>金额：</strong>¥{{ fmt(recordWf.record.amount) }}
          <strong>日期：</strong>{{ recordWf.record.date }}
          <strong>录入人：</strong>{{ recordWf.record.submitter }}
        </div>
        <WorkflowDiagram :flow="recordWf.record.approval_flow || []" />
      </div>
      <template #footer>
        <el-button @click="recordWf.visible = false">关闭</el-button>
        <el-button type="info" @click="printFinanceRecord(recordWf.record)"><el-icon><Printer /></el-icon> 打印</el-button>
      </template>
    </el-dialog>

    <!-- 固定资产审批流程 -->
    <el-dialog v-model="assetWf.visible" :title="`固定资产审批流程 — ${assetWf.asset?.name || ''}`" width="680px">
      <div v-if="assetWf.asset">
        <div class="wf-meta">
          <strong>资产名称：</strong>{{ assetWf.asset.name }}
          <strong>类别：</strong>{{ assetWf.asset.category }}
          <strong>原值：</strong>¥{{ fmt(assetWf.asset.original_value) }}
          <strong>录入人：</strong>{{ assetWf.asset.submitter }}
        </div>
        <WorkflowDiagram :flow="assetWf.asset.approval_flow || []" />
      </div>
      <template #footer>
        <el-button @click="assetWf.visible = false">关闭</el-button>
        <el-button type="info" @click="printFixedAssetRecord(assetWf.asset)"><el-icon><Printer /></el-icon> 打印</el-button>
      </template>
    </el-dialog>

    <!-- 领用审批流程 -->
    <el-dialog v-model="reqWf.visible" title="领用审批流程" width="500px">
      <div v-if="reqWf.req">
        <div class="info-item"><span class="info-label">资产名称</span><span class="info-value">{{ reqWf.req.asset_name }}</span></div>
        <div class="info-item"><span class="info-label">领用人</span><span class="info-value">{{ reqWf.req.requisitioner }}</span></div>
        <div class="info-item"><span class="info-label">状态</span><span class="info-value">{{ reqWf.req.status }}</span></div>
        <div class="req-flow">
          <template v-if="(reqWf.req.approval_flow || []).length">
            <template v-for="(f, i) in reqWf.req.approval_flow" :key="i">
              <span class="req-wf-step" :class="flowStepClass(reqWf.req.approval_flow, i)">
                <div class="wf-name">{{ f.step }}</div>
                <div style="font-size: 11px;">{{ f.user || '—' }}</div>
                <div class="wf-time">{{ f.time || '—' }}</div>
              </span>
              <span v-if="i < reqWf.req.approval_flow.length - 1" class="wf-arrow">→</span>
            </template>
          </template>
          <span v-else class="text-muted">无流程数据</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="reqWf.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue';
import { ElMessage, ElMessageBox, ElIcon } from 'element-plus';
import { Plus, Check, Close, Share, Printer, ArrowDown, ArrowUp, Clock, Box, CircleCheck, Loading } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const loading = ref(false);
const data = ref({});
const assetReqs = ref([]);

const receivable = computed(() => data.value.receivable || []);
const payable = computed(() => data.value.payable || []);
const assets = computed(() => data.value.assets || []);
const allRecords = computed(() => [...receivable.value, ...payable.value]);
const usableAssets = computed(() => assets.value.filter(a => a.status === '使用中'));

// ===== 权限（对齐参考项目 rbac.js）=====
// createFinanceRecord / createFixedAsset：总经理+超管+财务部（部门经理/普通员工）
const canEntry = computed(() => {
  const u = auth.user;
  if (!u) return false;
  if (u.role === '总经理' || u.role === '超级管理员') return true;
  return u.dept === '财务部' && (u.role === '部门经理' || u.role === '普通员工');
});
const canCreateAsset = canEntry;
// canApprove：非普通员工
const canReview = computed(() => !!auth.user && auth.user.role !== '普通员工');

const kpis = computed(() => {
  const pending = allRecords.value.filter(r => r.status === '待审批').length;
  const totalAssets = assets.value.reduce((s, a) => s + (a.net_value || 0), 0);
  return [
    { label: '应收账款', value: receivable.value.length + '笔', icon: ArrowDown, color: '#10b981' },
    { label: '应付账款', value: payable.value.length + '笔', icon: ArrowUp, color: '#ef4444' },
    { label: '待审批', value: pending + '笔', icon: Clock, color: '#f59e0b' },
    { label: '资产净值', value: '¥' + (totalAssets / 10000).toFixed(1) + '万', icon: Box, color: '#2563eb' },
  ];
});

function fmt(n) { return Number(n || 0).toLocaleString(); }
function today() { return new Date().toISOString().slice(0, 10); }
function statusTag(s) {
  return s === '已确认' || s === '使用中' ? 'success' : s === '待审批' ? 'warning' : s === '已驳回' ? 'danger' : 'primary';
}
function reqStatusTag(s) {
  return s === '已批准' ? 'success' : s === '待审批' ? 'warning' : s === '已驳回' ? 'danger' : 'primary';
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/finance/overview');
    if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
    data.value = resp.data || {};
    const reqResp = await request.get('/finance/asset-requisitions');
    assetReqs.value = reqResp.code === 200 ? (reqResp.data || []) : [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ===== 应收/应付录入 =====
const recordDlg = reactive({ visible: false, saving: false, type: 'receivable', form: {} });
function openRecordForm(type) {
  recordDlg.type = type;
  recordDlg.form = { desc: '', category: '合同款', amount: undefined, date: today() };
  recordDlg.visible = true;
}
async function submitRecord() {
  const f = recordDlg.form;
  if (!f.desc || !f.amount) { ElMessage.warning('请填写完整'); return; }
  recordDlg.saving = true;
  try {
    const resp = await request.post('/finance/records', {
      type: recordDlg.type, desc: f.desc, category: f.category, amount: f.amount, date: f.date,
    });
    if (resp.code === 200) {
      ElMessage.success(resp.msg || '录入成功，等待审批');
      recordDlg.visible = false;
      load();
    } else ElMessage.error(resp.msg || '录入失败');
  } finally {
    recordDlg.saving = false;
  }
}

// ===== 财务记录审批 =====
async function approveRecord(row) {
  try { await ElMessageBox.confirm('确认审批通过此财务记录？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/finance/records/${row.id}/approve`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function rejectRecord(row) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('请输入驳回原因：', '驳回', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/finance/records/${row.id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// ===== 财务记录审批流程 =====
const recordWf = reactive({ visible: false, record: null });
function showRecordWorkflow(row) { recordWf.record = row; recordWf.visible = true; }

// ===== 固定资产录入 =====
const assetDlg = reactive({ visible: false, saving: false, form: {} });
function openAssetForm() {
  if (!canCreateAsset.value) { ElMessage.warning('无权录入固定资产'); return; }
  assetDlg.form = { name: '', category: '电子设备', dept: '', user: '', purchase_date: today(), original_value: undefined, salvage_pct: 5, useful_life: 36 };
  assetDlg.visible = true;
}
async function submitAsset() {
  const f = assetDlg.form;
  if (!f.name || !f.original_value) { ElMessage.warning('请填写资产名称和原值'); return; }
  assetDlg.saving = true;
  try {
    const resp = await request.post('/finance/assets', {
      name: f.name, category: f.category, dept: f.dept, user: f.user,
      purchase_date: f.purchase_date, original_value: f.original_value,
      salvage_rate: (f.salvage_pct || 5) / 100, useful_life: f.useful_life || 36,
    });
    if (resp.code === 200) {
      ElMessage.success(resp.msg || '录入成功，等待审批');
      assetDlg.visible = false;
      load();
    } else ElMessage.error(resp.msg || '录入失败');
  } finally {
    assetDlg.saving = false;
  }
}

// ===== 固定资产审批 =====
async function approveAsset(row) {
  try { await ElMessageBox.confirm('确认审批通过此固定资产申请？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/finance/assets/${row.id}/approve`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function rejectAsset(row) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('请输入驳回原因：', '驳回', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/finance/assets/${row.id}/reject`, { remark });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// ===== 固定资产审批流程 =====
const assetWf = reactive({ visible: false, asset: null });
function showAssetWorkflow(row) { assetWf.asset = row; assetWf.visible = true; }

// ===== 领用申请 =====
const reqDlg = reactive({ visible: false, saving: false, form: {} });
function openReqForm() {
  if (!canCreateAsset.value) { ElMessage.warning('无权提交领用申请'); return; }
  reqDlg.form = { asset_id: '', requisitioner: auth.user?.name || '', dept: auth.user?.dept || '', req_date: today(), purpose: '' };
  reqDlg.visible = true;
}
async function submitReq() {
  const f = reqDlg.form;
  if (!f.asset_id) { ElMessage.warning('请选择资产'); return; }
  if (!f.purpose) { ElMessage.warning('请填写用途说明'); return; }
  const asset = assets.value.find(a => a.id === f.asset_id);
  reqDlg.saving = true;
  try {
    const resp = await request.post('/finance/asset-requisitions', {
      asset_id: f.asset_id,
      asset_name: asset ? asset.name : '',
      category: asset ? asset.category : '',
      requisitioner: f.requisitioner,
      dept: f.dept,
      req_date: f.req_date,
      purpose: f.purpose,
    });
    if (resp.code === 200) {
      ElMessage.success('领用申请已提交');
      reqDlg.visible = false;
      load();
    } else ElMessage.error(resp.msg || '提交失败');
  } finally {
    reqDlg.saving = false;
  }
}

// ===== 领用审批 =====
async function approveReq(row) {
  try { await ElMessageBox.confirm('确认批准此领用申请？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/finance/asset-requisitions/${row.id}/approve`);
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function rejectReq(row) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('请输入驳回原因：', '驳回', { confirmButtonText: '确定', cancelButtonText: '取消' });
    remark = r.value;
  } catch { return; }
  const resp = await request.post(`/finance/asset-requisitions/${row.id}/reject`, { remark: remark || '不合规' });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

// ===== 领用审批流程 =====
const reqWf = reactive({ visible: false, req: null });
function showReqWorkflow(row) { reqWf.req = row; reqWf.visible = true; }
function flowStepClass(flow, i) {
  const f = flow[i];
  if (f.done) return 'wf-done';
  if (i === 0 || flow.slice(0, i).every(s => s.done)) return 'wf-current';
  return 'wf-pending';
}

// ===== 打印 =====
const PRINT_WF_CSS = '.wf-step{display:inline-block;text-align:center;padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:12px;min-width:80px;}.wf-arrow{display:inline-block;color:#999;margin:0 4px;}.wf-done{background:#d1fae5;border-color:#10b981;}.wf-current{background:#fef3c7;border-color:#f59e0b;}.wf-pending{background:#f9fafb;border-color:#d1d5db;}.wf-name{font-weight:bold;margin-bottom:4px;}.wf-time{color:#666;font-size:11px;}';
function flowHTML(flow) {
  return (flow || []).map((f, i) => {
    const cls = f.done ? 'wf-done' : (i === 0 || flow.slice(0, i).every(s => s.done)) ? 'wf-current' : 'wf-pending';
    return `<span class="wf-step ${cls}"><div class="wf-name">${esc(f.step)}</div><div style="font-size:11px;">${esc(f.user || '—')}</div><div class="wf-time">${esc(f.time || '—')}</div></span>${i < flow.length - 1 ? '<span class="wf-arrow">→</span>' : ''}`;
  }).join('');
}
function openPrint(title, style, body) {
  const w = window.open('', '_blank');
  if (!w) { ElMessage.error('请允许弹出窗口以打印'); return; }
  w.document.write(`<html><head><title>${esc(title)}</title><style>${style}</style></head><body>${body}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

function printFinanceRecord(r) {
  if (!r) { ElMessage.error('记录不存在'); return; }
  const style = `body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:750px;margin:0 auto;}h2{text-align:center;margin-bottom:24px;border-bottom:2px solid #2563eb;padding-bottom:12px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}th{background:#f5f5f5;width:15%;}${PRINT_WF_CSS}h4{font-size:16px;margin:20px 0 10px;}.footer{margin-top:40px;text-align:center;color:#999;font-size:12px;}`;
  const body = `<h2>${r.type === 'receivable' ? '应收账款单' : '应付账款单'}</h2><table><tr><th>编号</th><td>${esc(r.id)}</td><th>摘要</th><td>${esc(r.desc)}</td></tr><tr><th>金额</th><td>¥${fmt(r.amount)}</td><th>日期</th><td>${esc(r.date)}</td></tr><tr><th>部门</th><td>${esc(r.dept)}</td><th>状态</th><td>${esc(r.status)}</td></tr><tr><th>录入人</th><td>${esc(r.submitter)}</td><th>类别</th><td>${esc(r.category)}</td></tr></table><h4>审批流程</h4><div style="text-align:center;">${flowHTML(r.approval_flow)}</div><div class="footer">四川卓盟科技有限公司 · 打印时间：${new Date().toLocaleString('zh-CN')}</div>`;
  openPrint('财务记录单', style, body);
}

function printFixedAssetRecord(a) {
  if (!a) { ElMessage.error('数据未找到'); return; }
  const flow = a.approval_flow || [];
  const steps = flow.map(s => `<span class="step ${s.done ? 'done' : 'pending'}">${esc(s.step)}：${esc(s.user || '—')} ${esc(s.time || '')} ${s.remark ? '(' + esc(s.remark) + ')' : ''}</span>`).join('');
  const style = `body{font-family:Microsoft YaHei;padding:30px;color:#333}h1{text-align:center;font-size:22px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #999;padding:8px 12px;font-size:14px}.step{display:inline-block;padding:8px 16px;border:1px solid #ccc;border-radius:6px;margin-right:8px;font-size:13px}.done{background:#d1fae5;border-color:#10b981}.pending{background:#f3f4f6;color:#999}`;
  const body = `<h1>四川卓盟科技有限公司 — 固定资产登记单</h1>
  <table><tr><td>资产编号</td><td>${esc(a.id)}</td><td>资产名称</td><td>${esc(a.name)}</td></tr>
  <tr><td>类别</td><td>${esc(a.category)}</td><td>使用部门</td><td>${esc(a.dept)}</td></tr>
  <tr><td>使用人</td><td>${esc(a.user)}</td><td>购置日期</td><td>${esc(a.purchase_date)}</td></tr>
  <tr><td>原值</td><td>¥${fmt(a.original_value)}</td><td>净值</td><td>¥${fmt(a.net_value)}</td></tr>
  <tr><td>残值率</td><td>${((a.salvage_rate || 0) * 100).toFixed(1)}%</td><td>使用年限</td><td>${a.useful_life || 36}个月</td></tr>
  <tr><td>状态</td><td>${esc(a.status)}</td><td>录入人</td><td>${esc(a.submitter)}</td></tr></table>
  <h3 style="margin-top:24px;">审批流程</h3>
  <div style="margin:12px 0;">${steps}</div>
  <p style="text-align:center;margin-top:30px;font-size:12px;color:#999;">打印时间：${new Date().toLocaleString('zh-CN')}</p>`;
  openPrint(`固定资产登记单 - ${a.name}`, style, body);
}

function printAssetReq(a) {
  if (!a) { ElMessage.error('记录不存在'); return; }
  const style = `body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:750px;margin:0 auto;}h2{text-align:center;margin-bottom:24px;border-bottom:2px solid #2563eb;padding-bottom:12px;}table{width:100%;border-collapse:collapse;margin-bottom:20px;}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:14px;}th{background:#f5f5f5;width:15%;}${PRINT_WF_CSS}h4{font-size:16px;margin:20px 0 10px;}.footer{margin-top:40px;text-align:center;color:#999;font-size:12px;}.sign-area{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;}.sign-box{text-align:center;}.sign-box .sign-label{font-size:14px;font-weight:bold;margin-bottom:30px;border-bottom:1px solid #333;padding-bottom:4px;}`;
  const body = `<h2>固定资产领用单</h2><table><tr><th>领用编号</th><td>${esc(a.id)}</td><th>资产编号</th><td>${esc(a.asset_id)}</td></tr><tr><th>资产名称</th><td>${esc(a.asset_name)}</td><th>类别</th><td>${esc(a.category)}</td></tr><tr><th>领用人</th><td>${esc(a.requisitioner)}</td><th>部门</th><td>${esc(a.dept)}</td></tr><tr><th>领用日期</th><td>${esc(a.req_date)}</td><th>状态</th><td>${esc(a.status)}</td></tr><tr><th>用途</th><td colspan="3">${esc(a.purpose)}</td></tr></table><h4>审批流程</h4><div style="text-align:center;">${flowHTML(a.approval_flow)}</div><div class="sign-area"><div class="sign-box"><div class="sign-label">领用人签字</div></div><div class="sign-box"><div class="sign-label">部门负责人签字</div></div><div class="sign-box"><div class="sign-label">总经理签字</div></div></div><div class="footer">四川卓盟科技有限公司 · 打印时间：${new Date().toLocaleString('zh-CN')}</div>`;
  openPrint('固定资产领用单', style, body);
}

// ===== 审批流程图（对齐 renderWorkflowDiagram）=====
const WorkflowDiagram = (props) => {
  const flow = props.flow || [];
  if (!flow.length) return null;
  const nodes = [];
  flow.forEach((f, i) => {
    const isDone = f.done;
    const isCurrent = !f.done && (i === 0 || flow.slice(0, i).every(s => s.done));
    const cls = isDone ? 'wf-done' : isCurrent ? 'wf-current' : 'wf-pending';
    nodes.push(
      h('div', { class: `wf-step ${cls}` }, [
        h('div', { class: 'wf-icon' }, [
          isDone
            ? h(ElIcon, { color: '#10b981' }, () => h(CircleCheck))
            : isCurrent
              ? h(ElIcon, { color: '#f59e0b', class: 'is-loading' }, () => h(Loading))
              : h('span', { class: 'wf-hollow' }),
        ]),
        h('div', { class: 'wf-info' }, [
          h('div', { class: 'wf-name' }, f.step),
          h('div', { class: 'wf-user' }, f.user || (isDone ? '已完成' : '待处理')),
          f.time && f.time !== '—' ? h('div', { class: 'wf-time' }, f.time) : null,
        ]),
      ])
    );
    if (i < flow.length - 1) nodes.push(h('div', { class: 'wf-arrow' }, '→'));
  });
  return h('div', { class: 'wf-container' }, [h('div', { class: 'wf-track' }, nodes)]);
};
WorkflowDiagram.props = { flow: { type: Array, default: () => [] } };
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  position: relative;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.stat-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}
.stat-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.stat-label {
  font-size: 12px;
  margin: 0 0 6px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #909399;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-header h3 {
  margin: 0;
  font-size: 15px;
}
.text-muted {
  color: #909399;
}
.wf-meta {
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}
.info-item {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.info-label {
  width: 90px;
  color: #909399;
  font-size: 13px;
}
.info-value {
  flex: 1;
}
.req-flow {
  text-align: center;
  overflow-x: auto;
  padding: 12px 0;
}
.req-wf-step {
  display: inline-block;
  text-align: center;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin: 4px;
  font-size: 12px;
  min-width: 80px;
  vertical-align: middle;
}
.req-wf-step.wf-done { background: #d1fae5; border-color: #10b981; }
.req-wf-step.wf-current { background: #fef3c7; border-color: #f59e0b; }
.req-wf-step.wf-pending { background: #f9fafb; border-color: #d1d5db; }
.req-wf-step .wf-name { font-weight: bold; margin-bottom: 4px; }
.req-wf-step .wf-time { color: #666; font-size: 11px; }
.wf-arrow {
  display: inline-block;
  color: #999;
  margin: 0 4px;
}
</style>

<style>
/* 审批流程图（非 scoped，供函数式组件使用） */
.wf-container { overflow-x: auto; padding: 8px 0; }
.wf-track { display: flex; align-items: center; gap: 4px; }
.wf-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 13px;
  flex-shrink: 0;
}
.wf-step.wf-done { background: #d1fae5; border-color: #10b981; }
.wf-step.wf-current { background: #fef3c7; border-color: #f59e0b; }
.wf-step.wf-pending { background: #f9fafb; border-color: #d1d5db; }
.wf-step .wf-name { font-weight: bold; }
.wf-step .wf-user { font-size: 12px; color: #606266; }
.wf-step .wf-time { color: #909399; font-size: 11px; }
.wf-hollow {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #c0c4cc;
  border-radius: 50%;
}
.wf-arrow { color: #999; }
</style>
