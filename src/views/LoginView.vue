<script setup lang="ts">
/**
 * 登录页。
 * 对照规范 2.2.1（二）模块一逐条落实：
 * （1）账号密码输入表单，支持回车提交 —— form 的 submit 事件天然支持回车
 * （2）用户名密码必填、密码长度不少于 6 位、校验不通过时红色提示
 * （3）登录成功后维持登录状态 —— 见 stores/auth.ts
 * （4）账号不存在 / 密码错误 / 网络异常分别给出明确中文提示
 * （5）连续 5 次失败临时锁定 15 分钟；密码支持显示/隐藏切换
 * （6）登录框居中、背景采用渐变色调
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, LOCK_DURATION_MS, MAX_LOGIN_ATTEMPTS } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
/** 字段级校验错误（红色提示在输入框下方） */
const fieldErrors = ref<{ username: string; password: string }>({ username: '', password: '' })
/** 整体错误（账号锁、密码错等） */
const formError = ref('')

/** 锁定倒计时：每秒刷新一次，锁过期后自动消失 */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

function startTimer(): void {
  if (timer !== null) return
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

const lockRemaining = computed(() => {
  // 依赖 now 让倒计时每秒重算
  void now.value
  return auth.isLocked ? auth.lockRemainingSeconds : 0
})

const lockMinutes = computed(() => Math.ceil(lockRemaining.value / 60))

watch(
  lockRemaining,
  (value) => {
    if (value > 0) startTimer()
    else stopTimer()
  },
  { immediate: true },
)

onBeforeUnmount(stopTimer)

/** 校验：规范要求用户名密码必填、密码 ≥6 位 */
function validate(): boolean {
  const errors = { username: '', password: '' }

  if (!username.value.trim()) errors.username = '请输入用户名'
  if (!password.value) errors.password = '请输入密码'
  else if (password.value.length < 6) errors.password = '密码长度不能少于 6 位'

  fieldErrors.value = errors
  return !errors.username && !errors.password
}

async function handleSubmit(): Promise<void> {
  formError.value = ''

  // 锁定期间禁止提交，直接给出剩余时间
  if (auth.isLocked) {
    formError.value = `账号已临时锁定，请 ${lockMinutes.value} 分钟后再试`
    return
  }

  if (!validate()) return

  submitting.value = true
  try {
    const result = await auth.login(username.value, password.value)
    if (!result.ok) {
      formError.value = result.message
      if (result.reason === 'locked') startTimer()
      return
    }

    // 登录前想去的页面（由路由守卫塞进 query），没有就回首页
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } catch (error) {
    // 网络异常单独提示（规范模块一（4））
    formError.value =
      error instanceof Error ? `网络异常：${error.message}` : '网络异常，请检查网络后重试'
  } finally {
    submitting.value = false
  }
}

/** 失焦即校验单个字段，比等到提交才报错更好用 */
function blurUsername(): void {
  if (!username.value.trim()) fieldErrors.value.username = '请输入用户名'
  else fieldErrors.value.username = ''
}

function blurPassword(): void {
  if (!password.value) fieldErrors.value.password = '请输入密码'
  else if (password.value.length < 6) fieldErrors.value.password = '密码长度不能少于 6 位'
  else fieldErrors.value.password = ''
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <header class="login__head">
        <span class="login__logo" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="44" height="44">
            <rect x="4" y="8" width="40" height="32" rx="6" fill="var(--color-primary)" />
            <rect x="10" y="16" width="20" height="3" rx="1.5" fill="#ffffff" opacity="0.9" />
            <rect x="10" y="23" width="28" height="3" rx="1.5" fill="#ffffff" opacity="0.65" />
            <rect x="10" y="30" width="14" height="3" rx="1.5" fill="#ffffff" opacity="0.45" />
          </svg>
        </span>
        <h1 class="login__title">政策情报与项目申报智能助手</h1>
        <p class="login__subtitle">请登录后进入系统</p>
      </header>

      <form class="login__form" novalidate @submit.prevent="handleSubmit">
        <div class="field">
          <label class="field__label" for="login-username">用户名</label>
          <input
            id="login-username"
            v-model="username"
            class="field__input"
            :class="{ 'field__input--error': fieldErrors.username }"
            type="text"
            name="username"
            autocomplete="username"
            placeholder="请输入用户名"
            :aria-invalid="Boolean(fieldErrors.username)"
            :aria-describedby="fieldErrors.username ? 'login-username-error' : undefined"
            @blur="blurUsername"
          />
          <p
            v-if="fieldErrors.username"
            id="login-username-error"
            class="field__error"
            role="alert"
          >
            {{ fieldErrors.username }}
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="login-password">密码</label>
          <div class="field__group">
            <input
              id="login-password"
              v-model="password"
              class="field__input"
              :class="{ 'field__input--error': fieldErrors.password }"
              :type="showPassword ? 'text' : 'password'"
              name="password"
              autocomplete="current-password"
              placeholder="请输入密码（不少于 6 位）"
              :aria-invalid="Boolean(fieldErrors.password)"
              :aria-describedby="fieldErrors.password ? 'login-password-error' : undefined"
              @blur="blurPassword"
            />
            <button
              class="field__toggle"
              type="button"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
          <p
            v-if="fieldErrors.password"
            id="login-password-error"
            class="field__error"
            role="alert"
          >
            {{ fieldErrors.password }}
          </p>
        </div>

        <p v-if="lockRemaining > 0" class="login__locked" role="alert">
          连续 {{ MAX_LOGIN_ATTEMPTS }} 次登录失败，账号已锁定，请
          <strong class="num">{{ lockMinutes }}</strong> 分钟后再试
        </p>
        <p v-else-if="formError" class="login__error" role="alert">{{ formError }}</p>

        <button class="login__submit" type="submit" :disabled="submitting || lockRemaining > 0">
          {{ submitting ? '登录中…' : '登 录' }}
        </button>
      </form>

      <p class="login__hint">
        请使用管理员分配的账号登录
        <span class="login__lock-note">
          （连续 {{ MAX_LOGIN_ATTEMPTS }} 次失败将锁定 {{ LOCK_DURATION_MS / 60000 }} 分钟）
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 规范模块一（6）：登录框居中、背景渐变 */
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--space-6) var(--space-4);
  background:
    radial-gradient(circle at 15% 20%, rgb(24, 144, 255, 0.16), transparent 45%),
    radial-gradient(circle at 85% 75%, rgb(105, 192, 255, 0.2), transparent 50%),
    linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 45%, #f5f9ff 100%);
}

