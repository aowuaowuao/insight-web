/**
 * 单元测试：分类浏览页（src/views/CategoryView.vue）。
 *
 * 这些用例盯住三件容易「静默出错」的事：
 * 1. Tab 与后端大类的映射（映射错了页面照样渲染，只是数据不对）；
 * 2. 筛选条件是否真的落到同一组请求参数里（漏拼参数 = 筛了没效果）；
 * 3. 竞态守卫（先发后到的响应必须丢弃，否则筛选条件的切换会显示旧数据）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { ArticleListItem, ArticleListPage } from '@/api/articles'

vi.mock('@/api/articles', () => ({ listArticles: vi.fn() }))
vi.mock('@/api/sources', () => ({ listSources: vi.fn() }))
vi.mock('@/api/industries', () => ({ listIndustries: vi.fn() }))

const { listArticles } = await import('@/api/articles')
const { listSources } = await import('@/api/sources')
const { listIndustries } = await import('@/api/industries')
const CategoryView = (await import('@/views/CategoryView.vue')).default

const Blank = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Blank },
      { path: '/category', name: 'category', component: Blank },
      { path: '/article/:id', name: 'article', component: Blank },
    ],
  })
}

function makeItem(id: string, overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    article_id: id,
    source: 'ctp_kjb',
    url: 'https://example.com/' + id,
    title: '标题 ' + id,
    published_at: '2026-11-01 09:00:00',
    published_at_utc: '2026-11-01 01:00:00',
    content_length: 1000,
    category: 'industry_policy',
    category_confidence: 0.81,
    category_engine: 'llm',
    industry: 'next_gen_it',
    industry_confidence: 0.8,
    industry_engine: 'llm',
    tag_engine: 'llm',
    extract_engine: 'gne',
    analyzed_at: '2026-11-01 10:00:00',
    body: null,
    tags: [],
    ...overrides,
  }
}

function makePage(items: ArticleListItem[], total = items.length): ArticleListPage {
  return {
    items,
    total,
    limit: 10,
    offset: 0,
    sort: 'published_desc',
    undatedExcluded: 0,
  }
}

const callUrls = (): string[] => vi.mocked(listArticles).mock.calls.map((call) => String(call[0]))
const lastOptions = (): Record<string, unknown> => {
  const calls = vi.mocked(listArticles).mock.calls
  return (calls[calls.length - 1][0] ?? {}) as Record<string, unknown>
}

async function mountPage() {
  const router = makeRouter()
  await router.push('/category')
  await router.isReady()
  const wrapper = mount(CategoryView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

/** 找到文案匹配的按钮（Tab / chip 都是 button） */
function buttonByText(wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], text: string) {
  return wrapper.findAll('button').find((node) => node.text().trim().startsWith(text))
}

beforeEach(() => {
  vi.mocked(listArticles).mockReset()
  vi.mocked(listSources).mockReset()
  vi.mocked(listIndustries).mockReset()
  vi.mocked(listArticles).mockResolvedValue(makePage([makeItem('a1')]))
  vi.mocked(listSources).mockResolvedValue([])
  vi.mocked(listIndustries).mockResolvedValue([])
})

describe('分类 Tab', () => {
  it('四个 Tab 的文案与顺序符合规范', async () => {
    const { wrapper } = await mountPage()
    const labels = wrapper.findAll('.tab').map((node) => node.text().trim())
    expect(labels).toEqual(['政策类', '项目申报类', '资金奖补类', '全部'])
  })

  it('点「政策类」按 industry_policy 查询，点「全部」不带 category', async () => {
    const { wrapper } = await mountPage()

    await buttonByText(wrapper, '政策类')!.trigger('click')
    await flushPromises()
    expect(lastOptions().category).toBe('industry_policy')

    await buttonByText(wrapper, '全部')!.trigger('click')
    await flushPromises()
    expect(lastOptions().category).toBeUndefined()
  })

  it('二级「大类」chip 能直达人才申报，此时四个 Tab 都不高亮', async () => {
    const { wrapper } = await mountPage()

    await buttonByText(wrapper, '人才申报')!.trigger('click')
    await flushPromises()
    expect(lastOptions().category).toBe('talent_application')
    expect(wrapper.findAll('.tab--active')).toHaveLength(0)
  })

  it('点 Tab 会同步大类 chip 的选中态', async () => {
    const { wrapper } = await mountPage()
    await buttonByText(wrapper, '资金奖补类')!.trigger('click')
    await flushPromises()
    const activeChips = wrapper.findAll('.chip--active').map((node) => node.text().trim())
    expect(activeChips).toContain('资金补贴')
  })
})

