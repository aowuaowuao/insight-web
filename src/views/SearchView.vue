<script setup lang="ts">
/**
 * 信息检索页。
 * 对照规范 2.2.1（二）模块五：搜索框、热门搜索、分类筛选、
 * 结果列表（相关度评分 + 关键词高亮）、分页（每页条数可切换）、空状态。
 *
 * 排序完全由后端决定（score = 0.7 标签 + 0.2 标题 + 0.1 正文），前端不再排序；
 * 分类筛选后仍按大类分组返回，这里按后端给的 groups 顺序展平，保持「类内相关度序」。
 *
 * 两种模式：
 * - 有关键词：GET /v1/search（每类取 100 条，前端分页）
 * - 无关键词且只选了一个大类：GET /v1/articles?category=（服务端分页，即「浏览该类全部文章」）
 * URL 上的 q 与 category 是唯一真相来源，刷新/分享能还原同一状态。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppPager from '@/components/AppPager.vue'
import ArticleCard from '@/components/ArticleCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { searchArticles, type SearchPayload } from '@/api/search'
import { listArticles } from '@/api/articles'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { CATEGORY_ORDER, categoryName } from '@/constants/categories'
import { listTags, tagName, type TagDef } from '@/api/tags'
import { readJson, writeJson } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/storageKeys'

interface CardItem {
  article_id: string
  title: string
  source: string
  published_at: string | null
  category: string | null
  score: number | null
  matchedTerms: string[]
}

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const HOT_KEYWORDS = [
  '项目申报',
  '资金补贴',
  '人才政策',
  '企业资质',
  '高新技术企业',
  '专精特新',
  '研发费用',
  '科技成果转化',
]

const route = useRoute()
const router = useRouter()
const latest = useLatestRequest()

const keyword = ref('')
const submitted = ref('')
const selectedCategories = ref<string[]>([])
/** 标签词表：后端只给标签 id，命中标签要渲染成中文名 */
const tags = ref<TagDef[]>([])
const payload = ref<SearchPayload | null>(null)
const browseItems = ref<CardItem[]>([])
const browseTotal = ref(0)
const loading = ref(false)
const error = ref('')
const page = ref(1)
const pageSize = ref(20)
/** 历史搜索（最多 10 条，规范模块五（1）） */
const searchHistory = ref<string[]>(readJson<string[]>(STORAGE_KEYS.SEARCH_HISTORY, []))
/** 本次检索耗时（毫秒），规范模块五（6）要求展示 */
const elapsedMs = ref<number | null>(null)
/** 高级搜索里的「仅看高相关度」：后端没有该参数，只能对已返回的条目按 score 过滤 */
const highRelevanceOnly = ref(false)
const suggestOpen = ref(false)
/** 键盘高亮的下标，-1 表示没有选中建议 */
const suggestIndex = ref(-1)

/** 上一次从 URL 应用过的状态，避免 watch 与 router.replace 互相触发死循环 */
let applied = { q: '', cats: [] as string[] }

const browseCategory = computed(() =>
  submitted.value === '' && selectedCategories.value.length === 1
    ? selectedCategories.value[0]
    : '',
)

const allSearchItems = computed<CardItem[]>(() => {
  const groups = payload.value?.groups ?? []
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      article_id: item.article_id,
      title: item.title,
      source: item.source,
      published_at: item.published_at,
      category: item.category,
      score: item.relevance.score,
      matchedTerms: item.relevance.matched_terms,
    })),
  )
})

/** 高级搜索的「仅看高相关度」：score 是后端给的相关度（0-1），只有检索模式有 */
const visibleSearchItems = computed<CardItem[]>(() =>
  highRelevanceOnly.value
    ? allSearchItems.value.filter((item) => (item.score ?? 0) >= 0.8)
    : allSearchItems.value,
)

const cards = computed<CardItem[]>(() => {
  if (browseCategory.value) return browseItems.value
  const start = (page.value - 1) * pageSize.value
  return visibleSearchItems.value.slice(start, start + pageSize.value)
})

/** 总条数：检索模式用后端 total（可能大于前端拿到的条数），浏览模式用列表 meta.total */
const totalCount = computed(() =>
  browseCategory.value ? browseTotal.value : (payload.value?.total ?? 0),
)
/** 前端实际拿到的条数，只有检索模式会与 totalCount 不同 */
const loadedCount = computed(() =>
  browseCategory.value ? browseTotal.value : visibleSearchItems.value.length,
)
const totalPages = computed(() => Math.max(1, Math.ceil(loadedCount.value / pageSize.value)))

