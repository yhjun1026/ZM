<template>
  <el-dialog
    :model-value="modelValue"
    width="900px"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @open="load"
  >
    <template #header>
      <div v-if="p" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span style="font-size: 16px; font-weight: 600;">{{ p.name }}</span>
        <el-tag v-if="isAI" type="primary" effect="dark" style="background: #8b5cf6; border-color: #8b5cf6;">AI自研</el-tag>
        <el-tag v-else type="primary">医疗销售</el-tag>
        <el-tag :type="p.level === '重大' ? 'danger' : 'warning'">{{ p.level }}·{{ '★'.repeat(p.stars || 3) }}</el-tag>
      </div>
      <span v-else>项目详情</span>
    </template>

    <div v-loading="loading" style="max-height: 70vh; overflow-y: auto;">
      <template v-if="p">
        <!-- 基础信息 -->
        <div class="pm-info-grid">
          <div><strong>编号：</strong>{{ p.project_code || '' }}</div>
          <div>
            <strong>状态：</strong>
            <el-tag :type="p.status === '进行中' ? 'success' : 'warning'" size="small">{{ p.status }}</el-tag>
          </div>
          <div><strong>整体进度：</strong>{{ p.progress || 0 }}%</div>
          <div><strong>项目经理：</strong>{{ p.pm_name || '' }}</div>
          <div><strong>计划周期：</strong>{{ p.start_date || '' }} ~ {{ p.plan_end_date || '' }}</div>
          <div v-if="isAI"><strong>研发方向：</strong>{{ p.research_direction || '' }}{{ p.iter_version ? `（当前 v${p.iter_version}）` : '' }}</div>
          <template v-else>
            <div><strong>客户：</strong>{{ p.customer_name || '' }}</div>
            <div><strong>合同金额：</strong>{{ p.contract_amount === null ? '***' : fmtMoney(p.contract_amount) }}</div>
          </template>
        </div>

        <el-alert v-if="p.reject_reason" type="error" :closable="false" style="margin-bottom: 12px;">
          <template #title>驳回意见：{{ p.reject_reason }}</template>
        </el-alert>
        <div v-if="p.description" class="pm-desc"><strong>项目说明：</strong>{{ p.description }}</div>

        <!-- 审批流程 -->
        <h4 class="pm-section-title">
          审批流程
          <el-tag v-if="nextStep" type="warning" size="small" style="margin-left: 6px;">当前：{{ nextStep }}</el-tag>
        </h4>
        <WorkflowDiagram :flow="p.approval_flow || []" />

        <!-- 阶段任务 -->
        <h4 class="pm-section-title">
          阶段任务（{{ p.tasks?.length || 0 }}项<template v-if="(p.tasks || []).some((t) => t.status === '已逾期')">，<span style="color: #ef4444;">存在逾期</span></template>）
        </h4>
        <el-table :data="p.tasks || []" size="small" border>
          <el-table-column prop="seq" label="#" width="50" />
          <el-table-column prop="name" label="任务" min-width="140" />
          <el-table-column label="负责人" width="90"><template #default="{ row }">{{ row.owner_name || '—' }}</template></el-table-column>
          <el-table-column prop="due_date" label="截止" width="110" />
          <el-table-column label="进度" width="150">
            <template #default="{ row }">
              <el-progress :percentage="row.progress || 0" :stroke-width="8" :color="row.status === '已逾期' ? '#ef4444' : '#2563eb'" />
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="taskStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="70">
            <template #default="{ row }">
              <el-button v-if="p.status === '进行中'" size="small" type="primary" @click="updateProjectTask(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
            </template>
          </el-table-column>
          <template #empty><span class="pm-muted">项目启动后自动生成</span></template>
        </el-table>

        <!-- ===== 销售项目专属 ===== -->
        <template v-if="!isAI">
          <h4 class="pm-section-title" style="border-left-color: #0ea5e9;">回款管理（财务确认制）</h4>
          <el-table v-if="p.payments?.length" :data="p.payments" size="small" border>
            <el-table-column label="阶段" width="90"><template #default="{ row }">{{ row.stage || '—' }}</template></el-table-column>
            <el-table-column label="计划金额" width="110"><template #default="{ row }">{{ fmtMoney(row.plan_amount) }}</template></el-table-column>
            <el-table-column prop="plan_date" label="计划日期" width="110" />
            <el-table-column label="实际金额" width="110"><template #default="{ row }">{{ row.actual_amount ? fmtMoney(row.actual_amount) : '—' }}</template></el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }"><el-tag :type="paymentStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button v-if="['待回款', '逾期'].includes(row.status) && p.status === '进行中'" size="small" type="primary" @click="recordPayment(row)">录入回款</el-button>
                <el-button v-if="row.status === '待确认'" size="small" type="success" @click="confirmPayment(row)">财务确认</el-button>
              </template>
            </el-table-column>
          </el-table>
          <p v-else class="pm-muted" style="font-size: 13px;">暂无回款计划</p>
          <el-button v-if="p.status === '进行中'" size="small" type="info" style="margin-top: 6px;" @click="showPaymentForm">
            <el-icon><Plus /></el-icon> 回款计划
          </el-button>

          <h4 class="pm-section-title" style="border-left-color: #0ea5e9;">交付验收记录</h4>
          <el-table v-if="p.deliveries?.length" :data="p.deliveries" size="small" border>
            <el-table-column prop="stage" label="环节" width="90" />
            <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
            <el-table-column label="状态" width="90">
              <template #default="{ row }"><el-tag :type="doneStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button v-if="row.status !== '已完成'" size="small" type="success" @click="updateDelivery(row)">完成</el-button>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
          <p v-else class="pm-muted" style="font-size: 13px;">暂无交付记录</p>
          <el-button v-if="p.status === '进行中'" size="small" type="info" style="margin-top: 6px;" @click="showDeliveryForm">
            <el-icon><Plus /></el-icon> 交付记录
          </el-button>

          <h4 class="pm-section-title" style="border-left-color: #0ea5e9;">售后跟进</h4>
          <el-table v-if="p.aftersales?.length" :data="p.aftersales" size="small" border>
            <el-table-column prop="type" label="类型" width="80" />
            <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
            <el-table-column prop="handler" label="处理人" width="90" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }"><el-tag :type="doneStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button v-if="row.status !== '已完成'" size="small" type="success" @click="updateAftersale(row)">完成</el-button>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
          <p v-else class="pm-muted" style="font-size: 13px;">暂无售后记录</p>
          <el-button v-if="['进行中', '已结项'].includes(p.status)" size="small" type="info" style="margin-top: 6px;" @click="showAftersaleForm">
            <el-icon><Plus /></el-icon> 售后记录
          </el-button>
        </template>

        <!-- ===== AI项目专属 ===== -->
        <template v-else>
          <h4 class="pm-section-title" style="border-left-color: #8b5cf6;">版本迭代记录（{{ p.versions?.length || 0 }}）</h4>
          <el-table v-if="p.versions?.length" :data="p.versions" size="small" border>
            <el-table-column label="版本" width="90">
              <template #default="{ row }">
                <el-tag type="primary" size="small" effect="dark" style="background: #8b5cf6; border-color: #8b5cf6;">v{{ row.version_no }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="content" label="更新内容" min-width="180" show-overflow-tooltip />
            <el-table-column prop="improvements" label="优化点" min-width="180" show-overflow-tooltip />
            <el-table-column prop="released_at" label="发布日期" width="110" />
            <el-table-column prop="operator" label="登记人" width="90" />
          </el-table>
          <p v-else class="pm-muted" style="font-size: 13px;">暂无版本记录</p>
          <el-button v-if="p.status === '进行中'" size="small" type="info" style="margin-top: 6px;" @click="showVersionForm">
            <el-icon><Share /></el-icon> 登记版本
          </el-button>

          <h4 class="pm-section-title" style="border-left-color: #8b5cf6;">测试与缺陷管理</h4>
          <el-table v-if="p.tests?.length" :data="p.tests" size="small" border>
            <el-table-column prop="case_name" label="用例" min-width="140" />
            <el-table-column label="结果" width="90">
              <template #default="{ row }"><el-tag :type="testResultType(row.result)" size="small">{{ row.result }}</el-tag></template>
            </el-table-column>
            <el-table-column label="缺陷" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.bugs || '—' }}</template>
            </el-table-column>
            <el-table-column label="缺陷状态" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.bugs" :type="row.bug_status === '已修复' ? 'success' : 'danger'" size="small">{{ row.bug_status }}</el-tag>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button v-if="row.bugs && row.bug_status !== '已修复'" size="small" type="success" @click="updateTestBug(row)">修复</el-button>
                <span v-else>—</span>
              </template>
            </el-table-column>
          </el-table>
          <p v-else class="pm-muted" style="font-size: 13px;">暂无测试记录</p>
          <el-button v-if="p.status === '进行中'" size="small" type="info" style="margin-top: 6px;" @click="showTestForm">
            <el-icon><Checked /></el-icon> 录入测试
          </el-button>
        </template>

        <!-- 变更记录 -->
        <h4 class="pm-section-title">变更记录</h4>
        <el-table :data="p.changes || []" size="small" border>
          <el-table-column prop="change_type" label="类型" width="110" />
          <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="changeStatusType(row.status)" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="审批" width="130">
            <template #default="{ row }">
              <template v-if="row.status === '待审批'">
                <el-button size="small" type="success" @click="approveChange(row)"><el-icon><Check /></el-icon></el-button>
                <el-button size="small" type="danger" @click="rejectChange(row)"><el-icon><Close /></el-icon></el-button>
              </template>
              <span v-else>{{ row.applicant || '' }}</span>
            </template>
          </el-table-column>
          <template #empty><span class="pm-muted">暂无变更</span></template>
        </el-table>

        <!-- 风险台账 -->
        <h4 class="pm-section-title">风险台账</h4>
        <el-table :data="p.risks || []" size="small" border>
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column label="等级" width="80">
            <template #default="{ row }"><el-tag :type="row.level === '高' ? 'danger' : 'warning'" size="small">{{ row.level }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }"><el-tag :type="row.status === '已解决' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button v-if="row.status !== '已解决'" size="small" type="primary" @click="handleRisk(row)">处理</el-button>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <template #empty><span class="pm-muted">暂无风险</span></template>
        </el-table>

        <!-- 项目文档 -->
        <h4 class="pm-section-title">项目文档（{{ p.docs?.length || 0 }}）</h4>
        <el-table :data="p.docs || []" size="small" border>
          <el-table-column label="分类" width="110">
            <template #default="{ row }">
              {{ row.category }}
              <el-tag v-if="row.confidential" type="danger" size="small" style="margin-left: 4px;">涉密</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column prop="uploader" label="上传人" width="90" />
          <el-table-column label="时间" width="150">
            <template #default="{ row }">{{ (row.uploaded_at || '').slice(0, 16) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="70">
            <template #default="{ row }">
              <el-button size="small" type="info" title="下载" @click="downloadProjectDoc(row)"><el-icon><Download /></el-icon></el-button>
            </template>
          </el-table-column>
          <template #empty><span class="pm-muted">暂无文档</span></template>
        </el-table>

        <!-- 操作日志 -->
        <h4 class="pm-section-title">操作日志（审计溯源）</h4>
        <div class="pm-log-box">
          <div v-for="(l, i) in p.logs || []" :key="i" class="pm-log-line">
            <span style="color: var(--el-color-primary);">{{ (l.created_at || '').slice(0, 16) }}</span>
            【{{ l.action }}】{{ l.detail }} — {{ l.operator_name }}
          </div>
          <span v-if="!(p.logs || []).length" class="pm-muted">暂无日志</span>
        </div>
      </template>
    </div>

    <template #footer>
      <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end;">
        <template v-if="p && p.status === '进行中'">
          <el-button size="small" @click="showDocUploadForm"><el-icon><Upload /></el-icon> 上传文档</el-button>
          <el-button size="small" @click="showChangeForm"><el-icon><Switch /></el-icon> 发起变更</el-button>
          <el-button size="small" @click="showRiskForm"><el-icon><Lightning /></el-icon> 录入风险</el-button>
          <el-button size="small" type="warning" @click="showCloseForm"><el-icon><Flag /></el-icon> 发起结项</el-button>
        </template>
        <el-button v-if="p && (p.status === '草稿' || p.status === '已驳回')" size="small" type="primary" @click="resubmitProject">
          <el-icon><RefreshRight /></el-icon> 重新提交
        </el-button>
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      </div>
    </template>

    <!-- 通用小表单弹窗 -->
    <PmFormDialog
      v-model="formDlg.visible"
      :title="formDlg.title"
      :fields="formDlg.fields"
      :alert="formDlg.alert"
      :loading="formDlg.loading"
      @submit="onFormSubmit"
    />
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Edit, Plus, Share, Checked, Check, Close, Download, Upload, Switch, Lightning, Flag, RefreshRight,
} from '@element-plus/icons-vue';
import WorkflowDiagram from './WorkflowDiagram.vue';
import PmFormDialog from './PmFormDialog.vue';
import {
  projectsApi, fmtMoney, taskStatusType, paymentStatusType, doneStatusType, testResultType, changeStatusType,
} from './api';

