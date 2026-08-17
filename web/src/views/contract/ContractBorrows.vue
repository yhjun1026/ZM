<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>合同借阅</strong>
          <el-button type="primary" size="small" @click="createDlg.visible = true"><el-icon><Plus /></el-icon> 借阅申请</el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="编号" width="130" />
        <el-table-column prop="contract_name" label="合同名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="借阅人" width="100">
          <template #default="{ row }">{{ row.borrower || '—' }}</template>
        </el-table-column>
        <el-table-column label="借阅日期" width="110">
          <template #default="{ row }">{{ row.borrow_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="预计归还" width="110">
          <template #default="{ row }">{{ row.expected_return || '—' }}</template>
        </el-table-column>
        <el-table-column label="实际归还" width="110">
          <template #default="{ row }">{{ row.actual_return || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :class="`tag ${row.status === '已批准' ? 'tag-green' : row.status === '待审批' ? 'tag-yellow' : row.status === '已归还' ? 'tag-blue' : 'tag-grey'}`">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="openDetail(row)"><el-icon><View /></el-icon></el-button>
            <el-button v-if="row.status === '待审批'" size="small" type="primary" @click="approve(row)"><el-icon><Check /></el-icon></el-button>
            <el-button v-if="row.status === '已批准'" size="small" type="success" @click="returnBorrow(row)"><el-icon><RefreshLeft /></el-icon> 归还</el-button>
          </template>
        </el-table-column>
        <template #empty>暂无借阅记录</template>
      </el-table>
    </el-card>

    <!-- 借阅申请 -->
    <el-dialog v-model="createDlg.visible" title="合同借阅申请" width="520px">
      <el-form label-width="100px">
        <el-form-item label="选择合同">
          <el-select v-model="createDlg.form.contract_id" style="width:100%;">
            <el-option v-for="c in contracts" :key="c.id" :label="`${c.id} - ${c.name}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="预计归还日期">
          <el-date-picker v-model="createDlg.form.expected_return" type="date" value-format="YYYY-MM-DD" style="width:100%;" />
        </el-form-item>
        <el-form-item label="借阅用途">
          <el-input v-model="createDlg.form.purpose" type="textarea" :rows="3" placeholder="说明借阅用途..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <!-- 借阅详情 -->
    <el-dialog v-model="detailDlg.visible" title="借阅详情" width="560px">
      <template v-if="detailDlg.row">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div class="info-item"><span class="info-label">编号</span><span class="info-value">{{ detailDlg.row.id }}</span></div>
          <div class="info-item"><span class="info-label">合同名称</span><span class="info-value">{{ detailDlg.row.contract_name }}</span></div>
          <div class="info-item"><span class="info-label">借阅人</span><span class="info-value">{{ detailDlg.row.borrower || '—' }}</span></div>
          <div class="info-item"><span class="info-label">部门</span><span class="info-value">{{ detailDlg.row.borrower_dept || '—' }}</span></div>
          <div class="info-item"><span class="info-label">借阅日期</span><span class="info-value">{{ detailDlg.row.borrow_date || '—' }}</span></div>
          <div class="info-item"><span class="info-label">预计归还</span><span class="info-value">{{ detailDlg.row.expected_return || '—' }}</span></div>
          <div class="info-item"><span class="info-label">实际归还</span><span class="info-value">{{ detailDlg.row.actual_return || '—' }}</span></div>
          <div class="info-item"><span class="info-label">状态</span><span class="info-value">{{ detailDlg.row.status }}</span></div>
        </div>
        <div class="info-item" style="margin-bottom:16px;"><span class="info-label">借阅用途</span><span class="info-value">{{ detailDlg.row.purpose || '—' }}</span></div>
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
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, View, Check, RefreshLeft } from '@element-plus/icons-vue';
import request from '../../api/request';

const rows = ref([]);
const contracts = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const [listResp, conResp] = await Promise.all([
      request.get('/contracts/borrows/list'),
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
  form: { contract_id: '', expected_return: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), purpose: '' },
});
async function submitCreate() {
  if (!createDlg.form.contract_id) { ElMessage.warning('请选择合同'); return; }
  createDlg.saving = true;
  try {
    const resp = await request.post('/contracts/borrows/create', { ...createDlg.form });
    if (resp.code === 200) { ElMessage.success('借阅申请已提交'); createDlg.visible = false; load(); }
    else ElMessage.error(resp.msg || '提交失败');
  } finally { createDlg.saving = false; }
}

const detailDlg = reactive({ visible: false, row: null });
function openDetail(row) { detailDlg.row = row; detailDlg.visible = true; }

async function approve(row) {
  const resp = await request.post(`/contracts/borrows/${row.id}/approve`);
  if (resp.code === 200) { ElMessage.success('审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function returnBorrow(row) {
  try { await ElMessageBox.confirm('确认归还此合同？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/contracts/borrows/${row.id}/return`);
  if (resp.code === 200) { ElMessage.success('合同已归还'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
</script>

<style scoped>
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-green { background: #d1fae5; color: #065f46; }
.tag-yellow { background: #fef3c7; color: #92400e; }
.tag-blue { background: #dbeafe; color: #1e40af; }
.tag-grey { background: #f1f5f9; color: #606266; }
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
