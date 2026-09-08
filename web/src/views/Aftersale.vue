<template>
  <div class="aftersale">
    <div class="page-header">
      <h2>售后服务</h2>
      <p>客户投诉：登记 → 处理 → 关闭（结论含「暂停」联动经销商停合作）；客户拜访：计划登记 → 结果回填；服务任务：指派 → 进度跟进 → 完成</p>
    </div>

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

    <el-tabs v-model="tab" class="as-tabs">
      <!-- ============ 客户投诉 ============ -->
      <el-tab-pane label="客户投诉" name="complaints">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="cpFilter.status" placeholder="全部状态" style="width:130px" clearable @change="loadComplaints">
              <el-option v-for="s in options.complaint_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="cpFilter.q" placeholder="搜索投诉人/产品/内容/经销商" style="width:230px" clearable @change="loadComplaints" />
          </div>
          <el-button type="primary" @click="openComplaint()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>登记投诉
          </el-button>
        </div>
        <el-table :data="complaints" stripe size="small" v-loading="loading">
          <el-table-column label="编号" width="80"><template #default="{ row }">#{{ row.id }}</template></el-table-column>
          <el-table-column prop="distributor_name" label="被投诉经销商" width="160" show-overflow-tooltip />
          <el-table-column prop="complainant" label="投诉人" width="110" />
          <el-table-column prop="region" label="区域" width="100" />
          <el-table-column prop="product" label="涉及产品" width="150" show-overflow-tooltip />
          <el-table-column prop="description" label="投诉事实" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="csType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="penalty" label="处理结果" width="150" show-overflow-tooltip />
          <el-table-column label="登记时间" width="150"><template #default="{ row }">{{ (row.created_at || '').slice(0, 16) }}</template></el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" :disabled="row.status === '已处理'" @click="openHandle(row)">处理</el-button>
              <el-button size="small" type="danger" @click="removeComplaint(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无投诉记录，点击右上角「登记投诉」</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 客户拜访 ============ -->
      <el-tab-pane label="客户拜访" name="visits">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="vFilter.customer_id" placeholder="全部客户" style="width:190px" clearable filterable @change="loadVisits">
              <el-option v-for="c in options.customers" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-select v-model="vFilter.visit_type" placeholder="全部方式" style="width:130px" clearable @change="loadVisits">
              <el-option v-for="s in options.visit_types" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="vFilter.month" placeholder="月份 如 2026-09" style="width:140px" clearable @change="loadVisits" />
          </div>
          <el-button type="primary" @click="openVisit()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>登记拜访
          </el-button>
        </div>
        <el-table :data="visits" stripe size="small" v-loading="loading" max-height="500">
          <el-table-column label="拜访日期" width="110"><template #default="{ row }">{{ (row.visit_date || '').slice(0, 10) }}</template></el-table-column>
          <el-table-column prop="customer_name" label="客户" width="170" show-overflow-tooltip />
          <el-table-column prop="visitor_name" label="拜访人" width="100" />
          <el-table-column label="方式" width="100"><template #default="{ row }"><el-tag size="small">{{ row.visit_type }}</el-tag></template></el-table-column>
          <el-table-column prop="contact_name" label="拜访对象" width="100" />
          <el-table-column prop="purpose" label="拜访目的" min-width="160" show-overflow-tooltip />
          <el-table-column prop="result" label="拜访结果" min-width="160" show-overflow-tooltip />
          <el-table-column prop="next_plan" label="下一步计划" width="150" show-overflow-tooltip />
          <el-table-column label="费用(元)" width="90" align="right"><template #default="{ row }">{{ row.cost || 0 }}</template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }"><el-button size="small" type="primary" @click="openVisitResult(row)">回填</el-button></template>
          </el-table-column>
          <template #empty><span class="muted">暂无拜访记录，点击右上角「登记拜访」</span></template>
        </el-table>
      </el-tab-pane>

      <!-- ============ 服务任务 ============ -->
      <el-tab-pane label="服务任务" name="tasks">
        <div class="tab-toolbar">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <el-select v-model="tFilter.status" placeholder="全部状态" style="width:130px" clearable @change="loadTasks">
              <el-option v-for="s in options.task_status" :key="s" :label="s" :value="s" />
            </el-select>
            <el-select v-model="tFilter.assignee_id" placeholder="全部执行人" style="width:150px" clearable filterable @change="loadTasks">
              <el-option v-for="e in options.employees" :key="e.id" :label="e.name" :value="e.id" />
            </el-select>
            <el-checkbox v-model="tFilter.all" style="line-height:32px;" @change="loadTasks">含通用任务</el-checkbox>
          </div>
          <el-button type="primary" @click="openTask()">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新建任务
          </el-button>
        </div>
        <el-table :data="tasks" stripe size="small" v-loading="loading" max-height="500">
          <el-table-column prop="task_no" label="任务号" width="140" />
          <el-table-column prop="title" label="任务标题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="assignee_name" label="执行人" width="100" />
          <el-table-column prop="assigner_name" label="指派人" width="100" />
          <el-table-column label="优先级" width="90"><template #default="{ row }"><el-tag size="small" :type="prType(row.priority)">{{ row.priority }}</el-tag></template></el-table-column>
          <el-table-column label="截止日期" width="110"><template #default="{ row }">{{ row.due_date || '—' }}</template></el-table-column>
          <el-table-column label="进度" width="160">
            <template #default="{ row }"><el-progress :percentage="row.progress || 0" :stroke-width="12" /></template>
          </el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag size="small" :type="tsType(row.status)">{{ row.status }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openProgress(row)">进度</el-button>
              <el-button size="small" type="danger" @click="removeTask(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty><span class="muted">暂无服务任务，点击右上角「新建任务」指派</span></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 登记/处理投诉 -->
    <el-dialog v-model="cpDlg.visible" :title="cpDlg.id ? '处理投诉 #' + cpDlg.id : '登记客户投诉'" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="被投诉经销商" required>
          <el-select v-model="cpDlg.form.distributor_id" filterable :disabled="!!cpDlg.id" placeholder="选择经销商" style="width:100%">
            <el-option v-for="d in options.distributors" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="投诉人"><el-input v-model="cpDlg.form.complainant" placeholder="投诉人/单位" /></el-form-item>
        <el-form-item label="发生区域"><el-input v-model="cpDlg.form.region" /></el-form-item>
        <el-form-item label="涉及产品"><el-input v-model="cpDlg.form.product" /></el-form-item>
        <el-form-item label="投诉事实" required>
          <el-input v-model="cpDlg.form.description" type="textarea" :rows="3" :disabled="!!cpDlg.id" placeholder="窜货/质量/服务问题描述" />
        </el-form-item>
        <template v-if="cpDlg.id">
          <el-form-item label="处理状态" required>
            <el-select v-model="cpDlg.form.status" style="width:100%">
              <el-option v-for="s in options.complaint_status" :key="s" :label="s" :value="s" />
            </el-select>
          </el-form-item>
          <el-form-item label="处理结果" required>
            <el-input v-model="cpDlg.form.penalty" placeholder="如：警告 / 罚款5000元 / 暂停合作（含“暂停”将联动停用经销商）" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="cpDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="cpDlg.saving" @click="submitComplaint">提交</el-button>
      </template>
    </el-dialog>

    <!-- 登记/回填拜访 -->
    <el-dialog v-model="visitDlg.visible" :title="visitDlg.id ? '回填拜访结果' : '登记客户拜访'" width="600px">
      <el-form label-width="110px" size="small">
        <el-form-item label="客户" required>
          <el-select v-model="visitDlg.form.customer_id" filterable :disabled="!!visitDlg.id" placeholder="选择客户" style="width:100%" @change="loadContacts">
            <el-option v-for="c in options.customers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="拜访日期" required>
          <el-date-picker v-model="visitDlg.form.visit_date" type="date" value-format="YYYY-MM-DD" :disabled="!!visitDlg.id" style="width:100%" />
        </el-form-item>
        <el-form-item label="拜访方式">
          <el-select v-model="visitDlg.form.visit_type" style="width:100%">
            <el-option v-for="s in options.visit_types" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="拜访对象">
          <el-select v-model="visitDlg.form.contact_id" filterable clearable placeholder="选择联系人" style="width:100%">
            <el-option v-for="c in contacts" :key="c.id" :label="c.name + (c.title ? '（' + c.title + '）' : '')" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="拜访目的"><el-input v-model="visitDlg.form.purpose" /></el-form-item>
        <el-form-item label="沟通内容"><el-input v-model="visitDlg.form.content" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="拜访结果"><el-input v-model="visitDlg.form.result" type="textarea" :rows="2" placeholder="如：客户同意试用，待寄送样机" /></el-form-item>
        <el-form-item label="下一步计划"><el-input v-model="visitDlg.form.next_plan" /></el-form-item>
        <el-form-item label="费用(元)"><el-input-number v-model="visitDlg.form.cost" :min="0" :step="50" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visitDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="visitDlg.saving" @click="submitVisit">提交</el-button>
      </template>
    </el-dialog>

    <!-- 新建任务 -->
    <el-dialog v-model="taskDlg.visible" title="新建服务任务" width="520px">
      <el-form label-width="100px" size="small">
        <el-form-item label="任务标题" required><el-input v-model="taskDlg.form.title" placeholder="如：遂宁中心医院彩超装机后巡检" /></el-form-item>
        <el-form-item label="任务说明"><el-input v-model="taskDlg.form.descr" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="执行人" required>
          <el-select v-model="taskDlg.form.assignee_id" filterable style="width:100%">
            <el-option v-for="e in options.employees" :key="e.id" :label="e.name + '（' + (e.dept_name || '-') + '）'" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="taskDlg.form.priority" style="width:100%">
            <el-option v-for="p in options.priorities" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="截止日期">
          <el-date-picker v-model="taskDlg.form.due_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="taskDlg.saving" @click="submitTask">提交</el-button>
      </template>
    </el-dialog>

    <!-- 更新进度 -->
    <el-dialog v-model="progDlg.visible" :title="'任务进度 · ' + progDlg.title" width="420px">
      <el-form label-width="90px" size="small">
        <el-form-item label="完成进度"><el-input-number v-model="progDlg.progress" :min="0" :max="100" :step="10" style="width:100%" /></el-form-item>
        <el-form-item label="任务状态">
          <el-select v-model="progDlg.status" style="width:100%">
            <el-option v-for="s in options.task_status" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="progDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="progDlg.saving" @click="submitProgress">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Warning, CircleCheck, Place, TrendCharts, Plus } from '@element-plus/icons-vue';
import request from '../api/request';

const tab = ref('complaints');
const loading = ref(false);
const stats = ref(null);
const options = ref({ employees: [], customers: [], distributors: [], complaint_status: [], visit_types: [], task_status: [], priorities: [] });
const complaints = ref([]);
const visits = ref([]);
const tasks = ref([]);
const contacts = ref([]);

const cpFilter = reactive({ status: '', q: '' });
const vFilter = reactive({ customer_id: '', visit_type: '', month: '' });
const tFilter = reactive({ status: '', assignee_id: '', all: false });

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { title: '待处理投诉', value: s.complaints.pending, sub: `处理中 ${s.complaints.handling} 条`, icon: Warning, color: '#f59e0b' },
    { title: '已处理投诉', value: s.complaints.closed, sub: `本月新增 ${s.complaints.month} 条`, icon: CircleCheck, color: '#10b981' },
    { title: '本月拜访', value: s.visits.month, sub: `累计 ${s.visits.total} 次 · 费用 ${s.visits.cost} 元`, icon: Place, color: '#2563eb' },
    { title: '任务完成率', value: s.tasks.rate + '%', sub: `进行中 ${s.tasks.doing} · 逾期 ${s.tasks.overdue}`, icon: TrendCharts, color: '#8b5cf6' },
  ];
});

