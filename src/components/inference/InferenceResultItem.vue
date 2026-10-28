<template>
  <div class="result-item">
    <div class="result-item-head">
      <div class="result-title">
        <span class="epoch">Epoch {{ index + 1 }}</span>
        <span v-if="result.loss != null" class="loss">Loss: {{ Number(result.loss).toFixed(6) }}</span>
      </div>
      <el-button-group size="small">
        <el-button :type="viewMode === 'table' ? 'primary' : 'default'" @click="viewMode = 'table'">
          表格
        </el-button>
        <el-button :type="viewMode === 'chart' ? 'primary' : 'default'" @click="viewMode = 'chart'">
          图表
        </el-button>
      </el-button-group>
    </div>

    <div v-if="result.description" class="result-description">{{ result.description }}</div>

    <div v-if="!hasRows" class="result-empty">该结果没有可展示的预测数据</div>

    <template v-else>
      <div v-show="viewMode === 'table'" class="table-view">
        <el-table :data="pageRows" height="360" border size="small">
          <el-table-column prop="__id" label="#" width="80" />
          <el-table-column
            v-for="(name, outputIndex) in outputNames"
            :key="`${name}-${outputIndex}`"
            :prop="`v${outputIndex}`"
            :label="name"
            min-width="130"
          />
        </el-table>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          class="result-pagination"
          background
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 25, 50, 100]"
          :total="rows.length"
        />
      </div>

      <div v-show="viewMode === 'chart'" class="chart-view">
        <VChart class="result-chart" :option="chartOption" autoresize />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ModelResult } from '@/types/entities'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps<{
  result: ModelResult
  index: number
}>()

const COLORS = ['#3b7cff', '#36c4a0', '#f5a623', '#f56c6c', '#b37feb', '#36cfc9']
const MAX_CHART_POINTS = 1000

const viewMode = ref<'table' | 'chart'>('table')
const currentPage = ref(1)
const pageSize = ref(50)

const rowIds = computed(() => {
  const ids = props.result.ids || []
  if (ids.length) return ids
  return (props.result.outputs || []).map((_, index) => index)
})

const outputNames = computed(() => {
  const outputCount = props.result.outputs?.[0]?.length ?? 0
  const columns = props.result.columns || []
  if (columns.length === outputCount && outputCount > 0) return columns
  return Array.from({ length: outputCount }, (_, index) => `预测_${index}`)
})

const hasRows = computed(() => rowIds.value.length > 0 && outputNames.value.length > 0)

const rows = computed(() => {
  const outputs = props.result.outputs || []
  return rowIds.value.map((id, rowIndex) => {
    const row: Record<string, number | null> = { __id: id }
    const values = outputs[rowIndex] || []
    outputNames.value.forEach((_, outputIndex) => {
      row[`v${outputIndex}`] = values[outputIndex] ?? null
    })
    return row
  })
})

const pageRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

const sampledIndices = computed(() => {
  const count = rowIds.value.length
  if (count <= MAX_CHART_POINTS) return rowIds.value.map((_, index) => index)

  const step = count / MAX_CHART_POINTS
  const indices: number[] = []
  for (let index = 0; index < count; index += step) indices.push(Math.floor(index))
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1)
  return indices
})

const chartOption = computed(() => {
  const indices = sampledIndices.value
  const outputs = props.result.outputs || []
  const xData = indices.map((index) => rowIds.value[index])

  const series = outputNames.value.map((name, outputIndex) => ({
    name,
    type: 'line',
    smooth: false,
    symbol: 'none',
    animation: false,
    lineStyle: { width: 2, color: COLORS[outputIndex % COLORS.length] },
    itemStyle: { color: COLORS[outputIndex % COLORS.length] },
    data: indices.map((rowIndex) => outputs[rowIndex]?.[outputIndex] ?? null),
  }))

  return {
    animation: false,
    color: COLORS,
    tooltip: { trigger: 'axis' },
    legend: {
      type: 'scroll',
      data: outputNames.value,
      bottom: 0,
      textStyle: { color: '#5a6b85' },
    },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', height: 20, bottom: 28 },
    ],
    grid: { left: 55, right: 24, top: 24, bottom: 82, containLabel: true },
    xAxis: {
      type: 'category',
      name: '行号',
      data: xData,
      axisLabel: { fontSize: 10, color: '#8c9ab0' },
      axisLine: { lineStyle: { color: '#dde3ef' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#8c9ab0' },
      splitLine: { lineStyle: { color: '#e4e8f1' } },
    },
    series,
  }
})

watch(
  () => props.result,
  () => {
    currentPage.value = 1
    viewMode.value = 'table'
  },
)
</script>

<style scoped>
.result-item {
  border: 1px solid #dbe5f3;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.result-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: #f5f8fd;
  border-bottom: 1px solid #e5ebf5;
}

.result-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.epoch {
  color: #1a6cf0;
  font-weight: 600;
}

.loss {
  color: #d46b08;
  font-weight: 600;
}

.result-description {
  padding: 10px 14px 0;
  color: #6a7a90;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.result-empty {
  padding: 18px 14px;
  color: #8c9ab0;
  font-size: 13px;
}

.table-view,
.chart-view {
  padding: 12px 14px 14px;
}

.result-pagination {
  margin-top: 10px;
  justify-content: flex-end;
}

.result-chart {
  width: 100%;
  height: 420px;
}
</style>
