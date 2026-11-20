<script setup lang="ts">
/**
 * 公告详情页。
 * 对照规范 2.2.1（二）模块四：面包屑、标题与来源/时间/分类、
 * 关键信息摘要（申报条件、材料、截止时间等）、申报准备清单、
 * 标签、正文全文、原文跳转、收藏。
 *
 * 数据来自 news-insight：
 * - GET /v1/articles/{id}            详情 + 标签 + 结构化抽取 + body_html/is_favorite
 * - GET /v1/articles/{id}/checklist  申报清单（无清单时 404 → null）
 * - POST/DELETE /v1/me/favorites     收藏（浏览历史由后端在详情请求时自动记录）
 *
 * 正文安全：body_html 由 news-crawler 的 html_sanitize 白名单过滤后才落库，
 * 前端只渲染该字段；缺失时用 MarkdownIt（html:false）把纯文本转义后渲染。
 * 目录由渲染后的 h2/h3 动态提取，不依赖服务端注入 id。
 *
 * 相关度：详情接口返回文章级语义相关度 relevance_score（0-1）与 relevance_reason
 * （AI 摘要句），头部展示相关度徽标；高相关（≥80 分）时展示「AI 要素摘要」，
 * 关键信息卡保持原有逻辑（有抽取结果就展示），不随相关度隐藏。
 *
 * 规范缺口（后端暂未提供对应能力，界面按「能取到的就展示、取不到就明说」处理）：
 * - 浏览量：接口没有，不展示。
 * - 「相关推荐 3-5 条」：调 /v1/articles?category=X 排除自身取 5 条同分类最新公告，
 *   属同分类近似，不是相似度推荐（后端没有相似度接口）。取不到时整块不渲染。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useNarrowViewport } from '@/composables/useNarrowViewport'
import MarkdownIt from 'markdown-it'
import { Star, StarFilled } from '@element-plus/icons-vue'
import EmptyState from '@/components/EmptyState.vue'
import ArticleCard from '@/components/ArticleCard.vue'
import ScoreBadge from '@/components/ScoreBadge.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import {
  generateChecklist,
  getArticle,
  getChecklist,
  type ArticleChecklist,
  type ArticleDetail,
} from '@/api/article'
import { listArticles, type ArticleListItem } from '@/api/articles'
import { addFavorite, removeFavorite } from '@/api/account'
import { listTags, tagName, type TagDef } from '@/api/tags'
import { categoryName } from '@/constants/categories'
import { sourceName } from '@/constants/sources'
import { formatDateTime, formatNumber, scoreToPercent } from '@/utils/format'
import { highRelevanceSummary } from '@/utils/relevance'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

/** 抽取字段的展示顺序与中文名；后端新增字段没登记时按 key 原样展示，不会丢信息 */
const FIELD_LABELS: Record<string, string> = {
  // 项目申报
  program_name: '项目名称',
  issuing_authority: '发布单位',
  eligible_applicants: '申报主体',
  materials: '申报材料',
  deadline: '截止日期',
  deadline_raw: '截止时间原文',
  funding_amount: '资助额度',
  focus_areas: '重点领域',
  application_channel: '申报渠道',
  contact: '联系方式',
  // 行业政策
  policy_name: '政策名称',
  document_number: '文号',
  policy_type: '政策类型',
  effective_date: '施行日期',
  validity_period: '有效期',
  applicable_scope: '适用范围',
  key_measures: '主要举措',
  target_industries: '涉及行业',
  // 人才申报
  talent_program_name: '人才计划/项目',
  talent_targets: '人才类别/对象',
  talent_eligibility: '申报条件',
  benefits: '支持措施',
  // 企业资质申报
  certification_name: '资质名称',
  certification_level: '资质等级/类别',
  eligible_entities: '申报主体',
  certification_conditions: '认定条件',
  review_requirement: '复审要求',
  // 资金补贴
  subsidy_name: '补贴项目名称',
  funding_type: '资金类型',
  funding_standard: '补助标准',
  subsidy_conditions: '申报条件',
}

