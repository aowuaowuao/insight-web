/**
 * 管理控制台 Tab 状态隔离测试。
 * 守护：统计加载失败/仍在加载时不得污染其它 Tab；站点动作失败不得写到切换后的 Tab。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

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
    expect(wrapper.text()).toContain('账号管理')
  })
})
