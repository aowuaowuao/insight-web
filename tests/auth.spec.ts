/**
 * 单元测试：src/stores/auth.ts
 * 重点覆盖规范模块一（4）（5）的要求：
 * 账号不存在 / 密码错误分别提示、连续 5 次失败锁定 15 分钟。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { LOCK_DURATION_MS, MAX_LOGIN_ATTEMPTS, useAuthStore } from '@/stores/auth'
import { STORAGE_KEYS } from '@/utils/storageKeys'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('参数为空时提示补全，不消耗失败次数', () => {
    const auth = useAuthStore()
    const result = auth.login('', '')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('empty')
    expect(auth.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS)
  })

  it('账号不存在时给出专属文案', () => {
    const auth = useAuthStore()
    const result = auth.login('nobody', '123456')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not-found')
    expect(result.message).toContain('账号不存在')
  })

  it('密码错误时给出专属文案并带上剩余次数', () => {
    const auth = useAuthStore()
    const result = auth.login('test', 'wrong-pass')
    expect(result.reason).toBe('wrong-password')
    expect(result.message).toContain('密码错误')
    expect(result.message).toContain(String(MAX_LOGIN_ATTEMPTS - 1))
  })

  it('正确账号密码登录成功并记住用户名', () => {
    const auth = useAuthStore()
    const result = auth.login('test', '123456')
    expect(result.ok).toBe(true)
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.username).toBe('test')
    expect(localStorage.getItem(STORAGE_KEYS.AUTH_USERNAME)).toBe('test')
  })

  it('登录成功后失败计数清零', () => {
    const auth = useAuthStore()
    auth.login('test', 'bad1')
    auth.login('test', 'bad2')
    expect(auth.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS - 2)
    expect(auth.login('test', '123456').ok).toBe(true)
    expect(auth.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS)
  })

  it('连续 5 次失败后锁定，之后即使密码正确也拒绝', () => {
    const auth = useAuthStore()
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) auth.login('test', 'bad')
    expect(auth.isLocked).toBe(true)

    const result = auth.login('test', '123456')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('locked')
    expect(result.message).toContain('15 分钟')
    expect(auth.isLoggedIn).toBe(false)
  })

  it('锁定倒计时的剩余秒数在 0 与锁定时长之间', () => {
    const auth = useAuthStore()
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) auth.login('test', 'bad')
    expect(auth.lockRemainingSeconds).toBeGreaterThan(0)
    expect(auth.lockRemainingSeconds).toBeLessThanOrEqual(LOCK_DURATION_MS / 1000)
  })

  it('锁定到期后自动解锁并恢复重试次数', () => {
    vi.useFakeTimers()
    const auth = useAuthStore()
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) auth.login('test', 'bad')
    expect(auth.isLocked).toBe(true)

    vi.advanceTimersByTime(LOCK_DURATION_MS + 1000)
    expect(auth.isLocked).toBe(false)

    const result = auth.login('test', '123456')
    expect(result.ok).toBe(true)
  })

  it('登出后清除用户名与登录态', () => {
    const auth = useAuthStore()
    auth.login('test', '123456')
    auth.logout()
    expect(auth.isLoggedIn).toBe(false)
    expect(localStorage.getItem(STORAGE_KEYS.AUTH_USERNAME)).toBeNull()
  })
})
