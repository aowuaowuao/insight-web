import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * 路由表。
 * 规范 2.2.1（四）5：所有页面组件均采用动态 import 实现路由懒加载。
 * 规范 2.2.1（四）6：路由守卫做登录状态检查与角色权限检查，无权限跳 403。
 *
 * 角色权限：当前后端还没有用户体系，前端先用 meta.roles 声明式占位，
 * 守卫已按该字段判定；等 /v1/users/me 提供 role 后，把 auth.role 填上即可生效，
 * 不用改路由与守卫的写法。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    // public: 不需要登录；hideNav: 登录页不显示侧边栏与顶部导航
    meta: { title: '登录', public: true, hideNav: true },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/category',
    name: 'category',
    component: () => import('@/views/CategoryView.vue'),
    meta: { title: '分类浏览' },
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { title: '信息检索' },
  },
  {
    path: '/article/:id',
    name: 'article',
    component: () => import('@/views/ArticleView.vue'),
    meta: { title: '公告详情' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { title: '个人中心' },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { title: '管理控制台', roles: ['admin'] },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/ForbiddenView.vue'),
    meta: { title: '无访问权限' },
  },
  {
    // 404 兜底，必须放最后
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

// 全局前置守卫：登录检查 + 角色权限检查
router.beforeEach((to) => {
  const auth = useAuthStore()

  // 没登录 + 目标页不是公开页 -> 去登录，并记住原目标
  if (to.meta.public !== true && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // 已登录还想去登录页 -> 直接进首页
  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'home' }
  }

  // 角色权限：声明了 meta.roles 的路由，用户角色不在其中就跳 403
  const required = to.meta.roles as string[] | undefined
  if (required && required.length > 0) {
    const role = auth.role
    if (!role || !required.includes(role)) {
      return { name: 'forbidden', query: { from: to.fullPath } }
    }
  }

  return true
})

// 后置钩子：统一改标题
router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title
    ? `${title} - ${import.meta.env.VITE_APP_TITLE}`
    : import.meta.env.VITE_APP_TITLE
})

export default router
