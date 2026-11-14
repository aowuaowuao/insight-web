<script setup lang="ts">
/**
 * 分类浏览页（技术规范书 2.2.1（二）模块三）。
 *
 * ── 后端缺口：前端不伪造，界面上显式标注 ──────────────────────────
 * 1. 「行业领域」：GET /v1/articles 支持 industry 单值过滤，候选来自 /v1/industries
 *    （受控词表 + 每行业文章计数）。一次只能选一个行业，再点一次取消。
 * 2. 「相关度评分」：列表接口不返回检索相关度（/v1/search 才有 relevance.score）。
 *    卡片统一传 score=null；不拿 category_confidence（分类置信度）冒充相关度——
 *    两者量纲完全不同，冒充会让用户以为排序按相关度，实际按另一套分。
 *    sort=confidence_* 排的确实是分类置信度，chip 上用 title 把这件事说明白。
 * 3. 「关键要素摘要」：列表接口同样没有该字段，卡片不传 highlights。
 * 4. 后端 category 只接受单值、也没有「多分类 OR」。四个 Tab 因此各自只能映射
 *    一个大类；人才申报 / 企业资质申报 / 其他 三个大类用二级「大类」chip 直达，
 *    否则它们在这页不可达，等于丢信息。
 *
 * ── 其余按规范落地 ─────────────────────────────────────────────
 * 时间范围用 utils/dateRange 的本地日换算：绝不 toISOString()，那是 UTC 日，
 * 东八区 0-8 点会被算成前一天。分页走后端 offset，排序映射到后端四个 sort 值，
 * 筛选状态写进 URL（router.replace），刷新 / 分享 / 前进后退都能还原同一状态。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import AppPager from '@/components/AppPager.vue'
import ArticleCard from '@/components/ArticleCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { listArticles, type ArticleListItem, type ArticleSort } from '@/api/articles'
import { listIndustries, type IndustryStat } from '@/api/industries'
import { listSources, type SourceStat } from '@/api/sources'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { CATEGORY_ORDER, categoryName } from '@/constants/categories'
import { sourceName } from '@/constants/sources'
import { isRangeInverted, resolveRange, type TimeRange } from '@/utils/dateRange'

/** 一个 Tab 与后端大类的映射 */
interface CategoryTab {
  key: string
  label: string
  /** 空串代表「全部」Tab：不传 category 参数 */
  category: string
}

/**
 * 四个 Tab。顺序与文案按规范模块三（1），顺序不要随意调整：
 * 「全部」放最后是因为它是兜底口径，不是第四个业务分类。
 */
const TABS: CategoryTab[] = [
  { key: 'policy', label: '政策类', category: 'industry_policy' },
  { key: 'project', label: '项目申报类', category: 'project_application' },
  { key: 'funding', label: '资金奖补类', category: 'funding_subsidy' },
  { key: 'all', label: '全部', category: '' },
]

/** 时间范围快捷项；custom 才用下面两个日期输入框。all 用来取消时间条件 */
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '全部时间' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'custom', label: '自定义' },
]

/**
 * 排序：后端只认这四个值，前端不做二次排序。
 * confidence_* 排的是分类置信度，不是检索相关度（列表接口没有相关度），
 * 所以 label 写「相关度」但 title 说清口径，避免用户以为是搜索打分。
 */
const SORT_OPTIONS: { value: ArticleSort; label: string; hint: string }[] = [
  { value: 'published_desc', label: '发布时间 ↓', hint: '最新发布在前' },
  { value: 'published_asc', label: '发布时间 ↑', hint: '最早发布在前' },
  {
    value: 'confidence_desc',
    label: '相关度 ↓',
    hint: '按分类置信度从高到低（列表接口不返回独立相关度评分）',
  },
  {
    value: 'confidence_asc',
    label: '相关度 ↑',
    hint: '按分类置信度从低到高（列表接口不返回独立相关度评分）',
  },
]

const DEFAULT_PAGE_SIZE = 10
/** 规范模块三（4）：默认 10 条，可切 10 / 20 / 50 */
const PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50]

const route = useRoute()
const router = useRouter()
const latest = useLatestRequest()

const items = ref<ArticleListItem[]>([])
const total = ref(0)
/** 两个时间列都为空、无法判断是否落在区间内而被排除的行数 */
const undatedExcluded = ref(0)
const loading = ref(false)
const error = ref('')
/** 是否成功取过一次数据：区分「首屏加载」与「筛选后确实为空」 */
const loadedOnce = ref(false)

