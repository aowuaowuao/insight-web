<!--
  列表骨架屏。
  规范 2.2.1（二）模块三（7）：数据加载过程中显示骨架屏占位，避免白屏闪烁。
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 占位条数 */
    rows?: number
    /** 卡片右上角是否显示一个短条的“评分”占位 */
    withBadge?: boolean
  }>(),
  { rows: 5, withBadge: true },
)
</script>

<template>
  <ul class="skeleton" aria-hidden="true">
    <li v-for="n in rows" :key="n" class="skeleton__item">
      <div class="skeleton__meta">
        <span class="skeleton__bar skeleton__bar--tag" />
        <span class="skeleton__bar skeleton__bar--short" />
        <span v-if="withBadge" class="skeleton__bar skeleton__bar--badge" />
      </div>
      <span class="skeleton__bar skeleton__bar--title" />
      <span class="skeleton__bar skeleton__bar--line" />
    </li>
  </ul>
</template>

<style scoped>
.skeleton {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}

.skeleton__item {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.skeleton__meta {
  display: flex;
  gap: var(--space-2);
}

.skeleton__bar {
  display: block;
  height: var(--space-3);
  border-radius: var(--radius-base);
  background: linear-gradient(
    90deg,
    var(--color-split) 25%,
    var(--color-bg-hover) 37%,
    var(--color-split) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

.skeleton__bar--tag {
  width: 64px;
}

.skeleton__bar--short {
  width: 96px;
}

.skeleton__bar--badge {
  width: 56px;
  margin-left: auto;
}

.skeleton__bar--title {
  height: var(--space-4);
  width: 85%;
}

.skeleton__bar--line {
  width: 60%;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0 50%;
  }
}
</style>
