<template>
  <el-container style="height: 100vh">
    <!-- 桌面端侧栏 -->
    <el-aside v-if="!isMobile" width="220px" class="sidebar">
      <div class="logo">卓盟智办公</div>
      <el-menu :default-active="$route.path" router background-color="#1f2937" text-color="#cbd5e1" active-text-color="#60a5fa">
        <template v-for="group in moduleGroups" :key="group.title">
          <div class="menu-group-title">{{ group.title }}</div>
          <el-menu-item v-for="m in group.items" :key="m.path" :index="m.path">
            <el-icon><component :is="m.icon" /></el-icon>
            <span>{{ m.title }}</span>
            <el-badge v-if="m.badge" :value="badges[m.badge] || 0" class="menu-badge" />
          </el-menu-item>
        </template>
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
        <template v-for="group in moduleGroups" :key="group.title">
          <div class="menu-group-title">{{ group.title }}</div>
          <el-menu-item v-for="m in group.items" :key="m.path" :index="m.path">
            <el-icon><component :is="m.icon" /></el-icon>
            <span>{{ m.title }}</span>
            <el-badge v-if="m.badge" :value="badges[m.badge] || 0" class="menu-badge" />
          </el-menu-item>
        </template>
      </el-menu>
    </el-drawer>
  </el-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { moduleGroups } from '../config/modules';
import { useAuthStore } from '../stores/auth';
import { useDevice } from '../composables/useDevice';
import request from '../api/request';

const auth = useAuthStore();
const router = useRouter();
const { isMobile } = useDevice();
const drawer = ref(false);

// Badge数字提醒
const badges = ref({
  pendingReports: 0,
  pendingContracts: 0,
  activeProjects: 0,
  pendingLogistics: 0,
  pendingDocuments: 0,
  pendingFinance: 0,
  pendingAnnouncements: 0
});

// 获取badge数字
async function loadBadges() {
  try {
    const res = await request.get('/dashboard');
    if (res.data.success) {
      const data = res.data.data;
      // 从工作台数据中提取badge数字
      badges.value = {
        pendingReports: data.stats?.pendingReports || 0,
        pendingContracts: data.stats?.pendingContracts || 0,
        activeProjects: data.stats?.activeProjects || 0,
        pendingLogistics: data.stats?.pendingLogistics || 0,
        pendingDocuments: data.stats?.pendingDocuments || 0,
        pendingFinance: data.stats?.pendingFinance || 0,
        pendingAnnouncements: data.stats?.pendingAnnouncements || 0
      };
    }
  } catch (e) {
    console.error('加载badge数字失败:', e);
  }
}

async function onLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  await auth.logout();
  router.push('/login');
}

onMounted(() => {
  loadBadges();
  // 定期刷新badge（每5分钟）
  setInterval(loadBadges, 5 * 60 * 1000);
});
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
  border-bottom: 1px solid #374151;
}

.sidebar :deep(.el-menu) {
  border-right: none;
}

.menu-group-title {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 16px 20px 8px;
  letter-spacing: 0.5px;
  user-select: none;
}

.menu-group-title:first-child {
  padding-top: 12px;
}

.menu-badge {
  margin-left: 8px;
}

.menu-badge :deep(.el-badge__content) {
  background: #ef4444;
  font-size: 11px;
  height: 16px;
  line-height: 16px;
  padding: 0 5px;
}

.topbar {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  padding: 0 16px;
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

.mobile-main {
  padding: 10px !important;
}

/* 移动端抽屉样式 */
:deep(.el-drawer) {
  background: #1f2937;
}

:deep(.el-drawer__body) {
  padding: 0;
}

/* 移动端菜单项样式 */
:deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .topbar {
    padding: 0 12px;
  }

  .page-title {
    font-size: 15px;
  }

  .mobile-main {
    padding: 8px !important;
  }

  .user-area {
    gap: 6px;
  }
}
</style>
