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
  /** 受控行业 id（app/vocab/industries.json），历史未分类行为空串 */
  industry: string | null
  industry_confidence: number | null
  industry_engine: string | null
  tag_engine: string | null
  extract_engine: string | null
  analyzed_at: string
  body: string | null
  /** 列表的标签没有 evidence 字段，与 /v1/search 的 SearchTag 不是同一个形状 */
  tags: ListTag[]
}

/** 列表排序键；后端只接受这四个值 */
export type ArticleSort = 'published_desc' | 'published_asc' | 'confidence_desc' | 'confidence_asc'

export interface ArticleListPage {
  items: ArticleListItem[]
  total: number
  limit: number
  offset: number
  sort: ArticleSort
  /** 两个时间列都为空、无法判断是否落在时间区间内的行数（被排除） */
  undatedExcluded: number
}

/** 后端这个端点的 meta 恒存在（app/main.py 显式返回），不做可选兜底以免掩盖契约漂移 */
interface ArticleListEnvelope {
  data: ArticleListItem[]
  meta: {
    total: number
    limit: number
    offset: number
    sort: ArticleSort
    undated_excluded: number
  }
}

export interface ArticleListOptions {
  /** 大类 id，后端不接受未知值（返回空集） */
  category?: string
  /** 二级标签 id */
  tag?: string
  /** 只在这些来源（站点）里筛选 */
  sources?: string[]
  /** 只在这个受控行业里筛选（后端 /v1/articles 为单值参数） */
  industry?: string
  /** 发布日期下限 YYYY-MM-DD（含当天） */
  publishedFrom?: string
  /** 发布日期上限 YYYY-MM-DD（含当天） */
  publishedTo?: string
  /** 排序键，默认 published_desc */
  sort?: ArticleSort
  limit?: number
  offset?: number
}

/** GET /v1/articles —— 分页列出已分析文章，可按大类 / 标签 / 来源 / 时间过滤并排序 */
export async function listArticles(options: ArticleListOptions = {}): Promise<ArticleListPage> {
  const params = new URLSearchParams()
  if (options.category) params.set('category', options.category)
  if (options.tag) params.set('tag', options.tag)
  if (options.sort) params.set('sort', options.sort)
  if (options.publishedFrom) params.set('published_from', options.publishedFrom)
  if (options.publishedTo) params.set('published_to', options.publishedTo)
  for (const source of options.sources ?? []) params.append('source', source)
  if (options.industry) params.set('industry', options.industry)
  params.set('limit', String(options.limit ?? 20))
  params.set('offset', String(options.offset ?? 0))

  const res = await http.get<ArticleListEnvelope>(`/v1/articles?${params.toString()}`)
  return {
    items: res.data,
    total: res.meta.total,
    limit: res.meta.limit,
    offset: res.meta.offset,
    sort: res.meta.sort,
    undatedExcluded: res.meta.undated_excluded,
  }
}
