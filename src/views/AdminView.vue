<script setup lang="ts">
/**
 * 管理控制台（规范模块七）。
 * 四个子模块：
 * 1) 统计看板：采集趋势 / 分类分布 / 任务成功率；
 * 2) 站点管理：增删改查与启停；
 * 3) 账号管理：新增、禁用/启用、角色调整、重置密码；
 * 4) 操作日志：按动作、用户名、日期范围筛选。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { init, use, type ECharts } from 'echarts/core'
import { GaugeChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { categoryName } from '@/constants/categories'
import { HttpError } from '@/api/http'
import {
  createAdminSite,
  createAdminUser,
  deleteAdminSite,
  getAdminStats,
  listAdminSites,
  listAdminUsers,
  listOperationLogs,
  resetAdminPassword,
  updateAdminSite,
  updateAdminUser,
  type AdminSite,
  type AdminSiteInput,
  type AdminStats,
  type AdminUser,
  type OperationLog,
} from '@/api/admin'

use([
  LineChart,
  PieChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])

type TabKey = 'stats' | 'sites' | 'users' | 'logs'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'stats', label: '统计看板' },
  { key: 'sites', label: '站点管理' },
  { key: 'users', label: '账号管理' },
  { key: 'logs', label: '操作日志' },
]
const activeTab = ref<TabKey>('stats')

const loadingByTab = reactive<Record<TabKey, boolean>>({
  stats: false,
  sites: false,
  users: false,
  logs: false,
})
const errorByTab = reactive<Record<TabKey, string>>({ stats: '', sites: '', users: '', logs: '' })
const loading = computed(() => loadingByTab[activeTab.value])
const error = computed(() => errorByTab[activeTab.value])
const message = ref('')
let messageTimer: ReturnType<typeof setTimeout> | null = null
function flash(text: string): void {
  message.value = text
  if (messageTimer !== null) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => {
    message.value = ''
    messageTimer = null
  }, 3000)
}
function describeError(err: unknown): string {
  return err instanceof HttpError ? err.message : err instanceof Error ? err.message : '请求失败'
}
onBeforeUnmount(() => {
  if (messageTimer !== null) clearTimeout(messageTimer)
  disposeCharts()
})

// ── 统计看板 ───────────────────────────────────────────
const stats = ref<AdminStats | null>(null)
const statsDays = ref(7)
const dailyRef = ref<HTMLElement | null>(null)
const categoryRef = ref<HTMLElement | null>(null)
const jobsRef = ref<HTMLElement | null>(null)
let dailyChart: ECharts | null = null
let categoryChart: ECharts | null = null
let jobsChart: ECharts | null = null
/** 统计请求序号：快速切换 7/30 天时旧响应不能覆盖新结果 */
let statsRequestId = 0

function disposeCharts(): void {
  dailyChart?.dispose()
  categoryChart?.dispose()
  jobsChart?.dispose()
  dailyChart = null
  categoryChart = null
  jobsChart = null
}

async function loadStats(): Promise<void> {
  const requestId = ++statsRequestId
  loadingByTab.stats = true
  errorByTab.stats = ''
  try {
    const next = await getAdminStats(statsDays.value)
    if (requestId !== statsRequestId) return
    stats.value = next
    await nextTick()
    if (requestId !== statsRequestId) return
    drawCharts()
  } catch (err) {
    if (requestId === statsRequestId) errorByTab.stats = describeError(err)
  } finally {
    if (requestId === statsRequestId) loadingByTab.stats = false
  }
}

