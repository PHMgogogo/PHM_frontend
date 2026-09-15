<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useAircraftStore } from '@/stores/aircraft'
import ModelCard from '@/components/ModelCard.vue'

const aircraftStore = useAircraftStore()

const searchQuery = ref('')

const filteredModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return aircraftStore.models
  return aircraftStore.models.filter((m) =>
    [m.modelCode, m.manufacturer, m.description].some((v) => v && v.toLowerCase().includes(q)),
  )
})

onMounted(() => {
  aircraftStore.fetchModels()
})
</script>

<template>
  <div class="model-page">
    <div class="page-header">
      <h2 class="page-title">机型管理</h2>
    </div>

    <!-- 顶部功能区 -->
    <div class="toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索机型编码、生产厂商或描述..."
        clearable
        class="search-input"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span class="total-count">共 {{ aircraftStore.models.length }} 个机型</span>
    </div>

    <!-- 卡片区：外源机型编码带 :modelId 后缀，可能出现重复 modelCode，key 需带下标 -->
    <div class="card-grid" v-loading="aircraftStore.modelsLoading">
      <ModelCard
        v-for="(model, idx) in filteredModels"
        :key="`${model.modelCode}-${idx}`"
        :model="model"
      />
      <div v-if="!aircraftStore.modelsLoading && filteredModels.length === 0" class="empty-state">
        <span class="empty-icon">🗂️</span>
        <p>暂无匹配的机型</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-page {
  flex: 1;
  min-height: 0;
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
  padding: 0 32px 8px;
}

.search-input {
  flex: 1;
  max-width: 400px;
}

.total-count {
  margin-left: auto;
  font-size: 13px;
  color: #8c9ab0;
  white-space: nowrap;
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
