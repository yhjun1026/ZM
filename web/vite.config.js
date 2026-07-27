import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // 监听所有网卡，允许服务器外部访问（否则只绑 localhost）
    port: 5173,
    proxy: {
      // 开发期把 /api 代理到后端 Express（8080），实现同源
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
