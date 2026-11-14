import { http } from './http'

export interface ArticleTag {
  tag: string
  confidence: number
  evidence: string | null
  engine: string
}

export interface ExtractionField {
  value: unknown
  raw_text: string | null
  confidence: number
  verified: boolean
}

export interface ArticleDetail {
  article_id: string
  source: string
  url: string
  title: string
  published_at: string | null
  published_at_utc: string | null
  content_length: number
  body: string | null
  /** 清洗后的正文 HTML（后端白名单过滤），缺失时前端用 MarkdownIt 渲染纯文本回退 */
  body_html?: string | null
  /** 当前登录用户是否已收藏；未登录时为 false */
  is_favorite?: boolean
  category: string | null
  category_confidence: number | null
  category_engine: string | null
  tag_engine: string | null
  extract_engine: string | null
  analyzed_at: string
  tags: ArticleTag[]
  extractions: Record<string, Record<string, ExtractionField>>
}

export interface ChecklistItem {
  text: string
  basis: 'excerpt' | 'suggested'
  source_text?: string
  verified: boolean
}

export interface ArticleChecklist {
  article_id: string
  title: string
  url: string
  engine: string
  generated_at: string
  items: ChecklistItem[]
}

interface ApiEnvelope<T> {
  data: T
}

/** GET /v1/articles/{article_id} —— 单篇详情：标签 + 抽取结果 */
export async function getArticle(articleId: string): Promise<ArticleDetail> {
  const res = await http.get<ApiEnvelope<ArticleDetail>>(
    `/v1/articles/${encodeURIComponent(articleId)}`,
  )
  return res.data
}

/**
 * GET /v1/articles/{article_id}/checklist —— 申报准备清单
 * 没有清单时后端返回 404（错误码 checklist_not_found），这里转成 null，不当作错误。
 */
export async function getChecklist(articleId: string): Promise<ArticleChecklist | null> {
  try {
    const res = await http.get<ApiEnvelope<ArticleChecklist>>(
      `/v1/articles/${encodeURIComponent(articleId)}/checklist`,
    )
    return res.data
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error) {
      if ((error as { status: number }).status === 404) return null
    }
    throw error
  }
}

/**
 * POST /v1/articles/{article_id}/checklist —— 按需生成申报准备清单
 * force=false 时后端复用已有清单（幂等）；force=true 才重新生成。
 */
export async function generateChecklist(
  articleId: string,
  force = false,
): Promise<ArticleChecklist> {
  const res = await http.post<ApiEnvelope<ArticleChecklist>>(
    `/v1/articles/${encodeURIComponent(articleId)}/checklist`,
    { force },
  )
  return res.data
}
