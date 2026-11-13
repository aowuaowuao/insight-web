import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 全局计数器：演示最简单的状态共享 */
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)

  function increment(step = 1): void {
    count.value += step
  }

  function reset(): void {
    count.value = 0
  }

  return { count, increment, reset }
})
