<!--
  空状态。
  规范 2.2.1（二）模块三（6）：筛选结果为空时展示友好的空状态插画与提示文案。
  插画用内联 SVG（不引入图片资源，也不增加请求），颜色跟随令牌。
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    /** 插画变体：no-data 无数据 / no-result 搜索无结果 / error 加载失败 */
    variant?: 'no-data' | 'no-result' | 'error'
  }>(),
  {
    title: '暂无数据',
    description: '试试调整筛选条件，或稍后再来看看。',
    variant: 'no-data',
  },
)
</script>

<template>
  <div class="empty" :class="`empty--${variant}`">
    <svg class="empty__art" viewBox="0 0 160 120" role="img" aria-hidden="true">
      <ellipse cx="80" cy="104" rx="52" ry="8" fill="var(--color-split)" />
      <rect
        x="34"
        y="26"
        width="92"
        height="66"
        rx="6"
        fill="var(--color-bg)"
        stroke="var(--color-border)"
        stroke-width="2"
      />
      <rect x="46" y="42" width="52" height="5" rx="2.5" fill="var(--color-border)" />
      <rect x="46" y="56" width="68" height="5" rx="2.5" fill="var(--color-split)" />
      <rect x="46" y="70" width="40" height="5" rx="2.5" fill="var(--color-split)" />
      <circle cx="112" cy="76" r="18" fill="var(--color-primary-bg)" />
      <circle cx="112" cy="76" r="10" fill="none" stroke="var(--color-primary)" stroke-width="3" />
      <line
        x1="119"
        y1="83"
        x2="128"
        y2="92"
        stroke="var(--color-primary)"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>

    <p class="empty__title">{{ title }}</p>
    <p v-if="description" class="empty__desc">{{ description }}</p>
    <slot name="action" />
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-10) var(--space-4);
  text-align: center;
}

.empty__art {
  width: 160px;
  height: 120px;
}

.empty__title {
  margin: 0;
  font-size: var(--font-size-h3);
  color: var(--color-text-secondary);
}

.empty__desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.empty--error .empty__title {
  color: var(--color-error);
}
</style>
