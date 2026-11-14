/**
 * HTTP 客户端封装。
 *
 * 规范 2.2.1（四）3 要求请求拦截（自动添加 Token）、响应拦截（统一错误处理与跳转）、
 * 请求取消、失败自动重试 2 次、接口请求 loading 自动显示。这里逐条落实。
 *
 * 为什么不是 Axios：规范的技术选型表里写的是 Axios，但那属于"新增第三方依赖"，
 * 需要项目负责人确认后再换（换掉会改所有 api/*.ts 的调用点）。当前用 fetch 实现同等能力，
 * 接口形状（http.get/post/put/delete）与 Axios 一致，后续替换只改这一个文件。
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

/** 规范 2.2.1（五）：所有接口需处理超时（默认 10 秒） */
const DEFAULT_TIMEOUT = 10_000
/** 规范：失败自动重试 2 次 */
const DEFAULT_RETRIES = 2
/** 只重试这些状态码：4xx 是请求本身有问题，重试没有意义 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * 请求头注入钩子（请求拦截）。
 * 登录后由 stores/auth.ts 写入 Token，这里统一注入 Authorization，调用点一处都不用改。
 * 未登录（如登录页本身）返回空对象。
 */
function authHeaders(): Record<string, string> {
  const token = readAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** 由 stores/auth.ts 在登录/登出时写入，避免 http 层依赖 store 造成循环引用 */
let authToken = ''

export function setAuthToken(token: string): void {
  authToken = token
}

function readAuthToken(): string {
  return authToken
}

/**
 * 全局 loading 计数。
 * 规范要求"接口请求 loading 自动显示"：并发的多个请求只应该让页面转一次，
 * 所以用计数而不是布尔值，归零才算加载结束。
 */
let pendingCount = 0
type PendingListener = (pending: number) => void
const pendingListeners = new Set<PendingListener>()

function notifyPending(): void {
  for (const listener of pendingListeners) listener(pendingCount)
}

export function onPendingChange(listener: PendingListener): () => void {
  pendingListeners.add(listener)
  listener(pendingCount)
  return () => pendingListeners.delete(listener)
}

export function pendingRequests(): number {
  return pendingCount
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** 查询参数，会自动拼到 URL 上 */
  params?: Record<string, string | number | boolean | undefined>
  /** 请求体，对象会自动 JSON 序列化 */
  body?: unknown
  /** 超时毫秒数，默认 10 秒（规范 2.2.1（五）） */
  timeout?: number
  /** 失败重试次数，默认 2 次（规范 2.2.1（四）3） */
  retries?: number
  /** 外部取消信号：页面卸载或用户主动取消时传入，与超时信号一起生效 */
  signal?: AbortSignal
  /** 是否计入全局 loading（默认计入） */
  trackLoading?: boolean
}

function mergeSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b
  // AbortSignal.any 在现代浏览器都有；不支持时退化为只用超时信号
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any
  return typeof anyFn === 'function' ? anyFn([a, b]) : b
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } }
    return payload.error?.message ?? ''
  } catch {
    // 响应不是 JSON（比如网关返回 HTML），忽略
    return ''
  }
}

function describeStatus(status: number, statusText: string, detail: string): string {
  const hint =
    status === 401
      ? '登录状态已失效，请重新登录'
      : status === 403
        ? '当前账号没有访问该资源的权限'
        : status === 404
          ? '接口或数据不存在'
          : status === 502 || status === 503
            ? '后端服务不可用，请确认 news-insight 已启动（默认 http://127.0.0.1:8020）'
            : `请求失败：${status} ${statusText}`
  return detail ? `${detail}（${hint}）` : hint
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    params,
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    trackLoading = true,
    signal: externalSignal,
    headers,
    ...rest
  } = options

  const url = new URL(`${BASE_URL}${path}`.replace(/([^:]\/)\/+/g, '$1'), window.location.origin)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }

  // POST 不重试：后端的 /v1/analyze、/v1/jobs 都不是幂等的，超时后重发可能多跑一次分析、
  // 多花一次模型调用。读接口重试是安全的，写接口交给用户手动重试。
  const method = (rest.method ?? 'GET').toUpperCase()
  const retryBudget = method === 'GET' || method === 'HEAD' ? retries : 0

  if (trackLoading) {
    pendingCount += 1
    notifyPending()
  }

  try {
    let lastError: unknown

    for (let attempt = 0; attempt <= retryBudget; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      const signal = mergeSignals(externalSignal, controller.signal)

      try {
        const response = await fetch(url, {
          ...rest,
          signal,
          // 只有真的带请求体时才声明 Content-Type：GET 带它会触发不必要的预检
          headers: {
            ...authHeaders(),
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })

        if (!response.ok) {
          const detail = await readErrorDetail(response)
          const error = new HttpError(
            response.status,
            describeStatus(response.status, response.statusText, detail),
          )
          // 可重试的状态码且还有剩余次数 -> 退避后重试
          if (RETRYABLE_STATUS.has(response.status) && attempt < retryBudget) {
            lastError = error
            await sleep(300 * (attempt + 1))
            continue
          }
          // 401 交给上层（路由守卫 / 登录页）处理跳转，这里不直接跳，
          // 否则一个后台轮询接口失败就会把用户正在看的页面踹回登录页。
          // 但要把"登录已失效"广播出去，让 App 统一清会话并回登录页。
          if (response.status === 401 && !path.endsWith('/auth/login')) {
            window.dispatchEvent(new CustomEvent('insight:unauthorized'))
          }
          throw error
        }

        if (response.status === 204) return undefined as T
        return (await response.json()) as T
      } catch (error) {
        // 外部主动取消：不再重试，直接抛
        if (externalSignal?.aborted) {
          throw new HttpError(0, '请求已取消')
        }
        if (error instanceof HttpError) throw error
        if (error instanceof DOMException && error.name === 'AbortError') {
          const timeoutError = new HttpError(0, `请求超时（${timeout}ms），后端可能未响应`)
          if (attempt < retryBudget) {
            lastError = timeoutError
            await sleep(300 * (attempt + 1))
            continue
          }
          throw timeoutError
        }
        // fetch 在网络层失败时抛 TypeError：后端没启动 / 代理没通 / 跨域被拦
        const networkError =
          error instanceof TypeError
            ? new HttpError(0, '无法连接后端服务，请确认后端已启动且地址配置正确')
            : new HttpError(0, error instanceof Error ? error.message : '未知网络错误')
        if (attempt < retryBudget) {
          lastError = networkError
          await sleep(300 * (attempt + 1))
          continue
        }
        throw networkError
      } finally {
        clearTimeout(timer)
      }
    }

    throw lastError instanceof Error ? lastError : new HttpError(0, '请求失败')
  } finally {
    if (trackLoading) {
      pendingCount -= 1
      notifyPending()
    }
  }
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