/** 每个大类自己的标准要素；没有抽取结果时按本类铺满，不拿项目申报模板顶替 */
const CATEGORY_FIELD_ORDER: Record<string, string[]> = {
  project_application: [
    'program_name',
    'issuing_authority',
    'eligible_applicants',
    'materials',
    'deadline',
    'deadline_raw',
    'funding_amount',
    'focus_areas',
    'application_channel',
    'contact',
  ],
  industry_policy: [
    'policy_name',
    'issuing_authority',
    'document_number',
    'policy_type',
    'effective_date',
    'validity_period',
    'applicable_scope',
    'key_measures',
    'target_industries',
  ],
  talent_application: [
    'talent_program_name',
    'issuing_authority',
    'talent_targets',
    'talent_eligibility',
    'benefits',
    'funding_amount',
    'deadline',
    'deadline_raw',
    'materials',
    'application_channel',
    'contact',
  ],
  enterprise_certification: [
    'certification_name',
    'issuing_authority',
    'certification_level',
    'eligible_entities',
    'certification_conditions',
    'materials',
    'deadline',
    'deadline_raw',
    'validity_period',
    'review_requirement',
    'benefits',
    'application_channel',
  ],
  funding_subsidy: [
    'subsidy_name',
    'issuing_authority',
    'funding_type',
    'funding_amount',
    'funding_standard',
    'eligible_entities',
    'subsidy_conditions',
    'deadline',
    'deadline_raw',
    'materials',
    'application_channel',
    'contact',
  ],
}

const route = useRoute()
const { isNarrow } = useNarrowViewport()
const article = ref<ArticleDetail | null>(null)
const checklist = ref<ArticleChecklist | null>(null)
const tagDefs = ref<TagDef[]>([])
const loading = ref(true)
const error = ref('')
const favorited = ref(false)
const favoriteLoading = ref(false)
const favoriteError = ref('')
const bodyRef = ref<HTMLElement | null>(null)
const toc = ref<{ id: string; text: string; level: number }[]>([])

/** 详情页的请求序号：路由快速切换时防止旧响应覆盖新文章 */
let loadRequestId = 0
/** 清单请求序号：生成成功会作废更早的 GET，切换文章也会作废在途的生成请求 */
let checklistRequestId = 0

/** AI 要素摘要：仅高相关且理由非空白时展示，空字符串不会被渲染成空卡片 */
const relevanceSummary = computed(() =>
  highRelevanceSummary(article.value?.relevance_score, article.value?.relevance_reason),
)

/** 优先渲染后端清洗过的 body_html；缺失时把纯文本按 Markdown（禁 HTML）转义渲染 */
const bodyHtml = computed(() => {
  const raw = article.value?.body_html?.trim()
  if (raw) return raw
  return md.render(article.value?.body ?? '')
})

/** 目录跳转：渲染后从正文 h2/h3 提取标题并补锚点，不依赖服务端 id */
async function buildToc(): Promise<void> {
  await nextTick()
  const root = bodyRef.value
  if (!root) {
    toc.value = []
    return
  }
  const headings = Array.from(root.querySelectorAll<HTMLElement>('h2, h3'))
  toc.value = headings.map((heading, index) => {
    const id = `section-${index + 1}`
    heading.id = id
    return {
      id,
      text: heading.textContent?.trim() || `第 ${index + 1} 节`,
      level: heading.tagName === 'H2' ? 2 : 3,
    }
  })
}

function jumpToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * 关键要素。
 *
 * 规范模块四（3）要求「要素缺失项标注『未提取到』」，所以字段清单以模型登记过的
 * schema 为基准铺满，取不到值的照样出一行并标空；整篇都没有抽取结果时，按
 * FIELD_ORDER 里的标准要素逐条出「未提取到」——让用户明确知道是没抽到，
 * 而不是以为页面上压根没有这项信息。
 */
