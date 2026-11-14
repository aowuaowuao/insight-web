import { http } from './http'

export interface FavoriteItem {
  article_id: string
  favorited_at: string
  title: string
  source: string
  url: string
  published_at: string | null
  published_at_utc: string | null
  category: string | null
  category_confidence: number | null
  content_length: number | null
}

export interface HistoryItem {
  article_id: string
  viewed_at: string
  title: string
  source: string
  url: string
  published_at: string | null
  published_at_utc: string | null
  category: string | null
  category_confidence: number | null
  content_length: number | null
}

export interface PageMeta {
  total: number
  returned: number
  limit: number
  offset: number
}

export interface ListResult<T> {
  items: T[]
  total: number
}

export interface Preferences {
  industries: string[]
  push_enabled: boolean
  digest_time: string
  updated_at?: string
}

export async function listFavorites(limit = 50, offset = 0): Promise<ListResult<FavoriteItem>> {
  const payload = await http.get<{ data: FavoriteItem[]; meta: PageMeta }>('/v1/me/favorites', {
    params: { limit, offset },
  })
  return { items: payload.data, total: payload.meta.total }
}

export async function addFavorite(articleId: string): Promise<void> {
  await http.post<void>('/v1/me/favorites', { article_id: articleId }, { retries: 0 })
}

export async function removeFavorite(articleId: string): Promise<void> {
  await http.delete<void>(`/v1/me/favorites/${encodeURIComponent(articleId)}`, { retries: 0 })
}

export async function listHistory(limit = 50, offset = 0): Promise<ListResult<HistoryItem>> {
  const payload = await http.get<{ data: HistoryItem[]; meta: PageMeta }>('/v1/me/history', {
    params: { limit, offset },
  })
  return { items: payload.data, total: payload.meta.total }
}

export async function recordHistory(articleId: string): Promise<void> {
  await http.post<void>(
    '/v1/me/history',
    { article_id: articleId },
    { retries: 0, trackLoading: false },
  )
}

export async function clearHistory(): Promise<void> {
  await http.delete<void>('/v1/me/history', { retries: 0 })
}

export async function getPreferences(): Promise<Preferences> {
  return http.get<{ data: Preferences }>('/v1/me/preferences').then((payload) => payload.data)
}

export async function savePreferences(input: Preferences): Promise<Preferences> {
  const body = {
    industries: input.industries,
    push_enabled: input.push_enabled,
    digest_time: input.digest_time,
  }
  return http.put<{ data: Preferences }>('/v1/me/preferences', body).then((payload) => payload.data)
}
