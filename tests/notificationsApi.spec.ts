/** 单元测试：src/api/notifications.ts 的请求形状与返回值解包。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from '@/api/http'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/api/notifications'

const ITEM: NotificationItem = {
  id: 3,
  article_id: 'art-3',
  kind: 'project_application',
  title: '新增项目申报公告',
  message: '关于组织申报的通知',
  created_at: '2026-11-14T03:00:00Z',
  read_at: null,
  read: false,
  url: 'https://example.com/a.html',
  source: 'ctp_kjb',
  category: 'project_application',
  published_at: '2026-11-14 10:00:00',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('listNotifications', () => {
  it('解包 data 与 meta，轮询不重试也不触发全局 loading', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [ITEM],
      meta: { total: 5, unread: 2, returned: 1, limit: 10 },
    })
    await expect(listNotifications(10)).resolves.toEqual({ items: [ITEM], total: 5, unread: 2 })
    expect(spy).toHaveBeenCalledWith('/v1/notifications', {
      params: { limit: 10 },
      retries: 0,
      trackLoading: false,
    })
  })
})

describe('markNotificationRead', () => {
  it('POST 单条已读并返回更新后的通知', async () => {
    const spy = vi.spyOn(http, 'post').mockResolvedValue({ data: { ...ITEM, read: true } })
    await expect(markNotificationRead(3)).resolves.toMatchObject({ id: 3, read: true })
    expect(spy).toHaveBeenCalledWith('/v1/notifications/3/read')
  })
})

describe('markAllNotificationsRead', () => {
  it('返回本次实际更新的条数', async () => {
    const spy = vi.spyOn(http, 'post').mockResolvedValue({ data: { updated: 4, unread: 0 } })
    await expect(markAllNotificationsRead()).resolves.toBe(4)
    expect(spy).toHaveBeenCalledWith('/v1/notifications/read-all')
  })
})
