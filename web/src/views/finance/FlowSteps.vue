<template>
  <div class="flow-steps" style="margin-top: 12px;">
    <b style="font-size: 13px;">审批流程示意图</b>
    <div class="flow-track">
      <template v-for="(s, i) in flow" :key="i">
        <span class="wf-step" :class="stepClass(s, i)">
          <span class="wf-icon">
            <el-icon v-if="s.done" color="#10b981"><CircleCheckFilled /></el-icon>
            <el-icon v-else-if="i === currentIdx" color="#f59e0b"><Clock /></el-icon>
            <el-icon v-else color="#c0c4cc"><CircleCheck /></el-icon>
          </span>
          <span class="wf-name">{{ s.step || s.name || '' }}</span>
          <span class="wf-user">{{ s.user || s.approver || '待处理' }}</span>
          <span class="wf-time">{{ s.time || s.approved_at || s.time_str || '—' }}</span>
          <span v-if="opinion(s)" class="wf-opinion">{{ opinion(s).slice(0, 20) }}</span>
        </span>
        <span v-if="i < flow.length - 1" class="wf-arrow">
          <el-icon color="#999"><ArrowRight /></el-icon>
        </span>
      </template>
    </div>
    <div v-if="currentIdx >= 0" class="flow-reminder pending">
      <el-icon><Bell /></el-icon>
      当前待审节点：<b>{{ flow[currentIdx].step || flow[currentIdx].name || '' }}</b>，审批人：{{ flow[currentIdx].user || flow[currentIdx].approver || '待分配' }}
    </div>
    <div v-else class="flow-reminder done">
      <el-icon><CircleCheckFilled /></el-icon> 审批流程已完成
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { CircleCheckFilled, CircleCheck, Clock, ArrowRight, Bell } from '@element-plus/icons-vue';

const props = defineProps({
  flow: { type: Array, default: () => [] },
});

const currentIdx = computed(() => {
  for (let i = 0; i < props.flow.length; i++) {
    if (!props.flow[i].done) return i;
  }
  return -1;
});

function stepClass(s, i) {
  if (s.done) return 'wf-done';
  return i === currentIdx.value ? 'wf-current' : 'wf-pending';
}
function opinion(s) {
  return s.opinion || s.comment || '';
}
</script>

<style scoped>
.flow-track {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  padding: 12px 0;
  overflow-x: auto;
}
.wf-step {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin: 4px;
  font-size: 12px;
  min-width: 80px;
}
.wf-done { background: #d1fae5; border-color: #10b981; }
.wf-current { background: #fef3c7; border-color: #f59e0b; }
.wf-pending { background: #f9fafb; border-color: #d1d5db; }
.wf-name { font-weight: bold; margin-bottom: 2px; }
.wf-user { font-size: 11px; }
.wf-time { color: #888; font-size: 11px; }
.wf-opinion { font-size: 11px; color: #ef4444; margin-top: 2px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.wf-arrow { display: inline-flex; align-items: center; margin: 12px 4px 0; }
.flow-reminder {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.flow-reminder.pending { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; }
.flow-reminder.done { background: #d1fae5; border: 1px solid #10b981; color: #065f46; }
</style>
