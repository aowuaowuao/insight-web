<script setup lang="ts">
/**
 * 信息检索页：标题「智能信息检索」+ 搜索框
 * 目前用本地示例数据演示交互，接后端时把 search() 换成接口调用即可。
 */
import { computed, ref } from 'vue'

interface ResultItem {
  id: number
  title: string
  category: string
  summary: string
}

// 本地示例数据（真实项目删掉，换成接口）
const sampleData: ResultItem[] = [
  {
    id: 1,
    title: '项目申报流程指南',
    category: '项目申报',
    summary: '从注册账号、填报材料到提交评审的完整流程说明。',
  },
  {
    id: 2,
    title: '行业政策速览',
    category: '行业政策',
    summary: '汇总近期发布的行业政策文件与解读要点。',
  },
  {
    id: 3,
    title: '人才申报常见问题',
    category: '人才申报',
    summary: '申报条件、材料清单与常见退回原因整理。',
  },
  {
    id: 4,
    title: '企业资质认定说明',
    category: '企业资质',
    summary: '高企、专精特新等资质的认定标准与准备要点。',
  },
  {
    id: 5,
    title: '资金补贴申报入口',
    category: '资金补贴',
    summary: '各类专项资金、奖补政策的申报入口与时间节点。',
  },
]

const keyword = ref('')
const submitted = ref('')

const results = computed<ResultItem[]>(() => {
  const q = submitted.value.trim().toLowerCase()
  if (!q) return []
  return sampleData.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q),
  )
})

const hasSearched = computed(() => submitted.value.trim() !== '')

function search(): void {
  submitted.value = keyword.value
}

function clear(): void {
  keyword.value = ''
  submitted.value = ''
}

function useHotWord(word: string): void {
  keyword.value = word
  search()
}
</script>

<template>
  <section class="search">
    <header class="search__head">
      <h1 class="search__title">智能信息检索</h1>
      <p class="search__subtitle">输入关键词，快速找到你关心的信息</p>
    </header>

    <!-- 搜索框 -->
    <form class="search__box" role="search" @submit.prevent="search">
      <span class="search__icon" aria-hidden="true">🔍</span>
      <input
        v-model="keyword"
        class="search__input"
        type="search"
        placeholder="请输入关键词，例如：项目申报、资金补贴…"
        aria-label="搜索关键词"
        autocomplete="off"
      />
      <button v-if="keyword" class="search__clear" type="button" aria-label="清空" @click="clear">
        ✕
      </button>
      <button class="search__btn" type="submit">搜索</button>
    </form>

    <!-- 热门关键词 -->
    <div class="search__hot">
      <span class="search__hot-label">热门：</span>
      <button
        v-for="word in ['项目申报', '行业政策', '人才申报', '资金补贴']"
        :key="word"
        class="search__chip"
        type="button"
        @click="useHotWord(word)"
      >
        {{ word }}
      </button>
    </div>

    <!-- 结果区 -->
    <div class="search__results" aria-live="polite">
      <template v-if="hasSearched">
        <p class="search__status">
          关于「<strong>{{ submitted }}</strong
          >」的检索结果：共 <strong>{{ results.length }}</strong> 条
        </p>

        <ul v-if="results.length" class="result-list">
          <li v-for="item in results" :key="item.id" class="result">
            <span class="result__tag">{{ item.category }}</span>
            <h2 class="result__title">{{ item.title }}</h2>
            <p class="result__summary">{{ item.summary }}</p>
          </li>
        </ul>

        <p v-else class="search__empty">没有找到相关内容，换个关键词试试吧。</p>
      </template>

      <p v-else class="search__placeholder">搜索结果会显示在这里</p>
    </div>
  </section>
</template>

<style scoped>
.search {
  max-width: 760px;
  margin: 0 auto;
  padding-top: 2.5rem;
}

.search__head {
  text-align: center;
  margin-bottom: 2rem;
}

.search__title {
  margin: 0 0 0.6rem;
  font-size: clamp(1.7rem, 3.6vw, 2.3rem);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.search__subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 0.97rem;
}

/* ── 搜索框 ───────────────────────────────────────── */
.search__box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.5rem 0.45rem 1rem;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.search__box:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.search__icon {
  font-size: 1rem;
  opacity: 0.7;
}

.search__input {
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0.98rem;
  font-family: inherit;
  outline: none;
}

.search__input::placeholder {
  color: var(--muted);
  opacity: 0.8;
}

.search__clear {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.3rem;
  line-height: 1;
}

.search__clear:hover {
  color: var(--fg);
}

.search__btn {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.18s ease;
}

.search__btn:hover {
  background: #2563eb;
}

/* ── 热门词 ───────────────────────────────────────── */
.search__hot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.88rem;
}

.search__hot-label {
  color: var(--muted);
}

.search__chip {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 0.84rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.18s ease;
}

.search__chip:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

/* ── 结果区 ───────────────────────────────────────── */
.search__results {
  margin-top: 2rem;
}

.search__status {
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.search__status strong {
  color: var(--fg);
}

.result-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.8rem;
}

.result {
  padding: 1.1rem 1.3rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: border-color 0.18s ease;
}

.result:hover {
  border-color: rgba(59, 130, 246, 0.4);
}

.result__tag {
  display: inline-block;
  padding: 0.1em 0.6em;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  font-size: 0.76rem;
  margin-bottom: 0.5rem;
}

.result__title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.result__summary {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.65;
}

.search__empty,
.search__placeholder {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
