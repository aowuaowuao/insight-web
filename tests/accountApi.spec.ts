/**
 * 单元测试：src/api/{auth,account,admin}.ts
 *
 * 这三组接口是账号体系上线后新增的数据入口。封装本身很薄，但请求参数一旦错位
 * 就会表现为「登录成功但页面空白」「收藏点不动」「管理端报表为空」这类难查问题，
 * 所以逐个函数断言路径、参数与返回映射。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from '@/api/http'
import {
  changePassword,
  login,
  logout,
  me,
  updateProfile,
  type AuthUser,
  type LoginResponse,
} from '@/api/auth'
import {
  addFavorite,
  clearHistory,
  getPreferences,
  listFavorites,
  listHistory,
  recordHistory,
  removeFavorite,
  savePreferences,
  type FavoriteItem,
  type HistoryItem,
  type Preferences,
} from '@/api/account'
import {
  createAdminSite,
  createAdminUser,
  deleteAdminSite,
  getAdminStats,
  listAdminSites,
  listAdminUsers,
  listOperationLogs,
  resetAdminPassword,
  updateAdminSite,
  updateAdminUser,
  type AdminSite,
  type AdminStats,
  type AdminUser,
  type OperationLog,
} from '@/api/admin'

const USER: AuthUser = {
  id: 1,
  username: 'admin',
  display_name: '管理员',
  department: '信息中心',
  role: 'admin',
  status: 'active',
  must_change_password: false,
  last_login_at: '2026-11-14T05:50:00Z',
  created_at: '2026-11-14T05:40:00Z',
  updated_at: '2026-11-14T05:50:00Z',
  is_admin: true,
}

const FAVORITE: FavoriteItem = {
  article_id: 'a1',
  favorited_at: '2026-11-14T06:00:00Z',
  title: '通知',
  source: 'ctp_kjb',
  url: 'https://example.com/a.html',
  published_at: '2026-11-13 09:00:00',
  published_at_utc: '2026-11-13 01:00:00',
  category: 'project_application',
  category_confidence: 0.9,
  content_length: 1200,
}

const HISTORY: HistoryItem = { ...FAVORITE, viewed_at: '2026-11-14T06:05:00Z' }
const PREFS: Preferences = { industries: ['new_energy'], push_enabled: true, digest_time: '09:00' }
const SITE: AdminSite = {
  id: 3,
  name: 'ctp_kjb',
  list_url: 'https://www.ctp.gov.cn/kjb/xwzx/list.shtml',
  category: 'news',
  region: '长春',
  timezone: 'Asia/Shanghai',
  enabled: true,
  created_at: '2026-11-14T05:40:00Z',
  updated_at: '2026-11-14T05:40:00Z',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('api/auth', () => {
  it('login 提交用户名密码且不重试', async () => {
    const payload: LoginResponse = {
      token: 't0ken',
      expires_at: '2026-11-21T06:00:00Z',
      user: USER,
    }
    const spy = vi.spyOn(http, 'post').mockResolvedValue({ data: payload })
    await expect(login('admin', 'secret')).resolves.toEqual(payload)
    expect(spy).toHaveBeenCalledWith(
      '/v1/auth/login',
      { username: 'admin', password: 'secret' },
      { retries: 0 },
    )
  })

  it('me 解包 data 返回当前用户', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: USER })
    await expect(me()).resolves.toEqual(USER)
    expect(spy).toHaveBeenCalledWith('/v1/auth/me')
  })

  it('logout 与 changePassword 均不重试', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue(undefined)
    await logout()
    expect(post).toHaveBeenCalledWith('/v1/auth/logout', undefined, { retries: 0 })
    await changePassword({ current_password: 'old', new_password: 'NewPassw0rd!2026' })
    expect(post).toHaveBeenLastCalledWith(
      '/v1/auth/password',
      { current_password: 'old', new_password: 'NewPassw0rd!2026' },
      { retries: 0 },
    )
  })

  it('updateProfile 走 PATCH 并返回更新后的用户', async () => {
    const next = { ...USER, department: '政策研究室' }
    const spy = vi.spyOn(http, 'patch').mockResolvedValue({ data: next })
    await expect(updateProfile({ department: '政策研究室' })).resolves.toEqual(next)
    expect(spy).toHaveBeenCalledWith('/v1/me/profile', { department: '政策研究室' })
  })
})

describe('api/account', () => {
  it('收藏列表按分页参数请求并映射 total', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [FAVORITE],
      meta: { total: 7, returned: 1, limit: 20, offset: 10 },
    })
    await expect(listFavorites(20, 10)).resolves.toEqual({ items: [FAVORITE], total: 7 })
    expect(spy).toHaveBeenCalledWith('/v1/me/favorites', { params: { limit: 20, offset: 10 } })
  })

  it('新增收藏提交 article_id，删除收藏对 id 做 URL 编码', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue(undefined)
    const del = vi.spyOn(http, 'delete').mockResolvedValue(undefined)
    await addFavorite('a/1')
    expect(post).toHaveBeenCalledWith('/v1/me/favorites', { article_id: 'a/1' }, { retries: 0 })
    await removeFavorite('a/1')
    expect(del).toHaveBeenCalledWith('/v1/me/favorites/a%2F1', { retries: 0 })
  })

  it('历史列表与清空历史', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({
      data: [HISTORY],
      meta: { total: 1, returned: 1, limit: 50, offset: 0 },
    })
    const del = vi.spyOn(http, 'delete').mockResolvedValue(undefined)
    await expect(listHistory()).resolves.toEqual({ items: [HISTORY], total: 1 })
    expect(get).toHaveBeenCalledWith('/v1/me/history', { params: { limit: 50, offset: 0 } })
    await clearHistory()
    expect(del).toHaveBeenCalledWith('/v1/me/history', { retries: 0 })
  })

  it('记录浏览不弹全局 loading', async () => {
    const spy = vi.spyOn(http, 'post').mockResolvedValue(undefined)
    await recordHistory('a1')
    expect(spy).toHaveBeenCalledWith(
      '/v1/me/history',
      { article_id: 'a1' },
      { retries: 0, trackLoading: false },
    )
  })

  it('偏好读取与保存只提交后端认识的三个字段', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: PREFS })
    const put = vi.spyOn(http, 'put').mockResolvedValue({ data: PREFS })
    await expect(getPreferences()).resolves.toEqual(PREFS)
    expect(get).toHaveBeenCalledWith('/v1/me/preferences')
    await expect(
      savePreferences({ ...PREFS, updated_at: '2026-11-14T06:00:00Z' }),
    ).resolves.toEqual(PREFS)
    expect(put).toHaveBeenCalledWith('/v1/me/preferences', {
      industries: ['new_energy'],
      push_enabled: true,
      digest_time: '09:00',
    })
  })
})

describe('api/admin', () => {
  it('用户列表按筛选参数请求', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [USER],
      meta: { total: 1, returned: 1, limit: 50, offset: 0 },
    })
    await expect(listAdminUsers({ q: 'admin', role: 'admin', limit: 50 })).resolves.toEqual({
      items: [USER],
      total: 1,
    })
    expect(spy).toHaveBeenCalledWith('/v1/admin/users', {
      params: { q: 'admin', role: 'admin', limit: 50 },
    })
  })

  it('创建用户与重置密码不重试', async () => {
    const created: AdminUser & { temporary_password: string } = {
      ...USER,
      temporary_password: 'Tmp@x',
    }
    const post = vi.spyOn(http, 'post').mockResolvedValueOnce({ data: created })
    await expect(createAdminUser({ username: 'admin', password: 'x' })).resolves.toEqual(created)
    expect(post).toHaveBeenCalledWith(
      '/v1/admin/users',
      { username: 'admin', password: 'x' },
      { retries: 0 },
    )
    post.mockResolvedValueOnce({ data: { user_id: 2, temporary_password: 'Tmp@y' } })
    await expect(resetAdminPassword(2)).resolves.toBe('Tmp@y')
    expect(post).toHaveBeenLastCalledWith('/v1/admin/users/2/reset-password', undefined, {
      retries: 0,
    })
  })

  it('更新用户走 PATCH', async () => {
    const spy = vi.spyOn(http, 'patch').mockResolvedValue({ data: { ...USER, status: 'disabled' } })
    await expect(updateAdminUser(1, { status: 'disabled' })).resolves.toMatchObject({
      status: 'disabled',
    })
    expect(spy).toHaveBeenCalledWith('/v1/admin/users/1', { status: 'disabled' })
  })

  it('站点列表、创建、更新与删除', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: [SITE] })
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: SITE })
    const patch = vi.spyOn(http, 'patch').mockResolvedValue({ data: SITE })
    const del = vi.spyOn(http, 'delete').mockResolvedValue(undefined)
    await expect(listAdminSites()).resolves.toEqual([SITE])
    expect(get).toHaveBeenCalledWith('/v1/admin/sites')
    await expect(createAdminSite({ name: 'ctp_kjb', list_url: SITE.list_url })).resolves.toEqual(
      SITE,
    )
    await expect(updateAdminSite(3, { enabled: false })).resolves.toEqual(SITE)
    await deleteAdminSite(3)
    expect(post).toHaveBeenCalledWith(
      '/v1/admin/sites',
      { name: 'ctp_kjb', list_url: SITE.list_url },
      { retries: 0 },
    )
    expect(patch).toHaveBeenCalledWith('/v1/admin/sites/3', { enabled: false })
    expect(del).toHaveBeenCalledWith('/v1/admin/sites/3', { retries: 0 })
  })

  it('统计看板透传 days', async () => {
    const stats: AdminStats = {
      days: 7,
      range_start: '2026-11-07',
      totals: { articles: 480, sources: 5, users: 1, active_users: 1 },
      daily: [{ day: '2026-11-13', count: 5 }],
      categories: [{ category: 'other', count: 199 }],
      jobs: { succeeded: 8 },
      success_rate: 100,
    }
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: stats })
    await expect(getAdminStats()).resolves.toEqual(stats)
    expect(spy).toHaveBeenCalledWith('/v1/admin/stats', { params: { days: 7 } })
  })

  it('操作日志按筛选条件请求并映射 total', async () => {
    const log: OperationLog = {
      id: 1,
      user_id: 1,
      username: 'admin',
      action: 'auth.login',
      target: '',
      detail: '',
      ip: '127.0.0.1',
      created_at: '2026-11-14T05:50:00Z',
    }
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [log],
      meta: { total: 1, returned: 1, limit: 20, offset: 0 },
    })
    await expect(listOperationLogs({ action: 'auth.login', limit: 20 })).resolves.toEqual({
      items: [log],
      total: 1,
    })
    expect(spy).toHaveBeenCalledWith('/v1/admin/operation-logs', {
      params: { action: 'auth.login', limit: 20 },
    })
  })
})