const statusText = computed(() => {
  if (loading.value) return '正在检索…'
  if (submitted.value) {
    const matched = payload.value?.matched_tags ?? []
    const tagPart = matched.length
      ? `，命中标签：${matched.map((id) => tagName(tags.value, id)).join('、')}`
      : ''
    if (!totalCount.value) return `没有找到与「${submitted.value}」相关的公告${tagPart}`
    const partial =
      loadedCount.value < totalCount.value ? `，当前展示前 ${loadedCount.value} 条` : ''
    const cost = elapsedMs.value === null ? '' : `，用时 ${elapsedMs.value} 毫秒`
    const high = highRelevanceOnly.value ? '，已按相关度 ≥ 80% 过滤当前结果' : ''
    return `关键词「${submitted.value}」共命中 ${totalCount.value} 条${partial}${tagPart}${cost}${high}`
  }
  if (browseCategory.value) {
    return `「${categoryName(browseCategory.value)}」共 ${browseTotal.value} 篇文章`
  }
  return '输入关键词开始检索，或从左侧选一个大类浏览该类全部文章。'
})

/** 输入过程中的实时建议（规范模块五（4））：历史搜索 + 热词，前缀/包含匹配，最多 8 条 */
const suggestions = computed(() => {
  const q = keyword.value.trim()
  if (!q) return []
  const pool = [...searchHistory.value, ...HOT_KEYWORDS]
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of pool) {
    if (out.length >= 8) break
    if (seen.has(item) || item === q || !item.includes(q)) continue
    seen.add(item)
    out.push(item)
  }
  return out
})

/** 只保留最近 10 条，重复关键词提到最前 */
function rememberSearch(word: string): void {
  const next = [word, ...searchHistory.value.filter((item) => item !== word)].slice(0, 10)
  searchHistory.value = next
  writeJson(STORAGE_KEYS.SEARCH_HISTORY, next)
}

function clearHistory(): void {
  searchHistory.value = []
  writeJson(STORAGE_KEYS.SEARCH_HISTORY, [])
}

function pickSuggestion(word: string): void {
  suggestOpen.value = false
  suggestIndex.value = -1
  keyword.value = word
  submit()
}

/** ↑/↓ 在建议间移动，Enter 选中，Esc 关闭（规范要求键盘可达） */
function onInputKeydown(event: KeyboardEvent): void {
  const list = suggestions.value
  if (!list.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    suggestOpen.value = true
    suggestIndex.value = (suggestIndex.value + 1) % list.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    suggestOpen.value = true
    suggestIndex.value = (suggestIndex.value - 1 + list.length) % list.length
  } else if (event.key === 'Escape') {
    suggestOpen.value = false
    suggestIndex.value = -1
  } else if (event.key === 'Enter' && suggestOpen.value && suggestIndex.value >= 0) {
    event.preventDefault()
    pickSuggestion(list[suggestIndex.value])
  }
}

/** 焦点移出输入框且不是移进建议列表时才关闭，Tab 键因此可用 */
function onInputBlur(event: FocusEvent): void {
  const next = event.relatedTarget as HTMLElement | null
  if (next?.closest('.suggest')) return
  suggestOpen.value = false
  suggestIndex.value = -1
}

watch(suggestions, () => {
  suggestIndex.value = -1
})

function normalizeCategories(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list.filter((item): item is string => typeof item === 'string' && item !== '')
}

