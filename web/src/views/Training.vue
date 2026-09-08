<template>
  <div class="training">
    <div class="page-header">
      <h2>员工培训</h2>
      <p>归口部门发起 → 行政人事部审核 → 副总终审 → 组织执行（报名/签到） → 结果登记（附件留存） → 培训评价</p>
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

    <!-- 工具栏 -->
    <div class="tab-toolbar">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <el-select v-model="filter.stage" placeholder="全部阶段" style="width:120px" clearable @change="loadList">
          <el-option v-for="s in stages" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select v-model="filter.category" placeholder="全部类别" style="width:170px" clearable @change="loadList">
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="filter.owner_role" placeholder="全部归口" style="width:140px" clearable @change="loadList">
          <el-option v-for="o in ownerRoles" :key="o.role" :label="o.dept" :value="o.role" />
        </el-select>
        <el-select v-model="filter.status" placeholder="全部状态" style="width:120px" clearable @change="loadList">
          <el-option v-for="s in statuses" :key="s" :label="s" :value="s" />
        </el-select>
        <el-input v-model="filter.q" placeholder="搜索主题/讲师/参训对象" style="width:220px" clearable @change="loadList" />
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon style="margin-right:4px"><Plus /></el-icon>发起培训计划
      </el-button>
    </div>

    <!-- 列表 -->
    <el-table :data="rows" stripe size="small" v-loading="loading">
      <el-table-column prop="plan_no" label="计划编号" width="160" />
      <el-table-column prop="title" label="培训主题" min-width="180" show-overflow-tooltip />
      <el-table-column prop="category" label="类别" width="150" show-overflow-tooltip />
      <el-table-column prop="owner_dept" label="归口部门" width="120" />
      <el-table-column prop="stage" label="阶段" width="70" />
      <el-table-column prop="trainer" label="讲师" width="100" />
      <el-table-column label="计划日期" width="120">
        <template #default="{ row }">{{ row.plan_date || '—' }}</template>
      </el-table-column>
      <el-table-column prop="location" label="地点" width="120" show-overflow-tooltip />
      <el-table-column label="预算(万)" width="90" align="right">
        <template #default="{ row }">{{ row.budget }}</template>
      </el-table-column>
      <el-table-column label="报名/签到" width="100" align="center">
        <template #default="{ row }">{{ row.signup_count }} / {{ row.signin_count }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="290" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" v-if="row.status === '待审批'" @click="openApprove(row)">审批</el-button>
          <el-button size="small" v-if="row.status === '已驳回'" @click="openEdit(row)">修正重提</el-button>
          <el-button size="small" v-if="row.status === '已通过' || row.status === '已执行'" @click="openResult(row)">结果</el-button>
          <el-button size="small" @click="openRoster(row)">报名/签到</el-button>
          <el-button size="small" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
      <template #empty><span class="muted">暂无培训计划，点击右上角「发起培训计划」创建</span></template>
    </el-table>

    <!-- 发起培训 -->
    <el-dialog v-model="createDlg.visible" title="发起培训计划" width="580px">
      <el-form label-width="110px" size="small">
        <el-form-item label="培训主题" required><el-input v-model="createDlg.form.title" placeholder="如：医疗器械法规与不良事件上报" /></el-form-item>
        <el-form-item label="培训类别" required>
          <el-select v-model="createDlg.form.category" style="width:100%">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="归口部门">
          <el-select v-model="createDlg.form.owner_role" style="width:100%" :disabled="!createDlg.canPick">
            <el-option v-for="o in ownerRoles" :key="o.role" :label="o.dept" :value="o.role" />
          </el-select>
        </el-form-item>
        <el-form-item label="培训阶段">
          <el-select v-model="createDlg.form.stage" style="width:100%">
            <el-option v-for="s in stages" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划日期">
          <el-date-picker v-model="createDlg.form.plan_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="讲师"><el-input v-model="createDlg.form.trainer" /></el-form-item>
        <el-form-item label="参训对象"><el-input v-model="createDlg.form.target" placeholder="如：全体销售 / 质量部全员" /></el-form-item>
        <el-form-item label="时长"><el-input v-model="createDlg.form.duration" placeholder="如：2 小时" /></el-form-item>
        <el-form-item label="地点"><el-input v-model="createDlg.form.location" /></el-form-item>
        <el-form-item label="预算(万)">
          <el-input-number v-model="createDlg.form.budget" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="内容大纲">
          <el-input v-model="createDlg.form.content" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:4px 0 0;">
        提交后进入审批：行政人事部发起 → 副总终审；其余部门发起 → 行政人事部审核 → 副总终审。通过后方可执行。
      </p>
      <template #footer>
        <el-button @click="createDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="createDlg.saving" @click="submitCreate">提交审批</el-button>
      </template>
    </el-dialog>

    <!-- 修正重提 -->
    <el-dialog v-model="editDlg.visible" title="修正培训计划（将重新提交审批）" width="580px">
      <el-form label-width="110px" size="small">
        <el-form-item label="培训主题"><el-input v-model="editDlg.form.title" /></el-form-item>
        <el-form-item label="培训类别">
          <el-select v-model="editDlg.form.category" style="width:100%">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="培训阶段">
          <el-select v-model="editDlg.form.stage" style="width:100%">
            <el-option v-for="s in stages" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划日期">
          <el-date-picker v-model="editDlg.form.plan_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="讲师"><el-input v-model="editDlg.form.trainer" /></el-form-item>
        <el-form-item label="参训对象"><el-input v-model="editDlg.form.target" /></el-form-item>
        <el-form-item label="时长"><el-input v-model="editDlg.form.duration" /></el-form-item>
        <el-form-item label="地点"><el-input v-model="editDlg.form.location" /></el-form-item>
        <el-form-item label="预算(万)">
          <el-input-number v-model="editDlg.form.budget" :min="0" :precision="2" style="width:100%" />
        </el-form-item>
        <el-form-item label="内容大纲"><el-input v-model="editDlg.form.content" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="editDlg.saving" @click="submitEdit">修正并重提</el-button>
      </template>
    </el-dialog>

    <!-- 审批 -->
    <el-dialog v-model="apprDlg.visible" title="培训审批（副总终审）" width="440px">
      <p class="muted" style="margin-bottom:12px;">
        {{ apprDlg.title }} · 归口 {{ apprDlg.dept }} · 预算 {{ apprDlg.budget }} 万
      </p>
      <el-form-item label="审批意见">
        <el-input v-model="apprDlg.comment" type="textarea" :rows="2" placeholder="选填" />
      </el-form-item>
      <template #footer>
        <el-button @click="submitApprove('驳回')">驳回</el-button>
        <el-button type="primary" :loading="apprDlg.saving" @click="submitApprove('通过')">通过</el-button>
      </template>
    </el-dialog>

    <!-- 结果登记 -->
    <el-dialog v-model="resDlg.visible" :title="'培训结果登记 · ' + resDlg.planNo" width="560px">
      <el-form label-width="110px" size="small">
        <el-form-item label="执行日期">
          <el-date-picker v-model="resDlg.form.exec_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="结果说明">
          <el-input v-model="resDlg.form.result_note" type="textarea" :rows="3" placeholder="出勤率/考核情况/参训人数" />
        </el-form-item>
        <el-form-item label="结果附件">
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.png" @change="onPickResult" />
          <span class="muted" style="font-size:12px;margin-left:8px;">仅 PDF / Word / 图片</span>
        </el-form-item>
      </el-form>
      <p class="muted" style="font-size:12px;margin:4px 0 8px;" v-if="resDlg.fileName">已选附件：{{ resDlg.fileName }}</p>
      <el-table :data="resDlg.attachments" stripe size="small" max-height="200">
        <el-table-column prop="file_name" label="附件" min-width="200" show-overflow-tooltip />
        <el-table-column label="上传时间" width="160">
          <template #default="{ row }">{{ (row.uploaded_at || '').slice(0, 16) }}</template>
        </el-table-column>
        <template #empty><span class="muted">暂无结果附件</span></template>
      </el-table>
      <template #footer>
        <el-button @click="resDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="resDlg.saving" @click="submitResult">提交结果</el-button>
      </template>
    </el-dialog>

    <!-- 报名 / 签到 / 评价 -->
    <el-dialog v-model="rosterDlg.visible" :title="'报名与签到 · ' + rosterDlg.planNo" width="680px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <el-input v-model="rosterDlg.name" placeholder="姓名（默认当前用户）" style="width:200px" />
        <el-button size="small" type="primary" @click="doSignup">报名</el-button>
        <el-button size="small" type="success" @click="doSignin">签到</el-button>
        <span class="muted" style="font-size:12px;">签到仅在培训审批通过/已执行后开放</span>
      </div>
      <el-table :data="rosterDlg.signups" stripe size="small" max-height="200">
        <el-table-column prop="emp_name" label="报名人" width="120" />
        <el-table-column prop="dept" label="部门" width="140" />
        <el-table-column label="报名时间" width="170">
          <template #default="{ row }">{{ (row.signed_at || '').slice(0, 16) }}</template>
        </el-table-column>
        <el-table-column label="是否已签到" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="signedIn(row) ? 'success' : 'info'">{{ signedIn(row) ? '已签到' : '未签到' }}</el-tag>
          </template>
        </el-table-column>
        <template #empty><span class="muted">暂无报名人员</span></template>
      </el-table>
      <div style="margin-top:14px;display:flex;gap:8px;align-items:center;">
        <span class="muted" style="font-size:13px;">培训评价</span>
        <el-input v-model="rosterDlg.eva.name" placeholder="被评价人姓名" style="width:160px" />
        <el-input-number v-model="rosterDlg.eva.score" :min="0" :max="100" style="width:130px" />
        <el-button size="small" type="primary" :loading="rosterDlg.evaSaving" @click="submitEval">登记评价</el-button>
      </div>
      <el-table :data="rosterDlg.signins" stripe size="small" max-height="160" style="margin-top:10px;">
        <el-table-column prop="emp_name" label="签到人" width="120" />
        <el-table-column prop="dept" label="部门" width="140" />
        <el-table-column label="签到时间" width="170">
          <template #default="{ row }">{{ (row.signed_at || '').slice(0, 16) }}</template>
        </el-table-column>
        <template #empty><span class="muted">暂无签到记录</span></template>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { ReadingLamp, Clock, CircleCheck, Check, Wallet, Plus } from '@element-plus/icons-vue';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const rows = ref([]);
