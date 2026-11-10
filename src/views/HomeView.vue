<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SideNav from '@/components/SideNav.vue'
import AircraftCard from '@/components/AircraftCard.vue'
import AddAircraftDialog from '@/components/AddAircraftDialog.vue'
import ConfigManagement from '@/views/ConfigManagement.vue'
import DocumentView from '@/views/DocumentView.vue'
import MonitorView from '@/views/MonitorView.vue'
import InterfaceManagement from '@/views/InterfaceManagement.vue'
import ExternalPlatformManagement from '@/views/ExternalPlatformManagement.vue'
import ModelManagement from '@/views/ModelManagement.vue'
import FleetLifeOverview from '@/components/FleetLifeOverview.vue'
import { useAircraftStore } from '@/stores/aircraft'
import { baseModelCode } from '@/utils/aircraft-source'
import { Expand, Fold, HomeFilled, Plus, Search } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const aircraftStore = useAircraftStore()
const activeMenu = ref('aircraft')
const sidebarCollapsed = ref(
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches,
)
const dialogVisible = ref(false)
const searchQuery = ref('')
const selectedModel = ref('')
const aircraftViewTab = ref<'fleet' | 'life'>('fleet')

const pageMeta: Record<string, { section: string; title: string; description: string }> = {
  aircraft: {
    section: 'FLEET OPERATIONS',
    title: '飞行器管理',
    description: '统一查看飞行器资产、所属机型与数据接入来源。',
  },
  model: {
    section: 'ASSET CATALOG',
    title: '机型管理',
    description: '维护本地机型目录并汇总外部平台机型。',
  },
  knowledge: {
    section: 'KNOWLEDGE OPERATIONS',
    title: '知识库管理',
    description: '管理资料摄入、检索验证与知识问答。',
  },
  config: {
    section: 'CONFIGURATION',
    title: '构型管理',
    description: '查看飞行器构型层级与设备组成关系。',
  },
  monitor: {
    section: 'DATA DISPLAY',
    title: '数据展示',
    description: '组织遥测数据图表并配置监控画布。',
  },
  algo: {
    section: 'ALGORITHM OPERATIONS',
    title: '算法管理',
    description: '管理算法模板、运行实例与执行结果。',
  },
  interface: {
    section: 'INTEGRATION',
    title: '接口管理',
    description: '配置接口转发规则并验证路径匹配。',
  },
  external: {
    section: 'EXTERNAL PLATFORMS',
    title: '外来平台配置',
    description: '维护外部数据平台连接与可用性。',
  },
}

const currentPage = computed(() => pageMeta[activeMenu.value] ?? pageMeta.aircraft)

// 算法管理为独立路由（/algo/...），进入时高亮对应菜单
watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/algo')) activeMenu.value = 'algo'
  },
  { immediate: true },
)

// 点击侧边栏菜单时同步 URL：
// - 点击"算法管理"→ 跳转到算法文件页
// - 在算法页点击其他菜单 → 回到首页
watch(activeMenu, (menu) => {
  const onAlgo = route.path.startsWith('/algo')
  if (menu === 'algo' && !onAlgo) {
    router.push('/algo/files')
  } else if (menu !== 'algo' && onAlgo) {
    router.push('/')
  }
})

// 单机与机型均走本地聚合接口：GET /aircraft/plane、GET /aircraft/models

/**
 * 重拉单机列表。
 *
 * ⚠️ 机型现在是**必填**（后端按机型路由到唯一平台，不传会 400）。
 * - 选了机型：只查该机型；
 * - 未选机型：遍历全部机型各拉一遍、汇总显示（不再有「一次拿全部单机」的接口）。
 *
 * 筛选值取自 GET /aircraft/models，三方为 `K4-WS19:1` 这类合成码，
 * 传给 /aircraft/plane 前须截断为冒号前的基础编码，否则返回空列表。
 */
function reload() {
  if (!selectedModel.value) {
    return aircraftStore.fetchAllAircrafts()
  }
  return aircraftStore.fetchAircrafts(baseModelCode(selectedModel.value))
}

// 机型筛选改为服务端查询（原先是内存里精确比对 modelCode）
watch(selectedModel, () => reload())

/**
 * 切回「飞行器管理」时重拉数据。
 * 该页内容直接内联在 HomeView 模板里（机型/构型等是子组件，切走时会被 v-if 销毁、
 * 切回时重新 onMounted），而 HomeView 自身在整个 SPA 里只挂载一次 —— 所以只靠
 * onMounted 的话，从别的菜单切回来不会发任何请求，列表和机型下拉都是旧数据。
 */
