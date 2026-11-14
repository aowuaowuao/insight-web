<script setup lang="ts">
/**
 * 信息检索页。
 * 对照规范 2.2.1（二）模块五：搜索框与清除、历史搜索（≤10）、高级搜索面板、
 * 结果列表（相关度高亮 + 评分）、搜索建议（≤8）、空状态与热词、搜索结果统计
 * （共 X 条 / 用时 Y 毫秒）、每页条数 10/20/50 切换。
 *
 * 排序完全由后端决定（score = 0.7 标签 + 0.2 标题 + 0.1 正文），前端不再排序；
 * 时间范围、发布单位与行业领域同样交给后端过滤。两处口径不同，别混：
 * - 日期过滤按**卡片上显示的那一天**（站点墙钟 published_at 的日期前缀，后端 _DAY_EXPR）
 * - 排序按**真实时刻** published_at_utc（混时区站点才不会按墙钟排错）
 * 细节见 src/api/search.ts 的说明与 news-insight/app/db.py 的 _DAY_EXPR / _TIME_EXPR。
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
import { listArticles } from '@/api/articles'
import { listIndustries, type IndustryStat } from '@/api/industries'
import { listSources, type SourceStat } from '@/api/sources'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { CATEGORY_ORDER, categoryName } from '@/constants/categories'
import { sourceName } from '@/constants/sources'
import { listTags, tagName, type TagDef } from '@/api/tags'
import { readJson, writeJson } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { isRangeInverted, isYmd, resolveRange, type TimeRange } from '@/utils/dateRange'

interface CardItem {
  article_id: string
  title: string
  source: string
  published_at: string | null
  category: string | null
  industry: string | null
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
/** 受控行业候选（/v1/industries）；浏览模式的列表接口只接受单值 */
const industries = ref<IndustryStat[]>([])
const selectedIndustry = ref('')
const payload = ref<SearchPayload | null>(null)
const browseItems = ref<CardItem[]>([])
const browseTotal = ref(0)
const browseUndated = ref(0)
const loading = ref(false)
const error = ref('')
const page = ref(1)
/** 规范模块三：默认每页 10 条，可切 10/20/50 */
const pageSize = ref(10)
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
/** 浏览模式只允许一个大类时的提示；有内容就显示在分类筛选下面 */
const categoryHint = ref('')
const sort = ref<SearchSort>('relevance')

/** 上一次从 URL 应用过的状态签名，避免 watch 与 router.replace 互相触发死循环 */
let appliedSignature = ''

/**
 * 浏览模式：无关键词且选中**一个**大类时，走 GET /v1/articles?category=（服务端分页）。
 * 后端这个端点只接受单个大类，多选无法表达——所以此时必须在交互上收敛成一个，
 * 否则「有关键词时多选生效、没关键词时多选静默失效」，而筛选摘要却显示两类。
 * 收敛逻辑见 normalizeBrowseCategories()。
 */
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
const effectiveBrowseSort = computed<'published_desc' | 'published_asc'>(() =>
  sort.value === 'published_asc' ? 'published_asc' : 'published_desc',
)

/** 当前模式真正生效的排序：浏览模式没有 relevance，降级为最新发布，展示与实际必须一致 */
const effectiveSort = computed<SearchSort>(() =>
  browseCategory.value ? effectiveBrowseSort.value : sort.value,
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
      industry: item.industry,
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
  if (selectedIndustry.value) {
    parts.push('行业 ' + industryName(selectedIndustry.value))
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
  if (selectedIndustry.value) count += 1
  // 浏览模式（无关键词）下这个开关是禁用的，URL 里带 high=1 也不该计进角标，
  // 否则出现「角标 1、但面板里没有任何可取消的项」
  if (highRelevanceOnly.value && submitted.value) count += 1
  if (effectiveSort.value !== 'relevance') count += 1
  return count
})

