/**
 * 时间范围换算。
 *
 * 全站只有「本地年月日」这一套口径：后端 published_from/published_to 收的是
 * YYYY-MM-DD，并按**卡片上显示的那一天**（站点墙钟日，后端 db._DAY_EXPR）比较，
 * 前端绝不能拿 toISOString() 生成日期字符串——那是 UTC 日期，东八区 00:00-08:00
 * 会被算成前一天，选「近 7 天」就会漏掉当天凌晨发布的内容，且不同时区的用户
 * 看到的区间不一样。排序另走真实时刻 published_at_utc（db._TIME_EXPR）。
 */

/** 快捷时间范围；custom 用用户填的起止日期 */
export type TimeRange = 'all' | '7d' | '30d' | 'custom'

export interface DateRange {
  /** YYYY-MM-DD，'' 表示不限 */
  from: string
  /** YYYY-MM-DD，'' 表示不限 */
  to: string
}

/** URL 可能是手改的：只接受 YYYY-MM-DD，其它值当作没填 */
export function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** 本地时区的 YYYY-MM-DD（不用 toISOString，它会先转成 UTC） */
export function localDayString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

/**
 * 把「快捷范围 / 自定义起止」换算成后端要的两个日期。
 *
 * 近 N 天是**含今天**的 N 个自然日：近 7 天 = 今天往前数 6 天到今天。
 * 用 `new Date(y, m, d - (n - 1))` 而不是减毫秒，跨月/跨年/夏令时都由
 * Date 自己进位，不会出现 25 小时算成两天。
 */
export function resolveRange(
  range: TimeRange,
  customFrom = '',
  customTo = '',
  now: Date = new Date(),
): DateRange {
  if (range === 'all') return { from: '', to: '' }
  if (range === 'custom') return { from: customFrom.trim(), to: customTo.trim() }
  const days = range === '7d' ? 7 : 30
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  return { from: localDayString(start), to: localDayString(end) }
}

/** 起止都填了且起点晚于终点时返回 true（自定义范围才需要校验） */
export function isRangeInverted(range: DateRange): boolean {
  if (!range.from || !range.to) return false
  return range.from > range.to
}
