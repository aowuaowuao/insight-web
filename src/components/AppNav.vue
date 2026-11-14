<script setup lang="ts">
/**
 * 顶部导航 + 侧边栏。
 * 对照规范 2.2.1（二）模块二：
 * （1）顶部导航栏：系统 Logo、当前时间、用户头像与下拉菜单（含个人中心、退出登录）
 * （6）侧边栏折叠/展开：折叠后仅显示图标，展开显示完整菜单文字
 * （7）全局搜索入口：顶部提供全局搜索框
 *
 * 消息通知（5）：顶部铃铛展示未读角标，下拉查看新分析出的项目申报公告；
 * 打开通知即标记已读，侧栏折叠不影响。数据来自 /v1/notifications。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/api/notifications'
import { formatRelativeTime } from '@/utils/format'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { displayName, isAdmin } = storeToRefs(auth)

/** 侧边栏折叠状态（规范模块二（6）） */
const collapsed = ref(false)
/** 用户下拉菜单展开状态 */
const menuOpen = ref(false)
/** 全局搜索关键词 */
const globalKeyword = ref('')

/** 消息通知（规范模块二（5））：未读数 + 最近通知 */
const bellOpen = ref(false)
const bellLoading = ref(false)
const notifications = ref<NotificationItem[]>([])
const unreadCount = ref(0)
let bellTimer: ReturnType<typeof setInterval> | null = null
/** 通知请求序号：全部已读/单条已读会推进版本，迟到的轮询响应不得把已读状态冲回去 */
let notificationRequestId = 0

async function loadNotifications(): Promise<void> {
  const requestId = ++notificationRequestId
  bellLoading.value = true
  try {
    const page = await listNotifications(10)
    if (requestId !== notificationRequestId) return
    notifications.value = page.items
    unreadCount.value = page.unread
  } catch {
    // 铃铛是辅助信息：后端短暂不可用时不打扰用户，保留上一次成功的数据
  } finally {
    if (requestId === notificationRequestId) bellLoading.value = false
  }
}

onMounted(() => {
  void loadNotifications()
  bellTimer = setInterval(() => void loadNotifications(), 60_000)
})

async function toggleBell(): Promise<void> {
  bellOpen.value = !bellOpen.value
  if (bellOpen.value) await loadNotifications()
}

async function openNotification(item: NotificationItem): Promise<void> {
  bellOpen.value = false
  if (!item.read) {
    try {
      await markNotificationRead(item.id)
      notificationRequestId += 1
      bellLoading.value = false
      item.read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch {
      // 标记失败不阻断跳转：下次打开会重新拉取真实已读状态
    }
  }
  await router.push({ name: 'article', params: { id: item.article_id } })
}

async function readAllNotifications(): Promise<void> {
  try {
    await markAllNotificationsRead()
    notificationRequestId += 1
    bellLoading.value = false
    notifications.value = notifications.value.map((item) => ({ ...item, read: true }))
    unreadCount.value = 0
  } catch {
    // 失败保持原状，用户可重试
  }
}

const menu = computed(() => {
  const items = [
    { to: '/', label: '首页', icon: 'home' },
    { to: '/category', label: '分类浏览', icon: 'category' },
    { to: '/search', label: '信息检索', icon: 'search' },
    { to: '/profile', label: '个人中心', icon: 'user' },
  ]
  if (isAdmin.value) items.push({ to: '/admin', label: '管理控制台', icon: 'admin' })
  return items
})

/** 当前时间，每分钟刷新（规范模块二（1）要求顶部展示当前时间） */
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null

function startClock(): void {
  if (timer !== null) return
  timer = setInterval(() => {
    now.value = new Date()
  }, 30_000)
}

startClock()
onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer)
  timer = null
})

const timeText = computed(() =>
  now.value.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }),
)

const avatarText = computed(() =>
  displayName.value ? displayName.value.charAt(0).toUpperCase() : '?',
)

