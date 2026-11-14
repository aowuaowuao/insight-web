<script setup lang="ts">
/**
 * 首页。
 * 对照规范 2.2.1（二）模块二：
 * （1）顶部导航：Logo / 当前时间 / 头像下拉 —— 见 components/AppNav.vue
 * （2）3 个数据概览卡片：今日新增公告数、本周高相关度公告、待办申报事项，每 5 分钟自动刷新
 * （3）快捷入口：分类浏览、关键词检索、申报清单生成、个人中心
 * （4）Top10 个性化推荐：登录按关注领域/收藏/浏览记录画像，匿名按内容质量与新鲜度
 * （5）消息通知铃铛 —— 见 components/AppNav.vue
 * （6）侧边栏折叠/展开 —— 见 components/AppNav.vue
 * （7）全局搜索框 —— 见 components/AppNav.vue
 *
 * 数据来源说明：后台没有全库时间范围统计接口，"今日新增"与"高置信度"仍取最新
 * 100 篇在本地统计（卡片 hint 已注明口径）；待办与推荐分别来自 GET /v1/todos
 * 和 GET /v1/recommendations，由后端按截止时间与画像/内容质量排序。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { categoryStats, listCategories } from '@/api/category'
import { listArticles, type ArticleListItem } from '@/api/articles'
import {
  listRecommendations,
  listTodos,
  type RecommendationItem,
  type TodoItem,
} from '@/api/dashboard'
import { categoryName } from '@/constants/categories'
import EmptyState from '@/components/EmptyState.vue'
import ScoreBadge from '@/components/ScoreBadge.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { formatRelativeTime, scoreLevel, scoreToPercent } from '@/utils/format'

const router = useRouter()

const loading = ref(true)
const error = ref('')

/** Top10 推荐（后端按画像/内容质量打分后排序） */
const recommendations = ref<RecommendationItem[]>([])
/** 推荐是否为登录用户个性化结果 */
const personalized = ref(false)
/** 首页待办：尚未到期的项目申报截止项 */
const todos = ref<TodoItem[]>([])
/** 概览卡片用的原始数据 */
const latest = ref<ArticleListItem[]>([])
const totalArticles = ref(0)
const categoryCounts = ref<{ id: string; name: string; count: number }[]>([])

/** 最近一次刷新时间，页面上展示，让人知道数据新不新 */
const refreshedAt = ref('')

