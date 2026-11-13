<script setup lang="ts">
/**
 * 首页：一句欢迎语 + 三个分页入口卡片
 */
import { useRouter } from 'vue-router'

const router = useRouter()

const entries = [
  {
    path: '/category',
    icon: '🗂️',
    title: '分类浏览',
    desc: '按类别层层展开，像翻书架一样找信息。',
  },
  {
    path: '/search',
    icon: '🔍',
    title: '信息检索',
    desc: '输入关键词，让智能检索帮你把答案捞出来。',
  },
] as const
</script>

<template>
  <section class="home">
    <div class="hero">
      <p class="hero__eyebrow">WELCOME</p>
      <h1 class="hero__title">欢迎来到<span class="hero__accent">大肥鱼</span>的小站</h1>
      <p class="hero__desc">这是一条圆滚滚的鱼搭起来的单页应用，肚子里的 token 比页面还多。</p>
    </div>

    <div class="entries">
      <article
        v-for="entry in entries"
        :key="entry.path"
        class="entry"
        role="button"
        tabindex="0"
        @click="router.push(entry.path)"
        @keydown.enter="router.push(entry.path)"
      >
        <span class="entry__icon" aria-hidden="true">{{ entry.icon }}</span>
        <h2 class="entry__title">{{ entry.title }}</h2>
        <p class="entry__desc">{{ entry.desc }}</p>
        <span class="entry__arrow" aria-hidden="true">→</span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.home {
  padding-top: 3rem;
}

.hero {
  text-align: center;
  padding: 2rem 1rem 3.5rem;
}

.hero__eyebrow {
  margin: 0 0 0.9rem;
  font-size: 0.76rem;
  letter-spacing: 0.28em;
  color: var(--muted);
}

.hero__title {
  margin: 0 0 1rem;
  font-size: clamp(1.9rem, 4.2vw, 2.9rem);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.hero__accent {
  color: #3b82f6;
}

.hero__desc {
  margin: 0 auto;
  max-width: 34rem;
  color: var(--muted);
  font-size: 1rem;
}

.entries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.1rem;
  max-width: 720px;
  margin: 0 auto;
}

.entry {
  position: relative;
  padding: 1.6rem 1.5rem 1.5rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.entry:hover,
.entry:focus-visible {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 10px 28px rgba(59, 130, 246, 0.1);
  outline: none;
}

.entry__icon {
  font-size: 1.5rem;
}

.entry__title {
  margin: 0.7rem 0 0.4rem;
  font-size: 1.08rem;
}

.entry__desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.65;
}

.entry__arrow {
  position: absolute;
  right: 1.4rem;
  bottom: 1.3rem;
  color: #3b82f6;
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.18s ease;
}

.entry:hover .entry__arrow {
  opacity: 1;
  transform: translateX(0);
}
</style>