interface FieldRow {
  key: string
  label: string
  /** 空串表示这一项没抽到，界面标「未提取到」 */
  value: string
  /** 关键信息只展示摘要，避免长段落把版面撑开；完整值放在 title 里 */
  displayValue: string
  truncated: boolean
  verified: boolean
  confidence: number
}

function fieldValueOf(raw: unknown): string {
  return Array.isArray(raw)
    ? raw
        .map((item) => String(item))
        .filter(Boolean)
        .join('；')
    : String(raw ?? '').trim()
}

/** 关键信息是摘要，不是正文：超过这个长度就截断，完整值保留在 title 中 */
const FIELD_VALUE_MAX_CHARS = 120

function compactFieldValue(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text.length <= FIELD_VALUE_MAX_CHARS) return text
  return `${text.slice(0, FIELD_VALUE_MAX_CHARS - 1).trimEnd()}…`
}

const fields = computed<FieldRow[]>(() => {
  const category = article.value?.category ?? ''
  const extractions = article.value?.extractions ?? {}
  // 大类决定 schema：优先取与文章 category 同名的抽取块；只有分类缺失的旧数据
  // 才回退第一个块。分类明确但只有旧项目申报块时绝不套用项目模板。
  const schemaKey = category
    ? extractions[category]
      ? category
      : ''
    : (Object.keys(extractions)[0] ?? '')
  const schema = schemaKey ? extractions[schemaKey] : {}
  const order = CATEGORY_FIELD_ORDER[category] ?? CATEGORY_FIELD_ORDER[schemaKey] ?? []
  // 标准要素始终铺满；抽取结果缺失的字段显式显示「未提取到」，不能静默少行。
  const keys: string[] = [...order]
  for (const key of Object.keys(schema)) {
    if (!keys.includes(key)) keys.push(key)
  }
  const rows: FieldRow[] = keys.map((key) => {
    const field = schema[key]
    const value = field ? fieldValueOf(field.value) : ''
    const displayValue = compactFieldValue(value)
    return {
      key,
      label: FIELD_LABELS[key] ?? key,
      value,
      displayValue,
      truncated: displayValue !== value,
      verified: field?.verified ?? false,
      confidence: field?.confidence ?? 0,
    }
  })
  const rank = (key: string): number => {
    const index = order.indexOf(key)
    return index < 0 ? order.length : index
  }
  return rows.sort((a, b) => rank(a.key) - rank(b.key))
})

function tagLabel(id: string): string {
  return tagName(tagDefs.value, id)
}

function tagPercent(confidence: number): number {
  return scoreToPercent(confidence) ?? 0
}

/** 收藏走后端 /v1/me/favorites；浏览历史由详情接口在登录态自动记录 */
async function toggleFavorite(): Promise<void> {
  const item = article.value
  if (!item || favoriteLoading.value) return
  const targetId = item.article_id
  const next = !favorited.value
  favoriteLoading.value = true
  favoriteError.value = ''
  try {
    if (next) await addFavorite(targetId)
    else await removeFavorite(targetId)
    if (article.value?.article_id === targetId) favorited.value = next
  } catch (err) {
    if (article.value?.article_id === targetId) {
      favoriteError.value = err instanceof Error ? err.message : '收藏操作失败'
    }
  } finally {
    if (article.value?.article_id === targetId) favoriteLoading.value = false
  }
}

/**
 * 相关推荐：同大类的最新 5 条，排除自己。
 * 后端没有相似度接口，这里只能做「同分类近似」，标题也如实写成「同分类公告」，
 * 不冒充个性化推荐。
 */
const related = ref<ArticleListItem[]>([])

async function loadRelated(id: string, category: string | null, requestId: number): Promise<void> {
  if (!category) {
    related.value = []
    return
  }
  try {
    const page = await listArticles({ category, limit: 6, sort: 'published_desc' })
    if (requestId !== loadRequestId) return
    related.value = page.items.filter((item) => item.article_id !== id).slice(0, 5)
  } catch {
    // 推荐是次要信息，失败就整块不渲染，不打扰正文阅读
    if (requestId === loadRequestId) related.value = []
  }
}

