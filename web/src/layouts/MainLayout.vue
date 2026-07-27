<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" class="sidebar">
      <div class="logo">卓盟智办公</div>
      <el-menu
        :default-active="$route.path"
        router
        background-color="#1f2937"
        text-color="#cbd5e1"
        active-text-color="#60a5fa"
      >
        <el-menu-item v-for="m in modules" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="topbar">
        <div class="page-title">{{ $route.meta.title || '卓盟智办公' }}</div>
        <div class="user-area">
          <el-avatar :size="30" style="background: #2563eb;">{{ auth.avatar }}</el-avatar>
          <span class="user-name">{{ auth.userName }}</span>
          <el-tag size="small" type="info">{{ auth.userRole }}</el-tag>
          <el-button text @click="onLogout"><el-icon><SwitchButton /></el-icon> 退出</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { modules } from '../config/modules';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

async function onLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  await auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.sidebar {
  background: #1f2937;
  overflow-y: auto;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 1px;
  border-bottom: 1px solid #374151;
}
.sidebar .el-menu {
  border-right: none;
}
.topbar {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.page-title {
  font-size: 16px;
  font-weight: 600;
}
.user-area {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-name {
  font-size: 14px;
  font-weight: 600;
}
</style>
