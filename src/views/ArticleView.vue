<script setup lang="ts">
/**
 * 文章详情页：/article/:id
 * 数据来自 GET /v1/articles/{id}；申报清单另取 /v1/articles/{id}/checklist（没有则隐藏）。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getArticle,
  getChecklist,
  type ArticleChecklist,
  type ArticleDetail,
  type ExtractionField,
} from '@/api/article'
import { categoryName } from '@/constants/categories'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { sourceName } from '@/constants/sources'

const route = useRoute()
const router = useRouter()

/** 请求序号守卫：快速连点两篇时，先发出的请求返回更晚也不能覆盖当前文章 */
const latest = useLatestRequest()

const article = ref<ArticleDetail | null>(null)
const checklist = ref<ArticleChecklist | null>(null)
const loading = ref(false)
const error = ref('')

/** 抽取字段的中文标签（与后端 schema 对齐） */
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

interface FieldEntry {
  name: string
  label: string
  field: ExtractionField
}

interface ExtractionGroup {
  schemaId: string
  fields: FieldEntry[]
}

const extractionGroups = computed<ExtractionGroup[]>(() => {
  if (!article.value) return []
  return Object.entries(article.value.extractions).map(([schemaId, fields]) => ({
    schemaId,
    fields: Object.entries(fields).map(([name, field]) => ({
      name,
      label: FIELD_LABELS[name] ?? name,
      field,
    })),
  }))
})

async function load(id: string): Promise<void> {
  const requestId = latest.next()
  loading.value = true
  error.value = ''
  article.value = null
  checklist.value = null

  try {
    const detail = await getArticle(id)
    if (!latest.isCurrent(requestId)) return
    article.value = detail
    // 清单是可选内容：没有（404）或失败都不该让整页报错
    try {
      const checklistResult = await getChecklist(id)
      if (!latest.isCurrent(requestId)) return
      checklist.value = checklistResult
    } catch {
      if (!latest.isCurrent(requestId)) return
      checklist.value = null
    }
  } catch (e) {
    if (!latest.isCurrent(requestId)) return
    error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
  } finally {
    if (latest.isCurrent(requestId)) loading.value = false
  }
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && id) void load(id)
  },
  { immediate: true },
)

function formatDate(value: string | null): string {
  if (!value) return '暂无日期'
  return value.replace('T', ' ').slice(0, 16)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未提取'
  if (Array.isArray(value)) return value.join('；')
  return String(value)
}

function goBack(): void {
  router.back()
}
</script>

<template>
  <section class="article">
    <button class="article__back" type="button" @click="goBack">← 返回</button>

    <p v-if="loading" class="article__state">正在加载文章详情…</p>
    <p v-else-if="error" class="article__state article__state--error" role="alert">{{ error }}</p>

    <template v-else-if="article">
      <header class="article__head">
        <h1 class="article__title">{{ article.title }}</h1>

        <div class="article__meta">
          <span class="article__tag">{{ categoryName(article.category ?? 'other') }}</span>
          <span class="article__source">来源：{{ sourceName(article.source) }}</span>
          <span class="article__date">发布于 {{ formatDate(article.published_at) }}</span>
        </div>

        <a
          v-if="article.url"
          class="article__link"
          :href="article.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          查看原文 ↗
        </a>
      </header>

      <!-- 抽取信息 -->
      <section v-if="extractionGroups.length" class="block">
        <h2 class="block__title">关键信息</h2>
        <div v-for="group in extractionGroups" :key="group.schemaId" class="fields">
          <div v-for="entry in group.fields" :key="entry.name" class="field">
            <span class="field__label">{{ entry.label }}</span>
            <span
              class="field__value"
              :class="{ 'field__value--empty': formatValue(entry.field.value) === '未提取' }"
            >
              {{ formatValue(entry.field.value) }}
            </span>
            <span
              class="field__badge"
              :class="entry.field.verified ? 'is-verified' : 'is-unverified'"
            >
              {{ entry.field.verified ? '已核对原文' : '待人工核对' }}
            </span>
          </div>
        </div>
      </section>

      <!-- 申报准备清单 -->
      <section v-if="checklist && checklist.items.length" class="block">
        <h2 class="block__title">
          申报准备清单
          <span class="block__hint">按执行顺序排列</span>
        </h2>
        <ol class="checklist">
          <li v-for="(item, index) in checklist.items" :key="index" class="checklist__item">
            <span class="checklist__index">{{ index + 1 }}</span>
            <div class="checklist__body">
              <p class="checklist__text">{{ item.text }}</p>
              <p v-if="item.source_text" class="checklist__source">依据：{{ item.source_text }}</p>
            </div>
            <span
              class="checklist__badge"
              :class="item.basis === 'excerpt' ? 'is-excerpt' : 'is-suggested'"
            >
              {{ item.basis === 'excerpt' ? '原文依据' : '流程建议' }}
            </span>
          </li>
        </ol>
      </section>

      <!-- 标签 -->
      <section v-if="article.tags.length" class="block">
        <h2 class="block__title">标签</h2>
        <div class="tags">
          <span v-for="tag in article.tags" :key="tag.tag" class="tags__item">
            {{ tag.tag }}
            <em class="tags__conf">{{ (tag.confidence * 100).toFixed(0) }}%</em>
          </span>
        </div>
      </section>

      <!-- 正文 -->
      <details v-if="article.body" class="block body">
        <summary class="block__title body__summary">原文正文</summary>
        <p class="body__text">{{ article.body }}</p>
      </details>
    </template>
  </section>