/** 申报清单弹窗（规范模块四（7）：弹窗展示 + 支持下载） */
const checklistOpen = ref(false)
const checklistLoading = ref(false)
const checklistError = ref('')

/** 与后端 checklist_service 的适用条件一致：命中申报标签且有抽取块 */
const isProjectArticle = computed(
  () => article.value?.tags.some((item) => item.tag === 'project_application') ?? false,
)
const canGenerateChecklist = computed(
  () =>
    isProjectArticle.value &&
    Boolean(article.value?.extractions?.project_application) &&
    Boolean(article.value?.body?.trim()),
)

async function generateChecklistAction(force = false): Promise<void> {
  const item = article.value
  if (!item || checklistLoading.value) return
  const targetId = item.article_id
  const requestId = ++checklistRequestId
  checklistLoading.value = true
  checklistError.value = ''
  try {
    const result = await generateChecklist(targetId, force)
    // 生成期间可能已切换文章或开始新一轮生成：旧响应绝不能写到当前页面
    if (requestId !== checklistRequestId || article.value?.article_id !== targetId) return
    checklist.value = result
    checklistOpen.value = true
  } catch (err) {
    if (requestId === checklistRequestId && article.value?.article_id === targetId) {
      checklistError.value = err instanceof Error ? err.message : '申报清单生成失败'
    }
  } finally {
    if (requestId === checklistRequestId && article.value?.article_id === targetId) {
      checklistLoading.value = false
    }
  }
}

/** Esc 关闭弹窗由 el-dialog 自带，不再需要手写键盘监听 */

