/**
 * 单元测试：src/api/{article,category,tags}.ts
 *
 * 这三个模块是详情页与分类页的数据入口。约定藏在细节里：
 * 清单接口用 404 表示「还没生成」而不是错误；标签词表缓存后不再请求；
 * 词表查不到标签时要退回 id（否则界面上出现空白标签）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { http, HttpError } from '@/api/http'
import { getArticle, getChecklist, type ArticleDetail, type ArticleChecklist } from '@/api/article'
import { categoryStats, listCategories, type CategoryDef, type CategoryStat } from '@/api/category'
import { listTags, resetTagCache, tagName, type TagDef } from '@/api/tags'

const DETAIL: ArticleDetail = {
  article_id: 'abc123',
  source: 'ctp_kjb',
  url: 'https://example.com/a.html',
  title: '关于开展 2026 年度项目申报的通知',
  published_at: '2026-11-13 09:00:00',
  published_at_utc: '2026-11-13 01:00:00',
  content_length: 1200,
  body: '正文',
  category: 'project_application',
  category_confidence: 0.91,
  category_engine: 'llm',
  tag_engine: 'llm',
  extract_engine: 'llm',
  analyzed_at: '2026-11-13 10:00:00',
  tags: [{ tag: 'apply_deadline', confidence: 0.8, evidence: '截止 11 月 30 日', engine: 'llm' }],
  extractions: {},
}

describe('getArticle', () => {
  it('按 id 拉详情并对 id 做 URL 编码', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: DETAIL })
    await expect(getArticle('abc/123')).resolves.toEqual(DETAIL)
    expect(spy).toHaveBeenCalledWith('/v1/articles/abc%2F123')
  })
})

describe('getChecklist', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('有清单时返回清单', async () => {
    const checklist: ArticleChecklist = {
      article_id: 'abc123',
      title: '通知',
      url: 'https://example.com/a.html',
      engine: 'llm',
      generated_at: '2026-11-13 10:00:00',
      items: [{ text: '营业执照副本', basis: 'excerpt', verified: true }],
    }
    vi.spyOn(http, 'get').mockResolvedValue({ data: checklist })
    await expect(getChecklist('abc123')).resolves.toEqual(checklist)
  })

  it('404 视为「尚未生成清单」，返回 null 而不是抛错', async () => {
    vi.spyOn(http, 'get').mockRejectedValue(new HttpError(404, '清单不存在'))
    await expect(getChecklist('abc123')).resolves.toBeNull()
  })

  it('其它错误照旧抛出，不能被当成没有清单', async () => {
    vi.spyOn(http, 'get').mockRejectedValue(new HttpError(500, '后端炸了'))
    await expect(getChecklist('abc123')).rejects.toThrow('后端炸了')
  })

  it('非 HttpError 的异常（如取消）也要抛出', async () => {
    vi.spyOn(http, 'get').mockRejectedValue(new Error('掉线'))
    await expect(getChecklist('abc123')).rejects.toThrow('掉线')
  })
})

describe('category', () => {
  it('listCategories 返回大类定义', async () => {
    const defs: CategoryDef[] = [
      {
        id: 'project_application',
        name: '项目申报',
        description: '各类项目申报通知',
        keywords: ['申报'],
        tags: ['apply_deadline'],
        article_count: 120,
      },
    ]
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: defs })
    await expect(listCategories()).resolves.toEqual(defs)
    expect(spy).toHaveBeenCalledWith('/v1/categories')
  })

  it('categoryStats 返回分类统计', async () => {
    const stats: CategoryStat[] = [
      { category: 'project_application', count: 120, avg_confidence: 0.88 },
    ]
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: stats })
    await expect(categoryStats()).resolves.toEqual(stats)
    expect(spy).toHaveBeenCalledWith('/v1/categories/stats')
  })
})

describe('tags', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetTagCache()
  })

  it('加载词表并缓存，第二次不再请求', async () => {
    const defs: TagDef[] = [
      {
        id: 'apply_deadline',
        name: '申报截止时间',
        group: '要素',
        keywords: [],
        article_count: 30,
      },
    ]
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: defs })
    await expect(listTags()).resolves.toEqual(defs)
    await expect(listTags()).resolves.toEqual(defs)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('data 缺失时退回空数组', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({} as { data: TagDef[] })
    await expect(listTags()).resolves.toEqual([])
  })

  it('tagName 命中词表用中文名，查不到退回 id', async () => {
    const defs: TagDef[] = [
      {
        id: 'apply_deadline',
        name: '申报截止时间',
        group: '要素',
        keywords: [],
        article_count: 30,
      },
    ]
    expect(tagName(defs, 'apply_deadline')).toBe('申报截止时间')
    expect(tagName(defs, 'unknown_tag')).toBe('unknown_tag')
    expect(tagName([], 'apply_deadline')).toBe('apply_deadline')
  })
})
