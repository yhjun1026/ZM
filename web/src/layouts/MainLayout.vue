<template>
  <el-container style="height: 100vh">
    <!-- 桌面端侧栏 -->
    <el-aside v-if="!isMobile" width="220px" class="sidebar">
      <div class="logo">卓盟智办公</div>
      <el-menu :default-active="$route.path" router background-color="#1f2937" text-color="#cbd5e1" active-text-color="#60a5fa">
        <el-menu-item v-for="m in modules" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div style="display: flex; align-items: center; gap: 12px;">
          <el-icon v-if="isMobile" :size="22" style="cursor: pointer;" @click="drawer = true"><Menu /></el-icon>
          <div class="page-title">{{ $route.meta.title || '卓盟智办公' }}</div>
        </div>
        <div class="user-area">
          <el-avatar :size="30" style="background: #2563eb;">{{ auth.avatar }}</el-avatar>
          <span v-if="!isMobile" class="user-name">{{ auth.userName }}</span>
          <el-button text @click="onLogout"><el-icon><SwitchButton /></el-icon><span v-if="!isMobile"> 退出</span></el-button>
        </div>
      </el-header>
      <el-main :class="{ 'mobile-main': isMobile }">
        <router-view />
      </el-main>
    </el-container>

    <!-- 移动端抽屉菜单 -->
    <el-drawer v-model="drawer" direction="ltr" size="240px" :with-header="false">
      <div class="logo" style="background:#1f2937;">卓盟智办公</div>
      <el-menu :default-active="$route.path" router @select="drawer = false" background-color="#1f2937" text-color="#cbd5e1" active-text-color="#60a5fa" style="border-right:none;">
        <el-menu-item v-for="m in modules" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-drawer>
  </el-container>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { modules } from '../config/modules';
import { useAuthStore } from '../stores/auth';
import { useDevice } from '../composables/useDevice';

const auth = useAuthStore();
const router = useRouter();
const { isMobile } = useDevice();
const drawer = ref(false);

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
.sidebar { background: #1f2937; overflow-y: auto; }
.logo { height: 60px; line-height: 60px; text-align: center; color: #fff; font-size: 17px; font-weight: 700; border-bottom: 1px solid #374151; }
.sidebar :deep(.el-menu) { border-right: none; }
.topbar { background: #fff; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.page-title { font-size: 16px; font-weight: 600; }
.user-area { display: flex; align-items: center; gap: 10px; }
.user-name { font-size: 14px; font-weight: 600; }
.mobile-main { padding: 10px !important; }
</style>