function drawCharts(): void {
  if (!stats.value) return
  disposeCharts()

  if (dailyRef.value) {
    dailyChart = init(dailyRef.value)
    dailyChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 16, top: 24, bottom: 32 },
      xAxis: {
        type: 'category',
        data: stats.value.daily.map((item) => item.day.slice(5)),
        axisLine: { lineStyle: { color: '#D9D9D9' } },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#F0F0F0' } } },
      series: [
        {
          name: '采集量',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: stats.value.daily.map((item) => item.count),
          itemStyle: { color: '#1890FF' },
          areaStyle: { color: 'rgba(24,144,255,0.12)' },
        },
      ],
    })
  }

  if (categoryRef.value) {
    categoryChart = init(categoryRef.value)
    categoryChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      series: [
        {
          name: '分类分布',
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '44%'],
          label: { formatter: '{b}\n{d}%', fontSize: 11 },
          data: stats.value.categories.map((item) => ({
            name: categoryName(item.category),
            value: item.count,
          })),
        },
      ],
    })
  }

  if (jobsRef.value) {
    jobsChart = init(jobsRef.value)
    jobsChart.setOption({
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          progress: { show: true, width: 14, itemStyle: { color: '#52C41A' } },
          axisLine: { lineStyle: { width: 14, color: [[1, '#F0F0F0']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          detail: {
            valueAnimation: true,
            formatter: '{value}%',
            fontSize: 28,
            offsetCenter: [0, '0%'],
            color: '#262626',
          },
          data: [{ value: stats.value.success_rate }],
        },
      ],
    })
  }
}

watch(statsDays, () => void loadStats())

// ── 站点管理 ───────────────────────────────────────────
const sites = ref<AdminSite[]>([])
const siteModalOpen = ref(false)
/** 站点以 name 为主键（由 news-crawler 的 sources.local.json 管理） */
const editingSiteName = ref<string | null>(null)
/** 当前编辑的是接口型源：list_url/XPath 由 api 配置决定，表单不可改也不参与提交 */
const editingSiteHasApi = ref(false)
const emptySiteForm = (): AdminSiteInput => ({
  name: '',
  list_url: '',
  category: '',
  region: '',
  timezone: 'Asia/Shanghai',
  render: false,
  enabled: true,
  item_xpath: '//li',
  title_xpath: './/a',
  url_xpath: './/a/@href',
  date_xpath: '',
})
const siteForm = ref<AdminSiteInput>(emptySiteForm())

let sitesRequestId = 0

async function loadSites(): Promise<void> {
  const requestId = ++sitesRequestId
  loadingByTab.sites = true
  errorByTab.sites = ''
  try {
    const next = await listAdminSites()
    if (requestId === sitesRequestId) sites.value = next
  } catch (err) {
    if (requestId === sitesRequestId) errorByTab.sites = describeError(err)
  } finally {
    if (requestId === sitesRequestId) loadingByTab.sites = false
  }
}

function openSiteCreate(): void {
  editingSiteName.value = null
  editingSiteHasApi.value = false
  siteForm.value = emptySiteForm()
  siteModalOpen.value = true
}

function openSiteEdit(site: AdminSite): void {
  editingSiteName.value = site.name
  editingSiteHasApi.value = site.has_api
  siteForm.value = {
    name: site.name,
    list_url: site.list_url,
    category: site.category,
    region: site.region,
    timezone: site.timezone || 'Asia/Shanghai',
    render: site.render,
    enabled: site.enabled,
    item_xpath: site.item_xpath,
    title_xpath: site.title_xpath,
    url_xpath: site.url_xpath,
    date_xpath: site.date_xpath,
  }
  siteModalOpen.value = true
}

async function submitSite(): Promise<void> {
  const isApiSite = editingSiteName.value !== null && editingSiteHasApi.value
  if (!siteForm.value.name.trim() || (!isApiSite && !siteForm.value.list_url.trim())) {
    errorByTab.sites = isApiSite ? '站点名称不能为空' : '站点名称与列表地址不能为空'
    return
  }
  errorByTab.sites = ''
  try {
    if (editingSiteName.value === null) {
      await createAdminSite(siteForm.value)
      flash('站点已新增')
    } else {
      // name 是主键，更新时不能改名；接口型源的抓取地址与 XPath 由 api 配置维护
      const patch: Partial<AdminSiteInput> = { ...siteForm.value }
      delete patch.name
      if (isApiSite) {
        delete patch.list_url
        delete patch.item_xpath
        delete patch.title_xpath
        delete patch.url_xpath
        delete patch.date_xpath
      }
      await updateAdminSite(editingSiteName.value, patch)
      flash('站点已更新')
    }
    siteModalOpen.value = false
    await loadSites()
  } catch (err) {
    errorByTab.sites = describeError(err)
  }
}

