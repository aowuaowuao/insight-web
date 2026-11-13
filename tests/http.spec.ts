import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpError, pendingRequests, request } from '@/api/http'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('http 重试策略', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET 遇到 503 会重试两次，共请求三次', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: '服务忙' } }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(http.get('/v1/tags', { retries: 2 })).rejects.toBeInstanceOf(HttpError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('POST 默认不重试：非幂等写接口重发会多跑一次分析', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: '服务忙' } }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(http.post('/v1/analyze', { limit: 1 })).rejects.toBeInstanceOf(HttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('POST 传了 retries 也不重试', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: '服务忙' } }, 502))
    vi.stubGlobal('fetch', fetchMock)

    await expect(http.post('/v1/jobs', {}, { retries: 5 })).rejects.toBeInstanceOf(HttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('401 不重试，并提示配置 INSIGHT_API_KEY', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    vi.stubGlobal('fetch', fetchMock)

    await expect(http.get('/v1/articles')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(http.get('/v1/articles')).rejects.toThrow(/INSIGHT_API_KEY/)
  })

  it('GET 成功时解析 JSON，并在结束后把 loading 计数归零', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'a' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await request<{ data: { id: string }[] }>('/v1/categories')
    expect(result.data[0].id).toBe('a')
    expect(pendingRequests()).toBe(0)
  })

  it('外部取消抛 HttpError(0) 且不再重试', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn().mockImplementation(() => {
      throw new DOMException('aborted', 'AbortError')
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(http.get('/v1/tags', { signal: controller.signal })).rejects.toMatchObject({
      status: 0,
      message: '请求已取消',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