function downloadChecklist(): void {
  const items = checklist.value?.items ?? []
  const item = article.value
  if (!items.length || !item) return
  const lines = [
    item.title,
    '来源：' + sourceName(item.source),
    '发布时间：' + formatDateTime(item.published_at),
    '原文：' + item.url,
    '',
    '申报准备清单：',
    ...items.map((row, index) => `${index + 1}. ${row.text}`),
  ]
  // 用 Blob 下载纯文本：不引进第三方库，也不新增依赖
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `申报准备清单-${item.article_id.slice(0, 8)}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function load(id: string): Promise<void> {
  const requestId = ++loadRequestId
  const checklistRequest = ++checklistRequestId
  loading.value = true
  error.value = ''
  article.value = null
  checklist.value = null
  related.value = []
  favorited.value = false
  favoriteLoading.value = false
  favoriteError.value = ''
  toc.value = []
  checklistOpen.value = false
  checklistError.value = ''
  checklistLoading.value = false
  try {
    const detail = await getArticle(id)
    if (requestId !== loadRequestId) return
    article.value = detail
    favorited.value = Boolean(detail.is_favorite)
    favoriteError.value = ''
    void buildToc()
    // 词表与清单是次要信息：失败只影响对应区块，不把整页打回错误态
    void listTags()
      .then((defs) => {
        if (requestId === loadRequestId) tagDefs.value = defs
      })
      .catch(() => undefined)
    // 非项目申报文章没有清单，直接不发请求：既省一次往返，也避免必然的 404 出现在控制台
    if (detail.tags.some((item) => item.tag === 'project_application')) {
      void getChecklist(id)
        .then((result) => {
          // 生成成功会推进 checklistRequestId，迟到的 404/null 不得清空新生成的清单
          if (requestId === loadRequestId && checklistRequest === checklistRequestId) {
            checklist.value = result
          }
        })
        .catch(() => undefined)
    }
    void loadRelated(id, detail.category, requestId)
  } catch (err) {
    if (requestId !== loadRequestId) return
    error.value = err instanceof Error ? err.message : '加载公告详情失败'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && id) void load(id)
  },
  { immediate: true },
)
</script>

<template>
  <section class="article">
    <nav class="crumbs" aria-label="面包屑">
      <RouterLink to="/">首页</RouterLink>
      <span class="crumbs__sep">/</span>
      <RouterLink to="/category">分类浏览</RouterLink>
      <template v-if="article?.category">
        <span class="crumbs__sep">/</span>
        <RouterLink :to="{ name: 'search', query: { category: article.category } }">
          {{ categoryName(article.category) }}
        </RouterLink>
      </template>
      <span class="crumbs__sep">/</span>
      <span class="crumbs__current">公告详情</span>
    </nav>

    <SkeletonList v-if="loading" :rows="6" :with-badge="false" />

    <EmptyState v-else-if="error" variant="error" title="公告加载失败" :description="error">
      <template #action>
        <el-button type="primary" @click="load(String(route.params.id))">重新加载</el-button>
      </template>
    </EmptyState>

    <template v-else-if="article">
      <header class="head">
        <h1 class="head__title">{{ article.title }}</h1>
        <div class="head__meta">
          <RouterLink
            v-if="article.category"
            :to="{ name: 'search', query: { category: article.category } }"
          >
            <el-tag effect="light">{{ categoryName(article.category) }}</el-tag>
          </RouterLink>
          <span>{{ sourceName(article.source) }}</span>
          <span>{{ formatDateTime(article.published_at) }}</span>
          <span
            >约 <span class="num">{{ formatNumber(article.content_length) }}</span> 字</span
          >
          <ScoreBadge :score="article.relevance_score ?? null" label="相关度" />
          <ScoreBadge :score="article.category_confidence" label="分类置信度" />
        </div>
        <div class="head__actions">
          <el-button
            class="btn"
            :type="favorited ? 'primary' : 'default'"
            :loading="favoriteLoading"
            :aria-pressed="favorited"
            @click="toggleFavorite"
          >
            <el-icon><StarFilled v-if="favorited" /><Star v-else /></el-icon>
            {{ favorited ? '已收藏' : '收藏' }}
          </el-button>
          <el-button tag="a" :href="article.url" target="_blank" rel="noopener noreferrer">
            查看原文 ↗
          </el-button>
        </div>
        <p v-if="favoriteError" class="card__error" role="alert">{{ favoriteError }}</p>
      </header>

      <el-card v-if="relevanceSummary" class="card" shadow="never">
        <template #header><span class="card__title">AI 要素摘要</span></template>
        <p class="relevance__text">{{ relevanceSummary }}</p>
        <p class="card__note">由模型根据正文生成，仅高相关公告展示，请以原文为准。</p>
      </el-card>

      <el-card v-if="fields.length" class="card" shadow="never">
        <template #header><span class="card__title">关键信息</span></template>
        <el-descriptions class="fields" :column="isNarrow ? 1 : 2" border>
          <el-descriptions-item v-for="field in fields" :key="field.key" :label="field.label">
            <span
              class="field__value"
              :class="{ field__empty: !field.value, field__truncated: field.truncated }"
              :title="field.truncated ? field.value : undefined"
            >
              <template v-if="field.value">
                {{ field.displayValue }}
                <el-tag size="small" :type="field.verified ? 'success' : 'warning'" effect="light">
                  {{ field.verified ? '已核验' : '待核验' }}
                  {{ scoreToPercent(field.confidence) }}%
                </el-tag>
              </template>
              <template v-else>未提取到</template>
            </span>
          </el-descriptions-item>
        </el-descriptions>
        <p class="card__note">以上字段由模型从正文中抽取，标「待核验」的请以原文为准。</p>
      </el-card>

      <el-card v-if="checklist?.items.length || isProjectArticle" class="card" shadow="never">
        <template #header>
          <div class="card__head">
            <span class="card__title">申报准备清单</span>
            <div v-if="checklist?.items.length" class="card__actions">
              <el-button @click="checklistOpen = true">弹窗查看</el-button>
              <el-button :loading="checklistLoading" @click="generateChecklistAction(true)">
                重新生成
              </el-button>
              <el-button type="primary" @click="downloadChecklist">下载清单</el-button>
            </div>
            <div v-else-if="canGenerateChecklist" class="card__actions">
              <el-button
                type="primary"
                :loading="checklistLoading"
                @click="generateChecklistAction(false)"
              >
                {{ checklistLoading ? '生成中…' : '生成申报清单' }}
              </el-button>
            </div>
          </div>
        </template>
        <p v-if="checklistError" class="card__error" role="alert">{{ checklistError }}</p>
        <template v-if="checklist?.items.length">
          <ol class="checklist">
            <li v-for="(item, index) in checklist.items" :key="index" class="checklist__item">
              <span class="checklist__index num">{{ index + 1 }}</span>
              <div class="checklist__body">
                <p class="checklist__text">{{ item.text }}</p>
                <p v-if="item.source_text" class="checklist__source">
                  依据：{{ item.source_text }}
                </p>
                <span class="checklist__basis" :class="`checklist__basis--${item.basis}`">
                  {{ item.basis === 'excerpt' ? '原文依据' : '建议步骤' }}
                </span>
              </div>
            </li>
          </ol>
        </template>
        <p v-else-if="canGenerateChecklist" class="card__note">
          该公告已抽取到申报要素，可按需生成可执行的准备清单。
        </p>
        <p v-else class="card__note">
          该公告命中申报类但未抽取到可用的申报要素，暂无法生成清单，请查看原文核对。
        </p>
      </el-card>

      <el-card v-if="article.tags.length" class="card" shadow="never">
        <template #header><span class="card__title">相关标签</span></template>
        <div class="tags">
          <el-tag
            v-for="item in article.tags"
            :key="item.tag"
            :title="item.evidence ?? ''"
            effect="light"
          >
            {{ tagLabel(item.tag) }}
            <span class="tag__score num">{{ tagPercent(item.confidence) }}%</span>
          </el-tag>
        </div>
      </el-card>

      <el-card class="card" shadow="never">
        <template #header><span class="card__title">正文</span></template>
        <nav v-if="toc.length > 1" class="toc" aria-label="正文目录">
          <span class="toc__label">目录</span>
          <el-button
            v-for="item in toc"
            :key="item.id"
            link
            type="primary"
            class="toc__item"
            :class="{ 'toc__item--sub': item.level === 3 }"
            @click="jumpToSection(item.id)"
          >
            {{ item.text }}
          </el-button>
        </nav>
        <!-- body_html 已由后端白名单清洗；纯文本回退经 MarkdownIt(html:false) 转义 -->
        <!-- eslint-disable-next-line vue/no-v-html -- 内容来自 news-crawler html_sanitize 白名单，非用户输入 -->
        <article ref="bodyRef" class="body body--rich" v-html="bodyHtml"></article>
        <p v-if="!bodyHtml.trim()" class="body__empty">
          这篇公告没有落库正文，请点右上角「查看原文」。
        </p>
      </el-card>

      <!-- 规范模块四（6）：底部相关公告 3-5 条。后端只有大类，所以是同分类近似 -->
      <section v-if="related.length" class="related">
        <h2 class="related__title">同分类公告</h2>
        <p class="related__note">本类目下最近发布的其他公告，供横向对比申报条件与截止时间。</p>
        <div class="related__list">
          <ArticleCard
            v-for="item in related"
            :key="item.article_id"
            :article-id="item.article_id"
            :title="item.title"
            :source="item.source"
            :published-at="item.published_at"
            :category="item.category"
            :score="item.relevance_score ?? null"
            :summary="highRelevanceSummary(item.relevance_score, item.relevance_reason)"
            :show-more="false"
          />
        </div>
      </section>
    </template>

    <!-- 规范模块四（7）：申报清单弹窗 -->
    <el-dialog
      v-if="checklistOpen"
      v-model="checklistOpen"
      title="申报准备清单"
      width="720px"
      align-center
      class="checklist-dialog"
      :show-close="false"
    >
      <template #header>
        <div class="modal__head">
          <span class="modal__title">申报准备清单</span>
          <button
            type="button"
            class="modal__close"
            aria-label="关闭"
            @click="checklistOpen = false"
          >
            ×
          </button>
        </div>
      </template>
      <p class="modal__sub">{{ article?.title }}</p>
      <ol v-if="checklist" class="checklist modal__body">
        <li v-for="(item, index) in checklist.items" :key="index" class="checklist__item">
          <span class="checklist__index num">{{ index + 1 }}</span>
          <div class="checklist__body">
            <p class="checklist__text">{{ item.text }}</p>
            <p v-if="item.source_text" class="checklist__source">依据：{{ item.source_text }}</p>
            <span class="checklist__basis" :class="`checklist__basis--${item.basis}`">
              {{ item.basis === 'excerpt' ? '原文依据' : '建议步骤' }}
            </span>
          </div>
        </li>
      </ol>
      <template #footer>
        <el-button @click="checklistOpen = false">关闭</el-button>
        <el-button type="primary" @click="downloadChecklist">下载清单</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.article {
  max-width: var(--layout-max-width);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-10);
}

.crumbs {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.crumbs a {
  color: var(--color-text-secondary);
  text-decoration: none;
}

.crumbs a:hover {
  color: var(--color-primary);
}

.crumbs__sep {
  color: var(--color-text-disabled);
}

.crumbs__current {
  color: var(--color-text);
}

.head {
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-split);
  margin-bottom: var(--space-4);
}

.head__title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-h1);
  line-height: var(--line-height-heading);
  color: var(--color-text);
}

.head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.head__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 32px;
  padding: 0 var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-base);
  font-family: inherit;
  font-size: var(--font-size-body);
  line-height: 1;
  text-decoration: none;
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

.btn--ghost {
  border-color: var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
}

.btn--ghost:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn__icon {
  width: 14px;
  height: 14px;
}

.card {
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  box-shadow: var(--shadow-card);
}

.card__title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-h3);
  line-height: var(--line-height-heading);
  color: var(--color-text);
}

.card__note {
  margin: var(--space-3) 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.relevance__text {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid var(--color-success);
  background: var(--color-success-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.card__error {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-error);
}

.card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.card__title--inline {
  margin: 0;
}

.card__actions {
  display: flex;
  gap: var(--space-2);
}

.fields {
  display: block;
  width: 100%;
  margin: 0;
}

/* el-descriptions 内部是 table；让表格占满卡片宽度，label 固定不换行，
   关键信息与正文共用同一条内容栏，而不是被 grid 压成窄列。 */
.fields :deep(.el-descriptions__table) {
  width: 100%;
  table-layout: fixed;
}

.fields :deep(.el-descriptions__label) {
  width: 110px;
  white-space: nowrap;
  vertical-align: top;
}

.fields :deep(.el-descriptions__content) {
  vertical-align: top;
  overflow-wrap: anywhere;
}

.fields :deep(.el-descriptions__cell) {
  padding: 10px 14px;
}

.field {
  padding: var(--space-3);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-base);
  background: var(--color-bg-hover);
}

.field__label {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.field__value {
  margin: 0;
  font-size: var(--font-size-body);
  line-height: var(--line-height-base);
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.field__badge {
  display: inline-block;
  margin-left: var(--space-2);
  padding: 1px var(--space-2);
  border-radius: var(--radius-tag);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.field__badge--ok {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.field__badge--warn {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

/* 规范模块四（3）：要素缺失明确标「未提取到」，不留空让人以为页面坏了 */
.field__empty {
  color: var(--color-text-disabled);
  font-style: normal;
}

.checklist {
  margin: 0;
  padding: 0;
  list-style: none;
}

.checklist__item {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px dashed var(--color-split);
}

.checklist__item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.checklist__index {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.checklist__body {
  flex: 1;
  min-width: 0;
}

.checklist__text {
  margin: 0;
  font-size: var(--font-size-body);
  line-height: var(--line-height-base);
  color: var(--color-text);
}

.checklist__source {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.checklist__basis {
  display: inline-block;
  margin-top: var(--space-1);
  padding: 1px var(--space-2);
  border-radius: var(--radius-tag);
  font-size: var(--font-size-xs);
}

.checklist__basis--excerpt {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.checklist__basis--suggested {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-3);
  border-radius: var(--radius-tag);
  background: var(--color-bg-layout);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-decoration: none;
}

.tag--category {
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-sm);
}

.tag__score {
  color: var(--color-text-muted);
}

.body {
  font-size: var(--font-size-body);
  line-height: 1.8;
  color: var(--color-text);
}

.body p {
  margin: 0 0 var(--space-3);
}

.body p:last-child {
  margin-bottom: 0;
}

.body__empty {
  color: var(--color-text-muted);
}

/* 正文富文本：后端白名单只保留语义标签，样式全部由这里控制 */
.body--rich :deep(h1),
.body--rich :deep(h2),
.body--rich :deep(h3) {
  margin: var(--space-5) 0 var(--space-2);
  font-size: var(--font-size-h2);
  line-height: var(--line-height-heading);
  color: var(--color-text);
  scroll-margin-top: var(--space-6);
}

.body--rich :deep(h3) {
  font-size: var(--font-size-h3);
}

.body--rich :deep(p) {
  margin: 0 0 var(--space-3);
}

.body--rich :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-base);
}

.body--rich :deep(table) {
  width: 100%;
  margin: var(--space-3) 0;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.body--rich :deep(th),
.body--rich :deep(td) {
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.body--rich :deep(th) {
  background: var(--color-bg-layout);
  font-weight: 600;
}

.body--rich :deep(pre) {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  overflow-x: auto;
  background: #1f1f1f;
  border-radius: var(--radius-card);
  color: #f5f5f5;
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.body--rich :deep(code) {
  padding: 1px 4px;
  background: var(--color-bg-layout);
  border-radius: var(--radius-base);
  font-family: monospace;
  font-size: 0.92em;
}

.body--rich :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
}

.body--rich :deep(blockquote) {
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-4);
  border-left: 3px solid var(--color-primary);
  background: var(--color-primary-bg);
  color: var(--color-text-secondary);
}

.body--rich :deep(a) {
  color: var(--color-primary);
}

.toc {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background: var(--color-bg-layout);
  border-radius: var(--radius-card);
}

.toc__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.toc__item {
  padding: 2px 8px;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.toc__item:hover {
  text-decoration: underline;
}

.toc__item--sub {
  color: var(--color-text-secondary);
}

/* ── 同分类公告 ───────────────────────────────── */
.related {
  margin-top: var(--space-8);
}

.related__title {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-h2);
  line-height: var(--line-height-heading);
  color: var(--color-text);
}

.related__note {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.related__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3);
}

/* ── 申报清单弹窗（规范：弹窗圆角 8px） ─────────── */
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgb(0, 0, 0, 0.45);
}

.modal__panel {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  border-radius: var(--radius-modal);
  background: var(--color-bg);
  box-shadow: var(--shadow-modal);
}

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6) 0;
}

.modal__title {
  margin: 0;
  font-size: var(--font-size-h3);
  color: var(--color-text);
}

.modal__close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-h3);
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.modal__close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.modal__sub {
  margin: var(--space-2) 0 0;
  padding: 0 var(--space-6);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.modal__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4) var(--space-6);
}

.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6) var(--space-4);
  border-top: 1px solid var(--color-split);
}

@media (max-width: 768px) {
  .article {
    padding: var(--space-3);
  }

  .head__title {
    font-size: 20px;
    line-height: 1.45;
  }

  .head__meta,
  .head__actions {
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .fields :deep(.el-descriptions__label) {
    width: 96px;
    white-space: normal;
  }

  .related__list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .article {
    padding: var(--space-2);
  }

  .head__title {
    font-size: 18px;
  }

  .fields :deep(.el-descriptions__label) {
    width: 82px;
    padding: 8px 10px;
  }

  .fields :deep(.el-descriptions__content) {
    padding: 8px 10px;
  }
}
</style>
