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

| 路由 | 页面 | 内容 | 是否需要登录 |
|---|---|---|---|
| `/login` | 登录 | 用户名 / 密码表单 | 否（公开） |
| `/` | 首页 | 仅一句「欢迎进入智能申报信息检索平台」 | 是 |
| `/category` | 分类浏览 | 一句说明 + 预留分类区 | 是 |
| `/search` | 信息检索 | 标题「智能信息检索」+ 搜索框 + 热门词 + 结果列表（**真实调用后端 `/v1/search`**，20 条/页） | 是 |
| 其他 | 404 | 兜底页，显示当前访问的路径 | 是 |

**未登录访问任何页面都会被重定向到 `/login`**，登录后回到原来想去的地址。

搜索页对接 `news-insight` 后端的 `GET /v1/search`，响应按 5 大类分组、类内已排好序。
前端把 `groups[].items[]` 按后端给的类顺序展平成一维列表，再按 **20 条/页** 分页。

字段映射：`article_id` / `title` / `published_at` / `tags` / `relevance.score`。
详情页需要的 `url`、`body` 不在搜索结果里（`include_body` 默认 false），点进详情时再查 `/v1/articles/{id}`。

## 登录

### 测试账号

| 用户名 | 密码 |
|---|---|
| `test` | 见 `src/stores/auth.ts` 里的 `TEST_ACCOUNTS` |

登录态存在 `localStorage`（key：`insight-web.auth.username`），刷新页面不会掉登录。
右上角显示当前账户名，点「退出」清除登录态并回到登录页。

### ⚠️ 这只是演示用的前端校验

密码**明文写在前端代码里**，打开开发者工具就能看到，而且会被打进 `dist` 产物。
这是「纯前端无法安全保存密码」的必然结果，不是疏忽。

真实项目必须改成：

1. 后端提供 `POST /api/login`，校验通过后下发 **HttpOnly + Secure Cookie**（或短期 token + 刷新机制）
2. 前端不再持有密码，只保存「已登录」这一事实
3. 路由守卫改为询问后端「当前会话是否有效」，而不是看本地变量

`src/stores/auth.ts` 里的 `login()` 已经预留了这个形状——把本地比对换成 `await http.post('/api/login', ...)` 即可。

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
│   │   └── index.ts          # 路由表 + 登录守卫 + 404 兜底
│   ├── stores/
│   │   └── auth.ts           # 登录状态（本地测试账号）
│   ├── styles/
│   │   └── main.css          # 全局样式 + CSS 变量 + 暗色适配
│   ├── views/
│   │   ├── LoginView.vue     # 登录页
│   │   ├── HomeView.vue      # 首页（欢迎语）
│   │   ├── CategoryView.vue  # 分类浏览
│   │   ├── SearchView.vue    # 信息检索（智能信息检索）
│   │   └── NotFoundView.vue  # 404
│   ├── App.vue               # 根组件 + 路由过渡（登录页隐藏导航）
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
export const useAuthStore = defineStore('auth', () => {
  const username = ref<string>(readStoredUsername())
  const isLoggedIn = computed(() => username.value !== '')
  return { username, isLoggedIn, login, logout }
})
```

比 Options 写法对 TS 推导更友好，也不用写 `this`。

> ⚠️ 组件里解构 store 要用 `storeToRefs()`，直接解构会丢响应性。

### 登录守卫

守卫写在 `router.beforeEach` 里，靠路由 `meta` 区分公开页：

```ts
// router/index.ts
{
  path: '/login',
  meta: { title: '登录', public: true, hideNav: true },
}
```

- `public: true` —— 唯一允许未登录访问的页面
- `hideNav: true` —— 登录页不渲染顶部导航（`App.vue` 里判断）

守卫逻辑：未登录 + 目标非公开 → 跳登录并带上 `?redirect=原地址`；已登录还想进登录页 → 直接送首页。

### 环境变量

只有 `VITE_` 前缀的变量才会注入到客户端，且**会被打进产物**——别放密钥。

```ts
import.meta.env.VITE_APP_TITLE   // 有类型提示（见 env.d.ts）
```

### 后端联调（已接好）

后端的 `app/main.py` **没有 CORS 中间件**，浏览器不能直连 8020，所以统一走 Vite 代理：

```
浏览器 → /api/v1/search → Vite 开发服务器 → http://127.0.0.1:8020/v1/search
```

在项目根目录建 `.env.development.local`（或直接改 `.env.development`）：

```bash
# 前端请求前缀，保持 /api 即可
VITE_API_BASE_URL=/api

# ↓ 服务端变量，不带 VITE_ 前缀，不会打进前端产物
INSIGHT_API_URL=http://127.0.0.1:8020
INSIGHT_API_KEY=你的后端密钥
```

| 变量 | 作用 | 是否暴露给浏览器 |
|---|---|---|
| `VITE_API_BASE_URL` | 前端请求前缀，默认 `/api` | 是（会打进产物） |
| `INSIGHT_API_URL` | Vite 代理转发目标 | 否 |
| `INSIGHT_API_KEY` | 代理自动加的 `X-API-Key` 头 | 否 |

> 后端没配 `INSIGHT_API_KEY` 时，`INSIGHT_API_KEY` 留空即可。
> **生产环境没有 Vite 代理**，需要 Nginx 反代 `/api` 到后端，或同域部署，否则仍会跨域。

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
