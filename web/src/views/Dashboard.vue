<template>
  <div>
    <div class="page-header"><h2>工作台</h2><p>今日办公概览</p></div>

    <!-- 欢迎栏 -->
    <el-card v-if="!isMobile" class="welcome-card" style="margin-bottom: 16px; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff;">
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;">
          {{ auth.avatar }}
        </div>
        <div>
          <h2 style="margin: 0; font-size: 22px;">{{ auth.userName }}，欢迎回来</h2>
          <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">{{ auth.user?.dept }} · {{ auth.user?.role }} · {{ today }}</p>
        </div>
      </div>
    </el-card>

    <!-- 统计卡片（8个） -->
    <el-row v-if="!isMobile" :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6" v-for="c in cards" :key="c.label">
        <el-card shadow="hover">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 13px; color: #909399;">{{ c.label }}</div>
              <div style="font-size: 22px; font-weight: 700; margin-top: 6px;" :style="{ color: c.color }">{{ c.value }}</div>
            </div>
            <div :style="{ width: '44px', height: '44px', borderRadius: '12px', background: c.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }">
              <el-icon :size="20" :style="{ color: c.color }"><component :is="c.icon" /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 移动端统计卡片 -->
    <div v-else class="mobile-stats-grid">
      <div v-for="c in cards" :key="c.label" class="mobile-stat-item" :style="{ borderColor: c.color }">
        <el-icon :size="28" :style="{ color: c.color }"><component :is="c.icon" /></el-icon>
        <div class="stat-value">{{ c.value }}</div>
        <div class="stat-label">{{ c.label }}</div>
      </div>
    </div>

    <!-- 公司文件 + 快捷操作 -->
    <el-row :gutter="16">
      <el-col :span="isMobile ? 24 : 12">
        <el-card>
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span>公司文件</span>
              <el-button text type="primary" @click="$router.push('/documents')">查看全部</el-button>
            </div>
          </template>
          <div v-for="doc in documents" :key="doc.id" style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <el-tag size="small" style="margin-right: 8px;">{{ doc.type }}</el-tag>
                <strong>{{ doc.title }}</strong>
              </div>
              <span style="color: #909399; font-size: 13px;">{{ doc.date }}</span>
            </div>
            <p style="margin: 4px 0 0; font-size: 13px; color: #909399;">作者：{{ doc.author }} · 部门：{{ doc.dept }}</p>
          </div>
          <el-empty v-if="!documents.length" description="暂无文件" :image-size="60" />
        </el-card>
      </el-col>

      <el-col :span="isMobile ? 24 : 12" :style="{ marginTop: isMobile ? '16px' : 0 }">
        <el-card>
          <template #header>快捷操作</template>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div v-for="action in quickActions" :key="action.path" class="quick-action" @click="$router.push(action.path)">
              <div style="text-align: center; padding: 16px; border-radius: 12px; cursor: pointer; transition: all 0.3s;" :style="{ background: action.bgColor }">
                <el-icon :size="24" :style="{ color: action.color }"><component :is="action.icon" /></el-icon>
                <p style="margin: 8px 0 0; font-size: 13px;">{{ action.label }}</p>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useDevice } from '../composables/useDevice';
import request from '../api/request';

const auth = useAuthStore();
const { isMobile } = useDevice();
const stats = ref({});
const documents = ref([]);

const today = computed(() => new Date().toLocaleDateString('zh-CN'));

const cards = computed(() => {
  const s = stats.value || {};
  return [
    { label: '今日打卡', value: s.todayCheckin ?? '-', color: '#2563eb', icon: 'Location' },
    { label: '在职员工', value: s.totalStaff ?? '-', color: '#10b981', icon: 'User' },
    { label: '待审汇报', value: s.pendingReports ?? '-', color: '#f59e0b', icon: 'Document' },
    { label: '今日拜访', value: s.todayVisits ?? '-', color: '#8b5cf6', icon: 'UserFilled' },
    { label: '周打卡率', value: (s.weekCheckinRate ?? '-') + (s.weekCheckinRate ? '%' : ''), color: '#06b6d4', icon: 'CircleCheck' },
    { label: '月汇报率', value: (s.monthReportRate ?? '-') + (s.monthReportRate ? '%' : ''), color: '#ec4899', icon: 'TrendCharts' },
    { label: '新增客户', value: s.newCustomers ?? '-', color: '#0d9488', icon: 'Plus' },
    { label: '待审批', value: s.pendingApprovals ?? '-', color: '#ef4444', icon: 'Bell' },
  ];
});

const quickActions = computed(() => {
  // 根据用户权限过滤快捷操作
  const allActions = [
    { label: '外勤打卡', path: '/checkin', icon: 'Location', color: '#2563eb', bgColor: '#eff6ff' },
    { label: '工作汇报', path: '/reports', icon: 'Document', color: '#10b981', bgColor: '#ecfdf5' },
    { label: '假期申请', path: '/leave', icon: 'Calendar', color: '#f59e0b', bgColor: '#fef3c7' },
    { label: '费用报销', path: '/expense', icon: 'Money', color: '#8b5cf6', bgColor: '#f3e8ff' },
    { label: '合同审批', path: '/contract', icon: 'Tickets', color: '#ef4444', bgColor: '#fee2e2' },
    { label: '公司文件', path: '/documents', icon: 'Folder', color: '#06b6d4', bgColor: '#cffafe' },
  ];

  // 检查用户是否有权限访问对应模块
  return allActions.filter(action => {
    const modulePath = action.path.slice(1); // 去掉前导 /
    // 简单权限检查：所有登录用户都可以访问这些基础模块
    return auth.user && auth.token;
  });
});

onMounted(async () => {
  try {
    const res = await request.get('/dashboard');
    if (res.data.success) {
      stats.value = res.data.data.stats || {};
      documents.value = res.data.data.docs || [];
    }
  } catch (e) {
    console.error('加载工作台数据失败:', e);
  }
});
</script>

<style scoped>
.welcome-card :deep(.el-card__body) {
  padding: 24px;
}

.mobile-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.mobile-stat-item {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  border-left: 3px solid;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.quick-action:hover > div {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

@media (max-width: 768px) {
  .quick-action > div {
    padding: 12px;
  }
}
</style>

<style scoped>
.mobile-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.mobile-card {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  border-left: 3px solid;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.mobile-card-content {
  text-align: center;
}

.mobile-card-value {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
}

.mobile-card-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.mobile-sections {
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
}

.mobile-activities {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.activity-item {
  padding: 10px;
  background: #f5f7fa;
  border-radius: 6px;
}

.activity-text {
  font-size: 13px;
  color: #1f2937;
  margin-bottom: 4px;
}

.activity-time {
  font-size: 11px;
  color: #909399;
}

@media (max-width: 768px) {
  .page-header {
    margin-bottom: 12px;
  }
}
</style>
