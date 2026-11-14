/**
 * 单元测试：src/api/dashboard.ts
 *
 * 首页的推荐与待办都直接决定第三张卡和 Top10 是否可信：
 * 推荐必须把后端 meta.personalized 透出给界面，待办必须把 data 摊平。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { http } from '@/api/http'
import { listRecommendations, listTodos, type TodoItem } from '@/api/dashboard'

const TODO: TodoItem = {
  article_id: 'a1',
  title: '关于开展 2026 年度项目申报的通知',
  source: 'shpolicy_ssme',
  url: 'https://example.com/a1.html',
  published_at: '2026-11-13 09:00:00',
  category: 'project_application',
  category_confidence: 0.92,
  deadline: '2026-11-30',
  deadline_raw: '2026年11月30日',
  days_left: 16,
}

describe('listRecommendations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('透传 limit 并返回 items 与 personalized', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 10, personalized: true },
    })
    await expect(listRecommendations(10)).resolves.toEqual({ items: [], personalized: true })
    expect(spy).toHaveBeenCalledWith('/v1/recommendations', { params: { limit: 10 } })
  })
})

describe('listTodos', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('返回待办列表、总数并透传 limit', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({
      data: [TODO],
      meta: { total: 22, limit: 5 },
    })
    await expect(listTodos(5)).resolves.toEqual({ items: [TODO], total: 22 })
    expect(spy).toHaveBeenCalledWith('/v1/todos', { params: { limit: 5 } })
  })

  it('meta 缺失时用当前页条数兜底', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({ data: [TODO] })
    await expect(listTodos(5)).resolves.toEqual({ items: [TODO], total: 1 })
  })
})
