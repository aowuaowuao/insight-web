<script setup lang="ts">
/**
 * 信息检索页：调用后端 GET /v1/search
 * - 结果由后端按 5 大类分组并排好序，前端只负责展平 + 分页渲染
 * - 一页 20 条
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchArticles, type SearchItem, type SearchPayload } from '@/api/search'
import { categoryName } from '@/constants/categories'
import { sourceName } from '@/constants/sources'

/** 每页条数（需求：一页 20 条） */
const PAGE_SIZE = 20

const route = useRoute()
const router = useRouter()

/** 从分类浏览页跳进来时带的类过滤（单个大类 id） */
const category = computed<string>(() => {
  const raw = route.query.category
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
})

interface FlatItem extends SearchItem {
  category: string
  categoryLabel: string
}

const keyword = ref('')
const submitted = ref('')
const loading = ref(false)
const error = ref('')
const payload = ref<SearchPayload | null>(null)
const page = ref(1)

/** 把 groups 按后端给的顺序展平成一维列表 */
const flatItems = computed<FlatItem[]>(() => {
  if (!payload.value) return []
  return payload.value.groups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      category: group.category,
      categoryLabel: categoryName(group.category),
    })),
  )
})

const totalPages = computed(() => Math.max(1, Math.ceil(flatItems.value.length / PAGE_SIZE)))

const pagedItems = computed<FlatItem[]>(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return flatItems.value.slice(start, start + PAGE_SIZE)
})

const hasSearched = computed(() => submitted.value !== '')

/** 页码按钮：最多显示当前页附近 5 个 */
const pageNumbers = computed<number[]>(() => {
  const total = totalPages.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.min(Math.max(1, page.value - 2), total - 4)
  return Array.from({ length: 5 }, (_, i) => start + i)
})

async function search(): Promise<void> {
  const q = keyword.value.trim()
  if (!q) {
    error.value = '请输入检索关键词'
    return
  }

  loading.value = true
  error.value = ''

  try {
    // per_category 取后端上限 100：先尽量多取，再在前端按 20 条/页切
    payload.value = await searchArticles(q, {
      perCategory: 100,
      categories: category.value ? [category.value] : [],
    })
    submitted.value = q
    page.value = 1
  } catch (e) {
    error.value = e instanceof Error ? e.message : '检索失败，请稍后重试'
    payload.value = null
  } finally {
    loading.value = false
  }
}

function clear(): void {
  keyword.value = ''
  submitted.value = ''
  payload.value = null
  error.value = ''
  page.value = 1
}

/** 从分类页带过来的类过滤，用户可一键取消；已经搜过就按原关键词重新检索一次 */
async function clearCategory(): Promise<void> {
  const query = { ...route.query }
  delete query.category
  await router.replace({ name: 'search', query })
  page.value = 1
  if (submitted.value) {
    keyword.value = submitted.value
    await search()
  } else {
    payload.value = null
  }
}

/** 带类过滤进入时自动检索（关键词取 URL 里的 q，没有就等用户输入） */
onMounted(() => {
  const rawQ = route.query.q
  const q = typeof rawQ === 'string' ? rawQ : ''
  if (q.trim()) {
    keyword.value = q
    void search()
  }
})

function useHotWord(word: string): void {
  keyword.value = word
  void search()
}

