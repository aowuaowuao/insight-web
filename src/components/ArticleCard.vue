<!--
  公告卡片（公共组件）。
  规范 2.2.1（四）2：公告卡片、要素标签、空状态、加载骨架等要抽成公共组件，支持 Props 与 Events。
  规范 2.2.1（二）模块三（3）：标题最多 2 行超出省略、分类标签、发布时间、来源网站、
  相关度评分（0-100，绿≥80 / 黄≥60 / 红<60）、关键要素摘要（仅高相关度显示）。
  搜索页与分类页原先各写一份结构完全相同的卡片，改一处要改两遍，这里统一。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ScoreBadge from './ScoreBadge.vue'
import SearchHighlight from './SearchHighlight.vue'
import { formatDate, scoreLevel, scoreToPercent } from '@/utils/format'
import { categoryName } from '@/constants/categories'
import { sourceName } from '@/constants/sources'

const props = withDefaults(
  defineProps<{
    articleId: string
    title: string
    source: string
    publishedAt: string | null
    category?: string | null
    /** 受控行业 id（仅用于语义，不直接展示） */
    industry?: string | null
    /** 行业显示名；来自 /v1/industries，由页面查好传入 */
    industryName?: string | null
    /** 相关度（0-1）。不传则不显示评分 */
    score?: number | null
    /** 命中的关键词，用于标题高亮 */
    matchedTerms?: string[]
    /** 关键要素摘要，如「截止 2026-11-30」「补贴 50 万」 */
    highlights?: string[]
    /** 显示“查看详情 →” */
    showMore?: boolean
  }>(),
  {
    category: null,
    industry: null,
    industryName: null,
    score: null,
    matchedTerms: () => [],
    highlights: () => [],
    showMore: true,
  },
)

const percent = computed(() => scoreToPercent(props.score))
/** 规范：只有高相关度（≥80）的公告才展示关键要素摘要 */
const showHighlights = computed(
  () =>
    props.highlights.length > 0 && percent.value !== null && scoreLevel(percent.value) === 'high',
)

const emit = defineEmits<{
  (e: 'click', articleId: string): void
}>()
</script>

<template>
  <article class="card">
    <RouterLink
      :to="{ name: 'article', params: { id: articleId } }"
      class="card__link"
      @click="emit('click', articleId)"
    >
      <div class="card__head">
        <span v-if="category" class="card__tag">{{ categoryName(category) }}</span>
        <span v-if="industryName" class="card__tag card__tag--industry">{{ industryName }}</span>
        <span class="card__source">来源：{{ sourceName(source) }}</span>
        <span class="card__date">{{ formatDate(publishedAt) }}</span>
        <ScoreBadge v-if="percent !== null" :score="score ?? null" class="card__score" />
      </div>

      <h2 class="card__title">
        <SearchHighlight :text="title" :terms="matchedTerms" />
      </h2>

      <ul v-if="showHighlights" class="card__highlights">
        <li v-for="item in highlights" :key="item" class="card__highlight">{{ item }}</li>
      </ul>

      <p v-if="matchedTerms.length" class="card__terms">命中：{{ matchedTerms.join(' / ') }}</p>

      <span v-if="showMore" class="card__more">查看详情 →</span>
    </RouterLink>
  </article>
</template>

<style scoped>
.card {
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  transition:
    box-shadow var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}

.card:hover {
  border-color: var(--color-primary-hover);
  box-shadow: var(--shadow-card-hover);
}

.card:active {
  border-color: var(--color-primary-active);
}

.card__link {
  display: block;
  padding: var(--space-3) var(--space-4);
  color: inherit;
  text-decoration: none;
  border-radius: var(--radius-card);
}

.card__link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.card__tag {
  padding: 1px var(--space-2);
  border-radius: var(--radius-tag);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}

.card__tag--industry {
  background: var(--color-bg-layout);
  color: var(--color-text-secondary);
}

.card__score {
  margin-left: auto;
}

/* 标题最多 2 行，超出省略（规范模块三（3）） */
.card__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-heading);
  color: var(--color-text);
  transition: color var(--duration-base) var(--ease-out);
}

.card:hover .card__title {
  color: var(--color-primary);
}

.card__highlights {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  padding: 0;
  list-style: none;
}

.card__highlight {
  padding: 1px var(--space-2);
  border-radius: var(--radius-base);
  background: var(--color-success-bg);
  color: var(--color-success);
  font-size: var(--font-size-xs);
}

.card__terms {
  margin: 0 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.card__more {
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}
</style>
