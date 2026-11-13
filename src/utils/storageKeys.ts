/**
 * localStorage 键集中登记。
 *
 * 键名散落在各组件里时，改一次命名就得全仓搜索、漏一个就变成两套数据；
 * 集中在这里还能一眼看出前端到底持久化了哪些东西（隐私与安全评审会问）。
 */
export const STORAGE_KEYS = {
  /** 登录用户名（演示用；接入真实后端后换成 Token） */
  AUTH_USERNAME: 'insight-web.auth.username',
  /** 登录失败次数与锁定截止时间：连续 5 次失败锁 15 分钟 */
  AUTH_LOCK: 'insight-web.auth.lock',
  /** 搜索历史，最多 10 条 */
  SEARCH_HISTORY: 'insight-web.search.history',
  /** 收藏的文章（前端本地版，等后端提供收藏接口后迁移） */
  FAVORITES: 'insight-web.favorites',
  /** 浏览历史，最多 50 条 */
  VIEW_HISTORY: 'insight-web.viewHistory',
  /** 个性化设置：关注领域 / 消息推送开关 / 推送时间偏好 */
  PREFERENCES: 'insight-web.preferences',
} as const
