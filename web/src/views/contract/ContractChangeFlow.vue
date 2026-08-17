<template>
  <div>
    <!-- 列表视图 -->
    <template v-if="!detailId">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;"><el-icon style="vertical-align:-2px;"><Share /></el-icon> 合同变更审批流程</h3>
        <el-button type="primary" @click="openStart"><el-icon><Plus /></el-icon> 发起变更</el-button>
      </div>
      <el-alert type="info" :closable="false" style="margin-bottom:12px;">
        <template #title>
          <strong>流程说明：</strong>经办人发起 → 部门负责人 → 法务审核 → 财务审核 → 原终审领导 → 档案管理员归档
          <br /><small>仅"已生效"合同可发起变更；变更完成后保留新旧版本对比，形成版本链</small>
        </template>
      </el-alert>
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="id" label="变更编号" width="140" show-overflow-tooltip />
        <el-table-column label="合同编号" width="130">
          <template #default="{ row }">{{ row.contract_no || '-' }}</template>
        </el-table-column>
        <el-table-column label="合同名称" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contract_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="版本" width="70">
          <template #default="{ row }"><span class="badge" style="background:#6366f1;">V{{ row.version_num }}</span></template>
        </el-table-column>
        <el-table-column prop="change_content" label="变更内容" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span class="badge" :class="row.change_status === '已生效' ? 'badge-success' : row.change_status === '审批中' ? 'badge-warning' : row.change_status === '已驳回' ? 'badge-danger' : ''">{{ row.change_status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="当前节点" width="110">
          <template #default="{ row }">{{ row.current_node || '-' }}</template>
        </el-table-column>
        <el-table-column prop="applicant" label="申请人" width="90" />
        <el-table-column prop="created_at" label="发起时间" width="160" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
            <el-button v-if="row.change_status === '审批中'" link style="color:#10b981;" @click="approve(row.id)">审批</el-button>
            <el-button v-if="row.change_status === '审批中'" link type="danger" @click="reject(row.id)">驳回</el-button>
          </template>
        </el-table-column>
        <template #empty>暂无变更审批记录</template>
      </el-table>
    </template>

    <!-- 详情视图 -->
    <template v-else>
      <div v-loading="detailLoading">
        <div style="margin-bottom:16px;">
          <el-button link type="primary" @click="backToList"><el-icon><ArrowLeft /></el-icon> 返回列表</el-button>
          <h3 v-if="detail.changeForm" style="margin:8px 0;"><el-icon style="vertical-align:-2px;"><Share /></el-icon> 变更审批详情 — V{{ detail.changeForm.version_num }}</h3>
        </div>
        <template v-if="detail.changeForm">
          <el-card style="margin-bottom:16px;">
            <h4 style="margin:0 0 12px;">基本信息</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div><strong>变更编号：</strong>{{ detail.changeForm.id }}</div>
              <div><strong>合同编号：</strong>{{ detail.changeForm.contract_no }}</div>
              <div><strong>合同名称：</strong>{{ detail.changeForm.contract_name }}</div>
              <div><strong>版本号：</strong><span class="badge" style="background:#6366f1;">V{{ detail.changeForm.version_num }}</span></div>
              <div><strong>原合同金额：</strong>¥{{ Number(detail.changeForm.original_amount || 0).toLocaleString() }}</div>
              <div><strong>原终审领导：</strong>{{ finalApproverLabel(detail.changeForm.original_final_approver) }}</div>
              <div><strong>变更状态：</strong><span class="badge" :class="detail.changeForm.change_status === '已生效' ? 'badge-success' : detail.changeForm.change_status === '审批中' ? 'badge-warning' : 'badge-danger'">{{ detail.changeForm.change_status }}</span></div>
              <div><strong>当前节点：</strong>{{ detail.changeForm.current_node || '-' }}</div>
              <div><strong>申请人：</strong>{{ detail.changeForm.applicant }}</div>
              <div><strong>发起时间：</strong>{{ detail.changeForm.created_at }}</div>
              <div><strong>变更生效日期：</strong>{{ detail.changeForm.effective_date || '-' }}</div>
            </div>
          </el-card>
          <el-card style="margin-bottom:16px;">
            <h4 style="margin:0 0 8px;">变更内容</h4>
            <div style="background:#f9fafb;padding:12px;border-radius:8px;margin-bottom:12px;">{{ detail.changeForm.change_content }}</div>
            <h4 style="margin:0 0 8px;">变更原因</h4>
            <div style="background:#f9fafb;padding:12px;border-radius:8px;">{{ detail.changeForm.change_reason }}</div>
          </el-card>
          <el-card v-if="detail.progress" style="margin-bottom:16px;">
            <h4 style="margin:0 0 12px;">审批流程进度</h4>
            <div v-for="(s, i) in detail.progress" :key="i" style="display:flex;align-items:center;gap:4px;margin-bottom:8px;">
              <div :style="`padding:8px 14px;border-radius:8px;font-size:13px;min-width:160px;background:${s.status === 'done' ? '#10b981' : s.status === 'rejected' ? '#ef4444' : '#f3f4f6'};color:${s.status === 'done' || s.status === 'rejected' ? '#fff' : '#606266'};`">
                <el-icon v-if="s.status === 'done'" style="vertical-align:-2px;"><Check /></el-icon>
                <el-icon v-else-if="s.status === 'rejected'" style="vertical-align:-2px;"><Close /></el-icon>
                {{ s.name }}
                <span v-if="s.approver" style="font-size:11px;opacity:.8;">（{{ s.approver }}）</span>
              </div>
              <el-icon v-if="i < detail.progress.length - 1" style="color:#909399;font-size:10px;"><ArrowRight /></el-icon>
            </div>
          </el-card>
          <el-card v-if="detail.versions.length" style="margin-bottom:16px;">
            <h4 style="margin:0 0 12px;">版本链（{{ detail.versions.length }}个版本）</h4>
            <el-table :data="detail.versions" size="small">
              <el-table-column label="版本号" width="90">
                <template #default="{ row }"><span class="badge" :style="`background:${row.version_type === 'original' ? '#10b981' : '#6366f1'};`">V{{ row.version_num }}</span></template>
              </el-table-column>
              <el-table-column label="类型" width="70">
                <template #default="{ row }">{{ row.version_type === 'original' ? '原始' : '变更' }}</template>
              </el-table-column>
              <el-table-column prop="change_summary" label="变更摘要" min-width="220" show-overflow-tooltip />
              <el-table-column prop="operator" label="操作人" width="100" />
              <el-table-column prop="created_at" label="时间" width="160" />
              <el-table-column label="操作" width="70">
                <template #default="{ row }">
                  <el-button v-if="row.version_type === 'change'" link type="primary" @click="openCompare(row.id)">对比</el-button>
                  <span v-else>-</span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
          <div v-if="detail.changeForm.change_status === '审批中'" style="display:flex;gap:8px;margin-bottom:16px;">
            <el-button type="success" @click="approve(detail.changeForm.id)"><el-icon><Check /></el-icon> 审批通过</el-button>
            <el-button type="danger" @click="reject(detail.changeForm.id)"><el-icon><Close /></el-icon> 驳回</el-button>
          </div>
          <el-card v-if="(detail.ccRecords || []).length">
            <h4 style="margin:0 0 12px;">抄送记录</h4>
            <el-table :data="detail.ccRecords" size="small">
              <el-table-column prop="cc_target" label="抄送目标" width="140" />
              <el-table-column prop="cc_target_name" label="名称" width="120" />
              <el-table-column prop="cc_reason" label="原因" min-width="160" />
              <el-table-column prop="sent_at" label="时间" width="160" />
            </el-table>
          </el-card>
        </template>
      </div>
    </template>

    <!-- 发起变更对话框 -->
    <el-dialog v-model="startDlg.visible" title="发起合同变更" width="640px">
      <el-empty v-if="!startDlg.contracts.length" description='当前没有"已生效"状态的合同，无法发起变更。' :image-size="80" />
      <el-form v-else label-width="130px">
        <el-form-item label="选择合同" required>
          <el-select v-model="startDlg.contractId" placeholder="请选择已生效合同" style="width:100%;">
            <el-option v-for="c in startDlg.contracts" :key="c.id" :label="`${c.contract_no} - ${c.contract_name} (¥${Number(c.amount || 0).toLocaleString()})`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更内容" required>
          <el-input v-model="startDlg.content" type="textarea" :rows="3" placeholder="请描述变更内容" />
        </el-form-item>
        <el-form-item label="变更原因" required>
          <el-input v-model="startDlg.reason" type="textarea" :rows="2" placeholder="请说明变更原因" />
        </el-form-item>
        <el-form-item label="变更后条款">
          <el-input v-model="startDlg.changedTerms" type="textarea" :rows="3" placeholder='{"contract_name":"新名称","amount":150000}' />
          <div style="font-size:12px;color:#909399;">JSON格式，列出变更后的字段和值（可选）</div>
        </el-form-item>
        <el-form-item label="变更生效日期">
          <el-date-picker v-model="startDlg.effectiveDate" type="date" value-format="YYYY-MM-DD" style="width:100%;" />
        </el-form-item>
        <el-form-item label="变更附件">
          <el-upload :auto-upload="false" :limit="1" accept=".pdf,.doc,.docx,.jpg,.png" :on-change="(f) => startDlg.file = f.raw" :on-remove="() => startDlg.file = null">
            <el-button><el-icon><Paperclip /></el-icon> 选择附件（可选）</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="startDlg.visible = false">取消</el-button>
        <el-button v-if="startDlg.contracts.length" type="primary" :loading="startDlg.saving" @click="submitStart"><el-icon><Promotion /></el-icon> 提交变更</el-button>
      </template>
    </el-dialog>

    <!-- 版本对比对话框 -->
    <el-dialog v-model="compareDlg.visible" :title="`版本对比 — V${compareDlg.data.version_num || ''}`" width="900px">
      <div style="margin-bottom:16px;"><strong>变更摘要：</strong>{{ compareDlg.data.change_summary }}</div>
      <el-table v-if="(compareDlg.data.changed_fields || []).length" :data="compareDlg.data.changed_fields" size="small">
        <el-table-column prop="field" label="字段" width="160">
          <template #default="{ row }"><strong>{{ row.field }}</strong></template>
        </el-table-column>
        <el-table-column label="变更前" min-width="240">
          <template #default="{ row }"><span style="color:#ef4444;">{{ fmtVal(row.before) }}</span></template>
        </el-table-column>
        <el-table-column label="变更后" min-width="240">
          <template #default="{ row }"><span style="color:#10b981;">{{ fmtVal(row.after) }}</span></template>
        </el-table-column>
      </el-table>
      <p v-else style="color:#909399;">无字段级变更（仅文本描述变更）</p>
      <template #footer><el-button @click="compareDlg.visible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Share, Plus, ArrowLeft, ArrowRight, Check, Close, Paperclip, Promotion } from '@element-plus/icons-vue';
import request from '../../api/request';

const list = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const r = await request.get('/flow-contract-change/list', { params: { pageSize: 50 } });
    if (r.code !== 200) { ElMessage.error('加载失败: ' + (r.msg || '')); return; }
    list.value = r.data?.list || [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ===== 发起变更 =====
const startDlg = reactive({ visible: false, saving: false, contracts: [], contractId: '', content: '', reason: '', changedTerms: '', effectiveDate: '', file: null });

async function openStart() {
  const r = await request.get('/flow-contract-change/eligible-contracts');
  startDlg.contracts = (r.code === 200 && r.data?.list) ? r.data.list : [];
  startDlg.contractId = ''; startDlg.content = ''; startDlg.reason = ''; startDlg.changedTerms = ''; startDlg.effectiveDate = ''; startDlg.file = null;
  startDlg.visible = true;
}

async function submitStart() {
  if (!startDlg.contractId) { ElMessage.error('请选择合同'); return; }
  const content = startDlg.content.trim(), reason = startDlg.reason.trim();
  if (!content) { ElMessage.error('变更内容为必填项'); return; }
  if (!reason) { ElMessage.error('变更原因为必填项'); return; }
  const fd = new FormData();
  fd.append('change_content', content);
  fd.append('change_reason', reason);
  if (startDlg.changedTerms.trim()) fd.append('changed_terms', startDlg.changedTerms.trim());
  if (startDlg.effectiveDate) fd.append('effective_date', startDlg.effectiveDate);
  if (startDlg.file) fd.append('attachment', startDlg.file);
  startDlg.saving = true;
  try {
    const r = await request.post('/flow-contract-change/start/' + startDlg.contractId, fd);
    if (r.code === 200) {
      ElMessage.success('变更审批流程已启动，版本号: V' + (r.data?.version_num ?? ''));
      startDlg.visible = false;
      load();
    } else {
      ElMessage.error(r.msg || '发起失败');
    }
  } catch (e) { ElMessage.error('异常: ' + e.message); } finally { startDlg.saving = false; }
}

// ===== 详情 =====
const detailId = ref(null);
const detailLoading = ref(false);
const detail = reactive({ changeForm: null, flow: null, ccRecords: [], progress: null, versions: [] });

function finalApproverLabel(v) {
  return v === 'gm' ? '总经理' : v === 'deputy_leader' ? '分管领导' : '部门经理';
}

async function openDetail(id) {
  detailId.value = id;
  detailLoading.value = true;
  try {
    const r = await request.get('/flow-contract-change/detail/' + id);
    if (r.code !== 200) { ElMessage.error('加载失败: ' + (r.msg || '')); detailId.value = null; return; }
    detail.changeForm = r.data?.changeForm || null;
    detail.flow = r.data?.flow || null;
    detail.ccRecords = r.data?.ccRecords || [];
    try {
      const pr = await request.get('/flow-contract-change/progress/' + id);
      detail.progress = pr.code === 200 ? (pr.data?.progress || null) : null;
    } catch (e) { detail.progress = null; }
    try {
      const vr = await request.get('/flow-contract-change/versions/' + detail.changeForm.contract_id);
      detail.versions = vr.code === 200 ? (vr.data?.list || []) : [];
    } catch (e) { detail.versions = []; }
  } finally {
    detailLoading.value = false;
  }
}

function backToList() {
  detailId.value = null;
  detail.changeForm = null;
  load();
}

// ===== 审批 / 驳回 =====
async function approve(changeId) {
  let comment;
  try {
    const { value } = await ElMessageBox.prompt('请输入审批意见：', '审批', { inputValue: '审批通过' });
    comment = value || '审批通过';
  } catch { return; }
  try {
    const r = await request.post(`/flow-contract-change/${changeId}/approve`, { comment });
    if (r.code === 200) {
      ElMessage.success(r.msg || '审批通过');
      detailId.value ? openDetail(detailId.value) : load();
    } else {
      ElMessage.error(r.msg || '审批失败');
    }
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

async function reject(changeId) {
  let comment;
  try {
    const { value } = await ElMessageBox.prompt('请输入驳回原因（必填）：', '驳回');
    comment = value;
  } catch { return; }
  if (!comment || !comment.trim()) { ElMessage.error('驳回必须填写审核意见'); return; }
  const fd = new FormData();
  fd.append('comment', comment);
  try {
    const r = await request.post(`/flow-contract-change/${changeId}/reject`, fd);
    if (r.code === 200) {
      ElMessage.success('已驳回，变更退回经办人');
      detailId.value ? openDetail(detailId.value) : load();
    } else {
      ElMessage.error(r.msg || '驳回失败');
    }
  } catch (e) { ElMessage.error('异常: ' + e.message); }
}

// ===== 版本对比 =====
const compareDlg = reactive({ visible: false, data: {} });
async function openCompare(versionId) {
  const r = await request.get('/flow-contract-change/version-compare/' + versionId);
  if (r.code !== 200) { ElMessage.error(r.msg || '加载失败'); return; }
  compareDlg.data = r.data || {};
  compareDlg.visible = true;
}
function fmtVal(v) {
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.substring(0, 80);
}
</script>

<style scoped>
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: #fff; }
.badge-success { background: #10b981; }
.badge-warning { background: #f59e0b; }
.badge-danger { background: #ef4444; }
</style>
