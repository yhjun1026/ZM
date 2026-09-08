<template>
  <div class="page">
    <div class="page-header"><h2>资产台账</h2><el-button type="primary" @click="openCreate">+ 新增资产</el-button></div>
    <el-row :gutter="8" style="margin-bottom:8px">
      <el-col :span="4"><el-input v-model="f.keyword" placeholder="名称/编号/序列号" size="small" clearable /></el-col>
      <el-col :span="4"><el-select v-model="f.category" placeholder="分类" clearable size="small"><el-option label="办公设备" value="办公设备" /><el-option label="电子设备" value="电子设备" /><el-option label="家具" value="家具" /><el-option label="其他" value="其他" /></el-select></el-col>
      <el-col :span="4"><el-select v-model="f.status" placeholder="状态" clearable size="small"><el-option label="在用" value="在用" /><el-option label="闲置" value="闲置" /><el-option label="已报废" value="已报废" /><el-option label="已调拨" value="已调拨" /></el-select></el-col>
      <el-col :span="4"><el-button @click="loadList" type="primary" size="small">查询</el-button></el-col>
    </el-row>
    <el-table :data="list" border>
      <el-table-column prop="asset_no" label="编号" width="150" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="category" label="分类" width="100" />
      <el-table-column prop="brand" label="品牌" width="100" />
      <el-table-column prop="model" label="型号" width="100" />
      <el-table-column prop="serial_no" label="序列号" width="120" />
      <el-table-column prop="purchase_amount" label="金额(元)" width="100" />
      <el-table-column prop="custodian_name" label="保管人" width="100" />
      <el-table-column prop="dept_name" label="部门" width="120" />
      <el-table-column prop="location" label="位置" width="100" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }"><el-tag :type="row.status==='在用'?'success':(row.status==='已报废'?'danger':'info')" size="small">{{ row.status }}</el-tag></template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" title="新增资产" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="分类"><el-select v-model="form.category"><el-option label="办公设备" value="办公设备" /><el-option label="电子设备" value="电子设备" /><el-option label="家具" value="家具" /><el-option label="其他" value="其他" /></el-select></el-form-item>
        <el-form-item label="品牌"><el-input v-model="form.brand" /></el-form-item>
        <el-form-item label="型号"><el-input v-model="form.model" /></el-form-item>
        <el-form-item label="序列号"><el-input v-model="form.serial_no" /></el-form-item>
        <el-form-item label="采购日期"><el-input v-model="form.purchase_date" placeholder="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="采购金额(元)"><el-input-number v-model="form.purchase_amount" :precision="2" /></el-form-item>
        <el-form-item label="位置"><el-input v-model="form.location" /></el-form-item>
        <el-form-item label="保管人工号"><el-input v-model="form.custodian_id" placeholder="如 ZM001" /></el-form-item>
        <el-form-item label="部门ID"><el-input-number v-model="form.dept_id" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status"><el-option label="在用" value="在用" /><el-option label="闲置" value="闲置" /></el-select></el-form-item>
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
const f = reactive({ keyword: '', category: '', status: '' })
const dlg = ref(false)
const form = reactive({ name: '', category: '办公设备', brand: '', model: '', serial_no: '', purchase_date: '', purchase_amount: 0, location: '', custodian_id: '', dept_id: null, status: '在用' })

async function loadList() { const r = await request.get('/assets-ledger', { params: f }); list.value = r.data?.list || [] }
function openCreate() { Object.assign(form, { name: '', category: '办公设备', brand: '', model: '', serial_no: '', purchase_date: '', purchase_amount: 0, location: '', custodian_id: '', dept_id: null, status: '在用' }); dlg.value = true }
async function doCreate() {
  if (!form.name) return ElMessage.warning('请填名称');
  const payload = { ...form, custodian_id: form.custodian_id ? parseInt(form.custodian_id) || null : null };
  const r = await request.post('/assets-ledger', payload);
  if (r.code === 200) { ElMessage.success('已建档'); dlg.value = false; loadList(); }
}
onMounted(() => loadList())
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; }
</style>