const statusText = computed(() => {
  if (loading.value) return '正在检索…'
  // 这两个都要先于「共 X 条」判断：否则状态行会用「上一次的条数」配「这一次的
  // 条件」，读起来像「确实没数据」，与同页的错误卡片自相矛盾。
  if (rangeInvalid.value) return '时间范围无效：开始日期不能晚于结束日期，请调整后再检索'
  if (error.value) return '本次检索失败：' + error.value
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
      !highRelevanceOnly.value && loadedCount.value < totalCount.value
        ? '，当前展示前 ' + loadedCount.value + ' 条'
        : ''
    // 带了时间条件时，可能有命中关键词但两个时间列都判不出日期的条目被排除；
    // 不说明的话用户会以为「明明库里有，怎么就少了这几篇」。
    const undated =
      (payload.value?.undated_excluded ?? 0) > 0
        ? '（另有 ' + payload.value!.undated_excluded + ' 篇无发布时间未计入）'
        : ''
    const truncatedNote = payload.value?.truncated ? '；候选集已打满 2000 条，结果可能不完整' : ''
    const cost = elapsedMs.value === null ? '' : '，用时 ' + elapsedMs.value + ' 毫秒'
    // 「共找到 N 条」是后端命中数（过滤前），分页器上的条数是过滤后的。两者不一致
    // 必须当场说清，否则读者会以为分页器算错了；开了过滤时「当前展示前 N 条」
    // 已被下面这句覆盖，不再重复。
    const high = highRelevanceOnly.value
      ? '，已按相关度 ≥ 80% 过滤为 ' + loadedCount.value + ' 条（分页按过滤后计算）'
      : ''
    return (
      '关键词「' +
      submitted.value +
      '」共找到 ' +
      totalCount.value +
      ' 条结果' +
      filterPart +
      partial +
      undated +
      truncatedNote +
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
  industry: string
  from: string
  to: string
  sort: SearchSort
  high: boolean
  /** 页码（1 起）；只有服务端分页的浏览模式真正用它定位数据 */
  page: number
  /** 时间范围的语义（快捷项 / 自定义），与 from、to 一起还原才不会被「猜」成自定义 */
  range: TimeRange
}

function signatureOf(state: RouteState): string {
  return JSON.stringify(state)
}

/** 从 URL 解析筛选状态；非法值一律退回默认，不抛错（URL 可能是手改的） */
function stateFromRoute(): RouteState {
  const q = typeof route.query.q === 'string' ? route.query.q.trim() : ''
  const cats = normalizeCategories(route.query.category)
  const srcs = normalizeList(route.query.source)
  const industryRaw = typeof route.query.industry === 'string' ? route.query.industry.trim() : ''
  const fromRaw = typeof route.query.from === 'string' ? route.query.from.trim() : ''
  const toRaw = typeof route.query.to === 'string' ? route.query.to.trim() : ''
  const from = isYmd(fromRaw) ? fromRaw : ''
  const to = isYmd(toRaw) ? toRaw : ''
  const sortRaw = route.query.sort
  const nextSort: SearchSort = isSearchSort(sortRaw) ? sortRaw : 'relevance'
  const high = route.query.high === '1'
  const pageRaw = typeof route.query.page === 'string' ? Number(route.query.page) : 1
  const nextPage = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1
  return {
    q,
    cats,
    sources: srcs,
    industry: industryRaw,
    from,
    to,
    sort: nextSort,
    high,
    page: nextPage,
    range: rangeFromRoute(),
  }
}

function isTimeRange(value: unknown): value is TimeRange {
  return value === 'all' || value === '7d' || value === '30d' || value === 'custom'
}

/**
 * 时间范围的还原规则：
 * - URL 里有 range=7d/30d/custom 就用它（新链接能保住「近 7 天」是快捷项）
 * - 只有 from/to 的老链接：一律按自定义还原，免得把用户手填的日期说成「近 7 天」
 * - 什么都没有：全部时间
 */
function rangeFromRoute(): TimeRange {
  const raw = route.query.range
  if (isTimeRange(raw)) return raw
  const hasDate = typeof route.query.from === 'string' || typeof route.query.to === 'string'
  return hasDate ? 'custom' : 'all'
}

/** 由当前状态生成查询串（空值即删掉，保持 URL 干净可分享） */
function queryOf(state: RouteState): Record<string, string | string[] | undefined> {
  return {
    q: state.q === '' ? undefined : state.q,
    category: state.cats.length ? state.cats : undefined,
    source: state.sources.length ? state.sources : undefined,
    industry: state.industry === '' ? undefined : state.industry,
    from: state.from === '' ? undefined : state.from,
    to: state.to === '' ? undefined : state.to,
    sort: state.sort === 'relevance' ? undefined : state.sort,
    high: state.high ? '1' : undefined,
    // 第 1 页不写进 URL：保持链接干净，且「第 1 页」与「没翻过页」本来就是同一状态
    page: state.page > 1 ? String(state.page) : undefined,
    // 时间范围的语义要连同 from/to 一起记：只写日期的话，用户先点「自定义」、还没填
    // 日期时刷新会被还原成「全部时间」，输入框直接消失。
    //
    // 反过来说，这条必须写进 URL，否则会出现「点了自定义却弹回全部时间」的死循环：
    // 点自定义 → 时间条件清空 → 生成的 query 与原 URL 不同 → router.push 改 URL
    // → applyFromRoute 发现既无 range 又无 from/to，还原成 'all' → 输入框不出现。
    // 只有「全部时间」才是真正的默认值、可以不写。
    range: state.range === 'all' ? undefined : state.range,
  }
}

function currentState(): RouteState {
  const range = activeRange.value
  return {
    q: submitted.value,
    cats: selectedCategories.value,
    sources: selectedSources.value,
    industry: selectedIndustry.value,
    from: timeRange.value === 'all' ? '' : range.from,
    to: timeRange.value === 'all' ? '' : range.to,
    // 写进 URL 的是「实际生效的排序」：浏览模式下 relevance 会降级成最新发布，
    // 若把用户点过的 relevance 写进去，刷新后 chip 又变回「相关度优先」而数据没变。
    sort: effectiveSort.value,
    high: highRelevanceOnly.value,
    page: page.value,
    range: timeRange.value,
  }
}

/** 状态变化后统一走这里：先同步 URL，再发请求（两者用同一个签名去重） */
function syncAndRun(): void {
  const state = currentState()
  appliedSignature = signatureOf(state)
  const nextQuery = queryOf(state)
  if (JSON.stringify(route.query) !== JSON.stringify(nextQuery)) {
    void router.push({ query: nextQuery })
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
        industries: selectedIndustry.value ? [selectedIndustry.value] : [],
        publishedFrom: range.from || undefined,
        publishedTo: range.to || undefined,
        sort: sort.value,
      })
      if (!latest.isCurrent(requestId)) return
      payload.value = result
      elapsedMs.value = Math.round(performance.now() - startedAt)
      rememberSearch(submitted.value)
      // 页码越界（手改 URL、或加了筛选后总条数变少）：回到最后一页，别让界面停在
      // 「共 189 条」却一张卡片都没有。检索模式数据已在本地，改页码不用重新请求。
      clampSearchPage()
      browseItems.value = []
      browseTotal.value = 0
      browseUndated.value = 0
    } else if (browseCategory.value) {
      const result = await listArticles({
        category: browseCategory.value,
        sources: selectedSources.value,
        industry: selectedIndustry.value || undefined,
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
        industry: item.industry,
        // 列表接口不返回相关度，分类置信度不冒充评分，这里不显示角标
        score: null,
        matchedTerms: [],
      }))
      browseTotal.value = result.total
      browseUndated.value = result.undatedExcluded
      payload.value = null
      elapsedMs.value = null
      // 服务端分页：总数只有拿到结果才知道，越界时回到最后一页重取（与分类页同礼）
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value))
      if (page.value > lastPage) {
        page.value = lastPage
        const nextQuery = queryOf(currentState())
        if (JSON.stringify(route.query) !== JSON.stringify(nextQuery)) {
          appliedSignature = signatureOf(currentState())
          void router.replace({ query: nextQuery })
        }
        void run()
        return
      }
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
  // 无关键词（浏览模式）时后端只按单个大类取数。手改/分享来的多值链接同样收敛，
  // 否则会退化成「一个都不选」的空页面，而摘要还写着两个类。
  selectedCategories.value = !state.q && state.cats.length > 1 ? [state.cats[0]] : state.cats
  categoryHint.value =
    !state.q && state.cats.length > 1
      ? '浏览模式一次只看一个大类，已按「' +
        categoryName(state.cats[0]) +
        '」筛选；输入关键词后可多选大类检索。'
      : ''
  selectedSources.value = state.sources
  selectedIndustry.value = state.industry
  sort.value = state.sort
  timeRange.value = state.range
  // 无关键词时「仅看高相关度」是禁用的（score 只有检索结果才有），URL 里残留的
  // high=1 必须在这里丢掉，否则复选框选中且不可点，用户无法取消。
  highRelevanceOnly.value = state.high && state.q !== ''
  if (state.range === 'all') {
    customFrom.value = ''
    customTo.value = ''
  } else if (state.range === 'custom') {
    customFrom.value = state.from
    customTo.value = state.to
  } else {
    // 快捷项：起止日期由 resolveRange 现算，留着旧的输入值只会在切到自定义时误导
    customFrom.value = ''
    customTo.value = ''
  }
  page.value = state.page
  if (rangeInvalid.value) {
    // 手改 URL 造出倒置区间：不发请求（后端会返回空集，用户会以为真没数据），
    // 让状态行的「时间范围无效」提示接管。
    latest.next()
    loading.value = false
    error.value = ''
    payload.value = null
    browseItems.value = []
    browseTotal.value = 0
    browseUndated.value = 0
    return
  }
  void run()
}

