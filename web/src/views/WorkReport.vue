<template>
  <div class="page">
    <div class="page-header"><h2>工作报告</h2></div>
    <el-tabs v-model="tab">
      <el-tab-pane label="我的报告" name="mine">
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="4"><el-select v-model="f.type" placeholder="类型" clearable size="small"><el-option label="日报" value="日报" /><el-option label="周报" value="周报" /><el-option label="月报" value="月报" /></el-select></el-col>
          <el-col :span="4"><el-select v-model="f.status" placeholder="状态" clearable size="small"><el-option label="待提交" value="待提交" /><el-option label="已提交" value="已提交" /><el-option label="已批阅" value="已批阅" /><el-option label="已驳回" value="已驳回" /></el-select></el-col>
          <el-col :span="6"><el-input v-model="f.keyword" placeholder="标题/内容" size="small" clearable /></el-col>
          <el-col :span="6"><el-button type="primary" @click="loadMine" size="small">查询</el-button><el-button @click="openCreate" type="success" size="small">+ 新建</el-button><el-button @click="exportRec" size="small">导出</el-button><el-button @click="doRemind" size="small" type="warning">催交</el-button></el-col>
        </el-row>
        <el-table :data="mineList" border>
          <el-table-column prop="report_no" label="单号" width="160" />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column prop="period" label="期间" width="110" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }"><el-tag :type="row.status==='已批阅'?'success':(row.status==='已驳回'?'danger':'warning')" size="small">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="160" />
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">查看</el-button>
              <el-button v-if="row.status==='待提交'" size="small" type="primary" @click="submitOne(row)">提交</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="待我批阅" name="pending">
        <el-table :data="pendingList" border>
          <el-table-column prop="report_no" label="单号" width="160" />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column prop="emp_name" label="提交人" width="100" />
          <el-table-column prop="dept_name" label="部门" width="120" />
          <el-table-column prop="title" label="标题" />
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">查看</el-button>
              <el-button size="small" type="primary" @click="reviewOne(row,'通过')">通过</el-button>
              <el-button size="small" type="danger" @click="reviewOne(row,'驳回')">驳回</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="抄送我" name="cc">
        <el-table :data="ccList" border>
          <el-table-column prop="report_no" label="单号" width="160" />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column prop="emp_name" label="提交人" width="100" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="status" label="状态" width="100" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="部门汇总" name="dept">
        <el-table :data="deptList" border>
          <el-table-column prop="dept_name" label="部门" />
          <el-table-column prop="total" label="总提交" width="100" />
          <el-table-column prop="reviewed" label="已批阅" width="100" />
          <el-table-column prop="rejected" label="已驳回" width="100" />
          <el-table-column prop="pending" label="待批阅" width="100" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="问题 TOP" name="issues">
        <el-table :data="issuesTop" border>
          <el-table-column prop="text" label="问题内容" />
          <el-table-column prop="count" label="出现次数" width="100" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="统计" name="stats">
        <el-row :gutter="12">
          <el-col :span="6"><el-card><h3>{{ stats.total || 0 }}</h3><p>报告总数</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ stats.today || 0 }}</h3><p>今日提交</p></el-card></el-col>
        </el-row>
        <el-divider>按类型</el-divider>
        <el-table :data="stats.by_type || []" border>
          <el-table-column prop="type" label="类型" />
          <el-table-column prop="c" label="数量" width="100" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="模板" name="tpl">
        <el-button @click="openTpl" type="primary" size="small">+ 新建模板</el-button>
        <el-table :data="tplList" border style="margin-top:8px">
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="built_in" label="内置" width="80">
            <template #default="{ row }"><el-tag :type="row.built_in?'success':'info'" size="small">{{ row.built_in ? '是' : '否' }}</el-tag></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 新建/编辑 -->
    <el-dialog v-model="dlg" :title="form.id ? '编辑报告' : '新建报告'" width="680px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="类型"><el-select v-model="form.type"><el-option label="日报" value="日报" /><el-option label="周报" value="周报" /><el-option label="月报" value="月报" /></el-select></el-form-item>
        <el-form-item label="期间"><el-input v-model="form.period" placeholder="日报=YYYY-MM-DD，周报=起止" /></el-form-item>
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" :rows="6" /></el-form-item>
        <el-form-item label="问题"><el-input v-model="form.issues" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="次日计划"><el-input v-model="form.plan_tomorrow" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="抄送"><el-input v-model="form.cc_emp_ids" placeholder="逗号分隔工号" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg=false">取消</el-button>
        <el-button type="primary" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情/批阅 -->
    <el-dialog v-model="detailDlg" title="报告详情" width="700px">
      <div v-if="current">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="单号">{{ current.report_no }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="current.status==='已批阅'?'success':(current.status==='已驳回'?'danger':'warning')">{{ current.status }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="提交人">{{ current.emp_name }}</el-descriptions-item>
          <el-descriptions-item label="部门">{{ current.dept_name }}</el-descriptions-item>
          <el-descriptions-item label="期间">{{ current.period }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ current.type }}</el-descriptions-item>
        </el-descriptions>
        <h4>内容</h4>
        <pre style="white-space:pre-wrap; background:#f9fafb; padding:10px; border-radius:6px">{{ current.content }}</pre>
        <h4>问题</h4>
        <pre style="white-space:pre-wrap; background:#fef3c7; padding:10px; border-radius:6px">{{ current.issues || '-' }}</pre>
        <h4>次日计划</h4>
        <pre style="white-space:pre-wrap; background:#dbeafe; padding:10px; border-radius:6px">{{ current.plan_tomorrow || '-' }}</pre>
        <h4>批阅记录</h4>
        <div v-for="r in reviews" :key="r.id" style="border-left:3px solid #2563eb; padding-left:10px; margin:6px 0">
          <b>{{ r.reviewer_name || '系统' }}</b> · {{ r.action }} · <span style="color:#999">{{ r.reviewed_at }}</span>
          <div style="color:#666">{{ r.comment || '无意见' }}</div>
        </div>
        <h4>指导意见</h4>
        <div v-for="g in guidance" :key="g.id" style="border-left:3px solid #16a34a; padding-left:10px; margin:6px 0">
          <b>{{ g.leader_name || '上级' }}</b> · <span style="color:#999">{{ g.created_at }}</span>
          <div style="color:#666">{{ g.content }}</div>
        </div>
        <el-divider />
        <el-input v-model="comment" type="textarea" :rows="3" placeholder="批阅意见（可留空）" />
      </div>
      <template #footer>
        <el-button @click="detailDlg=false">关闭</el-button>
        <el-button v-if="current && current.status==='已提交'" type="primary" @click="doReview('通过')">通过</el-button>
        <el-button v-if="current && current.status==='已提交'" type="danger" @click="doReview('驳回')">驳回</el-button>
        <el-button v-if="current" @click="doGuide">下发指导</el-button>
      </template>
    </el-dialog>

    <!-- 模板 -->
    <el-dialog v-model="tplDlg" title="新建模板" width="500px">
      <el-form :model="tplForm" label-width="80px">
        <el-form-item label="名称"><el-input v-model="tplForm.name" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="tplForm.type"><el-option label="日报" value="日报" /><el-option label="周报" value="周报" /><el-option label="月报" value="月报" /></el-select></el-form-item>
        <el-form-item label="字段"><el-input v-model="tplForm.fieldsText" type="textarea" :rows="4" placeholder="每行一个字段名" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplDlg=false">取消</el-button>
        <el-button type="primary" @click="doCreateTpl">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../api/request'

const tab = ref('mine')
const f = reactive({ type: '', status: '', keyword: '' })
const mineList = ref([])
const pendingList = ref([])
const ccList = ref([])
const deptList = ref([])
const issuesTop = ref([])
const stats = ref({ by_type: [] })
const tplList = ref([])
const dlg = ref(false)
const form = reactive({ id: null, type: '日报', period: '', title: '', content: '', issues: '', plan_tomorrow: '', cc_emp_ids: '' })
const detailDlg = ref(false)
const current = ref(null)
const reviews = ref([])
const guidance = ref([])
const comment = ref('')
const tplDlg = ref(false)
const tplForm = reactive({ name: '', type: '日报', fieldsText: '今日完成\n问题与风险\n次日计划' })

async function loadMine() { const r = await request.get('/work-reports', { params: f }); mineList.value = r.data?.list || [] }
async function loadPending() { const r = await request.get('/work-reports/pending'); pendingList.value = r.data?.list || [] }
async function loadCc() { const r = await request.get('/work-reports/cc'); ccList.value = r.data?.list || [] }
async function loadDept() { const r = await request.get('/work-reports/dept-summary'); deptList.value = r.data?.list || [] }
async function loadIssues() { const r = await request.get('/work-reports/issues-top'); issuesTop.value = r.data?.top || [] }
async function loadStats() { const r = await request.get('/work-reports/stats'); stats.value = r.data || {} }
async function loadTpl() { const r = await request.get('/work-reports/templates'); tplList.value = r.data?.list || [] }

function openCreate() { Object.assign(form, { id: null, type: '日报', period: new Date().toISOString().slice(0,10), title: '', content: '', issues: '', plan_tomorrow: '', cc_emp_ids: '' }); dlg.value = true }
async function doCreate() {
  if (!form.title) return ElMessage.warning('请填标题');
  if (form.id) {
    const r = await request.put('/work-reports/' + form.id, form);
    if (r.code === 200) ElMessage.success('已更新');
  } else {
    const r = await request.post('/work-reports', form);
    if (r.code === 200) ElMessage.success('已创建');
  }
  dlg.value = false; loadMine();
}
async function openDetail(row) {
  const r = await request.get('/work-reports/' + row.id);
  current.value = r.data?.report; reviews.value = r.data?.reviews || []; guidance.value = [];
  const g = await request.get('/work-reports/' + row.id + '/guidance'); guidance.value = g.data?.list || [];
  comment.value = ''; detailDlg.value = true;
}
async function submitOne(row) {
  await ElMessageBox.confirm('确认提交此报告？', '提示', { type: 'warning' });
  const r = await request.post('/work-reports/' + row.id + '/submit');
  if (r.code === 200) { ElMessage.success(r.message); loadMine(); }
}
async function reviewOne(row, action) {
  await ElMessageBox.confirm(`确认 ${action}？`, '提示', { type: 'warning' });
  const r = await request.put('/work-reports/' + row.id + '/review', { action, comment: '' });
  if (r.code === 200) { ElMessage.success(r.message); loadPending(); }
}
async function doReview(action) {
  const r = await request.put('/work-reports/' + current.value.id + '/review', { action, comment: comment.value });
  if (r.code === 200) { ElMessage.success(r.message); detailDlg.value = false; loadPending(); }
}
async function doGuide() {
  if (!comment.value) return ElMessage.warning('请填指导内容');
  const r = await request.post('/work-reports/' + current.value.id + '/guide', { comment: comment.value });
  if (r.code === 200) { ElMessage.success('已下发'); openDetail(current.value); }
}
async function doRemind() {
  await ElMessageBox.confirm('给所有「待提交」的员工发催交消息？', '催交', { type: 'warning' });
  const r = await request.post('/work-reports/remind');
  ElMessage.success(r.message);
}
async function exportRec() {
  const r = await request.get('/work-reports/export');
  const blob = new Blob([r.data?.text || ''], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '工作汇报.txt'; a.click();
}
function openTpl() { Object.assign(tplForm, { name: '', type: '日报', fieldsText: '今日完成\n问题与风险\n次日计划' }); tplDlg.value = true }
async function doCreateTpl() {
  const fields = tplForm.fieldsText.split('\n').map(s => ({ name: s.trim() })).filter(f => f.name);
  const r = await request.post('/work-reports/templates', { name: tplForm.name, type: tplForm.type, fields });
  if (r.code === 200) { ElMessage.success('已创建'); tplDlg.value = false; loadTpl(); }
}

watch(tab, (v) => {
  if (v === 'mine') loadMine();
  if (v === 'pending') loadPending();
  if (v === 'cc') loadCc();
  if (v === 'dept') loadDept();
  if (v === 'issues') loadIssues();
  if (v === 'stats') loadStats();
  if (v === 'tpl') loadTpl();
})
onMounted(() => loadMine())
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; }
</style>
