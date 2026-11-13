<script setup lang="ts">
/**
 * 信息检索页。
 * 对照规范 2.2.1（二）模块五：搜索框与清除、历史搜索（≤10）、高级搜索面板、
 * 结果列表（相关度高亮 + 评分）、搜索建议（≤8）、空状态与热词、搜索结果统计
 * （共 X 条 / 用时 Y 毫秒）、每页条数 10/20/50 切换。
 *
 * 排序完全由后端决定（score = 0.7 标签 + 0.2 标题 + 0.1 正文），前端不再排序；
 * 时间范围与发布单位同样交给后端过滤（时间按真实时刻比较，混时区站点不会错位）。
 *
 * 两种模式：
 * - 有关键词：GET /v1/search（每类取 100 条，前端分页）
 * - 无关键词且只选了一个大类：GET /v1/articles?category=（服务端分页，即「浏览该类全部文章」）
 * URL 上的 q / category / source / from / to / sort / high 是唯一真相来源，
 * 刷新、分享、浏览器前进后退都能还原同一状态。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppPager from '@/components/AppPager.vue'
import ArticleCard from '@/components/ArticleCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { searchArticles, type SearchPayload, type SearchSort } from '@/api/search'
import { listArticles, type ArticleSort } from '@/api/articles'
import { listSources, type SourceStat } from '@/api/sources'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { CATEGORY_ORDER, categoryName } from '@/constants/categories'
import { sourceName } from '@/constants/sources'
import { listTags, tagName, type TagDef } from '@/api/tags'
import { readJson, writeJson } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { isRangeInverted, resolveRange, type TimeRange } from '@/utils/dateRange'

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

/** 时间范围快捷项；custom 才用下面两个日期输入框 */
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '全部时间' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'custom', label: '自定义' },
]

/** 类内排序；浏览模式没有相关度（列表接口不返回），会退回最新发布 */
const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: '相关度优先' },
  { value: 'published_desc', label: '最新发布' },
  { value: 'published_asc', label: '最早发布' },
]

const route = useRoute()
const router = useRouter()
const latest = useLatestRequest()

const keyword = ref('')
const submitted = ref('')
const selectedCategories = ref<string[]>([])
/** 标签词表：后端只给标签 id，命中标签要渲染成中文名 */
const tags = ref<TagDef[]>([])
/** 发布单位（站点）候选：来自后端 /v1/sources，不再维护前端静态清单 */
const sources = ref<SourceStat[]>([])
const selectedSources = ref<string[]>([])
const payload = ref<SearchPayload | null>(null)
const browseItems = ref<CardItem[]>([])
const browseTotal = ref(0)
const browseUndated = ref(0)
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
/** 高级搜索面板展开状态（默认收起，规范要求「展开高级搜索面板」） */
const advOpen = ref(false)

const timeRange = ref<TimeRange>('all')
const customFrom = ref('')
const customTo = ref('')
const sort = ref<SearchSort>('relevance')

/** 上一次从 URL 应用过的状态签名，避免 watch 与 router.replace 互相触发死循环 */
let appliedSignature = ''

const browseCategory = computed(() =>
  submitted.value === '' && selectedCategories.value.length === 1
    ? selectedCategories.value[0]
    : '',
)

/** 当前生效的时间区间（YYYY-MM-DD，空串表示不限） */
const activeRange = computed(() => resolveRange(timeRange.value, customFrom.value, customTo.value))
/** 自定义范围起止颠倒：不拦的话后端按 [from, to) 返回空集，用户以为是没数据 */
const rangeInvalid = computed(() => isRangeInverted(activeRange.value))

/**
 * 浏览模式（/v1/articles）没有 relevance 排序：传进来会退化成最新发布，
 * 界面上的「相关度优先」在这种模式下也置灰，不给出无效选项。
 */