const sources = ref<SourceStat[]>([])
const sourcesError = ref('')
const industries = ref<IndustryStat[]>([])
const industriesError = ref('')

const selectedCategory = ref('')
const selectedSources = ref<string[]>([])
/** /v1/articles 的 industry 是单值参数，所以这里也用单选 */
const selectedIndustry = ref('')
const timeRange = ref<TimeRange>('all')
const customFrom = ref('')
const customTo = ref('')
const sort = ref<ArticleSort>('published_desc')
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)

/** 上一次从 URL 应用过的状态签名：watch 与 router.replace 靠它防止互相触发 */
let appliedSignature = ''
/** 上一次真正发出去的请求签名：同一组参数不重复请求（切「全部时间 → 自定义空日期」时参数其实没变） */
let lastRequestKey = ''

const activeRange = computed(() => resolveRange(timeRange.value, customFrom.value, customTo.value))
/** 自定义范围起止颠倒：不拦的话后端按 [from, to] 返回空集，用户会以为真没数据 */
const rangeInvalid = computed(
  () => timeRange.value === 'custom' && isRangeInverted(activeRange.value),
)

/** 当前高亮的 Tab：选中人才申报 / 企业资质 / 其他时没有对应 Tab，返回空串不高亮 */
const activeTabKey = computed(
  () => TABS.find((tab) => tab.category === selectedCategory.value)?.key ?? '',
)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const skeletonRows = computed(() => Math.min(pageSize.value, 5))

/** 已生效的筛选条件摘要：让用户一眼看出为什么条数变少了 */
const filterSummary = computed(() => {
  const parts: string[] = []
  if (selectedCategory.value) parts.push('大类 ' + categoryName(selectedCategory.value))
  if (timeRange.value !== 'all') {
    const range = activeRange.value
    if (range.from && range.to) parts.push('时间 ' + range.from + ' 至 ' + range.to)
    else if (range.from) parts.push('时间 ' + range.from + ' 起')
    else if (range.to) parts.push('时间截至 ' + range.to)
  }
  if (selectedSources.value.length) {
    parts.push('发布单位 ' + selectedSources.value.map((id) => sourceName(id)).join('、'))
  }
  if (selectedIndustry.value) {
    parts.push('行业 ' + industryName(selectedIndustry.value))
  }
  return parts.join('，')
})

/** 排序不算筛选：重置筛选不动排序语义，只把「筛选条件」清掉 */
const hasFilters = computed(
  () =>
    selectedCategory.value !== '' ||
    timeRange.value !== 'all' ||
    selectedSources.value.length > 0 ||
    selectedIndustry.value !== '',
)

const statusText = computed(() => {
  if (loading.value) return '正在加载公告…'
  // 这两个必须排在「共 N 条」之前：否则状态行会用上一次的条数配这一次的条件
  if (rangeInvalid.value) return '时间范围无效：开始日期不能晚于结束日期，请调整后重试'
  if (error.value) return '本次加载失败：' + error.value
  if (!loadedOnce.value) return ''
  const summary = filterSummary.value ? '（' + filterSummary.value + '）' : ''
  const undated =
    timeRange.value !== 'all' && undatedExcluded.value > 0
      ? '，另有 ' + undatedExcluded.value + ' 篇无发布时间未计入'
      : ''
  return '共 ' + total.value + ' 条公告' + summary + undated
})

const emptyTitle = computed(() => (hasFilters.value ? '没有符合条件的公告' : '暂无公告'))
const emptyDescription = computed(() =>
  hasFilters.value
    ? '当前筛选' +
      (filterSummary.value ? '：' + filterSummary.value : '') +
      '，试试放宽条件或点「重置筛选」。'
    : '等下一轮抓取与分析完成后，这里会出现新的公告。',
)

/** 页面全部筛选状态：既用于拼 URL，也用作请求去重签名 */
interface PageState {
  category: string
  range: TimeRange
  from: string
  to: string
  sources: string[]
  industry: string
  sort: ArticleSort
  page: number
  pageSize: number
}

function isArticleSort(value: unknown): value is ArticleSort {
  return (
    value === 'published_desc' ||
    value === 'published_asc' ||
    value === 'confidence_desc' ||
    value === 'confidence_asc'
  )
}

