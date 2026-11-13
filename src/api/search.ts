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

/** 一条命中的标签（/v1/search 的形状：一定带 evidence 与 engine） */
export interface SearchTag {
  tag: string
  confidence: number
  /** 命中依据：原文片段；后端允许为 null */
  evidence: string | null
  engine: string
}

/**
 * /v1/articles 列表里的标签：字段比 /v1/search 少一个 evidence
 * （列表不返回原文依据，省带宽）。两个端点的形状不同，不能共用一个类型。
 */
export interface ListTag {
  tag: string
  confidence: number
  engine: string
}

export interface SearchItem {
  article_id: string
  /** 来源标识，如 most_kjjh / shpolicy_ssme */
  source: string
  /** 原文链接 */
  url: string
  title: string
  published_at: string | null
  published_at_utc: string | null
  content_length: number
  category: string | null
  category_confidence: number | null
  /** 后端返回的是对象数组，不是字符串数组（要标签名用 tags.map((t) => t.tag)） */
  tags: SearchTag[]
  relevance: SearchRelevance
  /** include_body=true 时才有 */
  body?: string
}

export interface SearchGroup {
  category: string
  /** 该大类在候选库里的命中总数，不是 items 的长度（items 被 per_category 截断） */
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
