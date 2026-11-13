import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface User {
  id: number
  name: string
  email: string
}

/**
 * 用户状态：演示 Pinia 的 setup 语法（推荐写法）
 * 相比 Options 写法，setup 语法对 TS 类型推导更友好。
 */
export const useUserStore = defineStore('user', () => {
  // ── state ──────────────────────────────────────────────
  const currentUser = ref<User | null>(null)
  const token = ref<string>('')

  // ── getters ────────────────────────────────────────────
  const isLoggedIn = computed(() => token.value !== '' && currentUser.value !== null)
  const displayName = computed(() => currentUser.value?.name ?? '未登录')

  // ── actions ────────────────────────────────────────────
  function login(user: User, newToken: string): void {
    currentUser.value = user
    token.value = newToken
  }

  function logout(): void {
    currentUser.value = null
    token.value = ''
  }

  return {
    currentUser,
    token,
    isLoggedIn,
    displayName,
    login,
    logout,
  }
})
