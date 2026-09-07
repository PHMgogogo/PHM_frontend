<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useUnifiedStore } from '@/stores/unified'
import ModelCard from '@/components/ModelCard.vue'
import { SOURCE_ORDER, sourceText } from '@/api/unified'
import type { UnifiedSource } from '@/types/entities'

const unifiedStore = useUnifiedStore()

// 机型来源筛选（空 = 全部）
const selectedSource = ref<UnifiedSource | ''>('')
const searchQuery = ref('')

const SOURCE_OPTIONS: { value: UnifiedSource; label: string }[] = SOURCE_ORDER.map((s) => ({
  value: s,
  label: sourceText(s),
}))

// 三源命中数：本地 x · 航新服务 x · 633服务 x
const sourceCounts = computed(() =>
  SOURCE_ORDER.map((s) => ({
    source: s,
    count: unifiedStore.models.filter((m) => m.source === s).length,
  })),
)

const filteredModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return unifiedStore.models.filter((m) => {
    if (selectedSource.value && m.source !== selectedSource.value) return false
    if (!q) return true
    return [m.modelCode, m.manufacturer, m.description].some((v) => v && v.toLowerCase().includes(q))
  })
})

onMounted(() => {
  unifiedStore.fetchModels()
})
</script>

<template>
  <div class="model-page">
    <div class="page-header">
      <h2 class="page-title">机型管理</h2>
    </div>

    <p v-if="unifiedStore.modelsNotes.length" class="source-warning">
      {{ unifiedStore.modelsNotes.join('；') }}
    </p>

    <!-- 顶部功能区 -->
    <div class="toolbar">
      <el-select
        v-model="selectedSource"
        placeholder="按来源筛选"
        clearable
        class="source-filter"
      >
        <el-option
          v-for="opt in SOURCE_OPTIONS"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
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
      <span class="total-count">共 {{ unifiedStore.models.length }} 个机型</span>
    </div>

    <div class="source-counts">
      <span
        v-for="c in sourceCounts"
        :key="c.source"
        class="source-count"
      >{{ sourceText(c.source) }} {{ c.count }}</span>
    </div>

    <!-- 卡片区 -->
    <div class="card-grid" v-loading="unifiedStore.modelsLoading">
      <ModelCard
        v-for="model in filteredModels"
        :key="`${model.source}-${model.modelCode}`"
        :model="model"
      />
      <div v-if="!unifiedStore.modelsLoading && filteredModels.length === 0" class="empty-state">
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

.source-warning {
  margin: -8px 0 14px;
  padding: 0 32px;
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.6;
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

.source-filter {
  width: 180px;
  flex-shrink: 0;
}

.total-count {
  margin-left: auto;
  font-size: 13px;
  color: #8c9ab0;
  white-space: nowrap;
}

.source-counts {
  display: flex;
  gap: 18px;
  padding: 2px 32px 18px;
  font-size: 12px;
  color: #6888aa;
}

.source-count {
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
