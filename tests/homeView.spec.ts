/**
 * 首页数据接线测试：推荐与待办必须来自专用接口，不能用最新列表冒充。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

vi.mock('@/api/articles', () => ({ listArticles: vi.fn() }))
vi.mock('@/api/category', () => ({ categoryStats: vi.fn(), listCategories: vi.fn() }))
vi.mock('@/api/dashboard', () => ({ listRecommendations: vi.fn(), listTodos: vi.fn() }))

const { listArticles } = await import('@/api/articles')
const { categoryStats, listCategories } = await import('@/api/category')
const { listRecommendations, listTodos } = await import('@/api/dashboard')
const HomeView = (await import('@/views/HomeView.vue')).default

const Blank = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Blank },
      { path: '/category', name: 'category', component: Blank },
      { path: '/search', name: 'search', component: Blank },
      { path: '/article/:id', name: 'article', component: Blank },
      { path: '/profile', name: 'profile', component: Blank },
    ],
  })
}

async function mountHome() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(HomeView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const article = {
  article_id: 'a1',
  source: 'ctp_kjb',
  url: 'https://example.com/a1',
  title: '最新公告',
  published_at: '2026-11-14 09:00:00',
  published_at_utc: '2026-11-14 01:00:00',
  content_length: 1000,
  category: 'project_application',
  category_confidence: 0.9,
  category_engine: 'llm',
  industry: 'next_gen_it',
  industry_confidence: 0.9,
  industry_engine: 'llm',
  tag_engine: 'llm',
  extract_engine: 'gne',
  analyzed_at: '2026-11-14 10:00:00',
  body: null,
  tags: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listArticles).mockResolvedValue({
    items: [article],
    total: 480,
    limit: 100,
    offset: 0,
    sort: 'published_desc',
    undatedExcluded: 0,
  })
  vi.mocked(categoryStats).mockResolvedValue([{ category: 'project_application', count: 101 }])
  vi.mocked(listCategories).mockResolvedValue([
    { id: 'project_application', name: '项目申报', count: 101 },
  ])
  vi.mocked(listRecommendations).mockResolvedValue({
    items: [
      {
        ...article,
        article_id: 'rec1',
        title: '推荐公告一',
        relevance: 0.92,
        relevance_reason: '匹配关注行业',
      },
      {
        ...article,
        article_id: 'rec2',
        title: '推荐公告二',
        relevance: 0.71,
        relevance_reason: '内容质量综合评分',
      },
    ],
    personalized: true,
  })
  vi.mocked(listTodos).mockResolvedValue([
    {
      article_id: 'todo1',
      title: '即将截止的申报',
      source: 'most_kjjh',
      url: 'https://example.com/todo1',
      published_at: '2026-11-10 09:00:00',
      category: 'project_application',
      category_confidence: 0.9,
      deadline: '2026-11-20',
      deadline_raw: '2026-11-20',
      days_left: 6,
    },
    {
      article_id: 'todo2',
      title: '三天内截止的申报',
      source: 'most_kjjh',
      url: 'https://example.com/todo2',
      published_at: '2026-11-10 09:00:00',
      category: 'project_application',
      category_confidence: 0.9,
      deadline: '2026-11-17',
      deadline_raw: '2026-11-17',
      days_left: 3,
    },
  ])
})

describe('HomeView 推荐与待办', () => {
  it('推荐使用后端 relevance，不再按分类置信度自算', async () => {
    const wrapper = await mountHome()
    expect(vi.mocked(listRecommendations)).toHaveBeenCalledWith(10)
    expect(wrapper.text()).toContain('按你的关注领域、收藏与浏览记录排序')
    const scores = wrapper.findAll('.rec__meta .score__value').map((node) => node.text())
    expect(scores).toEqual(['92', '71'])
  })

  it('待办卡与明细来自 /v1/todos', async () => {
    const wrapper = await mountHome()
    expect(vi.mocked(listTodos)).toHaveBeenCalledWith(5)
    const cards = wrapper.findAll('.cards__item')
    expect(cards[2].text()).toContain('2')
    expect(wrapper.text()).toContain('近期申报截止')
    expect(wrapper.text()).toContain('即将截止的申报')
    expect(wrapper.text()).toContain('三天内截止的申报')
  })

  it('匿名访问显示内容质量口径，并保留申报清单生成入口', async () => {
    vi.mocked(listRecommendations).mockResolvedValue({ items: [], personalized: false })
    const wrapper = await mountHome()
    expect(wrapper.text()).toContain('按内容质量与新鲜度排序')
    expect(wrapper.text()).toContain('申报清单生成')
  })
})
