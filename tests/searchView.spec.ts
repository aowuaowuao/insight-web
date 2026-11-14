/**
 * 单元测试：检索页（src/views/SearchView.vue）。
 *
 * 这些用例全部盯住「界面自相矛盾」这一类真 bug —— 它们不会让页面报错，
 * 但会让用户看到两组互相打架的信息（URL 说第 2 页、分页器说第 1 页；
 * 错误提示和「没有找到」同屏；选中了却取消不掉的筛选项）。
 *
 * 覆盖：
 * 1. 点「自定义」必须真的弹出日期框（B3：曾因 URL 不记 range 被打回「全部时间」）；
 * 2. 直达 ?high=1&page=2 必须停在第 2 页（S11：曾被 watch 打回第 1 页）；
 * 3. 页码越界必须收敛到末页（S12）；
 * 4. 无关键词时 URL 里的 high=1 必须被丢弃（S14）；
 * 5. 自定义区间倒置时不发请求、错误提示与空态不同屏（S13）；
 * 6. 后端返回 undated_excluded / truncated 时状态行要说明（N12）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { SearchItem, SearchPayload } from '@/api/search'

vi.mock('@/api/search', () => ({ searchArticles: vi.fn() }))
vi.mock('@/api/articles', () => ({ listArticles: vi.fn() }))
vi.mock('@/api/sources', () => ({ listSources: vi.fn() }))
vi.mock('@/api/industries', () => ({ listIndustries: vi.fn() }))
vi.mock('@/api/tags', () => ({
  listTags: vi.fn(),
  tagName: (defs: { id: string; name: string }[], id: string) =>
    defs.find((item) => item.id === id)?.name ?? id,
}))

const { searchArticles } = await import('@/api/search')
const { listArticles } = await import('@/api/articles')
const { listSources } = await import('@/api/sources')
const { listIndustries } = await import('@/api/industries')
const { listTags } = await import('@/api/tags')
const SearchView = (await import('@/views/SearchView.vue')).default

const Blank = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Blank },
      { path: '/search', name: 'search', component: Blank },
      { path: '/article/:id', name: 'article', component: Blank },
    ],
  })
}

function makeItem(id: string, score = 0.9): SearchItem {
  return {
    article_id: id,
    source: 'ctp_kjb',
    url: 'https://example.com/' + id,
    title: '关于申报 ' + id + ' 的通知',
    published_at: '2026-11-01 09:00:00',
    published_at_utc: '2026-11-01 01:00:00',
    content_length: 1200,
    category: 'project_application',
    category_confidence: 0.9,
    industry: 'next_gen_it',
    industry_confidence: 0.8,
    tags: [],
    relevance: {
      score,
      tag_confidence: 0.9,
      title_hits: 1,
      body_hits: 2,
      matched_tags: ['project_application'],
      matched_terms: ['申报'],
    },
  }
}

function makePayload(items: SearchItem[], extra: Partial<SearchPayload> = {}): SearchPayload {
  return {
    query: '申报',
    matched_tags: ['project_application'],
    terms: ['申报'],
    total: items.length,
    groups: [{ category: 'project_application', count: items.length, items }],
    sort: 'relevance',
    ...extra,
  }
}

/** 等到「导航 + 请求 + watch 回填」全部落地（单次 flushPromises 不够，导航是异步的） */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function mountAt(path: string) {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(SearchView, { global: { plugins: [router] } })
  await settle()
  return { wrapper, router }
}

function buttonByText(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  text: string,
): ReturnType<typeof wrapper.findAll>[number] | undefined {
  return wrapper.findAll('button').find((node) => node.text().trim() === text)
}

beforeEach(() => {
  vi.mocked(searchArticles).mockReset()
  vi.mocked(listArticles).mockReset()
  vi.mocked(listSources).mockReset()
  vi.mocked(listIndustries).mockReset()
  vi.mocked(listTags).mockReset()
  vi.mocked(searchArticles).mockResolvedValue(makePayload([makeItem('a1')]))
  vi.mocked(listArticles).mockResolvedValue({
    items: [],
    total: 0,
    limit: 10,
    offset: 0,
    sort: 'published_desc',
    undatedExcluded: 0,
  })
  vi.mocked(listSources).mockResolvedValue([])
  vi.mocked(listIndustries).mockResolvedValue([])
  vi.mocked(listTags).mockResolvedValue([])
})

describe('时间范围：自定义（B3 回归）', () => {
  it('点「自定义」立刻出现两个日期输入框', async () => {
    const { wrapper, router } = await mountAt('/search')

    expect(wrapper.findAll('input[type="date"]')).toHaveLength(0)
    await buttonByText(wrapper, '自定义')!.trigger('click')
    await settle()

    expect(wrapper.findAll('input[type="date"]')).toHaveLength(2)
    // 关键：range 必须写进 URL，否则任何一次 applyFromRoute 都会把它还原成「全部时间」
    expect(router.currentRoute.value.query.range).toBe('custom')
  })

  it('URL 带 range=custom 时刷新（重新挂载）仍停在自定义', async () => {
    const first = await mountAt('/search')
    await buttonByText(first.wrapper, '自定义')!.trigger('click')
    await settle()
    const url = first.router.currentRoute.value.fullPath
    first.wrapper.unmount()

    // 用同一个 URL 重新挂载，模拟刷新
    const { wrapper } = await mountAt(url)
    expect(wrapper.findAll('input[type="date"]')).toHaveLength(2)
  })

  it('从「近 7 天」切到「自定义」会清掉日期条件，但不弹回「全部时间」', async () => {
    const { wrapper, router } = await mountAt('/search')
    await buttonByText(wrapper, '近 7 天')!.trigger('click')
    await settle()
    expect(router.currentRoute.value.query.range).toBe('7d')

    await buttonByText(wrapper, '自定义')!.trigger('click')
    await settle()
    expect(router.currentRoute.value.query.range).toBe('custom')
    expect(router.currentRoute.value.query.from).toBeUndefined()
    expect(wrapper.findAll('input[type="date"]')).toHaveLength(2)
  })
})

