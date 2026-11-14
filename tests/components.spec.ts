/**
 * 单元测试：src/components 下的公共组件。
 * 覆盖规范 2.2.1（四）2 要求的 Props / Events 行为，以及导航的折叠与菜单交互。
 * 只断言用户可见行为，不碰内部实现细节。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { NotificationItem } from '@/api/notifications'

const notificationsApi = vi.hoisted(() => ({
  listNotifications: vi.fn(async () => ({ items: [] as NotificationItem[], total: 0, unread: 0 })),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(async () => 0),
}))

vi.mock('@/api/notifications', () => notificationsApi)

import AppNav from '@/components/AppNav.vue'
import AppPager from '@/components/AppPager.vue'
import ArticleCard from '@/components/ArticleCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import ScoreBadge from '@/components/ScoreBadge.vue'
import SearchHighlight from '@/components/SearchHighlight.vue'
import SkeletonList from '@/components/SkeletonList.vue'

const Blank = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Blank },
      { path: '/category', name: 'category', component: Blank },
      { path: '/search', name: 'search', component: Blank },
      { path: '/profile', name: 'profile', component: Blank },
      { path: '/article/:id', name: 'article', component: Blank },
      { path: '/login', name: 'login', component: Blank },
    ],
  })
}

async function mountWithRouter(component: unknown, props: Record<string, unknown> = {}) {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(component as never, {
    props,
    global: { plugins: [router, pinia] },
  })
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  notificationsApi.listNotifications.mockResolvedValue({ items: [], total: 0, unread: 0 })
  notificationsApi.markAllNotificationsRead.mockResolvedValue(0)
})

describe('ScoreBadge', () => {
  it('按 0-1 分数换算百分制并给出分级样式', () => {
    const high = mount(ScoreBadge, { props: { score: 0.92 } })
    expect(high.text()).toContain('相关度')
    expect(high.text()).toContain('92')
    expect(high.classes()).toContain('score--high')

    const mid = mount(ScoreBadge, { props: { score: 0.65, label: '分类置信度' } })
    expect(mid.classes()).toContain('score--medium')
    expect(mid.text()).toContain('分类置信度')

    const low = mount(ScoreBadge, { props: { score: 0.31 } })
    expect(low.classes()).toContain('score--low')
  })

  it('分数为空时不渲染', () => {
    const wrapper = mount(ScoreBadge, { props: { score: null } })
    expect(wrapper.find('.score').exists()).toBe(false)
  })

  it('withLabel=false 时只显示数值', () => {
    const wrapper = mount(ScoreBadge, { props: { score: 0.8, withLabel: false } })
    expect(wrapper.text()).toBe('80')
  })
})

describe('SearchHighlight', () => {
  it('把命中的关键词包进 mark', () => {
    const wrapper = mount(SearchHighlight, {
      props: { text: '关于项目申报的通知', terms: ['申报'] },
    })
    const marks = wrapper.findAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.text()).toBe('申报')
    expect(wrapper.text()).toBe('关于项目申报的通知')
  })

  it('多个词按最长优先，短词不会把长词切碎', () => {
    const wrapper = mount(SearchHighlight, {
      props: { text: '项目申报指南', terms: ['申报', '项目申报'] },
    })
    const marks = wrapper.findAll('mark').map((m) => m.text())
    expect(marks).toEqual(['项目申报'])
  })

  it('正则元字符按字面量处理，不会抛错', () => {
    const wrapper = mount(SearchHighlight, { props: { text: 'a.b(c)', terms: ['.', '('] } })
    expect(wrapper.findAll('mark').map((m) => m.text())).toEqual(['.', '('])
  })

  it('没有关键词时不产生 mark', () => {
    const wrapper = mount(SearchHighlight, { props: { text: '普通文本', terms: [] } })
    expect(wrapper.findAll('mark')).toHaveLength(0)
    expect(wrapper.text()).toBe('普通文本')
  })
})

describe('EmptyState', () => {
  it('默认文案与变体 class', () => {
    const wrapper = mount(EmptyState)
    expect(wrapper.text()).toContain('暂无数据')
    expect(wrapper.classes()).toContain('empty--no-data')
  })

  it('渲染标题、描述与操作插槽', () => {
    const wrapper = mount(EmptyState, {
      props: { title: '没有找到相关公告', description: '换个关键词试试', variant: 'no-result' },
      slots: { action: '<button class="retry">重试</button>' },
    })
    expect(wrapper.text()).toContain('没有找到相关公告')
    expect(wrapper.text()).toContain('换个关键词试试')
    expect(wrapper.classes()).toContain('empty--no-result')
    expect(wrapper.find('.retry').exists()).toBe(true)
  })
})

describe('SkeletonList', () => {
  it('按 rows 渲染占位条数', () => {
    const wrapper = mount(SkeletonList, { props: { rows: 3 } })
    expect(wrapper.findAll('.skeleton__item')).toHaveLength(3)
  })

  it('withBadge=false 时不渲染评分占位', () => {
    const wrapper = mount(SkeletonList, { props: { rows: 2, withBadge: false } })
    expect(wrapper.findAll('.skeleton__bar--badge')).toHaveLength(0)
  })
})

describe('AppPager', () => {
  it('总页数不超过 7 时全部列出，首尾按钮按边界禁用', () => {
    const wrapper = mount(AppPager, { props: { page: 1, totalPages: 3 } })
    expect(wrapper.findAll('.pager__num')).toHaveLength(3)
    const buttons = wrapper.findAll('button')
    expect(buttons[0]!.attributes('disabled')).toBeDefined()
  })

  it('点击页码发出 update:page', async () => {
    const wrapper = mount(AppPager, { props: { page: 2, totalPages: 5 } })
    await wrapper.findAll('.pager__num')[2]!.trigger('click')
    expect(wrapper.emitted('update:page')?.[0]).toEqual([3])
  })

  it('页数很多时只显示当前页附近 5 个', () => {
    const wrapper = mount(AppPager, { props: { page: 10, totalPages: 20 } })
    const numbers = wrapper.findAll('.pager__num').map((n) => n.text())
    expect(numbers).toEqual(['8', '9', '10', '11', '12'])
  })

  it('切换每页条数发出 update:pageSize', async () => {
    const wrapper = mount(AppPager, { props: { page: 1, totalPages: 5, pageSize: 10, total: 42 } })
    await wrapper.find('select').setValue('20')
    expect(wrapper.emitted('update:pageSize')?.[0]).toEqual([20])
    expect(wrapper.text()).toContain('42')
  })
})

describe('ArticleCard', () => {
  const base = {
    articleId: 'a1',
    title: '关于开展 2026 年度项目申报的通知',
    source: 'most_kjjh',
    publishedAt: '2026-11-10 09:30:00',
    category: 'project_application',
  }

  it('渲染分类、来源、日期与标题，并链接到详情', async () => {
    const { wrapper } = await mountWithRouter(ArticleCard, base)
    expect(wrapper.text()).toContain('科技部（国家科技管理信息系统）')
    expect(wrapper.text()).toContain('2026-11-10')
    expect(wrapper.text()).toContain('项目申报')
    expect(wrapper.find('a').exists()).toBe(true)
    await wrapper.find('a').trigger('click')
    expect(wrapper.emitted('click')?.[0]).toEqual(['a1'])
  })

  it('高相关度才显示关键要素摘要', async () => {
    const high = await mountWithRouter(ArticleCard, {
      ...base,
      score: 0.9,
      highlights: ['截止 2026-11-30'],
    })
    expect(high.wrapper.text()).toContain('截止 2026-11-30')

    const low = await mountWithRouter(ArticleCard, {
      ...base,
      score: 0.5,
      highlights: ['截止 2026-11-30'],
    })
    expect(low.wrapper.text()).not.toContain('截止 2026-11-30')
  })
})

describe('AppNav', () => {
  it('渲染四个导航入口，并在折叠时切换 class', async () => {
    const { wrapper } = await mountWithRouter(AppNav)
    expect(wrapper.findAll('.side__link')).toHaveLength(4)
    expect(wrapper.find('.shell').classes()).not.toContain('shell--collapsed')
    await wrapper.find('.side__toggle').trigger('click')
    expect(wrapper.find('.shell').classes()).toContain('shell--collapsed')
  })

  it('用户菜单可展开，退出登录跳转登录页', async () => {
    const { wrapper, router } = await mountWithRouter(AppNav)
    await wrapper.find('.nav__user button').trigger('click')
    const items = wrapper.findAll('.nav__menu-item')
    expect(items).toHaveLength(2)
    await items[1]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('全局搜索把关键词带到检索页', async () => {
    const { wrapper, router } = await mountWithRouter(AppNav)
    await wrapper.find('.nav__search-input').setValue(' 资金补贴 ')
    await wrapper.find('.nav__search').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('search')
    expect(router.currentRoute.value.query.q).toBe('资金补贴')
  })

  it('当前路由只按路径段匹配，/searchfoo 不会点亮检索入口', async () => {
    const { wrapper, router } = await mountWithRouter(AppNav)
    await router.push('/search')
    await router.isReady()
    const active = wrapper
      .findAll('.side__link')
      .filter((l) => l.classes().includes('side__link--active'))
    expect(active).toHaveLength(1)
    expect(active[0]!.attributes('aria-label')).toBe('信息检索')
  })

  it('铃铛显示未读数，点击通知标记已读并跳到详情', async () => {
    const item: NotificationItem = {
      id: 7,
      article_id: 'art-1',
      kind: 'project_application',
      title: '新增项目申报公告',
      message: '关于组织申报 2026 年度重点研发计划的通知',
      created_at: '2026-11-14T03:00:00Z',
      read_at: null,
      read: false,
      url: 'https://example.com/a.html',
      source: 'ctp_kjb',
      category: 'project_application',
      published_at: '2026-11-14 10:00:00',
    }
    notificationsApi.listNotifications.mockResolvedValue({
      items: [item],
      total: 1,
      unread: 1,
    })
    notificationsApi.markNotificationRead.mockResolvedValue({ ...item, read: true })

    const { wrapper, router } = await mountWithRouter(AppNav)
    await flushPromises()
    expect(wrapper.find('.nav__badge').text()).toBe('1')

    await wrapper.find('.nav__bell-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.nav__bell-panel').text()).toContain('关于组织申报')
    await wrapper.find('.nav__bell-item').trigger('click')
    await flushPromises()
    expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith(7)
    expect(router.currentRoute.value.name).toBe('article')
    expect(router.currentRoute.value.params.id).toBe('art-1')
  })

  it('全部已读清空角标', async () => {
    const base: NotificationItem = {
      id: 1,
      article_id: 'a1',
      kind: 'project_application',
      title: '新增项目申报公告',
      message: '通知一',
      created_at: '2026-11-14T03:00:00Z',
      read_at: null,
      read: false,
      url: null,
      source: null,
      category: null,
      published_at: null,
    }
    notificationsApi.listNotifications.mockResolvedValue({
      items: [base, { ...base, id: 2, article_id: 'a2', message: '通知二' }],
      total: 2,
      unread: 2,
    })
    notificationsApi.markAllNotificationsRead.mockResolvedValue(2)

    const { wrapper } = await mountWithRouter(AppNav)
    await flushPromises()
    expect(wrapper.find('.nav__badge').text()).toBe('2')
    await wrapper.find('.nav__bell-btn').trigger('click')
    await flushPromises()
    await wrapper.find('.nav__bell-readall').trigger('click')
    await flushPromises()
    expect(notificationsApi.markAllNotificationsRead).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.nav__badge').exists()).toBe(false)
  })

  it('迟到的轮询响应不会把「全部已读」的角标冲回来', async () => {
    const base: NotificationItem = {
      id: 1,
      article_id: 'a1',
      kind: 'project_application',
      title: '新增项目申报公告',
      message: '通知一',
      created_at: '2026-11-14T03:00:00Z',
      read_at: null,
      read: false,
      url: null,
      source: null,
      category: null,
      published_at: null,
    }
    let resolvePoll!: (value: unknown) => void
    notificationsApi.listNotifications
      .mockResolvedValueOnce({
        items: [base, { ...base, id: 2, article_id: 'a2' }],
        total: 2,
        unread: 2,
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePoll = resolve
        }),
      )
    notificationsApi.markAllNotificationsRead.mockResolvedValue(2)

    const { wrapper } = await mountWithRouter(AppNav)
    await flushPromises()
    expect(wrapper.find('.nav__badge').text()).toBe('2')

    await wrapper.find('.nav__bell-btn').trigger('click')
    await Promise.resolve()
    await wrapper.find('.nav__bell-readall').trigger('click')
    await flushPromises()
    expect(wrapper.find('.nav__badge').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('加载中…')

    resolvePoll({ items: [base, { ...base, id: 2, article_id: 'a2' }], total: 2, unread: 2 })
    await flushPromises()
    expect(wrapper.find('.nav__badge').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('加载中…')
  })
})
