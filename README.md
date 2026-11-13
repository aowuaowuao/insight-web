# insight-web

> Vite + Vue 3 + TypeScript 项目骨架，开箱即用。

## 快速开始

```bash
npm install      # 首次
npm run dev      # 启动开发服务器 http://localhost:5173
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器（HMR 热更新） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 本地预览构建产物 |
| `npm run typecheck` | 只做类型检查，不产出 |
| `npm run lint` | ESLint 检查并自动修复 |
| `npm run format` | Prettier 格式化 |

## 技术栈

| 组件 | 版本 | 说明 |
|---|---|---|
| Node.js | v26.13.1 | 运行时 |
| Vue | 3.5.45 | 框架 |
| TypeScript | 6.0.3 | 类型系统 |
| Vite | 8.3.8 | 构建工具（底层 Rolldown） |
| Vue Router | 4.x | 路由（懒加载 + 守卫） |
| Pinia | 3.x | 状态管理（setup 语法） |
| vue-tsc | 3.3.14 | .vue 文件的类型检查 |
| ESLint + Prettier | - | 代码规范 |

## 页面

| 路由 | 页面 | 内容 |
|---|---|---|
| `/` | 首页 | 欢迎语 + 两个入口卡片（分类浏览、信息检索） |
| `/category` | 分类浏览 | 一句说明 + 预留分类区 |
| `/search` | 信息检索 | 标题「智能信息检索」+ 搜索框 + 热门词 + 结果列表 |
| 其他 | 404 | 兜底页，显示当前访问的路径 |

搜索页目前用 5 条本地示例数据演示交互（`src/views/SearchView.vue` 里的 `sampleData`）。
接后端时删掉示例数据，把 `search()` 换成接口调用即可。

## 目录结构

```
insight-web/
├── public/
│   └── favicon.svg
├── src/
│   ├── api/
│   │   ├── http.ts           # fetch 封装：类型化、超时、统一错误
│   │   └── fish.ts           # 业务接口（示例）
│   ├── components/
│   │   ├── AppNav.vue        # 顶部导航（三个分页）
│   │   └── BaseButton.vue    # 通用按钮（props/emits 示例）
│   ├── composables/
│   │   ├── useAsync.ts       # 异步三态封装（data/loading/error）
│   │   └── useWindowSize.ts  # 窗口尺寸监听
│   ├── router/
│   │   └── index.ts          # 路由表 + 全局守卫 + 404 兜底
│   ├── stores/
│   │   ├── counter.ts        # 计数器（骨架示例）
│   │   └── user.ts           # 用户状态（骨架示例）
│   ├── styles/
│   │   └── main.css          # 全局样式 + CSS 变量 + 暗色适配
│   ├── views/
│   │   ├── HomeView.vue      # 首页
│   │   ├── CategoryView.vue  # 分类浏览
│   │   ├── SearchView.vue    # 信息检索（智能信息检索）
│   │   └── NotFoundView.vue  # 404
│   ├── App.vue               # 根组件 + 路由过渡
│   └── main.ts               # 应用入口
├── .env                      # 公共环境变量
├── .env.development          # 开发环境变量
├── env.d.ts                  # 环境变量 + .vue 模块类型声明
├── vite.config.ts            # Vite 配置（别名/代理/分包）
├── tsconfig.json             # TS 配置（严格模式）
├── eslint.config.js          # ESLint 扁平配置
└── .prettierrc.json          # Prettier 配置
```

## 关键设计说明

### 路径别名 `@`

`@/` 指向 `src/`，三处都要配（本骨架已配好）：

- `tsconfig.json` → `paths`（注意：TS 6 起 `baseUrl` 已废弃，`paths` 直接相对 tsconfig 解析）
- `vite.config.ts` → `resolve.alias`
- `.vscode/settings.json` → 编辑器提示

### 路由懒加载

```ts
component: () => import('@/views/HomeView.vue')
```

每个页面单独打包成一个 chunk，首屏只加载当前页。构建产物里能看到 `HomeView-xxx.js`、`AboutView-xxx.js` 就是它。

### 状态管理用 setup 语法

```ts
export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)
  const isLoggedIn = computed(() => token.value !== '' && currentUser.value !== null)
  return { currentUser, isLoggedIn, login, logout }
})
```

比 Options 写法对 TS 推导更友好，也不用写 `this`。

> ⚠️ 组件里解构 store 要用 `storeToRefs()`，直接解构会丢响应性。

### 环境变量

只有 `VITE_` 前缀的变量才会注入到客户端，且**会被打进产物**——别放密钥。

```ts
import.meta.env.VITE_APP_TITLE   // 有类型提示（见 env.d.ts）
```

### 开发代理

`vite.config.ts` 里预留了 `/api` 代理配置（已注释），接后端时取消注释即可，避免开发期跨域。

## VSCode 使用

打开项目后 VSCode 会提示安装推荐插件，**务必装 `Vue.volar`**（Vue 官方语言服务）。

| 操作 | 快捷键 |
|---|---|
| 编译 | `Ctrl + Shift + B` |
| 调试 | `F5` |
| 命令面板 | `Ctrl + Shift + P` → 输入 `Restart TS Server`（类型提示异常时用） |

## 部署

```bash
npm run build     # 产物在 dist/
```

**SPA 必须配 history fallback**，否则刷新子路由 404：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## 踩过的坑

1. **TS 6 废弃了 `baseUrl`** → 报 `TS5101`，删掉 `baseUrl`，`paths` 写成 `["./src/*"]`
2. **Vite 8 底层是 Rolldown** → `manualChunks` 只接受函数，不能传对象
3. **`vue-tsc` 必须和 `typescript` 版本匹配** → TS 7 是 Go 原生编译器，不带 `tsserver.js`，编辑器会失去智能提示，本骨架锁 `~6.0.3`
4. **ESLint 报 `MouseEvent is not defined`** → 需要手动在 `languageOptions.globals` 里声明浏览器全局对象
5. **排版类规则交给 Prettier** → 否则 ESLint 的 `vue/max-attributes-per-line` 会刷屏
