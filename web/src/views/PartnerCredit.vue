<template>
  <div class="partner-credit">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2>合作方信用档案</h2>
        <p>合作伙伴信用评级与风险等级管理</p>
      </div>
      <div>
        <el-button type="success" size="small" @click="autoSync" style="margin-right: 8px;">
          <el-icon><Refresh /></el-icon> 自动同步
        </el-button>
        <el-button v-if="canManage" type="primary" size="small" @click="showDialog = true">
          <el-icon><Plus /></el-icon> 新增档案
        </el-button>
      </div>
    </div>

    <!-- KPI卡片 -->
    <el-row :gutter="16" style="margin-bottom: 20px;">
      <el-col :xs="12" :sm="6" v-for="kpi in kpis" :key="kpi.label">
        <el-card shadow="hover">
          <div style="text-align: center;">
            <div style="font-size: 13px; color: #909399;">{{ kpi.label }}</div>
            <div style="font-size: 24px; font-weight: 700; margin-top: 8px;" :style="{ color: kpi.color }">
              {{ kpi.value }}
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 合作方列表 -->
    <el-card>
      <template #header><strong>合作方档案</strong></template>
      <el-table :data="partners" stripe>
        <el-table-column prop="partner_name" label="合作方名称" min-width="200" />
        <el-table-column prop="contact_person" label="联系人" width="100" />
        <el-table-column prop="contact_phone" label="电话" width="120" />
        <el-table-column label="信用评级" width="100">
          <template #default="{ row }">
            <el-tag :type="getRatingType(row.credit_rating)" size="small">{{ row.credit_rating }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="风险等级" width="100">
          <template #default="{ row }">
            <el-tag :type="getRiskType(row.risk_level)" size="small">{{ row.risk_level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_contracts" label="合同数" width="90" />
        <el-table-column label="总金额" width="120">
          <template #default="{ row }">
            ¥{{ formatAmount(row.total_amount) }}
          </template>
        </el-table-column>
        <el-table-column label="准时率" width="90">
          <template #default="{ row }">
            {{ row.on_time_rate }}%
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="viewDetail(row)">查看</el-button>
            <el-button v-if="canManage" size="small" type="primary" @click="editPartner(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="showDialog" :title="editMode ? '编辑档案' : '新增档案'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="合作方名称">
          <el-input v-model="form.partner_name" />
        </el-form-item>
        <el-form-item label="社会信用代码">
          <el-input v-model="form.social_credit_code" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contact_person" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.contact_phone" />
        </el-form-item>
        <el-form-item label="信用评级">
          <el-select v-model="form.credit_rating" style="width: 100%;">
            <el-option label="A" value="A" />
            <el-option label="B" value="B" />
            <el-option label="C" value="C" />
            <el-option label="D" value="D" />
          </el-select>
        </el-form-item>
        <el-form-item label="风险等级">
          <el-select v-model="form.risk_level" style="width: 100%;">
            <el-option label="低" value="低" />
            <el-option label="中" value="中" />
            <el-option label="高" value="高" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submitForm">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const canManage = computed(() => ['超级管理员', '总经理', '副总', '行政部经理', '法务专员'].includes(auth.user?.role));

const kpis = ref([]);
const partners = ref([]);
const showDialog = ref(false);
const editMode = ref(false);
const editId = ref(null);
const form = ref({
  partner_name: '',
  social_credit_code: '',
  contact_person: '',
  contact_phone: '',
  credit_rating: 'C',
  risk_level: '中',
  remark: ''
});

function formatAmount(amount) {
  if (!amount) return '0';
  if (amount >= 10000) return (amount / 10000).toFixed(1) + '万';
  return amount.toLocaleString();
}

function getRatingType(rating) {
  const map = { 'A': 'success', 'B': 'primary', 'C': 'warning', 'D': 'danger' };
  return map[rating] || 'info';
}

function getRiskType(level) {
  const map = { '低': 'success', '中': 'warning', '高': 'danger' };
  return map[level] || 'info';
}

async function loadData() {
  try {
    const [statsRes, listRes] = await Promise.all([
      request.get('/partner-credit/stats'),
      request.get('/partner-credit')
    ]);

    if (statsRes.data.success) {
      const s = statsRes.data.data;
      kpis.value = [
        { label: '合作方总数', value: s.total, color: '#2563eb' },
        { label: '合同总金额', value: formatAmount(s.totalAmount), color: '#10b981' },
        { label: '平均准时率', value: s.avgOnTimeRate + '%', color: '#f59e0b' },
        { label: 'A级合作方', value: s.aLevel, color: '#8b5cf6' }
      ];
    }

    if (listRes.data.success) {
      partners.value = listRes.data.data;
    }
  } catch (e) {
    console.error('加载数据失败:', e);
  }
}

async function autoSync() {
  try {
    const res = await request.post('/partner-credit/auto-sync');
    if (res.data.success) {
      ElMessage.success(res.data.message || '同步成功');
      loadData();
    } else {
      ElMessage.error(res.data.message || '同步失败');
    }
  } catch (e) {
    ElMessage.error('同步失败');
  }
}

function viewDetail(row) {
  ElMessage.info('查看详情功能');
}

function editPartner(row) {
  editMode.value = true;
  editId.value = row.id;
  form.value = { ...row };
  showDialog.value = true;
}

async function submitForm() {
  try {
    const url = editMode.value ? `/partner-credit/${editId.value}` : '/partner-credit';
    const method = editMode.value ? 'put' : 'post';
    
    const res = await request[method](url, form.value);
    if (res.data.success) {
      ElMessage.success(editMode.value ? '更新成功' : '创建成功');
      showDialog.value = false;
      editMode.value = false;
      form.value = {
        partner_name: '',
        social_credit_code: '',
        contact_person: '',
        contact_phone: '',
        credit_rating: 'C',
        risk_level: '中',
        remark: ''
      };
      loadData();
    } else {
      ElMessage.error(res.data.message || '操作失败');
    }
  } catch (e) {
    ElMessage.error('操作失败');
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.partner-credit {
  padding: 20px;
}
</style>
