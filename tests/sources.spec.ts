/**
 * 单元测试：src/api/sources.ts
 *
 * 来源列表是全站筛选器的基础：缓存策略错了会让用户点了「刷新」仍看到旧站点，
 * 并发请求不收口则同一屏会打两次接口。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { http } from '@/api/http'
import { listSources, resetSourceCache, type SourceStat } from '@/api/sources'

const SAMPLE: SourceStat[] = [
  {
    source: 'ctp_kjb',
    count: 235,
    avg_confidence: 0.829,
    latest_published_at: '2026-11-13T04:04:04Z',
  },
  {
    source: 'shpolicy_ssme',
    count: 196,
    avg_confidence: 0.864,
    latest_published_at: '2026-11-10T04:00:00Z',
  },
]

describe('listSources', () => {
  beforeEach(() => {
    resetSourceCache()
  })

  it('返回后端给的来源统计', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: SAMPLE })
    await expect(listSources()).resolves.toEqual(SAMPLE)
    expect(spy).toHaveBeenCalledWith('/v1/sources')
  })

  it('命中缓存后不再请求后端', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: SAMPLE })
    await listSources()
    await listSources()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('force=true 会重新请求，保证「刷新数据」能拿到新来源', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: SAMPLE })
    await listSources()
    await listSources(true)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('并发调用共用同一个在飞请求', async () => {
    const spy = vi.spyOn(http, 'get').mockResolvedValue({ data: SAMPLE })
    const [a, b] = await Promise.all([listSources(), listSources()])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('请求失败不写缓存，下次还能重试', async () => {
    const spy = vi
      .spyOn(http, 'get')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: SAMPLE })
    await expect(listSources()).rejects.toThrow('boom')
    await expect(listSources()).resolves.toEqual(SAMPLE)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('data 缺失时退回空数组，不把 undefined 当列表', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({} as { data: SourceStat[] })
    await expect(listSources()).resolves.toEqual([])
  })
})
