<script setup lang="ts">
/**
 * 首页：登录后的落地页，只保留一句欢迎语。
 */
</script>

<template>
  <section class="home">
    <h1 class="home__title">欢迎进入智能申报信息检索平台</h1>
  </section>
</template>

<style scoped>
.home {
  min-height: calc(100vh - 64px - 4rem);
  display: grid;
  place-items: center;
}

.home__title {
  margin: 0;
  text-align: center;
  font-size: clamp(1.6rem, 4vw, 2.6rem);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.5;
}
</style>