describe('页码与筛选状态从 URL 还原', () => {
  it('直达 ?high=1&page=2 时停在第 2 页（S11 回归）', async () => {
    const items = Array.from({ length: 20 }, (_, i) => makeItem('a' + String(i).padStart(2, '0')))
    vi.mocked(searchArticles).mockResolvedValue(makePayload(items))

    const { wrapper, router } = await mountAt('/search?q=申报&high=1&page=2')

    expect(router.currentRoute.value.query.page).toBe('2')
    const summary = wrapper.find('.pager__summary').text().replace(/\s+/g, ' ')
    expect(summary).toContain('第 2 / 2 页')
    // 高相关度过滤仍然生效（20 条都 ≥0.8，所以还是 20 条）
    expect(wrapper.findAll('.card')).toHaveLength(10)
  })

  it('页码越界收敛到末页，不显示「没有找到」（S12 回归）', async () => {
    vi.mocked(searchArticles).mockResolvedValue(makePayload([makeItem('a1'), makeItem('a2')]))

    const { wrapper, router } = await mountAt('/search?q=申报&page=9999')

    expect(router.currentRoute.value.query.page).toBeUndefined()
    expect(wrapper.find('.pager__summary').text()).toContain('第 1 / 1 页')
    expect(wrapper.text()).not.toContain('没有找到相关公告')
  })

  it('无关键词时 URL 里的 high=1 被丢弃，复选框不被锁死（S14 回归）', async () => {
    const { wrapper } = await mountAt('/search?high=1')

    expect(vi.mocked(searchArticles)).not.toHaveBeenCalled()
    const box = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    expect(box.element.checked).toBe(false)
    // 角标不能计一个「面板里没有可取消项」的条件
    expect(wrapper.find('.adv__count').exists()).toBe(false)
  })
})

describe('自定义区间倒置（S13 回归）', () => {
  it('不发请求，只显示错误提示，不叠加「没有找到」空态', async () => {
    const { wrapper } = await mountAt('/search?q=申报&range=custom&from=2026-11-10&to=2026-11-01')

    expect(vi.mocked(searchArticles)).not.toHaveBeenCalled()
    expect(wrapper.find('.status').text()).toContain('时间范围无效')
    expect(wrapper.find('.adv-error').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('没有找到相关公告')
  })
})

describe('状态行统计口径（N12）', () => {
  it('undated_excluded 与 truncated 都要在状态行说明', async () => {
    vi.mocked(searchArticles).mockResolvedValue(
      makePayload([makeItem('a1')], {
        total: 1,
        returned: 1,
        undated_excluded: 3,
        truncated: true,
      }),
    )

    const { wrapper } = await mountAt('/search?q=申报')
    const status = wrapper.find('.status').text()

    expect(status).toContain('共找到 1 条结果')
    expect(status).toContain('另有 3 篇无发布时间未计入')
    expect(status).toContain('候选集已打满 2000 条')
  })

  it('没有无日期条目、也没截断时，不多说一句', async () => {
    const { wrapper } = await mountAt('/search?q=申报')
    const status = wrapper.find('.status').text()

    expect(status).toContain('共找到 1 条结果')
    expect(status).not.toContain('无发布时间')
    expect(status).not.toContain('候选集')
  })
})

describe('清除与筛选状态（S16 / S17 回归）', () => {
  it('清除关键词后 URL 不再残留 high=1，复选框也不会变成「勾选且禁用」（S16）', async () => {
    const { wrapper, router } = await mountAt('/search?q=申报&high=1&category=project_application')
    const boxBefore = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    expect(boxBefore.element.checked).toBe(true)

    const clearButton = buttonByText(wrapper, '清除')
    expect(clearButton).toBeDefined()
    await clearButton!.trigger('click')
    await settle()

    expect(router.currentRoute.value.query.high).toBeUndefined()
    expect(router.currentRoute.value.query.q).toBeUndefined()
    const boxAfter = wrapper.find<HTMLInputElement>('input[type="checkbox"]')
    expect(boxAfter.element.checked).toBe(false)
  })

  it('时间区间倒置时不渲染分页器，避免「时间范围无效」下方再写「共 0 条」（S17）', async () => {
    const { wrapper } = await mountAt('/search?q=申报&range=custom&from=2026-11-10&to=2026-11-01')

    expect(wrapper.find('.status').text()).toContain('时间范围无效')
    expect(wrapper.find('.pager').exists()).toBe(false)
  })

  it('浏览模式页码越界时回退末页并重取一次（N19）', async () => {
    vi.mocked(listArticles).mockResolvedValue({
      items: [makeItem('b1')],
      total: 5,
      limit: 10,
      offset: 0,
      sort: 'published_desc',
      undatedExcluded: 0,
    })

    const { wrapper, router } = await mountAt('/search?category=other&page=99')

    expect(vi.mocked(listArticles)).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.query.page).toBeUndefined()
    expect(wrapper.find('.pager__summary').text()).toContain('第 1 / 1 页')
  })
})
