<script setup lang="ts">
/**
 * 登录页：当前是纯前端校验的示范实现（测试账号见 stores/auth.ts）。
 * 接入后端时，把 auth.login 换成接口调用即可。
 */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')

function handleSubmit(): void {
  error.value = ''

  if (!username.value.trim()) {
    error.value = '请输入用户名'
    return
  }
  if (!password.value) {
    error.value = '请输入密码'
    return
  }

  const result = auth.login(username.value, password.value)
  if (!result.ok) {
    error.value = result.message
    return
  }

  // 登录前想去的页面（由路由守卫塞进 query），没有就回首页
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.replace(redirect)
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <header class="login__head">
        <span class="login__logo" aria-hidden="true">🐟</span>
        <h1 class="login__title">登录</h1>
        <p class="login__subtitle">请先登录，再进入平台</p>
      </header>

      <form class="login__form" @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field__label">用户名</span>
          <input
            v-model="username"
            class="field__input"
            type="text"
            name="username"
            autocomplete="username"
            placeholder="请输入用户名"
          />
        </label>

        <label class="field">
          <span class="field__label">密码</span>
          <input
            v-model="password"
            class="field__input"
            type="password"
            name="password"
            autocomplete="current-password"
            placeholder="请输入密码"
          />
        </label>

        <p v-if="error" class="login__error" role="alert">{{ error }}</p>

        <button class="login__submit" type="submit">登 录</button>
      </form>

      <p class="login__hint">演示环境 · 测试账号 <code>test</code></p>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem 1.2rem;
}

.login__card {
  width: 100%;
  max-width: 380px;
  padding: 2.4rem 2rem 1.8rem;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.login__head {
  text-align: center;
  margin-bottom: 1.8rem;
}

.login__logo {
  font-size: 2rem;
  line-height: 1;
}

.login__title {
  margin: 0.6rem 0 0.35rem;
  font-size: 1.45rem;
}

.login__subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.login__form {
  display: grid;
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.4rem;
}

.field__label {
  font-size: 0.84rem;
  color: var(--muted);
}

.field__input {
  width: 100%;
  padding: 0.62rem 0.85rem;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.field__input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.login__error {
  margin: 0;
  padding: 0.55rem 0.8rem;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 0.84rem;
}

.login__submit {
  margin-top: 0.3rem;
  padding: 0.68rem;
  border: none;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 0.98rem;
  font-weight: 500;
  font-family: inherit;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background 0.18s ease;
}

.login__submit:hover {
  background: #2563eb;
}

.login__hint {
  margin: 1.4rem 0 0;
  text-align: center;
  color: var(--muted);
  font-size: 0.78rem;
}
</style>