const stats = ref(null);
const loading = ref(false);
const filter = reactive({ stage: '', category: '', owner_role: '', status: '', q: '' });
const categories = ref([]);
const stages = ref([]);
const ownerRoles = ref([]);
const statuses = ref([]);

const kpis = computed(() => {
  const s = stats.value;
  if (!s) return [];
  const n = (arr, v) => ((arr || []).find((x) => x.status === v) || {}).n || 0;
  return [
    { title: '培训计划', value: s.total, sub: `预算合计 ${s.budget} 万`, icon: ReadingLamp, color: '#2563eb' },
    { title: '待审批', value: n(s.byStatus, '待审批'), sub: '审批终点：公司副总', icon: Clock, color: '#f59e0b' },
    { title: '已通过', value: n(s.byStatus, '已通过'), sub: '可组织执行', icon: CircleCheck, color: '#10b981' },
    { title: '已执行', value: n(s.byStatus, '已执行'), sub: `结果附件留档备查`, icon: Check, color: '#8b5cf6' },
    { title: '报名/签到', value: `${s.signup}/${s.signin}`, sub: '人次统计', icon: Wallet, color: '#ef4444' },
  ];
});
function statusType(s) {
  const map = { 待审批: 'warning', 已通过: 'success', 已执行: 'primary', 已驳回: 'danger' };
  return map[s] || 'info';
}

