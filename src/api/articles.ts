import { http } from './http'
import type { SearchTag } from './search'

/** 列表里的一篇文章（GET /v1/articles 的 data 项，默认不带正文之外的详情字段） */
export interface ArticleListItem {
  article_id: string
  source: string
  url: string
  title: string
  published_at: string | null
  published_at_utc: string | null
  content_length: number
  category: string | null
  category_confidence: number | null
  category_engine: string | null
  tag_engine: string | null
  extract_engine: string | null
  analyzed_at: string
  body: string | null
  tags: SearchTag[]
}

export interface ArticleListPage {
  items: ArticleListItem[]
  total: number
  limit: number
  offset: number
}

interface ApiEnvelope<T> {
  data: T
  meta?: { total?: number; limit?: number; offset?: number }
}

export interface ArticleListOptions {
  /** 大类 id，后端不接受未知值（返回空集） */
  category?: string
  /** 二级标签 id */
  tag?: string
  limit?: number
  offset?: number
}

/** GET /v1/articles —— 分页列出已分析文章，可按大类 / 标签过滤 */
export async function listArticles(options: ArticleListOptions = {}): Promise<ArticleListPage> {
  const params = new URLSearchParams()
  if (options.category) params.set('category', options.category)
  if (options.tag) params.set('tag', options.tag)
  params.set('limit', String(options.limit ?? 20))
  params.set('offset', String(options.offset ?? 0))

  const res = await http.get<ApiEnvelope<ArticleListItem[]>>(`/v1/articles?${params.toString()}`)
  return {
    items: res.data,
    total: res.meta?.total ?? res.data.length,
    limit: res.meta?.limit ?? options.limit ?? 20,
    offset: res.meta?.offset ?? options.offset ?? 0,
  }
}