function isTimeRange(value: unknown): value is TimeRange {
  return value === 'all' || value === '7d' || value === '30d' || value === 'custom'
}

/** URL 可能是手改的：只接受 YYYY-MM-DD，其它值当作没填 */
function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list.filter((item): item is string => typeof item === 'string' && item !== '')
}

function positiveInt(value: unknown, fallback: number): number {
  const num = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(num) && num >= 1 ? num : fallback
}

/** Tab key -> 大类 id；未知 key 退回「全部」 */
function categoryOfTab(key: string): string {
  return TABS.find((tab) => tab.key === key)?.category ?? ''
}

/**
 * 从 URL 解析整页状态；非法值一律退回默认，不抛错。
 * range 必须单独还原：近 7 天 / 近 30 天的 from、to 是「按今天现算」的，
 * 只存日期的话第二天刷新就会变成一组固定的旧区间。
 */
function stateFromRoute(): PageState {
  const catRaw = typeof route.query.cat === 'string' ? route.query.cat.trim() : ''
  const tabRaw = typeof route.query.tab === 'string' ? route.query.tab.trim() : ''
  // cat 优先；只有 tab 没有 cat 的链接（?tab=policy）也认，避免「粘了半截链接就变成全部」
  const known = (CATEGORY_ORDER as readonly string[]).includes(catRaw)
  const category = known ? catRaw : categoryOfTab(tabRaw)

  const fromRaw = route.query.from
  const toRaw = route.query.to
  const from = isYmd(fromRaw) ? fromRaw : ''
  const to = isYmd(toRaw) ? toRaw : ''
  const rangeRaw = route.query.range
  const range: TimeRange = isTimeRange(rangeRaw) ? rangeRaw : from || to ? 'custom' : 'all'
  const resolved = resolveRange(range, from, to)

  const sortRaw = route.query.sort
  const sizeRaw = positiveInt(route.query.size, DEFAULT_PAGE_SIZE)
  return {
    category,
    range,
    from: range === 'all' ? '' : resolved.from,
    to: range === 'all' ? '' : resolved.to,
    sources: normalizeList(route.query.source),
    industry: typeof route.query.industry === 'string' ? route.query.industry.trim() : '',
    sort: isArticleSort(sortRaw) ? sortRaw : 'published_desc',
    page: positiveInt(route.query.page, 1),
    pageSize: PAGE_SIZE_OPTIONS.includes(sizeRaw) ? sizeRaw : DEFAULT_PAGE_SIZE,
  }
}

function currentState(): PageState {
  const range = activeRange.value
  return {
    category: selectedCategory.value,
    range: timeRange.value,
    from: timeRange.value === 'all' ? '' : range.from,
    to: timeRange.value === 'all' ? '' : range.to,
    sources: selectedSources.value,
    industry: selectedIndustry.value,
    sort: sort.value,
    page: page.value,
    pageSize: pageSize.value,
  }
}

/**
 * 状态 -> 查询串（空值即删掉，保持链接干净）。
 *
 * tab 与 cat 是一份状态的两种写法：cat 是真正传给后端的单值大类，
 * tab 是产品口径的标签页名，写进去是为了让人能读懂链接；解析时以 cat 为准。
 *
 * size 也要写：page 只在某个每页条数下才有意义，
 * 刷新后条数回落到 10 而页码还在第 3 页，用户会跳到一段完全不同的数据。
 */
function queryOf(state: PageState): LocationQueryRaw {
  const query: LocationQueryRaw = {}
  if (state.category) {
    query.cat = state.category
    const tab = TABS.find((item) => item.category === state.category)
    if (tab) query.tab = tab.key
  } else {
    query.tab = 'all'
  }
  if (state.range !== 'all') query.range = state.range
  if (state.from) query.from = state.from
  if (state.to) query.to = state.to
  if (state.sources.length) query.source = state.sources
  if (state.industry) query.industry = state.industry
  if (state.sort !== 'published_desc') query.sort = state.sort
  if (state.page > 1) query.page = String(state.page)
  if (state.pageSize !== DEFAULT_PAGE_SIZE) query.size = String(state.pageSize)
  return query
}

function signatureOf(state: PageState): string {
  return JSON.stringify(state)
}

