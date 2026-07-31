<!-- 仪表盘主容器组件 -->
<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import ChartWidget from './ChartWidget.vue'
import { 
  setDefaultConfig, 
  validateDashboardConfig, 
  DASHBOARD_EVENTS 
} from '../../utils/dashboard-types.js'
import { 
  generateId, 
  findEmptySpace, 
  optimizeLayout, 
  calculateRowHeight, 
  debounce, 
  storage 
} from '../../utils/dashboard-utils.js'
import { generateChartConfig } from '../../utils/chart-configs.js'
import { DataBoard } from '@element-plus/icons-vue'

const props = defineProps({
  config: {
    type: Object,
    required: true,
    validator: (config) => {
      const errors = validateDashboardConfig(config)
      if (errors.length > 0) {
        console.error('Dashboard配置验证失败:', errors)
        return false
      }
      return true
    }
  },
  initialLayout: {
    type: Array,
    default: () => []
  },
  readonly: {
    type: Boolean,
    default: false
  },
  autoSave: {
    type: Boolean,
    default: false
  },
  storageKey: {
    type: String,
    default: 'dashboard-layout'
  },
  customClass: {
    type: String,
    default: ''
  },
  // 是否显示删除按钮（false = 半编辑模式：只允许拖拽和调整大小）
  showDeleteButton: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits([
  DASHBOARD_EVENTS.ITEM_ADDED,
  DASHBOARD_EVENTS.ITEM_DELETED, 
  DASHBOARD_EVENTS.LAYOUT_CHANGED,
  DASHBOARD_EVENTS.LAYOUT_OPTIMIZED,
  DASHBOARD_EVENTS.CONFIG_CHANGED,
  DASHBOARD_EVENTS.CHART_CLICKED
])

const dashboardConfig = computed(() => setDefaultConfig(props.config))

const selectedCategory = ref('')
const selectedChartType = ref('bar') 
const selectedSize = ref('small')
const layout = ref([])
const nextId = ref(1)

const showDeleteDialog = ref(false)
const itemToDelete = ref(null)

const canvasRef = ref(null)
const rowHeight = ref(30)

watch(
  () => [dashboardConfig.value.dataSource, dashboardConfig.value.chartTypes, dashboardConfig.value.sizes],
  ([dataSource, chartTypes, sizes]) => {
    if (dataSource.length > 0 && !selectedCategory.value) {
      selectedCategory.value = dataSource[0].name
    }
    if (chartTypes.length > 0 && !selectedChartType.value) {
      selectedChartType.value = chartTypes[0].value
    }
    if (sizes.length > 0 && !selectedSize.value) {
      selectedSize.value = sizes[0].value
    }
  },
  { immediate: true }
)

watch(
  () => props.initialLayout,
  (newLayout) => {
    if (newLayout && newLayout.length > 0) {
      layout.value = [...newLayout]
      nextId.value = Math.max(...newLayout.map(item => parseInt(item.i) || 0)) + 1
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (props.autoSave && !props.initialLayout.length) {
    const savedLayout = storage.get(props.storageKey, [])
    if (savedLayout.length > 0) {
      layout.value = savedLayout
      nextId.value = Math.max(...savedLayout.map(item => parseInt(item.i) || 0)) + 1
    }
  }
  
  updateRowHeight()
  window.addEventListener('resize', debouncedUpdateRowHeight)
})

onUnmounted(() => {
  window.removeEventListener('resize', debouncedUpdateRowHeight)
})

const updateRowHeight = () => {
  if (canvasRef.value) {
    const newRowHeight = calculateRowHeight(
      canvasRef.value,
      dashboardConfig.value.layout.totalRows,
      dashboardConfig.value.layout.margin,
      dashboardConfig.value.layout.containerPadding
    )
    rowHeight.value = newRowHeight
  }
}

const debouncedUpdateRowHeight = debounce(updateRowHeight, 100)

// 是否纵向溢出：任一图表底部（y + h）超过画布总行数，即纵向占比超过 100%
const isYOverflow = computed(() => {
  if (layout.value.length === 0) return false
  const totalRows = dashboardConfig.value.layout.totalRows
  const maxBottom = layout.value.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  return maxBottom > totalRows
})

const getCurrentSizeConfig = () => {
  return dashboardConfig.value.sizes.find(s => s.value === selectedSize.value) || dashboardConfig.value.sizes[0]
}

const getChartOption = (categoryName, chartType, size) => {
  if (dashboardConfig.value.chartConfigGenerator) {
    const customConfig = dashboardConfig.value.chartConfigGenerator(
      dashboardConfig.value.dataSource, 
      categoryName, 
      chartType, 
      size
    )
    if (customConfig) return customConfig
  }
  
  return generateChartConfig(
    chartType, 
    categoryName, 
    dashboardConfig.value.dataSource, 
    size
  )
}

const addDashboardItem = () => {
  const sizeConfig = getCurrentSizeConfig()
  
  const emptySpace = findEmptySpace(
    layout.value,
    sizeConfig.w,
    sizeConfig.h,
    dashboardConfig.value.layout.cols,
    dashboardConfig.value.layout.totalRows
  )
  
  if (!emptySpace) {
    alert(`画布空间不足！无法放置 ${sizeConfig.w}x${sizeConfig.h} 的组件`)
    return
  }
  
  const newItem = {
    i: generateId(),
    x: emptySpace.x,
    y: emptySpace.y,
    w: sizeConfig.w,
    h: sizeConfig.h,
    option: getChartOption(selectedCategory.value, selectedChartType.value, selectedSize.value),
    type: selectedChartType.value,
    category: selectedCategory.value,
    title: `${selectedCategory.value} - ${selectedChartType.value}`,
    static: false
  }
  
  layout.value.push(newItem)
  nextId.value++
  
  emit(DASHBOARD_EVENTS.ITEM_ADDED, newItem)
  
  if (props.autoSave) {
    storage.set(props.storageKey, layout.value)
  }
}

/**
 * 用外部构造好的 ECharts option 直接添加图表项（不依赖内部 selectedCategory/selectedChartType）。
 * 供 MonitorView 等父级在完成 /api/display/raw-data 查询后注入真实图表。
 * @param {object} option ECharts option
 * @param {string} title 图表标题
 * @param {string} sizeValue 'small' | 'medium' | 'large'
 * @returns {object|null} 新添加的 layout item，失败返回 null
 */
const addItemWithOption = (option, title, sizeValue = 'medium') => {
  const sizeConfig =
    dashboardConfig.value.sizes.find((s) => s.value === sizeValue) || dashboardConfig.value.sizes[0]
  if (!sizeConfig) return null

  const emptySpace = findEmptySpace(
    layout.value,
    sizeConfig.w,
    sizeConfig.h,
    dashboardConfig.value.layout.cols,
    dashboardConfig.value.layout.totalRows,
  )
  if (!emptySpace) {
    alert(`画布空间不足！无法放置 ${sizeConfig.w}x${sizeConfig.h} 的组件`)
    return null
  }

  const newItem = {
    i: generateId(),
    x: emptySpace.x,
    y: emptySpace.y,
    w: sizeConfig.w,
    h: sizeConfig.h,
    option,
    type: 'display',
    category: '',
    title: title || '数据图表',
    static: false,
  }

  layout.value.push(newItem)
  nextId.value++

  emit(DASHBOARD_EVENTS.ITEM_ADDED, newItem)

  if (props.autoSave) {
    storage.set(props.storageKey, layout.value)
  }
  return newItem
}

const optimizeDashboardLayout = () => {
  const optimizedLayout = optimizeLayout(
    layout.value,
    dashboardConfig.value.layout.cols,
    dashboardConfig.value.layout.totalRows
  )
  
  layout.value = optimizedLayout
  emit(DASHBOARD_EVENTS.LAYOUT_OPTIMIZED, optimizedLayout)
  
  if (props.autoSave) {
    storage.set(props.storageKey, layout.value)
  }
}

const confirmDelete = (itemId) => {
  if (props.readonly) return
  itemToDelete.value = itemId
  showDeleteDialog.value = true
}

const executeDelete = () => {
  if (itemToDelete.value) {
    const deletedItem = layout.value.find(item => item.i === itemToDelete.value)
    layout.value = layout.value.filter(item => item.i !== itemToDelete.value)
    if (deletedItem) {
      emit(DASHBOARD_EVENTS.ITEM_DELETED, deletedItem)
    }
    if (props.autoSave) {
      storage.set(props.storageKey, layout.value)
    }
  }
  showDeleteDialog.value = false
  itemToDelete.value = null
}

const cancelDelete = () => {
  showDeleteDialog.value = false
  itemToDelete.value = null
}

const handleLayoutChange = (newLayout) => {
  layout.value = newLayout
  emit(DASHBOARD_EVENTS.LAYOUT_CHANGED, newLayout)
  if (props.autoSave) {
    storage.set(props.storageKey, layout.value)
  }
}

const handleChartClick = (item) => {
  emit(DASHBOARD_EVENTS.CHART_CLICKED, item)
}

const clearLayout = () => {
  if (props.readonly) return
  if (confirm('确定要清空所有图表吗？此操作无法撤销。')) {
    layout.value = []
    nextId.value = 1
    if (props.autoSave) {
      storage.remove(props.storageKey)
    }
  }
}

const exportLayout = () => {
  const exportData = {
    config: dashboardConfig.value,
    layout: layout.value,
    timestamp: new Date().toISOString()
  }
  const dataStr = JSON.stringify(exportData, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dashboard-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

defineExpose({
  addItem: addDashboardItem,
  addItemWithOption,
  optimizeLayout: optimizeDashboardLayout,
  clearLayout,
  exportLayout,
  getLayout: () => layout.value,
  setLayout: (newLayout) => { layout.value = newLayout },
  isYOverflow: () => isYOverflow.value
})
</script>

<template>
  <div :class="['dashboard-container', customClass]">
    <!-- 控制面板 -->
    <div 
      v-if="dashboardConfig.controlPanel.enabled" 
      class="dashboard-control-panel"
      :style="{ height: dashboardConfig.controlPanel.height }"
    >
      <h2 v-if="dashboardConfig.controlPanel.title">
        {{ dashboardConfig.controlPanel.title }}
      </h2>
      
      <div class="dashboard-controls" v-if="!readonly">
        <div 
          v-if="dashboardConfig.controlPanel.showDataSelector && dashboardConfig.dataSource.length > 0"
          class="control-group"
        >
          <label>统计条目</label>
          <select v-model="selectedCategory">
            <option 
              v-for="item in dashboardConfig.dataSource" 
              :key="item.name" 
              :value="item.name"
            >{{ item.name }}</option>
          </select>
        </div>

        <div 
          v-if="dashboardConfig.controlPanel.showTypeSelector"
          class="control-group"
        >
          <label>图表类型</label>
          <select v-model="selectedChartType">
            <option 
              v-for="type in dashboardConfig.chartTypes" 
              :key="type.value" 
              :value="type.value"
            >{{ type.label }}</option>
          </select>
        </div>

        <div 
          v-if="dashboardConfig.controlPanel.showSizeSelector"
          class="control-group"
        >
          <label>窗口大小</label>
          <select v-model="selectedSize">
            <option 
              v-for="size in dashboardConfig.sizes" 
              :key="size.value" 
              :value="size.value"
            >{{ size.label }}</option>
          </select>
        </div>

        <div class="control-actions">
          <button @click="addDashboardItem" class="btn btn-primary">创建图表</button>
          <button 
            v-if="dashboardConfig.controlPanel.showOptimizeButton && layout.length > 0"
            @click="optimizeDashboardLayout" 
            class="btn btn-success"
          >优化布局</button>
          <button 
            v-if="layout.length > 0"
            @click="clearLayout" 
            class="btn btn-warning"
          >清空</button>
          <button 
            v-if="layout.length > 0"
            @click="exportLayout" 
            class="btn btn-info"
          >导出</button>
        </div>
      </div>
    </div>

    <!-- 主体画布 -->
    <div 
      class="dashboard-canvas" 
      ref="canvasRef"
      :style="{ 
        height: dashboardConfig.controlPanel.enabled 
          ? `calc(100% - ${dashboardConfig.controlPanel.height})` 
          : '100%' 
      }"
    >
      <GridLayout
        v-model:layout="layout"
        :col-num="dashboardConfig.layout.cols"
        :row-height="rowHeight"
        :is-draggable="!readonly"
        :is-resizable="!readonly"
        :vertical-compact="true"
        :use-css-transforms="true"
        :margin="dashboardConfig.layout.margin"
        @layout-updated="handleLayoutChange"
      >
        <GridItem
          v-for="item in layout"
          :key="item.i"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :i="item.i"
          :static="item.static || readonly"
          class="dashboard-grid-item"
          @click="handleChartClick(item)"
        >
          <ChartWidget 
            :id="item.i"
            :option="item.option" 
            :title="item.title"
            :readonly="readonly"
            :show-delete-button="showDeleteButton"
            width="100%" 
            height="100%"
            @delete="confirmDelete"
          />
        </GridItem>
      </GridLayout>
      
      <!-- 空状态提示 -->
      <div v-if="layout.length === 0" class="dashboard-empty-state">
        <div class="empty-content">
          <div class="empty-icon"><el-icon color="#6366F1"><DataBoard /></el-icon></div>
          <h3>暂无图表</h3>
          <p v-if="!readonly">点击上方"创建图表"按钮开始添加图表</p>
          <p v-else>当前仪表盘为空</p>
        </div>
      </div>
    </div>
    
    <!-- 删除确认对话框 -->
    <div v-if="showDeleteDialog" class="dashboard-dialog-overlay" @click="cancelDelete">
      <div class="dashboard-dialog-box" @click.stop>
        <div class="dialog-header">
          <h3>确认删除</h3>
        </div>
        <div class="dialog-content">
          <p>确定要删除这个图表组件吗？此操作无法撤销。</p>
        </div>
        <div class="dialog-actions">
          <button @click="cancelDelete" class="btn btn-secondary">取消</button>
          <button @click="executeDelete" class="btn btn-danger">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--dashboard-bg-color, #f4f6fb);
  font-family: var(--dashboard-font-family, 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif);
}

.dashboard-control-panel {
  background: var(--dashboard-card-bg, #ffffff);
  border-bottom: 1px solid var(--dashboard-border-color, #e4e8f1);
  padding: 0 30px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 30, 90, 0.05);
  z-index: 10;
}

.dashboard-control-panel h2 {
  margin: 0 0 15px 0;
  font-size: 1.5rem;
  color: var(--dashboard-text-color-primary, #0d1f3c);
  font-weight: 600;
}

.dashboard-controls {
  display: flex;
  gap: 20px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.control-group label {
  font-size: 0.9rem;
  color: var(--dashboard-text-color-secondary, #8c9ab0);
  font-weight: 500;
}

.control-group select {
  padding: 8px 12px;
  border: 1px solid var(--dashboard-border-color, #e4e8f1);
  border-radius: var(--dashboard-border-radius, 8px);
  background: var(--dashboard-card-bg, white);
  min-width: 120px;
  font-size: 14px;
  transition: border-color 0.2s;
  outline: none;
}

.control-group select:focus {
  border-color: var(--dashboard-primary-color, #3b7cff);
}

.control-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-left: auto;
}

.btn {
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: var(--dashboard-border-radius, 8px);
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-primary { background: var(--dashboard-primary-color, #3b7cff); color: white; }
.btn-primary:hover:not(:disabled) { background: #5a93ff; }

.btn-success { background: #36c4a0; color: white; }
.btn-success:hover:not(:disabled) { background: #4fd4b0; }

.btn-warning { background: #f5a623; color: white; }
.btn-warning:hover:not(:disabled) { background: #f7b84a; }

.btn-info { background: #8c9ab0; color: white; }
.btn-info:hover:not(:disabled) { background: #a0adc0; }

.btn-secondary { background: #f4f6fb; color: #8c9ab0; border: 1px solid #e4e8f1; }
.btn-secondary:hover:not(:disabled) { background: #e8ecf4; color: #0d1f3c; }

.btn-danger { background: #f56c6c; color: white; }
.btn-danger:hover:not(:disabled) { background: #f78989; }

.dashboard-canvas {
  flex: 1;
  position: relative;
  background-image: radial-gradient(#dde3ef 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 16px;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
}

.dashboard-grid-item {
  background: var(--dashboard-card-bg, white);
  border: 1px solid var(--dashboard-border-color, #e4e8f1);
  box-shadow: 0 2px 12px rgba(0, 30, 90, 0.06);
  border-radius: var(--dashboard-border-radius, 8px);
  position: relative;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s;
}

.dashboard-grid-item:hover {
  box-shadow: 0 6px 20px rgba(0, 30, 90, 0.12);
}

:deep(.vue-grid-placeholder) {
  background: var(--dashboard-primary-color, #3b7cff) !important;
  opacity: 0.2 !important;
  border-radius: var(--dashboard-border-radius, 8px) !important;
}

.dashboard-empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--dashboard-text-color-secondary, #8c9ab0);
}

.empty-content { max-width: 300px; }

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.4;
}

.empty-content h3 {
  margin: 0 0 1rem 0;
  color: var(--dashboard-text-color-primary, #0d1f3c);
}

.empty-content p { margin: 0; line-height: 1.6; }

.dashboard-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dashboard-dialog-box {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 30, 90, 0.15);
  min-width: 320px;
  max-width: 400px;
  overflow: hidden;
}

.dialog-header {
  padding: 20px 20px 0;
  border-bottom: 1px solid #e4e8f1;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #0d1f3c;
  padding-bottom: 15px;
}

.dialog-content {
  padding: 20px;
  color: #8c9ab0;
  line-height: 1.6;
}

.dialog-actions {
  padding: 0 20px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 768px) {
  .dashboard-control-panel { padding: 0 15px; }
  .dashboard-controls { flex-direction: column; gap: 15px; align-items: stretch; }
  .control-actions { margin-left: 0; }
  .dashboard-canvas { padding: 10px; }
}
</style>
