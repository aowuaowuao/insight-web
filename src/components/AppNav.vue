<script setup lang="ts">
/**
 * 顶部导航 + 侧边栏（Element Plus 版）。
 * 对照规范 2.2.1（二）模块二：
 * （1）顶部导航栏：系统 Logo、当前时间、用户头像与下拉菜单（含个人中心、退出登录）
 * （6）侧边栏折叠/展开：折叠后仅显示图标，展开显示完整菜单文字
 * （7）全局搜索入口：顶部提供全局搜索框
 *
 * 消息通知（5）：顶部铃铛展示未读角标，下拉查看新分析出的项目申报公告；
 * 打开通知即标记已读，侧栏折叠不影响。数据来自 /v1/notifications。
 */
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  ArrowDown,
  Bell,
  Expand,
  Fold,
  Grid,
  HomeFilled,
  Search,
  Setting,
  User,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useNarrowViewport } from '@/composables/useNarrowViewport'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/api/notifications'
import { formatRelativeTime } from '@/utils/format'
import { isImeConfirming } from '@/utils/ime'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { user, displayName, isAdmin } = storeToRefs(auth)

/** 侧边栏折叠状态（规范模块二（6）） */
const collapsed = ref(false)
/** 手机端改为底部导航，进入窄屏时强制展开，避免只剩图标 */
const { isNarrow } = useNarrowViewport()
watch(
  isNarrow,
  (narrow) => {
    if (narrow) collapsed.value = false
  },
  { immediate: true },
)
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

function toggleBell(): void {
  bellOpen.value = !bellOpen.value
  if (bellOpen.value) void loadNotifications()
}

onMounted(() => {
  void loadNotifications()
  bellTimer = setInterval(() => void loadNotifications(), 60_000)
})

/** 切换账号时必须清掉上一位用户的未读角标与列表，迟到的轮询响应也要作废 */
watch(
  () => user.value?.id ?? null,
  (nextUserId, previousUserId) => {
    if (nextUserId === previousUserId) return
    notificationRequestId += 1
    bellLoading.value = false
    bellOpen.value = false
    notifications.value = []
    unreadCount.value = 0
    if (nextUserId !== null) void loadNotifications()
  },
)

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
    { to: '/', label: '首页', icon: markRaw(HomeFilled) },
    { to: '/category', label: '分类浏览', icon: markRaw(Grid) },
    { to: '/search', label: '信息检索', icon: markRaw(Search) },
    { to: '/profile', label: '个人中心', icon: markRaw(User) },
  ]
  if (isAdmin.value) items.push({ to: '/admin', label: '管理控制台', icon: markRaw(Setting) })
  return items
})

/** 当前激活菜单：按路径段边界取最长匹配，/searchfoo 不会点亮 /search */
const activeMenu = computed(() => {
  const matched = [...menu.value]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) =>
      item.to === '/'
        ? route.path === '/'
        : route.path === item.to || route.path.startsWith(item.to + '/'),
    )
  return matched?.to ?? route.path
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

async function handleUserCommand(command: string): Promise<void> {
  if (command === 'profile') {
    await router.push({ name: 'profile' })
    return
  }
  if (command === 'logout') {
    await auth.logout()
    router.replace({ name: 'login' })
  }
}

/** 全局搜索：跳到检索页并带上关键词 */
function submitGlobal(): void {
  const q = globalKeyword.value.trim()
  if (!q) return
  router.push({ name: 'search', query: { q } })
  globalKeyword.value = ''
}

/** 全局搜索框的 Enter 提交；输入法确认 Enter 不提交 */
function onGlobalEnter(event: KeyboardEvent): void {
  // 必须先 preventDefault：输入法确认 Enter 同样会触发表单的隐式提交，
  // 如果不拦住，用户还在选词就被带走一次搜索。
  event.preventDefault()
  if (isImeConfirming(event)) return
  submitGlobal()
}

const foldIcon = computed(() => (collapsed.value ? Expand : Fold))