function goPage(target: number): void {
  if (target < 1 || target > totalPages.value || target === page.value) return
  page.value = target
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function formatDate(value: string | null): string {
  if (!value) return '暂无日期'
  return value.replace('T', ' ').slice(0, 10)
}

/** 单击结果 -> 文章详情页 */
function openArticle(articleId: string): void {
  router.push({ name: 'article', params: { id: articleId } })
}
</script>

<template>
  <section class="search">
    <header class="search__head">
      <h1 class="search__title">智能信息检索</h1>
      <p class="search__subtitle">输入关键词，快速找到你关心的信息</p>
      <p v-if="category" class="search__filter">
        仅检索「<strong>{{ categoryName(category) }}</strong>」
        <button type="button" class="search__filter-clear" @click="clearCategory">取消筛选</button>
      </p>
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
      <button class="search__btn" type="submit" :disabled="loading">
        {{ loading ? '检索中…' : '搜索' }}
      </button>
    </form>

    <!-- 热门关键词 -->
    <div class="search__hot">
      <span class="search__hot-label">热门：</span>
      <button
        v-for="word in ['项目申报', '行业政策', '人才申报', '资金补贴']"
        :key="word"
        class="search__chip"
        type="button"
        :disabled="loading"
        @click="useHotWord(word)"
      >
        {{ word }}
      </button>
    </div>

    <!-- 错误 -->
    <p v-if="error" class="search__error" role="alert">{{ error }}</p>

    <!-- 结果区 -->
    <div class="search__results" aria-live="polite">
      <template v-if="loading">
        <p class="search__placeholder">正在向服务器检索，请稍候…</p>
      </template>

      <template v-else-if="hasSearched && payload">
        <p class="search__status">
          关于「<strong>{{ submitted }}</strong
          >」共找到 <strong>{{ flatItems.length }}</strong> 条结果
          <span v-if="payload.total > flatItems.length" class="search__status-extra">
            （候选库命中约 {{ payload.total }} 条）
          </span>
        </p>

        <ul v-if="pagedItems.length" class="result-list">
          <li
            v-for="item in pagedItems"
            :key="item.article_id"
            class="result"
            role="button"
            tabindex="0"
            @click="openArticle(item.article_id)"
            @keydown.enter="openArticle(item.article_id)"
          >
            <div class="result__head">
              <span class="result__tag">{{ item.categoryLabel }}</span>
              <span class="result__source">来源：{{ sourceName(item.source) }}</span>
              <span class="result__date">{{ formatDate(item.published_at) }}</span>
              <span class="result__score" :title="`相关度 ${item.relevance.score}`">
                相关度 {{ (item.relevance.score * 100).toFixed(0) }}%
              </span>
            </div>
            <h2 class="result__title">{{ item.title }}</h2>
            <p v-if="item.relevance.matched_terms.length" class="result__terms">
              命中：{{ item.relevance.matched_terms.join(' / ') }}
            </p>
            <span class="result__more">查看详情 →</span>
          </li>
        </ul>

        <p v-else class="search__empty">没有找到相关内容，换个关键词试试吧。</p>

        <!-- 分页：一页 20 条 -->
        <nav v-if="totalPages > 1" class="pager" aria-label="分页">
          <button class="pager__btn" type="button" :disabled="page === 1" @click="goPage(page - 1)">
            上一页
          </button>

          <button
            v-for="n in pageNumbers"
            :key="n"
            class="pager__num"
            type="button"
            :class="{ 'pager__num--active': n === page }"
            @click="goPage(n)"
          >
            {{ n }}
          </button>

          <button
            class="pager__btn"
            type="button"
            :disabled="page === totalPages"
            @click="goPage(page + 1)"
          >
            下一页
          </button>

          <span class="pager__info"
            >第 {{ page }} / {{ totalPages }} 页，每页 {{ PAGE_SIZE }} 条</span
          >
        </nav>
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

.search__filter {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.7rem 0 0;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  font-size: 0.84rem;
}

.search__filter-clear {
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 0.8rem;
  text-decoration: underline;
  cursor: pointer;
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

.search__btn:hover:not(:disabled) {
  background: #2563eb;
}

.search__btn:disabled {
  opacity: 0.6;
  cursor: progress;
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

.search__chip:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #3b82f6;
}

/* ── 错误 ─────────────────────────────────────────── */
.search__error {
  margin: 1.2rem 0 0;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 0.88rem;
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

.search__status-extra {
  font-size: 0.82rem;
  opacity: 0.8;
}

.result-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.8rem;
}

.result {
  position: relative;
  padding: 1.05rem 1.3rem 1.6rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.result:hover,
.result:focus-visible {
  border-color: rgba(59, 130, 246, 0.45);
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(59, 130, 246, 0.08);
  outline: none;
}

.result__source {
  color: #3b82f6;
  opacity: 0.85;
}

.result__more {
  position: absolute;
  right: 1.3rem;
  bottom: 0.75rem;
  color: #3b82f6;
  font-size: 0.8rem;
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.18s ease;
}

.result:hover .result__more,
.result:focus-visible .result__more {
  opacity: 1;
  transform: translateX(0);
}

.result__head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 0.5rem;
  font-size: 0.76rem;
}

.result__tag {
  padding: 0.1em 0.6em;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.result__date {
  color: var(--muted);
}

.result__score {
  margin-left: auto;
  color: var(--muted);
}

.result__title {
  margin: 0;
  font-size: 1rem;
  line-height: 1.55;
}

.result__terms {
  margin: 0.45rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.search__empty,
.search__placeholder {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}

/* ── 分页 ─────────────────────────────────────────── */
.pager {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 1.6rem;
  padding-top: 1.2rem;
  border-top: 1px solid var(--border);
}

.pager__btn,
.pager__num {
  padding: 0.38rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 0.86rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.16s ease;
}

.pager__btn:hover:not(:disabled),
.pager__num:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.pager__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pager__num--active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.pager__num--active:hover {
  color: #fff;
}

.pager__info {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.82rem;
}
</style>