async function loadMeta() {
  const r = await request.get('/training/meta');
  if (r.code === 200) {
    categories.value = r.data.categories || [];
    stages.value = r.data.stages || [];
    ownerRoles.value = r.data.owner_roles || [];
    statuses.value = r.data.statuses || [];
  }
}
async function loadStats() {
  const r = await request.get('/training/stats');
  if (r.code === 200) stats.value = r.data;
}
async function loadList() {
  loading.value = true;
  try {
    const params = {};
    ['stage', 'category', 'owner_role', 'status', 'q'].forEach((k) => { if (filter[k]) params[k] = filter[k]; });
    const r = await request.get('/training', { params });
    rows.value = r.code === 200 ? r.data || [] : [];
  } finally { loading.value = false; }
}
onMounted(async () => { await loadMeta(); await loadStats(); await loadList(); });

/* ---------- 发起 ---------- */
const createDlg = reactive({
  visible: false, saving: false, canPick: false,
  form: { title: '', category: '', owner_role: '', stage: '月', plan_date: '', trainer: '', target: '', duration: '', location: '', budget: 0, content: '' },
});
async function openCreate() {
  // 归口部门固定为当前用户所在部门；管理层（总经理/副总/超管）可指定
  const myDept = (auth.user && auth.user.dept) || '';
  const hit = ownerRoles.value.find((o) => o.dept === myDept);
  createDlg.canPick = !hit;
  Object.assign(createDlg.form, {
    title: '', category: '', owner_role: hit ? hit.role : 'ADM', stage: '月',
    plan_date: '', trainer: '', target: '', duration: '', location: '', budget: 0, content: '',
  });
  createDlg.visible = true;
}
async function submitCreate() {
  if (!createDlg.form.title || !createDlg.form.category) { ElMessage.warning('培训主题与类别必填'); return; }
  createDlg.saving = true;
  const r = await request.post('/training', createDlg.form);
  createDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已提交'); createDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 修正重提 ---------- */
const editDlg = reactive({
  visible: false, saving: false, id: null,
  form: { title: '', category: '', stage: '月', plan_date: '', trainer: '', target: '', duration: '', location: '', budget: 0, content: '' },
});
function openEdit(row) {
  editDlg.id = row.id;
  Object.assign(editDlg.form, {
    title: row.title, category: row.category, stage: row.stage, plan_date: row.plan_date,
    trainer: row.trainer, target: row.target, duration: row.duration, location: row.location,
    budget: row.budget || 0, content: row.content,
  });
  editDlg.visible = true;
}
async function submitEdit() {
  editDlg.saving = true;
  const r = await request.put(`/training/${editDlg.id}`, editDlg.form);
  editDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已重提'); editDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '提交失败');
}

/* ---------- 审批 ---------- */
const apprDlg = reactive({ visible: false, saving: false, id: null, title: '', dept: '', budget: 0, comment: '' });
function openApprove(row) {
  apprDlg.id = row.id;
  apprDlg.title = row.title;
  apprDlg.dept = row.owner_dept;
  apprDlg.budget = row.budget;
  apprDlg.comment = '';
  apprDlg.visible = true;
}
async function submitApprove(result) {
  apprDlg.saving = true;
  const r = await request.post(`/training/${apprDlg.id}/approve`, { result, comment: apprDlg.comment });
  apprDlg.saving = false;
  if (r.code === 200) { ElMessage.success(r.msg || '已处理'); apprDlg.visible = false; loadList(); loadStats(); }
  else ElMessage.error(r.msg || '处理失败');
}

/* ---------- 结果登记 ---------- */
const resDlg = reactive({
  visible: false, saving: false, id: null, planNo: '', fileName: '', attachments: [],
  form: { exec_date: '', result_note: '', file_name: '', file_b64: '' },
});
async function openResult(row) {
  resDlg.id = row.id;
  resDlg.planNo = row.plan_no;
  Object.assign(resDlg.form, { exec_date: '', result_note: '', file_name: '', file_b64: '' });
  resDlg.fileName = '';
  resDlg.visible = true;
  const r = await request.get(`/training/${row.id}`);
  resDlg.attachments = r.code === 200 ? (r.data.attachments || []) : [];
}
function onPickResult(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    resDlg.form.file_b64 = String(reader.result);
    resDlg.form.file_name = f.name;
    resDlg.fileName = f.name;
  };
  reader.readAsDataURL(f);
}
async function submitResult() {
  resDlg.saving = true;
  const r = await request.post(`/training/${resDlg.id}/result`, resDlg.form);
  resDlg.saving = false;
  if (r.code === 200) {
    ElMessage.success(r.msg || '已登记');
    resDlg.visible = false; loadList(); loadStats();
  } else ElMessage.error(r.msg || '登记失败');
}

