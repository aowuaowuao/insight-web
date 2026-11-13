<script setup lang="ts">
/**
 * 通用按钮组件：演示 props / emits / defineProps 类型化写法。
 */
interface Props {
  /** 按钮文字 */
  label: string
  /** 视觉样式 */
  variant?: 'primary' | 'secondary' | 'danger'
  /** 是否禁用 */
  disabled?: boolean
  /** 是否显示加载中 */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  disabled: false,
  loading: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function handleClick(event: MouseEvent): void {
  if (props.disabled || props.loading) return
  emit('click', event)
}
</script>

<template>
  <button
    :class="['btn', `btn--${variant}`]"
    :disabled="disabled || loading"
    type="button"
    @click="handleClick"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    {{ loading ? '处理中…' : label }}
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.5em 1.1em;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--primary {
  background: #3b82f6;
  color: #fff;
}
.btn--primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn--secondary {
  background: transparent;
  border-color: #cbd5e1;
  color: inherit;
}
.btn--secondary:hover:not(:disabled) {
  border-color: #94a3b8;
  background: rgba(148, 163, 184, 0.12);
}

.btn--danger {
  background: #ef4444;
  color: #fff;
}
.btn--danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn__spinner {
  width: 0.85em;
  height: 0.85em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
