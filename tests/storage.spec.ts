/** 单元测试：src/utils/storage.ts —— 隐私模式与配额异常必须被兜住 */
import { describe, expect, it, vi } from 'vitest'
import { readJson, readText, removeKey, writeJson, writeText } from '@/utils/storage'

describe('readJson / writeJson', () => {
  it('写入后能读回同一个对象', () => {
    expect(writeJson('k', { a: 1, b: [2, 3] })).toBe(true)
    expect(readJson('k', null)).toEqual({ a: 1, b: [2, 3] })
  })

  it('键不存在时返回 fallback', () => {
    expect(readJson('missing', { fallback: true })).toEqual({ fallback: true })
  })

  it('存量数据不是合法 JSON 时返回 fallback 而不是抛错', () => {
    localStorage.setItem('bad', '{not json')
    expect(readJson('bad', [])).toEqual([])
  })

  it('写入失败（配额已满）时返回 false 而不是抛错', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(writeJson('k', { a: 1 })).toBe(false)
    spy.mockRestore()
  })
})

describe('readText / writeText', () => {
  it('字符串读写往返', () => {
    expect(writeText('t', 'hello')).toBe(true)
    expect(readText('t')).toBe('hello')
  })

  it('不存在时返回 fallback', () => {
    expect(readText('nope', 'def')).toBe('def')
  })

  it('读取抛错（隐私模式）时返回 fallback', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(readText('x', 'def')).toBe('def')
    spy.mockRestore()
  })
})

describe('removeKey', () => {
  it('删除后读不到', () => {
    writeText('r', 'v')
    removeKey('r')
    expect(readText('r', '')).toBe('')
  })

  it('删除不存在的键不抛错', () => {
    expect(() => removeKey('never')).not.toThrow()
  })
})
