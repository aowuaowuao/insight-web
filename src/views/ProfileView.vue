<script setup lang="ts">
/**
 * 个人中心。
 * 对照规范 2.2.1（二）模块六：
 * （1）个人信息区：头像、姓名、部门、账号创建时间
 * （2）我的收藏：Tab 切换，展示收藏列表，支持取消收藏与批量操作
 * （3）浏览历史：Tab 切换，按时间倒序，支持清空历史
 * （4）个性化设置：关注领域多选、消息推送开关、推送时间偏好，保存后即时生效
 * （5）修改密码：需验证原密码，新密码满足复杂度（大小写+数字+特殊字符，≥8 位）
 *
 * ⚠️ 收藏/历史/设置当前存在浏览器 localStorage（后端暂无对应接口），
 * 属于前端可独立交付的部分；接口就绪后把 utils 的读写换成 api 调用即可。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { categoryName } from '@/constants/categories'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import { readJson, removeKey, writeJson } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import EmptyState from '@/components/EmptyState.vue'

const auth = useAuthStore()

/** 收藏与历史的最小结构：只存渲染需要的字段，正文不进来 */
interface StoredArticle {
  article_id: string
  title: string
  source: string
  category: string | null
  published_at: string | null
  /** 收藏/浏览时间戳 */
  at: number
}

type TabKey = 'favorites' | 'history' | 'settings' | 'password'

const activeTab = ref<TabKey>('favorites')

const favorites = ref<StoredArticle[]>([])
const history = ref<StoredArticle[]>([])
const selectedIds = ref<string[]>([])

const notify = ref('')
let notifyTimer: ReturnType<typeof setTimeout> | null = null

function flash(message: string): void {
  notify.value = message
  if (notifyTimer !== null) clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => {
    notify.value = ''
    notifyTimer = null
  }, 2500)
}

onBeforeUnmount(() => {
  if (notifyTimer !== null) clearTimeout(notifyTimer)
})

function loadStored(): void {
  favorites.value = readJson<StoredArticle[]>(STORAGE_KEYS.FAVORITES, [])
  history.value = readJson<StoredArticle[]>(STORAGE_KEYS.VIEW_HISTORY, [])
}

onMounted(loadStored)

// ── 个人信息 ───────────────────────────────────────────
/** 账号创建时间：首次登录时写入，演示阶段退化为“本次访问” */
const createdAt = computed(() => {
  const raw = readJson<{ createdAt?: number }>(STORAGE_KEYS.PREFERENCES, {})
  return raw.createdAt ? formatDateTime(new Date(raw.createdAt).toISOString()) : '—'
})

const avatarText = computed(() => (auth.username ? auth.username.charAt(0).toUpperCase() : '?'))

// ── 收藏 ───────────────────────────────────────────────
const allSelected = computed(
  () => favorites.value.length > 0 && selectedIds.value.length === favorites.value.length,
)

