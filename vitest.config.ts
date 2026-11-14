import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * 单元测试配置（规范 2.2.1（四）测试要求：Vitest，核心逻辑覆盖率 ≥80%）。
 *
 * 单独一份 config 而不是塞进 vite.config.ts：vite.config.ts 里要读 .env 决定代理目标，
 * 跑测试时没必要也不应该依赖后端地址配置。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.spec.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: [
        'src/utils/**/*.ts',
        'src/stores/**/*.ts',
        'src/api/**/*.ts',
        'src/components/**/*.vue',
        // HomeView 为纯展示页，纳入覆盖率；AdminView 依赖 ECharts 画布，交互由 Playwright 全链路覆盖
        'src/views/HomeView.vue',
      ],
      exclude: ['src/**/*.d.ts'],
      // 规范要求核心逻辑覆盖率不低于 80%
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