async function handleLogout(): Promise<void> {
  menuOpen.value = false
  await auth.logout()
  router.replace({ name: 'login' })
}

function goProfile(): void {
  menuOpen.value = false
  router.push({ name: 'profile' })
}

/** 全局搜索：跳到检索页并带上关键词 */
function submitGlobal(): void {
  const q = globalKeyword.value.trim()
  if (!q) return
  router.push({ name: 'search', query: { q } })
  globalKeyword.value = ''
}

/** 点到导航外部时收起下拉菜单与通知面板 */
function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.nav__user')) menuOpen.value = false
  if (!target?.closest('.nav__bell')) bellOpen.value = false
}

const anyPanelOpen = computed(() => menuOpen.value || bellOpen.value)

watch(anyPanelOpen, (open) => {
  if (open) document.addEventListener('click', onDocumentClick)
  else document.removeEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  if (bellTimer !== null) clearInterval(bellTimer)
  bellTimer = null
})

const isActive = (to: string): boolean =>
  to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(to + '/')
</script>

<template>
  <div class="shell" :class="{ 'shell--collapsed': collapsed }">
    <!-- 侧边栏（规范模块二（6）） -->
    <aside class="side" :class="{ 'side--collapsed': collapsed }" aria-label="侧边导航">
      <RouterLink to="/" class="side__brand">
        <span class="side__logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <rect x="2" y="5" width="28" height="22" rx="4" fill="var(--color-primary)" />
            <rect x="7" y="11" width="13" height="2.4" rx="1.2" fill="#fff" opacity="0.9" />
            <rect x="7" y="16" width="18" height="2.4" rx="1.2" fill="#fff" opacity="0.6" />
            <rect x="7" y="21" width="9" height="2.4" rx="1.2" fill="#fff" opacity="0.4" />
          </svg>
        </span>
        <span v-show="!collapsed" class="side__name">政策情报助手</span>
      </RouterLink>

      <nav class="side__menu">
        <RouterLink
          v-for="item in menu"
          :key="item.to"
          :to="item.to"
          class="side__link"
          :class="{ 'side__link--active': isActive(item.to) }"
          :title="collapsed ? item.label : undefined"
          :aria-label="item.label"
        >
          <span class="side__icon" aria-hidden="true">
            <svg v-if="item.icon === 'home'" viewBox="0 0 20 20" width="18" height="18">
              <path
                d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1V8.5Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
            <svg v-else-if="item.icon === 'category'" viewBox="0 0 20 20" width="18" height="18">
              <rect
                x="3"
                y="3"
                width="6"
                height="6"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <rect
                x="11"
                y="3"
                width="6"
                height="6"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <rect
                x="3"
                y="11"
                width="6"
                height="6"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <rect
                x="11"
                y="11"
                width="6"
                height="6"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
            </svg>
            <svg v-else-if="item.icon === 'search'" viewBox="0 0 20 20" width="18" height="18">
              <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6" />
              <line
                x1="13.2"
                y1="13.2"
                x2="17"
                y2="17"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
            <svg v-else-if="item.icon === 'user'" viewBox="0 0 20 20" width="18" height="18">
              <circle cx="10" cy="7" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6" />
              <path
                d="M4 17c0-3 2.7-5 6-5s6 2 6 5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
            <svg v-else viewBox="0 0 20 20" width="18" height="18">
              <circle
                cx="10"
                cy="10"
                r="2.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <path
                d="M10 2.8v2M10 15.2v2M2.8 10h2M15.2 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span v-show="!collapsed" class="side__label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <button
        class="side__toggle"
        type="button"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
        @click="collapsed = !collapsed"
      >
        <span aria-hidden="true">{{ collapsed ? '»' : '«' }}</span>
        <span v-show="!collapsed">收起</span>
      </button>
    </aside>

    <!-- 主体 -->
    <div class="main">
      <!-- 顶部导航（规范模块二（1）（7）） -->
      <header class="nav">
        <div class="nav__left">
          <RouterLink to="/" class="nav__brand">政策情报与项目申报智能助手</RouterLink>
        </div>

        <form class="nav__search" role="search" @submit.prevent="submitGlobal">
          <label class="visually-hidden" for="global-search">全局搜索</label>
          <input
            id="global-search"
            v-model="globalKeyword"
            class="nav__search-input"
            type="search"
            placeholder="全局搜索公告关键词…"
            autocomplete="off"
          />
          <button class="nav__search-btn" type="submit">搜索</button>
        </form>

        <div class="nav__right">
          <span class="nav__time num" :title="now.toISOString()">{{ timeText }}</span>

          <div class="nav__bell">
            <button
              class="nav__bell-btn"
              type="button"
              aria-label="消息通知"
              :aria-expanded="bellOpen"
              aria-haspopup="dialog"
              @click="toggleBell"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M12 3a6 6 0 0 0-6 6v3.2l-1.4 2.4a1 1 0 0 0 .9 1.5h13a1 1 0 0 0 .9-1.5L18 12.2V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z"
                  fill="currentColor"
                />
              </svg>
              <span v-if="unreadCount > 0" class="nav__badge" aria-hidden="true">
                {{ unreadCount > 99 ? '99+' : unreadCount }}
              </span>
              <span v-if="unreadCount > 0" class="visually-hidden">
                有 {{ unreadCount }} 条未读通知
              </span>
            </button>

            <div v-if="bellOpen" class="nav__bell-panel" role="dialog" aria-label="消息通知">
              <div class="nav__bell-head">
                <strong>消息通知</strong>
                <button
                  v-if="unreadCount > 0"
                  class="nav__bell-readall"
                  type="button"
                  @click="readAllNotifications"
                >
                  全部已读
                </button>
              </div>
              <p v-if="bellLoading" class="nav__bell-empty">加载中…</p>
              <p v-else-if="notifications.length === 0" class="nav__bell-empty">暂无新消息</p>
              <ul v-else class="nav__bell-list">
                <li v-for="item in notifications" :key="item.id">
                  <button
                    class="nav__bell-item"
                    :class="{ 'nav__bell-item--unread': !item.read }"
                    type="button"
                    @click="openNotification(item)"
                  >
                    <span class="nav__bell-title">{{ item.title }}</span>
                    <span class="nav__bell-message">{{ item.message }}</span>
                    <span class="nav__bell-time">{{ formatRelativeTime(item.created_at) }}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div class="nav__user">
            <button
              class="nav__avatar-btn"
              type="button"
              :aria-expanded="menuOpen"
              aria-haspopup="menu"
              @click="menuOpen = !menuOpen"
            >
              <span class="nav__avatar" aria-hidden="true">{{ avatarText }}</span>
              <span class="nav__name">{{ displayName }}</span>
              <span class="nav__caret" aria-hidden="true">▾</span>
            </button>

            <div v-if="menuOpen" class="nav__menu" role="menu">
              <button class="nav__menu-item" type="button" role="menuitem" @click="goProfile">
                个人中心
              </button>
              <button class="nav__menu-item" type="button" role="menuitem" @click="handleLogout">
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  background: var(--color-bg-layout);
}

