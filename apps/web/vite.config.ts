import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiProxyTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
            return 'charts-vendor';
          }
          if (id.includes('socket.io-client') || id.includes('engine.io-client')) {
            return 'realtime-vendor';
          }
          if (id.includes('lucide-react')) {
            return 'icons-vendor';
          }
          if (
            id.includes('react-router') ||
            id.includes('@remix-run') ||
            id.includes('react-dom') ||
            /[\\/]react[\\/]/.test(id)
          ) {
            return 'react-vendor';
          }
          if (
            id.includes('@tanstack') ||
            id.includes('axios') ||
            id.includes('zustand') ||
            id.includes('i18next') ||
            id.includes('dayjs')
          ) {
            return 'app-vendor';
          }
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@webenglish/shared': path.resolve(__dirname, '../../packages/shared/src')
    }
  }
});
