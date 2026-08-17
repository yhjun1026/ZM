<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>合同变更</strong>
          <el-button v-if="canChange" type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon> 变更申请</el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="变更编号" width="140" />
        <el-table-column prop="contract_name" label="合同名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="变更类型" width="100">
          <template #default="{ row }">{{ row.change_type || '—' }}</template>
        </el-table-column>
        <el-table-column label="申请人" width="100">
          <template #default="{ row }">{{ row.applicant || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :class="`tag ${row.status === '已通过' ? 'tag-green' : row.status === '待审批' ? 'tag-yellow' : 'tag-red'}`">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="openDetail(row)"><el-icon><View /></el-icon></el-button>
            <el-button v-if="row.status === '待审批'" size="small" type="primary" @click="approve(row)"><el-icon><Check /></el-icon></el-button>
          </template>
        </el-table-column>
        <template #empty>暂无变更记录</template>
      </el-table>
    </el-card>

    <!-- 变更申请 -->
    <el-dialog v-model="createDlg.visible" title="合同变更申请" width="560px">
      <el-form label-width="90px">
        <el-form-item label="选择合同">
          <el-select v-model="createDlg.form.contract_id" style="width:100%;">
            <el-option v-for="c in contracts" :key="c.id" :label="`${c.id} - ${c.name}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更类型">
          <el-select v-model="createDlg.form.change_type" style="width:100%;">
            <el-option v-for="t in ['内容变更', '金额变更', '期限变更', '主体变更', '其他']" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更前内容"><el-input v-model="createDlg.form.before_desc" type="textarea" :rows="3" placeholder="变更前的内容描述..." /></el-form-item>
        <el-form-item label="变更后内容"><el-input v-model="createDlg.form.after_desc" type="textarea" :rows="3" placeholder="变更后的内容描述..." /></el-form-item>
        <el-form-item label="变更原因"><el-input v-model="createDlg.form.reason" type="textarea" :rows="2" placeholder="变更原因..." /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <!-- 变更详情 -->
    <el-dialog v-model="detailDlg.visible" title="变更详情" width="600px">
      <template v-if="detailDlg.row">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div class="info-item"><span class="info-label">变更编号</span><span class="info-value">{{ detailDlg.row.id }}</span></div>
          <div class="info-item"><span class="info-label">合同名称</span><span class="info-value">{{ detailDlg.row.contract_name }}</span></div>
          <div class="info-item"><span class="info-label">变更类型</span><span class="info-value">{{ detailDlg.row.change_type || '—' }}</span></div>
          <div class="info-item"><span class="info-label">申请人</span><span class="info-value">{{ detailDlg.row.applicant || '—' }}</span></div>
          <div class="info-item"><span class="info-label">状态</span><span class="info-value">{{ detailDlg.row.status }}</span></div>
        </div>
        <div class="info-item" style="margin-bottom:12px;"><span class="info-label">变更前</span><span class="info-value">{{ detailDlg.row.before_desc || '—' }}</span></div>
        <div class="info-item" style="margin-bottom:12px;"><span class="info-label">变更后</span><span class="info-value">{{ detailDlg.row.after_desc || '—' }}</span></div>
        <div class="info-item" style="margin-bottom:16px;"><span class="info-label">变更原因</span><span class="info-value">{{ detailDlg.row.reason || '—' }}</span></div>
        <h4 style="margin:16px 0 8px;">审批流程</h4>
        <div style="text-align:center;overflow-x:auto;">
          <template v-for="(f, i) in (detailDlg.row.flow || [])" :key="i">
            <span class="wf-step" :class="f.done ? 'wf-done' : 'wf-pending'">
              <div class="wf-name">{{ f.step }}</div>
              <div style="font-size:11px;">{{ f.user || '—' }}</div>
              <div class="wf-time">{{ f.time || '—' }}</div>
            </span>
            <span v-if="i < (detailDlg.row.flow || []).length - 1" class="wf-arrow">→</span>
          </template>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, View, Check } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import { canCreateContract } from './utils';

const auth = useAuthStore();
const canChange = computed(() => canCreateContract(auth.user) || auth.user?.role === '超级管理员' || auth.user?.role === '总经理');

const rows = ref([]);
const contracts = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const [listResp, conResp] = await Promise.all([
      request.get('/contracts/changes/list'),
      request.get('/contracts'),
    ]);
    if (listResp.code !== 200) { ElMessage.error('加载失败'); return; }
    rows.value = listResp.data || [];
    contracts.value = conResp.code === 200 ? (conResp.data || []).map(r => ({ id: r.id, name: r.name })) : [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const createDlg = reactive({
  visible: false, saving: false,
  form: { contract_id: '', change_type: '内容变更', before_desc: '', after_desc: '', reason: '' },
});
function openCreate() { createDlg.visible = true; }
async function submitCreate() {
  if (!createDlg.form.contract_id) { ElMessage.warning('请选择合同'); return; }
  createDlg.saving = true;
  try {
    const resp = await request.post('/contracts/changes/create', { ...createDlg.form });
    if (resp.code === 200) { ElMessage.success('变更申请已提交'); createDlg.visible = false; load(); }
    else ElMessage.error(resp.msg || '提交失败');
  } finally { createDlg.saving = false; }
}

const detailDlg = reactive({ visible: false, row: null });
function openDetail(row) { detailDlg.row = row; detailDlg.visible = true; }

async function approve(row) {
  const resp = await request.post(`/contracts/changes/${row.id}/approve`);
  if (resp.code === 200) { ElMessage.success('审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
</script>

<style scoped>
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-green { background: #d1fae5; color: #065f46; }
.tag-red { background: #fee2e2; color: #991b1b; }
.tag-yellow { background: #fef3c7; color: #92400e; }
.info-item { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 12px; color: #909399; font-weight: 500; }
.info-value { font-size: 14px; color: #303133; font-weight: 600; }
.wf-step { display: inline-block; text-align: center; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; margin: 4px; font-size: 12px; min-width: 80px; vertical-align: middle; }
.wf-name { font-weight: bold; margin-bottom: 4px; }
.wf-time { color: #666; font-size: 11px; }
.wf-arrow { display: inline-block; color: #999; margin: 0 4px; }
.wf-done { background: #d1fae5; border-color: #10b981; }
.wf-pending { background: #f9fafb; border-color: #d1d5db; }
</style>