</template>

<style scoped>
.article {
  max-width: 820px;
  margin: 0 auto;
  padding-top: 1.5rem;
}

.article__back {
  margin-bottom: 1.2rem;
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 0.86rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.18s ease;
}

.article__back:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.article__state {
  padding: 3rem 0;
  text-align: center;
  color: var(--muted);
  font-size: 0.92rem;
}

.article__state--error {
  color: #ef4444;
}

.article__head {
  padding-bottom: 1.2rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.6rem;
}

.article__title {
  margin: 0 0 0.8rem;
  font-size: clamp(1.3rem, 2.6vw, 1.75rem);
  line-height: 1.45;
}

.article__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.8rem;
  font-size: 0.84rem;
  color: var(--muted);
}

.article__tag {
  padding: 0.1em 0.65em;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.article__source {
  color: #3b82f6;
}

.article__link {
  display: inline-block;
  margin-top: 0.8rem;
  font-size: 0.86rem;
  text-decoration: none;
}

.block {
  margin-bottom: 1.8rem;
}

.block__title {
  margin: 0 0 0.9rem;
  font-size: 1rem;
  font-weight: 600;
}

.block__hint {
  margin-left: 0.5rem;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 400;
}

/* 抽取字段 */
.fields {
  display: grid;
  gap: 0.55rem;
}

.field {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  padding: 0.75rem 0.95rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 0.88rem;
}

.field__label {
  flex: 0 0 6.5em;
  color: var(--muted);
}

.field__value {
  flex: 1;
  line-height: 1.6;
  word-break: break-word;
}

.field__value--empty {
  color: var(--muted);
  opacity: 0.7;
}

.field__badge {
  flex: 0 0 auto;
  padding: 0.12em 0.55em;
  border-radius: 999px;
  font-size: 0.72rem;
}

.field__badge.is-verified {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.field__badge.is-unverified {
  background: rgba(148, 163, 184, 0.16);
  color: var(--muted);
}

/* 清单 */
.checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.6rem;
}

.checklist__item {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.checklist__index {
  flex: 0 0 1.4rem;
  height: 1.4rem;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
  font-size: 0.74rem;
  font-weight: 700;
}

.checklist__body {
  flex: 1;
}

.checklist__text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
}

.checklist__source {
  margin: 0.3rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.checklist__badge {
  flex: 0 0 auto;
  padding: 0.12em 0.55em;
  border-radius: 999px;
  font-size: 0.72rem;
}

.checklist__badge.is-excerpt {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.checklist__badge.is-suggested {
  background: rgba(234, 179, 8, 0.14);
  color: #b45309;
}

/* 标签 */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.tags__item {
  padding: 0.28rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.8rem;
}

.tags__conf {
  margin-left: 0.35rem;
  color: var(--muted);
  font-style: normal;
  font-size: 0.72rem;
}

/* 正文 */
.body__summary {
  cursor: pointer;
  color: var(--muted);
}

.body__text {
  margin: 0.8rem 0 0;
  padding: 1rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 0.88rem;
  line-height: 1.85;
  white-space: pre-wrap;
  color: var(--muted);
}
</style>
