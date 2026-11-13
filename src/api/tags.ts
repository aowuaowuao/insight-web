import { http } from './http'

/**
 * 标签词表（闭集）。
 * 后端只在文章上返回标签 id（如 policy_release），中文名要查词表；
 * 详情页、检索页都用它把 id 渲染成可读名称。
 */
export interface TagDef {
  id: string
  name: string
  group: string
  keywords: string[]
  article_count: number
}

interface TagsResponse {
  data: TagDef[]
  meta?: { total?: number; vocab_version?: number }
}

let cache: TagDef[] | null = null

/** 清空词表缓存。词表在运行期不变，仅测试需要重置。 */
export function resetTagCache(): void {
  cache = null
}

export async function listTags(): Promise<TagDef[]> {
  if (cache) return cache
  const res = await http.get<TagsResponse>('/v1/tags')
  const list = res.data ?? []
  cache = list
  return list
}

/** 词表里查不到时退回 id 本身，不要让界面出现空白标签 */
export function tagName(tags: TagDef[], id: string): string {
  return tags.find((item) => item.id === id)?.name ?? id
}
