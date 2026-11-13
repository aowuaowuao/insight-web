<script setup lang="ts">
/**
 * 分类浏览页。
 * 对照规范 2.2.1（二）模块三：6 大类分布、每类公告数量与占比、
 * 点击分类查看该类公告并可直接进入「该类内检索」。
 *
 * 数据来自 news-insight：
 * - GET /v1/categories      分类定义（名称、描述、类内标签白名单）
 * - GET /v1/categories/stats 每类文章数与平均分类置信度
 * - GET /v1/articles?category=xxx&limit=10 展开时取该类最新 10 篇
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ArticleCard from '@/components/ArticleCard.vue'
import EmptyState from '@/components/EmptyState.vue'
import ScoreBadge from '@/components/ScoreBadge.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { categoryStats, listCategories, type CategoryDef, type CategoryStat } from '@/api/category'
import { listArticles, type ArticleListItem } from '@/api/articles'
import { CATEGORY_ORDER } from '@/constants/categories'

const router = useRouter()

const categories = ref<CategoryDef[]>([])
const stats = ref<CategoryStat[]>([])
const loading = ref(true)
const error = ref('')

const expanded = ref('')
const articles = ref<Record<string, ArticleListItem[]>>({})
const articleLoading = ref('')
const articleError = ref('')
/**
 * 展开面板的请求序号：快速连续点开两个大类时，先发的请求可能后回来，
 * 不做序号守卫会出现「标题是资金补贴、内容是项目申报」的错位。
 */
let articlesRequestId = 0

const ordered = computed<CategoryDef[]>(() => {
  const known = CATEGORY_ORDER.map((id) => categories.value.find((item) => item.id === id)).filter(
    (item): item is CategoryDef => Boolean(item),
  )
  const unknown = categories.value.filter(
    (item) => !(CATEGORY_ORDER as readonly string[]).includes(item.id),
  )
  return [...known, ...unknown]
})

const totalArticles = computed(() => stats.value.reduce((sum, item) => sum + item.count, 0))

function statOf(id: string): CategoryStat | undefined {
  return stats.value.find((item) => item.category === id)
}

/** 该类占全部已分析文章的比例（用于占比条） */
function percent(id: string): number {
  const total = totalArticles.value
  if (!total) return 0
  return Math.round(((statOf(id)?.count ?? 0) / total) * 100)
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [defs, statList] = await Promise.all([listCategories(), categoryStats()])
    categories.value = defs
    stats.value = statList
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载分类数据失败'
  } finally {
    loading.value = false
  }
}

async function toggle(id: string): Promise<void> {
  if (expanded.value === id) {
    expanded.value = ''
    // 收起时作废在飞请求，避免它回填到已收起的面板
    articlesRequestId += 1
    articleLoading.value = ''
    return
  }
  expanded.value = id
  const requestId = ++articlesRequestId
  articleLoading.value = id
  articleError.value = ''
  try {
    const page = await listArticles({ category: id, limit: 10 })
    if (requestId !== articlesRequestId) return
    articles.value = { ...articles.value, [id]: page.items }
  } catch (err) {
    if (requestId !== articlesRequestId) return
    articleError.value = err instanceof Error ? err.message : '加载该类公告失败'
  } finally {
    if (requestId === articlesRequestId) articleLoading.value = ''
  }
}

function searchInCategory(id: string): void {
  void router.push({ name: 'search', query: { category: id } })
}

onMounted(load)
</script>

