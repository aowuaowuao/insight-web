/**
 * 极简 fetch 封装：带类型、统一错误处理、超时、JSON 解析。
 * 真实项目可换成 axios，思路一致。
 */

export interface ApiError {
  status: number
  message: string
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const DEFAULT_TIMEOUT = 15_000

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** 查询参数，会自动拼到 URL 上 */
  params?: Record<string, string | number | boolean | undefined>
  /** 请求体，对象会自动 JSON 序列化 */
  body?: unknown
  /** 超时毫秒数 */
  timeout?: number
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, body, timeout = DEFAULT_TIMEOUT, headers, ...rest } = options

  // 拼接查询参数，跳过 undefined
  const url = new URL(`${BASE_URL}${path}`.replace(/([^:]\/)\/+/g, '$1'), window.location.origin)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) {
      throw new HttpError(response.status, `请求失败：${response.status} ${response.statusText}`)
    }

    // 204 无内容
    if (response.status === 204) return undefined as T

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HttpError(0, `请求超时（${timeout}ms）`)
    }
    throw new HttpError(0, error instanceof Error ? error.message : '未知网络错误')
  } finally {
    clearTimeout(timer)
  }
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
