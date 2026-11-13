import { readonly, ref } from 'vue'

/**
 * 异步请求的通用封装：管理 loading / error / data 三态。
 * 用法：
 *   const { data, loading, error, execute } = useAsync(() => fishApi.list())
 *   onMounted(execute)
 */
export function useAsync<T>(fn: () => Promise<T>) {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function execute(): Promise<T | null> {
    loading.value = true
    error.value = null
    try {
      const result = await fn()
      data.value = result
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '未知错误'
      return null
    } finally {
      loading.value = false
    }
  }

  return { data: readonly(data), loading: readonly(loading), error: readonly(error), execute }
}
