<template>
  <div class="page">
    <div class="page-header"><h2>数据服务</h2></div>
    <el-tabs v-model="tab">
      <el-tab-pane label="个人仪表盘" name="dash">
        <el-row :gutter="12">
          <el-col :span="6"><el-card><h3>{{ dash.pending_approvals || 0 }}</h3><p>待我审批</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ dash.todo_count || 0 }}</h3><p>我的待办</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ dash.pending_reports || 0 }}</h3><p>待提交报告</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ dash.unread_msg || 0 }}</h3><p>未读消息</p></el-card></el-col>
          <el-col :span="8"><el-card><h3>{{ dash.opps || 0 }}</h3><p>进行中商机</p></el-card></el-col>
          <el-col :span="8"><el-card><h3>{{ dash.contracts || 0 }}</h3><p>在签合同</p></el-card></el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane label="跨部门快照" name="snap">
        <el-row :gutter="12">
          <el-col :span="6"><el-card><h3>¥{{ snap.sales?.total || 0 }}</h3><p>本月销售(万)</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>¥{{ snap.purchase?.total || 0 }}</h3><p>本月采购(万)</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>{{ snap.stock?.low || 0 }}</h3><p>库存低预警</p></el-card></el-col>
          <el-col :span="6"><el-card><h3>¥{{ snap.contracts?.amount || 0 }}</h3><p>本月合同(万)</p></el-card></el-col>
        </el-row>
        <el-divider>明细</el-divider>
        <pre style="background:#f9fafb; padding:12px; border-radius:6px">{{ JSON.stringify(snap, null, 2) }}</pre>
      </el-tab-pane>
      <el-tab-pane label="合规检查" name="comp">
        <el-button @click="loadComp" type="primary" size="small">立即检查</el-button>
        <el-row :gutter="12" style="margin-top:12px">
          <el-col :span="24" v-for="i in comp.issues" :key="i.type">
            <el-card :style="{ borderColor: i.severity==='high' ? '#ef4444' : i.severity==='medium' ? '#f59e0b' : '#3b82f6' }">
              <h3>{{ i.type }}: {{ i.count }} 条</h3>
              <p>严重度：{{ i.severity }}</p>
            </el-card>
          </el-col>
        </el-row>
        <p v-if="comp.issues?.length === 0" style="color:#16a34a; margin-top:12px">✅ 全部合规</p>
      </el-tab-pane>
      <el-tab-pane label="字段权限" name="field">
        <el-button @click="openField" type="primary" size="small">+ 新增规则</el-button>
        <el-table :data="fieldList" border style="margin-top:8px">
          <el-table-column prop="module" label="模块" width="120" />
          <el-table-column prop="field" label="字段" width="120" />
          <el-table-column prop="role" label="角色" width="120" />
          <el-table-column prop="perm" label="权限" width="100">
            <template #default="{ row }">
              <el-tag :type="row.perm==='可见'?'success':(row.perm==='脱敏'?'warning':'danger')" size="small">{{ row.perm }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" @click="updField(row, '可见')">可见</el-button>
              <el-button size="small" @click="updField(row, '脱敏')">脱敏</el-button>
              <el-button size="small" @click="updField(row, '隐藏')" type="danger">隐藏</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="服务审计" name="audit">
        <el-table :data="auditList" border>
          <el-table-column prop="endpoint" label="端点" />
          <el-table-column prop="emp_name" label="调用人" width="100" />
          <el-table-column prop="result_count" label="返回数" width="80" />
          <el-table-column prop="cost_ms" label="耗时ms" width="80" />
          <el-table-column prop="created_at" label="时间" width="160" />
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="fieldDlg" title="新增字段权限规则" width="500px">
      <el-form :model="fieldForm" label-width="80px">
        <el-form-item label="模块"><el-input v-model="fieldForm.module" placeholder="如 customers" /></el-form-item>
        <el-form-item label="字段"><el-input v-model="fieldForm.field" placeholder="如 phone" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="fieldForm.role"><el-option label="销售" value="销售" /><el-option label="财务" value="财务" /><el-option label="人事" value="人事" /><el-option label="管理员" value="管理员" /><el-option label="总经理" value="总经理" /></el-select></el-form-item>
        <el-form-item label="权限"><el-select v-model="fieldForm.perm"><el-option label="可见" value="可见" /><el-option label="脱敏" value="脱敏" /><el-option label="隐藏" value="隐藏" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="fieldDlg=false">取消</el-button><el-button @click="saveField" type="primary">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../api/request'

const tab = ref('dash')
const dash = ref({})
const snap = ref({})
const comp = ref({})
const fieldList = ref([])
const auditList = ref([])
const fieldDlg = ref(false)
const fieldForm = reactive({ module: 'customers', field: 'phone', role: '销售', perm: '可见' })

async function loadDash() { const r = await request.get('/dsvc/get_user_dashboard_data'); dash.value = r.data || {} }
async function loadSnap() { const r = await request.get('/dsvc/cross_dept_snapshot'); snap.value = r.data || {} }
async function loadComp() { const r = await request.get('/dsvc/compliance'); comp.value = r.data || {} }
async function loadField() { const r = await request.get('/dsvc/field_permissions'); fieldList.value = r.data?.list || [] }
async function loadAudit() { const r = await request.get('/dsvc/svc_audit'); auditList.value = r.data?.list || [] }
function openField() { Object.assign(fieldForm, { module: 'customers', field: 'phone', role: '销售', perm: '可见' }); fieldDlg.value = true }
async function saveField() { ElMessage.info('请通过数据库直接 INSERT field_permissions 表'); fieldDlg.value = false }
async function updField(row, perm) {
  const r = await request.put('/dsvc/field_permissions/' + row.id, { perm });
  if (r.code === 200) { ElMessage.success('已更新'); loadField(); }
}
watch(tab, (v) => { if (v === 'dash') loadDash(); if (v === 'snap') loadSnap(); if (v === 'comp') loadComp(); if (v === 'field') loadField(); if (v === 'audit') loadAudit(); })
onMounted(() => loadDash())
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; }
</style>
