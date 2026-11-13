<script setup lang="ts">
/**
 * 信息检索页：调用后端 GET /v1/search
 * - 结果由后端按 6 个大类分组并排好序，前端只负责展平 + 分页渲染
 * - 一页 20 条
 * - 带 ?category= 进来且没有关键词时，进入「该类全部文章」浏览模式
 *   （走 GET /v1/articles，后端分页），避免「查看全部」落到空页
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchArticles, type SearchItem, type SearchPayload } from '@/api/search'
import { listArticles, type ArticleListPage, type ArticleListItem } from '@/api/articles'
import { categoryName } from '@/constants/categories'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { sourceName } from '@/constants/sources'

/** 每页条数（需求：一页 20 条） */
const PAGE_SIZE = 20

const route = useRoute()
const router = useRouter()

/** 请求序号守卫：连点热门词 / 快速改关键词时，先发后到的响应会被丢弃 */
const latest = useLatestRequest()

/** 从分类浏览页跳进来时带的类过滤（URL 里可以有多个 category） */
const selectedCategories = computed<string[]>(() => {
  const raw = route.query.category
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
  return list.filter((value): value is string => typeof value === 'string' && value !== '')
})

const selectedLabel = computed(() => selectedCategories.value.map(categoryName).join('、'))

interface FlatItem extends SearchItem {
  category: string
  categoryLabel: string
}

/** 搜索与浏览两种模式共用的渲染单元，模板只认这个 */
interface DisplayItem {
  article_id: string
  title: string
  source: string
  published_at: string | null
  categoryLabel: string
  /** 相关度百分比：只有搜索模式有 */
  score: number | null
  matchedTerms: string[]
}

const keyword = ref('')
const submitted = ref('')
const loading = ref(false)
const error = ref('')
const payload = ref<SearchPayload | null>(null)
const browsePage = ref<ArticleListPage | null>(null)
const page = ref(1)

/** 没有已提交的关键词、但有且只有一个大类 -> 浏览该类的全部文章 */
const browseCategory = computed<string>(() =>
  !submitted.value && selectedCategories.value.length === 1 ? selectedCategories.value[0] : '',
)
const browseMode = computed(() => browseCategory.value !== '')

const hasSearched = computed(() => submitted.value !== '')

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

function toDisplay(item: ArticleListItem | FlatItem): DisplayItem {
  const relevance = 'relevance' in item ? item.relevance : null
  return {
    article_id: item.article_id,
    title: item.title,
    source: item.source,
    published_at: item.published_at,
    categoryLabel: 'categoryLabel' in item ? item.categoryLabel : categoryName(item.category ?? ''),
    score: relevance ? relevance.score : null,
    matchedTerms: relevance ? relevance.matched_terms : [],
  }
}

const totalPages = computed(() => {
  const total = browseMode.value ? (browsePage.value?.total ?? 0) : flatItems.value.length
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
})

/** 当前页要渲染的条目：浏览模式由后端分页，搜索模式在前端切片 */
const visibleItems = computed<DisplayItem[]>(() => {
  if (browseMode.value) return (browsePage.value?.items ?? []).map(toDisplay)
  const start = (page.value - 1) * PAGE_SIZE
  return flatItems.value.slice(start, start + PAGE_SIZE).map(toDisplay)
})

/** 页码按钮：最多显示当前页附近 5 个 */
const pageNumbers = computed<number[]>(() => {
  const total = totalPages.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.min(Math.max(1, page.value - 2), total - 4)
  return Array.from({ length: 5 }, (_, i) => start + i)
})

