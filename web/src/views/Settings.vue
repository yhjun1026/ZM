<template>
  <div class="settings-page">
    <div class="grid-2">
      <!-- 修改密码 -->
      <div class="card">
        <div class="card-header">
          <h3><el-icon color="#2563eb" style="margin-right:8px;vertical-align:-2px;"><Key /></el-icon>修改密码</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label>旧密码</label>
            <el-input v-model="pwd.old" type="password" show-password placeholder="请输入当前密码" />
          </div>
          <div class="form-group">
            <label>新密码</label>
            <el-input v-model="pwd.newPwd" type="password" show-password placeholder="6位以上，字母+数字" />
          </div>
          <div class="form-group">
            <label>确认新密码</label>
            <el-input v-model="pwd.confirm" type="password" show-password placeholder="再次输入新密码" />
          </div>
          <el-button type="primary" :loading="pwdLoading" @click="changePassword">
            <el-icon style="margin-right:4px;"><Check /></el-icon>确认修改
          </el-button>
        </div>
      </div>

      <!-- 个人信息 -->
      <div class="card">
        <div class="card-header">
          <h3><el-icon color="#3b82f6" style="margin-right:8px;vertical-align:-2px;"><User /></el-icon>个人信息</h3>
        </div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
            <div class="avatar-circle" :style="{ background: avatarColor }">{{ avatarText }}</div>
            <div>
              <div style="font-size:18px;font-weight:700;">{{ u.name }}</div>
              <div style="color:#9ca3af;font-size:13px;">{{ u.dept }} · {{ u.role }}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="info-item"><span class="info-label">工号</span><span class="info-value">{{ u.id || '—' }}</span></div>
            <div class="info-item"><span class="info-label">部门</span><span class="info-value">{{ u.dept || '—' }}</span></div>
            <div class="info-item"><span class="info-label">角色</span><span class="info-value">{{ u.role || '—' }}</span></div>
            <div class="info-item"><span class="info-label">手机</span><span class="info-value">{{ u.phone || '—' }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 公司信息 -->
    <div class="card mt-16">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <h3><el-icon color="#f59e0b" style="margin-right:8px;vertical-align:-2px;"><OfficeBuilding /></el-icon>公司信息</h3>
        <el-button v-if="isSuperAdmin" type="primary" size="small" @click="toggleCompanyEdit">
          <el-icon style="margin-right:4px;"><component :is="editMode ? View : Edit" /></el-icon>{{ editMode ? '查看' : '编辑' }}
        </el-button>
        <el-tag v-else type="primary">仅超级管理员可编辑</el-tag>
      </div>
      <div class="card-body">
        <!-- 查看模式 -->
        <template v-if="!editMode">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;">
            <div v-for="f in viewFields" :key="f.key" class="info-item">
              <span class="info-label">{{ f.label }}</span>
              <span class="info-value">{{ company[f.key] || '—' }}</span>
            </div>
          </div>
          <div class="info-item" style="margin-top:12px;">
            <span class="info-label">经营范围</span>
            <span class="info-value">{{ company.business_scope || '—' }}</span>
          </div>
          <div class="info-item" style="margin-top:12px;">
            <span class="info-label">备注</span>
            <span class="info-value">{{ company.remark || '—' }}</span>
          </div>
        </template>

        <!-- 编辑模式 -->
        <template v-else>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label>公司名称 *</label>
              <el-input v-model="editForm.company_name" />
            </div>
            <div class="form-group">
              <label>公司简称</label>
              <el-input v-model="editForm.short_name" />
            </div>
            <div class="form-group">
              <label>统一社会信用代码</label>
              <el-input v-model="editForm.credit_code" />
            </div>
            <div class="form-group">
              <label>法定代表人</label>
              <el-input v-model="editForm.legal_person" />
            </div>
            <div class="form-group">
              <label>注册资本</label>
              <el-input v-model="editForm.registered_capital" placeholder="如: 1000万元" />
            </div>
            <div class="form-group">
              <label>成立日期</label>
              <el-date-picker v-model="editForm.established_date" type="date" value-format="YYYY-MM-DD" style="width:100%;" />
            </div>
            <div class="form-group">
              <label>注册地址</label>
              <el-input v-model="editForm.registered_address" />
            </div>
            <div class="form-group">
              <label>办公地址</label>
              <el-input v-model="editForm.office_address" />
            </div>
            <div class="form-group">
              <label>联系电话</label>
              <el-input v-model="editForm.phone" />
            </div>
            <div class="form-group">
              <label>传真</label>
              <el-input v-model="editForm.fax" />
            </div>
            <div class="form-group">
              <label>电子邮箱</label>
              <el-input v-model="editForm.email" type="email" />
            </div>
            <div class="form-group">
              <label>公司网址</label>
              <el-input v-model="editForm.website" />
            </div>
            <div class="form-group">
              <label>开户银行</label>
              <el-input v-model="editForm.bank_name" />
            </div>
            <div class="form-group">
              <label>银行账号</label>
              <el-input v-model="editForm.bank_account" />
            </div>
            <div class="form-group">
              <label>税务登记号</label>
              <el-input v-model="editForm.tax_number" />
            </div>
            <div class="form-group">
              <label>发票抬头</label>
              <el-input v-model="editForm.invoice_title" />
            </div>
          </div>
          <div class="form-group" style="margin-top:12px;">
            <label>经营范围</label>
            <el-input v-model="editForm.business_scope" type="textarea" :rows="3" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <el-input v-model="editForm.remark" type="textarea" :rows="2" />
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;">
            <el-button @click="toggleCompanyEdit">取消</el-button>
            <el-button type="primary" :loading="saveLoading" @click="saveCompanyInfo">
              <el-icon style="margin-right:4px;"><Check /></el-icon>保存公司信息
            </el-button>
          </div>
        </template>
      </div>
    </div>

    <!-- 系统信息 -->
    <div class="card mt-16">
      <div class="card-header">
        <h3><el-icon color="#10b981" style="margin-right:8px;vertical-align:-2px;"><InfoFilled /></el-icon>系统信息</h3>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
          <div class="info-item"><span class="info-label">系统名称</span><span class="info-value">卓盟智办公平台 V3.0</span></div>
          <div class="info-item"><span class="info-label">版本号</span><span class="info-value">v3.0.0</span></div>
          <div class="info-item"><span class="info-label">运行环境</span><span class="info-value">Node.js + Express</span></div>
          <div class="info-item"><span class="info-label">数据库</span><span class="info-value">SQLite3</span></div>
          <div class="info-item"><span class="info-label">部署状态</span><span class="info-value"><el-tag type="success">正常运行</el-tag></span></div>
          <div class="info-item"><span class="info-label">开发单位</span><span class="info-value">四川卓盟科技有限公司</span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Key, User, OfficeBuilding, InfoFilled, Edit, View, Check } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const u = computed(() => auth.user || {});