/** 请求签名：range 不进签名，它只决定 from/to 怎么算，最终参数由 from/to 表达 */
function requestKeyOf(state: PageState): string {
  return JSON.stringify([
    state.category,
    state.from,
    state.to,
    state.sources,
    state.industry,
    state.sort,
    state.page,
    state.pageSize,
  ])
}

/** 查询串规范化比较：键排序后再比，避免同一状态因键顺序不同被判成「变了」而反复 replace */
function queryKey(query: Record<string, unknown>): string {
  const entries = Object.keys(query)
    .sort()
    .map((key) => {
      const value = query[key]
      if (value === undefined || value === null || value === '') return [key, ''] as const
      if (Array.isArray(value)) return [key, value.map((item) => String(item))] as const
      return [key, String(value)] as const
    })
  return JSON.stringify(entries)
}

function syncUrl(): void {
  const state = currentState()
  // 先记签名：下面 router.replace 会触发 watch -> applyFromRoute，
  // 签名相同即视为「已知状态」，不会再多发一次请求。
  appliedSignature = signatureOf(state)
  const nextQuery = queryOf(state)
  if (queryKey(route.query) !== queryKey(nextQuery)) {
    void router.replace({ query: nextQuery })
  }
}

/** 拉数据。竞态守卫：连续点筛选时先发后到的响应必须丢弃 */
async function run(): Promise<void> {
  if (rangeInvalid.value) {
    // 倒置区间后端会返回空集，用户会误以为是「真的没数据」；这里不发请求，交给状态行提示
    latest.next()
    loading.value = false
    error.value = ''
    items.value = []
    total.value = 0
    undatedExcluded.value = 0
    return
  }
  const requestId = latest.next()
  loading.value = true
  error.value = ''
  try {
    const range = activeRange.value
    const scoped = timeRange.value !== 'all'
    const result = await listArticles({
      category: selectedCategory.value || undefined,
      sources: selectedSources.value,
      industry: selectedIndustry.value || undefined,
      publishedFrom: scoped ? range.from || undefined : undefined,
      publishedTo: scoped ? range.to || undefined : undefined,
      sort: sort.value,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    })
    if (!latest.isCurrent(requestId)) return
    items.value = result.items
    total.value = result.total
    undatedExcluded.value = result.undatedExcluded
    loadedOnce.value = true
    // 页码越界（手改 URL、或筛选后总数变少）：回到最后一页重取，别让界面停在「第 3 / 2 页」
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value))
    if (page.value > lastPage) {
      page.value = lastPage
      syncUrl()
      void run()
    }
  } catch (err) {
    if (!latest.isCurrent(requestId)) return
    error.value = err instanceof Error ? err.message : '加载公告失败'
  } finally {
    if (latest.isCurrent(requestId)) loading.value = false
  }
}

/** 交互之后统一走这里：先同步 URL，再决定要不要发请求 */
function apply(): void {
  const state = currentState()
  syncUrl()
  const requestKey = requestKeyOf(state)
  if (requestKey === lastRequestKey) return
  lastRequestKey = requestKey
  void run()
}

/** 把 URL 上的状态应用到组件；签名没变就不重复请求（watch 与 replace 的防抖靠它） */
function applyFromRoute(): void {
  const state = stateFromRoute()
  const signature = signatureOf(state)
  if (signature === appliedSignature) return
  appliedSignature = signature
  selectedCategory.value = state.category
  selectedSources.value = state.sources
  selectedIndustry.value = state.industry
  timeRange.value = state.range
  // 快捷范围（7d/30d）的日期是按今天现算的，留着上一次的输入值只会在切到自定义时误导
  customFrom.value = state.range === 'custom' ? state.from : ''
  customTo.value = state.range === 'custom' ? state.to : ''
  sort.value = state.sort
  page.value = state.page
  pageSize.value = state.pageSize
  lastRequestKey = requestKeyOf(state)
  void run()
}

function setTab(tab: CategoryTab): void {
  if (selectedCategory.value === tab.category) return
  // 点 Tab 等于把大类设成该 Tab 映射的值；「全部」Tab 的 category 是空串，即清空
  selectedCategory.value = tab.category
  page.value = 1
  apply()
}

function setCategory(id: string): void {
  if (selectedCategory.value === id) return
  // 二级 chip 与 Tab 是同一份状态：这里改了，activeTabKey 会跟着高亮（没有对应 Tab 的类则都不亮）
  selectedCategory.value = id
  page.value = 1
  apply()
}

