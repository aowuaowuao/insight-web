import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  // 忽略构建产物
  { ignores: ['dist/**', 'node_modules/**', '*.config.js'] },

  // JS 基础规则
  js.configs.recommended,

  // TS 规则
  ...tseslint.configs.recommended,

  // Vue 规则
  ...pluginVue.configs['flat/recommended'],

  // .vue 文件用 vue-eslint-parser 解析 <script lang="ts">
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },

  // 自定义规则
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: {
        // 浏览器全局对象（避免 no-undef 误报 MouseEvent / window 等）
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        DOMException: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        FocusEvent: 'readonly',
        HTMLElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        Storage: 'readonly',
        performance: 'readonly',
      },
    },
    rules: {
      // 禁止 v-html：项目已用切段渲染替代，规则锁住现状（XSS 面为零）
      'vue/no-v-html': 'error',
      'vue/multi-word-component-names': 'off',
      // 未使用变量：允许以 _ 开头
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 禁止显式 any（规范 2.2.1（四））：当前 src 内为 0，用 error 锁住
      '@typescript-eslint/no-explicit-any': 'error',

      // ── 排版类规则交给 Prettier，ESLint 不管 ──────────────
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
    },
  },
)