/* ── 侧边栏 ─────────────────────────────────────────── */
.side {
  display: flex;
  flex-direction: column;
  width: var(--layout-sidebar-width);
  flex-shrink: 0;
  padding: var(--space-4) var(--space-2);
  background: var(--color-bg);
  border-right: 1px solid var(--color-split);
  transition: width var(--duration-base) var(--ease-out);
}

.side--collapsed {
  width: var(--layout-sidebar-collapsed-width);
}

.side__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-4);
  color: var(--color-text);
  text-decoration: none;
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
}

.side__logo {
  display: inline-flex;
  line-height: 0;
  flex-shrink: 0;
}

.side__menu {
  display: grid;
  gap: var(--space-1);
}

.side__link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-base);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: var(--font-size-body);
  white-space: nowrap;
  overflow: hidden;
  transition:
    background var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
}

.side__link:hover {
  background: var(--color-primary-bg);
  color: var(--color-primary-hover);
}

.side__link:active {
  color: var(--color-primary-active);
}

.side__link--active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.side__icon {
  display: inline-flex;
  flex-shrink: 0;
  line-height: 0;
}

.side--collapsed .side__link {
  justify-content: center;
  padding: var(--space-2);
}

.side__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  margin-top: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.side__toggle:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-hover);
}

/* ── 主体 ───────────────────────────────────────────── */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: var(--layout-nav-height);
  padding: 0 var(--space-6);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-split);
  position: sticky;
  top: 0;
  z-index: 10;
}

