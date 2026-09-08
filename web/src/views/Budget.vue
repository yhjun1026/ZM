<template>
  <div class="page">
    <div class="page-header"><h2>预算管理</h2><div><el-button type="primary" @click="openCreate">+ 新建预算</el-button></div></div>
    <el-row :gutter="12" style="margin-bottom:12px">
      <el-col :span="6"><el-card><h3>{{ stats.total_budget || 0 }}</h3><p>总预算(万元)</p></el-card></el-col>
      <el-col :span="6"><el-card><h3>{{ stats.total_actual || 0 }}</h3><p>已执行(万元)</p></el-card></el-col>
      <el-col :span="6"><el-card><h3>{{ stats.execution_rate || 0 }}%</h3><p>执行率</p></el-card></el-col>
      <el-col :span="6"><el-card><h3>{{ stats.over_budget || 0 }}</h3><p>超预算数</p></el-card></el-col>
    </el-row>

    <el-tabs v-model="tab">
      <el-tab-pane label="预算列表" name="list">
        <el-row :gutter="8" style="margin-bottom:8px">
          <el-col :span="4"><el-input-number v-model="f.year" :min="2020" :max="2030" placeholder="年度" size="small" /></el-col>
          <el-col :span="4"><el-select v-model="f.category" placeholder="分类" clearable size="small"><el-option v-for="c in categories" :key="c.code" :label="c.name" :value="c.code" /></el-select></el-col>
          <el-col :span="6"><el-button type="primary" @click="loadList" size="small">查询</el-button></el-col>
        </el-row>
        <el-table :data="list" border>
          <el-table-column prop="year" label="年度" width="80" />
          <el-table-column prop="quarter" label="季度" width="80" />
          <el-table-column prop="month" label="月份" width="80" />
          <el-table-column prop="category" label="分类" width="120" />
          <el-table-column prop="amount" label="预算(万)" width="100" />
          <el-table-column prop="actual" label="已执行(万)" width="100" />
          <el-table-column label="执行率" width="100">
            <template #default="{ row }">{{ row.amount > 0 ? (row.actual/row.amount*100).toFixed(1) + '%' : '-' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button v-if="row.status==='生效'" size="small" @click="openExec(row)">执行</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="执行流水" name="exec">
        <el-table :data="execList" border>
          <el-table-column prop="budget_id" label="预算ID" width="80" />
          <el-table-column prop="year" label="年" width="60" />
          <el-table-column prop="category" label="分类" width="100" />
          <el-table-column prop="amount" label="金额(万)" width="100" />
          <el-table-column prop="source_type" label="来源" width="120" />
          <el-table-column prop="source_no" label="单号" width="140" />
          <el-table-column prop="note" label="备注" />
          <el-table-column prop="created_at" label="时间" width="160" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="分类管理" name="cat">
        <el-button @click="addCat" type="primary" size="small">+ 新增分类</el-button>
        <el-table :data="categories" border style="margin-top:8px">
          <el-table-column prop="code" label="编码" width="100" />
          <el-table-column prop="name" label="名称" />
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dlg" title="新建预算" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="年度"><el-input-number v-model="form.year" :min="2020" :max="2030" /></el-form-item>
        <el-form-item label="季度"><el-input-number v-model="form.quarter" :min="0" :max="4" /></el-form-item>
        <el-form-item label="月份"><el-input-number v-model="form.month" :min="0" :max="12" /></el-form-item>
        <el-form-item label="分类"><el-input v-model="form.category" /></el-form-item>
        <el-form-item label="金额(万)"><el-input-number v-model="form.amount" :precision="2" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.note" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="doCreate">提交</el-button></template>
    </el-dialog>

    <el-dialog v-model="execDlg" title="执行登记" width="500px">
      <el-form :model="execForm" label-width="80px">
        <el-form-item label="金额(万)"><el-input-number v-model="execForm.amount" :precision="2" /></el-form-item>
        <el-form-item label="来源类型"><el-select v-model="execForm.source_type"><el-option label="采购订单" value="采购订单" /><el-option label="市场费用" value="市场费用" /><el-option label="工资" value="工资" /><el-option label="固定开支" value="固定开支" /><el-option label="客情" value="客情" /><el-option label="产品开发" value="产品开发" /></el-select></el-form-item>
        <el-form-item label="来源单号"><el-input v-model="execForm.source_no" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="execForm.note" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="execDlg=false">取消</el-button><el-button type="primary" @click="doExec">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../api/request'

const tab = ref('list')
const list = ref([])
const execList = ref([])
const categories = ref([])
const stats = ref({})
const f = reactive({ year: new Date().getFullYear(), category: '' })
const dlg = ref(false)
const form = reactive({ year: new Date().getFullYear(), quarter: 0, month: 0, category: '采购', amount: 0, note: '' })
const execDlg = ref(false)
const execForm = reactive({ budget_id: null, amount: 0, source_type: '采购订单', source_no: '', note: '' })

async function loadList() { const r = await request.get('/budgets', { params: f }); list.value = r.data?.list || [] }
async function loadExec() { const r = await request.get('/budgets/executions'); execList.value = r.data?.list || [] }
async function loadCat() { const r = await request.get('/budgets/categories'); categories.value = r.data?.list || [] }
async function loadStats() { const r = await request.get('/budgets/stats'); stats.value = r.data || {} }

function openCreate() { Object.assign(form, { year: new Date().getFullYear(), quarter: 0, month: 0, category: '采购', amount: 0, note: '' }); dlg.value = true }
async function doCreate() {
  const r = await request.post('/budgets', form);
  if (r.code === 200) { ElMessage.success('已创建'); dlg.value = false; loadList(); }
}
function openExec(row) { Object.assign(execForm, { budget_id: row.id, amount: 0, source_type: '采购订单', source_no: '', note: '' }); execDlg.value = true }
async function doExec() {
  const r = await request.post('/budgets/executions', execForm);
  if (r.code === 200) { ElMessage.success('已执行'); execDlg.value = false; loadList(); loadExec(); loadStats(); }
}
async function addCat() {
  const code = prompt('分类编码（如 PROCUREMENT）');
  if (!code) return;
  const name = prompt('分类名称');
  if (!name) return;
  const r = await request.post('/budgets', { year: f.year, category: code + '|' + name, amount: 0, note: '分类' });
  if (r.code === 200) { ElMessage.success('请用数据库直接插入 budget_categories 表'); }
}
watch(tab, (v) => { if (v === 'list') loadList(); if (v === 'exec') loadExec(); if (v === 'cat') loadCat(); })
onMounted(() => { loadList(); loadCat(); loadStats() })
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; }
</style>