/** 浏览模式：拉当前大类的第 page 页文章（后端分页，total 是真实总数） */
async function loadBrowse(): Promise<void> {
  if (!browseCategory.value) {
    // 退出浏览模式也算一次状态切换：作废在飞请求，否则它回来会把 browsePage 写脏。
    // 作废后那个请求的 finally 不会再复位 loading，这里必须自己收尾，否则页面永远停在「正在检索」
    latest.next()
    loading.value = false
    browsePage.value = null
    return
  }

  const requestId = latest.next()
  loading.value = true
  error.value = ''
  try {
    const res = await listArticles({
      category: browseCategory.value,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    if (!latest.isCurrent(requestId)) return
    browsePage.value = res
  } catch (e) {
    if (!latest.isCurrent(requestId)) return
    browsePage.value = null
    error.value = e instanceof Error ? e.message : '加载该类文章失败，请稍后重试'
  } finally {
    if (latest.isCurrent(requestId)) loading.value = false
  }
}

async function search(): Promise<void> {
  const q = keyword.value.trim()
  if (!q) {
    error.value = '请输入检索关键词'
    return
  }

  const requestId = latest.next()
  loading.value = true
  error.value = ''

  try {
    // per_category 取后端上限 100：先尽量多取，再在前端按 20 条/页切
    const result = await searchArticles(q, {
      perCategory: 100,
      categories: [...selectedCategories.value],
    })
    if (!latest.isCurrent(requestId)) return
    payload.value = result
    browsePage.value = null
    submitted.value = q
    page.value = 1
    // 把关键词写回 URL：刷新、分享链接都能复现这次检索
    if (route.query.q !== q) {
      void router.replace({ query: { ...route.query, q } })
    }
  } catch (e) {
    if (!latest.isCurrent(requestId)) return
    error.value = e instanceof Error ? e.message : '检索失败，请稍后重试'
    payload.value = null
  } finally {
    if (latest.isCurrent(requestId)) loading.value = false
  }
}

/**
 * 清空关键词：有类过滤就回到浏览模式，否则回到占位。
 * 同时作废在飞请求并把 URL 上的 q 删掉——否则旧响应回来会覆盖刚清空的结果，
 * 刷新后 URL 里的 q 又会让页面自己检索起来，与「URL 是唯一真相」冲突。
 */
function clear(): void {
  latest.next()
  loading.value = false
  keyword.value = ''
  submitted.value = ''
  payload.value = null
  error.value = ''
  page.value = 1
  if (route.query.q !== undefined) {
    void router.replace({ query: { ...route.query, q: undefined } })
  }
  if (browseCategory.value) void loadBrowse()
}

/**
 * 从分类页带过来的类过滤，用户可一键取消。
 * 只改 URL，真正的重新加载交给下面的 watch，避免「手动重查 + watch 重查」发两次请求。
 */
async function clearCategory(): Promise<void> {
  const query = { ...route.query }
  delete query.category
  await router.replace({ name: 'search', query })
}

/**
 * 类过滤变化（取消筛选、导航栏点「信息检索」、从 A 类跳到 B 类）时重新加载。
 * Vue Router 会复用组件实例，不重新挂载，所以必须在这里兜住，否则筛选标签和结果会对不上。
 */
watch(
  () => selectedCategories.value.join(','),
  () => {
    page.value = 1
    if (submitted.value) {
      keyword.value = submitted.value
      void search()
    } else {
      payload.value = null
      void loadBrowse()
    }
  },
)

/** 带 ?q= 或 ?category= 进入时自动加载对应视图 */
onMounted(() => {
  const rawQ = route.query.q
  const q = typeof rawQ === 'string' ? rawQ : ''
  if (q.trim()) {
    keyword.value = q
    void search()
  } else {
    void loadBrowse()
  }
})

function useHotWord(word: string): void {
  keyword.value = word
  void search()
}

function goPage(target: number): void {
  if (target < 1 || target > totalPages.value || target === page.value) return
  page.value = target
  if (browseMode.value) void loadBrowse()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function formatDate(value: string | null): string {
  if (!value) return '暂无日期'
  return value.replace('T', ' ').slice(0, 10)
}
</script>

<template>
  <section class="search">
    <header class="search__head">
      <h1 class="search__title">智能信息检索</h1>
      <p class="search__subtitle">输入关键词，快速找到你关心的信息</p>
      <p v-if="selectedCategories.length" class="search__filter">
        仅检索「<strong>{{ selectedLabel }}</strong>」
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

      <!-- 浏览器模式：某一大类的全部文章 -->
      <template v-else-if="browseMode">
        <p class="search__status">
          「<strong>{{ selectedLabel }}</strong
          >」共 <strong>{{ browsePage?.total ?? 0 }}</strong> 篇文章
          <span class="search__status-extra">（输入关键词可在该类内检索）</span>
        </p>

        <ul v-if="visibleItems.length" class="result-list">
          <li v-for="item in visibleItems" :key="item.article_id" class="result-item">
            <RouterLink
              :to="{ name: 'article', params: { id: item.article_id } }"
              class="result"
            >
              <div class="result__head">
                <span class="result__tag">{{ item.categoryLabel }}</span>
                <span class="result__source">来源：{{ sourceName(item.source) }}</span>
                <span class="result__date">{{ formatDate(item.published_at) }}</span>
              </div>
              <h2 class="result__title">{{ item.title }}</h2>
              <span class="result__more">查看详情 →</span>
            </RouterLink>
          </li>
        </ul>

        <p v-else class="search__empty">该类暂时没有文章。</p>
      </template>

      <!-- 检索模式：后端按相关度排好序的命中结果 -->
      <template v-else-if="hasSearched && payload">
        <p class="search__status">
          关于「<strong>{{ submitted }}</strong
          >」可展示 <strong>{{ flatItems.length }}</strong> 条结果
          <span v-if="payload.total > flatItems.length" class="search__status-extra">
            （候选库命中约 {{ payload.total }} 条，每个大类最多取回 100 条）
          </span>
        </p>

        <ul v-if="visibleItems.length" class="result-list">
          <li v-for="item in visibleItems" :key="item.article_id" class="result-item">
            <RouterLink
              :to="{ name: 'article', params: { id: item.article_id } }"
              class="result"
            >
              <div class="result__head">
                <span class="result__tag">{{ item.categoryLabel }}</span>
                <span class="result__source">来源：{{ sourceName(item.source) }}</span>
                <span class="result__date">{{ formatDate(item.published_at) }}</span>
                <span
                  v-if="item.score !== null"
                  class="result__score"
                  :title="`相关度 ${item.score}`"
                >
                  相关度 {{ (item.score * 100).toFixed(0) }}%
                </span>
              </div>
              <h2 class="result__title">{{ item.title }}</h2>
              <p v-if="item.matchedTerms.length" class="result__terms">
                命中：{{ item.matchedTerms.join(' / ') }}
              </p>
              <span class="result__more">查看详情 →</span>
            </RouterLink>
          </li>
        </ul>

        <p v-else class="search__empty">没有找到相关内容，换个关键词试试吧。</p>
      </template>

      <p v-else class="search__placeholder">
        {{ error ? '检索失败，请重试或换个关键词。' : '搜索结果会显示在这里' }}
      </p>

      <!-- 分页：一页 20 条 -->
      <nav v-if="(browseMode || hasSearched) && totalPages > 1" class="pager" aria-label="分页">
        <button class="pager__btn" type="button" :disabled="page === 1" @click="goPage(page - 1)">
          上一页
        </button>

        <button
          v-for="n in pageNumbers"
          :key="n"
          class="pager__num"
          type="button"
          :class="{ 'pager__num--active': n === page }"
          :aria-current="n === page ? 'page' : undefined"
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

        <span class="pager__info">第 {{ page }} / {{ totalPages }} 页，每页 {{ PAGE_SIZE }} 条</span>
      </nav>
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

.result-item {
  display: block;
}

.result {
  display: block;
  position: relative;
  padding: 1.05rem 1.3rem 1.6rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
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
