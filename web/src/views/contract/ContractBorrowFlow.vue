<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong><el-icon style="vertical-align:-2px;"><Reading /></el-icon> 合同借阅审批</strong>
          <el-button v-if="eligible.length" type="primary" size="small" @click="openStart"><el-icon><Plus /></el-icon> 发起借阅</el-button>
        </div>
      </template>
      <div style="padding:0 0 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:13px;color:#6b7280;">共 {{ total }} 条记录</span>
        <el-select v-model="filterStatus" size="small" style="width:120px;" @change="load">
          <el-option v-for="s in ['全部', '审批中', '已批准', '已归还', '已驳回', '已逾期']" :key="s" :label="s === '全部' ? '全部状态' : s" :value="s" />
        </el-select>
        <el-button size="small" @click="checkOverdue"><el-icon><Warning /></el-icon> 检查逾期</el-button>
      </div>
      <el-table v-loading="loading" :data="list" stripe style="font-size:13px;">
        <el-table-column prop="id" label="编号" width="130" show-overflow-tooltip />
        <el-table-column label="合同名称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contract_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="借阅人" width="90">
          <template #default="{ row }">{{ row.applicant || '—' }}</template>
        </el-table-column>
        <el-table-column label="部门" width="100">
          <template #default="{ row }">{{ row.applicant_dept || '—' }}</template>
        </el-table-column>
        <el-table-column label="借阅用途" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.borrow_purpose || '—' }}</template>
        </el-table-column>
        <el-table-column label="期限" width="70">
          <template #default="{ row }">{{ row.borrow_period || '—' }}天</template>
        </el-table-column>
        <el-table-column label="预计归还" width="120">
          <template #default="{ row }">
            <span :style="row.is_overdue === 1 ? 'color:#f97316;font-weight:600;' : ''">
              {{ row.expected_return || '—' }}
              <el-icon v-if="row.is_overdue === 1" style="color:#f97316;vertical-align:-2px;"><Warning /></el-icon>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="涉密" width="70">
          <template #default="{ row }">
            <span v-if="row.is_confidential === 1" style="color:#ef4444;font-weight:600;">涉密</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :style="`padding:3px 10px;border-radius:12px;font-size:12px;color:#fff;background:${statusColor(row.borrow_status)};`">{{ row.borrow_status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.id)">详情</el-button>
            <el-button v-if="row.borrow_status === '审批中'" size="small" type="success" @click="approve(row.id)">审批</el-button>
            <el-button v-if="row.borrow_status === '审批中'" size="small" type="danger" @click="reject(row.id)">驳回</el-button>
            <el-button v-if="row.borrow_status === '已批准'" size="small" type="primary" @click="returnBorrow(row.id)">归还</el-button>
          </template>
        </el-table-column>
        <template #empty>暂无借阅审批记录</template>
      </el-table>
    </el-card>

    <!-- 借阅申请 -->
    <el-dialog v-model="startDlg.visible" title="合同借阅申请" width="560px">
      <el-form label-width="120px">
        <el-form-item label="选择合同" required>
          <el-select v-model="startDlg.contractId" style="width:100%;" placeholder="请选择合同">
            <el-option v-for="c in eligible" :key="c.id" :value="c.id"
                       :label="`${c.contract_name || ''} (${c.contract_no || ''})${c.is_confidential === 1 ? ' [涉密]' : ''}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="借阅用途" required>
          <el-input v-model="startDlg.purpose" type="textarea" :rows="3" placeholder="详细说明借阅用途..." />
        </el-form-item>
        <el-form-item label="借阅期限（天）" required>
          <el-input-number v-model="startDlg.period" :min="1" :max="365" style="width:100%;" />
        </el-form-item>
        <el-form-item label="允许下载原件">
          <el-select v-model="startDlg.allowDownload" style="width:100%;">
            <el-option label="不允许下载" value="0" />
            <el-option label="允许下载" value="1" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-if="selectedConfidential" style="padding:10px 14px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;margin-bottom:12px;font-size:13px;color:#92400e;">
        <el-icon style="vertical-align:-2px;"><Warning /></el-icon> 该合同为涉密合同，需法务二次审批
      </div>
      <template #footer>
        <el-button @click="startDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="startDlg.saving" @click="submitStart">提交申请</el-button>
      </template>
    </el-dialog>

    <!-- 借阅审批详情 -->
    <el-dialog v-model="detailDlg.visible" title="借阅审批详情" width="700px">
      <div v-loading="detailDlg.loading">
        <template v-if="detail.borrowForm">
          <h4 style="margin-bottom:12px;">借阅信息</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-bottom:16px;font-size:13px;">
            <div><span style="color:#6b7280;">合同名称:</span> {{ detail.borrowForm.contract_name || '—' }}</div>
            <div><span style="color:#6b7280;">合同编号:</span> {{ detail.borrowForm.contract_no || '—' }}</div>
            <div><span style="color:#6b7280;">借阅人:</span> {{ detail.borrowForm.applicant || '—' }}</div>
            <div><span style="color:#6b7280;">部门:</span> {{ detail.borrowForm.applicant_dept || '—' }}</div>
            <div><span style="color:#6b7280;">借阅日期:</span> {{ detail.borrowForm.borrow_date || '—' }}</div>
            <div><span style="color:#6b7280;">预计归还:</span> {{ detail.borrowForm.expected_return || '—' }}</div>
            <div><span style="color:#6b7280;">借阅期限:</span> {{ detail.borrowForm.borrow_period || '—' }}天</div>
            <div><span style="color:#6b7280;">允许下载原件:</span> {{ detail.borrowForm.allow_download === 1 ? '是' : '否' }}</div>
            <div><span style="color:#6b7280;">涉密合同:</span> <span v-if="detail.borrowForm.is_confidential === 1" style="color:#ef4444;font-weight:600;">是</span><span v-else>否</span></div>
            <div><span style="color:#6b7280;">状态:</span> {{ detail.borrowForm.borrow_status || '—' }}</div>
          </div>
          <div style="margin-bottom:8px;font-size:13px;"><span style="color:#6b7280;">借阅用途:</span> {{ detail.borrowForm.borrow_purpose || '—' }}</div>
          <div v-if="detail.borrowForm.return_remark" style="margin-bottom:8px;font-size:13px;"><span style="color:#6b7280;">归还备注:</span> {{ detail.borrowForm.return_remark }}</div>

          <h4 style="margin:16px 0 12px;">审批进度</h4>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:16px;">
            <template v-for="(step, i) in (detail.flow?.steps || [])" :key="i">
              <div style="text-align:center;min-width:120px;">
                <div :style="`width:32px;height:32px;border-radius:50%;background:${stepColor(step.status)};color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;`">
                  <el-icon><component :is="stepIcon(step.status)" /></el-icon>
                </div>
                <div :style="`font-size:12px;font-weight:600;color:${stepColor(step.status)};`">{{ step.name }}</div>
                <div v-if="step.approver" style="font-size:11px;color:#6b7280;margin-top:2px;">{{ step.approver }}</div>
                <div v-if="step.time" style="font-size:11px;color:#9ca3af;">{{ (step.time || '').split(' ')[0] }}</div>
              </div>
              <div v-if="i < (detail.flow?.steps || []).length - 1" style="color:#d1d5db;font-size:18px;">→</div>
            </template>
          </div>

          <div v-if="(detail.ccRecords || []).length" style="margin-top:12px;padding:10px;background:#f9fafb;border-radius:6px;">
            <div style="font-size:12px;font-weight:600;margin-bottom:6px;">抄送记录</div>
            <div v-for="(cc, i) in detail.ccRecords" :key="i" style="font-size:12px;color:#6b7280;">{{ cc.cc_target }}: {{ cc.cc_target_name || '' }} - {{ cc.cc_reason || '' }}</div>
          </div>
        </template>
      </div>
      <template #footer><el-button @click="detailDlg.visible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Reading, Plus, Warning, Check, Clock, Close, Minus } from '@element-plus/icons-vue';
import request from '../../api/request';
import { borrowStatusColors } from './utils';

const list = ref([]);
const total = ref(0);
const eligible = ref([]);
const loading = ref(false);
const filterStatus = ref('全部');

const statusColor = (s) => borrowStatusColors[s] || '#6b7280';
const stepColor = (s) => ({ done: '#10b981', pending: '#f59e0b', rejected: '#ef4444', skipped: '#9ca3af' }[s] || '#9ca3af');
const stepIcon = (s) => (s === 'done' ? Check : s === 'pending' ? Clock : s === 'rejected' ? Close : Minus);

async function load() {
  loading.value = true;
  try {
    const params = filterStatus.value !== '全部' ? { status: filterStatus.value } : {};
    const [listResp, eligResp] = await Promise.all([
      request.get('/flow-contract-borrow/list', { params }),
      request.get('/flow-contract-borrow/eligible-contracts'),
    ]);
    if (listResp.code !== 200) { ElMessage.error('加载失败: ' + (listResp.msg || '')); return; }
    list.value = listResp.data?.list || [];
    total.value = listResp.data?.total || 0;
    eligible.value = eligResp.code === 200 ? (eligResp.data?.list || []) : [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ===== 发起借阅 =====
const startDlg = reactive({ visible: false, saving: false, contractId: '', purpose: '', period: 30, allowDownload: '0' });
const selectedConfidential = computed(() => {
  const c = eligible.value.find(x => x.id === startDlg.contractId);
  return c && c.is_confidential === 1;
});

function openStart() {
  if (!eligible.value.length) { ElMessage.warning('暂无可借阅的合同'); return; }
  startDlg.contractId = ''; startDlg.purpose = ''; startDlg.period = 30; startDlg.allowDownload = '0';
  startDlg.visible = true;
}

async function submitStart() {
  if (!startDlg.contractId) { ElMessage.warning('请选择合同'); return; }
  if (!startDlg.purpose.trim()) { ElMessage.warning('请填写借阅用途'); return; }
  if (!startDlg.period || startDlg.period < 1) { ElMessage.warning('请填写有效的借阅期限'); return; }
  startDlg.saving = true;
  try {
    const resp = await request.post('/flow-contract-borrow/start/' + startDlg.contractId, {
      borrow_purpose: startDlg.purpose.trim(),
      borrow_period: startDlg.period,
      allow_download: startDlg.allowDownload,
    });
    if (resp.code === 200) { ElMessage.success('借阅申请已提交'); startDlg.visible = false; load(); }
    else ElMessage.error(resp.msg || '提交失败');
  } finally { startDlg.saving = false; }
}

// ===== 详情 =====
const detailDlg = reactive({ visible: false, loading: false });
const detail = reactive({ borrowForm: null, flow: null, ccRecords: [] });

async function openDetail(borrowId) {
  detailDlg.visible = true;
  detailDlg.loading = true;
  try {
    const resp = await request.get('/flow-contract-borrow/detail/' + borrowId);
    if (resp.code !== 200) { ElMessage.error(resp.msg || '获取详情失败'); detailDlg.visible = false; return; }
    detail.borrowForm = resp.data?.borrowForm || null;
    detail.flow = resp.data?.flow || null;
    detail.ccRecords = resp.data?.ccRecords || [];
  } finally {
    detailDlg.loading = false;
  }
}

// ===== 审批 / 驳回 / 归还 =====
async function approve(borrowId) {
  let comment;
  try {
    const { value } = await ElMessageBox.prompt('请输入审批意见：', '审批', { inputValue: '审批通过' });
    comment = value;
  } catch { return; }
  const resp = await request.post(`/flow-contract-borrow/${borrowId}/approve`, { comment });
  if (resp.code === 200) { ElMessage.success(resp.msg || '审批通过'); load(); }
  else ElMessage.error(resp.msg || '审批失败');
}
async function reject(borrowId) {
  let comment;
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因（必填）：', '驳回');
    comment = value;
  } catch { return; }
  if (!comment || !comment.trim()) { ElMessage.warning('驳回必须填写意见'); return; }
  const resp = await request.post(`/flow-contract-borrow/${borrowId}/reject`, { comment });
  if (resp.code === 200) { ElMessage.success(resp.msg || '已驳回'); load(); }
  else ElMessage.error(resp.msg || '驳回失败');
}
async function returnBorrow(borrowId) {
  let remark;
  try {
    const { value } = await ElMessageBox.prompt('归还备注（可选）：', '归还');
    remark = value || '';
  } catch { return; }
  const resp = await request.post(`/flow-contract-borrow/${borrowId}/return`, { return_remark: remark });
  if (resp.code === 200) { ElMessage.success(resp.msg || '合同已归还'); load(); }
  else ElMessage.error(resp.msg || '归还失败');
}

// ===== 检查逾期 =====
async function checkOverdue() {
  const resp = await request.get('/flow-contract-borrow/overdue');
  if (resp.code === 200) {
    const newlyMarked = resp.data?.newly_marked || 0;
    const totalOverdue = resp.data?.total || 0;
    ElMessage({
      message: `检查完成：新标记逾期 ${newlyMarked} 条，当前逾期共 ${totalOverdue} 条`,
      type: newlyMarked > 0 ? 'warning' : 'success',
    });
    load();
  } else {
    ElMessage.error('检查逾期失败');
  }
}
</script>
