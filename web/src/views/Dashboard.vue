<template>
  <div>
    <!-- 欢迎横幅（对齐参考项目：深色渐变 + 头像 + 姓名/部门/职务/日期） -->
    <div class="welcome-bar" :style="{ background: `linear-gradient(135deg, ${bannerColor}, ${bannerColor}dd)` }">
      <div class="welcome-avatar">{{ auth.avatar }}</div>
      <div>
        <h2 class="welcome-name">{{ auth.userName }}，欢迎回来</h2>
        <p class="welcome-sub">{{ auth.user?.dept }} · {{ auth.user?.role }} · {{ today }}</p>
      </div>
    </div>

    <!-- 公司公告（蓝色左边条卡片，对齐参考项目） -->
    <el-card class="announcement-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">
            <el-icon color="#2563eb" style="vertical-align: -2px; margin-right: 6px;"><Bell /></el-icon>公司公告
          </span>
          <el-button size="small" @click="$router.push('/announcement')">查看全部</el-button>
        </div>
      </template>
      <template v-if="announcements.length">
        <div v-for="a in announcements" :key="a.id" class="announcement-item">
          <div class="announcement-left">
            <span class="cat-tag" :style="{ background: catColor(a.category) + '15', color: catColor(a.category) }">{{ a.category }}</span>
            <strong class="announcement-title">{{ a.title }}</strong>
          </div>
          <span class="announcement-date">{{ (a.created_at || a.published_at || '').substring(0, 10) }}</span>
        </div>
      </template>
      <el-empty v-else description="暂无公告" :image-size="60" />
    </el-card>

    <!-- 指标卡片（8个，顶部彩色条 + 右侧圆角图标，对齐参考项目） -->
    <div class="stats-grid" :class="{ mobile: isMobile }">
      <div v-for="c in cards" :key="c.label" class="stat-card">
        <div class="stat-topbar" :style="{ background: c.color }"></div>
        <div class="stat-body">
          <div>
            <p class="stat-label">{{ c.label }}</p>
            <p class="stat-value" :style="{ color: c.color }">{{ c.value }}</p>
          </div>
          <div class="stat-icon" :style="{ background: c.color + '15' }">
            <el-icon :size="22" :style="{ color: c.color }"><component :is="c.icon" /></el-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- 公司文件 + 快捷操作 -->
    <el-row :gutter="16">
      <el-col :span="isMobile ? 24 : 12">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">公司文件</span>
              <el-button size="small" @click="$router.push('/documents')">查看全部</el-button>
            </div>
          </template>
          <template v-if="documents.length">
            <div v-for="doc in documents" :key="doc.id" class="doc-item">
              <div class="doc-row">
                <div>
                  <span class="cat-tag" style="background: #2563eb15; color: #2563eb;">{{ doc.type }}</span>
                  <strong>{{ doc.title }}</strong>
                </div>
                <span class="doc-date">{{ doc.date }}</span>
              </div>
              <p class="doc-meta">作者：{{ doc.author }} · 部门：{{ doc.dept }}</p>
            </div>
          </template>
          <el-empty v-else description="暂无文件" :image-size="60" />
        </el-card>
      </el-col>

      <el-col :span="isMobile ? 24 : 12" :style="{ marginTop: isMobile ? '16px' : 0 }">
        <el-card shadow="never">
          <template #header><span class="card-title">快捷操作</span></template>
          <div class="quick-grid">
            <div v-for="action in quickActions" :key="action.path" class="quick-action" @click="$router.push(action.path)">
              <div class="quick-inner" :style="{ background: action.bgColor }">
                <el-icon :size="24" :style="{ color: action.color }"><component :is="action.icon" /></el-icon>
                <p class="quick-label">{{ action.label }}</p>
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
import { Bell } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { useDevice } from '../composables/useDevice';
import request from '../api/request';

const auth = useAuthStore();
const { isMobile } = useDevice();
const stats = ref({});
const documents = ref([]);
const announcements = ref([]);

const today = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
});

// 欢迎横幅颜色跟随用户头像色（参考项目逻辑）
const bannerColor = computed(() => auth.user?.avatarColor || '#1e293b');

// 公告类别配色（与参考项目一致）
const categoryColors = {
  '产品会议': '#2563eb', '公司团建': '#10b981', '会议通知': '#f59e0b',
  '放假通知': '#ef4444', '人事任命': '#8b5cf6', '外出参访通知': '#06b6d4', '公司培训通知': '#0d9488'
};
const catColor = (cat) => categoryColors[cat] || '#666666';

