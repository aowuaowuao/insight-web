/**
 * 站内消息提醒接口。
 *
 * 后端当前只推「新分析出的项目申报类公告」，一条通知对应一篇文章；铃铛角标用
 * meta.unread，下拉列表用 data。这里不做本地持久化——通知状态由后端唯一维护，
 * 浏览器多开也不会出现两个红点数字打架。
 */
import { http } from './http'

export interface NotificationItem {
  id: number
  article_id: string
  kind: string
  title: string
  message: string
  created_at: string
  read_at: string | null
  read: boolean
  url: string | null
  source: string | null
  category: string | null
  published_at: string | null
}

interface NotificationResponse {
  data: NotificationItem[]
  meta: { total: number; unread: number; returned: number; limit: number }
}

export interface NotificationPage {
  items: NotificationItem[]
  total: number
  unread: number
}

/** 轮询接口：失败不重试，避免后端不可用时每 60 秒叠三次退避请求。 */
export async function listNotifications(limit = 10): Promise<NotificationPage> {
  const res = await http.get<NotificationResponse>('/v1/notifications', {
    params: { limit },
    retries: 0,
    trackLoading: false,
  })
  return { items: res.data, total: res.meta.total, unread: res.meta.unread }
}

export async function markNotificationRead(id: number): Promise<NotificationItem> {
  const res = await http.post<{ data: NotificationItem }>(`/v1/notifications/${id}/read`)
  return res.data
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await http.post<{ data: { updated: number; unread: number } }>(
    '/v1/notifications/read-all',
  )
  return res.data.updated
}