async function removeSite(site: AdminSite): Promise<void> {
  if (!window.confirm(`确定删除站点「${site.name}」吗？删除后不可恢复。`)) return
  errorByTab.sites = ''
  try {
    await deleteAdminSite(site.name)
    flash('站点已删除')
    await loadSites()
  } catch (err) {
    errorByTab.sites = describeError(err)
  }
}

async function toggleSite(site: AdminSite): Promise<void> {
  errorByTab.sites = ''
  try {
    await updateAdminSite(site.name, { enabled: !site.enabled })
    await loadSites()
  } catch (err) {
    errorByTab.sites = describeError(err)
  }
}

// ── 账号管理 ───────────────────────────────────────────
const users = ref<AdminUser[]>([])
const userTotal = ref(0)
const userPage = ref(1)
const USER_PAGE_SIZE = 10
const userPages = computed(() => Math.max(1, Math.ceil(userTotal.value / USER_PAGE_SIZE)))
const userQuery = ref('')
const userRole = ref('')
const userStatus = ref('')
const userModalOpen = ref(false)
const userForm = ref({
  username: '',
  display_name: '',
  department: '',
  role: 'user' as 'admin' | 'user',
  password: '',
})
const tempPassword = ref('')

let usersRequestId = 0

async function loadUsers(): Promise<void> {
  const requestId = ++usersRequestId
  loadingByTab.users = true
  errorByTab.users = ''
  try {
    const result = await listAdminUsers({
      q: userQuery.value,
      role: userRole.value,
      status: userStatus.value,
      limit: USER_PAGE_SIZE,
      offset: (userPage.value - 1) * USER_PAGE_SIZE,
    })
    if (requestId !== usersRequestId) return
    users.value = result.items
    userTotal.value = result.total
    if (!result.items.length && userPage.value > 1) {
      userPage.value = Math.min(userPage.value - 1, userPages.value)
      await loadUsers()
    }
  } catch (err) {
    if (requestId === usersRequestId) errorByTab.users = describeError(err)
  } finally {
    if (requestId === usersRequestId) loadingByTab.users = false
  }
}

function searchUsers(): void {
  userPage.value = 1
  void loadUsers()
}

function goUserPage(page: number): void {
  if (page < 1 || page > userPages.value || page === userPage.value) return
  userPage.value = page
  void loadUsers()
}

function openUserCreate(): void {
  userForm.value = { username: '', display_name: '', department: '', role: 'user', password: '' }
  tempPassword.value = ''
  userModalOpen.value = true
}

async function submitUser(): Promise<void> {
  if (!userForm.value.username.trim()) {
    errorByTab.users = '用户名不能为空'
    return
  }
  errorByTab.users = ''
  try {
    const created = await createAdminUser({
      username: userForm.value.username.trim(),
      display_name: userForm.value.display_name,
      department: userForm.value.department,
      role: userForm.value.role,
      ...(userForm.value.password ? { password: userForm.value.password } : {}),
    })
    tempPassword.value = created.temporary_password ?? ''
    userModalOpen.value = false
    flash(tempPassword.value ? '账号已创建，请把临时密码交给用户' : '账号已创建')
    await loadUsers()
  } catch (err) {
    errorByTab.users = describeError(err)
  }
}

async function patchUser(
  user: AdminUser,
  patch: { role?: 'admin' | 'user'; status?: 'active' | 'disabled' },
): Promise<void> {
  errorByTab.users = ''
  try {
    await updateAdminUser(user.id, patch)
    flash('账号已更新')
    await loadUsers()
  } catch (err) {
    errorByTab.users = describeError(err)
  }
}

async function resetPassword(user: AdminUser): Promise<void> {
  if (!window.confirm(`确定重置「${user.username}」的密码吗？`)) return
  errorByTab.users = ''
  try {
    const temporary = await resetAdminPassword(user.id)
    tempPassword.value = temporary
    flash(`已重置「${user.username}」的密码`)
    await loadUsers()
  } catch (err) {
    errorByTab.users = describeError(err)
  }
}

