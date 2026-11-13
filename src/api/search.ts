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

/** 类内排序键；后端只接受这三个值，前端不要自己再排序 */
export type SearchSort = 'relevance' | 'published_desc' | 'published_asc'

export interface SearchPayload {
  query: string
  matched_tags: string[]
  terms: string[]
  total: number
  groups: SearchGroup[]
  /** 每类封顶后实际返回的条目总数，与 total 不同 */
  returned?: number
  truncated?: boolean
  sort?: SearchSort
}

interface ApiEnvelope<T> {
  data: T
}

export interface SearchOptions {
  /** 只在这些大类里检索 */
  categories?: string[]
  /** 只在这些来源（站点）里检索 */
  sources?: string[]
  /** 发布日期下限 YYYY-MM-DD（含当天） */
  publishedFrom?: string
  /** 发布日期上限 YYYY-MM-DD（含当天） */
  publishedTo?: string
  /** 类内排序，默认 relevance（后端按 0.7 标签 + 0.2 标题 + 0.1 正文算） */
  sort?: SearchSort
  /** 每个大类返回多少条（后端上限 100） */
  perCategory?: number
  /** 是否返回正文（默认 false，省带宽） */
  includeBody?: boolean
}

/**
 * GET /v1/search
 *
 * 注意：后端排序已经是最终顺序，前端**不要再排序**，直接按 groups[].items[] 顺序渲染。
 *
 * 时间与来源过滤同样在后端做，前端只传参数。两处口径必须记住，否则界面会看起来
 * 「筛错了」：
 * - **日期过滤按卡片上显示的那一天**（站点墙钟 published_at 的日期），与 published_at
 *   展示的日期严格一致。后端不是按 UTC 真实时刻筛的：生产库 29% 的条目两者不同日，
 *   筛 11-01 却返回卡片写着 11-03 的条目，用户会以为筛错了。
 * - 排序按真实时刻 published_at_utc（混时区站点才不会被墙钟排错）。
 */
export async function searchArticles(
  q: string,
  options: SearchOptions = {},
): Promise<SearchPayload> {
  const qs = new URLSearchParams()
  qs.set('q', q)
  qs.set('per_category', String(options.perCategory ?? 100))
  qs.set('include_body', String(options.includeBody ?? false))
  if (options.sort) qs.set('sort', options.sort)
  if (options.publishedFrom) qs.set('published_from', options.publishedFrom)
  if (options.publishedTo) qs.set('published_to', options.publishedTo)
  for (const category of options.categories ?? []) {
    qs.append('category', category)
  }
  for (const source of options.sources ?? []) {
    qs.append('source', source)
  }

  const res = await http.get<ApiEnvelope<SearchPayload>>(`/v1/search?${qs.toString()}`)
  return res.data
}
