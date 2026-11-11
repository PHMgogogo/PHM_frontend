<!-- 图表组件 -->
<script setup>
import { onMounted, ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
// echarts-gl：提供 scatter3D / grid3D 等 3D 图表能力（用于 POINT_CLOUD_3D 展示）
import 'echarts-gl'
import { Warning, Close } from '@element-plus/icons-vue'

// 注册 ECharts 按需模块（全局副作用，仅执行一次）
use([
  CanvasRenderer,
  BarChart, LineChart, PieChart, ScatterChart,
  TitleComponent, TooltipComponent, LegendComponent, GridComponent,
])

const props = defineProps({
  id: {
    type: [String, Number],
    required: true
  },
  option: {
    type: Object,
    required: true
  },
  width: {
    type: [String, Number],
    default: '100%'
  },
  height: {
    type: [String, Number],  
    default: '100%'
  },
  title: {
    type: String,
    default: ''
  },
  readonly: {
    type: Boolean,
    default: false
  },
  theme: {
    type: String,
    default: 'default'
  },
  showDeleteButton: {
    type: Boolean,
    default: true
  },
  // 选中态（编辑模式）：由父级 DashboardContainer 根据 selectedId 计算
  selected: {
    type: Boolean,
    default: false
  },
  enableInteraction: {
    type: Boolean,
    default: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  customClass: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['delete', 'click', 'chart-ready', 'chart-error'])

const isHovered = ref(false)
const chartRef = ref(null)
let myChart = null
let resizeObserver = null

// ---- 参数表模式（PARAM_TABLE）----
// option 为 buildParamTableOption 产出的 { __table, columns, rows }，非 ECharts 配置：
// 跳过 ECharts 初始化，由模板渲染 el-table；数据经 computed 直接绑定 option。
const isTableMode = computed(() => !!props.option?.__table)
const tableColumns = computed(() => (Array.isArray(props.option?.columns) ? props.option.columns : []))
const tableRows = computed(() => (Array.isArray(props.option?.rows) ? props.option.rows : []))

// 列排序（sortable="custom"）：全量数据排序后再分页，避免只排当前页
const sortProp = ref('')
const sortOrder = ref('') // '' | 'ascending' | 'descending'
function handleSortChange({ prop, order }) {
  sortProp.value = prop || ''
  sortOrder.value = order || ''
  currentPage.value = 1
}

/** 数值优先比较：两值均可解析为数字时按数值比，否则按本地化字符串比（数字感知） */
function numericAwareCompare(a, b) {
  const sa = a === null || a === undefined ? '' : String(a).trim()
  const sb = b === null || b === undefined ? '' : String(b).trim()
  const na = sa === '' ? NaN : Number(sa)
  const nb = sb === '' ? NaN : Number(sb)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return sa.localeCompare(sb, 'zh-Hans-CN', { numeric: true })
}

const sortedRows = computed(() => {
  if (!sortProp.value || !sortOrder.value) return tableRows.value
  const dir = sortOrder.value === 'descending' ? -1 : 1
  const p = sortProp.value
  return [...tableRows.value].sort((a, b) => dir * numericAwareCompare(a[p], b[p]))
})

// 前端分页：行量已由 SQL LIMIT 侧约束，这里只做展示分页
const pageSize = ref(50)
const currentPage = ref(1)
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sortedRows.value.slice(start, start + pageSize.value)
})
// 换页大小 / 数据更新（编辑重查、别名重建）后页码越界回落首页
watch(pageSize, () => {
  currentPage.value = 1
})
watch(
  () => [props.option?.rows, props.option?.columns],
  () => {
    const maxPage = Math.max(1, Math.ceil(tableRows.value.length / pageSize.value))
    if (currentPage.value > maxPage) currentPage.value = 1
  },
)

const initChart = async () => {
  if (isTableMode.value) return // 表格模式不初始化 ECharts
  try {
    if (chartRef.value) {
      if (myChart) {
        myChart.dispose()
        myChart = null
      }
      myChart = init(chartRef.value, props.theme === 'default' ? null : props.theme)
      myChart.setOption(props.option)
      if (props.enableInteraction) {
        myChart.on('click', handleChartClick)
      }
      emit('chart-ready', myChart)
    }
  } catch (error) {
    console.error('图表初始化失败:', error)
    emit('chart-error', error)
  }
}

const handleChartClick = (params) => {
  emit('click', { chartId: props.id, params, chartInstance: myChart })
}

const handleResize = () => {
  if (myChart && !myChart.isDisposed()) {
    myChart.resize()
  }
}

const showLoading = () => {
  if (myChart && !myChart.isDisposed()) {
    myChart.showLoading('default', {
      text: '加载中...',
      color: '#3b7cff',
      textColor: '#666',
      maskColor: 'rgba(255, 255, 255, 0.8)',
      zlevel: 0,
      fontSize: 12,
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      lineWidth: 2,
      fontWeight: 'normal'
    })
  }
}

const hideLoading = () => {
  if (myChart && !myChart.isDisposed()) {
    myChart.hideLoading()
  }
}

onMounted(async () => {
  await nextTick()
  initChart()
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  if (myChart) {
    myChart.dispose()
    myChart = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

watch(() => props.option, (newOption) => {
  if (myChart && !myChart.isDisposed() && newOption) {
    try {
      myChart.setOption(newOption, true)
    } catch (error) {
      console.error('更新图表配置失败:', error)
      emit('chart-error', error)
    }
  }
}, { deep: true })

watch(() => [props.width, props.height], () => {
  setTimeout(handleResize, 100)
})

watch(() => props.loading, (isLoading) => {
  if (isLoading) {
    showLoading()
  } else {
    hideLoading()
  }
}, { immediate: true })

watch(() => props.theme, () => {
  initChart()
})

const handleDelete = (event) => {
  if (props.readonly) return
  event.stopPropagation()
  emit('delete', String(props.id))
}

defineExpose({
  getChartInstance: () => myChart,
  resize: handleResize,
  refresh: initChart,
  showLoading,
  hideLoading
})
</script>

<template>
  <div 
    :class="['chart-widget-wrapper', customClass, {
      'chart-readonly': readonly,
      'chart-error': error,
      'chart-loading': loading,
      'chart-selected': selected
    }]"
    @mouseenter="!readonly && (isHovered = true)"
    @mouseleave="!readonly && (isHovered = false)"
  >
    <!-- 图表标题 -->
    <div v-if="title" class="chart-title">
      {{ title }}
    </div>
    
    <!-- 错误状态 -->
    <div v-if="error" class="chart-error-state">
      <div class="error-icon"><el-icon color="#EF4444"><Warning /></el-icon></div>
      <div class="error-message">{{ error }}</div>
      <button @click="initChart" class="retry-btn">重试</button>
    </div>
    
    <!-- 参数表：SQL 直接结果渲染为表格（表头=列名，列排序 + 前端分页） -->
    <div v-if="isTableMode && !error" class="table-area" v-loading="loading">
      <div class="table-scroll">
        <el-table
          :data="pagedRows"
          size="small"
          height="100%"
          style="width: 100%"
          @sort-change="handleSortChange"
        >
          <el-table-column
            v-for="col in tableColumns"
            :key="col.prop"
            :prop="col.prop"
            :label="col.label"
            sortable="custom"
            min-width="110"
            show-overflow-tooltip
          />
        </el-table>
      </div>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="tableRows.length"
          :page-sizes="[20, 50, 100]"
          :pager-count="5"
          layout="total, sizes, prev, pager, next"
          size="small"
        />
      </div>
    </div>

    <!-- ECharts图表容器：外层 chart-area 提供留白，内层 chart-container 承载画布 -->
    <div v-show="!error && !isTableMode" class="chart-area">
      <div
        class="chart-container"
        ref="chartRef"
        :style="{ width, height }"
      ></div>
    </div>
    
    <!-- 删除按钮 -->
    <div 
      v-if="showDeleteButton && !readonly && isHovered" 
      class="delete-btn"
      @click="handleDelete"
      title="删除图表"
    >
      <el-icon><Close /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.chart-widget-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: var(--dashboard-border-radius, 8px);
  display: flex;
  flex-direction: column;
  background: var(--dashboard-card-bg, #ffffff);
  transition: all 0.2s ease;
}

.chart-widget-wrapper:hover:not(.chart-readonly) {
  box-shadow: 0 6px 16px rgba(0, 30, 90, 0.12);
}

.chart-widget-wrapper.chart-loading {
  opacity: 0.8;
}

.chart-widget-wrapper.chart-error {
  border: 2px dashed var(--dashboard-danger-color, #f56c6c);
}

/* 选中态：用 outline 而非 border，避免撑动栅格布局 */
.chart-widget-wrapper.chart-selected {
  outline: 2px solid var(--dashboard-primary-color, #3b7cff);
  outline-offset: -2px;
  box-shadow: 0 0 0 4px rgba(59, 124, 255, 0.12), 0 6px 16px rgba(0, 30, 90, 0.12);
}

.chart-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dashboard-text-color-primary, #0d1f3c);
  background: var(--dashboard-bg-color, #f4f6fb);
  border-bottom: 1px solid var(--dashboard-border-color, #e4e8f1);
  border-radius: var(--dashboard-border-radius, 8px) var(--dashboard-border-radius, 8px) 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 外层留白容器：flex 占位 + 内边距，使图表画布与卡片边缘保持间距 */
.chart-area {
  flex: 1;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
}

.chart-container {
  width: 100%;
  height: 100%;
  background: var(--dashboard-card-bg, white);
  border-radius: var(--dashboard-border-radius, 8px);
}

/* 参数表：与 chart-area 同等留白，表格占满剩余高度，分页条固定底部 */
.table-area {
  flex: 1;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.table-scroll {
  flex: 1;
  min-height: 0;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

.chart-error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  text-align: center;
  color: var(--dashboard-text-color-secondary, #8c9ab0);
}

.error-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.error-message {
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.4;
}

.retry-btn {
  padding: 6px 12px;
  background: var(--dashboard-primary-color, #3b7cff);
  color: white;
  border: none;
  border-radius: var(--dashboard-border-radius, 8px);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #5a93ff;
}

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  background: rgba(245, 108, 108, 0.9);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  z-index: 100;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.3);
}

.delete-btn:hover {
  background: rgba(245, 108, 108, 1);
  transform: scale(1.1);
}

.delete-btn:active {
  transform: scale(0.95);
}
</style>
