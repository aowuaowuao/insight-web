/**
 * 单元测试：src/utils/dateRange.ts 与筛选状态换算。
 *
 * 重点不是「函数能跑」，而是时区与边界：规范要求按时间范围筛选，
 * 一旦用 toISOString() 生成日期，东八区凌晨的公告就会从「近 7 天」里消失，
 * 而这类 bug 在本地白天测不出来。
 */
import { describe, expect, it } from 'vitest'
import { isRangeInverted, localDayString, resolveRange } from '@/utils/dateRange'

describe('localDayString', () => {
  it('取本地年月日而不是 UTC 日期', () => {
    // 本地时间 2026-11-14 00:30（东八区）= UTC 2026-11-13 16:30。
    // toISOString().slice(0,10) 会给出 11-13，那是错的。
    const local = new Date(2026, 10, 14, 0, 30)
    expect(localDayString(local)).toBe('2026-11-14')
  })

  it('月和日补零到两位', () => {
    expect(localDayString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('resolveRange', () => {
  const now = new Date(2026, 10, 14, 10, 0)

  it('近 7 天是含今天在内的 7 个自然日', () => {
    const range = resolveRange('7d', '', '', now)
    expect(range).toEqual({ from: '2026-11-08', to: '2026-11-14' })
  })

  it('近 30 天同理，终点是今天', () => {
    const range = resolveRange('30d', '', '', now)
    expect(range.from).toBe('2026-10-16')
    expect(range.to).toBe('2026-11-14')
  })

  it('全部时间不产生任何过滤条件', () => {
    expect(resolveRange('all', '2026-01-01', '2026-02-01', now)).toEqual({ from: '', to: '' })
  })

  it('自定义范围原样透传并去掉首尾空格', () => {
    const range = resolveRange('custom', ' 2026-09-01 ', '2026-10-31 ', now)
    expect(range).toEqual({ from: '2026-09-01', to: '2026-10-31' })
  })

  it('跨月时开始日期正确回退', () => {
    // 2026-11-03 往前数 6 天要落到 10 月，不能变成 11-31 这种非法值
    const range = resolveRange('7d', '', '', new Date(2026, 10, 3, 9, 0))
    expect(range).toEqual({ from: '2026-10-28', to: '2026-11-03' })
  })

  it('跨年时开始日期正确回退', () => {
    const range = resolveRange('7d', '', '', new Date(2027, 0, 2, 9, 0))
    expect(range).toEqual({ from: '2026-12-27', to: '2027-01-02' })
  })
})

describe('isRangeInverted', () => {
  it('起点晚于终点时为 true', () => {
    expect(isRangeInverted({ from: '2026-11-10', to: '2026-11-01' })).toBe(true)
  })

  it('同日或正常区间不算倒置', () => {
    expect(isRangeInverted({ from: '2026-11-01', to: '2026-11-01' })).toBe(false)
    expect(isRangeInverted({ from: '2026-11-01', to: '2026-11-10' })).toBe(false)
  })

  it('只填一端时不做校验', () => {
    expect(isRangeInverted({ from: '2026-11-10', to: '' })).toBe(false)
    expect(isRangeInverted({ from: '', to: '2026-11-01' })).toBe(false)
  })
})
