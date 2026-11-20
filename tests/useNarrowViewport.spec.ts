import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNarrowViewport } from '@/composables/useNarrowViewport'

function mountProbe(matches: boolean) {
  const listeners: Array<() => void> = []
  const media = {
    matches,
    media: '(max-width: 768px)',
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.push(listener)),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  const Probe = defineComponent({
    setup() {
      const { isNarrow } = useNarrowViewport()
      return { isNarrow }
    },
    render() {
      return h('span', this.isNarrow ? 'narrow' : 'wide')
    },
  })
  return {
    wrapper: mount(Probe),
    media,
    listeners,
    setMatches(value: boolean) {
      media.matches = value
      listeners.forEach((listener) => listener())
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNarrowViewport', () => {
  it('按 matchMedia 初值返回宽/窄状态', () => {
    const narrow = mountProbe(true)
    expect(narrow.wrapper.text()).toBe('narrow')
    narrow.wrapper.unmount()
    const wide = mountProbe(false)
    expect(wide.wrapper.text()).toBe('wide')
    wide.wrapper.unmount()
  })

  it('媒体查询变化时同步更新，并在卸载后移除监听', async () => {
    const probe = mountProbe(false)
    probe.setMatches(true)
    await probe.wrapper.vm.$nextTick()
    expect(probe.wrapper.text()).toBe('narrow')
    expect(probe.media.addEventListener).toHaveBeenCalledTimes(1)

    const listener = probe.media.addEventListener.mock.calls[0]?.[1] as () => void
    probe.wrapper.unmount()
    expect(probe.media.removeEventListener).toHaveBeenCalledWith('change', listener)
  })
})