const isSuperAdmin = computed(() => u.value.role === '超级管理员');
const avatarColor = computed(() => u.value.avatarColor || u.value.avatar_color || '#2563eb');
const avatarText = computed(() => u.value.avatar || (u.value.name || '?').charAt(0));

/* ===== 修改密码 ===== */
const pwd = reactive({ old: '', newPwd: '', confirm: '' });
const pwdLoading = ref(false);

async function changePassword() {
  if (!pwd.old || !pwd.newPwd) { ElMessage.warning('请填写完整'); return; }
  if (pwd.newPwd !== pwd.confirm) { ElMessage.warning('两次密码不一致'); return; }
  if (pwd.newPwd.length < 6) { ElMessage.warning('密码不低于6位'); return; }
  pwdLoading.value = true;
  try {
    const res = await request.post('/auth/change-password', { oldPassword: pwd.old, newPassword: pwd.newPwd });
    if (res && (res.code === 200 || res.success === true)) {
      ElMessage.success('密码修改成功');
      pwd.old = ''; pwd.newPwd = ''; pwd.confirm = '';
    } else {
      ElMessage.error((res && (res.msg || res.message)) || '修改失败');
    }
  } finally {
    pwdLoading.value = false;
  }
}

/* ===== 公司信息 ===== */
const company = ref({});
const editMode = ref(false);
const saveLoading = ref(false);

