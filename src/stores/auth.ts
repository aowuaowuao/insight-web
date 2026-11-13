import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 登录状态管理。
 *
 * ⚠️ 说明：当前是**纯前端**的本地测试账号校验，密码直接写在前端代码里，
 * 任何人打开开发者工具都能看到。这只用于演示登录流程，
 * 真实项目必须换成后端接口校验 + HttpOnly Cookie / Token。
 */
interface TestAccount {
  username: string
  password: string
}

/** 本地测试账户 */
const TEST_ACCOUNTS: readonly TestAccount[] = [{ username: 'test', password: '123456' }]

/** 登录态存在 localStorage，刷新页面不用重新登录 */
const STORAGE_KEY = 'insight-web.auth.username'

function readStoredUsername(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    // 隐私模式下 localStorage 可能不可用
    return ''
  }
}

export const useAuthStore = defineStore('auth', () => {
  const username = ref<string>(readStoredUsername())

  const isLoggedIn = computed(() => username.value !== '')

  /** 登录：成功返回 ok=true，失败带原因 */
  function login(name: string, password: string): { ok: boolean; message: string } {
    const account = TEST_ACCOUNTS.find((item) => item.username === name.trim())
    if (!account || account.password !== password) {
      return { ok: false, message: '用户名或密码不正确' }
    }

    username.value = account.username
    try {
      localStorage.setItem(STORAGE_KEY, account.username)
    } catch {
      // 写不进去也不影响本次会话
    }
    return { ok: true, message: '' }
  }

  function logout(): void {
    username.value = ''
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  return { username, isLoggedIn, login, logout }
})