describe('二级筛选叠加', () => {
  it('时间范围 + 发布单位 + 排序同时进同一组参数', async () => {
    vi.mocked(listSources).mockResolvedValue([
      {
        source: 'ctp_kjb',
        count: 3,
        avg_confidence: 0.8,
        latest_published_at: '2026-11-01 09:00:00',
      },
    ])
    const { wrapper } = await mountPage()
    await flushPromises()

    await buttonByText(wrapper, '近 7 天')!.trigger('click')
    await flushPromises()
    await buttonByText(wrapper, '长春高新区')!.trigger('click')
    await flushPromises()

    const options = lastOptions()
    // 日期必须是本地日（含今天往前数 6 天），不能是 toISOString 的 UTC 日
    const today = new Date()
    const expectedTo =
      String(today.getFullYear()) +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0')
    expect(options.publishedTo).toBe(expectedTo)
    expect(options.publishedFrom).toBeTruthy()
    expect(options.sources).toEqual(['ctp_kjb'])
    expect(options.sort).toBe('published_desc')
  })

  it('发布单位是多选：再点一次取消', async () => {
    vi.mocked(listSources).mockResolvedValue([
      { source: 'ctp_kjb', count: 3, avg_confidence: 0.8, latest_published_at: null },
      { source: 'ndrc_tz', count: 2, avg_confidence: 0.6, latest_published_at: null },
    ])
    const { wrapper } = await mountPage()
    await flushPromises()

    await buttonByText(wrapper, '长春高新区')!.trigger('click')
    await flushPromises()
    await buttonByText(wrapper, '国家发展改革委')!.trigger('click')
    await flushPromises()
    expect(lastOptions().sources).toEqual(['ctp_kjb', 'ndrc_tz'])

    await buttonByText(wrapper, '长春高新区')!.trigger('click')
    await flushPromises()
    expect(lastOptions().sources).toEqual(['ndrc_tz'])
  })

  it('行业领域单选：选中落到 industry 参数，再点一次取消', async () => {
    vi.mocked(listIndustries).mockResolvedValue([
      {
        id: 'next_gen_it',
        name: '新一代信息技术',
        description: '集成电路、人工智能',
        keywords: ['人工智能'],
        article_count: 112,
      },
    ])
    const { wrapper } = await mountPage()
    await flushPromises()

    await buttonByText(wrapper, '新一代信息技术')!.trigger('click')
    await flushPromises()
    expect(lastOptions().industry).toBe('next_gen_it')

    await buttonByText(wrapper, '新一代信息技术')!.trigger('click')
    await flushPromises()
    expect(lastOptions().industry).toBeUndefined()
  })

  it('自定义时间范围倒置时不发请求并给出提示', async () => {
    const { wrapper } = await mountPage()
    await buttonByText(wrapper, '自定义')!.trigger('click')
    await flushPromises()
    const dateInputs = wrapper.findAll('input[type="date"]')
    expect(dateInputs).toHaveLength(2)

    await dateInputs[0].setValue('2026-11-10')
    await dateInputs[0].trigger('change')
    await flushPromises()
    await dateInputs[1].setValue('2026-11-01')
    await dateInputs[1].trigger('change')
    await flushPromises()

    expect(wrapper.find('.adv-error').exists()).toBe(true)
    expect(wrapper.findAll('.card')).toHaveLength(0)
  })
})

