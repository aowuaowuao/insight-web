import { http } from './http'

/** 单条检索结果的相关度明细（后端算好，前端只展示） */
export interface SearchRelevance {
  score: number
  tag_confidence: number
  title_hits: number
  body_hits: number
  matched_tags: string[]
  matched_terms: string[]
}

export interface SearchItem {
  article_id: string
  /** 来源标识，如 prov-sci-tech */
  source: string
  /** 原文链接 */
  url: string
  title: string
  published_at: string | null
  published_at_utc: string | null
  content_length: number
  category: string | null
  category_confidence: number | null
  tags: string[]
  relevance: SearchRelevance
  /** include_body=true 时才有 */
  body?: string
}

export interface SearchGroup {
  category: string
  count: number
  items: SearchItem[]
}

export interface SearchPayload {
  query: string
  matched_tags: string[]
  terms: string[]
  total: number
  groups: SearchGroup[]
}

interface ApiEnvelope<T> {
  data: T
}

export interface SearchOptions {
  /** 只在这些大类里检索 */
  categories?: string[]
  /** 每个大类返回多少条（后端上限 100） */
  perCategory?: number
  /** 是否返回正文（默认 false，省带宽） */
  includeBody?: boolean
}

/**
 * GET /v1/search
 *
 * 注意：后端排序已经是最终顺序（score = 0.7 标签 + 0.2 标题 + 0.1 正文），
 * 前端**不要再排序**，直接按 groups[].items[] 顺序渲染。
 */
export async function searchArticles(
  q: string,
  options: SearchOptions = {},
): Promise<SearchPayload> {
  const qs = new URLSearchParams()
  qs.set('q', q)
  qs.set('per_category', String(options.perCategory ?? 100))
  qs.set('include_body', String(options.includeBody ?? false))
  for (const category of options.categories ?? []) {
    qs.append('category', category)
  }

  const res = await http.get<ApiEnvelope<SearchPayload>>(`/v1/search?${qs.toString()}`)
  return res.data
}
