<template>
  <div>
    <el-card v-loading="loading">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <h3 style="margin: 0;">
            <el-icon style="vertical-align: -2px; margin-right: 4px;"><Box /></el-icon>
            项目管理 — 医疗器械销售 + AI技术自研
          </h3>
          <div>
            <el-button size="small" type="info" @click="exportProjectsCSV"><el-icon><Download /></el-icon> 导出台账</el-button>
            <el-button v-if="canCreate" size="small" type="primary" @click="formVisible = true"><el-icon><Plus /></el-icon> 发起立项</el-button>
          </div>
        </div>
      </template>

      <!-- 统计卡片 -->
      <div class="pm-stats-grid">
        <StatCard label="项目总数" :value="(stats.total || 0) + '个'" :icon="Folder" color="#2563eb" />
        <StatCard label="在办项目" :value="(stats.running || 0) + '个'" :icon="VideoPlay" color="#10b981" />
        <StatCard label="待审批" :value="(stats.pending || 0) + '个'" :icon="Timer" color="#f59e0b" />
        <StatCard label="逾期任务" :value="(stats.overdue || 0) + '项'" :icon="Warning" color="#ef4444" />
        <StatCard label="未解决风险" :value="(stats.riskOpen || 0) + '项'" :icon="Lightning" color="#dc2626" />
        <StatCard label="销售签约总额" :value="'¥' + ((stats.sales?.contractAmount || 0) / 10000).toFixed(1) + '万'" :icon="Connection" color="#7c3aed" />
        <StatCard label="销售回款率" :value="(stats.sales?.paymentRate ?? 0) + '%'" :icon="Coin" color="#0ea5e9" />
        <StatCard label="AI平均进度" :value="(stats.ai?.avgProgress ?? 0) + '%'" :icon="Cpu" color="#8b5cf6" />
      </div>

      <!-- 页签 -->
      <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
        <el-button
          v-for="t in tabs"
          :key="t.k"
          size="small"
          :type="tab === t.k ? 'primary' : ''"
          @click="tab = t.k"
        >{{ t.t }}</el-button>
      </div>

      <!-- 项目台账 -->
      <template v-if="tab === 'list'">
        <div style="display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; align-items: center;">
          <el-select v-model="filter.type" placeholder="全部类型" style="width: 150px;" @change="load">
            <el-option label="全部类型" value="" />
            <el-option label="医疗设备销售" value="sales" />
            <el-option label="AI技术自研" value="ai" />
          </el-select>
          <el-select v-model="filter.status" placeholder="全部状态" style="width: 150px;" @change="load">
            <el-option label="全部状态" value="" />
            <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
          </el-select>
          <el-input
            v-model="filter.keyword"
            placeholder="项目名称/编号"
            style="width: 200px;"
            clearable
            @keyup.enter="load"
          />
          <el-button size="small" type="primary" @click="load"><el-icon><Search /></el-icon> 筛选</el-button>
        </div>
        <el-table :data="rows" border>
          <el-table-column label="编号" width="110">
            <template #default="{ row }"><span style="font-size: 12px;">{{ row.project_code || row.id }}</span></template>
          </el-table-column>
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.type === 'ai'" size="small" effect="dark" style="background: #8b5cf6; border-color: #8b5cf6;">AI自研</el-tag>
              <el-tag v-else size="small" type="primary">医疗销售</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="项目名称" min-width="160">
            <template #default="{ row }">
              <el-link type="primary" :underline="false" @click="viewDetail(row)">{{ row.name }}</el-link>
            </template>
          </el-table-column>
          <el-table-column label="等级" width="110">
            <template #default="{ row }">
              <span>{{ '★'.repeat(row.stars || 3) }}</span><span style="color: #d1d5db;">{{ '★'.repeat(5 - (row.stars || 3)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="客户/研发方向" min-width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ row.type === 'ai' ? (row.research_direction || '—') : (row.customer_name || '—') }}</template>
          </el-table-column>
          <el-table-column label="合同金额" width="120">
            <template #default="{ row }">
              {{ row.contract_amount === null ? '***' : (row.type === 'sales' ? fmtMoney(row.contract_amount) : '—') }}
            </template>
          </el-table-column>
          <el-table-column prop="pm_name" label="项目经理" width="90" />
          <el-table-column label="进度" width="140">
            <template #default="{ row }">
              <el-progress :percentage="row.progress || 0" :stroke-width="8" color="#2563eb" />
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="projStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-tooltip content="详情" placement="top">
                <el-button size="small" type="info" @click="viewDetail(row)"><el-icon><View /></el-icon></el-button>
              </el-tooltip>
              <template v-if="['待审批', '审批中'].includes(row.status)">
                <el-tooltip content="审批通过" placement="top">
                  <el-button size="small" type="success" @click="approveProject(row)"><el-icon><Check /></el-icon></el-button>
                </el-tooltip>
                <el-tooltip content="驳回" placement="top">
                  <el-button size="small" type="danger" @click="rejectProject(row)"><el-icon><Close /></el-icon></el-button>
                </el-tooltip>
              </template>
              <template v-if="row.status === '结项审批中'">
                <el-tooltip content="结项审批" placement="top">
                  <el-button size="small" type="success" @click="closeApprove(row)"><el-icon><Flag /></el-icon></el-button>
                </el-tooltip>
                <el-tooltip content="驳回结项" placement="top">
                  <el-button size="small" type="danger" @click="closeReject(row)"><el-icon><RefreshLeft /></el-icon></el-button>
                </el-tooltip>
              </template>
              <el-tooltip v-if="row.status === '已结项' && ['总经理', '超级管理员'].includes(auth.user?.role)" content="归档" placement="top">
                <el-button size="small" @click="archiveProject(row)"><el-icon><Box /></el-icon></el-button>
              </el-tooltip>
            </template>
          </el-table-column>
          <template #empty><span class="pm-muted">暂无项目</span></template>
        </el-table>
      </template>

      <!-- 风险预警 -->
      <template v-if="tab === 'risk'">
        <el-table :data="risks" border>
          <el-table-column label="项目" min-width="140">
            <template #default="{ row }">{{ row.project_name || '—' }}</template>
          </el-table-column>
          <el-table-column prop="type" label="风险类型" width="130" />
          <el-table-column label="等级" width="80">
            <template #default="{ row }"><el-tag :type="riskLevelType(row.level)" size="small">{{ row.level }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="240" show-overflow-tooltip />
          <el-table-column label="来源" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.source === 'auto'" size="small" type="primary">自动识别</el-tag>
              <el-tag v-else size="small" effect="dark" style="background: #8b5cf6; border-color: #8b5cf6;">手动录入</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.status === '已解决' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button v-if="row.status !== '已解决'" size="small" type="primary" @click="handleRisk(row)">
                <el-icon><Tools /></el-icon> 处理
              </el-button>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <template #empty><span class="pm-muted">暂无风险记录</span></template>
        </el-table>
      </template>

      <!-- 统计报表 -->
      <ReportPanel v-if="tab === 'report'" />
    </el-card>

    <ProjectForm v-model="formVisible" @done="load" />
    <ProjectDetail v-model="detailVisible" :project-id="detailId" @list-reload="load" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Box, Download, Plus, Search, View, Check, Close, Flag, RefreshLeft, Tools,
  Folder, VideoPlay, Timer, Warning, Lightning, Connection, Coin, Cpu,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import StatCard from './project/StatCard.vue';
import ReportPanel from './project/ReportPanel.vue';
import ProjectForm from './project/ProjectForm.vue';
import ProjectDetail from './project/ProjectDetail.vue';
import { projectsApi, projStatusType, riskLevelType, fmtMoney } from './project/api';

const auth = useAuthStore();
const canCreate = computed(() => ['超级管理员', '总经理', '副总', '销售总监', '部门经理'].includes(auth.user?.role));

const loading = ref(false);
const rows = ref([]);
const stats = ref({});
const risks = ref([]);
const tab = ref('list');
const tabs = [
  { k: 'list', t: '项目台账' },
  { k: 'risk', t: '风险预警' },
  { k: 'report', t: '统计报表' },
];
const statusOptions = ['待审批', '审批中', '已驳回', '进行中', '结项审批中', '已结项', '已归档'];
const filter = reactive({ type: '', status: '', keyword: '' });

async function load() {
  loading.value = true;
  const [listResp, riskResp] = await Promise.all([
    projectsApi.list({ type: filter.type, status: filter.status, keyword: filter.keyword }),
    projectsApi.risks(),
  ]);
  loading.value = false;
  if (listResp.code === 200) {
    rows.value = listResp.data?.rows || [];
    stats.value = listResp.data?.stats || {};
  } else {
    ElMessage.error(listResp.msg || '加载失败');
  }
  risks.value = (riskResp.code === 200 ? riskResp.data : []) || [];
}
onMounted(load);

/* ===== 详情 ===== */
const detailVisible = ref(false);
const detailId = ref(null);
function viewDetail(row) {
  detailId.value = row.id;
  detailVisible.value = true;
}

/* ===== 立项审批 ===== */
const formVisible = ref(false);

async function approveProject(row) {
  try { await ElMessageBox.confirm('确认审批通过当前步骤？', '立项审批', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.approve(row.id);
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function rejectProject(row) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('请输入驳回意见（必填）：', '驳回项目', {
      inputValidator: (v) => (v && v.trim() ? true : '驳回必须填写意见'),
    });
    remark = r.value;
  } catch { return; }
  const resp = await projectsApi.reject(row.id, remark);
  if (resp.code === 200) { ElMessage.success('项目已驳回，可修改后重新提交'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

/* ===== 结项审批 ===== */
async function closeApprove(row) {
  try { await ElMessageBox.confirm('确认通过当前结项审批步骤？', '结项审批', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.closeApprove(row.id);
  if (resp.code === 200) { ElMessage.success(resp.msg || '结项审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function closeReject(row) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('驳回意见（必填）：', '驳回结项', {
      inputValidator: (v) => (v && v.trim() ? true : '驳回必须填写意见'),
    });
    remark = r.value;
  } catch { return; }
  const resp = await projectsApi.closeReject(row.id, remark);
  if (resp.code === 200) { ElMessage.success('结项已驳回，项目恢复进行中'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

/* ===== 归档 ===== */
async function archiveProject(row) {
  try { await ElMessageBox.confirm('确认将该项目归档？归档后永久留存、支持溯源查询。', '项目归档', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.archive(row.id);
  if (resp.code === 200) { ElMessage.success(resp.msg || '已归档'); load(); }
  else ElMessage.error(resp.msg || '归档失败');
}

/* ===== 风险处理（风险预警页签） ===== */
async function handleRisk(row) {
  let solution;
  try {
    const r = await ElMessageBox.prompt('应对方案/处理说明：', '处理风险', { inputValue: '' });
    solution = r.value;
  } catch { return; }
  let status = '处理中';
  try {
    await ElMessageBox.confirm('该风险是否已解决？', '风险状态', {
      confirmButtonText: '已解决', cancelButtonText: '处理中', distinguishCancelAndClose: true, type: 'warning',
    });
    status = '已解决';
  } catch (action) {
    if (action !== 'cancel') return; // 关闭=放弃操作
  }
  const resp = await projectsApi.handleRisk(row.id, { status, solution });
  if (resp.code === 200) { ElMessage.success('风险状态已更新'); load(); }
  else ElMessage.error(resp.msg || '更新失败');
}

/* ===== 导出台账 ===== */
function exportProjectsCSV() {
  const token = localStorage.getItem('zm_token') || '';
  fetch('/api/projects/export', { headers: { Authorization: 'Bearer ' + token } })
    .then((r) => { if (!r.ok) throw new Error('导出失败'); return r.blob(); })
    .then((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = '项目台账.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      ElMessage.success('台账已导出');
    })
    .catch(() => ElMessage.error('导出失败'));
}
</script>

<style scoped>
.pm-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.pm-muted {
  color: var(--el-text-color-secondary);
}
</style>