const props = defineProps({
  modelValue: Boolean,
  projectId: { type: [Number, String], default: null },
});
const emit = defineEmits(['update:modelValue', 'list-reload']);

const loading = ref(false);
const p = ref(null);
const isAI = computed(() => p.value?.type === 'ai');
const nextStep = computed(() => ((p.value?.approval_flow || []).find((s) => !s.done) || {}).step || '');

async function load() {
  if (!props.projectId) return;
  loading.value = true;
  const resp = await projectsApi.get(props.projectId);
  loading.value = false;
  if (resp.code === 200) p.value = resp.data || {};
  else ElMessage.error(resp.msg || '加载失败');
}

/* ===== 通用小表单弹窗 ===== */
const formDlg = reactive({ visible: false, title: '', fields: [], alert: null, loading: false, onSubmit: null });
function openForm(cfg) {
  Object.assign(formDlg, { visible: true, title: cfg.title, fields: cfg.fields, alert: cfg.alert || null, loading: false, onSubmit: cfg.onSubmit });
}
async function onFormSubmit(form) {
  formDlg.loading = true;
  const resp = await formDlg.onSubmit(form);
  formDlg.loading = false;
  if (!resp) return;
  if (resp.code === 200) {
    ElMessage.success(resp.msg || '操作成功');
    formDlg.visible = false;
    load();
  } else {
    ElMessage.error(resp.msg || '操作失败');
  }
}

