<template>
  <div>
    <div class="page-header"><h2>团队管理</h2><p>团队成员考勤与工作状态</p></div>

    <!-- 桌面端：横向统计 + 4列成员卡片 -->
    <el-row v-if="!isMobile" :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">团队人数</div><div style="font-size:22px;font-weight:700;">{{ members.length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">在线</div><div style="font-size:22px;font-weight:700;color:#10b981;">{{ members.filter(m=>m.status==='在线').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">外勤中</div><div style="font-size:22px;font-weight:700;color:#f59e0b;">{{ members.filter(m=>m.status==='外勤中').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">今日已汇报</div><div style="font-size:22px;font-weight:700;color:#2563eb;">{{ members.filter(m=>m.todayReports>0).length }}</div></el-card></el-col>
    </el-row>

    <!-- 移动端：2x2统计网格 -->
    <div v-else class="mobile-stats">
      <div class="mobile-stat-item">
        <div class="stat-number">{{ members.length }}</div>
        <div class="stat-text">团队人数</div>
      </div>
      <div class="mobile-stat-item">
        <div class="stat-number online">{{ members.filter(m=>m.status==='在线').length }}</div>
        <div class="stat-text">在线</div>
      </div>
      <div class="mobile-stat-item">
        <div class="stat-number outdoor">{{ members.filter(m=>m.status==='外勤中').length }}</div>
        <div class="stat-text">外勤中</div>
      </div>
      <div class="mobile-stat-item">
        <div class="stat-number reported">{{ members.filter(m=>m.todayReports>0).length }}</div>
        <div class="stat-text">已汇报</div>
      </div>
    </div>

    <!-- 桌面端：4列成员卡片网格 -->
    <el-row v-if="!isMobile" :gutter="12">
      <el-col :span="6" v-for="m in members" :key="m.id" style="margin-bottom: 12px;">
        <el-card shadow="hover">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <el-avatar :size="44" :style="{ background: m.color }">{{ m.avatar }}</el-avatar>
            <div><div style="font-weight: 700;">{{ m.name }}</div><div style="font-size: 12px; color: #909399;">{{ m.role }}</div></div>
          </div>
          <div style="font-size: 13px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between;"><span style="color:#909399;">今日打卡</span><el-tag :type="m.checkinStatus === 'signed_in' ? 'success' : 'danger'" size="small">{{ m.checkinStatus === 'signed_in' ? '已签到' : '未签到' }}</el-tag></div>
            <div style="display: flex; justify-content: space-between;"><span style="color:#909399;">本周出勤</span><span>{{ m.weekCheckins }}/5 天</span></div>
            <div style="display: flex; justify-content: space-between;"><span style="color:#909399;">状态</span><el-tag :type="statusType(m.status)" size="small">{{ m.status }}</el-tag></div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 移动端：列表式成员卡片 -->
    <div v-else class="mobile-members">
      <div v-for="m in members" :key="m.id" class="mobile-member-item">
        <div class="member-header">
          <div class="member-info">
            <el-avatar :size="36" :style="{ background: m.color }">{{ m.avatar }}</el-avatar>
            <div class="member-text">
              <div class="member-name">{{ m.name }}</div>
              <div class="member-role">{{ m.role }}</div>
            </div>
          </div>
          <el-tag :type="statusType(m.status)" size="small">{{ m.status }}</el-tag>
        </div>
        <div class="member-stats">
          <div class="member-stat">
            <span class="label">打卡</span>
            <el-tag :type="m.checkinStatus === 'signed_in' ? 'success' : 'danger'" size="small">{{ m.checkinStatus === 'signed_in' ? '已签' : '未签' }}</el-tag>
          </div>
          <div class="member-stat">
            <span class="label">出勤</span>
            <span class="value">{{ m.weekCheckins }}/5</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getTeamMembers } from '../api/modules';
import { useDevice } from '../composables/useDevice';

const { isMobile } = useDevice();
const members = ref([]);
function statusType(s) { return s === '在线' ? 'success' : s === '外勤中' ? 'warning' : s === '请假' ? 'info' : 'danger'; }
onMounted(async () => { const r = await getTeamMembers(); if (r.success) members.value = r.data || []; });
</script>

<style scoped>
.mobile-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.mobile-stat-item {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.stat-number {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 4px;
}

.stat-number.online { color: #10b981; }
.stat-number.outdoor { color: #f59e0b; }
.stat-number.reported { color: #2563eb; }

.stat-text {
  font-size: 12px;
  color: #909399;
}

.mobile-members {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-member-item {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.member-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-text {
  display: flex;
  flex-direction: column;
}

.member-name {
  font-weight: 600;
  font-size: 15px;
  color: #1f2937;
}

.member-role {
  font-size: 12px;
  color: #909399;
}

.member-stats {
  display: flex;
  justify-content: space-around;
  padding-top: 10px;
  border-top: 1px solid #f0f0f0;
}

.member-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.member-stat .label {
  font-size: 12px;
  color: #909399;
}

.member-stat .value {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
</style>
