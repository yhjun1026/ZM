<template>
  <div class="pm-stat-card">
    <div class="pm-stat-bar" :style="{ background: color }"></div>
    <div class="pm-stat-inner">
      <div>
        <p class="pm-stat-label">{{ label }}</p>
        <p class="pm-stat-value" :style="{ color }">{{ value }}</p>
      </div>
      <div class="pm-stat-icon" :style="{ background: color + '15' }">
        <el-icon :size="22" :color="color"><component :is="icon" /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  icon: { type: [Object, Function], required: true },
  color: { type: String, default: '#2563eb' },
});
</script>

<style scoped>
.pm-stat-card {
  position: relative;
  padding: 20px;
  background: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
.pm-stat-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 12px 12px 0 0;
}
.pm-stat-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pm-stat-label {
  font-size: 12px;
  margin: 0 0 6px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--el-text-color-secondary);
}
.pm-stat-value {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}
.pm-stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