<template>
  <section class="category">
    <header class="page-head">
      <div>
        <h1>分类浏览</h1>
        <p class="page-head__desc">
          全部已分析文章按 6 个大类（含其他）归档（共
          <span class="num">{{ totalArticles }}</span> 篇），点击分类查看该类公告。
        </p>
      </div>
      <button class="btn btn--ghost" type="button" :disabled="loading" @click="load">
        刷新数据
      </button>
    </header>

    <SkeletonList v-if="loading" :rows="6" :with-badge="false" />

    <EmptyState v-else-if="error" variant="error" title="分类数据加载失败" :description="error">
      <template #action>
        <button class="btn btn--primary" type="button" @click="load">重新加载</button>
      </template>
    </EmptyState>

    <ul v-else class="cat-list">
      <li
        v-for="item in ordered"
        :key="item.id"
        class="cat"
        :class="{ 'cat--open': expanded === item.id }"
      >
        <div class="cat__head">
          <button
            class="cat__toggle"
            type="button"
            :aria-expanded="expanded === item.id"
            :aria-controls="`cat-panel-${item.id}`"
            @click="toggle(item.id)"
          >
            <span class="cat__name">{{ item.name }}</span>
            <span class="cat__count">
              <span class="num">{{ statOf(item.id)?.count ?? 0 }}</span> 篇
            </span>
            <ScoreBadge :score="statOf(item.id)?.avg_confidence ?? null" label="平均置信度" />
            <svg class="cat__chevron" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 6l4 4 4-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div class="cat__bar" role="img" :aria-label="`占全部文章 ${percent(item.id)}%`">
            <span class="cat__bar-fill" :style="{ width: `${percent(item.id)}%` }" />
          </div>

          <div class="cat__meta">
            <span
              >占全部 <span class="num">{{ percent(item.id) }}%</span></span
            >
            <button class="btn btn--text" type="button" @click="searchInCategory(item.id)">
              在该类中检索 →
            </button>
          </div>

          <p class="cat__desc">{{ item.description }}</p>
        </div>

        <div v-show="expanded === item.id" :id="`cat-panel-${item.id}`" class="cat__panel">
          <SkeletonList v-if="articleLoading === item.id" :rows="3" :with-badge="false" />
          <EmptyState
            v-else-if="articleError"
            variant="error"
            title="该类公告加载失败"
            :description="articleError"
          />
          <EmptyState
            v-else-if="!(articles[item.id] ?? []).length"
            variant="no-data"
            title="该类暂无公告"
            description="换个分类看看，或等下一轮分析完成。"
          />
          <div v-else class="cat__articles">
            <ArticleCard
              v-for="article in articles[item.id]"
              :key="article.article_id"
              :article-id="article.article_id"
              :title="article.title"
              :source="article.source"
              :published-at="article.published_at"
              :category="article.category"
            />
          </div>
          <RouterLink
            class="btn btn--primary"
            :to="{ name: 'search', query: { category: item.id } }"
          >
            浏览该类全部文章
          </RouterLink>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.category {
  max-width: var(--layout-max-width);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) var(--space-10);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
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

.cat-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cat {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  box-shadow: var(--shadow-card);
  transition: box-shadow var(--duration-base) var(--ease-out);
}

.cat:hover {
  box-shadow: var(--shadow-card-hover);
}

.cat--open {
  border-color: var(--color-primary-light);
}

.cat__head {
  padding: var(--space-4);
}

.cat__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  color: var(--color-text);
  cursor: pointer;
}

.cat__name {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.cat__count {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.cat__count .num {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
}

.cat__chevron {
  width: 16px;
  height: 16px;
  margin-left: auto;
  color: var(--color-text-muted);
  transition: transform var(--duration-base) var(--ease-out);
}

.cat--open .cat__chevron {
  transform: rotate(180deg);
}

.cat__bar {
  height: 6px;
  margin: var(--space-3) 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-split);
  overflow: hidden;
}

.cat__bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  transition: width var(--duration-base) var(--ease-out);
}

.cat__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.cat__desc {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: var(--line-height-base);
}

.cat__panel {
  padding: 0 var(--space-4) var(--space-4);
  border-top: 1px solid var(--color-split);
}

.cat__articles {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-4) 0;
  padding: 0;
  list-style: none;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: 0 var(--space-4);
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-base);
  font-size: var(--font-size-body);
  font-family: inherit;
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
  background: var(--color-split);
  border-color: var(--color-border);
  color: var(--color-text-disabled);
  cursor: not-allowed;
}

.cat__panel > .btn {
  margin-top: var(--space-2);
}
</style>
