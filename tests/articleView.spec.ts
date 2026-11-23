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
import ArticleCard from '@/components/ArticleCard.vue'

const getArticle = vi.fn()
const getChecklist = vi.fn()
const generateChecklist = vi.fn()
const listArticles = vi.fn()
const listTags = vi.fn()
const addFavorite = vi.fn()
const removeFavorite = vi.fn()

vi.mock('@/api/account', () => ({
  addFavorite: (...args: unknown[]) => addFavorite(...args),
  removeFavorite: (...args: unknown[]) => removeFavorite(...args),
}))
vi.mock('@/api/article', () => ({
  getArticle: (...args: unknown[]) => getArticle(...args),
  getChecklist: (...args: unknown[]) => getChecklist(...args),
  generateChecklist: (...args: unknown[]) => generateChecklist(...args),
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
    relevance_score: 0.91,
    relevance_engine: 'llm',
    relevance_reason: '含申报截止时间与资助额度，信息具体可行动。',
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
    relevance_score: 0.88,
    relevance_reason: '同分类高相关公告，含截止时间。',
  }
}

async function mountViewWithRouter(path = '/article/a1') {
  const router = makeRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(ArticleView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

async function mountView() {
  return (await mountViewWithRouter()).wrapper
}

beforeEach(() => {
  getArticle.mockReset()
  getChecklist.mockReset()
  generateChecklist.mockReset()
  listArticles.mockReset()
  listTags.mockReset()
  addFavorite.mockReset()
  removeFavorite.mockReset()
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
          project_application: {
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
          project_application: {
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
    const deadlineValue = wrapper
      .findAll('.field__value')
      .find((node) => node.text().includes('2026-12-31'))
    expect(deadlineValue).toBeTruthy()
    expect(deadlineValue!.text()).toContain('待核验')
    expect(deadlineValue!.text()).not.toContain('未提取到')
    // 其他标准要素仍要显式提示缺失，不能因为只有 deadline 有值就少行
    expect(wrapper.findAll('.field__empty').length).toBeGreaterThanOrEqual(8)
  })

  it('长关键信息只展示摘要，完整值保留在 title 中', async () => {
    const longValue = '长'.repeat(240)
    getArticle.mockResolvedValue(
      detail({
        category: 'industry_policy',
        extractions: {
          industry_policy: {
            key_measures: {
              value: longValue,
              raw_text: longValue,
              confidence: 0.9,
              verified: true,
            },
          },
        },
      }),
    )
    const wrapper = await mountView()
    const field = wrapper.findAll('.field__value').find((node) => node.text().startsWith('长'))
    expect(field).toBeTruthy()
    expect(field!.text()).not.toContain(longValue)
    expect(field!.attributes('title')).toBe(longValue)
  })

  it('行业政策按本类字段展示，不套用项目申报模板', async () => {
    getArticle.mockResolvedValue(
      detail({
        category: 'industry_policy',
        extractions: {
          industry_policy: {
            policy_name: {
              value: '关于促进人工智能产业发展的若干措施',
              raw_text: '关于促进人工智能产业发展的若干措施',
              confidence: 0.9,
              verified: true,
            },
            document_number: {
              value: '沪科规〔2026〕1号',
              raw_text: '沪科规〔2026〕1号',
              confidence: 0.8,
              verified: true,
            },
          },
        },
      }),
    )
    const wrapper = await mountView()
    const text = wrapper.text()
    expect(text).toContain('政策名称')
    expect(text).toContain('文号')
    expect(text).toContain('关于促进人工智能产业发展的若干措施')
    expect(text).not.toContain('项目名称')
  })

  it('行业政策没有抽取结果时按本类标准字段铺空，不显示项目申报字段', async () => {
    getArticle.mockResolvedValue(detail({ category: 'industry_policy', extractions: {} }))
    const wrapper = await mountView()
    expect(wrapper.findAll('.field__empty').length).toBeGreaterThanOrEqual(9)
    expect(wrapper.text()).not.toContain('项目名称')
  })

  it('行业政策旧数据只有项目申报块时也不套用项目模板', async () => {
    getArticle.mockResolvedValue(
      detail({
        category: 'industry_policy',
        extractions: {
          project_application: {
            program_name: {
              value: '旧项目名称',
              raw_text: '旧项目名称',
              confidence: 0.8,
              verified: true,
            },
          },
        },
      }),
    )
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('项目名称')
    expect(wrapper.text()).not.toContain('旧项目名称')
    expect(wrapper.findAll('.field__empty').length).toBeGreaterThanOrEqual(9)
  })
})

describe('ArticleView 相关度展示', () => {
  it('高相关展示 AI 要素摘要，并保留关键信息卡', async () => {
    getArticle.mockResolvedValue(detail())
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('AI 要素摘要')
    expect(wrapper.text()).toContain('含申报截止时间与资助额度')
    expect(wrapper.find('.fields').exists()).toBe(true)
  })

  it('低相关不展示 AI 要素摘要，但关键信息仍照常展示', async () => {
    getArticle.mockResolvedValue(
      detail({ relevance_score: 0.5, relevance_reason: '一般性政策动态。' }),
    )
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('AI 要素摘要')
    expect(wrapper.find('.fields').exists()).toBe(true)
  })

  it('高相关但摘要只有空白字符时不渲染空摘要卡', async () => {
    getArticle.mockResolvedValue(detail({ relevance_score: 0.95, relevance_reason: '   ' }))
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('AI 要素摘要')
    expect(wrapper.find('.fields').exists()).toBe(true)
  })
})

describe('ArticleView 正文与收藏', () => {
  it('优先渲染后端清洗后的 body_html，并生成目录锚点', async () => {
    getArticle.mockResolvedValue(
      detail({
        body_html:
          '<h2>申报条件</h2><p>第一段。</p><h3>材料要求</h3><table><tr><td>营业执照</td></tr></table>',
      }),
    )
    const wrapper = await mountView()
    const body = wrapper.find('.body--rich')
    expect(body.find('h2').text()).toBe('申报条件')
    expect(body.find('table').text()).toContain('营业执照')
    expect(wrapper.findAll('.toc__item').map((node) => node.text())).toEqual([
      '申报条件',
      '材料要求',
    ])
    expect(body.find('h2').attributes('id')).toBe('section-1')
  })

  it('后端没有 body_html 时用 MarkdownIt 渲染纯文本并转义 HTML', async () => {
    getArticle.mockResolvedValue(detail({ body: '第一行<script>alert(1)</script>\n第二行' }))
    const wrapper = await mountView()
    const body = wrapper.find('.body--rich')
    expect(body.text()).toContain('第一行')
    expect(body.find('script').exists()).toBe(false)
    expect(body.html()).toContain('&lt;script&gt;')
  })

  it('收藏按钮调用真实接口并反映 is_favorite 初始态', async () => {
    getArticle.mockResolvedValue(detail({ is_favorite: true }))
    const wrapper = await mountView()
    const button = wrapper.find('.head__actions .btn')
    expect(button.text()).toContain('已收藏')

    removeFavorite.mockResolvedValue(undefined)
    await button.trigger('click')
    await flushPromises()
    expect(removeFavorite).toHaveBeenCalledWith('a1')
    expect(button.text()).toContain('收藏')
    expect(button.text()).not.toContain('已收藏')
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
    const relatedCards = wrapper.findAllComponents(ArticleCard)
    expect(relatedCards[0]!.props('score')).toBe(0.88)
    expect(relatedCards[0]!.props('summary')).toContain('同分类高相关公告')
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
  function projectDetail(): ArticleDetail {
    return detail({
      tags: [{ tag: 'project_application', confidence: 0.95, evidence: '申报', engine: 'llm' }],
      extractions: {
        project_application: {
          program_name: {
            value: '科技型中小企业技术创新项目',
            raw_text: '科技型中小企业技术创新项目',
            confidence: 0.9,
            verified: true,
          },
        },
      },
    })
  }

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
    getArticle.mockResolvedValue(projectDetail())
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
    getArticle.mockResolvedValue(projectDetail())
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

  it('没有清单但命中申报标签时可生成，并打开生成结果', async () => {
    getArticle.mockResolvedValue(projectDetail())
    getChecklist.mockResolvedValue(null)
    generateChecklist.mockResolvedValue(checklist)
    const wrapper = await mountView()
    const button = wrapper.findAll('button').find((node) => node.text() === '生成申报清单')
    expect(button).toBeTruthy()
    await button!.trigger('click')
    await flushPromises()
    expect(generateChecklist).toHaveBeenCalledWith('a1', false)
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('准备营业执照副本')
  })

  it('已有清单时可强制重新生成', async () => {
    getArticle.mockResolvedValue(projectDetail())
    getChecklist.mockResolvedValue(checklist)
    generateChecklist.mockResolvedValue(checklist)
    const wrapper = await mountView()
    const button = wrapper.findAll('button').find((node) => node.text() === '重新生成')
    expect(button).toBeTruthy()
    await button!.trigger('click')
    await flushPromises()
    expect(generateChecklist).toHaveBeenCalledWith('a1', true)
  })

  it('生成失败时在清单卡片内显示后端错误，不把整页打回错误态', async () => {
    getArticle.mockResolvedValue(projectDetail())
    getChecklist.mockResolvedValue(null)
    generateChecklist.mockRejectedValue(new Error('该文章不是项目申报类，无法生成清单'))
    const wrapper = await mountView()
    const button = wrapper.findAll('button').find((node) => node.text() === '生成申报清单')
    await button!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.card__error').text()).toContain('无法生成清单')
    expect(wrapper.text()).toContain('第一段正文')
  })

  it('非申报文章不显示申报清单区块，也不请求清单接口', async () => {
    getArticle.mockResolvedValue(detail())
    getChecklist.mockResolvedValue(null)
    const wrapper = await mountView()
    expect(wrapper.findAll('button').some((node) => node.text().includes('生成申报清单'))).toBe(
      false,
    )
    expect(wrapper.text()).not.toContain('申报准备清单')
    expect(getChecklist).not.toHaveBeenCalled()
  })

  it('生成期间切换文章时丢弃上一篇文章的迟到响应', async () => {
    let resolveGenerate!: (value: unknown) => void
    generateChecklist.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve
      }),
    )
    getArticle.mockImplementation((id: string) =>
      Promise.resolve(
        detail({
          article_id: id,
          title: id === 'a1' ? 'A 文章' : 'B 文章',
          tags: [{ tag: 'project_application', confidence: 0.95, evidence: '申报', engine: 'llm' }],
          extractions: {
            project_application: {
              program_name: {
                value: '项目',
                raw_text: '项目',
                confidence: 0.9,
                verified: true,
              },
            },
          },
        }),
      ),
    )
    getChecklist.mockResolvedValue(null)

    const { wrapper, router } = await mountViewWithRouter()
    const button = wrapper.findAll('button').find((node) => node.text() === '生成申报清单')
    expect(button).toBeTruthy()
    await button!.trigger('click')

    await router.push('/article/b2')
    await flushPromises()
    expect(wrapper.text()).toContain('B 文章')

    resolveGenerate({
      ...checklist,
      article_id: 'a1',
      items: [{ text: 'A-ITEM', basis: 'excerpt' }],
    })
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('A-ITEM')
  })

  it('生成成功后，迟到的初始 GET 404 不会清空新清单', async () => {
    let resolveInitialChecklist!: (value: unknown) => void
    getChecklist.mockReturnValue(
      new Promise((resolve) => {
        resolveInitialChecklist = resolve
      }),
    )
    getArticle.mockResolvedValue(projectDetail())
    generateChecklist.mockResolvedValue(checklist)

    const { wrapper } = await mountViewWithRouter()
    const button = wrapper.findAll('button').find((node) => node.text() === '生成申报清单')
    expect(button).toBeTruthy()
    await button!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').text()).toContain('准备营业执照副本')

    resolveInitialChecklist(null)
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('准备营业执照副本')
  })

  it('命中申报标签但缺少抽取要素时说明无法生成', async () => {
    getArticle.mockResolvedValue(
      detail({
        tags: [{ tag: 'project_application', confidence: 0.9, evidence: '申报', engine: 'llm' }],
        extractions: {},
      }),
    )
    getChecklist.mockResolvedValue(null)
    const wrapper = await mountView()
    expect(wrapper.findAll('button').some((node) => node.text().includes('生成申报清单'))).toBe(
      false,
    )
    expect(wrapper.text()).toContain('暂无法生成清单')
  })
})