describe('排序与分页', () => {
  it('四种排序映射到后端的 sort 值', async () => {
    const { wrapper } = await mountPage()
    for (const [label, value] of [
      ['发布时间 ↑', 'published_asc'],
      ['相关度 ↓', 'confidence_desc'],
      ['相关度 ↑', 'confidence_asc'],
      ['发布时间 ↓', 'published_desc'],
    ] as const) {
      await buttonByText(wrapper, label)!.trigger('click')
      await flushPromises()
      expect(lastOptions().sort).toBe(value)
    }
  })

  it('默认每页 10 条，切到 20 条后回到第 1 页并带上 offset', async () => {
    vi.mocked(listArticles).mockResolvedValue(makePage([makeItem('a1')], 120))
    const { wrapper } = await mountPage()
    expect(vi.mocked(listArticles).mock.calls[0][0]?.limit).toBe(10)

    await buttonByText(wrapper, '3')!.trigger('click')
    await flushPromises()
    expect(lastOptions().offset).toBe(20)

    await wrapper.find('.pager__select').setValue('20')
    await flushPromises()
    expect(lastOptions().limit).toBe(20)
    expect(lastOptions().offset).toBe(0)
  })
})

describe('三态与 URL', () => {
  it('空结果显示空状态并带「重置筛选」', async () => {
    const { wrapper } = await mountPage()
    await buttonByText(wrapper, '政策类')!.trigger('click')
    vi.mocked(listArticles).mockResolvedValue(makePage([], 0))
    await buttonByText(wrapper, '近 30 天')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('没有符合条件的公告')
    const reset = wrapper.findAll('button').find((node) => node.text().includes('重置筛选'))
    expect(reset).toBeTruthy()

    await reset!.trigger('click')
    await flushPromises()
    expect(lastOptions().category).toBeUndefined()
    expect(lastOptions().publishedFrom).toBeUndefined()
  })

  it('加载失败展示错误态与重试', async () => {
    vi.mocked(listArticles).mockRejectedValue(new Error('网络断了'))
    const { wrapper } = await mountPage()
    expect(wrapper.text()).toContain('公告加载失败')

    vi.mocked(listArticles).mockResolvedValue(makePage([makeItem('a1')]))
    await buttonByText(wrapper, '重试')!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.card')).toHaveLength(1)
  })

  it('筛选状态写进 URL，且页面按 URL 还原', async () => {
    const { wrapper, router } = await mountPage()
    await buttonByText(wrapper, '政策类')!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.cat).toBe('industry_policy')
    expect(router.currentRoute.value.query.tab).toBe('policy')
  })

  it('带查询参数的 URL 直接打开就生效', async () => {
    // total 必须够大：否则第 2 页会被「页码越界」逻辑拉回第 1 页，测不到 offset
    vi.mocked(listArticles).mockResolvedValue(makePage([makeItem('a1')], 120))
    const router = makeRouter()
    await router.push('/category?cat=funding_subsidy&range=30d&sort=confidence_desc&page=2')
    await router.isReady()
    mount(CategoryView, { global: { plugins: [router] } })
    await flushPromises()

    const options = lastOptions()
    expect(options.category).toBe('funding_subsidy')
    expect(options.sort).toBe('confidence_desc')
    expect(options.offset).toBe(10)
    expect(options.publishedFrom).toBeTruthy()
  })
})

describe('竞态守卫', () => {
  it('先发后到的旧响应不会覆盖新筛选的结果', async () => {
    const { wrapper } = await mountPage()

    const pending: ((page: ArticleListPage) => void)[] = []
    vi.mocked(listArticles).mockImplementation(
      () =>
        new Promise<ArticleListPage>((resolve) => {
          pending.push(resolve)
        }),
    )

    await buttonByText(wrapper, '政策类')!.trigger('click')
    await flushPromises()
    await buttonByText(wrapper, '项目申报类')!.trigger('click')
    await flushPromises()
    expect(pending).toHaveLength(2)

    // 后发的请求先回
    pending[1](makePage([makeItem('policy-proj', { title: '项目申报类结果' })]))
    await flushPromises()
    // 先发的请求后回，必须被丢弃
    pending[0](makePage([makeItem('policy-old', { title: '政策类旧结果' })]))
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('项目申报类结果')
    expect(text).not.toContain('政策类旧结果')
    expect(callUrls()).toHaveLength(3)
  })
})
