import { http } from './http'
import type { AuthUser } from './auth'

export type AdminUser = AuthUser

/** 站点配置由 news-crawler 的 sources.local.json 管理，name 是主键（无数字 id） */
export interface AdminSite {
  name: string
  list_url: string
  category: string
  region: string
  timezone: string
  render: boolean
  enabled: boolean
  item_xpath: string
  title_xpath: string
  url_xpath: string
  date_xpath: string
  has_api: boolean
}

export interface AdminStats {
  days: number
  range_start: string
  totals: {
    articles: number
    sources: number
    users: number
    active_users: number
  }
  daily: { day: string; count: number }[]
  categories: { category: string; count: number }[]
  jobs: Record<string, number>
  success_rate: number
}

export interface OperationLog {
  id: number
  user_id: number | null
  username: string
  action: string
  target: string
  detail: string
  ip: string
  created_at: string
}

export interface PageMeta {
  total: number
  returned: number
  limit: number
  offset: number
}

export async function listAdminUsers(params: {
  q?: string
  role?: string
  status?: string
  limit?: number
  offset?: number
}): Promise<{ items: AdminUser[]; total: number }> {
  const payload = await http.get<{ data: AdminUser[]; meta: PageMeta }>('/v1/admin/users', {
    params,
  })
  return { items: payload.data, total: payload.meta.total }
}

export interface AdminUserCreate {
  username: string
  display_name?: string
  department?: string
  role?: 'admin' | 'user'
  password?: string
  must_change_password?: boolean
}

export async function createAdminUser(
  input: AdminUserCreate,
): Promise<AdminUser & { temporary_password?: string }> {
  return http
    .post<{ data: AdminUser & { temporary_password?: string } }>('/v1/admin/users', input, {
      retries: 0,
    })
    .then((p) => p.data)
}

export interface AdminUserPatch {
  display_name?: string
  department?: string
  role?: 'admin' | 'user'
  status?: 'active' | 'disabled'
}

export async function updateAdminUser(userId: number, patch: AdminUserPatch): Promise<AdminUser> {
  return http.patch<{ data: AdminUser }>(`/v1/admin/users/${userId}`, patch).then((p) => p.data)
}

export async function resetAdminPassword(userId: number): Promise<string> {
  const payload = await http.post<{ data: { user_id: number; temporary_password: string } }>(
    `/v1/admin/users/${userId}/reset-password`,
    undefined,
    { retries: 0 },
  )
  return payload.data.temporary_password
}

export async function listAdminSites(): Promise<AdminSite[]> {
  return http.get<{ data: AdminSite[] }>('/v1/admin/sites').then((p) => p.data)
}

export interface AdminSiteInput {
  name: string
  list_url: string
  category?: string
  region?: string
  timezone?: string
  render?: boolean
  enabled?: boolean
  item_xpath?: string
  title_xpath?: string
  url_xpath?: string
  date_xpath?: string
}

export async function createAdminSite(input: AdminSiteInput): Promise<AdminSite> {
  return http
    .post<{ data: AdminSite }>('/v1/admin/sites', input, { retries: 0 })
    .then((p) => p.data)
}

export async function updateAdminSite(
  siteName: string,
  patch: Partial<AdminSiteInput>,
): Promise<AdminSite> {
  return http
    .patch<{ data: AdminSite }>(`/v1/admin/sites/${encodeURIComponent(siteName)}`, patch)
    .then((p) => p.data)
}

export async function deleteAdminSite(siteName: string): Promise<void> {
  await http.delete<void>(`/v1/admin/sites/${encodeURIComponent(siteName)}`, { retries: 0 })
}

export async function getAdminStats(days = 7): Promise<AdminStats> {
  return http.get<{ data: AdminStats }>('/v1/admin/stats', { params: { days } }).then((p) => p.data)
}

export async function listOperationLogs(params: {
  action?: string
  username?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}): Promise<{ items: OperationLog[]; total: number }> {
  const payload = await http.get<{ data: OperationLog[]; meta: PageMeta }>(
    '/v1/admin/operation-logs',
    { params },
  )
  return { items: payload.data, total: payload.meta.total }
}
