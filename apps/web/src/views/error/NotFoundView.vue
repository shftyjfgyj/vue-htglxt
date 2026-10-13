<template>
  <el-result icon="info" title="404" sub-title="页面不存在或已被移除">
    <template #extra>
      <el-button type="primary" @click="router.push('/')">回到首页</el-button>
    </template>
  </el-result>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>
