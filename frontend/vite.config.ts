import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    },
    // ✅ 加入這個：讓 ngrok 不顯示警告頁面
    headers: {
      'ngrok-skip-browser-warning': 'true'
    }
  }
});