function setTimeRange(value: TimeRange): void {
  timeRange.value = value
  page.value = 1
  // 切到「自定义」而两个日期都空时，请求参数与「全部时间」完全相同，
  // apply() 里的请求签名会把这次重复请求挡掉。
  apply()
}

function onCustomDateChange(): void {
  if (timeRange.value !== 'custom') timeRange.value = 'custom'
  page.value = 1
  apply()
}

function toggleSource(id: string): void {
  selectedSources.value = selectedSources.value.includes(id)
    ? selectedSources.value.filter((item) => item !== id)
    : [...selectedSources.value, id]
  page.value = 1
  apply()
}

/** 行业单选：再点已选中的行业即取消 */
function toggleIndustry(id: string): void {
  selectedIndustry.value = selectedIndustry.value === id ? '' : id
  page.value = 1
  apply()
}

function industryName(id: string): string {
  return industries.value.find((item) => item.id === id)?.name || id
}

function setSort(value: ArticleSort): void {
  if (sort.value === value) return
  sort.value = value
  page.value = 1
  apply()
}

/** 重置筛选：清掉所有会让结果变少的条件，并把排序恢复成默认 */
function resetFilters(): void {
  selectedCategory.value = ''
  selectedSources.value = []
  selectedIndustry.value = ''
  timeRange.value = 'all'
  customFrom.value = ''
  customTo.value = ''
  sort.value = 'published_desc'
  page.value = 1
  apply()
}

function changePage(next: number): void {
  if (next === page.value) return
  page.value = next
  apply()
}

function changePageSize(size: number): void {
  if (size === pageSize.value) return
  pageSize.value = size
  // 每页条数变了，原页码指向的是另一段数据，必须回到第 1 页
  page.value = 1
  apply()
}

/** 发布单位候选取自后端统计；失败只是少一组筛选项，不阻塞浏览 */
async function loadSources(): Promise<void> {
  try {
    sources.value = await listSources()
  } catch {
    sourcesError.value = '发布单位加载失败，其他筛选不受影响'
  }
}

/** 行业候选取自受控词表；失败同样只少一组筛选项 */
async function loadIndustries(): Promise<void> {
  try {
    industries.value = await listIndustries()
  } catch {
    industriesError.value = '行业领域加载失败，其他筛选不受影响'
  }
}

watch(() => route.fullPath, applyFromRoute)

onMounted(() => {
  void applyFromRoute()
  void loadSources()
  void loadIndustries()
})
</script>

