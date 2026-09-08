<template>
  <div class="message">
    <div class="page-header">
      <h2>消息中心</h2>
      <p>审批/合同/任务等业务消息统一收件箱 · 按业务分类（biz_type）归类 · 支持批量已读与清理</p>
    </div>

    <!-- KPI -->
    <div class="kpi-grid" v-if="stats">
      <div class="kpi-card" v-for="k in kpis" :key="k.title">
        <div class="kpi-icon" :style="{ background: k.color + '20' }">
          <el-icon :size="18" :color="k.color"><component :is="k.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-title">{{ k.title }}</div>
          <div class="kpi-value">{{ k.value }}</div>
          <div class="kpi-sub">{{ k.sub }}</div>
        </div>
      </div>
    </div>

    <div class="tab-toolbar">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <el-select v-model="filter.type" placeholder="全部类型" style="width:120px" clearable @change="loadList">
          <el-option v-for="t in types.msg_types" :key="t" :label="t" :value="t" />
          <el-option label="仅未读" value="未读" />
        </el-select>
        <el-select v-model="filter.biz_type" placeholder="全部业务" style="width:140px" clearable @change="loadList">
          <el-option v-for="t in types.biz_types" :key="t" :label="t" :value="t" />
        </el-select>
        <el-input v-model="filter.keyword" placeholder="搜索标题/内容" style="width:200px" clearable @change="loadList" />
      </div>
      <div style="display:flex;gap:8px;">
        <el-button size="small" :disabled="!selection.length" @click="readBatch">批量已读</el-button>
        <el-button size="small" @click="readAll">
          <el-icon style="margin-right:4px"><CircleCheck /></el-icon>全部已读
        </el-button>
        <el-button type="primary" size="small" @click="openSend">
          <el-icon style="margin-right:4px"><Promotion /></el-icon>发站内信
        </el-button>
      </div>
    </div>

    <el-table :data="rows" stripe size="small" v-loading="loading" @selection-change="(v) => (selection = v)">
      <el-table-column type="selection" width="45" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_read ? 'info' : 'danger'" size="small">{{ row.is_read ? '已读' : '未读' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }"><el-tag :type="msgType(row.msg_type)" size="small">{{ row.msg_type }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
      <el-table-column label="业务分类" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.biz_type" type="warning" size="small" effect="plain">{{ row.biz_type }}</el-tag>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="from_name" label="来源" width="100" />
      <el-table-column label="时间" width="150">
        <template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" :disabled="!!row.is_read" @click="markRead(row)">已读</el-button>
          <el-button size="small" type="danger" @click="delMsg(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无消息</span></template>
    </el-table>

    <div class="pager">
      <el-pagination
        background layout="total, prev, pager, next"
        :total="total" :page-size="pageSize" :current-page="page"
        @current-change="(p) => { page = p; loadList(); }" />
    </div>

    <!-- 发站内信 -->
    <el-dialog v-model="sendDlg.visible" title="发起站内信" width="520px">
      <el-form label-width="80px" size="small">
        <el-form-item label="收件人" required>
          <el-select v-model="sendDlg.form.to_emp_id" filterable multiple style="width:100%" placeholder="可多选">
            <el-option v-for="e in employees" :key="e.id" :label="e.name + '（' + (e.emp_no || e.id) + '）'" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务分类">
          <el-select v-model="sendDlg.form.biz_type" clearable style="width:100%">
            <el-option v-for="t in types.biz_types" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required><el-input v-model="sendDlg.form.title" placeholder="消息标题" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="sendDlg.form.content" type="textarea" :rows="4" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sendDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="sendDlg.saving" @click="submitSend">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Bell, Message, ChatDotRound, CircleCheck, Promotion } from '@element-plus/icons-vue';
import request from '../api/request';

