# insight-web

> Vite + Vue 3 + TypeScript 项目骨架，开箱即用。

## 快速开始

```bash
npm install      # 首次
npm run dev      # 启动开发服务器，默认 http://localhost:5173
```

> 端口被占用时 Vite 会自动换一个（比如 5183），**以终端输出的地址为准**。
> dev server 只监听 localhost（IPv6 的 `::1`），所以要用 `http://localhost:端口` 访问；`http://127.0.0.1:端口` 可能连不上。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动开发服务器（HMR 热更新） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 本地预览构建产物 |
| `npm run typecheck` | 只做类型检查，不产出 |
| `npm run lint` | ESLint 检查并自动修复 |
| `npm run lint:style` | Stylelint 检查 `src/**/*.{css,vue}` |
| `npm run format` | Prettier 格式化 |
| `npm test` | Vitest 单元测试（组件 + 工具 + store + http） |
| `npm run test:coverage` | 带覆盖率门槛的单元测试（行/函数/语句 ≥80%，分支 ≥75%） |

## 测试与门禁

- 测试框架：Vitest + @vue/test-utils + jsdom，用例在 `tests/`，共 5 个 spec；
- 覆盖范围：`src/components`（七个公共组件的 Props/Events 与导航交互）、`src/stores/auth`、`src/utils`、`src/api/http.ts`；当前实测 87.8% 语句 / 81.6% 分支；
- 提交前建议依次跑：`npm run typecheck` → `npm run lint` → `npm run lint:style` → `npm test` → `npm run build`；
- Git 钩子：husky `pre-commit` 跑 lint-staged（ESLint + Prettier），`commit-msg` 用 commitlint 校验 Conventional Commits；
- 环境变量：`.env.development.local` 由开发者本地创建（`*.local` 已忽略，不入库）；`.env.production` / `.env.test` 只含接口地址，不含密钥。

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
| `/category` | 分类浏览 | 6 个大类（篇数 / 占比 / 平均置信度），展开看该类最新文章，可一键进入该类检索 | 是 |
| `/search` | 信息检索 | 标题「智能信息检索」+ 搜索框 + 热门词 + 结果列表（**真实调用后端 `/v1/search`**，20 条/页，显示来源）；带 `?category=` 且没有关键词时切换成「该类全部文章」浏览模式（走 `/v1/articles` 分页） | 是 |
| `/article/:id` | 文章详情 | 标题、来源、分类、原文链接、抽取字段、申报清单、标签、正文 | 是 |
| 其他 | 404 | 兜底页，显示当前访问的路径 | 是 |

**未登录访问任何页面都会被重定向到 `/login`**，登录后回到原来想去的地址。

搜索页对接 `news-insight` 后端的 `GET /v1/search`，响应按 **6 个大类**分组（5 个业务大类 + `other` 兜底）、类内已排好序。
前端把 `groups[].items[]` 按后端给的类顺序展平成一维列表，再按 **20 条/页** 分页。

URL 上的 `q` 与 `category` 是这套页面的唯一真相来源：

- `?q=关键词` —— 自动检索，且检索成功后会把关键词写回 URL，刷新和分享链接都能复现结果。
- `?category=大类id` —— 只在该大类里检索；**没有 `q` 时切换成浏览模式**，用 `GET /v1/articles?category=` 分页列出该类的全部文章（`total` 是真实总数）。分类页的「浏览该类全部文章 →」就是跳到这里。
- 在页内改 URL（取消筛选、点导航「信息检索」）会触发重新加载，筛选标签和结果不会错位。

搜索结果里的每条包含 `article_id` / `source` / `url` / `title` / `published_at` / `tags` / `relevance.score`。
`source` 通过 `src/constants/sources.ts` 映射成中文来源名（未知来源原样显示）；**单击结果**跳转 `/article/:id` 查看详情。

> 三个容易踩的契约细节：
> - `item.tags` 是**对象数组**，不是字符串数组；要标签名用 `tags.map((t) => t.tag)`。
>   **但两个端点的字段不同**：`/v1/search` 是 `SearchTag {tag, confidence, evidence, engine}`，`/v1/articles` 列表是 `ListTag {tag, confidence, engine}`（没有 `evidence`，列表不返回原文依据）。类型分开声明，别混用。
> - `groups[].count` 是**该类在候选库里的命中总数**，不是 `items.length`（items 被 `per_category` 截断）。页面展示条数用 `items` 的长度。
> - `/v1/articles` 的 `meta {total, limit, offset}` 是**必有**的，前端不做可选兜底，以免后端契约漂移时静默退化成「只有一页」。

