/**
 * 通用格式化工具。
 *
 * 集中放在 src/utils 下（规范 2.2.1（四）1 要求 src 按 api / assets / components /
 * views / router / store / utils / styles 分层），避免各视图里各写一份 formatDate：
 * 同一篇文章在不同页面上出现过 "2026-11-13"、"2026-11-13 21:00"、"暂无日期"
 * 三种呈现，就是各写一份的直接后果。
 */

/** 把 "2026-11-13T21:00:00" / "2026-11-13 21:00:00" 格式化成 "YYYY-MM-DD" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '暂无日期'
  return value.replace('T', ' ').slice(0, 10)
}

/** 带时分的日期，用于详情页 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '暂无日期'
  return value.replace('T', ' ').slice(0, 16)
}

/** 相对时间：3 分钟前 / 2 小时前 / 昨天 / 具体日期。用于列表与浏览历史 */
export function formatRelativeTime(
  value: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!value) return '暂无日期'
  // 后端给的是 "YYYY-MM-DD HH:MM:SS"（无时区后缀），Safari 不接受空格分隔，
  // 统一换成 ISO 的 T 再解析；解析失败就退回绝对日期，不抛错。
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return formatDate(value)

  const diffMs = now.getTime() - parsed.getTime()
  if (diffMs < 0) return formatDate(value)

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return minutes + ' 分钟前'

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + ' 小时前'

  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 7) return days + ' 天前'

  return formatDate(value)
}

/**
 * 相关度分数 0-1 -> 0-100 的整数。
 * 规范要求 0-100 分且按绿≥80 / 黄≥60 / 红<60 分色。
 */
export function scoreToPercent(score: number | null | undefined): number | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null
  const clamped = Math.min(1, Math.max(0, score))
  return Math.round(clamped * 100)
}

/** 分数档位，对应规范里的三级色 */
export type ScoreLevel = 'high' | 'medium' | 'low'

export function scoreLevel(percent: number): ScoreLevel {
  if (percent >= 80) return 'high'
  if (percent >= 60) return 'medium'
  return 'low'
}

/** 毫秒 -> "123 毫秒" / "1.2 秒"，用于搜索耗时展示 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return Math.round(ms) + ' 毫秒'
  return (ms / 1000).toFixed(1) + ' 秒'
}

/** 把数字按千分位分组，统计卡片用 */
export function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

/** 截断长文本，超出补省略号（卡片标题最多 2 行，这里只做兜底） */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}
