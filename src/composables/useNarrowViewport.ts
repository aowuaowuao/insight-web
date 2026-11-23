import { onBeforeUnmount, onMounted, ref } from 'vue'

const MOBILE_QUERY = '(max-width: 768px)'

/**
 * 监听窄视口（手机/小屏平板）。
 *
 * CSS 负责绝大多数自适应；只有 el-descriptions 的 column 这类必须由组件参数决定的
 * 布局才需要 JS 参与。jsdom 没有 matchMedia 时回退到 innerWidth，测试无需额外 stub。
 */
export function useNarrowViewport(query = MOBILE_QUERY) {
  const isNarrow = ref(false)
  let media: MediaQueryList | null = null
  let mediaHandler: (() => void) | null = null

  function read(): boolean {
    if (typeof window === 'undefined') return false
    if (typeof window.matchMedia === 'function') return window.matchMedia(query).matches
    return window.innerWidth <= 768
  }

  function onResize(): void {
    isNarrow.value = window.innerWidth <= 768
  }

  isNarrow.value = read()

  onMounted(() => {
    if (typeof window === 'undefined') return
    if (typeof window.matchMedia === 'function') {
      media = window.matchMedia(query)
      isNarrow.value = media.matches
      mediaHandler = () => {
        if (media) isNarrow.value = media.matches
      }
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', mediaHandler)
      } else {
        media.addListener(mediaHandler)
      }
      return
    }
    window.addEventListener('resize', onResize)
  })

  onBeforeUnmount(() => {
    if (media && mediaHandler) {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', mediaHandler)
      } else {
        media.removeListener(mediaHandler)
      }
    }
    if (typeof window !== 'undefined') window.removeEventListener('resize', onResize)
  })

  return { isNarrow }
}