/* ===== 重新提交 ===== */
async function resubmitProject() {
  const resp = await projectsApi.submit(p.value.id);
  if (resp.code === 200) {
    ElMessage.success(resp.msg || '已重新提交');
    emit('update:modelValue', false);
    emit('list-reload');
  } else ElMessage.error(resp.msg || '提交失败');
}

/* ===== 任务进度汇报 ===== */
async function updateProjectTask(task) {
  let val;
  try {
    const r = await ElMessageBox.prompt('请输入任务进度（0-100）：', '更新任务进度', {
      inputValue: String(task.progress || 0),
      inputPattern: /^\d{1,3}$/,
      inputErrorMessage: '请输入0-100的数字',
      inputValidator: (v) => (/^\d{1,3}$/.test(v) && +v <= 100) || '请输入0-100的数字',
    });
    val = r.value;
  } catch { return; }
  let remark = '';
  try {
    const r = await ElMessageBox.prompt('任务备注反馈（可留空）：', '任务备注', { inputValue: '' });
    remark = r.value ?? '';
  } catch { /* 留空 */ }
  const resp = await projectsApi.updateTask(task.id, { progress: parseInt(val) || 0, remark });
  if (resp.code === 200) { ElMessage.success('任务进度已更新'); load(); }
  else ElMessage.error(resp.msg || '更新失败');
}