const viewFields = [
  { key: 'company_name', label: '公司名称' },
  { key: 'short_name', label: '公司简称' },
  { key: 'credit_code', label: '统一社会信用代码' },
  { key: 'legal_person', label: '法定代表人' },
  { key: 'registered_capital', label: '注册资本' },
  { key: 'established_date', label: '成立日期' },
  { key: 'registered_address', label: '注册地址' },
  { key: 'office_address', label: '办公地址' },
  { key: 'phone', label: '联系电话' },
  { key: 'fax', label: '传真' },
  { key: 'email', label: '电子邮箱' },
  { key: 'website', label: '公司网址' },
  { key: 'bank_name', label: '开户银行' },
  { key: 'bank_account', label: '银行账号' },
  { key: 'tax_number', label: '税务登记号' },
  { key: 'invoice_title', label: '发票抬头' },
];

const editForm = reactive({
  company_name: '', short_name: '', credit_code: '', legal_person: '',
  registered_capital: '', established_date: '', registered_address: '', office_address: '',
  phone: '', fax: '', email: '', website: '', business_scope: '',
  bank_name: '', bank_account: '', tax_number: '', invoice_title: '', remark: '',
});

async function loadCompanyInfo() {
  try {
    const res = await request.get('/system-settings');
    if (res && (res.code === 200 || res.success === true) && res.data) {
      company.value = res.data;
    }
  } catch (e) {
    console.error('loadCompanyInfo error:', e);
  }
}

function toggleCompanyEdit() {
  if (!editMode.value) {
    // 进入编辑：回填当前数据
    const d = company.value || {};
    Object.keys(editForm).forEach(k => { editForm[k] = d[k] || ''; });
    editMode.value = true;
  } else {
    editMode.value = false;
  }
}

async function saveCompanyInfo() {
  const data = {};
  Object.keys(editForm).forEach(k => {
    const v = editForm[k];
    data[k] = typeof v === 'string' ? v.trim() : (v || '');
  });
  if (!data.company_name) { ElMessage.warning('请填写公司名称'); return; }
  saveLoading.value = true;
  try {
    const res = await request.put('/system-settings', data);
    if (res && (res.code === 200 || res.success === true)) {
      ElMessage.success('公司信息已保存');
      editMode.value = false;
      loadCompanyInfo();
    } else {
      ElMessage.error((res && (res.msg || res.message)) || '保存失败');
    }
  } finally {
    saveLoading.value = false;
  }
}

onMounted(() => {
  loadCompanyInfo();
});
</script>

<style scoped>
.settings-page { padding-bottom: 20px; }
.mt-16 { margin-top: 16px; }

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1);
  overflow: hidden;
  transition: all .2s;
}
.card:hover { box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1); }
.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}
.card-header h3 { font-size: 15px; font-weight: 600; margin: 0; }
.card-body { padding: 20px; }

.form-group { margin-bottom: 14px; }
.form-group label {
  display: block; font-size: 13px; font-weight: 500;
  color: #374151; margin-bottom: 6px;
}

.avatar-circle {
  width: 64px; height: 64px; border-radius: 50%;
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 700;
  flex-shrink: 0;
}

.info-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 16px; background: #f9fafb;
  border-radius: 6px;
}
.info-label { font-size: 12px; color: #9ca3af; font-weight: 500; }
.info-value { font-size: 14px; color: #1f2937; font-weight: 600; word-break: break-all; }

@media (max-width: 992px) {
  .grid-2 { grid-template-columns: 1fr; }
}
</style>
