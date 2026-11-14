import { http } from './http'

/** 后端 users 表对外字段（app/accounts.py public_user 的输出） */
export interface AuthUser {
  id: number
  username: string
  display_name: string
  department: string
  role: 'admin' | 'user' | string
  status: string
  must_change_password: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
  is_admin: boolean
}

export interface LoginResponse {
  token: string
  expires_at: string
  user: AuthUser
}

/** 登录：后端连续 5 次失败会返回 423 并锁定 15 分钟 */
export function login(username: string, password: string): Promise<LoginResponse> {
  return http
    .post<{ data: LoginResponse }>('/v1/auth/login', { username, password }, { retries: 0 })
    .then((payload) => payload.data)
}

export function me(): Promise<AuthUser> {
  return http.get<{ data: AuthUser }>('/v1/auth/me').then((payload) => payload.data)
}

export function logout(): Promise<void> {
  return http.post<void>('/v1/auth/logout', undefined, { retries: 0 })
}

export interface ChangePasswordInput {
  current_password: string
  new_password: string
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return http.post<void>('/v1/auth/password', input, { retries: 0 })
}

export interface ProfilePatch {
  display_name?: string
  department?: string
}

export function updateProfile(patch: ProfilePatch): Promise<AuthUser> {
  return http.patch<{ data: AuthUser }>('/v1/me/profile', patch).then((payload) => payload.data)
}
