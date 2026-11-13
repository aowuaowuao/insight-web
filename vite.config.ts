import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    open: false,
    // 后端接口代理示例：把 /api 转发到本地后端，避免开发时跨域
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:8080',
    //     changeOrigin: true,
    //   },
    // },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // 大于 500KB 的 chunk 才警告
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Vite 8 底层是 Rolldown，manualChunks 只支持函数形式。
        // 把体积大的第三方库单独拆包，利用浏览器缓存。
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('vue') || id.includes('pinia')) return 'vue'
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})
