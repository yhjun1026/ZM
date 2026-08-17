<template>
  <div class="fin-stat-card" :style="{ borderColor: 'var(--el-border-color)' }">
    <div class="fin-stat-icon" :style="{ background: color + '20' }">
      <el-icon :size="18" :color="color"><component :is="icon" /></el-icon>
    </div>
    <div>
      <div class="fin-stat-title">{{ title }}</div>
      <div class="fin-stat-value">{{ value }}</div>
      <div class="fin-stat-sub">{{ sub }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  value: { type: [String, Number], default: '' },
  sub: { type: [String, Number], default: '' },
  icon: { type: [String, Object], default: '' },
  color: { type: String, default: '#2563eb' },
});
</script>

<style scoped>
.fin-stat-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.fin-stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.fin-stat-title { font-size: 11px; color: var(--el-text-color-secondary); }
.fin-stat-value { font-size: 18px; font-weight: 700; }
.fin-stat-sub { font-size: 11px; color: var(--el-text-color-placeholder); }
</style>