分类浏览页数据来自：

- `GET /v1/categories` —— 6 个大类的名称、说明、类内标签白名单与 `article_count`
- `GET /v1/categories/stats` —— 每类篇数与平均置信度
- `GET /v1/articles?category=xxx&limit=10` —— 展开某类时拉该类最新文章

点上方的「在该类中检索」按钮会跳到 `/search?category=xxx`，搜索页读取该参数后只在该大类里检索，页头有「取消筛选」。
展开面板底部的「浏览该类全部文章 →」同样跳 `/search?category=xxx`，但不带关键词，搜索页会进入浏览模式，分页列出该类全部文章（不会落到空页）。

详情页数据来自：

- `GET /v1/articles/{id}` —— 标签（含置信度、原文依据）+ 按 schema 分组的抽取字段（`value` / `raw_text` / `confidence` / `verified`）
- `GET /v1/articles/{id}/checklist` —— 申报准备清单；后端返回 404（`checklist_not_found`）时页面自动隐藏该区块

## 登录

登录走真实后端 `POST /v1/auth/login`，成功后返回 Bearer Token；Token 与用户资料保存在
`localStorage`（`insight-web.auth.token` / `insight-web.auth.user`），刷新页面不会掉登录。
右上角显示当前账户名，点「退出」调用 `POST /v1/auth/logout` 并清除本地会话。

管理员账号在首次启动时由后端读取 `.env` 的 `INSIGHT_ADMIN_USERNAME` /
`INSIGHT_ADMIN_PASSWORD` 创建（参考 `.env.example`，不要把真实密码提交到仓库）。
测试/验收账号由管理员登录「管理控制台 → 账号管理」创建或重置，仓库不再内置
`test / 123456` 这类演示账号。

连续 5 次登录失败后账号锁定 15 分钟；修改密码使用 `POST /v1/auth/password`，请求体字段为
`current_password` / `new_password`，新密码要求大小写字母、数字、特殊字符且至少 8 位。

## 目录结构

```
insight-web/
├── public/
│   └── favicon.svg
├── src/
│   ├── api/
│   │   ├── http.ts           # fetch 封装：类型化、超时、统一错误
│   │   ├── category.ts       # 分类词表与统计（/v1/categories、/v1/categories/stats）
│   │   ├── articles.ts       # 文章列表（/v1/articles，支持按大类/标签过滤）
│   │   ├── search.ts         # 检索（/v1/search）
│   │   ├── article.ts        # 详情与申报清单
│   │   └── fish.ts           # 骨架自带的示例接口（不是本项目业务，可删）
│   ├── components/
│   │   ├── AppNav.vue        # 顶部导航（三个分页 + 当前账户）
│   │   └── BaseButton.vue    # 通用按钮（props/emits 示例）
│   ├── constants/
│   │   ├── categories.ts     # 一级分类 id ↔ 中文名
│   │   └── sources.ts        # 新闻来源 id ↔ 中文名
│   ├── composables/
│   │   ├── useAsync.ts       # 异步三态封装（data/loading/error）
│   │   ├── useLatestRequest.ts # 请求序号守卫（只接受最后一次请求的结果）
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
│   │   ├── CategoryView.vue  # 分类浏览（接 /v1/categories 与 /v1/articles）
│   │   ├── SearchView.vue    # 信息检索（?q= 检索、?category= 类过滤或整类浏览）
│   │   ├── ArticleView.vue   # 文章详情（/article/:id）
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

在项目根目录建 **`.env.development.local`**（`.gitignore` 已忽略 `*.local`，密钥不会进仓库）。
**不要改 `.env.development`**：它被 git 跟踪，写进去的 `INSIGHT_API_KEY` 会随提交进仓库。

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
> 后端**配了** key 而这里留空时，所有业务请求都会返回 401，页面提示里会直接说明要补这个变量。
> **生产环境没有 Vite 代理**，需要 Nginx 反代 `/api` 到后端，或同域部署，否则仍会跨域。

> ⚠️ **不要用 `npm run dev -- --host` 把开发服务器暴露到局域网**。
> 代理会**无条件**给所有 `/api` 请求加上 `X-API-Key`，任何能连上这个端口的人就等于拿到后端全权：可以调 `POST /v1/analyze` 消耗 LLM 配额、`POST /v1/jobs` 触发抓取。
> 需要多人访问时，请让后端单独签发只读 key，而不是共享这一个。

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
