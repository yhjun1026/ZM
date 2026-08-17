<template>
  <div v-if="flow && flow.length" class="wf-container">
    <div class="wf-track">
      <template v-for="(f, i) in flow" :key="i">
        <div class="wf-step" :class="stepClass(i)">
          <div class="wf-icon">
            <el-icon v-if="f.done"><CircleCheck /></el-icon>
            <el-icon v-else-if="isCurrent(i)" class="is-loading"><Loading /></el-icon>
            <span v-else class="wf-hollow"></span>
          </div>
          <div class="wf-info">
            <div class="wf-name">{{ f.step }}</div>
            <div class="wf-user">{{ f.user || (f.done ? '已完成' : '待处理') }}</div>
            <div v-if="f.time && f.time !== '—'" class="wf-time">{{ f.time }}</div>
          </div>
        </div>
        <div v-if="i < flow.length - 1" class="wf-arrow">
          <el-icon><ArrowRight /></el-icon>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { CircleCheck, Loading, ArrowRight } from '@element-plus/icons-vue';

const props = defineProps({
  flow: { type: Array, default: () => [] },
});

function isCurrent(i) {
  const f = props.flow[i];
  return !f.done && (i === 0 || props.flow.slice(0, i).every((s) => s.done));
}
function stepClass(i) {
  const f = props.flow[i];
  return f.done ? 'wf-done' : isCurrent(i) ? 'wf-current' : 'wf-pending';
}
</script>

<style scoped>
.wf-container {
  overflow-x: auto;
  padding: 16px 8px;
  background: var(--el-fill-color-light);
  border-radius: 10px;
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px;
}
.wf-track {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: max-content;
}
.wf-step {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  border-radius: 10px;
  border: 2px solid;
  min-width: 100px;
  text-align: center;
}
.wf-icon {
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wf-hollow {
  width: 18px;
  height: 18px;
  border: 2px solid #9ca3af;
  border-radius: 50%;
  display: inline-block;
}
.wf-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.wf-user,
.wf-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.wf-time {
  font-size: 10px;
  opacity: 0.8;
}
.wf-done {
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success);
}
.wf-done .wf-icon { color: var(--el-color-success); }
.wf-current {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning);
  animation: wfPulse 2s ease-in-out infinite;
}
.wf-current .wf-icon { color: var(--el-color-warning); }
.wf-pending {
  background: var(--el-bg-color);
  border-color: #e5e7eb;
  opacity: 0.65;
}
.wf-arrow {
  flex-shrink: 0;
  color: #9ca3af;
  font-size: 14px;
  padding: 0 2px;
}
@keyframes wfPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
}
</style>
