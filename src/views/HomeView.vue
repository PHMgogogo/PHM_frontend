<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SideNav from '@/components/SideNav.vue'
import AircraftCard from '@/components/AircraftCard.vue'
import AddAircraftDialog from '@/components/AddAircraftDialog.vue'
import ConfigManagement from '@/views/ConfigManagement.vue'
import SortieQuery from '@/views/SortieQuery.vue'
import DocumentView from '@/views/DocumentView.vue'
import MonitorView from '@/views/MonitorView.vue'
import InterfaceManagement from '@/views/InterfaceManagement.vue'
import ExternalPlatformManagement from '@/views/ExternalPlatformManagement.vue'
import ModelManagement from '@/views/ModelManagement.vue'
import { useUnifiedStore } from '@/stores/unified'
import { Search } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const unifiedStore = useUnifiedStore()
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

// 飞行器管理页数据来自统一聚合查询（本地/航新/633 三源合并，每条带 source）
onMounted(() => {
  unifiedStore.fetchModels()
  unifiedStore.fetchAircrafts()
})

// 机型下拉：三源机型 + 单机上出现的型号 去重（远端行 modelCode 可能为空，故再从单机行兜底收集）
const modelOptions = computed(() => {
  const mf = new Map<string, string>()
  for (const m of unifiedStore.models) {
    if (m.modelCode && !mf.has(m.modelCode)) mf.set(m.modelCode, m.manufacturer ?? '')
  }
  for (const a of unifiedStore.aircrafts) {
    if (a.modelCode && !mf.has(a.modelCode)) mf.set(a.modelCode, '')
  }
  return [...mf.entries()].map(([value, manufacturer]) => ({
    value,
    label: manufacturer ? `${value} — ${manufacturer}` : value,
  }))
})

const filteredAircrafts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return unifiedStore.aircrafts.filter((a) => {
    if (selectedModel.value && a.modelCode !== selectedModel.value) return false
    if (!q) return true
    return (
      a.aircraftNumber.toLowerCase().includes(q) ||
      a.modelCode.toLowerCase().includes(q) ||
      a.airline.toLowerCase().includes(q)
    )
  })
})

// 新增/删除本地单机后刷新统一列表（本地 CRUD 内部已刷新各自本地 store）
function onAircraftCreated() {
  dialogVisible.value = false
  unifiedStore.fetchAircrafts()
  unifiedStore.fetchModels()
}
function onAircraftDeleted() {
  unifiedStore.fetchAircrafts()
}
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
          <p v-if="unifiedStore.sourceNotes.length" class="source-warning">
            {{ unifiedStore.sourceNotes.join('；') }}
          </p>
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
        <div class="card-grid">
          <AircraftCard
            v-for="aircraft in filteredAircrafts"
            :key="`${aircraft.source}-${aircraft.aircraftNumber}`"
            :aircraft="aircraft"
            @deleted="onAircraftDeleted"
          />
          <div v-if="filteredAircrafts.length === 0" class="empty-state">
            <span class="empty-icon">✈️</span>
            <p>暂无匹配的飞行器</p>
          </div>
        </div>
      </template>

      <!-- 架次统一查询 -->
      <template v-else-if="activeMenu === 'sortie'">
        <SortieQuery />
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

.source-warning {
  margin: -8px 0 14px;
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.6;
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
