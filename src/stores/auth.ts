import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { readJson, readText, removeKey, writeJson, writeText } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/storageKeys'

/**
 * 登录状态管理。
 *
 * ⚠️ 说明：当前是**纯前端**的本地测试账号校验，密码直接写在前端代码里，
 * 任何人打开开发者工具都能看到。这只用于演示登录流程与交互校验，
 * 接入真实后端时必须换成接口校验 + Token（LoginView 的提交流程不用改，
 * 只要把 login() 换成 await authApi.login() 即可；Token 通过 api/http.ts 的
 * setAuthToken 注入请求头）。
 *
 * 规范 2.2.1（二）模块一要求：
 * - 密码长度不少于 6 位 —— 由 LoginView 的表单校验负责
 * - 连续 5 次登录失败后临时锁定账号 15 分钟 —— 本文件负责
 * - 账号不存在 / 密码错误 / 网络异常分别给出明确的中文提示 —— login() 返回不同 message
 * - Token 维持登录态 —— 演示阶段用用户名占位，接口就绪后换 Token
 */

interface TestAccount {
  username: string
  password: string
}

/** 本地测试账户 */
const TEST_ACCOUNTS: readonly TestAccount[] = [{ username: 'test', password: '123456' }]

/** 连续失败多少次后锁定（规范：5 次） */
export const MAX_LOGIN_ATTEMPTS = 5
/** 锁定时长（规范：15 分钟） */
export const LOCK_DURATION_MS = 15 * 60 * 1000

/** 锁定信息落库结构：失败次数 + 锁定截止时间戳（0 表示未锁） */
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
  const username = ref<string>(readText(STORAGE_KEYS.AUTH_USERNAME))

  /**
   * 用户角色。
   *
   * 后端目前没有用户体系（/v1 只有文章检索，没有登录/用户接口），所以这里恒为空串，
   * 路由守卫读到的 role 为空 -> 声明了 meta.roles 的页面一律跳 403（fail-closed，
   * 不会因为"不知道角色"就放行管理页）。接 /v1/users/me 之类的接口后，
   * 在 login() 里 role.value = me.role 即可，路由与守卫的写法不用动。
   */
  const role = ref<string>('')

  const lockState = ref<LockState>(readLockState())

  const isLoggedIn = computed(() => username.value !== '')

  /**
   * 定时器驱动的"当前时间"。
   *
   * 为什么需要它：computed 只会在依赖的响应式数据变化时重新求值，而 Date.now()
   * 不是响应式的。如果 isLocked / lockRemainingSeconds 直接读 Date.now()，
   * 首次求值后就会被永久缓存——锁定到期不会自动解锁，倒计时也永远停在 15:00。
   * 之前就是这样，单元测试（锁定到期自动解锁）把它抓了出来。
   */
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
      // 锁过期就停表，别让一个已经解锁的会话永远每秒唤醒一次
      if (lockState.value.lockedUntil > 0 && clock.value >= lockState.value.lockedUntil) {
        stopTicker()
      }
    }, 1000)
  }

  /** 当前是否被锁定（过期自动视为已解锁） */
  const isLocked = computed(() => {
    void clock.value
    const until = lockState.value.lockedUntil
    return until > 0 && clock.value < until
  })

  /** 剩余锁定秒数，向上取整 */
  const lockRemainingSeconds = computed(() => {
    void clock.value
    const until = lockState.value.lockedUntil
    if (until <= 0) return 0
    return Math.max(0, Math.ceil((until - clock.value) / 1000))
  })

  /** 剩余可尝试次数 */
  const remainingAttempts = computed(() => Math.max(0, MAX_LOGIN_ATTEMPTS - lockState.value.failed))

  function persistLock(next: LockState): void {
    lockState.value = next
    writeJson(STORAGE_KEYS.AUTH_LOCK, next)
  }

  function resetLock(): void {
    persistLock({ failed: 0, lockedUntil: 0 })
  }

  /**
   * 登录。
   * 失败时按原因返回不同文案（规范模块一（4）），并在连续 5 次失败后锁定 15 分钟。
   */
  function login(name: string, password: string): LoginResult {
    const trimmed = name.trim()

    if (!trimmed || !password) {
      return { ok: false, message: '请输入用户名和密码', reason: 'empty' }
    }

    // 先看锁：锁定期间连密码都不校验，避免用错误提示探测账号是否存在
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

    // 锁已过期：清理计数，给满额重试机会
    if (lockState.value.lockedUntil > 0) resetLock()

    const account = TEST_ACCOUNTS.find((item) => item.username === trimmed)

    // 账号不存在与密码错误分别提示（规范模块一（4））。真实后端出于安全通常
    // 统一成「用户名或密码错误」以免暴露账号是否存在，但规范明确要求分开，按规范实现。
    if (!account) {
      return registerFailure('账号不存在，请检查用户名是否正确', 'not-found')
    }

    if (account.password !== password) {
      return registerFailure('密码错误，请重新输入', 'wrong-password')
    }

    username.value = account.username
    writeText(STORAGE_KEYS.AUTH_USERNAME, account.username)
    resetLock()
    return { ok: true, message: '' }
  }

  /** 加载时就处于锁定状态（刷新页面）：立刻开表，倒计时才不会僵住 */
  if (lockState.value.lockedUntil > Date.now()) startTicker()

  /** 记录一次失败，必要时上锁 */
  function registerFailure(message: string, reason: LoginFailureReason): LoginResult {
    const failed = lockState.value.failed + 1

    if (failed >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = Date.now() + LOCK_DURATION_MS
      persistLock({ failed, lockedUntil })
      // 上锁后必须开表，否则 isLocked 会一直停在"刚锁上那一刻"的值上
      clock.value = Date.now()
      startTicker()
      return {
        ok: false,
        message: `连续 ${MAX_LOGIN_ATTEMPTS} 次登录失败，账号已锁定 ${LOCK_DURATION_MS / 60000} 分钟`,
        reason: 'locked',
        remainingSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
      }
    }

    persistLock({ failed, lockedUntil: 0 })
    const left = MAX_LOGIN_ATTEMPTS - failed
    return { ok: false, message: `${message}（还可尝试 ${left} 次）`, reason }
  }

  function logout(): void {
    username.value = ''
    role.value = ''
    removeKey(STORAGE_KEYS.AUTH_USERNAME)
  }

  return {
    username,
    role,
    isLoggedIn,
    isLocked,
    lockRemainingSeconds,
    remainingAttempts,
    login,
    logout,
    resetLock,
  }
})