watch(activeMenu, async (menu) => {
  if (menu !== 'aircraft') return
  await aircraftStore.fetchModels()
  // 机型管理页可能刚删掉当前筛选的机型；筛选值失效就回到「全部机型」（未选机型 = 汇总显示，
  // 由 reload 遍历全部机型拉取）。值没变时（如仍为空）显式补一次，避免 watcher 不触发。
  const stillExists = aircraftStore.models.some((m) => m.modelCode === selectedModel.value)
  if (selectedModel.value && !stillExists) {
    selectedModel.value = ''
  } else {
    reload()
  }
  bindGridObserver()
})

// 机型下拉：只显示 GET /aircraft/models 的 modelCode
const modelOptions = computed(() => {
  const seen = new Set<string>()
  for (const m of aircraftStore.models) {
    if (m.modelCode) seen.add(m.modelCode)
  }
  return [...seen].map((value) => ({ value, label: value }))
})

// 机型已由服务端过滤，这里只做关键字过滤
const filteredAircrafts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return aircraftStore.aircrafts
  return aircraftStore.aircrafts.filter(
    (a) =>
      a.aircraftNumber.toLowerCase().includes(q) ||
      a.modelCode.toLowerCase().includes(q) ||
      a.airline.toLowerCase().includes(q),
  )
})

// 新增/删除本地单机后刷新列表（保持当前机型筛选生效）
function onAircraftCreated() {
  dialogVisible.value = false
  reload()
  aircraftStore.fetchModels()
}
function onAircraftDeleted() {
  reload()
}

// ---- 卡片等高：所有卡片宽度/高度统一，与首行一致 ----
// 网格等列宽已保证宽度统一；高度以当前已渲染卡片中的最高一张为基准，
// 将每一行都固定为这一高度，使每张卡片都拉伸到与首行卡片相同。
const gridEl = ref<HTMLElement | null>(null)
const cardRowHeight = ref<number>(0)
let gridResizeObserver: ResizeObserver | null = null

function syncCardRowHeight() {
  nextTick(() => {
    const grid = gridEl.value
    if (!grid) return
    const cards = grid.querySelectorAll<HTMLElement>('.aircraft-card')
    let max = 0
    cards.forEach((card) => {
      if (card.offsetHeight > max) max = card.offsetHeight
    })
    if (max > 0) cardRowHeight.value = max
  })
}

/**
 * 把 ResizeObserver 绑到当前的卡片网格上。
 * 网格随菜单切换被 v-if 销毁重建，observer 不会自己跟过去（还盯着已脱离文档的旧元素），
 * 因此每次重新进入本页都要重新绑定，否则侧栏折叠/窗口缩放不再同步行高。
 */
function bindGridObserver() {
  nextTick(() => {
    const grid = gridEl.value
    if (!grid || !gridResizeObserver) return
    gridResizeObserver.disconnect()
    gridResizeObserver.observe(grid)
    syncCardRowHeight()
  })
}

onMounted(async () => {
  // 未指定机型时按全部机型汇总显示，故机型必须先到（reload 要用它遍历）。
  await aircraftStore.fetchModels()
  await reload()
  // 侧栏折叠/窗口变化会导致列数变化，重新同步行高
  gridResizeObserver = new ResizeObserver(() => syncCardRowHeight())
  bindGridObserver()
})

onBeforeUnmount(() => {
  gridResizeObserver?.disconnect()
})

