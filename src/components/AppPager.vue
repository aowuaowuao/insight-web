<!--
  分页控件。
  规范 2.2.1（二）模块三（4）：后端分页，支持切换每页条数（10/20/50）。
  页码按钮最多显示当前页附近 5 个，避免页数多时把界面撑爆。
-->
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    page: number
    totalPages: number
    /** 每页条数；不传则不显示切换器 */
    pageSize?: number
    /** 可选的每页条数档位 */
    pageSizeOptions?: readonly number[]
    /** 总条数，用于右侧“共 N 条” */
    total?: number
  }>(),
  {
    pageSize: undefined,
    pageSizeOptions: () => [10, 20, 50],
    total: undefined,
  },
)

const emit = defineEmits<{
  (e: 'update:page', value: number): void
  (e: 'update:pageSize', value: number): void
}>()

const numbers = computed<number[]>(() => {
  const total = props.totalPages
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.min(Math.max(1, props.page - 2), total - 4)
  return Array.from({ length: 5 }, (_, i) => start + i)
})

function go(target: number): void {
  if (target < 1 || target > props.totalPages || target === props.page) return
  emit('update:page', target)
}

function changeSize(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(value) && value > 0) emit('update:pageSize', value)
}
</script>

<template>
  <nav v-if="totalPages > 1 || pageSize" class="pager" aria-label="分页">
    <button class="pager__btn" type="button" :disabled="page === 1" @click="go(page - 1)">
      上一页
    </button>

    <button
      v-for="n in numbers"
      :key="n"
      class="pager__num"
      type="button"
      :aria-current="n === page ? 'page' : undefined"
      @click="go(n)"
    >
      {{ n }}
    </button>

    <button class="pager__btn" type="button" :disabled="page === totalPages" @click="go(page + 1)">
      下一页
    </button>

    <span class="pager__summary">
      第 <strong class="num">{{ page }}</strong> / <span class="num">{{ totalPages }}</span> 页
      <template v-if="total !== undefined">
        · 共 <strong class="num">{{ total }}</strong> 条
      </template>
    </span>

    <label v-if="pageSize" class="pager__size">
      每页
      <select class="pager__select" :value="pageSize" @change="changeSize">
        <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
      </select>
      条
    </label>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-split);
}

.pager__btn,
.pager__num {
  min-width: 34px;
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

.pager__btn:hover:not(:disabled),
.pager__num:hover {
  color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.pager__btn:active:not(:disabled),
.pager__num:active {
  color: var(--color-primary-active);
  border-color: var(--color-primary-active);
}

.pager__btn:disabled {
  color: var(--color-text-disabled);
  border-color: var(--color-split);
  cursor: not-allowed;
}

.pager__num[aria-current='page'] {
  color: var(--color-text-inverse);
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.pager__summary {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.pager__size {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.pager__select {
  padding: 2px var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
}
</style>
