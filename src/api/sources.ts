import { http } from './http'

/**
 * 新闻来源（站点）统计。
 * 后端 GET /v1/sources 直接给「已分析文章里出现过的 source 及其统计」，
 * 不再维护一份前端静态站点清单——站点是爬虫配置出来的，前端写死必然漂移。
 */
export interface SourceStat {
  source: string
  count: number
  /** 该来源下已分析文章的平均分类置信度（0-1），没有数据时为 null */
  avg_confidence: number | null
  /** 该来源最新一篇的真实发布时间（UTC ISO8601），没有数据时为 null */
  latest_published_at: string | null
}

interface SourcesResponse {
  data: SourceStat[]
}

let cache: SourceStat[] | null = null
let inflight: Promise<SourceStat[]> | null = null

/**
 * 来源列表。
 *
 * 缓存策略与 tags 不同：点了「刷新数据」必须能拿到新来源，所以对外暴露
 * `force` 而不是永不失效的模块级缓存；并发的多个调用共用同一个在飞请求，
 * 避免同一屏里发两次。
 */
export async function listSources(force = false): Promise<SourceStat[]> {
  if (force) {
    cache = null
    inflight = null
  }
  if (cache) return cache
  if (inflight) return inflight
  inflight = http
    .get<SourcesResponse>('/v1/sources')
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
export function resetSourceCache(): void {
  cache = null
  inflight = null
}
