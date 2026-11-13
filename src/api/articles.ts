import { http } from './http'
import type { ListTag } from './search'

/** 列表里的一篇文章（GET /v1/articles 的 data 项） */
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
  /** 列表的标签没有 evidence 字段，与 /v1/search 的 SearchTag 不是同一个形状 */
  tags: ListTag[]
}

export interface ArticleListPage {
  items: ArticleListItem[]
  total: number
  limit: number
  offset: number
}

/** 后端这个端点的 meta 恒存在（app/main.py 显式返回），不做可选兜底以免掩盖契约漂移 */
interface ArticleListEnvelope {
  data: ArticleListItem[]
  meta: { total: number; limit: number; offset: number }
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

  const res = await http.get<ArticleListEnvelope>(`/v1/articles?${params.toString()}`)
  return { items: res.data, total: res.meta.total, limit: res.meta.limit, offset: res.meta.offset }
}
