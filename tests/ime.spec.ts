/**
 * 单元测试：输入法确认 Enter 的识别。
 *
 * 这不只是「锦上添花」：中文输入法选词时按 Enter 会触发 keydown，
 * 自定义提交如果直接响应，会把用户半截输入当成搜索词提交。
 */
import { describe, expect, it } from 'vitest'
import { isImeConfirming } from '@/utils/ime'

function keyEvent(init: KeyboardEventInit & { keyCode?: number }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Enter', ...init })
  if (init.keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { value: init.keyCode })
  }
  return event
}

describe('isImeConfirming', () => {
  it('composition 中的 Enter 返回 true', () => {
    expect(isImeConfirming(keyEvent({ isComposing: true }))).toBe(true)
  })

  it('composition 已结束但 keyCode 为 229（Safari）时仍返回 true', () => {
    expect(isImeConfirming(keyEvent({ keyCode: 229 }))).toBe(true)
  })

  it('普通 Enter 返回 false', () => {
    expect(isImeConfirming(keyEvent({ keyCode: 13 }))).toBe(false)
  })
})
