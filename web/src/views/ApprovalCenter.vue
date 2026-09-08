<template>
  <div class="page">
    <div class="page-header">
      <h2>审批中心</h2>
      <div class="actions">
        <el-button type="primary" @click="openCreate">发起审批</el-button>
        <el-button @click="activeTab='todo'">我的待办 ({{ todoCount }})</el-button>
        <el-button @click="activeTab='done'">已办</el-button>
        <el-button @click="activeTab='cc'">抄送我</el-button>
        <el-button @click="activeTab='favs'">收藏</el-button>
        <el-button @click="activeTab='flow'">流程管理</el-button>
        <el-button @click="activeTab='health'">健康巡检</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- 待办 -->
      <el-tab-pane label="待办" name="todo">
        <el-table :data="todoList" border>
          <el-table-column prop="approval_no" label="单号" width="160" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="applicant_name" label="申请人" width="100" />
          <el-table-column prop="amount" label="金额" width="100" />
          <el-table-column prop="remind_count" label="催办次数" width="80" />
          <el-table-column prop="created_at" label="发起时间" width="160" />
          <el-table-column label="操作" width="240">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">查看</el-button>
              <el-button size="small" type="primary" @click="openAct(row, '通过')">通过</el-button>
              <el-button size="small" type="danger" @click="openAct(row, '驳回')">驳回</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 已办 -->
      <el-tab-pane label="已办" name="done">
        <el-table :data="doneList" border>
          <el-table-column prop="approval_no" label="单号" width="160" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column prop="created_at" label="发起时间" width="160" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 抄送 -->
      <el-tab-pane label="抄送我" name="cc">
        <el-table :data="ccList" border>
          <el-table-column prop="approval_no" label="单号" width="160" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 全部 -->
      <el-tab-pane label="全部" name="all">
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="5"><el-select v-model="filter.type" placeholder="类型" clearable size="small"><el-option v-for="t in types" :key="t" :label="t" :value="t" /></el-select></el-col>
          <el-col :span="5"><el-select v-model="filter.status" placeholder="状态" clearable size="small"><el-option label="待审批" value="待审批" /><el-option label="通过" value="通过" /><el-option label="驳回" value="驳回" /><el-option label="已撤回" value="已撤回" /></el-select></el-col>
          <el-col :span="5"><el-input v-model="filter.keyword" placeholder="单号/标题" size="small" clearable /></el-col>
          <el-col :span="4"><el-button type="primary" @click="loadAll" size="small">查询</el-button><el-button @click="resetFilter" size="small">重置</el-button></el-col>
        </el-row>
        <el-table :data="allList" border>
          <el-table-column prop="approval_no" label="单号" width="160" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="applicant_name" label="申请人" width="100" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status==='通过'?'success':(row.status==='驳回'?'danger':'warning')" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="发起时间" width="160" />
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">查看</el-button>
              <el-button size="small" @click="addFav(row)" v-if="!favIds.has(row.id)">收藏</el-button>
              <el-button size="small" @click="exportOne(row)">导出</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-model:current-page="filter.page" :page-size="filter.pageSize" :total="allTotal" @current-change="loadAll" layout="total, prev, pager, next" />
      </el-tab-pane>

      <!-- 收藏 -->
      <el-tab-pane label="收藏" name="favs">
        <el-table :data="favList" border>
          <el-table-column prop="approval_id" label="审批 ID" width="80" />
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="status" label="状态" width="100" />
        </el-table>
      </el-tab-pane>

      <!-- 流程管理 -->
      <el-tab-pane label="流程管理" name="flow">
        <el-row :gutter="12">
          <el-col :span="10">
            <h4>所有类型（{{ types.length }}）</h4>
            <el-table :data="flowList" border @row-click="pickFlow" max-height="600">
              <el-table-column prop="type" label="类型" />
              <el-table-column label="节点数" width="80">
                <template #default="{ row }">{{ (row.nodes || row.default_nodes || []).length }}</template>
              </el-table-column>
            </el-table>
          </el-col>
          <el-col :span="14">
            <h4>{{ currentFlow?.type || '请选择类型' }} 流程图</h4>
            <div v-if="currentFlow">
              <el-timeline>
                <el-timeline-item v-for="(n, i) in currentFlow.nodes" :key="i" :timestamp="`步骤 ${i+1}`">
                  <b>{{ n.step_name }}</b>（角色：{{ n.role || 'EMP_ID' }}）
                  <div v-if="n.approvers?.length">审批人：<el-tag v-for="a in n.approvers" :key="a.id" size="small" style="margin:2px">{{ a.name }}</el-tag></div>
                </el-timeline-item>
              </el-timeline>
              <el-divider />
              <h5>编辑自定义流程</h5>
              <div v-for="(n, i) in editNodes" :key="i" style="margin-bottom:6px">
                <el-input v-model="n.step_name" placeholder="步骤名" style="width:200px" size="small" />
                <el-input v-model="n.role" placeholder="角色(DEPT_LEAD/HR/FIN/GM/VP/LEGAL)" style="width:240px; margin-left:6px" size="small" />
                <el-button size="small" type="danger" @click="editNodes.splice(i,1)" style="margin-left:6px">删</el-button>
              </div>
              <el-button size="small" @click="editNodes.push({step_name:'', role:''})">+ 节点</el-button>
              <el-button type="primary" size="small" @click="saveFlow">保存自定义</el-button>
              <el-button size="small" type="danger" @click="delFlow">恢复内置</el-button>
            </div>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- 健康巡检 -->
      <el-tab-pane label="健康巡检" name="health">
        <el-row :gutter="12">
          <el-col :span="8"><el-card><h3>{{ health.stuck || 0 }}</h3><p>卡单 (>7天)</p></el-card></el-col>
          <el-col :span="8"><el-card><h3>{{ health.stale || 0 }}</h3><p>僵死 (>30天)</p></el-card></el-col>
          <el-col :span="8"><el-card><h3>{{ health.quarantine || 0 }}</h3><p>异常单</p></el-card></el-col>
        </el-row>
        <el-button-group style="margin-top:12px">
          <el-button @click="fix('status')">修复状态</el-button>
          <el-button @click="fix('todos')">清死单消息</el-button>
          <el-button @click="fix('quarantine')" type="danger">回收异常单</el-button>
          <el-button @click="loadHealth">刷新</el-button>
        </el-button-group>

        <el-divider>效率统计（30天）</el-divider>
        <el-row :gutter="12">
          <el-col :span="6"><el-card><h3>{{ efficiency.total || 0 }}</h3><p>总数</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ efficiency.passed || 0 }}</h3><p>通过</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ efficiency.rejected || 0 }}</h3><p>驳回</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ efficiency.avg_days ? efficiency.avg_days.toFixed(1) + 'd' : '-' }}</h3><p>平均时效</p></el-card></el-col>
        </el-row>

        <el-divider>委托</el-divider>
        <el-row>
          <el-col :span="14">
            <el-table :data="delegations" border>
              <el-table-column prop="from_emp_name" label="委托人" width="100" />
              <el-table-column prop="to_emp_name" label="被委托人" width="100" />
              <el-table-column prop="start_date" label="起始" width="110" />
              <el-table-column prop="end_date" label="截止" width="110" />
              <el-table-column prop="scope" label="范围" width="80" />
              <el-table-column prop="status" label="状态" width="80" />
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button size="small" type="danger" @click="delDel(row)">停用</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-col>
          <el-col :span="10">
            <h5>新建委托</h5>
            <el-form :inline="true" size="small">
              <el-form-item label="被委托人"><el-input v-model="newDel.to_emp_name" placeholder="姓名" /></el-form-item>
              <el-form-item label="工号"><el-input v-model="newDel.to_emp_id" placeholder="工号(ZM001)" /></el-form-item>
              <el-form-item label="起始"><el-input v-model="newDel.start_date" placeholder="YYYY-MM-DD" /></el-form-item>
              <el-form-item label="截止"><el-input v-model="newDel.end_date" placeholder="YYYY-MM-DD" /></el-form-item>
              <el-form-item label="范围"><el-select v-model="newDel.scope"><el-option label="全部" value="全部" /><el-option label="仅审批" value="仅审批" /></el-select></el-form-item>
              <el-button type="primary" @click="addDel">提交</el-button>
            </el-form>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>

    <!-- 发起弹窗 -->
    <el-dialog v-model="createDlg" title="发起审批" width="640px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="审批类型"><el-select v-model="createForm.type" filterable><el-option v-for="t in types" :key="t" :label="t" :value="t" /></el-select></el-form-item>
        <el-form-item label="标题"><el-input v-model="createForm.title" /></el-form-item>
        <el-form-item label="金额"><el-input-number v-model="createForm.amount" :precision="2" /></el-form-item>
        <el-form-item label="折扣%"><el-input-number v-model="createForm.discount" :precision="2" /></el-form-item>
        <el-form-item label="抄送"><el-input v-model="createForm.cc_emp_ids" placeholder="逗号分隔的工号 ZM001,ZM002" /></el-form-item>
        <el-form-item label="关联单据"><el-input-number v-model="createForm.ref_id" /></el-form-item>
        <el-divider>流程预览</el-divider>
        <el-timeline v-if="previewNodes.length">
          <el-timeline-item v-for="(n, i) in previewNodes" :key="i" :timestamp="`步骤 ${i+1}`">
            <b>{{ n.step_name }}</b>（{{ n.role }}）<span v-if="n.approvers?.length">→ <el-tag v-for="a in n.approvers" :key="a.id" size="small" style="margin:2px">{{ a.name }}</el-tag></span>
          </el-timeline-item>
        </el-timeline>
      </el-form>
      <template #footer>
        <el-button @click="createDlg=false">取消</el-button>
        <el-button @click="loadPreview" :disabled="!createForm.type">刷新预览</el-button>
        <el-button type="primary" @click="doCreate">发起</el-button>
      </template>
    </el-dialog>

    <!-- 办理弹窗 -->
    <el-dialog v-model="actDlg" :title="`办理：${actForm.action}`" width="500px">
      <el-form label-width="80px">
        <el-form-item label="意见"><el-input v-model="actForm.comment" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="常用意见">
          <el-tag v-for="c in comments" :key="c.id" style="margin:2px; cursor:pointer" @click="actForm.comment = c.content">{{ c.content }}</el-tag>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="actDlg=false">取消</el-button>
        <el-button type="primary" @click="doAct">提交</el-button>
      </template>
    </el-dialog>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailDlg" title="审批详情" width="760px">
      <el-descriptions :column="2" border v-if="current">
        <el-descriptions-item label="单号">{{ current.approval_no }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ current.type }}</el-descriptions-item>
        <el-descriptions-item label="标题">{{ current.title }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="current.status==='通过'?'success':(current.status==='驳回'?'danger':'warning')">{{ current.status }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="申请人">{{ current.applicant_name }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ current.amount }} / 折扣 {{ current.discount }}%</el-descriptions-item>
        <el-descriptions-item label="发起时间">{{ current.created_at }}</el-descriptions-item>
        <el-descriptions-item label="完成时间">{{ current.finished_at || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider>流程跟踪</el-divider>
      <el-timeline v-if="traceSteps.length">
        <el-timeline-item v-for="(s, i) in traceSteps" :key="i" :timestamp="`步骤 ${s.seq}`" :type="s.action==='通过'?'success':(s.action==='驳回'?'danger':'primary')">
          <b>{{ s.step_name }}</b> → {{ s.approver_name || '未指派' }}
          <div v-if="s.comment" style="color:#999; font-size:12px">意见：{{ s.comment }}</div>
          <div style="color:#999; font-size:12px">{{ s.acted_at || '待办理' }}</div>
        </el-timeline-item>
      </el-timeline>
      <template #footer>
        <el-button @click="detailDlg=false">关闭</el-button>
        <el-button @click="doRemind" type="warning">催办</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../api/request'

const activeTab = ref('todo')
const types = ref([])
const todoList = ref([])
const doneList = ref([])
const ccList = ref([])
const allList = ref([])
const allTotal = ref(0)
const todoCount = computed(() => todoList.value.length)
const filter = reactive({ type: '', status: '', keyword: '', page: 1, pageSize: 20 })

const createDlg = ref(false)
const createForm = reactive({ type: '', title: '', amount: 0, discount: 0, ref_id: null, cc_emp_ids: '' })
const previewNodes = ref([])

const actDlg = ref(false)
const actForm = reactive({ id: null, action: '通过', comment: '' })
const comments = ref([])

const detailDlg = ref(false)
const current = ref(null)
const traceSteps = ref([])

const flowList = ref([])
const currentFlow = ref(null)
const editNodes = ref([])

const favList = ref([])
const favIds = computed(() => new Set(favList.value.map(f => f.approval_id)))
const delegations = ref([])
const newDel = reactive({ to_emp_id: '', to_emp_name: '', start_date: '', end_date: '', scope: '全部' })

const health = ref({})
const efficiency = ref({})

async function loadTypes() { const r = await request.get('/approvals/types'); types.value = r.data?.types || [] }
async function loadTodo() { const r = await request.get('/approvals/todo'); todoList.value = r.data?.list || [] }
async function loadDone() { const r = await request.get('/approvals/done'); doneList.value = r.data?.list || [] }
async function loadCc() { const r = await request.get('/approvals/cc'); ccList.value = r.data?.list || [] }
async function loadAll() {
  const r = await request.get('/approvals', { params: filter });
  allList.value = r.data?.list || []; allTotal.value = r.data?.total || 0;
}
async function loadFavs() { const r = await request.get('/approvals/favs'); favList.value = r.data?.list || [] }
async function loadFlows() {
  const r = await request.get('/approvals/flows');
  flowList.value = r.data?.defaults || [];
}
async function pickFlow(row) {
  currentFlow.value = row;
  const r = await request.get('/approvals/flows/' + encodeURIComponent(row.type));
  if (r.data?.custom) {
    editNodes.value = JSON.parse(JSON.stringify(r.data.custom.nodes || []));
  } else {
    editNodes.value = JSON.parse(JSON.stringify(r.data?.default_nodes || []));
  }
}
async function saveFlow() {
  const r = await request.put('/approvals/flows/' + encodeURIComponent(currentFlow.value.type), { nodes: editNodes.value });
  ElMessage.success(r.message || '已保存'); loadFlows();
}
async function delFlow() {
  await request.delete('/approvals/flows/' + encodeURIComponent(currentFlow.value.type));
  ElMessage.success('已恢复内置'); loadFlows();
}
async function loadHealth() {
  const r1 = await request.get('/approvals/health'); health.value = r1.data?.health || {};
  const r2 = await request.get('/approvals/efficiency'); efficiency.value = r2.data?.stats || {};
  const r3 = await request.get('/approvals/delegations'); delegations.value = r3.data?.list || [];
}
async function fix(kind) {
  const url = kind === 'status' ? '/approvals/health/fix-status' : kind === 'todos' ? '/approvals/health/fix-dead-todos' : '/approvals/health/purge-quarantine';
  const r = await request.post(url); ElMessage.success(r.message || '完成'); loadHealth();
}
async function loadDelegations() { const r = await request.get('/approvals/delegations'); delegations.value = r.data?.list || [] }
async function addDel() {
  if (!newDel.to_emp_id) return ElMessage.warning('请填工号');
  const r = await request.post('/approvals/delegations', newDel);
  ElMessage.success(r.message || '已创建'); loadDelegations();
  newDel.to_emp_id = ''; newDel.to_emp_name = '';
}
async function delDel(row) {
  await request.delete('/approvals/delegations/' + row.id);
  ElMessage.success('已停用'); loadDelegations();
}

async function loadComments() { const r = await request.get('/approvals/comments'); comments.value = r.data?.list || [] }
async function openCreate() { createDlg.value = true; createForm.type = ''; previewNodes.value = [] }
async function loadPreview() {
  if (!createForm.type) return;
  const r = await request.post('/approvals/preview', { type: createForm.type });
  previewNodes.value = r.data?.nodes || [];
}
async function doCreate() {
  if (!createForm.type) return ElMessage.warning('请选类型');
  const r = await request.post('/approvals', createForm);
  if (r.code === 200) { ElMessage.success('已发起'); createDlg.value = false; loadTodo(); loadAll(); }
  else ElMessage.error(r.message);
}
function openAct(row, action) {
  actForm.id = row.id; actForm.action = action; actForm.comment = '';
  actDlg.value = true; loadComments();
}
async function doAct() {
  const r = await request.put('/approvals/' + actForm.id + '/act', { action: actForm.action, comment: actForm.comment });
  if (r.code === 200) { ElMessage.success(r.message); actDlg.value = false; loadTodo(); }
  else ElMessage.error(r.message);
}
async function openDetail(row) {
  const r = await request.get('/approvals/' + row.id);
  current.value = r.data?.approval; traceSteps.value = r.data?.steps || [];
  detailDlg.value = true;
}
async function doRemind() {
  await request.post('/approvals/' + current.value.id + '/remind');
  ElMessage.success('已催办');
}
async function addFav(row) {
  await request.post('/approvals/favs', { approval_id: row.id });
  ElMessage.success('已收藏'); loadFavs();
}
async function exportOne(row) {
  const r = await request.get('/approvals/' + row.id + '/export');
  const blob = new Blob([r.data?.text || ''], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = row.approval_no + '.txt'; a.click();
}
function resetFilter() { filter.type=''; filter.status=''; filter.keyword=''; filter.page=1; loadAll() }

watch(activeTab, (v) => {
  if (v === 'todo') loadTodo();
  if (v === 'done') loadDone();
  if (v === 'cc') loadCc();
  if (v === 'all') loadAll();
  if (v === 'favs') loadFavs();
  if (v === 'flow') loadFlows();
  if (v === 'health') loadHealth();
})
watch(() => createForm.type, loadPreview)

onMounted(() => { loadTypes(); loadTodo() })
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
