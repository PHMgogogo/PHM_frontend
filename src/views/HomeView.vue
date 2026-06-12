<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import SideNav from '@/components/SideNav.vue'
import AircraftCard from '@/components/AircraftCard.vue'
import AddAircraftDialog from '@/components/AddAircraftDialog.vue'
import MonitorView from '@/views/MonitorView.vue'
import ConfigManagement from '@/views/ConfigManagement.vue'
import { useAircraftStore } from '@/stores/aircraft'
import { Search } from '@element-plus/icons-vue'

const store = useAircraftStore()
const activeMenu = ref('aircraft')
const sidebarCollapsed = ref(false)
const dialogVisible = ref(false)
const searchQuery = ref('')

onMounted(() => {
  store.fetchAircrafts()
})

const filteredAircrafts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return store.aircrafts
  return store.aircrafts.filter(
    (a) =>
      a.aircraftNumber.toLowerCase().includes(q) ||
      a.modelCode.toLowerCase().includes(q) ||
      (a.airline ?? '').toLowerCase().includes(q),
  )
})
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
          <el-input
            v-model="searchQuery"
            placeholder="搜索飞行器名称、属性或构型..."
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
            :key="aircraft.aircraftNumber"
            :aircraft="aircraft"
          />
          <div v-if="filteredAircrafts.length === 0" class="empty-state">
            <span class="empty-icon">✈️</span>
            <p>暂无匹配的飞行器</p>
          </div>
        </div>
      </template>

      <!-- 知识库管理（占位） -->
      <template v-else-if="activeMenu === 'knowledge'">
        <div class="placeholder-page">
          <span class="placeholder-icon">📚</span>
          <p class="placeholder-text">知识库管理</p>
          <p class="placeholder-sub">该功能正在开发中</p>
        </div>
      </template>

      <!-- 构型管理 -->
      <template v-else-if="activeMenu === 'config'">
        <ConfigManagement />
      </template>

      <!-- 实时监控 -->
      <template v-else-if="activeMenu === 'monitor'">
        <MonitorView />
      </template>
    </main>
  </div>

  <!-- 添加飞行器弹窗 -->
  <AddAircraftDialog v-model:visible="dialogVisible" @created="dialogVisible = false" />
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

.placeholder-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #bcc5d0;
  gap: 12px;
}

.placeholder-icon {
  font-size: 60px;
  opacity: 0.5;
}

.placeholder-text {
  font-size: 20px;
  font-weight: 600;
  color: #8c9ab0;
  margin: 0;
}

.placeholder-sub {
  font-size: 14px;
  color: #bcc5d0;
  margin: 0;
}
</style>
