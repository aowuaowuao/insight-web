import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 组合式函数示例：把「窗口宽度」这种复用逻辑抽出来。
 * 这就是 Vue3 替代 mixin 的正确姿势——来源清晰、无命名冲突。
 */
export function useWindowSize() {
  const width = ref<number>(window.innerWidth)
  const height = ref<number>(window.innerHeight)

  function update(): void {
    width.value = window.innerWidth
    height.value = window.innerHeight
  }

  onMounted(() => window.addEventListener('resize', update, { passive: true }))
  onBeforeUnmount(() => window.removeEventListener('resize', update))

  return { width, height }
}
