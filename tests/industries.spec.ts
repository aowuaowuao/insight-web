/**
 * 单元测试：src/api/industries.ts
 *
 * 行业候选取自后端受控词表（app/vocab/industries.json），前端不写死；
 * 缓存与在飞请求合并的行为必须与 sources 一致，否则同一屏会发两次请求。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from '@/api/http'
import { listIndustries, resetIndustryCache, type IndustryStat } from '@/api/industries'

const ITEMS: IndustryStat[] = [
  {
    id: 'next_gen_it',
    name: '新一代信息技术',
    description: '集成电路、人工智能、软件与信息服务',
    keywords: ['人工智能', '集成电路'],
    article_count: 112,
  },
  {
    id: 'other',
    name: '其他',
    description: '未归入受控行业的公告',
    keywords: [],
    article_count: 176,
  },
]

beforeEach(() => {
  vi.restoreAllMocks()
  resetIndustryCache()
})

describe('listIndustries', () => {
  it('加载并缓存，第二次不再请求', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: ITEMS })
    await expect(listIndustries()).resolves.toEqual(ITEMS)
    await expect(listIndustries()).resolves.toEqual(ITEMS)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('/v1/industries')
  })

  it('force=true 绕过缓存重新取数', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: ITEMS })
    await listIndustries()
    await listIndustries(true)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('data 缺失时退回空数组', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({} as { data: IndustryStat[] })
    await expect(listIndustries()).resolves.toEqual([])
  })
})