const cards = computed(() => {
  const s = stats.value || {};
  return [
    { label: '今日打卡', value: s.todayCheckin ?? '-', color: '#2563eb', icon: 'Location' },
    { label: '在职员工', value: s.totalStaff ?? '-', color: '#10b981', icon: 'User' },
    { label: '待审汇报', value: s.pendingReports ?? '-', color: '#f59e0b', icon: 'Document' },
    { label: '今日拜访', value: s.todayVisits ?? '-', color: '#8b5cf6', icon: 'UserFilled' },
    { label: '周打卡率', value: s.weekCheckinRate != null ? s.weekCheckinRate + '%' : '-', color: '#06b6d4', icon: 'CircleCheck' },
    { label: '月汇报率', value: s.monthReportRate != null ? s.monthReportRate + '%' : '-', color: '#ec4899', icon: 'TrendCharts' },
    { label: '新增客户', value: s.newCustomers ?? '-', color: '#0d9488', icon: 'Plus' },
    { label: '待审批', value: s.pendingApprovals ?? '-', color: '#ef4444', icon: 'Bell' },
  ];
});

const quickActions = [
  { label: '外勤打卡', path: '/checkin', icon: 'Location', color: '#2563eb', bgColor: '#eff6ff' },
  { label: '工作汇报', path: '/reports', icon: 'Document', color: '#10b981', bgColor: '#ecfdf5' },
  { label: '假期申请', path: '/leave', icon: 'Calendar', color: '#f59e0b', bgColor: '#fef3c7' },
  { label: '费用报销', path: '/expense', icon: 'Money', color: '#8b5cf6', bgColor: '#f3e8ff' },
  { label: '合同审批', path: '/contract', icon: 'Tickets', color: '#ef4444', bgColor: '#fee2e2' },
  { label: '公司文件', path: '/documents', icon: 'Folder', color: '#06b6d4', bgColor: '#cffafe' },
];

onMounted(async () => {
  try {
    const body = await request.get('/dashboard');
    // 兼容 {code:200,data} 与 {success:true,data} 两种响应
    const ok = body && (body.code === 200 || body.success);
    if (ok) {
      stats.value = body.data.stats || {};
      documents.value = body.data.docs || [];
      announcements.value = body.data.announcements || [];
    }
  } catch (e) {
    console.error('加载工作台数据失败:', e);
  }
});
</script>

<style scoped>
/* 欢迎横幅 */
.welcome-bar {
  color: #fff;
  padding: 24px 30px;
  border-radius: 16px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.welcome-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  flex-shrink: 0;
}

.welcome-name { font-size: 22px; margin: 0; }
.welcome-sub { margin: 4px 0 0; opacity: 0.9; font-size: 14px; }

/* 公司公告 */
.announcement-card {
  margin-bottom: 24px;
  border-left: 4px solid #2563eb;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title { font-weight: 600; }

.announcement-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.announcement-item:last-child { border-bottom: none; }

.announcement-left { flex: 1; display: flex; align-items: center; min-width: 0; }

.cat-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-right: 8px;
  white-space: nowrap;
}

.announcement-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-date { color: #909399; font-size: 12px; margin-left: 12px; flex-shrink: 0; }

/* 指标卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stats-grid.mobile { grid-template-columns: repeat(2, 1fr); }

.stat-card {
  position: relative;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}

.stat-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-label {
  font-size: 12px;
  margin: 0 0 6px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: #909399;
}

.stat-value { font-size: 26px; font-weight: 700; margin: 0; }

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 公司文件 */
.doc-item { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
.doc-item:last-child { border-bottom: none; }
.doc-row { display: flex; justify-content: space-between; align-items: center; }
.doc-date { color: #909399; font-size: 13px; flex-shrink: 0; margin-left: 12px; }
.doc-meta { margin: 4px 0 0; font-size: 13px; color: #909399; }

/* 快捷操作 */
.quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.quick-action { cursor: pointer; }

.quick-inner {
  text-align: center;
  padding: 16px;
  border-radius: 12px;
  transition: all 0.3s;
}

.quick-action:hover .quick-inner {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.quick-label { margin: 8px 0 0; font-size: 13px; }

@media (max-width: 768px) {
  .welcome-bar { padding: 16px; }
  .quick-inner { padding: 12px; }
}
</style>
