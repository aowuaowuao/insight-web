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
 * 规范缺口（后端暂未提供对应能力，界面按「能取到的就展示、取不到就明说」处理）：
 * - 浏览量：接口没有，不展示。
 * - 「相关推荐 3-5 条」：调 /v1/articles?category=X 排除自身取 5 条同分类最新公告，
 *   属同分类近似，不是相似度推荐（后端没有相似度接口）。取不到时整块不渲染。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownIt from 'markdown-it'
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

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

/** 抽取字段的展示顺序与中文名；后端新增字段没登记时按 key 原样展示，不会丢信息 */
const FIELD_LABELS: Record<string, string> = {
  program_name: '项目名称',
  issuing_authority: '发布单位',
  eligible_applicants: '申报主体',
  materials: '申报材料',
  deadline: '截止日期',
  deadline_raw: '截止时间原文',
  funding_amount: '资助额度',
  application_channel: '申报渠道',
  contact: '联系方式',
}
const FIELD_ORDER = Object.keys(FIELD_LABELS)

const route = useRoute()
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

const fields = computed<FieldRow[]>(() => {
  const extractions = article.value?.extractions ?? {}
  const rows: FieldRow[] = []
  const seen = new Set<string>()
  for (const schema of Object.values(extractions)) {
    for (const [key, field] of Object.entries(schema)) {
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        label: FIELD_LABELS[key] ?? key,
        value: fieldValueOf(field.value),
        verified: field.verified,
        confidence: field.confidence,
      })
    }
  }
  if (rows.length === 0) {
    for (const key of FIELD_ORDER) {
      rows.push({ key, label: FIELD_LABELS[key], value: '', verified: false, confidence: 0 })
    }
  }
  const rank = (key: string): number => {
    const index = FIELD_ORDER.indexOf(key)
    return index < 0 ? FIELD_ORDER.length : index
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

/** Esc 关闭弹窗：规范要求三态交互完整，弹窗不能只靠点 ✕ 才能关 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && checklistOpen.value) checklistOpen.value = false
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

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
    void getChecklist(id)
      .then((result) => {
        // 生成成功会推进 checklistRequestId，迟到的 404/null 不得清空新生成的清单
        if (requestId === loadRequestId && checklistRequest === checklistRequestId) {
          checklist.value = result
        }
      })
      .catch(() => undefined)
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
        <button class="btn btn--primary" type="button" @click="load(String(route.params.id))">
          重新加载
        </button>
      </template>
    </EmptyState>

    <template v-else-if="article">
      <header class="head">
        <h1 class="head__title">{{ article.title }}</h1>
        <div class="head__meta">
          <RouterLink
            v-if="article.category"
            class="tag tag--category"
            :to="{ name: 'search', query: { category: article.category } }"
          >
            {{ categoryName(article.category) }}
          </RouterLink>
          <span>{{ sourceName(article.source) }}</span>
          <span>{{ formatDateTime(article.published_at) }}</span>
          <span
            >约 <span class="num">{{ formatNumber(article.content_length) }}</span> 字</span
          >
          <ScoreBadge :score="article.category_confidence" label="分类置信度" />
        </div>
        <div class="head__actions">
          <button
            class="btn"
            :class="favorited ? 'btn--primary' : 'btn--ghost'"
            type="button"
            :aria-pressed="favorited"
            :disabled="favoriteLoading"
            @click="toggleFavorite"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" class="btn__icon">
              <path
                d="M8 2.5l1.7 3.4 3.8.6-2.7 2.6.6 3.7L8 11l-3.4 1.8.6-3.7L2.5 6.5l3.8-.6z"
                :fill="favorited ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
            </svg>
            {{ favoriteLoading ? '处理中…' : favorited ? '已收藏' : '收藏' }}
          </button>
          <a class="btn btn--ghost" :href="article.url" target="_blank" rel="noopener noreferrer">
            查看原文 ↗
          </a>
        </div>
        <p v-if="favoriteError" class="card__error" role="alert">{{ favoriteError }}</p>
      </header>

      <section v-if="fields.length" class="card">
        <h2 class="card__title">关键信息</h2>
        <dl class="fields">
          <div v-for="field in fields" :key="field.key" class="field">
            <dt class="field__label">{{ field.label }}</dt>
            <dd class="field__value">
              <template v-if="field.value">
                {{ field.value }}
                <span
                  class="field__badge"
                  :class="field.verified ? 'field__badge--ok' : 'field__badge--warn'"
                >
                  {{ field.verified ? '已核验' : '待核验' }}
                  <span class="num">{{ scoreToPercent(field.confidence) }}%</span>
                </span>
              </template>
              <span v-else class="field__empty">未提取到</span>
            </dd>
          </div>
        </dl>
        <p class="card__note">以上字段由模型从正文中抽取，标「待核验」的请以原文为准。</p>
      </section>

      <section v-if="checklist?.items.length || isProjectArticle" class="card">
        <div class="card__head">
          <h2 class="card__title card__title--inline">申报准备清单</h2>
          <div v-if="checklist?.items.length" class="card__actions">
            <button class="btn btn--ghost" type="button" @click="checklistOpen = true">
              弹窗查看
            </button>
            <button
              class="btn btn--ghost"
              type="button"
              :disabled="checklistLoading"
              @click="generateChecklistAction(true)"
            >
              {{ checklistLoading ? '生成中…' : '重新生成' }}
            </button>
            <button class="btn btn--primary" type="button" @click="downloadChecklist">
              下载清单
            </button>
          </div>
          <div v-else-if="canGenerateChecklist" class="card__actions">
            <button
              class="btn btn--primary"
              type="button"
              :disabled="checklistLoading"
              @click="generateChecklistAction(false)"
            >
              {{ checklistLoading ? '生成中…' : '生成申报清单' }}
            </button>
          </div>
        </div>
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
      </section>

      <section v-if="article.tags.length" class="card">
        <h2 class="card__title">相关标签</h2>
        <ul class="tags">
          <li v-for="item in article.tags" :key="item.tag" class="tag" :title="item.evidence ?? ''">
            {{ tagLabel(item.tag) }}
            <span class="tag__score num">{{ tagPercent(item.confidence) }}%</span>
          </li>
        </ul>
      </section>

      <section class="card">
        <h2 class="card__title">正文</h2>
        <nav v-if="toc.length > 1" class="toc" aria-label="正文目录">
          <span class="toc__label">目录</span>
          <button
            v-for="item in toc"
            :key="item.id"
            class="toc__item"
            :class="{ 'toc__item--sub': item.level === 3 }"
            type="button"
            @click="jumpToSection(item.id)"
          >
            {{ item.text }}
          </button>
        </nav>
        <!-- body_html 已由后端白名单清洗；纯文本回退经 MarkdownIt(html:false) 转义 -->
        <!-- eslint-disable-next-line vue/no-v-html -- 内容来自 news-crawler html_sanitize 白名单，非用户输入 -->
        <article ref="bodyRef" class="body body--rich" v-html="bodyHtml"></article>
        <p v-if="!bodyHtml.trim()" class="body__empty">
          这篇公告没有落库正文，请点右上角「查看原文」。
        </p>
      </section>

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
            :score="null"
            :show-more="false"
          />
        </div>
      </section>
    </template>

    <!-- 规范模块四（7）：申报清单弹窗 -->
    <div
      v-if="checklistOpen && checklist"
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="申报准备清单"
      @click.self="checklistOpen = false"
    >
      <div class="modal__panel">
        <header class="modal__head">
          <h2 class="modal__title">申报准备清单</h2>
          <button
            class="modal__close"
            type="button"
            aria-label="关闭"
            @click="checklistOpen = false"
          >
            ✕
          </button>
        </header>
        <p class="modal__sub">{{ article?.title }}</p>
        <ol class="checklist modal__body">
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
        <footer class="modal__foot">
          <button class="btn btn--ghost" type="button" @click="checklistOpen = false">关闭</button>
          <button class="btn btn--primary" type="button" @click="downloadChecklist">
            下载清单
          </button>
        </footer>
      </div>
    </div>
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
  margin: 0;
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
</style>
