<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from '@/components/AppNav.vue'

const route = useRoute()

// 登录页不显示顶部导航（也不显示账户名）
const showNav = computed(() => route.meta.hideNav !== true)
</script>

<template>
  <div class="app">
    <AppNav v-if="showNav" />
    <main :class="['app__main', { 'app__main--bare': !showNav }]">
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
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app__main {
  flex: 1;
  padding: 2rem 1.6rem;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
}

/* 登录页占满整屏，去掉内容区留白与宽度限制 */
.app__main--bare {
  padding: 0;
  max-width: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