/** 检索模式页码收敛到最后一页（浏览模式由 run() 拿服务端 total 后自行回退） */
function clampSearchPage(): void {
  const lastPage = Math.max(1, Math.ceil(visibleSearchItems.value.length / pageSize.value))
  if (page.value <= lastPage) return
  page.value = lastPage
  const nextQuery = queryOf(currentState())
  if (JSON.stringify(route.query) === JSON.stringify(nextQuery)) return
  // 先记账再改 URL：否则 router.replace 触发的 applyFromRoute 会认为状态变了、又跑一次
  appliedSignature = signatureOf(currentState())
  void router.replace({ query: nextQuery })
}

function submit(): void {
  const q = keyword.value.trim()
  submitted.value = q
  categoryHint.value = ''
  page.value = 1
  syncAndRun()
}

function searchHot(word: string): void {
  keyword.value = word
  submit()
}

function toggleCategory(id: string): void {
  const current = selectedCategories.value
  if (current.includes(id)) {
    selectedCategories.value = current.filter((item) => item !== id)
    categoryHint.value = ''
  } else if (!submitted.value && current.length >= 1) {
    // 浏览模式（无关键词）后端只按单个大类取数：多选要么无法表达、要么静默失效。
    // 这里收敛成「以最后一次点选的为准」，并把替换关系明说，避免用户以为是多选。
    selectedCategories.value = [id]
    categoryHint.value =
      '浏览模式一次只看一个大类，已按「' + categoryName(id) + '」筛选；输入关键词后可多选大类检索。'
  } else {
    selectedCategories.value = [...current, id]
    categoryHint.value = ''
  }
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

/** 行业单选：再次点击已选中的行业即取消 */
function toggleIndustry(id: string): void {
  selectedIndustry.value = selectedIndustry.value === id ? '' : id
  page.value = 1
  syncAndRun()
}

function industryName(id: string): string {
  return industries.value.find((item) => item.id === id)?.name || id
}

function setTimeRange(value: TimeRange): void {
  const previous = timeRange.value
  timeRange.value = value
  page.value = 1
  // 自定义范围在用户填完日期前不重复发请求：仍停在「自定义」且两个日期都空时，
  // 请求参数没有任何变化，再发一次只会白白多一次往返。
  //
  // 但**必须**只在「真的没变化」时跳过：从「近 7 天」切到「自定义」时区间被清空，
  // 请求口径变了（时间条件消失），此时不重新取数就会出现「页码显示第 1 页、
  // 列表还是第 2 页数据」——用户看到的两份信息互相矛盾，比多一次请求糟得多。
  if (value === 'custom' && !customFrom.value && !customTo.value && previous === value) return
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
  selectedIndustry.value = ''
  timeRange.value = 'all'
  customFrom.value = ''
  customTo.value = ''
  sort.value = 'relevance'
  highRelevanceOnly.value = false
  categoryHint.value = ''
  page.value = 1
  syncAndRun()
}

function clearCategory(): void {
  selectedCategories.value = []
  categoryHint.value = ''
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
  categoryHint.value = ''
  // high 依赖关键词，清空关键词后必须一并清掉；否则落到浏览模式会出现「勾选且禁用」的自相矛盾状态
  highRelevanceOnly.value = false
  page.value = 1
  syncAndRun()
}

/** 只翻页不改筛选：写完 URL 再决定要不要重新取数（浏览模式是服务端分页） */
function applyPaging(): void {
  const state = currentState()
  // 先记下签名，这样下面 router.replace 触发的 applyFromRoute 会认为状态已知、
  // 不会再 run 一次（否则浏览模式每次翻页都发两次请求）
  appliedSignature = signatureOf(state)
  const nextQuery = queryOf(state)
  if (JSON.stringify(route.query) !== JSON.stringify(nextQuery)) {
    void router.replace({ query: nextQuery })
  }
  if (browseCategory.value) void run()
}

function changePage(next: number): void {
  page.value = next
  // 浏览模式是服务端分页，翻页要重新取；检索模式数据已在本地，只切页
  applyPaging()
}

function changePageSize(size: number): void {
  pageSize.value = size
  page.value = 1
  applyPaging()
}

// 不要在这里 watch(highRelevanceOnly) 重置页码：从 URL 还原状态（applyFromRoute）
// 时给 highRelevanceOnly 赋值会触发该 watch，把刚还原好的 page 又打回 1，而 URL
// 里还是旧页码 —— 直达 /search?q=x&high=1&page=2 会看到「第 1 页」配 page=2 的 URL。
// 用户手动切换开关时由 onHighChange 自己重置页码，够用。
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
  // 行业候选来自受控词表；失败就不展示这一组筛选
  void listIndustries()
    .then((list) => {
      industries.value = list
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
    <p v-if="categoryHint" class="cat-hint" role="status">{{ categoryHint }}</p>

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
            <span class="chip__count">{{ item.article_count }}</span>
          </button>
          <span v-if="!industries.length" class="adv-hint">暂无可选行业</span>
        </div>
      </div>

      <div class="adv-row">
        <span class="adv-row__label">排序方式</span>
        <div class="adv-row__body">
          <button
            v-for="item in SORT_OPTIONS"
            :key="item.value"
            class="chip"
            :class="{ 'chip--active': effectiveSort === item.value }"
            type="button"
            :aria-pressed="effectiveSort === item.value"
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
      v-else-if="(submitted || browseCategory) && !cards.length && !rangeInvalid"
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

    <template v-else-if="!rangeInvalid">
      <div v-if="cards.length" class="results">
        <ArticleCard
          v-for="card in cards"
          :key="card.article_id"
          :article-id="card.article_id"
          :title="card.title"
          :source="card.source"
          :published-at="card.published_at"
          :category="card.category"
          :industry="card.industry"
          :industry-name="card.industry ? industryName(card.industry) : ''"
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
.cat-hint {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-left: 3px solid var(--color-warning);
  border-radius: var(--radius-base);
  background: var(--color-warning-bg);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

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
