<template>
  <div class="page">
    <div class="page-header"><h2>支付/分成</h2><el-button type="primary" @click="openCreate">+ 新建支付</el-button></div>
    <el-row :gutter="8" style="margin-bottom:8px">
      <el-col :span="4"><el-select v-model="f.pay_type" placeholder="类型" clearable size="small"><el-option v-for="s in sources" :key="s.code" :label="s.name" :value="s.name" /></el-select></el-col>
      <el-col :span="4"><el-input v-model="f.source_table" placeholder="来源表" size="small" clearable /></el-col>
      <el-col :span="6"><el-button type="primary" @click="loadList" size="small">查询</el-button></el-col>
    </el-row>
    <el-table :data="list" border>
      <el-table-column prop="pay_no" label="单号" width="180" />
      <el-table-column prop="pay_type" label="类型" width="160" />
      <el-table-column prop="amount" label="金额(万)" width="100" />
      <el-table-column prop="payee" label="收款方" width="120" />
      <el-table-column prop="method" label="方式" width="100" />
      <el-table-column prop="source_table" label="来源表" width="100" />
      <el-table-column prop="source_no" label="来源单号" width="140" />
      <el-table-column prop="pay_date" label="日期" width="110" />
    </el-table>

    <el-dialog v-model="dlg" title="新建支付" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="类型"><el-select v-model="form.pay_type"><el-option v-for="s in sources" :key="s.code" :label="s.name" :value="s.name" /></el-select></el-form-item>
        <el-form-item label="来源表"><el-input v-model="form.source_table" /></el-form-item>
        <el-form-item label="来源ID"><el-input-number v-model="form.source_id" /></el-form-item>
        <el-form-item label="来源单号"><el-input v-model="form.source_no" /></el-form-item>
        <el-form-item label="金额(万)"><el-input-number v-model="form.amount" :precision="4" /></el-form-item>
        <el-form-item label="收款方"><el-input v-model="form.payee" /></el-form-item>
        <el-form-item label="方式"><el-select v-model="form.method"><el-option label="银行转账" value="银行转账" /><el-option label="现金" value="现金" /><el-option label="支票" value="支票" /></el-select></el-form-item>
        <el-form-item label="日期"><el-input v-model="form.pay_date" placeholder="YYYY-MM-DD" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dlg=false">取消</el-button><el-button type="primary" @click="doCreate">提交</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../api/request'

const list = ref([])
const sources = ref([])
const f = reactive({ pay_type: '', source_table: '' })
const dlg = ref(false)
const form = reactive({ pay_type: '员工报销付款', source_table: '', source_id: null, source_no: '', amount: 0, payee: '', method: '银行转账', pay_date: new Date().toISOString().slice(0,10) })

async function loadList() { const r = await request.get('/payout/payouts', { params: f }); list.value = r.data?.list || [] }
async function loadSources() { const r = await request.get('/payout/sources'); sources.value = r.data?.list || [] }
function openCreate() { Object.assign(form, { pay_type: '员工报销付款', source_table: '', source_id: null, source_no: '', amount: 0, payee: '', method: '银行转账', pay_date: new Date().toISOString().slice(0,10) }); dlg.value = true }
async function doCreate() {
  const r = await request.post('/payout/payouts', form);
  if (r.code === 200) { ElMessage.success('已创建'); dlg.value = false; loadList(); }
}
onMounted(() => { loadList(); loadSources() })
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; }
</style>