function sameCategories(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

async function run(): Promise<void> {
  const requestId = latest.next()
  loading.value = true
  error.value = ''
  try {
    if (submitted.value) {
      const startedAt = performance.now()
      const result = await searchArticles(submitted.value, {
        perCategory: 100,
        categories: selectedCategories.value,
      })
      if (!latest.isCurrent(requestId)) return
      payload.value = result
      elapsedMs.value = Math.round(performance.now() - startedAt)
      rememberSearch(submitted.value)
      browseItems.value = []
      browseTotal.value = 0
    } else if (browseCategory.value) {
      const result = await listArticles({
        category: browseCategory.value,
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
      })
      if (!latest.isCurrent(requestId)) return
      browseItems.value = result.items.map((item) => ({
        article_id: item.article_id,
        title: item.title,
        source: item.source,
        published_at: item.published_at,
        category: item.category,
        // 列表接口不返回相关度，分类置信度不冒充评分，这里不显示角标
        score: null,
        matchedTerms: [],
      }))
      browseTotal.value = result.total
      payload.value = null
    } else {
      payload.value = null
      elapsedMs.value = null
      browseItems.value = []
      browseTotal.value = 0
    }
  } catch (err) {
    if (!latest.isCurrent(requestId)) return
    error.value = err instanceof Error ? err.message : '检索失败，请稍后再试'
  } finally {
    if (latest.isCurrent(requestId)) loading.value = false
  }
}

/** 把 URL 上的 q / category 应用到组件状态；状态没变就不重复请求 */
function applyFromRoute(): void {
  const q = typeof route.query.q === 'string' ? route.query.q.trim() : ''
  const cats = normalizeCategories(route.query.category)
  if (q === applied.q && sameCategories(cats, applied.cats)) return
  applied = { q, cats }
  keyword.value = q
  submitted.value = q
  selectedCategories.value = cats
  page.value = 1
  void run()
}

function submit(): void {
  const q = keyword.value.trim()
  submitted.value = q
  page.value = 1
  applied = { q, cats: selectedCategories.value }
  void router.replace({
    query: { ...route.query, q: q === '' ? undefined : q },
  })
  void run()
}

function searchHot(word: string): void {
  keyword.value = word
  submit()
}

function toggleCategory(id: string): void {
  const next = selectedCategories.value.includes(id)
    ? selectedCategories.value.filter((item) => item !== id)
    : [...selectedCategories.value, id]
  page.value = 1
  applied = { q: submitted.value, cats: next }
  void router.replace({
    query: { ...route.query, category: next.length ? next : undefined },
  })
  void run()
}

function clearCategory(): void {
  page.value = 1
  applied = { q: submitted.value, cats: [] }
  void router.replace({ query: { ...route.query, category: undefined } })
  void run()
}

/** 清空关键词：同时作废在飞请求，避免旧结果回填到已清空的页面 */
function clear(): void {
  latest.next()
  loading.value = false
  keyword.value = ''
  submitted.value = ''
  payload.value = null
  elapsedMs.value = null
  browseItems.value = []
  browseTotal.value = 0
  error.value = ''
  page.value = 1
  applied = { q: '', cats: selectedCategories.value }
  void router.replace({ query: { ...route.query, q: undefined } })
  if (browseCategory.value) void run()
}

function changePage(next: number): void {
  page.value = next
  if (browseCategory.value) void run()
}

function changePageSize(size: number): void {
  pageSize.value = size
  page.value = 1
  if (browseCategory.value) void run()
}

watch(highRelevanceOnly, () => {
  page.value = 1
})

watch(() => route.fullPath, applyFromRoute)
onMounted(() => {
  void applyFromRoute()
  // 词表加载失败不影响检索，命中标签会退回显示标签 id
  void listTags()
    .then((list) => {
      tags.value = list
    })
    .catch(() => undefined)
})
</script>

<template>
  <section class="search">
    <header class="page-head">
      <h1>信息检索</h1>
      <p class="page-head__desc">
        输入关键词检索公告，结果按相关度排序并可按 6 个大类（含其他）过滤。
      </p>
    </header>

    <form class="searchbox" role="search" @submit.prevent="submit">
      <div class="searchbox__field">
        <label class="visually-hidden" for="search-input">搜索关键词</label>
        <input
          id="search-input"
          v-model="keyword"
          class="searchbox__input"
          type="search"
          maxlength="100"
          placeholder="如：项目申报、资金补贴、专精特新"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="search-suggest"
          :aria-expanded="suggestOpen && suggestions.length > 0"
          :aria-activedescendant="suggestIndex >= 0 ? `search-suggest-${suggestIndex}` : undefined"
          @focus="suggestOpen = true"
          @blur="onInputBlur"
          @keydown="onInputKeydown"
        />
        <ul
          v-if="suggestOpen && suggestions.length"
          id="search-suggest"
          class="suggest"
          role="listbox"
          aria-label="搜索建议"
        >
          <li
            v-for="(word, index) in suggestions"
            :id="`search-suggest-${index}`"
            :key="word"
            class="suggest__item"
            :class="{ 'suggest__item--active': index === suggestIndex }"
            role="option"
            :aria-selected="index === suggestIndex"
            @mousedown.prevent="pickSuggestion(word)"
            @mouseenter="suggestIndex = index"
          >
            {{ word }}
          </li>
        </ul>
      </div>
      <button class="btn btn--primary" type="submit" :disabled="loading">检索</button>
      <button v-if="submitted" class="btn btn--ghost" type="button" @click="clear">清空</button>
    </form>

    <div v-if="searchHistory.length" class="history">
      <span class="history__label">历史搜索</span>
      <button
        v-for="word in searchHistory"
        :key="word"
        class="chip"
        type="button"
        @click="searchHot(word)"
      >
        {{ word }}
      </button>
      <button class="btn btn--text" type="button" @click="clearHistory">清空历史</button>
    </div>

    <div class="hot">
      <span class="hot__label">热门搜索</span>
      <button
        v-for="word in HOT_KEYWORDS"
        :key="word"
        class="chip"
        type="button"
        @click="searchHot(word)"
      >
        {{ word }}
      </button>
    </div>

    <div class="filters">
      <span class="filters__label">分类筛选</span>
      <button
        v-for="id in CATEGORY_ORDER"
        :key="id"
        class="chip"
        :class="{ 'chip--active': selectedCategories.includes(id) }"
        type="button"
        :aria-pressed="selectedCategories.includes(id)"
        @click="toggleCategory(id)"
      >
        {{ categoryName(id) }}
      </button>
      <button
        v-if="selectedCategories.length"
        class="btn btn--text"
        type="button"
        @click="clearCategory"
      >
        清除筛选
      </button>
      <label class="check">
        <input v-model="highRelevanceOnly" type="checkbox" :disabled="!submitted" />
        仅看高相关度（≥80%）
      </label>
    </div>

    <p class="status" role="status">{{ statusText }}</p>

    <SkeletonList v-if="loading" :rows="5" />

    <EmptyState v-else-if="error" variant="error" title="检索失败" :description="error">
      <template #action>
        <button class="btn btn--primary" type="button" @click="run">重试</button>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="(submitted || browseCategory) && !cards.length"
      variant="no-result"
      title="没有找到相关公告"
      :description="`换个关键词试试，或去掉「${selectedCategories.map(categoryName).join('、') || '分类'}」筛选。`"
    />

    <EmptyState
      v-else-if="!submitted && !browseCategory"
      variant="no-data"
      title="输入关键词开始检索"
      description="也可以从分类筛选里选一个大类，浏览该类的全部文章。"
    />

    <template v-else>
      <div v-if="cards.length" class="results">
        <ArticleCard
          v-for="card in cards"
          :key="card.article_id"
          :article-id="card.article_id"
          :title="card.title"
          :source="card.source"
          :published-at="card.published_at"
          :category="card.category"
          :score="card.score"
          :matched-terms="card.matchedTerms"
        />
      </div>

      <AppPager
        :page="page"
        :total-pages="totalPages"
        :page-size="pageSize"
        :page-size-options="PAGE_SIZE_OPTIONS"
        :total="loadedCount"
        @update:page="changePage"
        @update:page-size="changePageSize"
      />
    </template>
  </section>
</template>

<style scoped>
.search {
  max-width: var(--layout-max-width);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-10);
}

