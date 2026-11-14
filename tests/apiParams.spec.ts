/**
 * 单元测试：src/api/search.ts 与 src/api/articles.ts 的参数拼装。
 *
 * 这两个函数是「高级搜索面板」和「分类浏览筛选器」到后端的唯一通道，
 * 参数名拼错（published_from / source / sort）不会报错，只会静默地不过滤
 * ——用户看到的是「筛了时间但结果没变」。所以逐个断言查询串。
 */
import { describe, expect, it, vi } from 'vitest'
import { http } from '@/api/http'
import { searchArticles } from '@/api/search'
import { listArticles } from '@/api/articles'

function lastUrl(spy: { mock: { calls: unknown[][] } }): string {
  const call = spy.mock.calls[spy.mock.calls.length - 1]
  return String(call[0])
}

describe('searchArticles', () => {
  it('默认只带 q / 每类条数 / 是否返回正文', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: { groups: [] } })
    await searchArticles('申报')
    const url = new URL(lastUrl(spy as never), 'http://localhost')
    expect(url.pathname).toBe('/v1/search')
    expect(url.searchParams.get('q')).toBe('申报')
    expect(url.searchParams.get('per_category')).toBe('100')
    expect(url.searchParams.get('include_body')).toBe('false')
    expect(url.searchParams.has('sort')).toBe(false)
    expect(url.searchParams.has('published_from')).toBe(false)
    expect(url.searchParams.getAll('source')).toEqual([])
    expect(url.searchParams.getAll('industry')).toEqual([])
  })

  it('时间、来源、排序都按后端参数名拼进查询串', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: { groups: [] } })
    await searchArticles('申报', {
      sources: ['ctp_kjb', 'shpolicy_ssme'],
      publishedFrom: '2026-09-01',
      publishedTo: '2026-10-31',
      sort: 'published_desc',
      categories: ['project_application'],
      industries: ['next_gen_it'],
    })
    const url = new URL(lastUrl(spy as never), 'http://localhost')
    expect(url.searchParams.getAll('source')).toEqual(['ctp_kjb', 'shpolicy_ssme'])
    expect(url.searchParams.get('published_from')).toBe('2026-09-01')
    expect(url.searchParams.get('published_to')).toBe('2026-10-31')
    expect(url.searchParams.get('sort')).toBe('published_desc')
    expect(url.searchParams.getAll('category')).toEqual(['project_application'])
    expect(url.searchParams.getAll('industry')).toEqual(['next_gen_it'])
  })

  it('空来源数组不产生 source 参数（不能退化成筛一个空站点）', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: { groups: [] } })
    await searchArticles('申报', { sources: [] })
    const url = new URL(lastUrl(spy as never), 'http://localhost')
    expect(url.searchParams.has('source')).toBe(false)
  })
})

describe('listArticles', () => {
  it('默认参数与 meta 映射', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [],
      meta: {
        total: 0,
        limit: 20,
        offset: 0,
        sort: 'published_desc',
        undated_excluded: 0,
      },
    })
    const page = await listArticles()
    const url = new URL(lastUrl(spy as never), 'http://localhost')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('offset')).toBe('0')
    expect(page).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      sort: 'published_desc',
      undatedExcluded: 0,
    })
  })

  it('筛选与排序参数逐个落到查询串', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [],
      meta: {
        total: 143,
        limit: 50,
        offset: 50,
        sort: 'published_asc',
        undated_excluded: 2,
      },
    })
    const page = await listArticles({
      category: 'project_application',
      sources: ['ndrc_tz'],
      industry: 'new_materials',
      publishedFrom: '2026-08-01',
      publishedTo: '2026-11-30',
      sort: 'published_asc',
      limit: 50,
      offset: 50,
    })
    const url = new URL(lastUrl(spy as never), 'http://localhost')
    expect(url.searchParams.get('category')).toBe('project_application')
    expect(url.searchParams.getAll('source')).toEqual(['ndrc_tz'])
    expect(url.searchParams.get('industry')).toBe('new_materials')
    expect(url.searchParams.get('published_from')).toBe('2026-08-01')
    expect(url.searchParams.get('published_to')).toBe('2026-11-30')
    expect(url.searchParams.get('sort')).toBe('published_asc')
    expect(page.total).toBe(143)
    expect(page.undatedExcluded).toBe(2)
    expect(page.sort).toBe('published_asc')
  })
})
