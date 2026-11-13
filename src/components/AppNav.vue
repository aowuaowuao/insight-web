<script setup lang="ts">
/**
 * 顶部导航：三个分页 —— 首页 / 分类浏览 / 信息检索
 */
import { RouterLink } from 'vue-router'

const links = [
  { to: '/', label: '首页' },
  { to: '/category', label: '分类浏览' },
  { to: '/search', label: '信息检索' },
] as const
</script>

<template>
  <header class="nav">
    <RouterLink to="/" class="nav__brand">
      <span class="nav__logo" aria-hidden="true">🐟</span>
      <span>大肥鱼</span>
    </RouterLink>

    <nav class="nav__links" aria-label="主导航">
      <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav__link">
        {{ link.label }}
      </RouterLink>
    </nav>
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
</style>
