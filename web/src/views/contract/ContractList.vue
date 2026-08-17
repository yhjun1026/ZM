<template>
  <div>
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>合同列表</strong>
          <el-button v-if="canCreate" type="primary" size="small" @click="createDlg.visible = true"><el-icon><Plus /></el-icon> 新建合同</el-button>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="合同编号" width="130" />
        <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="customer" label="客户" width="140" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="90" />
        <el-table-column label="金额(¥)" width="120" align="right">
          <template #default="{ row }">¥{{ (row.amount || 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span :class="`tag ${row.status === '执行中' ? 'tag-green' : row.status === '待审批' ? 'tag-yellow' : row.status === '已驳回' ? 'tag-red' : 'tag-blue'}`">{{ row.status }}</span>
          </template>
        </el-table-column>
        <el-table-column label="执行情况" width="90">
          <template #default="{ row }">
            <span :class="`tag ${row.execution_status === '已完成' ? 'tag-green' : row.execution_status === '执行中' ? 'tag-blue' : row.execution_status === '已暂停' ? 'tag-red' : 'tag-grey'}`">{{ row.execution_status || '未执行' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="详情" width="70">
          <template #default="{ row }">
            <el-button size="small" type="info" @click="openDetail(row)"><el-icon><Document /></el-icon></el-button>
          </template>
        </el-table-column>
        <el-table-column label="流程" width="130">
          <template #default="{ row }">
            <el-button size="small" @click="openWorkflow(row)"><el-icon><Share /></el-icon></el-button>
            <el-button size="small" type="info" @click="printNode(row)"><el-icon><Printer /></el-icon></el-button>
          </template>
        </el-table-column>
        <el-table-column v-if="canApprove" label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === '待审批'">
              <el-button size="small" type="primary" @click="approve(row)"><el-icon><Check /></el-icon></el-button>
              <el-button size="small" @click="reject(row)"><el-icon><Close /></el-icon></el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty>暂无合同</template>
      </el-table>
    </el-card>

    <!-- 新建合同 -->
    <el-dialog v-model="createDlg.visible" title="新建合同" width="580px">
      <el-form label-width="90px">
        <el-form-item label="合同名称"><el-input v-model="createDlg.form.name" placeholder="请输入合同名称" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="客户名称"><el-input v-model="createDlg.form.customer" placeholder="客户名称" /></el-form-item></el-col>
          <el-col :span="12">
            <el-form-item label="合同类型">
              <el-select v-model="createDlg.form.type" style="width:100%;">
                <el-option v-for="t in ['销售合同', '服务合同', '采购合同', '技术合同', '劳动合同', '其他']" :key="t" :label="t" :value="t" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="合同金额(¥)"><el-input v-model="createDlg.form.amount" type="number" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="签订日期"><el-date-picker v-model="createDlg.form.start_date" type="date" value-format="YYYY-MM-DD" style="width:100%;" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="到期日期"><el-date-picker v-model="createDlg.form.end_date" type="date" value-format="YYYY-MM-DD" style="width:100%;" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="归档位置"><el-input v-model="createDlg.form.archive_loc" placeholder="如：档案柜A-03" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="合同内容"><el-input v-model="createDlg.form.content" type="textarea" :rows="5" placeholder="请输入合同主要条款和内容..." /></el-form-item>
        <el-alert type="info" :closable="false">
          <template #title>合同管理流程：<strong>行政部负责人 → 财务负责人 → 销售总监 → 副总 → 总经理</strong></template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <!-- 审批流程 -->
    <el-dialog v-model="wfDlg.visible" title="审批流程详情" width="750px">
      <table v-if="wfDlg.row" class="wf-table">
        <tbody>
          <tr><th>合同名称</th><td>{{ wfDlg.row.name }}</td><th>客户</th><td>{{ wfDlg.row.customer }}</td></tr>
          <tr><th>金额</th><td>¥{{ (wfDlg.row.amount || 0).toLocaleString() }}</td><th>类型</th><td>{{ wfDlg.row.type }}</td></tr>
          <tr>
            <th>状态</th>
            <td><span :class="`tag ${wfDlg.row.status === '执行中' ? 'tag-green' : wfDlg.row.status === '待审批' ? 'tag-yellow' : 'tag-red'}`">{{ wfDlg.row.status }}</span></td>
            <th>创建人</th><td>{{ wfDlg.row.creator || '' }}</td>
          </tr>
        </tbody>
      </table>
      <h4 style="margin:0 0 12px;font-size:15px;">工作流程</h4>
      <div style="text-align:center;overflow-x:auto;padding:8px 0;">
        <template v-if="wfDlg.flow.length">
          <template v-for="(f, i) in wfDlg.flow" :key="i">
            <span class="wf-step" :class="f.done ? 'wf-done' : (i === 0 || wfDlg.flow.slice(0, i).every(s => s.done)) ? 'wf-current' : 'wf-pending'">
              <div class="wf-name">{{ f.step }}</div>
              <div style="font-size:11px;">{{ f.user || '—' }}</div>
              <div class="wf-time">{{ f.time || '—' }}</div>
            </span>
            <span v-if="i < wfDlg.flow.length - 1" class="wf-arrow">→</span>
          </template>
        </template>
        <span v-else style="color:#909399;">无流程数据</span>
      </div>
      <template #footer>
        <el-button @click="wfDlg.visible = false">关闭</el-button>
        <el-button type="primary" @click="printNode(wfDlg.row)"><el-icon><Printer /></el-icon> 打印流程</el-button>
      </template>
    </el-dialog>

    <OldContractDetail v-model="detailDlg.visible" :contract-id="detailDlg.id" @updated="load" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Document, Share, Printer, Check, Close } from '@element-plus/icons-vue';
import request from '../../api/request';
import { useAuthStore } from '../../stores/auth';
import OldContractDetail from './OldContractDetail.vue';
import { canCreateContract, canApproveUser, printContractNodeRecord } from './utils';

const auth = useAuthStore();
const canCreate = computed(() => canCreateContract(auth.user));
const canApprove = computed(() => canApproveUser(auth.user));

const rows = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const resp = await request.get('/contracts');
    if (resp.code !== 200) { ElMessage.error('加载失败'); return; }
    rows.value = resp.data || [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const detailDlg = reactive({ visible: false, id: '' });
function openDetail(row) { detailDlg.id = row.id; detailDlg.visible = true; }

const wfDlg = reactive({ visible: false, row: null, flow: [] });
function openWorkflow(row) { wfDlg.row = row; wfDlg.flow = row.flow || []; wfDlg.visible = true; }

function printNode(row) { printContractNodeRecord(row, auth.user?.name); }

const createDlg = reactive({
  visible: false, saving: false,
  form: { name: '', customer: '', type: '销售合同', amount: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', content: '', archive_loc: '' },
});
async function submitCreate() {
  const f = createDlg.form;
  if (!f.name) { ElMessage.warning('请输入合同名称'); return; }
  createDlg.saving = true;
  try {
    const resp = await request.post('/contracts', { ...f, amount: parseFloat(f.amount) || 0 });
    if (resp.code === 200) {
      ElMessage.success('合同已创建');
      createDlg.visible = false;
      createDlg.form = { name: '', customer: '', type: '销售合同', amount: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', content: '', archive_loc: '' };
      load();
    } else {
      ElMessage.error(resp.msg || '创建失败');
    }
  } finally { createDlg.saving = false; }
}

async function approve(row) {
  if (!canApprove.value) { ElMessage.warning('您无审批权限'); return; }
  const resp = await request.post(`/contracts/${row.id}/approve`);
  if (resp.code === 200) { ElMessage.success('审批通过'); load(); }
  else ElMessage.error(resp.msg || '操作失败');
}
async function reject(row) {
  if (!canApprove.value) { ElMessage.warning('您无审批权限'); return; }
  try { await ElMessageBox.confirm('确定驳回此合同？', '提示', { type: 'warning' }); } catch { return; }
  const resp = await request.post(`/contracts/${row.id}/reject`, { remark: '' });
  if (resp.code === 200) { ElMessage.success('已驳回'); load(); }
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
.wf-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.wf-table th, .wf-table td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; font-size: 14px; }
.wf-table th { background: #f5f7fa; width: 15%; }
.wf-step { display: inline-block; text-align: center; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; margin: 4px; font-size: 12px; min-width: 80px; vertical-align: middle; }
.wf-name { font-weight: bold; margin-bottom: 4px; }
.wf-time { color: #666; font-size: 11px; }
.wf-arrow { display: inline-block; color: #999; margin: 0 4px; }
.wf-done { background: #d1fae5; border-color: #10b981; }
.wf-current { background: #fef3c7; border-color: #f59e0b; }
.wf-pending { background: #f9fafb; border-color: #d1d5db; }
</style>