function toggleSelect(id: string): void {
  const index = selectedIds.value.indexOf(id)
  if (index >= 0) selectedIds.value.splice(index, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll(): void {
  selectedIds.value = allSelected.value ? [] : favorites.value.map((item) => item.article_id)
}

function removeFavorites(ids: string[]): void {
  const set = new Set(ids)
  favorites.value = favorites.value.filter((item) => !set.has(item.article_id))
  selectedIds.value = selectedIds.value.filter((id) => !set.has(id))
  writeJson(STORAGE_KEYS.FAVORITES, favorites.value)
  flash(`已取消收藏 ${ids.length} 条`)
}

function removeOne(id: string): void {
  removeFavorites([id])
}

function removeSelected(): void {
  if (selectedIds.value.length === 0) return
  removeFavorites([...selectedIds.value])
}

// ── 浏览历史 ───────────────────────────────────────────
function clearHistory(): void {
  history.value = []
  removeKey(STORAGE_KEYS.VIEW_HISTORY)
  flash('浏览历史已清空')
}

// ── 个性化设置 ─────────────────────────────────────────
/** 关注领域候选（与 6 个大类对齐） */
const FIELD_OPTIONS = [
  'project_application',
  'industry_policy',
  'talent_application',
  'enterprise_certification',
  'funding_subsidy',
  'other',
] as const

interface Preferences {
  fields: string[]
  notifyEnabled: boolean
  /** 推送时间偏好，HH:mm */
  notifyTime: string
  createdAt?: number
}

const preferences = ref<Preferences>({
  fields: [],
  notifyEnabled: true,
  notifyTime: '09:00',
})

watch(
  activeTab,
  () => {
    if (activeTab.value !== 'settings') return
    const stored = readJson<Partial<Preferences>>(STORAGE_KEYS.PREFERENCES, {})
    preferences.value = {
      fields: Array.isArray(stored.fields) ? stored.fields : [],
      notifyEnabled: stored.notifyEnabled !== false,
      notifyTime: typeof stored.notifyTime === 'string' ? stored.notifyTime : '09:00',
      createdAt: stored.createdAt,
    }
  },
  { immediate: true },
)

function toggleField(id: string): void {
  const index = preferences.value.fields.indexOf(id)
  if (index >= 0) preferences.value.fields.splice(index, 1)
  else preferences.value.fields.push(id)
}

function savePreferences(): void {
  const stored = readJson<Partial<Preferences>>(STORAGE_KEYS.PREFERENCES, {})
  const ok = writeJson(STORAGE_KEYS.PREFERENCES, {
    ...stored,
    ...preferences.value,
    createdAt: stored.createdAt ?? Date.now(),
  })
  flash(ok ? '设置已保存，已即时生效' : '保存失败：浏览器存储不可用（隐私模式？）')
}

// ── 修改密码 ───────────────────────────────────────────
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')

/** 规范：新密码需满足 大小写 + 数字 + 特殊字符，≥8 位 */
function passwordChecks(value: string): { label: string; ok: boolean }[] {
  return [
    { label: '至少 8 位', ok: value.length >= 8 },
    { label: '包含大写字母', ok: /[A-Z]/.test(value) },
    { label: '包含小写字母', ok: /[a-z]/.test(value) },
    { label: '包含数字', ok: /[0-9]/.test(value) },
    { label: '包含特殊字符', ok: /[^A-Za-z0-9]/.test(value) },
  ]
}

const passwordCheckList = computed(() => passwordChecks(newPassword.value))
const passwordValid = computed(() => passwordCheckList.value.every((item) => item.ok))

function submitPassword(): void {
  passwordError.value = ''
  if (!oldPassword.value) {
    passwordError.value = '请输入原密码'
    return
  }
  // 演示账号的密码校验需要走后端；当前实现只做前端规则校验，并明确告知用户
  if (!passwordValid.value) {
    passwordError.value = '新密码不符合复杂度要求'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  passwordError.value = '演示环境不提供真实改密：接入后端后此处调用 /v1/users/password'
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'favorites', label: '我的收藏' },
  { key: 'history', label: '浏览历史' },
  { key: 'settings', label: '个性化设置' },
  { key: 'password', label: '修改密码' },
]
</script>

<template>
  <section class="profile">
    <header class="profile__head">
      <h1 class="profile__title">个人中心</h1>
    </header>

    <!-- 个人信息区（规范模块六（1）） -->
    <div class="card profile__info">
      <span class="profile__avatar" aria-hidden="true">{{ avatarText }}</span>
      <dl class="profile__fields">
        <div class="profile__field">
          <dt>姓名</dt>
          <dd>{{ auth.username || '—' }}</dd>
        </div>
        <div class="profile__field">
          <dt>部门</dt>
          <dd>—</dd>
        </div>
        <div class="profile__field">
          <dt>账号创建时间</dt>
          <dd class="num">{{ createdAt }}</dd>
        </div>
      </dl>
    </div>

    <!-- Tab -->
    <div class="tabs" role="tablist" aria-label="个人中心分区">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="tabs__item"
        :class="{ 'tabs__item--active': activeTab === tab.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span v-if="tab.key === 'favorites' && favorites.length" class="tabs__count num">
          {{ favorites.length }}
        </span>
        <span v-else-if="tab.key === 'history' && history.length" class="tabs__count num">
          {{ history.length }}
        </span>
      </button>
    </div>

    <p v-if="notify" class="profile__notify" role="status">{{ notify }}</p>

    <!-- 我的收藏 -->
    <div v-if="activeTab === 'favorites'" class="panel">
      <div v-if="favorites.length" class="panel__toolbar">
        <label class="check">
          <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
          <span>全选</span>
        </label>
        <button
          class="btn btn--danger"
          type="button"
          :disabled="selectedIds.length === 0"
          @click="removeSelected"
        >
          批量取消收藏（{{ selectedIds.length }}）
        </button>
      </div>

      <ul v-if="favorites.length" class="list">
        <li v-for="item in favorites" :key="item.article_id" class="list__item">
          <label class="check">
            <input
              type="checkbox"
              :checked="selectedIds.includes(item.article_id)"
              :aria-label="`选择 ${item.title}`"
              @change="toggleSelect(item.article_id)"
            />
          </label>
          <RouterLink :to="{ name: 'article', params: { id: item.article_id } }" class="list__link">
            <span class="list__tag">{{ categoryName(item.category ?? '') }}</span>
            <span class="list__title">{{ item.title }}</span>
            <span class="list__meta">
              {{ item.source }} · 收藏于 {{ formatRelativeTime(new Date(item.at).toISOString()) }}
            </span>
          </RouterLink>
          <button class="btn btn--text" type="button" @click="removeOne(item.article_id)">
            取消收藏
          </button>
        </li>
      </ul>

      <EmptyState
        v-else
        variant="no-data"
        title="还没有收藏任何公告"
        description="在公告详情页点「收藏」即可加入这里。"
      />
    </div>

    <!-- 浏览历史 -->
    <div v-else-if="activeTab === 'history'" class="panel">
      <div v-if="history.length" class="panel__toolbar">
        <span class="panel__hint">最近浏览 {{ history.length }} 条（按时间倒序）</span>
        <button class="btn btn--danger" type="button" @click="clearHistory">清空历史</button>
      </div>

      <ul v-if="history.length" class="list">
        <li v-for="item in history" :key="item.article_id" class="list__item">
          <RouterLink :to="{ name: 'article', params: { id: item.article_id } }" class="list__link">
            <span class="list__tag">{{ categoryName(item.category ?? '') }}</span>
            <span class="list__title">{{ item.title }}</span>
            <span class="list__meta">
              {{ item.source }} · {{ formatRelativeTime(new Date(item.at).toISOString()) }}
            </span>
          </RouterLink>
        </li>
      </ul>

      <EmptyState
        v-else
        variant="no-data"
        title="还没有浏览记录"
        description="浏览过的公告会自动记录在这里。"
      />
    </div>

    <!-- 个性化设置 -->
    <div v-else-if="activeTab === 'settings'" class="panel">
      <fieldset class="settings__group">
        <legend class="settings__legend">关注领域</legend>
        <div class="settings__checks">
          <label v-for="id in FIELD_OPTIONS" :key="id" class="check">
            <input
              type="checkbox"
              :checked="preferences.fields.includes(id)"
              @change="toggleField(id)"
            />
            <span>{{ categoryName(id) }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset class="settings__group">
        <legend class="settings__legend">消息推送</legend>
        <label class="switch">
          <input v-model="preferences.notifyEnabled" type="checkbox" />
          <span>{{ preferences.notifyEnabled ? '已开启' : '已关闭' }}</span>
        </label>

        <label class="settings__row">
          <span>推送时间偏好</span>
          <input v-model="preferences.notifyTime" class="input" type="time" />
        </label>
      </fieldset>

      <button class="btn btn--primary" type="button" @click="savePreferences">保存设置</button>
    </div>

    <!-- 修改密码 -->
    <div v-else class="panel">
      <div class="form">
        <label class="form__row">
          <span class="form__label">原密码</span>
          <input
            v-model="oldPassword"
            class="input"
            type="password"
            autocomplete="current-password"
          />
        </label>

        <label class="form__row">
          <span class="form__label">新密码</span>
          <input v-model="newPassword" class="input" type="password" autocomplete="new-password" />
        </label>

        <ul class="rules">
          <li
            v-for="rule in passwordCheckList"
            :key="rule.label"
            class="rules__item"
            :class="{ 'rules__item--ok': rule.ok }"
          >
            {{ rule.ok ? '✓' : '·' }} {{ rule.label }}
          </li>
        </ul>

        <label class="form__row">
          <span class="form__label">确认新密码</span>
          <input
            v-model="confirmPassword"
            class="input"
            type="password"
            autocomplete="new-password"
          />
        </label>

        <p v-if="passwordError" class="form__error" role="alert">{{ passwordError }}</p>

        <button class="btn btn--primary" type="button" @click="submitPassword">提交修改</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile {
  max-width: var(--layout-max-width);
  margin: 0 auto;
}

.profile__title {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-h2);
}

.card {
  padding: var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.profile__info {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.profile__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-text-inverse);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  flex-shrink: 0;
}

.profile__fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  margin: 0;
}

.profile__field dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  margin-bottom: var(--space-1);
}

