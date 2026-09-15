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
import { useAircraftStore } from '@/stores/aircraft'
import { baseModelCode } from '@/utils/model-code'
import { Search } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const aircraftStore = useAircraftStore()
const activeMenu = ref('aircraft')
const sidebarCollapsed = ref(false)
const dialogVisible = ref(false)
const searchQuery = ref('')
const selectedModel = ref('')

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
 * 按当前机型筛选重拉单机列表。
 * 筛选值可能是外源机型（如 JX-20A:10001），须截断 ':modelId' 后缀再查 ——
 * 后端 /aircraft/plane 只认基础编码，传带后缀的值会返回空列表。
 */
function reload() {
  const code = selectedModel.value ? baseModelCode(selectedModel.value) : undefined
  return aircraftStore.fetchAircrafts(code)
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
  // 机型管理页可能刚删掉当前筛选的机型；筛选值失效就清空
  // （清空会由 watch(selectedModel) 自行触发重拉，避免这里重复请求）
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

onMounted(() => {
  aircraftStore.fetchModels()
  reload()
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
    <!-- 左侧导航 -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <SideNav v-model:activeMenu="activeMenu" :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />
    </aside>

    <!-- 右侧内容 -->
    <main class="content">
      <!-- 飞行器管理 -->
      <template v-if="activeMenu === 'aircraft'">
        <div class="page-header">
          <h2 class="page-title">飞行器管理</h2>
        </div>

        <!-- 顶部功能区 -->
        <div class="toolbar">
          <el-select
            v-model="selectedModel"
            placeholder="按机型筛选"
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
            placeholder="搜索飞行器机号、机型或所属单位..."
            clearable
            class="search-input"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" class="add-btn" @click="dialogVisible = true">
            + 添加飞行器
          </el-button>
        </div>

        <!-- 卡片区 -->
        <div
          class="card-grid"
          ref="gridEl"
          :style="cardRowHeight ? { gridAutoRows: cardRowHeight + 'px' } : undefined"
        >
          <!-- key 带下标：同一机号可能在多源同时存在（如 20011 本地/航新/633 各一条），
               仅用机号作 key 会重复 -->
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
      </template>

      <!-- 机型管理 -->
      <template v-else-if="activeMenu === 'model'">
        <ModelManagement />
      </template>

      <!-- 知识库管理 -->
      <template v-else-if="activeMenu === 'knowledge'">
        <DocumentView />
      </template>

      <!-- 构型管理 -->
      <template v-else-if="activeMenu === 'config'">
        <ConfigManagement />
      </template>

      <!-- 实时监控 -->
      <template v-else-if="activeMenu === 'monitor'">
        <MonitorView />
      </template>

      <!-- 算法管理（独立路由页面，保留侧边栏布局） -->
      <template v-else-if="activeMenu === 'algo'">
        <router-view />
      </template>

      <!-- 接口管理 -->
      <template v-else-if="activeMenu === 'interface'">
        <InterfaceManagement />
      </template>

      <!-- 外来平台配置管理 -->
      <template v-else-if="activeMenu === 'external'">
        <ExternalPlatformManagement />
      </template>
    </main>
  </div>

  <!-- 添加飞行器弹窗 -->
  <AddAircraftDialog v-model:visible="dialogVisible" @created="onAircraftCreated" />
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.sidebar {
  width: 15%;
  min-width: 160px;
  max-width: 240px;
  flex-shrink: 0;
  height: 100%;
  transition: width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 64px;
  min-width: 64px;
  max-width: 64px;
}

.content {
  flex: 1;
  background: #f4f6fb;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: 24px 32px 0;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0 0 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 32px 20px;
}

.search-input {
  flex: 1;
  max-width: 400px;
}

.model-filter {
  width: 220px;
  flex-shrink: 0;
}

.add-btn {
  white-space: nowrap;
  font-weight: 600;
}

.card-grid {
  flex: 1;
  overflow-y: auto;
  padding: 0 32px 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  align-content: start;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #bcc5d0;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 15px;
  margin: 0;
}

</style>
