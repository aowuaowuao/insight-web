<!--
  评分徽标（相关度 / 分类置信度通用）。
  规范 2.2.1（二）模块三（3）：0-100 分，颜色分级 绿≥80、黄≥60、红<60。
  分级规则集中在 utils/format.ts 的 scoreLevel，避免各处各写一遍阈值。

  label 让同一个组件既能显示「相关度」（/v1/search 返回），
  也能显示「分类置信度」（/v1/articles 返回），不用复制一份样式。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { scoreLevel, scoreToPercent } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    /** 后端给的 0-1 之间的分数 */
    score: number | null
    /** 是否显示前缀文字 */
    withLabel?: boolean
    /** 前缀文案 */
    label?: string
  }>(),
  { withLabel: true, label: '相关度' },
)

const percent = computed(() => scoreToPercent(props.score))
const level = computed(() => (percent.value === null ? 'none' : scoreLevel(percent.value)))
const levelText = computed(() =>
  percent.value === null ? '' : percent.value >= 80 ? '高' : percent.value >= 60 ? '中' : '低',
)
</script>

<template>
  <span
    v-if="percent !== null"
    class="score"
    :class="`score--${level}`"
    :title="`${label} ${percent} 分（${levelText}）`"
  >
    <span v-if="withLabel" class="score__label">{{ label }}</span>
    <span class="score__value num">{{ percent }}</span>
  </span>
</template>

<style scoped>
.score {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: 1px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  line-height: 1.6;
  white-space: nowrap;
}

.score--high {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.score--medium {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.score--low {
  color: var(--color-error);
  background: var(--color-error-bg);
}

.score__value {
  font-weight: var(--font-weight-bold);
}
</style>