onBeforeUnmount(() => {
  if (bellTimer !== null) clearInterval(bellTimer)
  bellTimer = null
})
</script>

<template>
  <div class="shell" :class="{ 'shell--collapsed': collapsed }">
    <!-- 侧边栏（规范模块二（6）） -->
    <nav class="side" :class="{ 'side--collapsed': collapsed }" aria-label="侧边导航">
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

      <ul class="side__menu">
        <li v-for="item in menu" :key="item.to">
          <RouterLink
            :to="item.to"
            class="side__link"
            :class="{ 'side__link--active': activeMenu === item.to }"
            :aria-label="item.label"
            :aria-current="activeMenu === item.to ? 'page' : undefined"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span class="side__link-label">{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>

      <el-button
        class="side__toggle"
        text
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
        @click="collapsed = !collapsed"
      >
        <el-icon><component :is="foldIcon" /></el-icon>
        <span v-show="!collapsed">收起</span>
      </el-button>
    </nav>

    <!-- 主体 -->
    <div class="main">
      <!-- 顶部导航（规范模块二（1）（7）） -->
      <header class="nav">
        <div class="nav__left">
          <RouterLink to="/" class="nav__brand">政策情报与项目申报智能助手</RouterLink>
        </div>

        <el-input
          id="global-search"
          v-model="globalKeyword"
          class="nav__search"
          placeholder="全局搜索公告关键词…"
          aria-label="全局搜索公告关键词"
          clearable
          @keydown.enter="onGlobalEnter"
        >
          <template #append>
            <el-button :icon="Search" @click="submitGlobal">搜索</el-button>
          </template>
        </el-input>

        <div class="nav__right">
          <span class="nav__time num" :title="now.toISOString()">{{ timeText }}</span>

          <div class="nav__bell">
            <el-button
              class="nav__bell-btn"
              circle
              text
              :icon="Bell"
              aria-label="消息通知"
              @click="toggleBell"
            />
            <span v-if="unreadCount > 0" class="nav__badge" aria-label="未读消息数">{{
              unreadCount
            }}</span>

            <div v-if="bellOpen" class="nav__bell-panel" role="dialog" aria-label="消息通知">
              <div class="nav__bell-head">
                <strong>消息通知</strong>
                <el-button
                  class="nav__bell-readall"
                  link
                  type="primary"
                  @click="readAllNotifications"
                >
                  全部已读
                </el-button>
              </div>
              <p v-if="bellLoading" class="nav__bell-empty">加载中…</p>
              <p v-else-if="notifications.length === 0" class="nav__bell-empty">暂无新消息</p>
              <el-scrollbar v-else max-height="360px">
                <ul class="nav__bell-list">
                  <li v-for="item in notifications" :key="item.id">
                    <el-button
                      class="nav__bell-item"
                      :class="{ 'nav__bell-item--unread': !item.read }"
                      text
                      @click="openNotification(item)"
                    >
                      <span class="nav__bell-title">{{ item.title }}</span>
                      <span class="nav__bell-message">{{ item.message }}</span>
                      <span class="nav__bell-time">{{ formatRelativeTime(item.created_at) }}</span>
                    </el-button>
                  </li>
                </ul>
              </el-scrollbar>
            </div>
          </div>

          <el-dropdown trigger="click" :teleported="false" @command="handleUserCommand">
            <span class="nav__avatar-btn" role="menu">
              <el-avatar :size="28" class="nav__avatar">{{ avatarText }}</el-avatar>
              <span class="nav__name">{{ displayName }}</span>
              <el-icon class="nav__caret"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile" class="nav__menu-item">
                  个人中心
                </el-dropdown-item>
                <el-dropdown-item command="logout" class="nav__menu-item" divided>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main id="main-content" class="content" tabindex="-1">
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
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  border-right: none;
  background: transparent;
  list-style: none;
}

.side__menu > li {
  display: flex;
  min-width: 0;
}

.side__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  height: 42px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-base);
  color: var(--color-text-secondary);
  text-decoration: none;
  white-space: nowrap;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.side__link:hover {
  background: var(--color-primary-bg);
  color: var(--color-primary-hover);
}

