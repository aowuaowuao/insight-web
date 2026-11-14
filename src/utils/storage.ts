/**
 * localStorage 的安全封装。
 *
 * 浏览器的隐私模式、被用户禁用存储、配额写满时，直接调 localStorage 会抛
 * QuotaExceededError / SecurityError。各页面各写一次 try/catch 会到处漏，这里统一兜住。
 * 读取失败一律当"没有值"，写入失败返回 false 由调用方决定是否提示。
 */

/** 读 JSON，解析失败或不存在返回 fallback */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 写 JSON，返回是否成功 */
export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** 读纯字符串 */
export function readText(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

/** 写纯字符串 */
export function writeText(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** 删除单个键 */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
