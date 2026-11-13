<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <section class="nf">
    <h1>404</h1>
    <p>
      找不到页面：<code>{{ route.fullPath }}</code>
    </p>
    <RouterLink to="/">← 回首页</RouterLink>
  </section>
</template>

<style scoped>
.nf {
  text-align: center;
  padding: 3rem 0;
}

.nf h1 {
  font-size: 4rem;
  margin-bottom: 0.3rem;
  color: #3b82f6;
}
</style>