<template>
  <section class="category">
    <header class="page-head">
      <h1>分类浏览</h1>
      <p class="page-head__desc">
        用顶部标签页切换「政策类 / 项目申报类 / 资金奖补类 /
        全部」，再叠加时间范围、发布单位与行业领域筛选； 人才申报、企业资质申报、其他
        三类可在「大类」里直接选。
      </p>
    </header>

    <nav class="tabs" aria-label="分类标签页">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="tab"
        :class="{ 'tab--active': activeTabKey === tab.key }"
        type="button"
        :aria-pressed="activeTabKey === tab.key"
        @click="setTab(tab)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <section class="filters" aria-label="二级筛选">
      <div class="adv-row">
        <span class="adv-row__label">大类</span>
        <div class="adv-row__body">
          <button
            class="chip"
            :class="{ 'chip--active': selectedCategory === '' }"
            type="button"
            :aria-pressed="selectedCategory === ''"
            @click="setCategory('')"
          >
            全部
          </button>
          <button
            v-for="id in CATEGORY_ORDER"
            :key="id"
            class="chip"
            :class="{ 'chip--active': selectedCategory === id }"
            type="button"
            :aria-pressed="selectedCategory === id"
            @click="setCategory(id)"
          >
            {{ categoryName(id) }}
          </button>
        </div>
      </div>

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
      <p v-if="rangeInvalid" class="adv-error" role="alert">
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
            <span class="chip__count num">{{ item.count }}</span>
          </button>
          <span v-if="!sources.length" class="adv-hint">{{ sourcesError || '暂无可选来源' }}</span>
        </div>
      </div>

      <div class="adv-row">
        <span class="adv-row__label">行业领域</span>
        <div class="adv-row__body">
          <button
            v-for="item in industries"
            :key="item.id"
            class="chip"
            :class="{ 'chip--active': selectedIndustry === item.id }"
            type="button"
            :aria-pressed="selectedIndustry === item.id"
            :title="item.description"
            @click="toggleIndustry(item.id)"
          >
            {{ item.name }}
            <span class="chip__count num">{{ item.article_count }}</span>
          </button>
          <span v-if="!industries.length" class="adv-hint">
            {{ industriesError || '暂无可选行业' }}
          </span>
        </div>
      </div>

      <div class="adv-row">
        <span class="adv-row__label">排序</span>
        <div class="adv-row__body">
          <button
            v-for="item in SORT_OPTIONS"
            :key="item.value"
            class="chip"
            :class="{ 'chip--active': sort === item.value }"
            type="button"
            :aria-pressed="sort === item.value"
            :title="item.hint"
            @click="setSort(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="filters__foot">
        <span class="filters__summary">{{ filterSummary || '未叠加筛选条件' }}</span>
        <button v-if="hasFilters" class="btn btn--text" type="button" @click="resetFilters">
          重置筛选
        </button>
      </div>
    </section>

    <p class="status" role="status">{{ statusText }}</p>
    <p class="gap-note">
      列表接口暂不返回相关度评分与关键要素摘要，卡片先不展示这两项（相关度排序按分类置信度执行）。
    </p>

    <SkeletonList v-if="loading" :rows="skeletonRows" />

    <EmptyState v-else-if="error" variant="error" title="公告加载失败" :description="error">
      <template #action>
        <button class="btn btn--primary" type="button" @click="run">重试</button>
      </template>
    </EmptyState>

    <!-- rangeInvalid 时 items 一定是空的（上面已早退不发请求），但那不是「没有数据」，
         而是条件本身无效；两者同屏会让用户以为放宽条件就能找到，实际要先改正日期 -->
    <template v-else-if="!rangeInvalid">
      <EmptyState
        v-if="!items.length"
        :variant="hasFilters ? 'no-result' : 'no-data'"
        :title="emptyTitle"
        :description="emptyDescription"
      >
        <template #action>
          <button v-if="hasFilters" class="btn btn--ghost" type="button" @click="resetFilters">
            重置筛选
          </button>
        </template>
      </EmptyState>

      <template v-else>
        <div class="results">
          <!-- 列表接口没有相关度评分，score 固定传 null（不拿分类置信度冒充） -->
          <ArticleCard
            v-for="item in items"
            :key="item.article_id"
            :article-id="item.article_id"
            :title="item.title"
            :source="item.source"
            :published-at="item.published_at"
            :category="item.category"
            :industry="item.industry"
            :industry-name="item.industry ? industryName(item.industry) : ''"
            :score="null"
          />
        </div>

        <AppPager
          :page="page"
          :total-pages="totalPages"
          :page-size="pageSize"
          :page-size-options="PAGE_SIZE_OPTIONS"
          :total="total"
          @update:page="changePage"
          @update:page-size="changePageSize"
        />
      </template>
    </template>
  </section>
</template>

<style scoped>
.category {
  max-width: var(--layout-max-width);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-10);
}

.page-head {
  margin-bottom: var(--space-4);
}

.page-head h1 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-h1);
  line-height: var(--line-height-heading);
  color: var(--color-text);
}

.page-head__desc {
  margin: 0;
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
}

/* 标签页：下划线式，未选中用与分割线同色的底边，避免写裸色值 transparent */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-split);
}

.tab {
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-bottom: 2px solid var(--color-split);
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--font-size-body);
  line-height: var(--line-height-base);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.tab:hover {
  color: var(--color-primary-hover);
}

.tab--active {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg-hover);
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
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.adv-row__sep {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.adv-date {
  height: var(--space-8);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-xs);
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

.chip {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
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
  border-color: var(--color-split);
  color: var(--color-text-disabled);
  cursor: not-allowed;
}

.chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.chip__count {
  margin-left: var(--space-1);
  color: var(--color-text-muted);
}

.filters__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--color-border);
}

.filters__summary {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.status {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

/* 缺口说明常显：让用户知道「为什么卡片上没有评分」，而不是以为页面坏了 */
.gap-note {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
  color: var(--color-text-muted);
}

.results {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--space-8);
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
  border-color: var(--color-border);
  background: var(--color-split);
  color: var(--color-text-disabled);
  cursor: not-allowed;
}
</style>