/* ===== 回款 ===== */
function showPaymentForm() {
  openForm({
    title: '新增回款计划',
    fields: [
      { key: 'stage', label: '回款阶段', placeholder: '如：预付款/到货款/验收款/质保金' },
      { key: 'plan_amount', label: '计划金额(¥)', type: 'number', min: 1, half: true },
      { key: 'plan_date', label: '计划回款日期', type: 'date', half: true },
    ],
    onSubmit: (f) => {
      const data = { stage: (f.stage || '').trim(), plan_amount: parseFloat(f.plan_amount) || 0, plan_date: f.plan_date || '' };
      if (!(data.plan_amount > 0)) { ElMessage.warning('计划金额必须大于0'); return null; }
      return projectsApi.addPayment(p.value.id, data);
    },
  });
}
async function recordPayment(row) {
  let amount;
  try {
    const r = await ElMessageBox.prompt('实际回款金额(¥)：', '录入回款');
    amount = r.value;
  } catch { return; }
  const resp = await projectsApi.recordPayment(row.id, { actual_amount: parseFloat(amount) || 0 });
  if (resp.code === 200) { ElMessage.success('已录入，待财务确认'); load(); }
  else ElMessage.error(resp.msg || '录入失败');
}
async function confirmPayment(row) {
  try { await ElMessageBox.confirm('确认该笔回款已到账？', '财务确认', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.confirmPayment(row.id);
  if (resp.code === 200) { ElMessage.success('回款已财务确认'); load(); }
  else ElMessage.error(resp.msg || '确认失败');
}

/* ===== 交付 ===== */
function showDeliveryForm() {
  openForm({
    title: '录入交付验收记录',
    fields: [
      { key: 'stage', label: '环节', type: 'select', options: ['发货', '安装', '调试', '客户验收'], def: '发货' },
      { key: 'content', label: '内容说明', type: 'textarea' },
      { key: 'doc_name', label: '验收单据名称', placeholder: '如：华西医院验收单.pdf' },
    ],
    onSubmit: (f) => projectsApi.addDelivery(p.value.id, {
      stage: f.stage, content: (f.content || '').trim(), doc_name: (f.doc_name || '').trim(),
    }),
  });
}
async function updateDelivery(row) {
  try { await ElMessageBox.confirm('标记该交付环节为已完成？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.updateDelivery(row.id, { status: '已完成' });
  if (resp.code === 200) { ElMessage.success('交付记录已更新'); load(); }
  else ElMessage.error(resp.msg || '更新失败');
}

/* ===== 售后 ===== */
function showAftersaleForm() {
  openForm({
    title: '录入售后记录',
    fields: [
      { key: 'type', label: '类型', type: 'select', options: ['维护', '报修', '升级'], def: '维护' },
      { key: 'content', label: '内容', type: 'textarea' },
    ],
    onSubmit: (f) => projectsApi.addAftersale(p.value.id, { type: f.type, content: (f.content || '').trim() }),
  });
}
async function updateAftersale(row) {
  try { await ElMessageBox.confirm('标记该售后记录为已完成？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.updateAftersale(row.id, { status: '已完成' });
  if (resp.code === 200) { ElMessage.success('售后记录已完成'); load(); }
  else ElMessage.error(resp.msg || '更新失败');
}

/* ===== 版本迭代 ===== */
function showVersionForm() {
  openForm({
    title: '登记版本迭代',
    fields: [
      { key: 'version_no', label: '版本号', placeholder: '如：1.2.0' },
      { key: 'content', label: '更新内容', type: 'textarea' },
      { key: 'improvements', label: '优化点', type: 'textarea' },
    ],
    onSubmit: (f) => {
      if (!(f.version_no || '').trim()) { ElMessage.warning('版本号必填'); return null; }
      return projectsApi.addVersion(p.value.id, {
        version_no: f.version_no.trim(), content: (f.content || '').trim(), improvements: (f.improvements || '').trim(),
      });
    },
  });
}

/* ===== 测试与缺陷 ===== */
function showTestForm() {
  openForm({
    title: '录入测试用例',
    fields: [
      { key: 'case_name', label: '用例名称' },
      { key: 'result', label: '测试结果', type: 'select', options: ['通过', '不通过', '待测试'], def: '通过' },
      { key: 'bugs', label: '缺陷问题（无则留空）', type: 'textarea' },
    ],
    onSubmit: (f) => {
      if (!(f.case_name || '').trim()) { ElMessage.warning('用例名称必填'); return null; }
      const bugs = (f.bugs || '').trim();
      return projectsApi.addTest(p.value.id, { case_name: f.case_name.trim(), result: f.result, bugs, bug_status: bugs ? '待修复' : '' });
    },
  });
}
async function updateTestBug(row) {
  try { await ElMessageBox.confirm('标记该缺陷为已修复？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.updateTest(row.id, { bug_status: '已修复' });
  if (resp.code === 200) { ElMessage.success('缺陷已标记修复'); load(); }
  else ElMessage.error(resp.msg || '更新失败');
}

/* ===== 文档上传/下载 ===== */
function showDocUploadForm() {
  openForm({
    title: '上传项目文档',
    alert: { type: 'info', icon: 'shield', text: 'AI项目的技术类文档自动标记涉密，跨部门不可见；所有操作留痕可审计' },
    fields: [
      { key: 'category', label: '文档分类', type: 'select', options: ['立项资料', '审批单据', '合同文件', '技术文档', '验收资料', '变更记录', '结项报告'], def: '立项资料' },
      { key: 'name', label: '文档名称' },
      { key: 'file', label: '选择文件', type: 'file' },
    ],
    onSubmit: async (f) => {
      const name = (f.name || '').trim();
      if (!name) { ElMessage.warning('文档名称必填'); return null; }
      const file = f.file;
      let content = '';
      if (file) {
        if (file.size > 2 * 1024 * 1024) { ElMessage.warning('文件限2MB以内'); return null; }
        content = await new Promise((r) => {
          const fr = new FileReader();
          fr.onload = () => r((fr.result || '').split(',')[1] || '');
          fr.readAsDataURL(file);
        });
      }
      return projectsApi.uploadDoc(p.value.id, {
        category: f.category, name, file_type: file?.name.split('.').pop() || '', content,
      });
    },
  });
}
function downloadProjectDoc(doc) {
  const token = localStorage.getItem('zm_token') || '';
  fetch('/api/projects/docs/' + doc.id + '/download', { headers: { Authorization: 'Bearer ' + token } })
    .then((r) => {
      if (!r.ok) return r.json().then((j) => { throw new Error(j.msg || '下载失败'); });
      return r.blob();
    })
    .then((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = doc.name || ('文档' + doc.id);
      a.click();
      URL.revokeObjectURL(a.href);
      ElMessage.success('文档已下载');
    })
    .catch((e) => ElMessage.error(e.message || '下载失败'));
}

/* ===== 变更 ===== */
function showChangeForm() {
  openForm({
    title: '发起变更申请（需审批后生效）',
    fields: [
      { key: 'change_type', label: '变更类型', type: 'select', options: ['进度延期', '预算调整', '交付周期变更', '技术方案变更', '客户需求变更'], def: '进度延期' },
      { key: 'reason', label: '变更原因（必填）', type: 'textarea' },
      { key: 'content', label: '变更内容（必填）', type: 'textarea' },
      { key: 'impact', label: '影响评估', type: 'textarea' },
      { key: 'new_end_date', label: '新计划结束日期（延期类变更）', type: 'date' },
    ],
    onSubmit: (f) => {
      const data = {
        change_type: f.change_type, reason: (f.reason || '').trim(), content: (f.content || '').trim(),
        impact: (f.impact || '').trim(), new_end_date: f.new_end_date || '',
      };
      if (!data.reason || !data.content) { ElMessage.warning('变更原因与内容必填'); return null; }
      return projectsApi.createChange(p.value.id, data);
    },
  });
}
async function approveChange(row) {
  try { await ElMessageBox.confirm('确认审批通过该变更？通过后立即生效并记录变更日志。', '变更审批', { type: 'warning' }); } catch { return; }
  const resp = await projectsApi.approveChange(row.id);
  if (resp.code === 200) { ElMessage.success(resp.msg || '变更已生效'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function rejectChange(row) {
  let remark;
  try {
    const r = await ElMessageBox.prompt('驳回意见（必填）：', '驳回变更', {
      inputValidator: (v) => (v && v.trim() ? true : '驳回必须填写意见'),
    });
    remark = r.value;
  } catch { return; }
  const resp = await projectsApi.rejectChange(row.id, remark);
  if (resp.code === 200) { ElMessage.success('变更已驳回'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}

/* ===== 风险 ===== */
function showRiskForm() {
  openForm({
    title: '录入项目风险',
    fields: [
      { key: 'type', label: '风险类型', placeholder: '如：客户预算削减/人员流失/技术瓶颈' },
      { key: 'level', label: '风险等级', type: 'select', options: ['低', '中', '高'], def: '中' },
      { key: 'description', label: '风险描述', type: 'textarea' },
      { key: 'solution', label: '应对方案', type: 'textarea' },
    ],
    onSubmit: (f) => {
      const data = { type: (f.type || '').trim(), level: f.level, description: (f.description || '').trim(), solution: (f.solution || '').trim() };
      if (!data.type || !data.description) { ElMessage.warning('风险类型与描述必填'); return null; }
      return projectsApi.addRisk(p.value.id, data);
    },
  });
}
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

/* ===== 结项 ===== */
function showCloseForm() {
  openForm({
    title: '发起结项申请',
    alert: { type: 'warning', text: '结项前置条件：所有任务已完成；销售项目须无未完成回款。结项后项目数据锁定。' },
    fields: [
      { key: 'report', label: '结项报告（必填）', type: 'textarea', rows: 5, placeholder: '项目完成情况、成果、遗留问题处理' },
    ],
    onSubmit: (f) => {
      const report = (f.report || '').trim();
      if (!report) { ElMessage.warning('结项报告必填'); return null; }
      return projectsApi.close(p.value.id, report);
    },
  });
}
</script>

<style scoped>
.pm-info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 14px;
  font-size: 13px;
}
.pm-desc {
  padding: 10px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 14px;
  font-size: 13px;
}
.pm-section-title {
  margin: 14px 0 8px;
  border-left: 4px solid var(--el-color-primary);
  padding-left: 8px;
  font-size: 14px;
}
.pm-muted {
  color: var(--el-text-color-secondary);
}
.pm-log-box {
  max-height: 180px;
  overflow-y: auto;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 10px;
  font-size: 12px;
}
.pm-log-line {
  padding: 2px 0;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.06);
}
</style>
