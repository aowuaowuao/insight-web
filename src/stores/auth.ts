import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { readJson, readText, removeKey, writeJson, writeText } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { setAuthToken } from '@/api/http'
import { HttpError } from '@/api/http'
import { login as loginApi, logout as logoutApi, me as meApi, type AuthUser } from '@/api/auth'

/**
 * 登录状态管理（真实后端会话 Token）。
 *
 * 规范 2.2.1（二）模块一：
 * - 用户名密码必填、密码长度不少于 6 位 —— LoginView 表单校验
 * - 连续 5 次登录失败锁定 15 分钟 —— 后端 app/main.py LOGIN_MAX_ATTEMPTS/LOGIN_LOCK_MINUTES，
 *   前端在收到 423 时同步本地锁定展示；错误提示由后端统一返回"用户名或密码错误，还可尝试 N 次"
 * - Token 维持登录态 —— token 存 localStorage，并通过 setAuthToken 注入 Authorization: Bearer
 * - 账号不存在/密码错误/网络异常分别提示 —— 后端出于安全统一返回 401；网络异常由前端单独兜底
 */

/** 连续失败多少次后锁定（规范：5 次，与后端常量一致） */
export const MAX_LOGIN_ATTEMPTS = 5
/** 锁定时长（规范：15 分钟，与后端常量一致） */
export const LOCK_DURATION_MS = 15 * 60 * 1000

interface LockState {
  failed: number
  /** 解锁时间戳（毫秒）；0 或已过期都算未锁 */
  lockedUntil: number
}

function readLockState(): LockState {
  const raw = readJson<Partial<LockState>>(STORAGE_KEYS.AUTH_LOCK, {})
  return {
    failed: typeof raw.failed === 'number' && raw.failed > 0 ? raw.failed : 0,
    lockedUntil: typeof raw.lockedUntil === 'number' && raw.lockedUntil > 0 ? raw.lockedUntil : 0,
  }
}

export type LoginFailureReason = 'empty' | 'not-found' | 'wrong-password' | 'locked' | 'network'

export interface LoginResult {
  ok: boolean
  message: string
  reason?: LoginFailureReason
  /** 锁定时剩余秒数，供界面倒计时 */
  remainingSeconds?: number
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(readText(STORAGE_KEYS.AUTH_TOKEN))
  const user = ref<AuthUser | null>(readJson<AuthUser | null>(STORAGE_KEYS.AUTH_USER, null))
  const lockState = ref<LockState>(readLockState())

  // 页面刷新后把持久化 Token 重新注入请求头；没有 Token 时保持空
  if (token.value) setAuthToken(token.value)

  const username = computed(() => user.value?.username ?? '')
  const displayName = computed(() => user.value?.display_name || user.value?.username || '')
  const role = computed(() => user.value?.role ?? '')
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isLoggedIn = computed(() => Boolean(token.value && user.value))

  /** 定时器驱动的"当前时间"，让锁定倒计时可以每秒重算 */
  const clock = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null