// ── 操作日志 ───────────────────────────────────────────
const logs = ref<OperationLog[]>([])
const logTotal = ref(0)
const logAction = ref('')
const logUsername = ref('')
const logDateFrom = ref('')
const logDateTo = ref('')
const logPage = ref(1)
const LOG_PAGE_SIZE = 20
const logPages = computed(() => Math.max(1, Math.ceil(logTotal.value / LOG_PAGE_SIZE)))

let logsRequestId = 0

async function loadLogs(): Promise<void> {
  const requestId = ++logsRequestId
  loadingByTab.logs = true
  errorByTab.logs = ''
  try {
    const result = await listOperationLogs({
      action: logAction.value,
      username: logUsername.value,
      date_from: logDateFrom.value,
      date_to: logDateTo.value,
      limit: LOG_PAGE_SIZE,
      offset: (logPage.value - 1) * LOG_PAGE_SIZE,
    })
    if (requestId !== logsRequestId) return
    logs.value = result.items
    logTotal.value = result.total
  } catch (err) {
    if (requestId === logsRequestId) errorByTab.logs = describeError(err)
  } finally {
    if (requestId === logsRequestId) loadingByTab.logs = false
  }
}

function searchLogs(): void {
  logPage.value = 1
  void loadLogs()
}

function resetLogFilters(): void {
  logAction.value = ''
  logUsername.value = ''
  logDateFrom.value = ''
  logDateTo.value = ''
  logPage.value = 1
  void loadLogs()
}

function goLogPage(page: number): void {
  logPage.value = Math.min(logPages.value, Math.max(1, page))
  void loadLogs()
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': '登录',
  'auth.logout': '退出',
  'auth.password_change': '修改密码',
  'favorite.add': '收藏',
  'favorite.remove': '取消收藏',
  'history.clear': '清空历史',
  'preferences.update': '保存偏好',
  'admin.user_create': '新增账号',
  'admin.user_update': '更新账号',
  'admin.user_reset_password': '重置密码',
  'admin.site_create': '新增站点',
  'admin.site_update': '更新站点',
  'admin.site_delete': '删除站点',
}
function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

// ── Tab 调度 ───────────────────────────────────────────
watch(activeTab, async (tab) => {
  errorByTab[tab] = ''
  if (tab === 'stats') await loadStats()
  else if (tab === 'sites') await loadSites()
  else if (tab === 'users') await loadUsers()
  else await loadLogs()
})

onMounted(() => {
  void loadStats()
})
</script>

