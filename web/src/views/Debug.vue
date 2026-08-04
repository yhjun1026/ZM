<template>
  <div style="padding: 20px; font-family: monospace;">
    <h1>设备诊断</h1>
    <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 10px 0;">
      <p><strong>屏幕宽度:</strong> {{ screenWidth }}px</p>
      <p><strong>是否移动端:</strong> {{ isMobile ? '是' : '否' }}</p>
      <p><strong>断点:</strong> 768px</p>
      <p><strong>User Agent:</strong> {{ userAgent }}</p>
    </div>
    <div style="margin-top: 20px;">
      <el-button @click="forceReload" type="primary">强制刷新页面</el-button>
      <el-button @click="clearCache" type="warning">清除缓存并刷新</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useDevice } from '../composables/useDevice';

const { isMobile } = useDevice();
const screenWidth = ref(window.innerWidth);
const userAgent = ref(navigator.userAgent);

function updateWidth() {
  screenWidth.value = window.innerWidth;
}

function forceReload() {
  window.location.reload();
}

function clearCache() {
  if (confirm('这将清除所有缓存并刷新页面，确定吗？')) {
    window.location.reload(true);
  }
}

onMounted(() => {
  window.addEventListener('resize', updateWidth);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWidth);
});
</script>