  function stopTicker(): void {
    if (ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function startTicker(): void {
    if (ticker !== null) return
    ticker = setInterval(() => {
      clock.value = Date.now()
      if (lockState.value.lockedUntil > 0 && clock.value >= lockState.value.lockedUntil) {
        stopTicker()
      }
    }, 1000)
  }

  const isLocked = computed(() => {
    void clock.value
    const until = lockState.value.lockedUntil
    return until > 0 && clock.value < until
  })

  const lockRemainingSeconds = computed(() => {
    void clock.value
    const until = lockState.value.lockedUntil
    if (until <= 0) return 0
    return Math.max(0, Math.ceil((until - clock.value) / 1000))
  })

  const remainingAttempts = computed(() => Math.max(0, MAX_LOGIN_ATTEMPTS - lockState.value.failed))

  function persistLock(next: LockState): void {
    lockState.value = next
    writeJson(STORAGE_KEYS.AUTH_LOCK, next)
  }

  function resetLock(): void {
    persistLock({ failed: 0, lockedUntil: 0 })
  }

  function persistSession(nextToken: string, nextUser: AuthUser): void {
    token.value = nextToken
    user.value = nextUser
    writeText(STORAGE_KEYS.AUTH_TOKEN, nextToken)
    writeJson(STORAGE_KEYS.AUTH_USER, nextUser)
    setAuthToken(nextToken)
  }

  /** 清掉本地会话；不发请求（logout() 负责通知后端） */
  function clearSession(): void {
    token.value = ''
    user.value = null
    setAuthToken('')
    removeKey(STORAGE_KEYS.AUTH_TOKEN)
    removeKey(STORAGE_KEYS.AUTH_USER)
  }

  async function login(name: string, password: string): Promise<LoginResult> {
    const trimmed = name.trim()

    if (!trimmed || !password) {
      return { ok: false, message: '请输入用户名和密码', reason: 'empty' }
    }

    if (isLocked.value) {
      const seconds = lockRemainingSeconds.value
      const minutes = Math.ceil(seconds / 60)
      return {
        ok: false,
        message: `连续 ${MAX_LOGIN_ATTEMPTS} 次登录失败，账号已临时锁定，请 ${minutes} 分钟后再试`,
        reason: 'locked',
        remainingSeconds: seconds,
      }
    }

    if (lockState.value.lockedUntil > 0) resetLock()

    try {
      const session = await loginApi(trimmed, password)
      persistSession(session.token, session.user)
      resetLock()
      return { ok: true, message: '' }
    } catch (error) {
      if (error instanceof HttpError && error.status === 423) {
        const lockedUntil = Date.now() + LOCK_DURATION_MS
        persistLock({ failed: MAX_LOGIN_ATTEMPTS, lockedUntil })
        clock.value = Date.now()
        startTicker()
        return {
          ok: false,
          message: `连续 ${MAX_LOGIN_ATTEMPTS} 次登录失败，账号已锁定 ${LOCK_DURATION_MS / 60000} 分钟`,
          reason: 'locked',
          remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
        }
      }

      if (error instanceof HttpError && error.status === 401) {
        const message = error.message.replace(/（登录状态已失效，请重新登录）$/, '')
        const matched = message.match(/还可尝试\s*(\d+)\s*次/)
        const failed = matched
          ? MAX_LOGIN_ATTEMPTS - Number(matched[1])
          : lockState.value.failed + 1
        persistLock({ failed: Math.max(0, Math.min(MAX_LOGIN_ATTEMPTS, failed)), lockedUntil: 0 })
        return { ok: false, message, reason: 'wrong-password' }
      }

      return {
        ok: false,
        message:
          error instanceof Error ? `网络异常：${error.message}` : '网络异常，请检查网络后重试',
        reason: 'network',
      }
    }
  }

  /** 用当前 Token 刷新用户资料；失败返回 null（不主动登出，交给 401 广播处理） */
  async function refreshProfile(): Promise<AuthUser | null> {
    if (!token.value) return null
    try {
      const latest = await meApi()
      user.value = latest
      writeJson(STORAGE_KEYS.AUTH_USER, latest)
      return latest
    } catch {
      return null
    }
  }

  function applyUser(next: AuthUser): void {
    user.value = next
    writeJson(STORAGE_KEYS.AUTH_USER, next)
  }

  async function logout(): Promise<void> {
    try {
      if (token.value) await logoutApi()
    } catch {
      // 后端不可达也要清本地会话，否则用户被永久困在登录态
    } finally {
      clearSession()
      stopTicker()
    }
  }

  if (lockState.value.lockedUntil > Date.now()) startTicker()

  return {
    token,
    user,
    username,
    displayName,
    role,
    isAdmin,
    isLoggedIn,
    isLocked,
    lockRemainingSeconds,
    remainingAttempts,
    login,
    logout,
    refreshProfile,
    applyUser,
    clearSession,
    resetLock,
  }
})