.page-head h1 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-h1);
  line-height: var(--line-height-heading);
  color: var(--color-text);
}

.page-head__desc {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
}

.searchbox {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.searchbox__input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  font-family: inherit;
  font-size: var(--font-size-body);
  color: var(--color-text);
  background: var(--color-bg);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.searchbox__input:hover {
  border-color: var(--color-primary-hover);
}

.searchbox__input:focus {
  border-color: var(--color-primary);
  outline: 2px solid var(--color-primary-bg);
  outline-offset: 0;
}

.searchbox__field {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
}

.suggest {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: var(--space-1) 0;
  list-style: none;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  box-shadow: var(--shadow-popover, 0 6px 16px rgb(0 0 0 / 8%));
}

.suggest__item {
  display: block;
  padding: 8px var(--space-3);
  font-size: var(--font-size-body);
  color: var(--color-text);
  cursor: pointer;
}

.suggest__item:hover,
.suggest__item--active {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.history {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.history__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.check input {
  accent-color: var(--color-primary);
}

.check input:disabled + span,
.check input:disabled {
  cursor: not-allowed;
}

.hot,
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.hot__label,
.filters__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.chip {
  padding: 3px var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.chip:hover {
  border-color: var(--color-primary-hover);
  color: var(--color-primary);
}

.chip--active {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.status {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.results {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-base);
  font-family: inherit;
  font-size: var(--font-size-body);
  line-height: 1;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.searchbox .btn {
  height: 40px;
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.btn--primary:hover {
  background: var(--color-primary-hover);
}

.btn--primary:active {
  background: var(--color-primary-active);
}

.btn--ghost {
  border-color: var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
}

.btn--ghost:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn--text {
  height: auto;
  padding: 0;
  background: none;
  color: var(--color-primary);
}

.btn--text:hover {
  color: var(--color-primary-hover);
}

.btn:disabled {
  background: var(--color-split);
  border-color: var(--color-border);
  color: var(--color-text-disabled);
  cursor: not-allowed;
}
</style>
