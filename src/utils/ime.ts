/**
 * IME 安全判断。
 *
 * 中文/日文/韩文输入法在候选词确认时也会触发 Enter。自定义的 Enter 提交
 * 必须跳过这类事件，否则用户还在选词就被提交。
 *
 * Safari 的 WebKit bug 165004 可能先派发 compositionend、再把确认 Enter
 * 交给 keydown，此时 isComposing 已被重置为 false；keyCode 229 是输入法
 * 处理键的兼容信号，两根一起判断才能覆盖这个顺序。
 */
export function isImeConfirming(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229
}
