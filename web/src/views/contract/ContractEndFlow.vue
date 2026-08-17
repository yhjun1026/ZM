<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong><el-icon style="vertical-align:-2px;"><CircleClose /></el-icon> 合同终止/解除审批流程</strong>
          <el-button v-if="canStart && eligible.length" type="primary" size="small" @click="startDlg.visible = true"><el-icon><Plus /></el-icon> 发起终止/解除</el-button>
        </div>
      </template>
      <el-alert v-if="!eligible.length && canStart" type="info" :closable="false" style="margin-bottom:12px;" title="当前没有可发起终止/解除的已生效合同。" />
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="终止表单ID" width="130">
          <template #default="{ row }"><span :title="row.id">{{ (row.id || '').substring(0, 12) }}...</span></template>
        </el-table-column>
        <el-table-column label="合同编号" width="120">
          <template #default="{ row }">{{ row.contract_no || '—' }}</template>
        </el-table-column>
        <el-table-column label="合同名称" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contract_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <span :class="`tag ${row.end_type === '终止' ? 'tag-red' : 'tag-orange'}`">{{ row.end_type || '终止' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="终止原因" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.end_reason || '' }}</template>
        </el-table-column>
        <el-table-column label="对应领导" width="90">
          <template #default="{ row }">{{ leaderLabel(row.original_final_approver) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><span :class="`tag ${statusClass(row.end_status)}`">{{ row.end_status }}</span></template>
        </el-table-column>
        <el-table-column label="当前节点" width="100">
          <template #default="{ row }">{{ row.current_node || '—' }}</template>
        </el-table-column>
        <el-table-column label="申请人" width="90">
          <template #default="{ row }">{{ row.applicant || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="openDetail(row.id)"><el-icon><View /></el-icon> 详情</el-button>
            <el-button v-if="row.end_status === '审批中'" size="small" type="primary" @click="approve(row.id)"><el-icon><Check /></el-icon> 审批</el-button>
            <el-button v-if="row.end_status === '审批中'" size="small" type="danger" @click="reject(row.id)"><el-icon><Close /></el-icon> 驳回</el-button>
          </template>
        </el-table-column>
        <template #empty>暂无终止/解除审批记录</template>
      </el-table>
    </el-card>

    <!-- 发起终止/解除 -->
    <el-dialog v-model="startDlg.visible" title="合同终止/解除申请" width="600px">
      <el-form label-width="100px">
        <el-form-item label="选择已生效合同">
          <el-select v-model="startDlg.contractId" style="width:100%;" @change="updateInfo">
            <el-option v-for="c in eligible" :key="c.id" :label="`${c.contract_no || c.id} - ${c.contract_name || c.name || ''}`" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-if="selectedContract" style="background:#f4f4f5;padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px;">
        合同编号: <b>{{ selectedContract.contract_no || '' }}</b> | 合同金额: <b>{{ fmtAmt(selectedContract.amount) }}</b> | 对应领导: <b>{{ computedLeader }}</b>
      </div>
      <el-form label-width="100px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="终止类型">
              <el-select v-model="startDlg.endType" style="width:100%;">
                <el-option label="终止" value="终止" />
                <el-option label="解除" value="解除" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="终止生效日期"><el-date-picker v-model="startDlg.endDate" type="date" value-format="YYYY-MM-DD" style="width:100%;" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="结算金额(¥)"><el-input v-model="startDlg.settleAmount" type="number" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="附件">
              <el-upload :auto-upload="false" :limit="1" :on-change="(f) => startDlg.file = f.raw" :on-remove="() => startDlg.file = null">
                <el-button size="small"><el-icon><Paperclip /></el-icon> 选择文件</el-button>
              </el-upload>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="结算说明"><el-input v-model="startDlg.settleDesc" type="textarea" :rows="2" placeholder="结算情况说明..." /></el-form-item>
        <el-form-item label="终止/解除原因" required><el-input v-model="startDlg.endReason" type="textarea" :rows="3" placeholder="详细说明终止/解除原因..." /></el-form-item>
        <el-form-item label="详细说明"><el-input v-model="startDlg.endDesc" type="textarea" :rows="3" placeholder="补充说明..." /></el-form-item>
        <el-alert type="warning" :closable="false" title="审批流程：经办人发起 → 部门负责人 → 法务 → 财务 → 对应领导 → 档案管理员归档" />
      </el-form>
      <template #footer>
        <el-button @click="startDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="startDlg.saving" @click="submitStart"><el-icon><Promotion /></el-icon> 提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog v-model="detailDlg.visible" :title="`${detail.endForm?.end_type || '终止'}审批详情`" width="780px">
      <div v-loading="detailDlg.loading" style="max-height:70vh;overflow-y:auto;">
        <template v-if="detail.endForm">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div class="info-item"><span class="info-label">合同编号</span><span class="info-value">{{ detail.endForm.contract_no || '—' }}</span></div>
            <div class="info-item"><span class="info-label">合同名称</span><span class="info-value">{{ detail.endForm.contract_name || '—' }}</span></div>
            <div class="info-item"><span class="info-label">终止类型</span><span class="info-value">{{ detail.endForm.end_type || '终止' }}</span></div>
            <div class="info-item"><span class="info-label">对应领导</span><span class="info-value">{{ detailLeader }}</span></div>
            <div class="info-item"><span class="info-label">原合同金额</span><span class="info-value">{{ fmtAmt(detail.endForm.original_amount) }}</span></div>
            <div class="info-item"><span class="info-label">终止生效日期</span><span class="info-value">{{ detail.endForm.end_date || '—' }}</span></div>
            <div class="info-item"><span class="info-label">结算金额</span><span class="info-value">{{ fmtAmt(detail.endForm.settle_amount) }}</span></div>
            <div class="info-item"><span class="info-label">申请人</span><span class="info-value">{{ detail.endForm.applicant || '—' }}</span></div>
            <div class="info-item">
              <span class="info-label">状态</span>
              <span class="info-value"><span :class="`tag ${detail.endForm.end_status === '已生效' ? 'tag-green' : detail.endForm.end_status === '审批中' ? 'tag-yellow' : 'tag-red'}`">{{ detail.endForm.end_status }}</span></span>
            </div>
            <div class="info-item"><span class="info-label">当前节点</span><span class="info-value">{{ detail.flow?.current_node || '—' }}</span></div>
          </div>
          <div class="info-item" style="margin-bottom:8px;"><span class="info-label">终止原因</span><span class="info-value">{{ detail.endForm.end_reason || '—' }}</span></div>
          <div class="info-item" style="margin-bottom:8px;"><span class="info-label">结算说明</span><span class="info-value">{{ detail.endForm.settle_desc || '—' }}</span></div>
          <div v-if="detail.endForm.end_description" class="info-item" style="margin-bottom:8px;"><span class="info-label">详细说明</span><span class="info-value">{{ detail.endForm.end_description }}</span></div>
          <div v-if="detail.endForm.attachment_path" class="info-item" style="margin-bottom:8px;">
            <span class="info-label">附件</span>
            <span class="info-value"><a :href="detail.endForm.attachment_path" target="_blank" style="color:#409eff;"><el-icon style="vertical-align:-2px;"><Paperclip /></el-icon> 查看附件</a></span>
          </div>
          <h4 style="margin:16px 0 10px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;"><el-icon style="vertical-align:-2px;"><Share /></el-icon> 审批流程进度</h4>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div v-for="(s, i) in (detail.flow?.steps || [])" :key="i"
                 :style="`display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:8px;background:#f4f4f5;border-left:3px solid ${stepColor(s.status)};`">
              <div :style="`width:28px;height:28px;border-radius:50%;background:${stepColor(s.status)};color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;`">
                <el-icon><component :is="s.status === 'done' ? CircleCheck : s.status === 'pending' ? Clock : s.status === 'rejected' ? CircleClose : MoreFilled" /></el-icon>
              </div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;">{{ s.name }}</div>
                <div v-if="s.approver" style="font-size:12px;color:#909399;">审批人: {{ s.approver }} | {{ s.time || '' }}</div>
                <div v-if="s.comment" style="font-size:12px;color:#909399;margin-top:4px;padding:6px 8px;background:#fff;border-radius:6px;">{{ s.comment }}</div>
              </div>
              <span class="tag" :style="`background:${stepColor(s.status)};color:#fff;font-size:11px;`">{{ s.status === 'done' ? '已通过' : s.status === 'pending' ? '待审批' : s.status === 'rejected' ? '已驳回' : s.status }}</span>
            </div>
          </div>
          <template v-if="(detail.rejectAttachments || []).length">
            <h4 style="margin:16px 0 8px;"><el-icon style="vertical-align:-2px;"><Paperclip /></el-icon> 驳回附件批注</h4>
            <div v-for="(a, i) in detail.rejectAttachments" :key="i" style="font-size:13px;margin-bottom:4px;">
              <a :href="a.file_path" target="_blank" style="color:#409eff;"><el-icon style="vertical-align:-2px;"><Document /></el-icon> {{ a.file_name }}</a>
              <span style="color:#909399;"> ({{ a.uploader }})</span>
            </div>
          </template>
          <template v-if="(detail.ccRecords || []).length">
            <h4 style="margin:16px 0 8px;"><el-icon style="vertical-align:-2px;"><Message /></el-icon> 抄送记录</h4>
            <div v-for="(c, i) in detail.ccRecords" :key="i" style="font-size:13px;margin-bottom:4px;">
              <span class="tag tag-blue">{{ c.cc_target }}</span> {{ c.cc_target_name }} - {{ c.cc_reason }}
            </div>
          </template>
        </template>
      </div>
      <template #footer>
        <el-button @click="detailDlg.visible = false">关闭</el-button>
        <el-button v-if="detail.endForm?.end_status === '审批中'" type="primary" @click="approve(detail.endForm.id)"><el-icon><Check /></el-icon> 审批通过</el-button>
        <el-button v-if="detail.endForm?.end_status === '审批中'" type="danger" @click="reject(detail.endForm.id)"><el-icon><Close /></el-icon> 驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  CircleClose, Plus, View, Check, Close, Paperclip, Promotion, Share, Document, Message, Clock, CircleCheck, MoreFilled,
} from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { fmtAmt } from './utils';

