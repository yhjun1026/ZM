<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>合同终止/解除</strong>
          <el-button v-if="canTerm && contracts.length" type="primary" size="small" @click="createDlg.visible = true"><el-icon><Plus /></el-icon> 终止/解除申请</el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="编号" width="130" />
        <el-table-column prop="contract_name" label="合同名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ row.term_type || '终止' }}</template>
        </el-table-column>
        <el-table-column label="申请人" width="100">
          <template #default="{ row }">{{ row.applicant || '—' }}</template>
        </el-table-column>
        <el-table-column label="生效日期" width="110">
          <template #default="{ row }">{{ row.effective_date || '—' }}</template>
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
        <template #empty>暂无终止/解除记录</template>
      </el-table>
    </el-card>

    <!-- 终止/解除申请 -->
    <el-dialog v-model="createDlg.visible" title="合同终止/解除申请" width="560px">
      <el-form label-width="90px">
        <el-form-item label="选择合同">
          <el-select v-model="createDlg.form.contract_id" style="width:100%;">
            <el-option v-for="c in contracts" :key="c.id" :label="`${c.id} - ${c.name}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="终止类型">
              <el-select v-model="createDlg.form.term_type" style="width:100%;">
                <el-option label="终止" value="终止" />
                <el-option label="解除" value="解除" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12"><el-form-item label="生效日期"><el-date-picker v-model="createDlg.form.effective_date" type="date" value-format="YYYY-MM-DD" style="width:100%;" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="结算金额(¥)"><el-input v-model="createDlg.form.settle_amount" type="number" /></el-form-item>
        <el-form-item label="结算说明"><el-input v-model="createDlg.form.settle_desc" type="textarea" :rows="2" placeholder="结算情况说明..." /></el-form-item>
        <el-form-item label="终止/解除原因"><el-input v-model="createDlg.form.reason" type="textarea" :rows="3" placeholder="详细说明原因..." /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-dialog v-model="detailDlg.visible" title="终止/解除详情" width="600px">
      <template v-if="detailDlg.row">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div class="info-item"><span class="info-label">编号</span><span class="info-value">{{ detailDlg.row.id }}</span></div>
          <div class="info-item"><span class="info-label">合同名称</span><span class="info-value">{{ detailDlg.row.contract_name }}</span></div>
          <div class="info-item"><span class="info-label">类型</span><span class="info-value">{{ detailDlg.row.term_type || '终止' }}</span></div>
          <div class="info-item"><span class="info-label">申请人</span><span class="info-value">{{ detailDlg.row.applicant || '—' }}</span></div>
          <div class="info-item"><span class="info-label">生效日期</span><span class="info-value">{{ detailDlg.row.effective_date || '—' }}</span></div>
          <div class="info-item"><span class="info-label">结算金额</span><span class="info-value">¥{{ (detailDlg.row.settle_amount || 0).toLocaleString() }}</span></div>
        </div>
        <div class="info-item" style="margin-bottom:12px;"><span class="info-label">结算说明</span><span class="info-value">{{ detailDlg.row.settle_desc || '—' }}</span></div>
        <div class="info-item" style="margin-bottom:16px;"><span class="info-label">原因</span><span class="info-value">{{ detailDlg.row.reason || '—' }}</span></div>
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
const canTerm = computed(() => canCreateContract(auth.user) || auth.user?.role === '超级管理员' || auth.user?.role === '总经理');

const rows = ref([]);
const contracts = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const [listResp, conResp] = await Promise.all([
      request.get('/contracts/terminations/list'),
      request.get('/contracts', { params: { status: '执行中' } }),
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
  form: { contract_id: '', term_type: '终止', effective_date: new Date().toISOString().slice(0, 10), settle_amount: 0, settle_desc: '', reason: '' },
});
async function submitCreate() {
  const f = createDlg.form;
  if (!f.contract_id) { ElMessage.warning('请选择合同'); return; }
  createDlg.saving = true;
  try {
    const resp = await request.post('/contracts/terminations/create', { ...f, settle_amount: parseFloat(f.settle_amount) || 0 });
    if (resp.code === 200) { ElMessage.success('终止/解除申请已提交'); createDlg.visible = false; load(); }
    else ElMessage.error(resp.msg || '提交失败');
  } finally { createDlg.saving = false; }
}

const detailDlg = reactive({ visible: false, row: null });
function openDetail(row) { detailDlg.row = row; detailDlg.visible = true; }

async function approve(row) {
  const resp = await request.post(`/contracts/terminations/${row.id}/approve`);
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
