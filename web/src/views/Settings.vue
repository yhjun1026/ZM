<template>
  <div class="settings-page">
    <div class="page-header">
      <h2>系统设置</h2>
      <p>公司信息与密码管理</p>
    </div>

    <el-row :gutter="20">
      <!-- 修改密码 -->
      <el-col :xs="24" :lg="12">
        <el-card>
          <template #header>
            <strong><i class="el-icon-key"></i> 修改密码</strong>
          </template>
          <el-form :model="passwordForm" :rules="passwordRules" ref="passwordFormRef" label-width="100px">
            <el-form-item label="当前密码" prop="oldPassword">
              <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入当前密码" />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="6位以上，字母+数字" />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="passwordLoading" @click="handleChangePassword">确认修改</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 个人信息 -->
      <el-col :xs="24" :lg="12">
        <el-card>
          <template #header>
            <strong><i class="el-icon-user"></i> 个人信息</strong>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="姓名">{{ auth.userName }}</el-descriptions-item>
            <el-descriptions-item label="部门">{{ auth.user?.dept }}</el-descriptions-item>
            <el-descriptions-item label="角色">{{ auth.user?.role }}</el-descriptions-item>
            <el-descriptions-item label="工号">{{ auth.user?.id }}</el-descriptions-item>
            <el-descriptions-item label="手机">{{ auth.user?.phone }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <!-- 公司信息（仅超级管理员可编辑） -->
    <el-card style="margin-top: 20px;">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong><i class="el-icon-office-building"></i> 公司信息</strong>
          <el-button v-if="canEdit" :type="editMode ? 'success' : 'primary'" size="small" @click="toggleEdit">
            {{ editMode ? '保存' : '编辑' }}
          </el-button>
        </div>
      </template>
      <el-form :model="companyForm" ref="companyFormRef" label-width="120px" :disabled="!editMode">
        <el-row :gutter="20">
          <el-col :xs="24" :lg="12">
            <el-form-item label="公司名称">
              <el-input v-model="companyForm.company_name" />
            </el-form-item>
            <el-form-item label="公司简称">
              <el-input v-model="companyForm.short_name" />
            </el-form-item>
            <el-form-item label="统一社会信用代码">
              <el-input v-model="companyForm.credit_code" />
            </el-form-item>
            <el-form-item label="法定代表人">
              <el-input v-model="companyForm.legal_person" />
            </el-form-item>
            <el-form-item label="注册资本">
              <el-input v-model="companyForm.registered_capital" />
            </el-form-item>
            <el-form-item label="成立日期">
              <el-input v-model="companyForm.established_date" />
            </el-form-item>
            <el-form-item label="注册地址">
              <el-input v-model="companyForm.registered_address" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="办公地址">
              <el-input v-model="companyForm.office_address" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-form-item label="联系电话">
              <el-input v-model="companyForm.phone" />
            </el-form-item>
            <el-form-item label="传真">
              <el-input v-model="companyForm.fax" />
            </el-form-item>
            <el-form-item label="电子邮箱">
              <el-input v-model="companyForm.email" />
            </el-form-item>
            <el-form-item label="公司网址">
              <el-input v-model="companyForm.website" />
            </el-form-item>
            <el-form-item label="开户银行">
              <el-input v-model="companyForm.bank_name" />
            </el-form-item>
            <el-form-item label="银行账号">
              <el-input v-model="companyForm.bank_account" />
            </el-form-item>
            <el-form-item label="税务登记号">
              <el-input v-model="companyForm.tax_number" />
            </el-form-item>
            <el-form-item label="发票抬头">
              <el-input v-model="companyForm.invoice_title" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="经营范围">
          <el-input v-model="companyForm.business_scope" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="companyForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 系统信息 -->
    <el-card style="margin-top: 20px;">
      <template #header>
        <strong><i class="el-icon-info"></i> 系统信息</strong>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="系统名称">卓盟智办公平台 V3.0</el-descriptions-item>
        <el-descriptions-item label="版本号">v3.0.0</el-descriptions-item>
        <el-descriptions-item label="运行环境">Node.js + Express</el-descriptions-item>
        <el-descriptions-item label="数据库">SQLite3</el-descriptions-item>
        <el-descriptions-item label="部署状态">正常运行</el-descriptions-item>
        <el-descriptions-item label="开发单位">四川卓盟科技有限公司</el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import request from '../api/request';

const auth = useAuthStore();
const canEdit = computed(() => auth.user?.role === '超级管理员');

const editMode = ref(false);
const passwordLoading = ref(false);

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
};

const companyForm = reactive({
  company_name: '',
  short_name: '',
  credit_code: '',
  legal_person: '',
  registered_capital: '',
  established_date: '',
  registered_address: '',
  office_address: '',
  phone: '',
  fax: '',
  email: '',
  website: '',
  business_scope: '',
  bank_name: '',
  bank_account: '',
  tax_number: '',
  invoice_title: '',
  remark: ''
});

async function loadCompanyInfo() {
  try {
    const res = await request.get('/settings/company-info');
    if (res.data.success) {
      Object.assign(companyForm, res.data.data);
    }
  } catch (e) {
    console.error('加载公司信息失败:', e);
  }
}

function toggleEdit() {
  if (editMode.value) {
    saveCompanyInfo();
  } else {
    editMode.value = true;
  }
}

async function saveCompanyInfo() {
  try {
    const res = await request.put('/settings/company-info', companyForm);
    if (res.data.success) {
      ElMessage.success('公司信息已更新');
      editMode.value = false;
      loadCompanyInfo();
    } else {
      ElMessage.error(res.data.message || '更新失败');
    }
  } catch (e) {
    ElMessage.error('更新失败');
  }
}

async function handleChangePassword() {
  if (!passwordForm.oldPassword || !passwordForm.newPassword) {
    ElMessage.warning('请填写完整');
    return;
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    ElMessage.warning('两次密码不一致');
    return;
  }

  passwordLoading.value = true;
  try {
    const res = await request.post('/settings/change-password', {
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    });

    if (res.data.success) {
      ElMessage.success('密码修改成功');
      passwordForm.oldPassword = '';
      passwordForm.newPassword = '';
      passwordForm.confirmPassword = '';
    } else {
      ElMessage.error(res.data.message || '修改失败');
    }
  } catch (e) {
    ElMessage.error('修改失败');
  } finally {
    passwordLoading.value = false;
  }
}

onMounted(() => {
  loadCompanyInfo();
});
</script>

<style scoped>
.settings-page {
  padding: 20px;
}
</style>