const auth = useAuthStore();
const rows = ref([]);
const eligible = ref([]);
const loading = ref(false);

const canStart = computed(() => {
  const u = auth.user || {};
  return u.role === '超级管理员' || u.role === '总经理' || u.dept === '行政部';
});

const statusClass = (s) => (s === '已生效' ? 'tag-green' : s === '审批中' ? 'tag-yellow' : s === '已驳回' ? 'tag-red' : 'tag-grey');
const leaderLabel = (v) => (v === 'dept_head' ? '部门经理' : v === 'deputy_leader' ? '分管领导' : v === 'gm' ? '总经理' : '—');
const stepColor = (s) => (s === 'done' ? '#10b981' : s === 'pending' ? '#f59e0b' : s === 'rejected' ? '#ef4444' : '#9ca3af');

function leaderByAmount(amount) {
  const amt = Number(amount) || 0;
  if (amt >= 500000) return '总经理';
  if (amt > 50000) return '分管领导';
  return '部门经理';
}

async function load() {
  loading.value = true;
  try {
    const [listResp, eligResp] = await Promise.all([
      request.get('/flow-contract-end/list'),
      request.get('/flow-contract-end/eligible-contracts'),
    ]);
    if (listResp.code !== 200) { ElMessage.error('加载失败'); return; }
    rows.value = listResp.data?.list || [];
    eligible.value = eligResp.code === 200 ? (eligResp.data?.list || []) : [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ===== 发起 =====
const startDlg = reactive({
  visible: false, saving: false, contractId: '', endType: '终止',
  endDate: new Date().toISOString().slice(0, 10), settleAmount: 0, settleDesc: '', endReason: '', endDesc: '', file: null,
});
const selectedContract = computed(() => eligible.value.find(c => c.id === startDlg.contractId) || null);
const computedLeader = computed(() => leaderByAmount(selectedContract.value?.amount));
function updateInfo() { /* 触发 computed 更新 */ }

async function submitStart() {
  if (!startDlg.contractId) { ElMessage.warning('请选择合同'); return; }
  if (!startDlg.endReason || !startDlg.endReason.trim()) { ElMessage.warning('终止/解除原因为必填项'); return; }
  const fd = new FormData();
  fd.append('end_type', startDlg.endType);
  fd.append('end_reason', startDlg.endReason);
  fd.append('end_description', startDlg.endDesc || '');
  fd.append('end_date', startDlg.endDate || '');
  fd.append('settle_amount', startDlg.settleAmount || '0');
  fd.append('settle_desc', startDlg.settleDesc || '');
  if (startDlg.file) fd.append('attachment', startDlg.file);
  startDlg.saving = true;
  try {
    const resp = await request.post('/flow-contract-end/start/' + startDlg.contractId, fd);
    if (resp.code === 200) {
      ElMessage.success(startDlg.endType + '审批流程已启动');
      startDlg.visible = false;
      startDlg.endReason = ''; startDlg.endDesc = ''; startDlg.settleDesc = ''; startDlg.settleAmount = 0; startDlg.file = null;
      load();
    } else {
      ElMessage.error(resp.msg || '提交失败');
    }
  } finally { startDlg.saving = false; }
}

// ===== 详情 =====
const detailDlg = reactive({ visible: false, loading: false });
const detail = reactive({ endForm: null, instance: null, flow: null, rejectAttachments: [], ccRecords: [] });
const detailLeader = computed(() => leaderByAmount(detail.endForm?.original_amount));

async function openDetail(endId) {
  detailDlg.visible = true;
  detailDlg.loading = true;
  try {
    const resp = await request.get('/flow-contract-end/detail/' + endId);
    if (resp.code !== 200) { ElMessage.error(resp.msg || '加载失败'); detailDlg.visible = false; return; }
    detail.endForm = resp.data?.endForm || null;
    detail.instance = resp.data?.instance || null;
    detail.flow = resp.data?.flow || null;
    detail.rejectAttachments = resp.data?.rejectAttachments || [];
    detail.ccRecords = resp.data?.ccRecords || [];
  } finally {
    detailDlg.loading = false;
  }
}

// ===== 审批 / 驳回 =====
async function afterAction() {
  detailDlg.visible = false;
  load();
}
async function approve(endId) {
  let comment;
  try {
    const { value } = await ElMessageBox.prompt('请输入审批意见（可留空使用默认）:', '审批', { inputValue: '审批通过' });
    comment = value || '审批通过';
  } catch { return; }
  const resp = await request.post(`/flow-contract-end/${endId}/approve`, { comment });
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批通过'); afterAction(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function reject(endId) {
  let comment;
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因（必填）:', '驳回');
    comment = value;
  } catch { return; }
  if (!comment || !comment.trim()) { ElMessage.warning('驳回必须填写审核意见'); return; }
  const fd = new FormData();
  fd.append('comment', comment);
  const resp = await request.post(`/flow-contract-end/${endId}/reject`, fd);
  if (resp.code === 200) { ElMessage.success(resp.msg || '已驳回'); afterAction(); }
  else ElMessage.error(resp.msg || '操作失败');
}
</script>

<style scoped>
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-green { background: #d1fae5; color: #065f46; }
.tag-red { background: #fee2e2; color: #991b1b; }
.tag-yellow { background: #fef3c7; color: #92400e; }
.tag-blue { background: #dbeafe; color: #1e40af; }
.tag-grey { background: #f1f5f9; color: #606266; }
.tag-orange { background: #ffedd5; color: #9a3412; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 12px; color: #909399; font-weight: 500; }
.info-value { font-size: 14px; color: #303133; font-weight: 600; }
</style>
