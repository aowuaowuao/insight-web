import { http } from './http'

/**
 * 受控行业词表与各行业文章计数。
 * 后端 GET /v1/industries 的定义来自 app/vocab/industries.json（10 个行业，含 other 兜底），
 * 前端不写死行业清单——词表调整后界面自动跟上。
 */
export interface IndustryStat {
  id: string
  name: string
  description: string
  keywords: string[]
  article_count: number
}

interface IndustriesResponse {
  data: IndustryStat[]
  meta?: { total?: number; vocab_version?: number }
}

let cache: IndustryStat[] | null = null
let inflight: Promise<IndustryStat[]> | null = null

/** 行业列表；并发调用共用同一个在飞请求，force 用于刷新计数 */
export async function listIndustries(force = false): Promise<IndustryStat[]> {
  if (force) {
    cache = null
    inflight = null
  }
  if (cache) return cache
  if (inflight) return inflight
  inflight = http
    .get<IndustriesResponse>('/v1/industries')
    .then((res) => {
      const list = res.data ?? []
      cache = list
      return list
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** 供测试与「刷新数据」使用：清掉模块级缓存 */
export function resetIndustryCache(): void {
  cache = null
  inflight = null
}
