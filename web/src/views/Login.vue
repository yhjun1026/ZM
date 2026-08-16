<template>
  <div class="login-wrap">
    <el-card class="login-card">
      <h2 class="title">卓盟智办公</h2>
      <p class="subtitle">智能办公管理平台</p>
      <el-form :model="form" label-position="top" @submit.prevent="onLogin">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="工号" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="onLogin"
          />
        </el-form-item>
        <el-button type="primary" :loading="loading" style="width: 100%" @click="onLogin">登 录</el-button>
      </el-form>
      <p class="hint">演示账号：ZM001 / zm2026（总经理）· ZM006 / xz2026（行政部）· ZM019 / xz2026（普通员工）· ZM026 / cw2026（财务部）</p>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const form = reactive({ username: 'ZM001', password: 'zm2026' });
const loading = ref(false);
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

async function onLogin() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  const res = await auth.login(form.username, form.password);
  loading.value = false;
  if (res.success) {
    ElMessage.success('登录成功');
    router.push(route.query.redirect || '/dashboard');
  } else {
    ElMessage.error(res.message || '登录失败');
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e3a8a, #2563eb);
  padding: 16px;
}
.login-card {
  width: 90%;
  max-width: 380px;
}
.title {
  text-align: center;
  margin: 0 0 6px;
  color: #1f2937;
}
.subtitle {
  text-align: center;
  color: #909399;
  margin: 0 0 24px;
  font-size: 13px;
}
.hint {
  text-align: center;
  color: #c0c4cc;
  font-size: 12px;
  margin: 16px 0 0;
}

@media (max-width: 480px) {
  .login-card {
    width: 95%;
  }
  .title {
    font-size: 20px;
  }
  .subtitle {
    font-size: 12px;
  }
}
</style>
