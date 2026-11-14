import { http } from './http'
import type { ArticleListItem } from './articles'

/** GET /v1/recommendations 的 data 项：文章列表字段 + 后端相关度打分 */
export interface RecommendationItem extends ArticleListItem {
  relevance: number
  relevance_reason: string
}

export interface RecommendationPage {
  items: RecommendationItem[]
  personalized: boolean
}

export async function listRecommendations(limit = 10): Promise<RecommendationPage> {
  const payload = await http.get<{
    data: RecommendationItem[]
    meta: { total: number; limit: number; personalized: boolean }
  }>('/v1/recommendations', { params: { limit } })
  return { items: payload.data, personalized: payload.meta.personalized }
}

/** 首页待办：项目申报公告中尚未到期的截止日期 */
export interface TodoItem {
  article_id: string
  title: string
  source: string
  url: string
  published_at: string | null
  category: string | null
  category_confidence: number | null
  deadline: string
  deadline_raw: string | null
  days_left: number
}

export async function listTodos(limit = 5): Promise<TodoItem[]> {
  const payload = await http.get<{ data: TodoItem[] }>('/v1/todos', { params: { limit } })
  return payload.data
}
