<script setup lang="ts">
/**
 * 顶部导航：三个分页 + 右上角当前登录账户
 */
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const { username } = storeToRefs(auth)

const links = [
  { to: '/', label: '首页' },
  { to: '/category', label: '分类浏览' },
  { to: '/search', label: '信息检索' },
] as const

function handleLogout(): void {
  auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <header class="nav">
    <RouterLink to="/" class="nav__brand">
      <span class="nav__logo" aria-hidden="true">🐟</span>
      <span>Insight Web</span>
    </RouterLink>

    <nav class="nav__links" aria-label="主导航">
      <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav__link">
        {{ link.label }}
      </RouterLink>
    </nav>

    <div class="nav__user">
      <span class="nav__avatar" aria-hidden="true">{{ username.charAt(0).toUpperCase() }}</span>
      <span class="nav__name">{{ username }}</span>
      <button class="nav__logout" type="button" @click="handleLogout">退出</button>
    </div>
  </header>
</template>

<style scoped>
.nav {
  display: flex;
  align-items: center;
  gap: 2.5rem;
  padding: 0 1.8rem;
  height: 64px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: 0.02em;
  text-decoration: none;
  color: inherit;
}

.nav__logo {
  font-size: 1.25rem;
  line-height: 1;
}

.nav__links {
  display: flex;
  gap: 0.4rem;
  flex: 1;
}

.nav__link {
  position: relative;
  padding: 0.5rem 0.9rem;
  border-radius: 8px;
  text-decoration: none;
  color: var(--muted);
  font-size: 0.94rem;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.nav__link:hover {
  color: var(--fg);
  background: rgba(148, 163, 184, 0.12);
}

.nav__link.router-link-exact-active {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  font-weight: 600;
}

.nav__user {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.88rem;
}

.nav__avatar {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  font-size: 0.78rem;
  font-weight: 700;
}

.nav__name {
  color: var(--fg);
  font-weight: 600;
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav__logout {
  padding: 0.3em 0.75em;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.18s ease;
}

.nav__logout:hover {
  border-color: #ef4444;
  color: #ef4444;
}
</style>
