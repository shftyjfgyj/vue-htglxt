<template>
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn';

// 根组件：提供中文语言包（组件按需注册，见 vite.config.ts）
</script>
