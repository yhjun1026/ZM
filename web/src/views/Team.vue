<template>
  <div>
    <div class="page-header"><h2>团队管理</h2><p>团队成员考勤与工作状态</p></div>
    <el-row :gutter="12" style="margin-bottom: 16px;">
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">团队人数</div><div style="font-size:22px;font-weight:700;">{{ members.length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">在线</div><div style="font-size:22px;font-weight:700;color:#10b981;">{{ members.filter(m=>m.status==='在线').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">外勤中</div><div style="font-size:22px;font-weight:700;color:#f59e0b;">{{ members.filter(m=>m.status==='外勤中').length }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div style="font-size:13px;color:#909399;">今日已汇报</div><div style="font-size:22px;font-weight:700;color:#2563eb;">{{ members.filter(m=>m.todayReports>0).length }}</div></el-card></el-col>
    </el-row>
    <el-row :gutter="12">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getTeamMembers } from '../api/modules';
const members = ref([]);
function statusType(s) { return s === '在线' ? 'success' : s === '外勤中' ? 'warning' : s === '请假' ? 'info' : 'danger'; }
onMounted(async () => { const r = await getTeamMembers(); if (r.success) members.value = r.data || []; });
</script>