<template>
  <section class="admin">
    <header class="admin__head">
      <div>
        <h1 class="admin__title">管理控制台</h1>
        <p class="admin__subtitle">站点、账号、统计与操作日志（仅管理员可见）</p>
      </div>
      <span class="badge">管理员</span>
    </header>

    <el-tabs v-model="activeTab" class="tabs" aria-label="管理控制台分区">
      <el-tab-pane v-for="tab in TABS" :key="tab.key" :name="tab.key" :label="tab.label" />
    </el-tabs>

    <el-alert
      v-if="message"
      :title="message"
      type="success"
      show-icon
      :closable="false"
      class="notice"
    />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="notice notice--error"
    />
    <p v-if="loading" class="notice muted">加载中…</p>

    <!-- 统计看板 -->
    <div v-if="activeTab === 'stats'" class="panel">
      <div class="toolbar">
        <span class="muted">统计范围</span>
        <el-select v-model="statsDays" aria-label="统计天数" class="toolbar__select">
          <el-option :value="7" label="最近 7 天" />
          <el-option :value="30" label="最近 30 天" />
          <el-option :value="90" label="最近 90 天" />
        </el-select>
      </div>

      <div v-if="stats" class="stats">
        <el-card
          v-for="item in [
            { label: '公告总量', value: stats.totals.articles },
            { label: '来源站点', value: stats.totals.sources },
            { label: '账号数', value: stats.totals.users },
            { label: '活跃用户', value: stats.totals.active_users },
          ]"
          :key="item.label"
          shadow="never"
          class="stat"
        >
          <span class="stat__label">{{ item.label }}</span>
          <strong class="stat__value num">{{ item.value }}</strong>
        </el-card>
      </div>

      <div class="charts">
        <article class="chart-card">
          <h3 class="chart-card__title">采集趋势</h3>
          <div ref="dailyRef" class="chart" role="img" aria-label="采集趋势折线图" />
        </article>
        <article class="chart-card">
          <h3 class="chart-card__title">分类分布</h3>
          <div ref="categoryRef" class="chart" role="img" aria-label="分类分布饼图" />
        </article>
        <article class="chart-card">
          <h3 class="chart-card__title">分析任务成功率</h3>
          <div ref="jobsRef" class="chart" role="img" aria-label="任务成功率仪表盘" />
          <p v-if="stats" class="chart-card__hint">
            成功 {{ stats.jobs.succeeded ?? 0 }} / 失败 {{ stats.jobs.failed ?? 0 }}
          </p>
        </article>
      </div>
    </div>

    <!-- 站点管理 -->
    <div v-else-if="activeTab === 'sites'" class="panel">
      <div class="toolbar">
        <el-button type="primary" @click="openSiteCreate">新增站点</el-button>
        <span class="muted">共 {{ sites.length }} 个站点</span>
      </div>
      <el-table :data="sites" stripe class="table" empty-text="暂无站点">
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="light">
              {{ row.has_api ? '接口采集' : '列表抓取' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="列表地址" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.has_api ? '由接口配置维护' : row.list_url }}
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="140" />
        <el-table-column prop="region" label="地区" width="100" />
        <el-table-column prop="timezone" label="时区" width="130" />
        <el-table-column label="渲染" width="80">
          <template #default="{ row }">{{ row.render ? '需要' : '否' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openSiteEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="toggleSite(row)">
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
            <el-button link type="danger" @click="removeSite(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 账号管理 -->
    <div v-else-if="activeTab === 'users'" class="panel">
      <div class="toolbar">
        <el-input
          v-model="userQuery"
          class="toolbar__input"
          placeholder="搜索用户名/姓名"
          aria-label="搜索账号"
          clearable
        />
        <el-select v-model="userRole" aria-label="角色筛选" class="toolbar__select">
          <el-option value="" label="全部角色" />
          <el-option value="admin" label="管理员" />
          <el-option value="user" label="普通用户" />
        </el-select>
        <el-select v-model="userStatus" aria-label="状态筛选" class="toolbar__select">
          <el-option value="" label="全部状态" />
          <el-option value="active" label="启用" />
          <el-option value="disabled" label="禁用" />
        </el-select>
        <el-button @click="searchUsers">查询</el-button>
        <el-button type="primary" @click="openUserCreate">新增账号</el-button>
        <span class="muted">共 {{ userTotal }} 个账号</span>
      </div>

      <el-alert v-if="tempPassword" type="success" show-icon :closable="false" class="notice">
        <template #title>
          临时密码：<code class="temp">{{ tempPassword }}</code
          >（仅显示一次，请立即转交用户）
        </template>
      </el-alert>

      <el-table :data="users" stripe class="table" empty-text="暂无账号">
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="display_name" label="姓名" min-width="100" />
        <el-table-column prop="department" label="部门" min-width="120" />
        <el-table-column label="角色" width="140">
          <template #default="{ row }">
            <el-select
              :model-value="row.role"
              size="small"
              :aria-label="`修改 ${row.username} 的角色`"
              @change="(value: 'admin' | 'user') => patchUser(row, { role: value })"
            >
              <el-option value="user" label="普通用户" />
              <el-option value="admin" label="管理员" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_login_at" label="最近登录" min-width="160" />
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="patchUser(row, { status: row.status === 'active' ? 'disabled' : 'active' })"
            >
              {{ row.status === 'active' ? '禁用' : '启用' }}
            </el-button>
            <el-button link type="primary" @click="resetPassword(row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>

      <p class="pager-summary muted">
        第 {{ userPage }} / {{ userPages }} 页 · 共 {{ userTotal }} 个账号
      </p>
      <el-pagination
        class="pager admin-pager admin-pager--users"
        background
        layout="prev, pager, next, total"
        :current-page="userPage"
        :page-size="USER_PAGE_SIZE"
        :total="userTotal"
        @current-change="goUserPage"
      />
    </div>

    <!-- 操作日志 -->
    <div v-else class="panel">
      <div class="toolbar">
        <el-select v-model="logAction" aria-label="动作筛选" class="toolbar__select">
          <el-option value="" label="全部动作" />
          <el-option
            v-for="(label, action) in ACTION_LABELS"
            :key="action"
            :value="action"
            :label="label"
          />
        </el-select>
        <el-input
          v-model="logUsername"
          class="toolbar__input"
          placeholder="用户名"
          aria-label="用户名筛选"
        />
        <el-date-picker
          v-model="logDateFrom"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="开始日期"
          aria-label="开始日期"
        />
        <span class="muted">至</span>
        <el-date-picker
          v-model="logDateTo"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="结束日期"
          aria-label="结束日期"
        />
        <el-button @click="searchLogs">查询</el-button>
        <el-button @click="resetLogFilters">重置</el-button>
      </div>

      <el-table :data="logs" stripe class="table" empty-text="暂无日志">
        <el-table-column prop="created_at" label="时间" min-width="170" />
        <el-table-column prop="username" label="用户" width="120" />
        <el-table-column label="动作" min-width="120">
          <template #default="{ row }">{{ actionLabel(row.action) }}</template>
        </el-table-column>
        <el-table-column prop="target" label="对象" min-width="140" />
        <el-table-column prop="detail" label="详情" min-width="220" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP" width="130" />
      </el-table>

      <p class="pager-summary muted">
        第 {{ logPage }} / {{ logPages }} 页 · 共 {{ logTotal }} 条日志
      </p>
      <el-pagination
        class="pager admin-pager admin-pager--logs"
        background
        layout="prev, pager, next, total"
        :current-page="logPage"
        :page-size="LOG_PAGE_SIZE"
        :total="logTotal"
        @current-change="goLogPage"
      />
    </div>

    <!-- 站点编辑弹窗 -->
    <el-dialog
      v-model="siteModalOpen"
      :title="editingSiteName === null ? '新增站点' : '编辑站点'"
      width="620px"
      destroy-on-close
    >
      <el-form label-position="top" class="form">
        <el-form-item label="名称">
          <el-input v-model="siteForm.name" :disabled="editingSiteName !== null" />
        </el-form-item>
        <el-alert
          v-if="editingSiteHasApi"
          type="info"
          show-icon
          :closable="false"
          title="接口型站点只能修改分类、地区、时区、渲染与启停"
          class="notice"
        />
        <el-form-item label="列表地址">
          <el-input v-model="siteForm.list_url" :disabled="editingSiteHasApi" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="siteForm.category" placeholder="如 project_application" />
        </el-form-item>
        <el-form-item label="地区">
          <el-input v-model="siteForm.region" />
        </el-form-item>
        <el-form-item label="时区">
          <el-input v-model="siteForm.timezone" />
        </el-form-item>
        <el-form-item label="列表项 XPath">
          <el-input v-model="siteForm.item_xpath" :disabled="editingSiteHasApi" />
        </el-form-item>
        <el-form-item label="标题 XPath">
          <el-input v-model="siteForm.title_xpath" :disabled="editingSiteHasApi" />
        </el-form-item>
        <el-form-item label="链接 XPath">
          <el-input v-model="siteForm.url_xpath" :disabled="editingSiteHasApi" />
        </el-form-item>
        <el-form-item label="日期 XPath（可选）">
          <el-input v-model="siteForm.date_xpath" :disabled="editingSiteHasApi" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="siteForm.render">列表页需要浏览器渲染</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="siteForm.enabled">启用</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="siteModalOpen = false">取消</el-button>
        <el-button type="primary" @click="submitSite">保存</el-button>
      </template>
    </el-dialog>

    <!-- 账号新增弹窗 -->
    <el-dialog v-model="userModalOpen" title="新增账号" width="460px" destroy-on-close>
      <el-form label-position="top" class="form">
        <el-form-item label="用户名">
          <el-input v-model="userForm.username" autocomplete="off" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="userForm.display_name" />
        </el-form-item>
        <el-form-item label="部门">
          <el-input v-model="userForm.department" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userForm.role">
            <el-option value="user" label="普通用户" />
            <el-option value="admin" label="管理员" />
          </el-select>
        </el-form-item>
        <el-form-item label="初始密码（留空则自动生成）">
          <el-input
            v-model="userForm.password"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userModalOpen = false">关闭</el-button>
        <el-button type="primary" @click="submitUser">创建</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.admin {
  max-width: var(--layout-max-width);
  margin: 0 auto;
}

