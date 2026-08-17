<template>
  <el-dialog :model-value="modelValue" title="合同详情" width="700px" @update:model-value="$emit('update:modelValue', $event)" @open="load">
    <div v-loading="loading">
      <template v-if="row.id">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div class="info-item"><span class="info-label">合同编号</span><span class="info-value">{{ row.id }}</span></div>
          <div class="info-item"><span class="info-label">合同名称</span><span class="info-value">{{ row.name }}</span></div>
          <div class="info-item"><span class="info-label">客户</span><span class="info-value">{{ row.customer }}</span></div>
          <div class="info-item"><span class="info-label">类型</span><span class="info-value">{{ row.type }}</span></div>
          <div class="info-item"><span class="info-label">金额</span><span class="info-value">¥{{ (row.amount || 0).toLocaleString() }}</span></div>
          <div class="info-item"><span class="info-label">签订日期</span><span class="info-value">{{ row.sign_date || row.start_date || '—' }}</span></div>
          <div class="info-item"><span class="info-label">到期日期</span><span class="info-value">{{ row.end_date || '—' }}</span></div>
          <div class="info-item"><span class="info-label">创建人</span><span class="info-value">{{ row.creator || '—' }}</span></div>
          <div class="info-item">
            <span class="info-label">审批状态</span>
            <span class="info-value">
              <span :class="`tag ${row.status === '执行中' ? 'tag-green' : row.status === '待审批' ? 'tag-yellow' : row.status === '已驳回' ? 'tag-red' : 'tag-blue'}`">{{ row.status }}</span>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">执行状态</span>
            <span class="info-value">
              <span :class="`tag ${row.execution_status === '已完成' ? 'tag-green' : row.execution_status === '执行中' ? 'tag-blue' : row.execution_status === '已暂停' ? 'tag-red' : 'tag-grey'}`">{{ row.execution_status || '未执行' }}</span>
            </span>
          </div>
          <div class="info-item"><span class="info-label">归档位置</span><span class="info-value">{{ row.archive_loc || '—' }}</span></div>
        </div>
        <div v-if="row.execution_desc" class="info-item" style="margin-bottom:16px;">
          <span class="info-label">执行说明</span><span class="info-value">{{ row.execution_desc }}</span>
        </div>
        <div v-if="row.content" style="margin-bottom:16px;">
          <h4 style="margin-bottom:8px;">合同内容</h4>
          <div style="background:#f9fafb;padding:16px;border-radius:8px;font-size:14px;line-height:1.8;white-space:pre-wrap;max-height:300px;overflow-y:auto;">{{ row.content }}</div>
        </div>
        <h4 style="margin:16px 0 8px;">审批流程</h4>
        <div style="text-align:center;overflow-x:auto;padding:8px 0;">
          <template v-if="flow.length">
            <template v-for="(f, i) in flow" :key="i">
              <span class="wf-step" :class="wfClass(f, i)">
                <div class="wf-name">{{ f.step }}</div>
                <div style="font-size:11px;">{{ f.user || '—' }}</div>
                <div class="wf-time">{{ f.time || '—' }}</div>
              </span>
              <span v-if="i < flow.length - 1" class="wf-arrow">→</span>
            </template>
          </template>
          <span v-else style="color:#909399;">无流程数据</span>
        </div>
        <!-- 更新执行情况 -->
        <div v-if="canUpdateExec" style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:16px;">
          <h4 style="margin-bottom:8px;">更新执行情况</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <el-form-item label="执行状态" style="margin-bottom:0;">
              <el-select v-model="execForm.execution_status" style="width:100%;">
                <el-option label="执行中" value="执行中" />
                <el-option label="已完成" value="已完成" />
                <el-option label="已暂停" value="已暂停" />
              </el-select>
            </el-form-item>
            <el-form-item label="执行说明" style="margin-bottom:0;">
              <el-input v-model="execForm.execution_desc" placeholder="执行情况说明" />
            </el-form-item>
          </div>
          <el-button type="primary" size="small" style="margin-top:8px;" @click="updateExecution"><el-icon><DocumentChecked /></el-icon> 更新执行情况</el-button>
        </div>
      </template>
    </div>
    <template #footer>
      <el-button size="small" @click="openVersions"><el-icon><Share /></el-icon> 版本记录</el-button>
      <el-button size="small" @click="printDetail"><el-icon><Printer /></el-icon> 打印合同</el-button>
      <el-button size="small" @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>

    <!-- 版本记录 -->
    <el-dialog v-model="verDlg.visible" title="版本记录" width="600px" append-to-body>
      <el-table :data="verDlg.rows" size="small">
        <el-table-column label="版本号" width="90">
          <template #default="{ row }">V{{ row.version_num }}</template>
        </el-table-column>
        <el-table-column prop="change_desc" label="变更说明" min-width="180">
          <template #default="{ row }">{{ row.change_desc || '—' }}</template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="100">
          <template #default="{ row }">{{ row.operator || '—' }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="160">
          <template #default="{ row }">{{ row.created_at || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Share, Printer, DocumentChecked } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { canApproveUser, printOldContractDetail } from './utils';

