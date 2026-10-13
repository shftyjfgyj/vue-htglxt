import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    // 按需注册 Element Plus 组件，避免全量引入（老系统全量引入 + 图标全量注册，体积偏大）
    Components({ resolvers: [ElementPlusResolver()], dts: false })
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      // 头像等上传文件由后端 /uploads 提供，数据库里存的就是 /uploads/... 这样的相对路径。
      // 少了这条，请求会落到 Vite 的 SPA fallback 上、返回 index.html，
      // 表现就是「换过头像但不显示」。preview 里一直有这条，dev 里漏了。
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true }
    }
  },
  // 生产构建预览（E2E 与本地验收）：同样把 /api 与 /uploads 代理到后端
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true }
    }
  },
  build: { chunkSizeWarningLimit: 1200 }
});
