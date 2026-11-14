/**
 * 测试环境准备。
 * jsdom 里没有 matchMedia / ResizeObserver 这类浏览器 API，
 * 组件里一旦用到就会在挂载时报错，这里统一补上最小可用实现。
 */
import { afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'

// 路由组件里用了 RouterLink，测试中用桩替掉，避免每个用例都搭一套 router
config.global.stubs = {
  RouterLink: {
    props: ['to'],
    template: "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
  },
  Transition: false,
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})