const props = defineProps({
  modelValue: Boolean,
  contractId: { type: [String, Number], default: '' },
});
const emit = defineEmits(['update:modelValue', 'updated']);

const auth = useAuthStore();
const loading = ref(false);
const row = ref({});
const flow = computed(() => row.value.flow || []);
const execForm = reactive({ execution_status: '执行中', execution_desc: '' });
const verDlg = reactive({ visible: false, rows: [] });

const canUpdateExec = computed(() => canApproveUser(auth.user) && row.value.status === '执行中');

function wfClass(f, i) {
  if (f.done) return 'wf-done';
  if (i === 0 || flow.value.slice(0, i).every(s => s.done)) return 'wf-current';
  return 'wf-pending';
}

async function load() {
  if (!props.contractId) return;
  loading.value = true;
  row.value = {};
  try {
    const resp = await request.get('/contracts/detail/' + props.contractId);
    if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
    row.value = resp.data || {};
    execForm.execution_status = row.value.execution_status || '执行中';
    execForm.execution_desc = row.value.execution_desc || '';
  } finally {
    loading.value = false;
  }
}

async function updateExecution() {
  const resp = await request.post(`/contracts/${row.value.id}/execution`, {
    execution_status: execForm.execution_status,
    execution_desc: execForm.execution_desc,
  });
  if (resp.code === 200) {
    ElMessage.success('执行情况已更新');
    emit('update:modelValue', false);
    emit('updated');
  } else {
    ElMessage.error(resp.msg || '更新失败');
  }
}

async function openVersions() {
  const resp = await request.get('/contracts/versions/list', { params: { contract_id: row.value.id } });
  if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
  verDlg.rows = resp.data || [];
  verDlg.visible = true;
}

function printDetail() {
  printOldContractDetail(row.value, auth.user?.name);
}
</script>

<style scoped>
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 12px; color: #909399; font-weight: 500; }
.info-value { font-size: 14px; color: #303133; font-weight: 600; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-green { background: #d1fae5; color: #065f46; }
.tag-red { background: #fee2e2; color: #991b1b; }
.tag-yellow { background: #fef3c7; color: #92400e; }
.tag-blue { background: #dbeafe; color: #1e40af; }
.tag-grey { background: #f1f5f9; color: #606266; }
.wf-step { display: inline-block; text-align: center; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; margin: 4px; font-size: 12px; min-width: 80px; vertical-align: middle; }
.wf-name { font-weight: bold; margin-bottom: 4px; }
.wf-time { color: #666; font-size: 11px; }
.wf-arrow { display: inline-block; color: #999; margin: 0 4px; }
.wf-done { background: #d1fae5; border-color: #10b981; }
.wf-current { background: #fef3c7; border-color: #f59e0b; }
.wf-pending { background: #f9fafb; border-color: #d1d5db; }
</style>
