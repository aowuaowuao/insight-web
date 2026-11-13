<script setup lang="ts">
/**
 * 403 无权限页（规范 2.2.1（四）6：无权限路由自动跳转 403 页面）。
 */
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const from = typeof route.query.from === 'string' ? route.query.from : ''
</script>

<template>
  <section class="forbidden">
    <svg class="forbidden__art" viewBox="0 0 160 120" aria-hidden="true">
      <circle cx="80" cy="60" r="34" fill="none" stroke="var(--color-border)" stroke-width="3" />
      <line
        x1="56"
        y1="36"
        x2="104"
        y2="84"
        stroke="var(--color-error)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </svg>
    <h1 class="forbidden__title">403 · 无访问权限</h1>
    <p class="forbidden__desc">
      当前账号没有访问该页面的权限<template v-if="from">（{{ from }}）</template>。
    </p>
    <div class="forbidden__actions">
      <button class="btn" type="button" @click="router.back()">返回上一页</button>
      <RouterLink class="btn btn--primary" to="/">回到首页</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-12) var(--space-4);
  text-align: center;
}

.forbidden__art {
  width: 160px;
  height: 120px;
}

.forbidden__title {
  margin: 0;
  font-size: var(--font-size-h2);
  color: var(--color-text);
}

.forbidden__desc {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-body);
}

.forbidden__actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.btn {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm);
  text-decoration: none;
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    background var(--duration-base) var(--ease-out);
}

.btn:hover {
  color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.btn:active {
  color: var(--color-primary-active);
  border-color: var(--color-primary-active);
}

.btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.btn--primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--color-text-inverse);
}
</style>
