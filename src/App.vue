<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import { onPendingChange } from '@/api/http'

const route = useRoute()

// 登录页不显示侧边栏与顶部导航（也不显示账户名）
const showNav = computed(() => route.meta.hideNav !== true)

// 全局请求进度条：并发请求用计数汇总，归零才收起（规范 2.2.1「接口请求 loading 自动显示」）
const pending = ref(0)
const stopPending = onPendingChange((count) => {
  pending.value = count
})
onBeforeUnmount(stopPending)
</script>

<template>
  <div class="app">
    <div v-if="pending > 0" class="app__progress" role="progressbar" aria-label="加载中" />
    <AppNav v-if="showNav">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </AppNav>

    <main v-else class="app__main">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
}

.app__main {
  min-height: 100vh;
}

/* 顶部不定长进度条：只在有请求在飞时出现，避免每次切页都闪一下 */
.app__progress {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  width: 100%;
  height: 2px;
  background: var(--color-primary);
  animation: app-progress 1.1s ease-in-out infinite;
}

@keyframes app-progress {
  0% {
    transform: translateX(-100%) scaleX(0.4);
  }

  100% {
    transform: translateX(100%) scaleX(0.6);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-base) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