.side__link--active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.side__toggle {
  margin-top: auto;
  width: 100%;
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
  flex: 1;
  max-width: 420px;
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
  display: inline-flex;
  align-items: center;
  position: relative;
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
  white-space: nowrap;
}

.nav__bell-panel {
  position: absolute;
  top: calc(100% + var(--space-2));
  right: 0;
  width: 340px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-modal);
  z-index: 40;
}

.nav__bell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-split);
  font-size: var(--font-size-sm);
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
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  height: auto;
  padding: var(--space-2) var(--space-3);
  white-space: normal;
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

.nav__avatar-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-base);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out);
}

.nav__avatar-btn:hover {
  background: var(--color-bg-hover);
}

.nav__avatar {
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

.content {
  flex: 1;
  padding: var(--space-6);
}

@media (max-width: 900px) {
  .side {
    width: var(--layout-sidebar-collapsed-width);
  }

  .side__name {
    display: none !important;
  }

  .side__link {
    justify-content: center;
    padding: 0 !important;
    font-size: 0;
  }

  .side__link .el-icon {
    font-size: 20px;
  }

  .side__link .side__link-label {
    display: none;
  }

  .nav__search {
    max-width: 200px;
  }

  .nav__time {
    display: none;
  }
}

/* 手机：桌面侧边栏降级为底部导航；桌面规则保持不变 */
@media (max-width: 768px) {
  .shell {
    display: block;
  }

  .side,
  .side--collapsed {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 50;
    width: 100%;
    height: calc(var(--layout-mobile-nav-height) + env(safe-area-inset-bottom));
    padding: 0 0 env(safe-area-inset-bottom);
    flex-direction: row;
    border-top: 1px solid var(--color-split);
    border-right: 0;
    background: var(--color-bg);
    box-shadow: 0 -2px 10px rgb(0 0 0 / 6%);
  }

  .side__brand,
  .side__toggle {
    display: none;
  }

  .side__menu {
    display: flex;
    flex: 1;
    flex-direction: row;
    width: 100%;
    min-width: 0;
    height: var(--layout-mobile-nav-height);
    background: transparent;
  }

  .side__menu > li {
    flex: 1;
    min-width: 0;
  }

  .side__link {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    justify-content: center;
    height: var(--layout-mobile-nav-height);
    min-width: 0;
    padding: 0 2px !important;
    border-radius: 0;
    font-size: 10px;
    line-height: 1.1;
  }

  .side__link .el-icon {
    margin: 0;
    font-size: 19px;
  }

  .side__link .side__link-label {
    display: block;
    margin: 0;
    overflow: hidden;
    font-size: 10px;
    line-height: 1.1;
    white-space: nowrap;
  }

  .side__link--active {
    border-top: 2px solid var(--color-primary);
    background: var(--color-primary-bg);
  }

  .main {
    min-height: 100vh;
    padding-bottom: calc(var(--layout-mobile-nav-height) + env(safe-area-inset-bottom));
  }

  .nav {
    height: 56px;
    padding: 0 var(--space-3);
    gap: var(--space-2);
  }

  .nav__brand {
    display: block;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav__search {
    display: none;
  }

  .nav__time {
    display: none;
  }

  .nav__right {
    gap: var(--space-1);
  }

  .nav__name,
  .nav__caret {
    display: none;
  }

  .nav__avatar-btn {
    padding: 0;
  }

  .nav__bell-panel {
    position: fixed;
    top: 56px;
    right: var(--space-3);
    left: var(--space-3);
    width: auto;
    max-height: calc(100vh - 140px);
    overflow: auto;
  }

  .content {
    padding: var(--space-3);
  }
}

@media (max-width: 480px) {
  .nav {
    padding: 0 var(--space-2);
  }

  .nav__brand {
    font-size: 12px;
  }

  .content {
    padding: var(--space-2);
  }

  .side__link .side__link-label {
    font-size: 9px;
  }
}
</style>