/** 每 5 分钟自动刷新（规范模块二（2）） */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function load(): Promise<void> {
  loading.value = latest.value.length === 0
  error.value = ''
  try {
    // 最新 100 条用于概览卡片；推荐与待办由后端专门打分/解析（limit 上限 200）
    const [page, stats, categories, rec, todo] = await Promise.all([
      listArticles({ limit: 100, offset: 0 }),
      categoryStats(),
      listCategories(),
      listRecommendations(10),
      listTodos(5),
    ])

    latest.value = page.items
    totalArticles.value = page.total
    recommendations.value = rec.items
    personalized.value = rec.personalized
    todos.value = todo

    const nameById = new Map(categories.map((item) => [item.id, item.name]))
    categoryCounts.value = stats
      .map((item) => ({
        id: item.category,
        name: nameById.get(item.category) ?? categoryName(item.category),
        count: item.count,
      }))
      .sort((a, b) => b.count - a.count)

    refreshedAt.value = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载首页数据失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  refreshTimer = setInterval(() => void load(), REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})

// ── 概览卡片 ───────────────────────────────────────────
const todayCount = computed(() => {
  // published_at 是站点本地墙钟，比较基准也必须是本地日期：
  // toISOString() 取的是 UTC，东八区 00:00–08:00 会算成前一天，卡片恒为 0。
  const now = new Date()
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  return latest.value.filter((item) => (item.published_at ?? '').slice(0, 10) === today).length
})

const highConfidenceCount = computed(
  () =>
    latest.value.filter((item) => {
      const percent = scoreToPercent(item.category_confidence ?? null)
      return percent !== null && scoreLevel(percent) === 'high'
    }).length,
)

/** 待办申报事项：项目申报类里已提取到截止时间、且截止时间在未来的条数 */
const pendingCount = computed(() => todos.value.length)

const cards = computed(() => [
  {
    key: 'today',
    label: '今日新增公告',
    value: todayCount.value,
    unit: '篇',
    hint: '按最新 100 篇的发布时间统计',
    to: { name: 'category' },
  },
  {
    key: 'high',
    label: '高置信度分类公告',
    value: highConfidenceCount.value,
    unit: '篇',
    hint: '分类置信度 ≥80 分（最新 100 篇内）',
    to: { name: 'category' },
  },
  {
    key: 'pending',
    label: '待办申报事项',
    value: pendingCount.value,
    unit: '项',
    hint: '项目申报公告中尚未到期的截止时间（Top5）',
    to: { name: 'category', query: { category: 'project_application' } },
  },
])

const quickLinks = [
  { label: '分类浏览', desc: '按 6 大类查看全部公告', to: { name: 'category' }, icon: '📁' },
  { label: '关键词检索', desc: '输入关键词按相关度排序', to: { name: 'search' }, icon: '🔍' },
  {
    label: '申报清单生成',
    desc: '查看项目申报公告并生成准备清单',
    to: { name: 'category', query: { category: 'project_application' } },
    icon: '📋',
  },
  { label: '个人中心', desc: '收藏、历史与个性化设置', to: { name: 'profile' }, icon: '👤' },
]

function openArticle(id: string): void {
  router.push({ name: 'article', params: { id } })
}
</script>

<template>
  <section class="home">
    <header class="home__head">
      <div>
        <h1 class="home__title">首页</h1>
        <p class="home__subtitle">
          政策情报与项目申报信息总览
          <template v-if="refreshedAt">
            ·<span class="home__refresh">数据更新于 {{ refreshedAt }}，每 5 分钟自动刷新</span>
          </template>
        </p>
      </div>
    </header>

    <p v-if="error" class="home__error" role="alert">{{ error }}</p>

    <!-- 数据概览卡片（规范模块二（2）） -->
    <ul class="cards">
      <li v-for="card in cards" :key="card.key" class="cards__item">
        <RouterLink :to="card.to" class="cards__link">
          <span class="cards__label">{{ card.label }}</span>
          <span class="cards__value num">
            {{ card.value === null ? '—' : card.value }}
            <small class="cards__unit">{{ card.unit }}</small>
          </span>
          <span class="cards__hint">{{ card.hint }}</span>
        </RouterLink>
      </li>
    </ul>

    <!-- 待办明细：解释第三张统计卡的数字来自哪里 -->
    <section v-if="todos.length" class="todo">
      <h2 class="todo__title">近期申报截止</h2>
      <ul class="todo__list">
        <li v-for="item in todos" :key="item.article_id" class="todo__item">
          <RouterLink :to="{ name: 'article', params: { id: item.article_id } }" class="todo__link">
            <span class="todo__name">{{ item.title }}</span>
            <span class="todo__meta">
              <span class="todo__date num">{{ item.deadline }}</span>
              <span class="todo__days" :class="{ 'todo__days--soon': item.days_left <= 3 }">
                {{ item.days_left === 0 ? '今天截止' : `剩 ${item.days_left} 天` }}
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- 快捷入口（规范模块二（3）） -->
    <ul class="quick">
      <li v-for="link in quickLinks" :key="link.label" class="quick__item">
        <RouterLink :to="link.to" class="quick__link">
          <span class="quick__icon" aria-hidden="true">{{ link.icon }}</span>
          <span class="quick__text">
            <span class="quick__label">{{ link.label }}</span>
            <span class="quick__desc">{{ link.desc }}</span>
          </span>
        </RouterLink>
      </li>
    </ul>

    <!-- Top10 推荐（规范模块二（4）） -->
    <section class="rec">
      <header class="rec__head">
        <h2 class="rec__title">个性化推荐 · Top10</h2>
        <p class="rec__hint">
          {{ personalized ? '按你的关注领域、收藏与浏览记录排序' : '按内容质量与新鲜度排序' }}
          <template v-if="recommendations.length">（共 {{ recommendations.length }} 条）</template>
        </p>
      </header>

      <SkeletonList v-if="loading" :rows="5" />

      <ul v-else-if="recommendations.length" class="rec__list">
        <li v-for="item in recommendations" :key="item.article_id" class="rec__item">
          <button class="rec__link" type="button" @click="openArticle(item.article_id)">
            <span class="rec__tag">{{ categoryName(item.category ?? '') }}</span>
            <span class="rec__item-title">{{ item.title }}</span>
            <span class="rec__meta">
              <span class="rec__time">{{ formatRelativeTime(item.published_at) }}</span>
              <ScoreBadge :score="item.relevance" label="相关度" />
            </span>
          </button>
        </li>
      </ul>

      <EmptyState
        v-else
        variant="no-data"
        title="暂无推荐内容"
        description="等后端分析完文章后，这里会按内容质量与个性化偏好展示 Top10。"
      />
    </section>

    <!-- 分类分布（辅助信息，不是规范要求，但首页没有数据分布会显得空 -->
    <section v-if="categoryCounts.length" class="dist">
      <h2 class="dist__title">公告分类分布</h2>
      <ul class="dist__list">
        <li v-for="item in categoryCounts" :key="item.id" class="dist__item">
          <RouterLink :to="{ name: 'search', query: { category: item.id } }" class="dist__link">
            <span class="dist__name">{{ item.name }}</span>
            <span class="dist__bar">
              <span
                class="dist__fill"
                :style="{ width: totalArticles ? (item.count / totalArticles) * 100 + '%' : '0%' }"
              />
            </span>
            <span class="dist__count num">{{ item.count }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.home {
  max-width: var(--layout-max-width);
  margin: 0 auto;
  display: grid;
  gap: var(--space-6);
}

.home__title {
  margin: 0;
  font-size: var(--font-size-h2);
}

.home__subtitle {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.home__refresh {
  color: var(--color-text-disabled);
}

.home__error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-base);
  background: var(--color-error-bg);
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

/* ── 概览卡片 ───────────────────────────────────────── */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cards__link {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  color: inherit;
  text-decoration: none;
  transition:
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.cards__link:hover {
  border-color: var(--color-primary-hover);
  box-shadow: var(--shadow-card-hover);
}

.cards__link:active {
  border-color: var(--color-primary-active);
}

.cards__label {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.cards__value {
  color: var(--color-primary);
  font-size: 28px;
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}

.cards__unit {
  margin-left: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
}

.cards__hint {
  color: var(--color-text-disabled);
  font-size: var(--font-size-xs);
}

/* ── 待办明细 ───────────────────────────────────────── */
.todo {
  display: grid;
  gap: var(--space-2);
}

.todo__title {
  margin: 0;
  font-size: var(--font-size-h3);
}

.todo__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.todo__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--duration-base) var(--ease-out);
}

.todo__link:hover {
  border-color: var(--color-primary-hover);
}

.todo__name {
  overflow: hidden;
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo__meta {
  display: flex;
  flex-shrink: 0;
  gap: var(--space-2);
  align-items: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.todo__days {
  color: var(--color-success);
}

.todo__days--soon {
  color: var(--color-warning);
}

/* ── 快捷入口 ───────────────────────────────────────── */
.quick {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.quick__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  color: inherit;
  text-decoration: none;
  transition:
    border-color var(--duration-base) var(--ease-out),
    background var(--duration-base) var(--ease-out);
}

.quick__link:hover {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-bg);
}

.quick__link:active {
  border-color: var(--color-primary-active);
  background: var(--color-primary-bg-hover);
}

.quick__icon {
  font-size: 20px;
  line-height: 1;
}

.quick__text {
  display: grid;
  gap: 2px;
}

.quick__label {
  color: var(--color-text);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-medium);
}

.quick__desc {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

/* ── 推荐列表 ───────────────────────────────────────── */
.rec {
  display: grid;
  gap: var(--space-3);
}

.rec__head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.rec__title {
  margin: 0;
  font-size: var(--font-size-h3);
}

.rec__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.rec__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rec__link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  color: inherit;
  font-family: inherit;
  font-size: var(--font-size-body);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.rec__link:hover {
  border-color: var(--color-primary-hover);
  box-shadow: var(--shadow-card);
}

.rec__link:active {
  border-color: var(--color-primary-active);
}

.rec__tag {
  flex-shrink: 0;
  padding: 1px var(--space-2);
  border-radius: var(--radius-tag);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}

.rec__item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.rec__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.rec__time {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

/* ── 分类分布 ───────────────────────────────────────── */
.dist {
  display: grid;
  gap: var(--space-3);
}

.dist__title {
  margin: 0;
  font-size: var(--font-size-h3);
}

.dist__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.dist__link {
  display: grid;
  grid-template-columns: 96px 1fr 56px;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-base);
  color: inherit;
  text-decoration: none;
  transition: background var(--duration-base) var(--ease-out);
}

.dist__link:hover {
  background: var(--color-bg-hover);
}

.dist__name {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.dist__bar {
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-split);
  overflow: hidden;
}

.dist__fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  transition: width var(--duration-base) var(--ease-out);
}

.dist__count {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: right;
}
</style>
