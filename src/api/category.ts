import { http } from './http'

/** 一级分类定义（GET /v1/categories 的一项） */
export interface CategoryDef {
  id: string
  name: string
  description: string
  keywords: string[]
  /** 该类允许的二级标签白名单 */
  tags: string[]
  article_count: number
}

/** 分类统计（GET /v1/categories/stats 的一项） */
export interface CategoryStat {
  category: string
  count: number
  avg_confidence: number
}

interface ApiEnvelope<T> {
  data: T
}

/** GET /v1/categories —— 词表里的 6 个大类，含每类文章数 */
export async function listCategories(): Promise<CategoryDef[]> {
  const res = await http.get<ApiEnvelope<CategoryDef[]>>('/v1/categories')
  return res.data
}

/** GET /v1/categories/stats —— 只读聚合：每类篇数与平均置信度 */
export async function categoryStats(): Promise<CategoryStat[]> {
  const res = await http.get<ApiEnvelope<CategoryStat[]>>('/v1/categories/stats')
  return res.data
}