.profile__field dd {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-body);
}

.tabs {
  display: flex;
  gap: var(--space-1);
  margin: var(--space-4) 0;
  border-bottom: 1px solid var(--color-split);
}

.tabs__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--font-size-body);
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.tabs__item:hover {
  color: var(--color-primary-hover);
}

.tabs__item:active {
  color: var(--color-primary-active);
}

.tabs__item--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.tabs__count {
  padding: 0 var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}

.profile__notify {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-base);
  background: var(--color-success-bg);
  color: var(--color-success);
  font-size: var(--font-size-sm);
}

.panel {
  display: grid;
  gap: var(--space-3);
}

.panel__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.panel__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.list__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  transition: border-color var(--duration-base) var(--ease-out);
}

.list__item:hover {
  border-color: var(--color-primary-hover);
}

.list__link {
  display: grid;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.list__tag {
  justify-self: start;
  padding: 1px var(--space-2);
  border-radius: var(--radius-tag);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}

.list__title {
  color: var(--color-text);
  font-size: var(--font-size-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    background var(--duration-base) var(--ease-out);
}

.btn:hover:not(:disabled) {
  color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.btn:active:not(:disabled) {
  color: var(--color-primary-active);
  border-color: var(--color-primary-active);
}

.btn:disabled {
  color: var(--color-text-disabled);
  border-color: var(--color-split);
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--color-text-inverse);
}

.btn--danger {
  color: var(--color-error);
  border-color: rgb(255, 77, 79, 0.45);
}

.btn--danger:hover:not(:disabled) {
  color: var(--color-error);
  border-color: var(--color-error);
  background: var(--color-error-bg);
}

.btn--danger:disabled {
  color: var(--color-text-disabled);
  border-color: var(--color-split);
  background: transparent;
}

.btn--text {
  border-color: transparent;
  color: var(--color-primary);
}

.settings__group {
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.settings__legend {
  padding: 0 var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.settings__checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.settings__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.input {
  height: 32px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm);
  outline: none;
  transition: border-color var(--duration-base) var(--ease-out);
}

.input:hover {
  border-color: var(--color-primary-hover);
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(24, 144, 255, 0.2);
}

.form {
  display: grid;
  gap: var(--space-3);
  max-width: 420px;
  padding: var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.form__row {
  display: grid;
  gap: var(--space-1);
}

.form__label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.form__error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-xs);
}

.rules {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.rules__item--ok {
  color: var(--color-success);
}
</style>
