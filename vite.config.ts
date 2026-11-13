import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 第三个参数传 '' 表示读取所有变量（含不带 VITE_ 前缀的服务端变量）
  const env = loadEnv(mode, process.cwd(), '')

  // 后端地址只在开发服务器侧使用，不会打进前端产物
  const apiTarget = env.INSIGHT_API_URL || 'http://127.0.0.1:8020'
  const apiKey = env.INSIGHT_API_KEY || ''

  return {
    plugins: [vue()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      port: 5173,
      open: false,
      // 代理：浏览器请求 /api/* -> 开发服务器转发到后端，绕开 CORS
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // /api/v1/search -> /v1/search
          rewrite: (path) => path.replace(/^\/api/, ''),
          // 如果后端配置了 INSIGHT_API_KEY，由代理注入请求头，密钥不进浏览器
          ...(apiKey ? { headers: { 'X-API-Key': apiKey } } : {}),
        },
      },
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
  }
})