.login__card {
  width: 100%;
  max-width: 400px;
  padding: var(--space-8) var(--space-6) var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-modal);
  background: var(--color-bg);
  box-shadow: var(--shadow-modal);
}

.login__head {
  margin-bottom: var(--space-6);
  text-align: center;
}

.login__logo {
  display: inline-flex;
  line-height: 0;
}

.login__title {
  margin: var(--space-3) 0 var(--space-1);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.login__subtitle {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.login__form {
  display: grid;
  gap: var(--space-4);
}

.field {
  display: grid;
  gap: var(--space-1);
}

.field__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.field__group {
  position: relative;
  display: block;
}

.field__input {
  width: 100%;
  height: 38px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-body);
  outline: none;
  transition:
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.field__group .field__input {
  padding-right: 56px;
}

/* hover / focus / disabled 三态（规范 UI（6）） */
.field__input:hover {
  border-color: var(--color-primary-hover);
}

.field__input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(24, 144, 255, 0.2);
}

.field__input:disabled {
  border-color: var(--color-split);
  background: var(--color-bg-layout);
  color: var(--color-text-disabled);
  cursor: not-allowed;
}

.field__input--error {
  border-color: var(--color-error);
}

.field__input--error:focus {
  box-shadow: 0 0 0 2px rgb(255, 77, 79, 0.2);
}

.field__toggle {
  position: absolute;
  top: 50%;
  right: var(--space-2);
  transform: translateY(-50%);
  padding: 2px var(--space-2);
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-primary);
  font-family: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: color var(--duration-base) var(--ease-out);
}

.field__toggle:hover {
  color: var(--color-primary-hover);
}

.field__toggle:active {
  color: var(--color-primary-active);
}

.field__error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-xs);
}

.login__error,
.login__locked {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid rgb(255, 77, 79, 0.3);
  border-radius: var(--radius-base);
  background: var(--color-error-bg);
  color: var(--color-error);
  font-size: var(--font-size-xs);
}

.login__submit {
  height: 40px;
  border: none;
  border-radius: var(--radius-base);
  background: var(--color-primary);
  color: var(--color-text-inverse);
  font-family: inherit;
  font-size: var(--font-size-body);
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background var(--duration-base) var(--ease-out);
}

.login__submit:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.login__submit:active:not(:disabled) {
  background: var(--color-primary-active);
}

.login__submit:disabled {
  background: var(--color-text-disabled);
  cursor: not-allowed;
}

.login__hint {
  margin: var(--space-4) 0 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.login__lock-note {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text-disabled);
}
</style>