const rows = ref([]);
const stats = ref(null);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const selection = ref([]);
const employees = ref([]);
const types = reactive({ msg_types: [], biz_types: [], clean_types: [] });
const filter = reactive({ type: '', biz_type: '', keyword: '' });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const topBiz = (s.byBiz && s.byBiz[0]) || null;
  return [
    { title: '消息总数', value: s.total, sub: `已读 ${s.read} 条`, icon: Message, color: '#2563eb' },
    { title: '未读消息', value: s.unread, sub: '需处理', icon: Bell, color: '#f59e0b' },
    { title: '业务分类数', value: (s.byBiz || []).length, sub: topBiz ? `最多：${topBiz.biz_type}（${topBiz.total}）` : '暂无', icon: ChatDotRound, color: '#8b5cf6' },
    { title: '消息类型数', value: (s.byType || []).length, sub: '待办/系统/站内信等', icon: CircleCheck, color: '#10b981' },
  ];
});

function msgType(t) {
  const map = { 待办: 'warning', 已办: 'success', 抄送: 'info', 系统: 'danger', 站内信: 'primary' };
  return map[t] || 'info';
}

async function loadTypes() {
  const r = await request.get('/message/types');
  if (r.code === 200) Object.assign(types, r.data || {});
}
async function loadStats() {
  const r = await request.get('/message/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    ['type', 'biz_type', 'keyword'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/message', { params });
    if (r.code === 200) {
      rows.value = (r.data && r.data.rows) || [];
      total.value = (r.data && r.data.total) || 0;
    } else { rows.value = []; total.value = 0; }
  } finally { loading.value = false; }
}
async function loadEmployees() {
  const r = await request.get('/collab/options');
  if (r.code === 200) employees.value = (r.data && r.data.employees) || [];
}
onMounted(async () => {
  await loadTypes();
  await loadStats();
  await loadList();
  await loadEmployees();
});

async function markRead(row) {
  const r = await request.put(`/message/${row.id}/read`);
  if (r.code === 200) { ElMessage.success('已标记已读'); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function readAll() {
  const r = await request.put('/message/read-all');
  if (r.code === 200) { ElMessage.success(r.msg || '已全部标记已读'); loadList(); loadStats(); }
}
async function readBatch() {
  if (!selection.value.length) return;
  const ids = selection.value.map((x) => x.id);
  const r = await request.post('/message/read-batch', { ids });
  if (r.code === 200) { ElMessage.success(r.msg || '已标记已读'); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '操作失败');
}
async function delMsg(row) {
  await ElMessageBox.confirm('确认删除该消息？', '提示', { type: 'warning' }).catch(() => null);
  const r = await request.delete(`/message/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadList(); loadStats(); }
  else ElMessage.error(r.msg || '删除失败');
}

/* ---------- 发站内信 ---------- */
const sendDlg = reactive({
  visible: false, saving: false,
  form: { to_emp_id: [], biz_type: '站内信', title: '', content: '' },
});
function openSend() {
  Object.assign(sendDlg.form, { to_emp_id: [], biz_type: '站内信', title: '', content: '' });
  sendDlg.visible = true;
}
async function submitSend() {
  if (!sendDlg.form.to_emp_id.length || !sendDlg.form.title) { ElMessage.warning('收件人与标题必填'); return; }
  sendDlg.saving = true;
  const r = await request.post('/message', Object.assign({}, sendDlg.form, { to_emp_id: sendDlg.form.to_emp_id.join(',') }));
  sendDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已发送'); sendDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '发送失败');
}
</script>

<style scoped>
.message { padding: 20px; }
.muted { color: #909399; }
.page-header { margin-bottom: 18px; }
.page-header h2 { margin: 0 0 4px; font-size: 20px; }
.page-header p { margin: 0; color: #909399; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi-card { background: var(--el-bg-color); border: 1px solid var(--el-border-color-light); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.kpi-icon { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kpi-title { font-size: 12px; color: #909399; }
.kpi-value { font-size: 18px; font-weight: 700; }
.kpi-sub { font-size: 11px; color: #909399; }
.tab-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.el-form-item { margin-bottom: 12px; }
</style>
