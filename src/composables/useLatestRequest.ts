import { ref } from 'vue'

/**
 * 请求序号守卫：同一处连续发起的异步请求只接受最后一次的结果。
 *
 * 没有守卫时「先发出、后返回」的旧响应会盖掉新数据，表现为
 * 搜索结果属于上一个关键词、详情页标题属 A 而正文属 B。
 *
 * 用法：
 *   const latest = useLatestRequest()
 *   const requestId = latest.next()
 *   const page = await listArticles(...)
 *   if (!latest.isCurrent(requestId)) return   // 已被更新的请求取代
 *   ...写状态
 *   finally { if (latest.isCurrent(requestId)) loading.value = false }
 */
export function useLatestRequest() {
  const current = ref(0)

  /** 取一个新的请求序号，同时作废此前所有在途请求 */
  function next(): number {
    current.value += 1
    return current.value
  }

  /** 该序号是否仍是最新的一次请求；false 表示结果应当丢弃 */
  function isCurrent(requestId: number): boolean {
    return requestId === current.value
  }

  return { next, isCurrent }
}
