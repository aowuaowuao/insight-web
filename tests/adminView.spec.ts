/**
 * 管理控制台 Tab 状态隔离测试。
 * 守护：统计加载失败/仍在加载时不得污染其它 Tab；站点动作失败不得写到切换后的 Tab。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'

enableAutoUnmount(afterEach)

const adminApi = vi.hoisted(() => ({
  getAdminStats: vi.fn(),
  listAdminSites: vi.fn(),
  createAdminSite: vi.fn(),
  updateAdminSite: vi.fn(),
  deleteAdminSite: vi.fn(),
  listAdminUsers: vi.fn(),
  createAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
  resetAdminPassword: vi.fn(),
  listOperationLogs: vi.fn(),
}))

const chart = vi.hoisted(() => ({
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock('@/api/admin', () => adminApi)
vi.mock('echarts/core', () => ({ init: vi.fn(() => chart), use: vi.fn() }))
vi.mock('echarts/charts', () => ({ GaugeChart: {}, LineChart: {}, PieChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  LegendComponent: {},
  TooltipComponent: {},
}))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))

import AdminView from '@/views/AdminView.vue'

const EMPTY_STATS = {
  days: 7,
  range_start: '2026-11-07',
  totals: { articles: 0, sources: 0, users: 1, active_users: 1 },
  daily: [],
  categories: [],
  jobs: {},
  success_rate: 100,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function mountAdmin() {
  const wrapper = mount(AdminView)
  await flushPromises()
  return wrapper
}

async function clickTab(wrapper: Awaited<ReturnType<typeof mountAdmin>>, index: number) {
  await wrapper.findAll('.tabs__item')[index].trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApi.getAdminStats.mockResolvedValue(EMPTY_STATS)
  adminApi.listAdminSites.mockResolvedValue([])
  adminApi.listAdminUsers.mockResolvedValue({ items: [], total: 0 })
  adminApi.listOperationLogs.mockResolvedValue({ items: [], total: 0 })
})

describe('AdminView Tab 状态隔离', () => {
  it('统计加载失败只显示在统计 Tab，切到站点管理后不再出现', async () => {
    adminApi.getAdminStats.mockRejectedValue(new Error('统计服务不可用'))
    const wrapper = await mountAdmin()
    expect(wrapper.find('.notice--error').text()).toContain('统计服务不可用')

    await clickTab(wrapper, 1)
    expect(wrapper.find('.notice--error').exists()).toBe(false)
    expect(wrapper.text()).toContain('共 0 个站点')
  })

  it('统计仍在加载时切到站点管理，不显示统计的加载状态', async () => {
    const pending = deferred<typeof EMPTY_STATS>()
    adminApi.getAdminStats.mockReturnValue(pending.promise)
    const wrapper = await mountAdmin()
    expect(wrapper.text()).toContain('加载中…')

    await clickTab(wrapper, 1)
    expect(wrapper.text()).not.toContain('加载中…')
    expect(wrapper.text()).toContain('共 0 个站点')

    pending.resolve(EMPTY_STATS)
    await flushPromises()
    expect(wrapper.text()).not.toContain('加载中…')
  })

  it('站点保存失败时用户已切到账号管理，错误不得显示在账号 Tab', async () => {
    const pending = deferred<never>()
    adminApi.createAdminSite.mockReturnValue(pending.promise)
    const wrapper = await mountAdmin()

    await clickTab(wrapper, 1)
    await wrapper.get('.btn--primary').trigger('click')
    const inputs = wrapper.findAll('.modal input.input')
    await inputs[0].setValue('测试站点')
    await inputs[1].setValue('https://example.com/news')
    await wrapper.findAll('.modal .btn')[1].trigger('click')
    await flushPromises()

    await clickTab(wrapper, 2)
    pending.reject(new Error('站点保存失败'))
    await flushPromises()

    expect(wrapper.find('.notice--error').exists()).toBe(false)
    expect(wrapper.find('.tabs__item--active').text()).toBe('账号管理')
  })

  it('站点列表的迟到响应不覆盖后发请求的结果', async () => {
    const pending = deferred<unknown[]>()
    adminApi.listAdminSites.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([])
    const wrapper = await mountAdmin()

    await clickTab(wrapper, 1)
    await clickTab(wrapper, 2)
    await clickTab(wrapper, 1)
    expect(wrapper.text()).toContain('共 0 个站点')

    pending.resolve([
      {
        id: 99,
        name: '迟到站点',
        list_url: 'https://late.example.com',
        category: '',
        region: '',
        timezone: 'Asia/Shanghai',
        enabled: true,
        created_at: '',
        updated_at: '',
      },
    ])
    await flushPromises()
    expect(wrapper.text()).toContain('共 0 个站点')
    expect(wrapper.text()).not.toContain('迟到站点')
  })

  it('站点旧请求迟到失败不清新请求的错误与加载状态', async () => {
    const first = deferred<unknown[]>()
    const second = deferred<unknown[]>()
    adminApi.listAdminSites.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const wrapper = await mountAdmin()

    await clickTab(wrapper, 1)
    await clickTab(wrapper, 2)
    await clickTab(wrapper, 1)
    expect(wrapper.text()).toContain('加载中…')

    first.reject(new Error('旧请求失败'))
    await flushPromises()
    expect(wrapper.text()).toContain('加载中…')
    expect(wrapper.find('.notice--error').exists()).toBe(false)

    second.resolve([])
    await flushPromises()
    expect(wrapper.text()).toContain('共 0 个站点')
    expect(wrapper.text()).not.toContain('加载中…')
  })

  it('账号列表的迟到响应不覆盖后发请求的结果', async () => {
    const pending = deferred<{ items: unknown[]; total: number }>()
    adminApi.listAdminUsers
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ items: [], total: 0 })
    const wrapper = await mountAdmin()

    await clickTab(wrapper, 2)
    await clickTab(wrapper, 3)
    await clickTab(wrapper, 2)
    expect(wrapper.text()).toContain('共 0 个账号')

    pending.resolve({
      items: [
        {
          id: 99,
          username: 'late-user',
          display_name: '',
          department: '',
          role: 'user',
          status: 'active',
          last_login_at: null,
          created_at: '',
        },
      ],
      total: 1,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('共 0 个账号')
    expect(wrapper.text()).not.toContain('late-user')
  })

  it('日志列表的迟到响应不覆盖后发请求的结果', async () => {
    const pending = deferred<{ items: unknown[]; total: number }>()
    adminApi.listOperationLogs
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ items: [], total: 0 })
    const wrapper = await mountAdmin()

    await clickTab(wrapper, 3)
    await clickTab(wrapper, 0)
    await clickTab(wrapper, 3)
    expect(wrapper.text()).toContain('暂无日志')

    pending.resolve({
      items: [
        {
          id: 99,
          user_id: 1,
          username: 'late-user',
          action: 'auth.login',
          target: '',
          detail: '迟到日志',
          ip: '127.0.0.1',
          created_at: '2026-11-14 20:00:00',
        },
      ],
      total: 1,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无日志')
    expect(wrapper.text()).not.toContain('迟到日志')
  })
})
