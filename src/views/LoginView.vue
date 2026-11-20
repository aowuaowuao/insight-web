<script setup lang="ts">
/**
 * 登录页（Element Plus 版）。
 * 规范 2.2.1（二）模块一：账号密码表单、必填与密码长度校验、回车提交、
 * 连续 5 次失败锁定 15 分钟、密码显示/隐藏切换、登录框居中渐变背景。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useAuthStore, LOCK_DURATION_MS, MAX_LOGIN_ATTEMPTS } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const form = reactive({ username: '', password: '' })
const submitting = ref(false)
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
  void now.value
  return auth.isLocked ? auth.lockRemainingSeconds : 0
})
const lockMinutes = computed(() => Math.ceil(lockRemaining.value / 60))

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' },
  ],
}

async function handleSubmit(): Promise<void> {
  formError.value = ''
  if (auth.isLocked) {
    formError.value = `账号已临时锁定，请 ${lockMinutes.value} 分钟后再试`
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const result = await auth.login(form.username, form.password)
    if (!result.ok) {
      formError.value = result.message
      if (result.reason === 'locked') startTimer()
      return
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } catch (error) {
    formError.value =
      error instanceof Error ? `网络异常：${error.message}` : '网络异常，请检查网络后重试'
  } finally {
    submitting.value = false
  }
}

// 锁定期间启动倒计时，解锁后自动停掉
watch(
  lockRemaining,
  (value) => {
    if (value > 0) startTimer()
    else stopTimer()
  },
  { immediate: true },
)

onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="login">
    <el-card class="login__card" shadow="always">
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

      <el-form
        ref="formRef"
        class="login__form"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            id="login-username"
            v-model="form.username"
            :prefix-icon="User"
            placeholder="请输入用户名"
            autocomplete="username"
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            id="login-password"
            v-model="form.password"
            :prefix-icon="Lock"
            type="password"
            show-password
            placeholder="请输入密码（不少于 6 位）"
            autocomplete="current-password"
          />
        </el-form-item>

        <el-alert
          v-if="lockRemaining > 0"
          type="warning"
          :closable="false"
          show-icon
          :title="`连续 ${MAX_LOGIN_ATTEMPTS} 次登录失败，账号已锁定，请 ${lockMinutes} 分钟后再试`"
        />
        <el-alert
          v-else-if="formError"
          type="error"
          :closable="false"
          show-icon
          :title="formError"
        />

        <el-button
          class="login__submit"
          type="primary"
          native-type="submit"
          :loading="submitting"
          :disabled="lockRemaining > 0"
        >
          {{ submitting ? '登录中…' : '登 录' }}
        </el-button>
      </el-form>

      <p class="login__hint">
        请使用管理员分配的账号登录
        <span class="login__lock-note">
          （连续 {{ MAX_LOGIN_ATTEMPTS }} 次失败将锁定 {{ LOCK_DURATION_MS / 60000 }} 分钟）
        </span>
      </p>
    </el-card>
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
  border-radius: var(--radius-modal);
  box-shadow: var(--shadow-modal);
}

.login__card :deep(.el-card__body) {
  padding: var(--space-8) var(--space-6) var(--space-4);
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
  gap: var(--space-3);
}

.login__form :deep(.el-form-item) {
  margin-bottom: 0;
}

.login__submit {
  width: 100%;
  height: 40px;
  letter-spacing: 0.08em;
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

@media (max-width: 768px) {
  .login {
    padding: 16px 12px;
  }

  .login__card {
    width: 100%;
    max-width: 400px;
  }

  .login__card :deep(.el-card__body) {
    padding: 24px 16px;
  }
}

@media (max-width: 480px) {
  .login {
    padding: 12px 8px;
  }
}
</style>
