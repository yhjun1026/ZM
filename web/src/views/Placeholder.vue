<template>
  <el-result
    icon="info"
    :title="title"
    sub-title="该模块尚未迁移到 Vue，按已迁移模块（工作台 / 客户 / 假期）的模式逐步迁入即可。"
  >
    <template #extra>
      <el-tag type="info">待迁移</el-tag>
    </template>
  </el-result>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const title = computed(() => route.meta.title || '模块');
</script>
