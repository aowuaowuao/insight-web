/**
 * 单元测试：src/views/ArticleView.vue —— 规范模块四的三个强制项。
 * 1）要素缺失必须标「未提取到」（不能默默跳过留白）；
 * 2）底部「相关公告」取同分类、排除自身、最多 5 条；
 * 3）申报清单支持弹窗查看与下载。
 * 只断言用户可见结果，不碰内部实现。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { ArticleDetail } from '@/api/article'
import type { ArticleListItem } from '@/api/articles'

const getArticle = vi.fn()
const getChecklist = vi.fn()
const listArticles = vi.fn()
const listTags = vi.fn()

vi.mock('@/api/article', () => ({
  getArticle: (...args: unknown[]) => getArticle(...args),
  getChecklist: (...args: unknown[]) => getChecklist(...args),
}))
vi.mock('@/api/articles', () => ({
  listArticles: (...args: unknown[]) => listArticles(...args),
}))
vi.mock('@/api/tags', () => ({
  listTags: (...args: unknown[]) => listTags(...args),
  tagName: (defs: { id: string; name: string }[], id: string) =>
    defs.find((item) => item.id === id)?.name ?? id,
}))

import ArticleView from '@/views/ArticleView.vue'

const Blank = { template: '<div />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Blank },
      { path: '/category', name: 'category', component: Blank },
      { path: '/search', name: 'search', component: Blank },
      { path: '/article/:id', name: 'article', component: ArticleView },
    ],
  })
}

function detail(overrides: Partial<ArticleDetail> = {}): ArticleDetail {
  return {
    article_id: 'a1',
    source: 'ctp_kjb',
    url: 'https://example.com/a1',
    title: '关于组织申报2026年度科技型中小企业技术创新项目的通知',
    published_at: '2026-11-06T09:00:54+08:00',
    published_at_utc: '2026-11-06T01:00:54Z',
    content_length: 1200,
    body: '第一段正文。\n\n第二段正文。',
    category: 'project_application',
    category_confidence: 0.93,
    category_engine: 'llm',
    tag_engine: 'llm',
    extract_engine: 'llm',
    analyzed_at: '2026-11-06T10:00:00+00:00',
    tags: [{ tag: 'funding', confidence: 0.8, evidence: '补贴', engine: 'llm' }],
    extractions: {},
    ...overrides,
  }
}

function listItem(id: string): ArticleListItem {
  return {
    article_id: id,
    source: 'ctp_kjb',
    url: 'https://example.com/' + id,
    title: '同分类公告 ' + id,
    published_at: '2026-11-05T09:00:00+08:00',
    published_at_utc: '2026-11-05T01:00:00Z',
    content_length: 800,
    category: 'project_application',
    category_confidence: 0.9,
    category_engine: 'llm',
    tag_engine: 'llm',
    extract_engine: 'llm',
    analyzed_at: '2026-11-05T10:00:00+00:00',
    body: null,
    tags: [],
  }
}

async function mountView() {
  const router = makeRouter()
  await router.push('/article/a1')
  await router.isReady()
  const wrapper = mount(ArticleView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  getArticle.mockReset()
  getChecklist.mockReset()
  listArticles.mockReset()
  listTags.mockReset()
  listTags.mockResolvedValue([])
  getChecklist.mockResolvedValue(null)
  listArticles.mockResolvedValue({
    items: [],
    total: 0,
    limit: 6,
    offset: 0,
    sort: 'published_desc',
    undatedExcluded: 0,
  })
})

describe('ArticleView 关键要素', () => {
  it('抽取结果里取不到值的字段标「未提取到」，不静默留白', async () => {
    getArticle.mockResolvedValue(
      detail({
        extractions: {
          project: {
            program_name: {
              value: '科技型中小企业技术创新项目',
              raw_text: '科技型中小企业技术创新项目',
              confidence: 0.9,
              verified: true,
            },
            deadline: { value: '', raw_text: '', confidence: 0, verified: false },
          },
        },
      }),
    )
    const wrapper = await mountView()
    const values = wrapper.findAll('.field__value').map((node) => node.text())
    expect(values.some((text) => text.includes('科技型中小企业技术创新项目'))).toBe(true)
    expect(values.some((text) => text.includes('未提取到'))).toBe(true)
  })

  it('整篇没有抽取结果时按标准要素逐条列出「未提取到」', async () => {
    getArticle.mockResolvedValue(detail({ extractions: {} }))
    const wrapper = await mountView()
    const empties = wrapper.findAll('.field__empty')
    expect(empties.length).toBeGreaterThanOrEqual(8)
    expect(wrapper.find('.field__value').text()).toContain('未提取到')
  })

  it('有值时展示核验状态而不是「未提取到」', async () => {
    getArticle.mockResolvedValue(
      detail({
        extractions: {
          project: {
            deadline: {
              value: '2026-12-31',
              raw_text: '截止2026年12月31日',
              confidence: 0.7,
              verified: false,
            },
          },
        },
      }),
    )
    const wrapper = await mountView()
    expect(wrapper.find('.field__value').text()).toContain('2026-12-31')
    expect(wrapper.find('.field__value').text()).toContain('待核验')
    expect(wrapper.find('.field__empty').exists()).toBe(false)
  })
})

describe('ArticleView 相关公告', () => {
  it('按同分类取列表并排除当前文章', async () => {
    getArticle.mockResolvedValue(detail())
    listArticles.mockResolvedValue({
      items: [listItem('a1'), listItem('b2'), listItem('c3')],
      total: 3,
      limit: 6,
      offset: 0,
      sort: 'published_desc',
      undatedExcluded: 0,
    })
    const wrapper = await mountView()
    expect(listArticles).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'project_application', sort: 'published_desc' }),
    )
    const related = wrapper.findAll('.related__list .card')
    expect(related.length).toBe(2)
    expect(wrapper.text()).not.toContain('同分类公告 a1')
  })

  it('没有分类时不请求推荐，也不渲染整块', async () => {
    getArticle.mockResolvedValue(detail({ category: null }))
    const wrapper = await mountView()
    expect(listArticles).not.toHaveBeenCalled()
    expect(wrapper.find('.related').exists()).toBe(false)
  })

  it('推荐接口失败时静默不渲染，不影响正文', async () => {
    getArticle.mockResolvedValue(detail())
    listArticles.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()
    expect(wrapper.find('.related').exists()).toBe(false)
    expect(wrapper.text()).toContain('第一段正文')
  })
})

describe('ArticleView 申报清单', () => {
  const checklist = {
    article_id: 'a1',
    title: '关于组织申报2026年度科技型中小企业技术创新项目的通知',
    url: 'https://example.com/a1',
    engine: 'llm',
    generated_at: '2026-11-06T10:00:00+00:00',
    items: [
      {
        text: '准备营业执照副本',
        basis: 'excerpt' as const,
        source_text: '需提供营业执照',
        verified: true,
      },
      { text: '在线提交申报书', basis: 'suggested' as const, verified: false },
    ],
  }

  it('点「弹窗查看」打开清单弹窗', async () => {
    getArticle.mockResolvedValue(detail())
    getChecklist.mockResolvedValue(checklist)
    const wrapper = await mountView()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    const openButton = wrapper.findAll('button').find((node) => node.text() === '弹窗查看')
    expect(openButton).toBeTruthy()
    await openButton!.trigger('click')
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('准备营业执照副本')
    await wrapper.find('.modal__close').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('点「下载清单」用 Blob 生成 txt 文件', async () => {
    getArticle.mockResolvedValue(detail())
    getChecklist.mockResolvedValue(checklist)
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const wrapper = await mountView()
    const download = wrapper.findAll('button').find((node) => node.text() === '下载清单')
    expect(download).toBeTruthy()
    await download!.trigger('click')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})