/* ---------- 报名 / 签到 / 评价 ---------- */
const rosterDlg = reactive({
  visible: false, id: null, planNo: '', name: '', signups: [], signins: [],
  eva: { name: '', score: 90 }, evaSaving: false,
});
async function openRoster(row) {
  rosterDlg.id = row.id;
  rosterDlg.planNo = row.plan_no;
  rosterDlg.name = '';
  rosterDlg.visible = true;
  await refreshRoster();
}
async function refreshRoster() {
  const r = await request.get(`/training/${rosterDlg.id}`);
  if (r.code === 200) {
    rosterDlg.signups = r.data.signups || [];
    rosterDlg.signins = r.data.signins || [];
  }
}
function signedIn(row) {
  return rosterDlg.signins.some((x) => (row.emp_id && x.emp_id === row.emp_id) || x.emp_name === row.emp_name);
}
async function doSignup() {
  const r = await request.post(`/training/${rosterDlg.id}/signup`, { emp_name: rosterDlg.name });
  if (r.code === 200) { ElMessage.success('报名成功'); rosterDlg.name = ''; await refreshRoster(); loadList(); }
  else ElMessage.error(r.msg || '报名失败');
}
async function doSignin() {
  const r = await request.post(`/training/${rosterDlg.id}/signin`, { emp_name: rosterDlg.name });
  if (r.code === 200) { ElMessage.success('签到成功'); rosterDlg.name = ''; await refreshRoster(); loadList(); }
  else ElMessage.error(r.msg || '签到失败');
}
async function submitEval() {
  if (!rosterDlg.eva.name) { ElMessage.warning('请填写被评价人姓名'); return; }
  rosterDlg.evaSaving = true;
  const r = await request.post(`/training/${rosterDlg.id}/evaluate`, {
    emp_name: rosterDlg.eva.name, emp_id: 0, score: rosterDlg.eva.score,
  });
  rosterDlg.evaSaving = false;
  if (r.code === 200) ElMessage.success(r.msg || '评价已登记');
  else ElMessage.error(r.msg || '登记失败');
}

/* ---------- 详情 ---------- */
async function openDetail(row) {
  const r = await request.get(`/training/${row.id}`);
  const d = r.code === 200 ? r.data : row;
  const lines = [
    ['计划编号', d.plan_no], ['培训主题', d.title], ['类别', d.category],
    ['归口部门', d.owner_dept], ['阶段', d.stage], ['讲师', d.trainer],
    ['参训对象', d.target], ['时长', d.duration], ['地点', d.location],
    ['预算(万)', d.budget], ['计划日期', d.plan_date], ['状态', d.status],
    ['执行日期', d.exec_date], ['执行登记人', d.exec_by], ['结果说明', d.result_note],
    ['内容大纲', d.content],
  ];
  import('element-plus').then(({ ElMessageBox }) => {
    ElMessageBox.alert(
      lines.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0"><span style="color:#909399">${k}</span><b>${v || '—'}</b></div>`).join(''),
      '培训计划详情', { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' }
    );
  });
}
</script>

<style scoped>
.training { padding: 20px; }
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