.admin__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.admin__title {
  margin: 0;
  font-size: var(--font-size-h2);
}

.admin__subtitle {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.badge {
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}

.tabs {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-split);
  margin-bottom: var(--space-4);
}

.tabs__item {
  padding: var(--space-2) var(--space-4);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: var(--font-size-body);
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out);
}

.tabs__item:hover {
  color: var(--color-primary-hover);
}

.tabs__item--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.panel {
  display: grid;
  gap: var(--space-3);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.notice {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-base);
  background: var(--color-bg-layout);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.notice--success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.notice--error {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
}

.stat {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.stat__label {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.stat__value {
  font-size: var(--font-size-h2);
  color: var(--color-primary);
}

.charts {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: var(--space-3);
}

.chart-card {
  padding: var(--space-3);
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.chart-card__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-body);
}

.chart-card__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: center;
}

.chart {
  width: 100%;
  height: 240px;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-split);
  border-radius: var(--radius-card);
  background: var(--color-bg);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.table th,
.table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-split);
  text-align: left;
  white-space: nowrap;
}

.table th {
  color: var(--color-text-secondary);
  background: var(--color-bg-layout);
  font-weight: var(--font-weight-medium);
}

.table tr:last-child td {
  border-bottom: none;
}

.ellipsis {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actions {
  display: flex;
  gap: var(--space-1);
}

.empty {
  color: var(--color-text-muted);
  text-align: center !important;
  padding: var(--space-6) !important;
}

.state {
  padding: 1px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
}

.state--on {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.state--off {
  background: var(--color-bg-layout);
  color: var(--color-text-muted);
}

.input {
  height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm);
  outline: none;
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgb(24, 144, 255, 0.2);
}

.input--sm {
  height: 26px;
  padding: 0 var(--space-1);
  font-size: var(--font-size-xs);
}

.btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition:
    color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),
    background var(--duration-base) var(--ease-out);
}

