/**
 * 单元测试：src/utils/format.ts
 * 规范 2.2.1（四）测试要求：核心工具函数必须有单元测试。
 */
import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  scoreLevel,
  scoreToPercent,
  truncate,
} from '@/utils/format'

describe('formatDate', () => {
  it('截取 ISO 日期的年月日', () => {
    expect(formatDate('2026-11-13T21:00:00')).toBe('2026-11-13')
  })

  it('兼容后端返回的空格分隔格式', () => {
    expect(formatDate('2026-11-13 21:00:00')).toBe('2026-11-13')
  })

  it('空值返回占位文案而不是 undefined', () => {
    expect(formatDate(null)).toBe('暂无日期')
    expect(formatDate(undefined)).toBe('暂无日期')
    expect(formatDate('')).toBe('暂无日期')
  })
})

describe('formatDateTime', () => {
  it('保留到分钟', () => {
    expect(formatDateTime('2026-11-13 21:05:33')).toBe('2026-11-13 21:05')
  })

  it('空值返回占位文案', () => {
    expect(formatDateTime(null)).toBe('暂无日期')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-11-13T12:00:00')

  it('一分钟内显示刚刚', () => {
    expect(formatRelativeTime('2026-11-13 11:59:30', now)).toBe('刚刚')
  })

  it('一小时内显示分钟', () => {
    expect(formatRelativeTime('2026-11-13 11:30:00', now)).toBe('30 分钟前')
  })

  it('一天内显示小时', () => {
    expect(formatRelativeTime('2026-11-13 09:00:00', now)).toBe('3 小时前')
  })

  it('恰好一天显示昨天', () => {
    expect(formatRelativeTime('2026-11-12 12:00:00', now)).toBe('昨天')
  })

  it('一周内显示天数', () => {
    expect(formatRelativeTime('2026-11-10 12:00:00', now)).toBe('3 天前')
  })

  it('超过一周退回绝对日期', () => {
    expect(formatRelativeTime('2026-10-01 12:00:00', now)).toBe('2026-10-01')
  })

  it('未来时间不显示负数，退回绝对日期', () => {
    expect(formatRelativeTime('2026-12-01 12:00:00', now)).toBe('2026-12-01')
  })

  it('无法解析的字符串退回原文日期部分', () => {
    expect(formatRelativeTime('不是日期', now)).toBe('不是日期')
  })
})

describe('scoreToPercent', () => {
  it('0-1 映射到 0-100 的整数', () => {
    expect(scoreToPercent(0.946)).toBe(95)
    expect(scoreToPercent(0)).toBe(0)
    expect(scoreToPercent(1)).toBe(100)
  })

  it('越界值被夹到区间内', () => {
    expect(scoreToPercent(1.8)).toBe(100)
    expect(scoreToPercent(-0.5)).toBe(0)
  })

  it('空值与 NaN 返回 null', () => {
    expect(scoreToPercent(null)).toBeNull()
    expect(scoreToPercent(undefined)).toBeNull()
    expect(scoreToPercent(Number.NaN)).toBeNull()
  })
})

describe('scoreLevel', () => {
  it('按规范阈值分三级：绿≥80 / 黄≥60 / 红<60', () => {
    expect(scoreLevel(100)).toBe('high')
    expect(scoreLevel(80)).toBe('high')
    expect(scoreLevel(79)).toBe('medium')
    expect(scoreLevel(60)).toBe('medium')
    expect(scoreLevel(59)).toBe('low')
    expect(scoreLevel(0)).toBe('low')
  })
})

describe('formatDuration', () => {
  it('小于一秒显示毫秒', () => {
    expect(formatDuration(123.4)).toBe('123 毫秒')
  })

  it('大于一秒显示秒并保留一位小数', () => {
    expect(formatDuration(1500)).toBe('1.5 秒')
  })

  it('非法值返回占位符', () => {
    expect(formatDuration(Number.NaN)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
  })
})

describe('formatNumber', () => {
  it('按中文千分位分组', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })
})

describe('truncate', () => {
  it('未超长时原样返回', () => {
    expect(truncate('短文本', 10)).toBe('短文本')
  })

  it('超长时截断并补省略号', () => {
    expect(truncate('一二三四五六', 4)).toBe('一二三四…')
  })
})
