/**
 * 单元测试：src/stores/auth.ts（真实后端会话 Token）
 * 覆盖规范模块一：必填校验、后端 401 剩余次数提示、423 锁定 15 分钟、
 * Token/用户持久化、登出清会话、网络异常兜底。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { HttpError } from '@/api/http'
import { LOCK_DURATION_MS, MAX_LOGIN_ATTEMPTS, useAuthStore } from '@/stores/auth'
import { STORAGE_KEYS } from '@/utils/storageKeys'

const loginMock = vi.fn()
const logoutMock = vi.fn()
const meMock = vi.fn()

vi.mock('@/api/auth', () => ({
  login: (...args: unknown[]) => loginMock(...args),
  logout: (...args: unknown[]) => logoutMock(...args),
  me: (...args: unknown[]) => meMock(...args),
}))

const USER = {
  id: 1,
  username: 'admin',
  display_name: '管理员',
  department: '信息化部',
  role: 'admin',
  status: 'active',
  must_change_password: false,
  last_login_at: '2026-11-14T00:00:00Z',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  is_admin: true,
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    loginMock.mockReset()
    logoutMock.mockReset()
    meMock.mockReset()
  })

  it('参数为空时提示补全，不调用后端', async () => {
    const auth = useAuthStore()
    const result = await auth.login('', '')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('empty')
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('登录成功写入 Token 与用户资料', async () => {
    loginMock.mockResolvedValue({
      token: 'tok-123',
      expires_at: '2026-11-21T00:00:00Z',
      user: USER,
    })
    const auth = useAuthStore()
    const result = await auth.login(' admin ', 'secret123')
    expect(result.ok).toBe(true)
    expect(loginMock).toHaveBeenCalledWith('admin', 'secret123')
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.isAdmin).toBe(true)
    expect(auth.displayName).toBe('管理员')
    expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe('tok-123')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.AUTH_USER) ?? '{}').username).toBe('admin')
  })

  it('401 时展示后端剩余次数并累计失败次数', async () => {
    loginMock.mockRejectedValue(new HttpError(401, '用户名或密码错误，还可尝试 3 次'))
    const auth = useAuthStore()
    const result = await auth.login('admin', 'bad')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('wrong-password')
    expect(result.message).toContain('还可尝试 3 次')
    expect(auth.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS - 2)
    expect(auth.isLoggedIn).toBe(false)
  })

  it('423 时进入 15 分钟锁定，锁定期内直接拒绝', async () => {
    loginMock.mockRejectedValue(new HttpError(423, '连续 5 次密码错误，账号已锁定 15 分钟'))
    const auth = useAuthStore()
    const result = await auth.login('admin', 'bad')
    expect(result.reason).toBe('locked')
    expect(result.message).toContain('15 分钟')
    expect(auth.isLocked).toBe(true)

    const again = await auth.login('admin', 'secret123')
    expect(again.ok).toBe(false)
    expect(again.reason).toBe('locked')
    expect(loginMock).toHaveBeenCalledTimes(1)
  })

  it('锁定倒计时到期后恢复可登录', async () => {
    vi.useFakeTimers()
    loginMock.mockRejectedValue(new HttpError(423, '连续 5 次密码错误，账号已锁定 15 分钟'))
    const auth = useAuthStore()
    await auth.login('admin', 'bad')
    expect(auth.isLocked).toBe(true)
    expect(auth.lockRemainingSeconds).toBeGreaterThan(0)
    expect(auth.lockRemainingSeconds).toBeLessThanOrEqual(LOCK_DURATION_MS / 1000)

    vi.advanceTimersByTime(LOCK_DURATION_MS + 1000)
    expect(auth.isLocked).toBe(false)
    vi.useRealTimers()
  })

  it('网络异常单独归类，不消耗失败次数', async () => {
    loginMock.mockRejectedValue(new Error('fetch failed'))
    const auth = useAuthStore()
    const result = await auth.login('admin', 'secret123')
    expect(result.reason).toBe('network')
    expect(auth.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS)
  })

  it('登出清除本地 Token 与用户', async () => {
    loginMock.mockResolvedValue({ token: 'tok-123', expires_at: '', user: USER })
    logoutMock.mockResolvedValue(undefined)
    const auth = useAuthStore()
    await auth.login('admin', 'secret123')
    await auth.logout()
    expect(auth.isLoggedIn).toBe(false)
    expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.AUTH_USER)).toBeNull()
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  it('refreshProfile 更新用户资料，失败不登出', async () => {
    loginMock.mockResolvedValue({ token: 'tok-123', expires_at: '', user: USER })
    meMock.mockResolvedValue({ ...USER, display_name: '新名字' })
    const auth = useAuthStore()
    await auth.login('admin', 'secret123')
    const updated = await auth.refreshProfile()
    expect(updated?.display_name).toBe('新名字')
    expect(auth.displayName).toBe('新名字')

    meMock.mockRejectedValue(new Error('down'))
    expect(await auth.refreshProfile()).toBeNull()
    expect(auth.isLoggedIn).toBe(true)
  })
})
