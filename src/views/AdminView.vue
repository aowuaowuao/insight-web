<script setup lang="ts">
/**
 * 管理控制台（规范模块七）。
 * 四个子模块：
 * 1) 统计看板：采集趋势 / 分类分布 / 任务成功率；
 * 2) 站点管理：增删改查与启停；
 * 3) 账号管理：新增、禁用/启用、角色调整、重置密码；
 * 4) 操作日志：按动作、用户名、日期范围筛选。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const loading = ref(false)
const message = ref('')
const error = ref('')
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

function disposeCharts(): void {
  dailyChart?.dispose()
  categoryChart?.dispose()
  jobsChart?.dispose()
  dailyChart = null
  categoryChart = null
  jobsChart = null
}

async function loadStats(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    stats.value = await getAdminStats(statsDays.value)
    await nextTick()
    drawCharts()
  } catch (err) {
    error.value = describeError(err)
  } finally {
    loading.value = false
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
const editingSiteId = ref<number | null>(null)
const siteForm = ref<AdminSiteInput>({
  name: '',
  list_url: '',
  category: '',
  region: '',
  timezone: 'Asia/Shanghai',
  enabled: true,
})

async function loadSites(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    sites.value = await listAdminSites()
  } catch (err) {
    error.value = describeError(err)
  } finally {
    loading.value = false
  }
}

function openSiteCreate(): void {
  editingSiteId.value = null
  siteForm.value = {
    name: '',
    list_url: '',
    category: '',
    region: '',
    timezone: 'Asia/Shanghai',
    enabled: true,
  }
  siteModalOpen.value = true
}

function openSiteEdit(site: AdminSite): void {
  editingSiteId.value = site.id
  siteForm.value = {
    name: site.name,
    list_url: site.list_url,
    category: site.category,
    region: site.region,
    timezone: site.timezone || 'Asia/Shanghai',
    enabled: site.enabled,
  }
  siteModalOpen.value = true
}

async function submitSite(): Promise<void> {
  if (!siteForm.value.name.trim() || !siteForm.value.list_url.trim()) {
    error.value = '站点名称与列表地址不能为空'
    return
  }
  try {
    if (editingSiteId.value === null) {
      await createAdminSite(siteForm.value)
      flash('站点已新增')
    } else {
      await updateAdminSite(editingSiteId.value, siteForm.value)
      flash('站点已更新')
    }
    siteModalOpen.value = false
    await loadSites()
  } catch (err) {
    error.value = describeError(err)
  }
}

async function removeSite(site: AdminSite): Promise<void> {
  if (!window.confirm(`确定删除站点「${site.name}」吗？删除后不可恢复。`)) return
  try {
    await deleteAdminSite(site.id)
    flash('站点已删除')
    await loadSites()
  } catch (err) {
    error.value = describeError(err)
  }
}

async function toggleSite(site: AdminSite): Promise<void> {
  try {
    await updateAdminSite(site.id, { enabled: !site.enabled })
    await loadSites()
  } catch (err) {
    error.value = describeError(err)
  }
}

// ── 账号管理 ───────────────────────────────────────────
const users = ref<AdminUser[]>([])
const userTotal = ref(0)
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

async function loadUsers(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await listAdminUsers({
      q: userQuery.value,
      role: userRole.value,
      status: userStatus.value,
      limit: 100,
    })
    users.value = result.items
    userTotal.value = result.total
  } catch (err) {
    error.value = describeError(err)
  } finally {
    loading.value = false
  }
}

function openUserCreate(): void {
  userForm.value = { username: '', display_name: '', department: '', role: 'user', password: '' }
  tempPassword.value = ''
  userModalOpen.value = true
}

async function submitUser(): Promise<void> {
  if (!userForm.value.username.trim()) {
    error.value = '用户名不能为空'
    return
  }
  try {
    const created = await createAdminUser({
      username: userForm.value.username.trim(),
      display_name: userForm.value.display_name,
      department: userForm.value.department,
      role: userForm.value.role,
      ...(userForm.value.password ? { password: userForm.value.password } : {}),
    })
    tempPassword.value = created.temporary_password ?? ''
    flash(tempPassword.value ? '账号已创建，请把临时密码交给用户' : '账号已创建')
    await loadUsers()
  } catch (err) {
    error.value = describeError(err)
  }
}

async function patchUser(
  user: AdminUser,
  patch: { role?: 'admin' | 'user'; status?: 'active' | 'disabled' },
): Promise<void> {
  try {
    await updateAdminUser(user.id, patch)
    flash('账号已更新')
    await loadUsers()
  } catch (err) {
    error.value = describeError(err)
  }
}

async function resetPassword(user: AdminUser): Promise<void> {
  if (!window.confirm(`确定重置「${user.username}」的密码吗？`)) return
  try {
    const temporary = await resetAdminPassword(user.id)
    tempPassword.value = temporary
    flash(`已重置「${user.username}」的密码`)
  } catch (err) {
    error.value = describeError(err)
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

async function loadLogs(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await listOperationLogs({
      action: logAction.value,
      username: logUsername.value,
      date_from: logDateFrom.value,
      date_to: logDateTo.value,
      limit: LOG_PAGE_SIZE,
      offset: (logPage.value - 1) * LOG_PAGE_SIZE,
    })
    logs.value = result.items
    logTotal.value = result.total
  } catch (err) {
    error.value = describeError(err)
  } finally {
    loading.value = false
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
  error.value = ''
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

    <div class="tabs" role="tablist" aria-label="管理控制台分区">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="tabs__item"
        :class="{ 'tabs__item--active': activeTab === tab.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <p v-if="message" class="notice notice--success" role="status">{{ message }}</p>
    <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
    <p v-if="loading" class="notice">加载中…</p>

    <!-- 统计看板 -->
    <div v-if="activeTab === 'stats'" class="panel">
      <div class="toolbar">
        <span class="muted">统计范围</span>
        <select v-model.number="statsDays" class="input" aria-label="统计天数">
          <option :value="7">最近 7 天</option>
          <option :value="30">最近 30 天</option>
          <option :value="90">最近 90 天</option>
        </select>
      </div>

      <div v-if="stats" class="stats">
        <div class="stat">
          <span class="stat__label">公告总量</span>
          <strong class="stat__value num">{{ stats.totals.articles }}</strong>
        </div>
        <div class="stat">
          <span class="stat__label">来源站点</span>
          <strong class="stat__value num">{{ stats.totals.sources }}</strong>
        </div>
        <div class="stat">
          <span class="stat__label">账号数</span>
          <strong class="stat__value num">{{ stats.totals.users }}</strong>
        </div>
        <div class="stat">
          <span class="stat__label">活跃用户</span>
          <strong class="stat__value num">{{ stats.totals.active_users }}</strong>
        </div>
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
        <button class="btn btn--primary" type="button" @click="openSiteCreate">新增站点</button>
        <span class="muted">共 {{ sites.length }} 个站点</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>列表地址</th>
              <th>分类</th>
              <th>地区</th>
              <th>时区</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="site in sites" :key="site.id">
              <td>{{ site.name }}</td>
              <td class="ellipsis" :title="site.list_url">{{ site.list_url }}</td>
              <td>{{ site.category || '—' }}</td>
              <td>{{ site.region || '—' }}</td>
              <td>{{ site.timezone }}</td>
              <td>
                <span class="state" :class="site.enabled ? 'state--on' : 'state--off'">{{
                  site.enabled ? '启用' : '停用'
                }}</span>
              </td>
              <td class="actions">
                <button class="btn btn--text" type="button" @click="openSiteEdit(site)">
                  编辑
                </button>
                <button class="btn btn--text" type="button" @click="toggleSite(site)">
                  {{ site.enabled ? '停用' : '启用' }}
                </button>
                <button
                  class="btn btn--text btn--danger-text"
                  type="button"
                  @click="removeSite(site)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="!sites.length">
              <td colspan="7" class="empty">暂无站点</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 账号管理 -->
    <div v-else-if="activeTab === 'users'" class="panel">
      <div class="toolbar">
        <input
          v-model="userQuery"
          class="input"
          placeholder="搜索用户名/姓名"
          aria-label="搜索账号"
        />
        <select v-model="userRole" class="input" aria-label="角色筛选">
          <option value="">全部角色</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
        <select v-model="userStatus" class="input" aria-label="状态筛选">
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="disabled">禁用</option>
        </select>
        <button class="btn" type="button" @click="loadUsers">查询</button>
        <button class="btn btn--primary" type="button" @click="openUserCreate">新增账号</button>
        <span class="muted">共 {{ userTotal }} 个账号</span>
      </div>

      <p v-if="tempPassword" class="notice notice--success" role="status">
        临时密码：<code class="temp">{{ tempPassword }}</code
        >（仅显示一次，请立即转交用户）
      </p>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>姓名</th>
              <th>部门</th>
              <th>角色</th>
              <th>状态</th>
              <th>最近登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.username }}</td>
              <td>{{ user.display_name || '—' }}</td>
              <td>{{ user.department || '—' }}</td>
              <td>
                <select
                  class="input input--sm"
                  :value="user.role"
                  :aria-label="`修改 ${user.username} 的角色`"
                  @change="
                    patchUser(user, {
                      role: ($event.target as HTMLSelectElement).value as 'admin' | 'user',
                    })
                  "
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </td>
              <td>
                <span
                  class="state"
                  :class="user.status === 'active' ? 'state--on' : 'state--off'"
                  >{{ user.status === 'active' ? '启用' : '禁用' }}</span
                >
              </td>
              <td>{{ user.last_login_at || '—' }}</td>
              <td class="actions">
                <button
                  class="btn btn--text"
                  type="button"
                  @click="
                    patchUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })
                  "
                >
                  {{ user.status === 'active' ? '禁用' : '启用' }}
                </button>
                <button class="btn btn--text" type="button" @click="resetPassword(user)">
                  重置密码
                </button>
              </td>
            </tr>
            <tr v-if="!users.length">
              <td colspan="7" class="empty">暂无账号</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 操作日志 -->
    <div v-else class="panel">
      <div class="toolbar">
        <select v-model="logAction" class="input" aria-label="动作筛选">
          <option value="">全部动作</option>
          <option v-for="(label, action) in ACTION_LABELS" :key="action" :value="action">
            {{ label }}
          </option>
        </select>
        <input v-model="logUsername" class="input" placeholder="用户名" aria-label="用户名筛选" />
        <input v-model="logDateFrom" class="input" type="date" aria-label="开始日期" />
        <span class="muted">至</span>
        <input v-model="logDateTo" class="input" type="date" aria-label="结束日期" />
        <button class="btn" type="button" @click="searchLogs">查询</button>
        <button class="btn" type="button" @click="resetLogFilters">重置</button>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>动作</th>
              <th>对象</th>
              <th>详情</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td>{{ log.created_at }}</td>
              <td>{{ log.username || '—' }}</td>
              <td>{{ actionLabel(log.action) }}</td>
              <td>{{ log.target || '—' }}</td>
              <td class="ellipsis" :title="log.detail">{{ log.detail || '—' }}</td>
              <td>{{ log.ip || '—' }}</td>
            </tr>
            <tr v-if="!logs.length">
              <td colspan="6" class="empty">暂无日志</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <button class="btn" type="button" :disabled="logPage <= 1" @click="goLogPage(logPage - 1)">
          上一页
        </button>
        <span class="muted">第 {{ logPage }} / {{ logPages }} 页 · 共 {{ logTotal }} 条</span>
        <button
          class="btn"
          type="button"
          :disabled="logPage >= logPages"
          @click="goLogPage(logPage + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 站点编辑弹窗 -->
    <div v-if="siteModalOpen" class="modal" role="dialog" aria-modal="true" aria-label="站点编辑">
      <div class="modal__card">
        <h2 class="modal__title">{{ editingSiteId === null ? '新增站点' : '编辑站点' }}</h2>
        <label class="field"
          ><span>名称</span><input v-model="siteForm.name" class="input"
        /></label>
        <label class="field"
          ><span>列表地址</span><input v-model="siteForm.list_url" class="input"
        /></label>
        <label class="field"
          ><span>分类</span
          ><input v-model="siteForm.category" class="input" placeholder="如 project_application"
        /></label>
        <label class="field"
          ><span>地区</span><input v-model="siteForm.region" class="input"
        /></label>
        <label class="field"
          ><span>时区</span><input v-model="siteForm.timezone" class="input"
        /></label>
        <label class="check"
          ><input v-model="siteForm.enabled" type="checkbox" /><span>启用</span></label
        >
        <div class="modal__actions">
          <button class="btn" type="button" @click="siteModalOpen = false">取消</button>
          <button class="btn btn--primary" type="button" @click="submitSite">保存</button>
        </div>
      </div>
    </div>

    <!-- 账号新增弹窗 -->
    <div v-if="userModalOpen" class="modal" role="dialog" aria-modal="true" aria-label="新增账号">
      <div class="modal__card">
        <h2 class="modal__title">新增账号</h2>
        <label class="field"
          ><span>用户名</span><input v-model="userForm.username" class="input" autocomplete="off"
        /></label>
        <label class="field"
          ><span>姓名</span><input v-model="userForm.display_name" class="input"
        /></label>
        <label class="field"
          ><span>部门</span><input v-model="userForm.department" class="input"
        /></label>
        <label class="field">
          <span>角色</span>
          <select v-model="userForm.role" class="input">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <label class="field">
          <span>初始密码（留空则自动生成）</span>
          <input
            v-model="userForm.password"
            class="input"
            type="password"
            autocomplete="new-password"
          />
        </label>
        <div class="modal__actions">
          <button class="btn" type="button" @click="userModalOpen = false">关闭</button>
          <button class="btn btn--primary" type="button" @click="submitUser">创建</button>
        </div>
      </div>
    </div>
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
</style>