const effectiveBrowseSort = computed<ArticleSort>(() =>
  sort.value === 'published_asc' ? 'published_asc' : 'published_desc',
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

/** 已生效的筛选条件摘要，拼在状态行里，用户一眼能看出为什么条数变少了 */
const filterSummary = computed(() => {
  const parts: string[] = []
  if (timeRange.value !== 'all') {
    const range = activeRange.value
    if (range.from && range.to) parts.push('时间 ' + range.from + ' 至 ' + range.to)
    else if (range.from) parts.push('时间 ' + range.from + ' 起')
    else if (range.to) parts.push('时间截至 ' + range.to)
  }
  if (selectedSources.value.length) {
    parts.push('发布单位 ' + selectedSources.value.map((id) => sourceName(id)).join('、'))
  }
  if (selectedCategories.value.length) {
    parts.push('分类 ' + selectedCategories.value.map(categoryName).join('、'))
  }
  return parts.join('，')
})

/** 处于非默认状态的筛选项个数，用于折叠态上的角标 */
const activeFilterCount = computed(() => {
  let count = selectedCategories.value.length
  if (timeRange.value !== 'all') count += 1
  count += selectedSources.value.length
  if (highRelevanceOnly.value) count += 1
  if (sort.value !== 'relevance') count += 1
  return count
})

const statusText = computed(() => {
  if (loading.value) return '正在检索…'
  const filterPart = filterSummary.value ? '（' + filterSummary.value + '）' : ''
  if (submitted.value) {
    const matched = payload.value?.matched_tags ?? []
    const tagPart = matched.length
      ? '，命中标签：' + matched.map((id) => tagName(tags.value, id)).join('、')
      : ''
    if (!totalCount.value) {
      return '没有找到与「' + submitted.value + '」相关的公告' + filterPart + tagPart
    }
    const partial =
      loadedCount.value < totalCount.value ? '，当前展示前 ' + loadedCount.value + ' 条' : ''
    const cost = elapsedMs.value === null ? '' : '，用时 ' + elapsedMs.value + ' 毫秒'
    const high = highRelevanceOnly.value ? '，已按相关度 ≥ 80% 过滤当前结果' : ''
    return (
      '关键词「' +
      submitted.value +
      '」共找到 ' +
      totalCount.value +
      ' 条结果' +
      filterPart +
      partial +
      tagPart +
      cost +
      high
    )
  }
  if (browseCategory.value) {
    const undated =
      browseUndated.value > 0 ? '（另有 ' + browseUndated.value + ' 篇无发布时间未计入）' : ''
    return (
      '「' +
      categoryName(browseCategory.value) +
      '」共 ' +
      browseTotal.value +
      ' 篇文章' +
      filterPart +
      undated
    )
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

function normalizeList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list.filter((item): item is string => typeof item === 'string' && item !== '')
}

const normalizeCategories = normalizeList

function isSearchSort(value: unknown): value is SearchSort {
  return value === 'relevance' || value === 'published_desc' || value === 'published_asc'
}

interface RouteState {
  q: string
  cats: string[]
  sources: string[]
  from: string
  to: string
  sort: SearchSort
  high: boolean
}

function signatureOf(state: RouteState): string {
  return JSON.stringify(state)
}

/** 从 URL 解析筛选状态；非法值一律退回默认，不抛错（URL 可能是手改的） */
function stateFromRoute(): RouteState {
  const q = typeof route.query.q === 'string' ? route.query.q.trim() : ''
  const cats = normalizeCategories(route.query.category)
  const srcs = normalizeList(route.query.source)
  const from = typeof route.query.from === 'string' ? route.query.from.trim() : ''
  const to = typeof route.query.to === 'string' ? route.query.to.trim() : ''
  const sortRaw = route.query.sort
  const nextSort: SearchSort = isSearchSort(sortRaw) ? sortRaw : 'relevance'
  const high = route.query.high === '1'
  return { q, cats, sources: srcs, from, to, sort: nextSort, high }
}

/** 由当前状态生成查询串（空值即删掉，保持 URL 干净可分享） */
function queryOf(state: RouteState): Record<string, string | string[] | undefined> {
  return {
    q: state.q === '' ? undefined : state.q,
    category: state.cats.length ? state.cats : undefined,
    source: state.sources.length ? state.sources : undefined,
    from: state.from === '' ? undefined : state.from,
    to: state.to === '' ? undefined : state.to,
    sort: state.sort === 'relevance' ? undefined : state.sort,
    high: state.high ? '1' : undefined,
  }
}

function currentState(): RouteState {
  const range = activeRange.value
  return {
    q: submitted.value,
    cats: selectedCategories.value,
    sources: selectedSources.value,
    from: timeRange.value === 'all' ? '' : range.from,
    to: timeRange.value === 'all' ? '' : range.to,
    sort: sort.value,
    high: highRelevanceOnly.value,
  }
}

/** 状态变化后统一走这里：先同步 URL，再发请求（两者用同一个签名去重） */
function syncAndRun(): void {
  const state = currentState()
  appliedSignature = signatureOf(state)
  const nextQuery = queryOf(state)
  if (JSON.stringify(route.query) !== JSON.stringify(nextQuery)) {
    void router.replace({ query: nextQuery })
  }
  void run()
}

async function run(): Promise<void> {
  const requestId = latest.next()
  loading.value = true
  error.value = ''
  try {
    const range = timeRange.value === 'all' ? { from: '', to: '' } : activeRange.value
    if (submitted.value) {
      const startedAt = performance.now()
      const result = await searchArticles(submitted.value, {
        perCategory: 100,
        categories: selectedCategories.value,
        sources: selectedSources.value,
        publishedFrom: range.from || undefined,
        publishedTo: range.to || undefined,
        sort: sort.value,
      })
      if (!latest.isCurrent(requestId)) return
      payload.value = result
      elapsedMs.value = Math.round(performance.now() - startedAt)
      rememberSearch(submitted.value)
      browseItems.value = []
      browseTotal.value = 0
      browseUndated.value = 0
    } else if (browseCategory.value) {
      const result = await listArticles({
        category: browseCategory.value,
        sources: selectedSources.value,
        publishedFrom: range.from || undefined,
        publishedTo: range.to || undefined,
        sort: effectiveBrowseSort.value,
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
      browseUndated.value = result.undatedExcluded
      payload.value = null
      elapsedMs.value = null
    } else {
      payload.value = null
      elapsedMs.value = null
      browseItems.value = []
      browseTotal.value = 0
      browseUndated.value = 0
    }
  } catch (err) {
    if (!latest.isCurrent(requestId)) return
    error.value = err instanceof Error ? err.message : '检索失败，请稍后再试'
  } finally {
    if (latest.isCurrent(requestId)) loading.value = false
  }
}

/**
 * 把 URL 上的状态应用到组件；签名没变就不重复请求。
 *
 * 用「整串签名」而不是逐个字段比对：新增筛选项时忘记同步比对条件就会变成
 * 「改了筛选但页面不动」或「watch 与 replace 互相触发」，签名写法不会漏。
 */
function applyFromRoute(): void {
  const state = stateFromRoute()
  const signature = signatureOf(state)
  if (signature === appliedSignature) return
  appliedSignature = signature
  keyword.value = state.q
  submitted.value = state.q
  selectedCategories.value = state.cats
  selectedSources.value = state.sources
  sort.value = state.sort
  highRelevanceOnly.value = state.high
  if (!state.from && !state.to) {
    timeRange.value = 'all'
    customFrom.value = ''
    customTo.value = ''
  } else {
    // URL 只带具体日期，不记「用户当初点的是近 7 天还是自定义」——那属于
    // 交互偏好，不该进可分享链接；这里统一按自定义范围还原。
    timeRange.value = 'custom'
    customFrom.value = state.from
    customTo.value = state.to
  }
  page.value = 1
  void run()
}

function submit(): void {
  const q = keyword.value.trim()
  submitted.value = q
  page.value = 1
  syncAndRun()
}

function searchHot(word: string): void {
  keyword.value = word
  submit()
}

function toggleCategory(id: string): void {
  selectedCategories.value = selectedCategories.value.includes(id)
    ? selectedCategories.value.filter((item) => item !== id)
    : [...selectedCategories.value, id]
  page.value = 1
  syncAndRun()
}

function toggleSource(id: string): void {
  selectedSources.value = selectedSources.value.includes(id)
    ? selectedSources.value.filter((item) => item !== id)
    : [...selectedSources.value, id]
  page.value = 1
  syncAndRun()
}

function setTimeRange(value: TimeRange): void {
  timeRange.value = value
  page.value = 1
  // 自定义范围在用户真正填完日期前不发请求——否则先发一次「不限时间」的
  // 结果，再被日期覆盖，列表会闪一下。
  if (value === 'custom' && !customFrom.value && !customTo.value) return
  syncAndRun()
}

function onCustomDateChange(): void {
  if (timeRange.value !== 'custom') timeRange.value = 'custom'
  page.value = 1
  if (rangeInvalid.value) return
  syncAndRun()
}

function setSort(value: SearchSort): void {
  sort.value = value
  page.value = 1
  syncAndRun()
}

function onHighChange(): void {
  page.value = 1
  syncAndRun()
}

/** 重置全部筛选（关键词保留，用户通常只是想清筛选条件） */
function resetFilters(): void {
  selectedCategories.value = []
  selectedSources.value = []
  timeRange.value = 'all'
  customFrom.value = ''
  customTo.value = ''
  sort.value = 'relevance'
  highRelevanceOnly.value = false
  page.value = 1
  syncAndRun()
}

function clearCategory(): void {
  selectedCategories.value = []
  page.value = 1
  syncAndRun()
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
  browseUndated.value = 0
  error.value = ''
  page.value = 1
  syncAndRun()
}

function changePage(next: number): void {
  page.value = next
  // 浏览模式是服务端分页，翻页要重新取；检索模式数据已在本地，只切页
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
  // 发布单位来自后端统计；失败就不展示这一组筛选，不阻塞检索本身
  void listSources()
    .then((list) => {
      sources.value = list
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
      <button v-if="submitted" class="btn btn--ghost" type="button" @click="clear">清除</button>
    </form>

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
        清除分类
      </button>
    </div>

    <div class="adv">
      <button
        class="adv__toggle"
        type="button"
        :aria-expanded="advOpen"
        aria-controls="adv-panel"
        @click="advOpen = !advOpen"
      >
        <svg class="adv__chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        高级搜索
        <span v-if="activeFilterCount" class="adv__count">{{ activeFilterCount }}</span>
      </button>
      <span v-if="filterSummary" class="adv__summary">{{ filterSummary }}</span>
      <button v-if="activeFilterCount" class="btn btn--text" type="button" @click="resetFilters">
        重置筛选
      </button>
    </div>

    <div v-show="advOpen" id="adv-panel" class="adv-panel">
      <div class="adv-row">
        <span class="adv-row__label">时间范围</span>
        <div class="adv-row__body">
          <button
            v-for="item in TIME_RANGES"
            :key="item.value"
            class="chip"
            :class="{ 'chip--active': timeRange === item.value }"
            type="button"
            :aria-pressed="timeRange === item.value"
            @click="setTimeRange(item.value)"
          >
            {{ item.label }}
          </button>
          <template v-if="timeRange === 'custom'">
            <input
              v-model="customFrom"
              class="adv-date"
              type="date"
              aria-label="开始日期"
              @change="onCustomDateChange"
            />
            <span class="adv-row__sep">至</span>
            <input
              v-model="customTo"
              class="adv-date"
              type="date"
              aria-label="结束日期"
              @change="onCustomDateChange"
            />
          </template>
        </div>
      </div>
      <p v-if="timeRange === 'custom' && rangeInvalid" class="adv-error" role="alert">
        开始日期不能晚于结束日期，请调整后重试。
      </p>

      <div class="adv-row">
        <span class="adv-row__label">发布单位</span>
        <div class="adv-row__body">
          <button
            v-for="item in sources"
            :key="item.source"
            class="chip"
            :class="{ 'chip--active': selectedSources.includes(item.source) }"
            type="button"
            :aria-pressed="selectedSources.includes(item.source)"
            @click="toggleSource(item.source)"
          >
            {{ sourceName(item.source) }}
            <span class="chip__count">{{ item.count }}</span>
          </button>
          <span v-if="!sources.length" class="adv-hint">暂无可选来源</span>
        </div>
      </div>

      <div class="adv-row">
        <span class="adv-row__label">排序方式</span>
        <div class="adv-row__body">
          <button
            v-for="item in SORT_OPTIONS"
            :key="item.value"
            class="chip"
            :class="{ 'chip--active': sort === item.value }"
            type="button"
            :aria-pressed="sort === item.value"
            :disabled="browseCategory !== '' && item.value === 'relevance'"
            @click="setSort(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="adv-row">
        <span class="adv-row__label">相关度</span>
        <div class="adv-row__body">
          <label class="check">
            <input
              v-model="highRelevanceOnly"
              type="checkbox"
              :disabled="!submitted"
              @change="onHighChange"
            />
            仅看高相关度（≥80 分）
          </label>
          <span v-if="!submitted" class="adv-hint">输入关键词后可用</span>
        </div>
      </div>
    </div>

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
      :description="`换个关键词试试，或点「重置筛选」去掉当前条件${
        filterSummary ? '（' + filterSummary + '）' : ''
      }。`"
    >
      <template #action>
        <button v-if="activeFilterCount" class="btn btn--ghost" type="button" @click="resetFilters">
          重置筛选
        </button>
      </template>
    </EmptyState>

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

.adv {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.adv__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  cursor: pointer;
}

.adv__chevron {
  width: 14px;
  height: 14px;
  transition: transform var(--duration-base) var(--ease-out);
}

.adv__toggle[aria-expanded='true'] .adv__chevron {
  transform: rotate(180deg);
}

.adv__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-text-inverse);
  font-size: var(--font-size-xs);
  line-height: 1;
}

.adv__summary {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.adv-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg-subtle, var(--color-split));
}

.adv-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.adv-row__label {
  width: 64px;
  flex: none;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.adv-row__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.adv-row__sep {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.adv-date {
  height: 28px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  font-family: inherit;
  font-size: var(--font-size-xs);
  color: var(--color-text);
  background: var(--color-bg);
}

.adv-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-disabled);
}

.adv-error {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-error);
}

.chip__count {
  margin-left: 4px;
  color: var(--color-text-muted);
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

.chip:hover:not(:disabled) {
  border-color: var(--color-primary-hover);
  color: var(--color-primary);
}

.chip--active {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.chip:disabled {
  color: var(--color-text-disabled);
  border-color: var(--color-split);
  cursor: not-allowed;
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