function csType(s) { return s === '已处理' ? 'success' : (s === '处理中' ? 'warning' : 'danger'); }
function tsType(s) { return s === '已完成' ? 'success' : (s === '进行中' ? 'primary' : 'info'); }
function prType(p) { return p === '高' ? 'danger' : (p === '中' ? 'warning' : 'info'); }

async function loadOptions() {
  const r = await request.get('/aftersale/options');
  if (r.code === 200) options.value = Object.assign({}, options.value, r.data || {});
}
async function loadStats() {
  const r = await request.get('/aftersale/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadComplaints() {
  loading.value = true;
  try {
    const params = {};
    ['status', 'q'].forEach((k) => { if (cpFilter[k]) params[k] = cpFilter[k]; });
    const r = await request.get('/aftersale/complaints', { params });
    complaints.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadVisits() {
  loading.value = true;
  try {
    const params = {};
    ['customer_id', 'visit_type', 'month'].forEach((k) => { if (vFilter[k]) params[k] = vFilter[k]; });
    const r = await request.get('/aftersale/visits', { params });
    visits.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadTasks() {
  loading.value = true;
  try {
    const params = {};
    if (tFilter.status) params.status = tFilter.status;
    if (tFilter.assignee_id) params.assignee_id = tFilter.assignee_id;
    if (tFilter.all) params.all = '1';
    const r = await request.get('/aftersale/tasks', { params });
    tasks.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
async function loadContacts(customerId) {
  contacts.value = [];
  if (!customerId) return;
  const r = await request.get(`/aftersale/customers/${customerId}/contacts`);
  if (r.code === 200) contacts.value = r.data || [];
}
onMounted(async () => {
  await loadOptions();
  await loadStats();
  await loadComplaints();
  await loadVisits();
  await loadTasks();
});

/* ---------- 投诉 ---------- */
const cpDlg = reactive({
  visible: false, saving: false, id: null,
  form: { distributor_id: null, complainant: '', region: '', product: '', description: '', status: '处理中', penalty: '' },
});
function openComplaint() {
  cpDlg.id = null;
  Object.assign(cpDlg.form, { distributor_id: null, complainant: '', region: '', product: '', description: '', status: '处理中', penalty: '' });
  cpDlg.visible = true;
}
function openHandle(row) {
  cpDlg.id = row.id;
  Object.assign(cpDlg.form, {
    distributor_id: row.distributor_id, complainant: row.complainant || '', region: row.region || '',
    product: row.product || '', description: row.description || '',
    status: row.status === '待处理' ? '处理中' : row.status, penalty: row.penalty || '',
  });
  cpDlg.visible = true;
}
async function submitComplaint() {
  const f = cpDlg.form;
  if (!f.distributor_id || !f.description) { ElMessage.warning('被投诉经销商与投诉事实必填'); return; }
  cpDlg.saving = true;
  const r = cpDlg.id
    ? await request.put(`/aftersale/complaints/${cpDlg.id}`, { status: f.status, penalty: f.penalty })
    : await request.post('/aftersale/complaints', f);
  cpDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); cpDlg.visible = false; loadComplaints(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}
async function removeComplaint(row) {
  await ElMessageBox.confirm(`确认删除投诉 #${row.id}？`, '删除确认', { type: 'warning' });
  const r = await request.delete(`/aftersale/complaints/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadComplaints(); loadStats(); }
  else ElMessage.error(r.msg || '删除失败');
}

/* ---------- 拜访 ---------- */
const visitDlg = reactive({
  visible: false, saving: false, id: null,
  form: { customer_id: '', visit_date: '', visit_type: '常规拜访', contact_id: null, purpose: '', content: '', result: '', next_plan: '', cost: 0 },
});
function openVisit() {
  visitDlg.id = null;
  Object.assign(visitDlg.form, { customer_id: '', visit_date: '', visit_type: '常规拜访', contact_id: null, purpose: '', content: '', result: '', next_plan: '', cost: 0 });
  contacts.value = [];
  visitDlg.visible = true;
}
async function openVisitResult(row) {
  visitDlg.id = row.id;
  Object.assign(visitDlg.form, {
    customer_id: row.customer_id, visit_date: row.visit_date, visit_type: row.visit_type,
    contact_id: row.contact_id, purpose: row.purpose || '', content: row.content || '',
    result: row.result || '', next_plan: row.next_plan || '', cost: row.cost || 0,
  });
  visitDlg.visible = true;
  await loadContacts(row.customer_id);
}
async function submitVisit() {
  const f = visitDlg.form;
  if (!f.customer_id || !f.visit_date) { ElMessage.warning('客户与拜访日期必填'); return; }
  visitDlg.saving = true;
  const r = visitDlg.id
    ? await request.put(`/aftersale/visits/${visitDlg.id}`, f)
    : await request.post('/aftersale/visits', f);
  visitDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); visitDlg.visible = false; loadVisits(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 任务 ---------- */
const taskDlg = reactive({
  visible: false, saving: false,
  form: { title: '', descr: '', assignee_id: null, priority: '普通', due_date: '' },
});
function openTask() {
  Object.assign(taskDlg.form, { title: '', descr: '', assignee_id: null, priority: '普通', due_date: '' });
  taskDlg.visible = true;
}
async function submitTask() {
  const f = taskDlg.form;
  if (!f.title || !f.assignee_id) { ElMessage.warning('任务标题与执行人必填'); return; }
  taskDlg.saving = true;
  const r = await request.post('/aftersale/tasks', f);
  taskDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已创建'); taskDlg.visible = false; loadTasks(); loadStats(); }
  else ElMessage.error(r.msg || '创建失败');
}
async function removeTask(row) {
  await ElMessageBox.confirm(`确认删除任务 ${row.task_no}？`, '删除确认', { type: 'warning' });
  const r = await request.delete(`/aftersale/tasks/${row.id}`);
  if (r.code === 200) { ElMessage.success('已删除'); loadTasks(); loadStats(); }
  else ElMessage.error(r.msg || '删除失败');
}
const progDlg = reactive({ visible: false, saving: false, id: null, title: '', progress: 0, status: '进行中' });
function openProgress(row) {
  progDlg.id = row.id;
  progDlg.title = row.title;
  progDlg.progress = row.progress || 0;
  progDlg.status = row.status || '进行中';
  progDlg.visible = true;
}
async function submitProgress() {
  progDlg.saving = true;
  const r = await request.put(`/aftersale/tasks/${progDlg.id}/progress`, { progress: progDlg.progress, status: progDlg.status });
  progDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已更新'); progDlg.visible = false; loadTasks(); loadStats(); }
  else ElMessage.error(r.msg || '更新失败');
}
</script>

<style scoped>
.aftersale { padding: 20px; }
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
.el-form-item { margin-bottom: 12px; }
</style>
