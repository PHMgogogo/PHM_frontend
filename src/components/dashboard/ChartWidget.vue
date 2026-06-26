<!-- 图表组件 -->
<script setup>
import { onMounted, ref, watch, onUnmounted, nextTick } from 'vue'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
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

const initChart = async () => {
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
      'chart-loading': loading
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
    
    <!-- ECharts图表容器 -->
    <div 
      v-show="!error"
      class="chart-container" 
      ref="chartRef"
      :style="{ width, height }"
    ></div>
    
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

.chart-container {
  flex: 1;
  background: var(--dashboard-card-bg, white);
  border-radius: var(--dashboard-border-radius, 8px);
  min-height: 0;
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
