import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    // public: 不需要登录；hideNav: 登录页不显示顶部导航
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

// 全局前置守卫：未登录一律送回登录页
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