.btn:hover:not(:disabled) {
  color: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.btn:disabled {
  color: var(--color-text-disabled);
  border-color: var(--color-split);
  cursor: not-allowed;
}

.btn--primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  color: var(--color-text-inverse);
}

.btn--text {
  border-color: transparent;
  color: var(--color-primary);
  padding: 0 var(--space-1);
}

.btn--danger-text {
  color: var(--color-error);
}

.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.temp {
  padding: 1px var(--space-1);
  border-radius: var(--radius-base);
  background: var(--color-bg);
  font-size: var(--font-size-body);
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgb(0, 0, 0, 0.35);
}

.modal__card {
  width: min(440px, 92vw);
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
  border-radius: var(--radius-modal);
  background: var(--color-bg);
  box-shadow: var(--shadow-modal);
}

.modal__title {
  margin: 0;
  font-size: var(--font-size-h3);
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.field {
  display: grid;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

@media (max-width: 1100px) {
  .charts {
    grid-template-columns: 1fr;
  }

  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .admin {
    padding: var(--space-3);
  }

  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .charts {
    grid-template-columns: 1fr;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar :deep(.el-input),
  .toolbar :deep(.el-select),
  .toolbar :deep(.el-date-editor) {
    width: 100% !important;
  }

  .admin :deep(.el-tabs__item) {
    padding: 0 10px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .admin {
    padding: var(--space-2);
  }

  .stats {
    grid-template-columns: 1fr;
  }

  .admin :deep(.el-tabs__item) {
    padding: 0 8px;
    font-size: 12px;
  }
}
</style>