.nav__brand {
  color: var(--color-text);
  text-decoration: none;
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
}

.nav__search {
  display: flex;
  flex: 1;
  max-width: 420px;
  height: 32px;
}

.nav__search-input {
  flex: 1;
  min-width: 0;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-right: none;
  border-radius: var(--radius-base) 0 0 var(--radius-base);
  background: var(--color-bg);
  color: inherit;
  font-family: inherit;
  font-size: var(--font-size-sm);
  outline: none;
  transition: border-color var(--duration-base) var(--ease-out);
}

.nav__search-input:hover {
  border-color: var(--color-primary-hover);
}

.nav__search-input:focus {
  border-color: var(--color-primary);
}

.nav__search-btn {
  padding: 0 var(--space-3);
  border: 1px solid var(--color-primary);
  border-radius: 0 var(--radius-base) var(--radius-base) 0;
  background: var(--color-primary);
  color: var(--color-text-inverse);
  font-family: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out);
}

.nav__search-btn:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.nav__search-btn:active {
  background: var(--color-primary-active);
  border-color: var(--color-primary-active);
}

.nav__right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-left: auto;
}

.nav__time {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.nav__bell {
  position: relative;
}

.nav__bell-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    background var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
}

.nav__bell-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.nav__badge {
  position: absolute;
  top: 1px;
  right: 0;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--color-error);
  color: var(--color-text-inverse);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.nav__bell-panel {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  width: 340px;
  max-height: 420px;
  overflow-y: auto;
  padding: var(--space-1);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  box-shadow: var(--shadow-card-hover);
  z-index: 20;
}

.nav__bell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-split);
  font-size: var(--font-size-sm);
}

.nav__bell-readall {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-family: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.nav__bell-readall:hover {
  color: var(--color-primary-hover);
}

.nav__bell-empty {
  margin: 0;
  padding: var(--space-6) var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
}

.nav__bell-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.nav__bell-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.nav__bell-item:hover {
  background: var(--color-bg-hover);
}

.nav__bell-item--unread {
  background: var(--color-primary-bg);
}

.nav__bell-title {
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.nav__bell-message {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav__bell-time {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.nav__user {
  position: relative;
}

.nav__avatar-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out);
}

.nav__avatar-btn:hover {
  background: var(--color-bg-hover);
}

.nav__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-text-inverse);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.nav__name {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav__caret {
  color: var(--color-text-muted);
  font-size: 10px;
}

.nav__menu {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  min-width: 140px;
  padding: var(--space-1);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  box-shadow: var(--shadow-card-hover);
  z-index: 20;
}

.nav__menu-item {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out);
}

.nav__menu-item:hover {
  background: var(--color-primary-bg);
  color: var(--color-primary-hover);
}

.nav__menu-item:active {
  background: var(--color-primary-bg-hover);
  color: var(--color-primary-active);
}

.content {
  flex: 1;
  padding: var(--space-6);
}

@media (max-width: 900px) {
  .side {
    width: var(--layout-sidebar-collapsed-width);
  }

  .side__name,
  .side__label {
    display: none !important;
  }

  .nav__search {
    max-width: 200px;
  }

  .nav__time {
    display: none;
  }
}
</style>