// 列表增删（含筛选/切换机型）后重新测量
watch(
  () => filteredAircrafts.value.length,
  () => syncCardRowHeight(),
)
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <SideNav
        v-model:activeMenu="activeMenu"
        :collapsed="sidebarCollapsed"
        @toggle="sidebarCollapsed = true"
      />
    </aside>

    <div class="content">
      <header class="topbar">
        <div class="topbar-left">
          <button
            type="button"
            class="nav-toggle"
            :title="sidebarCollapsed ? '展开导航' : '收起导航'"
            :aria-label="sidebarCollapsed ? '展开导航' : '收起导航'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <el-icon :size="18">
              <Expand v-if="sidebarCollapsed" />
              <Fold v-else />
            </el-icon>
          </button>

          <nav class="breadcrumb" aria-label="面包屑">
            <span class="breadcrumb-home">
              <el-icon><HomeFilled /></el-icon>
              工作台
            </span>
            <span class="breadcrumb-separator">/</span>
            <strong>{{ currentPage.title }}</strong>
          </nav>
        </div>

        <div class="topbar-right">
          <span class="system-status">
            <i class="status-dot" />
            系统运行中
          </span>
          <span class="topbar-divider" />
          <div class="topbar-identity">
            <span class="identity-mark">P</span>
            <span class="identity-label">PHM 运维中心</span>
          </div>
        </div>
      </header>

      <main class="content-body">
        <section v-if="activeMenu === 'aircraft'" class="page-panel">
          <div class="page-heading">
            <div class="page-heading-copy">
              <span class="page-eyebrow">{{ currentPage.section }}</span>
              <h2 class="page-title">{{ currentPage.title }}</h2>
              <p class="page-description">{{ currentPage.description }}</p>
            </div>
            <div class="page-summary">
              <span>当前结果</span>
              <strong>{{ filteredAircrafts.length }}</strong>
              <span>架</span>
            </div>
          </div>

          <el-tabs v-model="aircraftViewTab" class="aircraft-view-tabs">
            <el-tab-pane label="机群概览" name="fleet">
              <div class="filter-bar">
                <div class="filter-fields">
                  <el-select
                    v-model="selectedModel"
                    placeholder="全部机型"
                    clearable
                    class="model-filter"
                  >
                    <el-option
                      v-for="opt in modelOptions"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                  <el-input
                    v-model="searchQuery"
                    placeholder="搜索机号、机型或所属单位"
                    clearable
                    class="search-input"
                  >
                    <template #prefix>
                      <el-icon><Search /></el-icon>
                    </template>
                  </el-input>
                </div>
                <el-button
                  type="primary"
                  :icon="Plus"
                  class="add-btn"
                  @click="dialogVisible = true"
                >
                  添加飞行器
                </el-button>
              </div>

              <div
                class="card-grid"
                ref="gridEl"
                :style="cardRowHeight ? { gridAutoRows: cardRowHeight + 'px' } : undefined"
              >
                <AircraftCard
                  v-for="(aircraft, idx) in filteredAircrafts"
                  :key="`${aircraft.aircraftNumber}-${idx}`"
                  :aircraft="aircraft"
                  @deleted="onAircraftDeleted"
                />
                <div v-if="filteredAircrafts.length === 0" class="empty-state">
                  <span class="empty-icon">✈️</span>
                  <p>暂无匹配的飞行器</p>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="机群寿命分布" name="life" lazy>
              <FleetLifeOverview :model-code="selectedModel" />
            </el-tab-pane>
          </el-tabs>
        </section>

        <section v-else class="view-stage">
          <ModelManagement v-if="activeMenu === 'model'" />
          <DocumentView v-else-if="activeMenu === 'knowledge'" />
          <ConfigManagement v-else-if="activeMenu === 'config'" />
          <MonitorView v-else-if="activeMenu === 'monitor'" />
          <router-view v-else-if="activeMenu === 'algo'" />
          <InterfaceManagement v-else-if="activeMenu === 'interface'" />
          <ExternalPlatformManagement v-else-if="activeMenu === 'external'" />
        </section>
      </main>
    </div>
  </div>

  <AddAircraftDialog v-model:visible="dialogVisible" @created="onAircraftCreated" />
</template>

<style scoped>
.app-layout {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--phm-bg);
  color: var(--phm-text);
  font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
}

.sidebar {
  width: 232px;
  min-width: 232px;
  max-width: 232px;
  flex-shrink: 0;
  height: 100%;
  transition:
    width var(--phm-transition),
    min-width var(--phm-transition),
    max-width var(--phm-transition),
    transform var(--phm-transition),
    box-shadow var(--phm-transition);
  overflow: hidden;
}

.sidebar.collapsed {
  width: 64px;
  min-width: 64px;
  max-width: 64px;
}

.content {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--phm-bg);
}

.topbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  min-height: 56px;
  padding: 0 18px 0 12px;
  border-bottom: 1px solid var(--phm-border);
  background: var(--phm-surface);
}

.topbar-left,
.topbar-right,
.breadcrumb,
.topbar-identity,
.system-status {
  display: flex;
  align-items: center;
}

.topbar-left {
  min-width: 0;
  gap: 12px;
}

.nav-toggle {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border: 1px solid transparent;
  border-radius: var(--phm-radius-control);
  background: transparent;
  color: var(--phm-text-secondary);
  cursor: pointer;
  transition: color var(--phm-transition), background var(--phm-transition), border-color var(--phm-transition);
}

