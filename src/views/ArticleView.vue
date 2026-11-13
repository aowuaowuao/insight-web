<script setup lang="ts">
/**
 * 公告详情页。
 * 对照规范 2.2.1（二）模块四：面包屑、标题与来源/时间/分类、
 * 关键信息摘要（申报条件、材料、截止时间等）、申报准备清单、
 * 标签、正文全文、原文跳转、收藏。
 *
 * 数据来自 news-insight：
 * - GET /v1/articles/{id}            详情 + 标签 + 结构化抽取
 * - GET /v1/articles/{id}/checklist  申报清单（无清单时 404 → null）
 * 收藏与浏览历史存 localStorage（后端暂无收藏接口），结构见 ProfileView 的 StoredArticle。
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import ScoreBadge from '@/components/ScoreBadge.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { getArticle, getChecklist, type ArticleChecklist, type ArticleDetail } from '@/api/article'
import { listTags, tagName, type TagDef } from '@/api/tags'
import { categoryName } from '@/constants/categories'
import { sourceName } from '@/constants/sources'
import { formatDateTime, formatNumber, scoreToPercent } from '@/utils/format'
import { readJson, writeJson } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/storageKeys'

interface StoredArticle {
  article_id: string
  title: string
  source: string
  category: string | null
  published_at: string | null
  at: number
}

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

/** 详情页的请求序号：路由快速切换时防止旧响应覆盖新文章 */
let loadRequestId = 0

const paragraphs = computed(() =>
  (article.value?.body ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean),
)

const fields = computed(() => {
  const extractions = article.value?.extractions ?? {}
  const rows: {
    key: string
    label: string
    value: string
    verified: boolean
    confidence: number
  }[] = []
  for (const schema of Object.values(extractions)) {
    for (const [key, field] of Object.entries(schema)) {
      const value = Array.isArray(field.value)
        ? field.value.map((item) => String(item)).join('；')
        : String(field.value ?? '').trim()
      if (!value) continue
      rows.push({
        key,
        label: FIELD_LABELS[key] ?? key,
        value,
        verified: field.verified,
        confidence: field.confidence,
      })
    }
  }
  return rows.sort((a, b) => {
    const left = FIELD_ORDER.indexOf(a.key)
    const right = FIELD_ORDER.indexOf(b.key)
    return (left < 0 ? FIELD_ORDER.length : left) - (right < 0 ? FIELD_ORDER.length : right)
  })
})

function tagLabel(id: string): string {
  return tagName(tagDefs.value, id)
}

function tagPercent(confidence: number): number {
  return scoreToPercent(confidence) ?? 0
}

function favoriteEntry(item: ArticleDetail): StoredArticle {
  return {
    article_id: item.article_id,
    title: item.title,
    source: item.source,
    category: item.category,
    published_at: item.published_at,
    at: Date.now(),
  }
}

function loadFavorited(): void {
  const stored = readJson<StoredArticle[]>(STORAGE_KEYS.FAVORITES, [])
  favorited.value = stored.some((item) => item.article_id === route.params.id)
}

function toggleFavorite(): void {
  const item = article.value
  if (!item) return
  const stored = readJson<StoredArticle[]>(STORAGE_KEYS.FAVORITES, [])
  const exists = stored.some((row) => row.article_id === item.article_id)
  const next = exists
    ? stored.filter((row) => row.article_id !== item.article_id)
    : [favoriteEntry(item), ...stored]
  writeJson(STORAGE_KEYS.FAVORITES, next)
  favorited.value = !exists
}

/** 浏览历史：同一篇只保留最近一次，最多 50 条 */
function rememberVisit(item: ArticleDetail): void {
  const stored = readJson<StoredArticle[]>(STORAGE_KEYS.VIEW_HISTORY, [])
  const next = [
    favoriteEntry(item),
    ...stored.filter((row) => row.article_id !== item.article_id),
  ].slice(0, 50)
  writeJson(STORAGE_KEYS.VIEW_HISTORY, next)
}

async function load(id: string): Promise<void> {
  const requestId = ++loadRequestId
  loading.value = true
  error.value = ''
  article.value = null
  checklist.value = null
  try {
    const detail = await getArticle(id)
    if (requestId !== loadRequestId) return
    article.value = detail
    rememberVisit(detail)
    loadFavorited()
    // 词表与清单是次要信息：失败只影响对应区块，不把整页打回错误态
    void listTags()
      .then((defs) => {
        if (requestId === loadRequestId) tagDefs.value = defs
      })
      .catch(() => undefined)
    void getChecklist(id)
      .then((result) => {
        if (requestId === loadRequestId) checklist.value = result
      })
      .catch(() => undefined)
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
            {{ favorited ? '已收藏' : '收藏' }}
          </button>
          <a class="btn btn--ghost" :href="article.url" target="_blank" rel="noopener noreferrer">
            查看原文 ↗
          </a>
        </div>
      </header>

      <section v-if="fields.length" class="card">
        <h2 class="card__title">关键信息</h2>
        <dl class="fields">
          <div v-for="field in fields" :key="field.key" class="field">
            <dt class="field__label">{{ field.label }}</dt>
            <dd class="field__value">
              {{ field.value }}
              <span
                class="field__badge"
                :class="field.verified ? 'field__badge--ok' : 'field__badge--warn'"
              >
                {{ field.verified ? '已核验' : '待核验' }}
                <span class="num">{{ scoreToPercent(field.confidence) }}%</span>
              </span>
            </dd>
          </div>
        </dl>
        <p class="card__note">以上字段由模型从正文中抽取，标「待核验」的请以原文为准。</p>
      </section>

      <section v-if="checklist?.items.length" class="card">
        <h2 class="card__title">申报准备清单</h2>
        <ol class="checklist">
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
        <article class="body">
          <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
          <p v-if="!paragraphs.length" class="body__empty">
            这篇公告没有落库正文，请点右上角「查看原文」。
          </p>
        </article>
      </section>
    </template>
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
</style>
