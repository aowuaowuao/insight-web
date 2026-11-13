<script setup lang="ts">
/**
 * 分类浏览页：GET /v1/categories 拿 6 个大类（含类内标签白名单与文章数），
 * 再按需 GET /v1/articles?category= 拉该类最新文章。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { categoryStats, listCategories, type CategoryDef, type CategoryStat } from '@/api/category'
import { listArticles, type ArticleListItem } from '@/api/articles'
import { CATEGORY_ORDER } from '@/constants/categories'
import { sourceName } from '@/constants/sources'

const router = useRouter()

const categories = ref<CategoryDef[]>([])
const stats = ref<CategoryStat[]>([])
const loading = ref(false)
const error = ref('')

/** 当前展开的大类（'' 表示都收起） */
const activeId = ref('')
const articles = ref<ArticleListItem[]>([])
const articlesLoading = ref(false)
const articlesError = ref('')

/** 后端返回顺序不可依赖，按词表固定顺序渲染 */
const ordered = computed<CategoryDef[]>(() => {
  const byId = new Map(categories.value.map((c) => [c.id, c]))
  const list = CATEGORY_ORDER.map((id) => byId.get(id)).filter((c): c is CategoryDef => Boolean(c))
  const rest = categories.value.filter((c) => !CATEGORY_ORDER.includes(c.id as never))
  return [...list, ...rest]
})

const statOf = computed<Record<string, CategoryStat>>(() => {
  const map: Record<string, CategoryStat> = {}
  for (const item of stats.value) map[item.category] = item
  return map
})

const totalArticles = computed(() => stats.value.reduce((sum, item) => sum + item.count, 0))

function percent(count: number): number {
  if (!totalArticles.value) return 0
  return Math.round((count / totalArticles.value) * 100)
}

function confidenceOf(id: string): string {
  const stat = statOf.value[id]
  return stat ? `${(stat.avg_confidence * 100).toFixed(0)}%` : '—'
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [defs, rows] = await Promise.all([listCategories(), categoryStats()])
    categories.value = defs
    stats.value = rows
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载分类失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function toggle(id: string): Promise<void> {
  if (activeId.value === id) {
    activeId.value = ''
    articles.value = []
    return
  }
  activeId.value = id
  articles.value = []
  articlesLoading.value = true
  articlesError.value = ''
  try {
    const page = await listArticles({ category: id, limit: 10 })
    articles.value = page.items
  } catch (e) {
    articlesError.value = e instanceof Error ? e.message : '加载文章失败，请稍后重试'
  } finally {
    articlesLoading.value = false
  }
}

/** 带着分类进入检索页（搜索页会读取 category 查询参数） */
function searchInCategory(id: string): void {
  void router.push({ name: 'search', query: { category: id } })
}

function openArticle(id: string): void {
  void router.push({ name: 'article', params: { id } })
}

function formatDate(value: string | null): string {
  if (!value) return '暂无日期'
  return value.replace('T', ' ').slice(0, 10)
}

onMounted(load)
</script>

<template>
  <section class="category">
    <header class="category__head">
      <h1>分类浏览</h1>
      <p class="category__desc">
        全部已分析文章按 5 大类归档<template v-if="totalArticles">
          （共 {{ totalArticles }} 篇）
</template
        >。展开任意一类可看该类最新文章，也可以直接在该类里检索关键词。
      </p>
    </header>

    <p v-if="loading" class="category__hint">正在加载分类…</p>
    <p v-else-if="error" class="category__error" role="alert">{{ error }}</p>

    <ul v-else class="category__list">
      <li v-for="item in ordered" :key="item.id" class="cat">
        <div class="cat__head">
          <button
            class="cat__toggle"
            type="button"
            :aria-expanded="activeId === item.id"
            @click="toggle(item.id)"
          >
            <span class="cat__name">{{ item.name }}</span>
            <span class="cat__count">{{ statOf[item.id]?.count ?? item.article_count }} 篇</span>
            <span class="cat__conf">平均置信度 {{ confidenceOf(item.id) }}</span>
            <span class="cat__chevron" :class="{ 'cat__chevron--open': activeId === item.id }">▾</span>
          </button>
          <button class="cat__search" type="button" @click="searchInCategory(item.id)">
            在该类中检索
          </button>
        </div>

        <div class="cat__bar" :title="`占全部分析文章的 ${percent(statOf[item.id]?.count ?? 0)}%`">
          <span class="cat__bar-fill" :style="{ width: percent(statOf[item.id]?.count ?? 0) + '%' }" />
        </div>

        <p v-if="item.description" class="cat__desc">{{ item.description }}</p>

        <div v-if="activeId === item.id" class="cat__panel">
          <p v-if="articlesLoading" class="category__hint">正在加载该类文章…</p>
          <p v-else-if="articlesError" class="category__error" role="alert">{{ articlesError }}</p>
          <template v-else-if="articles.length">
            <ul class="cat__articles">
              <li v-for="article in articles" :key="article.article_id" class="cat__article">
                <button class="cat__article-btn" type="button" @click="openArticle(article.article_id)">
                  <span class="cat__article-title">{{ article.title }}</span>
                  <span class="cat__article-meta">
                    {{ sourceName(article.source) }} · {{ formatDate(article.published_at) }}
                  </span>
                </button>
              </li>
            </ul>
            <button class="cat__more" type="button" @click="searchInCategory(item.id)">
              查看全部 →
            </button>
          </template>
          <p v-else class="category__hint">该类暂时没有文章。</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.category {
  max-width: 760px;
  margin: 0 auto;
  padding-top: 2rem;
}

.category__head h1 {
  margin-bottom: 0.6rem;
  font-size: 1.8rem;
}

.category__desc {
  margin: 0 0 0.4rem;
  color: var(--muted);
  font-size: 1rem;
}

.category__hint {
  color: var(--muted);
  font-size: 0.9rem;
}

.category__error {
  padding: 0.7rem 1rem;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 0.88rem;
}

.category__list {
  list-style: none;
  padding: 0;
  margin: 1.4rem 0 0;
  display: grid;
  gap: 0.9rem;
}

.cat {
  padding: 1rem 1.2rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.cat__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.cat__toggle {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.cat__name {
  font-size: 1.05rem;
  font-weight: 600;
}

.cat__count,
.cat__conf {
  color: var(--muted);
  font-size: 0.82rem;
}

.cat__chevron {
  margin-left: auto;
  color: var(--muted);
  transition: transform 0.16s ease;
}

.cat__chevron--open {
  transform: rotate(180deg);
}

.cat__search {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: #3b82f6;
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
}

.cat__search:hover {
  border-color: #3b82f6;
}

.cat__bar {
  height: 4px;
  margin: 0.7rem 0 0.5rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  overflow: hidden;
}

.cat__bar-fill {
  display: block;
  height: 100%;
  background: #3b82f6;
  opacity: 0.75;
}

.cat__desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.6;
}

.cat__panel {
  margin-top: 0.7rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--border);
}

.cat__articles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.cat__article-btn {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.cat__article-btn:hover {
  background: rgba(59, 130, 246, 0.08);
}

.cat__article-title {
  font-size: 0.92rem;
  line-height: 1.5;
}

.cat__article-meta {
  color: var(--muted);
  font-size: 0.78rem;
}

.cat__more {
  margin-top: 0.5rem;
  padding: 0;
  border: none;
  background: transparent;
  color: #3b82f6;
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
}
</style>