.nav-toggle:hover {
  border-color: #cfe5df;
  background: var(--phm-primary-50);
  color: var(--phm-primary-700);
}

.breadcrumb {
  min-width: 0;
  gap: 8px;
  font-size: 13px;
}

.breadcrumb-home {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--phm-text-muted);
  white-space: nowrap;
}

.breadcrumb-home .el-icon {
  font-size: 14px;
}

.breadcrumb-separator {
  color: var(--phm-border-strong);
}

.breadcrumb strong {
  overflow: hidden;
  color: var(--phm-text);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-right {
  gap: 14px;
  flex-shrink: 0;
}

.system-status {
  gap: 7px;
  color: var(--phm-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2b9a72;
  box-shadow: 0 0 0 4px rgba(43, 154, 114, 0.1);
}

.topbar-divider {
  width: 1px;
  height: 20px;
  background: var(--phm-border);
}

.topbar-identity {
  gap: 8px;
  color: var(--phm-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.identity-mark {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid #f1d5ad;
  border-radius: 50%;
  background: var(--phm-accent-soft);
  color: var(--phm-accent);
  font-size: 11px;
  font-weight: 700;
}

.content-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 20px;
  overflow: hidden;
  background: var(--phm-bg);
}

.page-panel,
.view-stage {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--phm-border);
  border-radius: var(--phm-radius-card);
  background: var(--phm-surface);
  box-shadow: var(--phm-shadow-card);
}

.page-panel {
  display: flex;
  flex-direction: column;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px 14px;
}

.page-heading-copy {
  min-width: 0;
}

.page-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--phm-accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.page-eyebrow::before {
  content: '';
  width: 16px;
  height: 2px;
  border-radius: 2px;
  background: var(--phm-accent);
}

.page-title {
  margin: 6px 0 4px;
  color: var(--phm-text);
  font-size: 20px;
  font-weight: 650;
  line-height: 1.3;
}

.page-description {
  color: var(--phm-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.page-summary {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 120px;
  padding: 8px 12px;
  border: 1px solid var(--phm-border);
  border-radius: var(--phm-radius-control);
  background: var(--phm-surface-muted);
  color: var(--phm-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.page-summary strong {
  color: var(--phm-primary-700);
  font-size: 18px;
  font-weight: 650;
}

.aircraft-view-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.aircraft-view-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  margin: 0;
  padding: 0 22px;
}

.aircraft-view-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.aircraft-view-tabs :deep(.el-tab-pane) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 22px;
  border-top: 1px solid var(--phm-border);
  border-bottom: 1px solid var(--phm-border);
  background: var(--phm-surface-muted);
}

.filter-fields {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.search-input {
  flex: 1;
  max-width: 360px;
}

.model-filter {
  width: 200px;
  flex-shrink: 0;
}

.add-btn {
  white-space: nowrap;
  flex-shrink: 0;
}

.card-grid {
  flex: 1;
  overflow-y: auto;
  padding: 16px 22px 22px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
  align-content: start;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 0;
  color: var(--phm-text-muted);
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 13px;
  margin: 0;
}

.view-stage {
  display: flex;
  flex-direction: column;
}

.view-stage > :deep(*) {
  flex: 1;
  width: 100%;
  min-height: 0;
}

@media (max-width: 900px) {
  .sidebar {
    width: 208px;
    min-width: 208px;
    max-width: 208px;
  }

  .breadcrumb-home {
    display: none;
  }

  .breadcrumb-separator {
    display: none;
  }

  .system-status,
  .topbar-divider,
  .identity-label {
    display: none;
  }

  .content-body {
    padding: 12px;
  }
}

@media (max-width: 760px) {
  .sidebar,
  .sidebar.collapsed {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    width: 232px;
    min-width: 232px;
    max-width: 232px;
    height: 100%;
  }

  .sidebar {
    box-shadow: 16px 0 40px rgba(24, 48, 43, 0.14);
  }

  .sidebar.collapsed {
    transform: translateX(-100%);
    box-shadow: none;
  }

  .content {
    width: 100%;
  }

  .topbar {
    padding-left: 10px;
  }
}

@media (max-width: 680px) {
  .page-heading,
  .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .page-summary {
    align-self: flex-start;
  }

  .filter-fields {
    align-items: stretch;
    flex-direction: column;
  }

  .model-filter,
  .search-input {
    width: 100%;
    max-width: none;
  }

  .add-btn {
    align-self: flex-end;
  }
}
</style>
