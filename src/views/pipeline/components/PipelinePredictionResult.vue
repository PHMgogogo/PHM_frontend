<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download } from '@element-plus/icons-vue'
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
import { formatTimestamp } from '@/utils/timeseries'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

interface PredictionMeta {
  mode?: string
  aircraft_number?: string
  sortie_number?: string
  data_cols?: string[]
  label_cols?: string[]
  prediction_cols?: string[]
  timestamps?: number[]
  warnings?: string[]
  inference?: {
    instance_id?: string
    loss?: number
    row_count?: number
  }
}

const props = defineProps<{
  result: {
    data: Record<string, any[]>
    meta?: PredictionMeta
  }
}>()

type ViewMode = 'table' | 'chart'

const viewMode = ref<ViewMode>('table')
const page = ref(1)
const pageSize = ref(50)

const labelCols = computed(() => props.result.meta?.label_cols ?? [])
const predictionCols = computed(() => {
  const configured = props.result.meta?.prediction_cols ?? []
  if (configured.length) return configured
  return Object.keys(props.result.data ?? {}).filter((key) => key.startsWith('预测_'))
})
const timestamps = computed(() => props.result.meta?.timestamps ?? [])

const rowCount = computed(() => {
  const arrays = [
    ...labelCols.value.map((name) => props.result.data?.[name] ?? []),
    ...predictionCols.value.map((name) => props.result.data?.[name] ?? []),
  ]
  return Math.max(timestamps.value.length, ...arrays.map((values) => values.length), 0)
})

const rows = computed(() => {
  const list: Record<string, any>[] = []
  for (let index = 0; index < rowCount.value; index += 1) {
    const row: Record<string, any> = {
      index,
      time: formatTimestamp(timestamps.value[index]),
    }
    labelCols.value.forEach((name, columnIndex) => {
      row[`label_${columnIndex}`] = props.result.data?.[name]?.[index] ?? null
    })
    predictionCols.value.forEach((name, columnIndex) => {
      row[`prediction_${columnIndex}`] = props.result.data?.[name]?.[index] ?? null
    })
    list.push(row)
  }
  return list
})

watch(() => props.result, () => {
  page.value = 1
  viewMode.value = 'table'
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

const sampledIndices = computed(() => {
  const count = rowCount.value
  const maxPoints = 1000
  if (count <= maxPoints) return Array.from({ length: count }, (_, index) => index)
  const step = count / maxPoints
  const indices: number[] = []
  for (let index = 0; index < count; index += step) indices.push(Math.floor(index))
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1)
  return indices
})

const COLORS = ['#1a6cf0', '#36c4a0', '#f5a623', '#f56c6c', '#8b5cf6', '#14b8a6']

const chartOption = computed(() => {
  const indices = sampledIndices.value
  const xData = indices.map((index) => {
    const time = formatTimestamp(timestamps.value[index])
    return time || String(index)
  })
  const series = [
    ...labelCols.value.map((name, columnIndex) => ({
      name: `实际 ${name}`,
      type: 'line',
      smooth: false,
      symbol: 'none',
      animation: false,
      lineStyle: {
        width: 1.5,
        type: 'dashed',
        color: COLORS[columnIndex % COLORS.length],
      },
      itemStyle: { color: COLORS[columnIndex % COLORS.length] },
      data: indices.map((index) => props.result.data?.[name]?.[index] ?? null),
    })),
    ...predictionCols.value.map((name, columnIndex) => ({
      name: name,
      type: 'line',
      smooth: false,
      symbol: 'none',
      animation: false,
      lineStyle: {
        width: 2,
        color: COLORS[(columnIndex + labelCols.value.length) % COLORS.length],
      },
      itemStyle: { color: COLORS[(columnIndex + labelCols.value.length) % COLORS.length] },
      data: indices.map((index) => props.result.data?.[name]?.[index] ?? null),
    })),
  ]

  return {
    animation: false,
    color: COLORS,
    tooltip: { trigger: 'axis' },
    legend: {
      type: 'scroll',
      bottom: 0,
      data: series.map((item) => item.name),
    },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', height: 20, bottom: 28 },
    ],
    grid: { left: 55, right: 24, top: 24, bottom: 82, containLabel: true },
    xAxis: {
      type: 'category',
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

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv() {
  const header = [
    '行号',
    '时间',
    ...labelCols.value.map((name) => `实际_${name}`),
    ...predictionCols.value.map((name) => name.startsWith('预测_') ? name : `预测_${name}`),
  ]
  const content = [header.map(csvCell).join(',')]
  for (const row of rows.value) {
    content.push(
      [
        row.index,
        row.time,
        ...labelCols.value.map((_name, index) => row[`label_${index}`]),
        ...predictionCols.value.map((_name, index) => row[`prediction_${index}`]),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  const blob = new Blob([`\uFEFF${content.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const meta = props.result.meta
  anchor.href = url
  anchor.download = `${meta?.aircraft_number || 'aircraft'}_${meta?.sortie_number || 'sortie'}_预测结果.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="prediction-result">
    <div class="prediction-toolbar">
      <div class="prediction-summary">
        <span>共 {{ rowCount }} 条预测结果</span>
        <span v-if="result.meta?.inference?.instance_id" class="muted">
          实例 {{ result.meta.inference.instance_id }}
        </span>
        <span v-if="result.meta?.inference?.loss != null" class="muted">
          Loss {{ Number(result.meta.inference.loss).toFixed(6) }}
        </span>
      </div>
      <div class="prediction-actions">
        <el-button-group>
          <el-button :type="viewMode === 'table' ? 'primary' : 'default'" @click="viewMode = 'table'">
            表格
          </el-button>
          <el-button :type="viewMode === 'chart' ? 'primary' : 'default'" @click="viewMode = 'chart'">
            曲线
          </el-button>
        </el-button-group>
        <el-button :icon="Download" @click="downloadCsv">下载 CSV</el-button>
      </div>
    </div>

    <el-alert
      v-for="warning in result.meta?.warnings ?? []"
      :key="warning"
      type="warning"
      :title="warning"
      :closable="false"
      show-icon
      class="prediction-warning"
    />

    <div v-show="viewMode === 'table'" class="prediction-table">
      <el-table :data="pagedRows" size="small" border stripe>
        <el-table-column prop="index" label="行号" width="80" />
        <el-table-column prop="time" label="时间" min-width="170" />
        <el-table-column
          v-for="(name, index) in labelCols"
          :key="`label-${name}`"
          :prop="`label_${index}`"
          :label="`实际 ${name}`"
          min-width="130"
        />
        <el-table-column
          v-for="(name, index) in predictionCols"
          :key="`prediction-${name}`"
          :prop="`prediction_${index}`"
          :label="name"
          min-width="130"
        />
      </el-table>
      <el-pagination
        v-if="rowCount > pageSize"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        class="prediction-pagination"
        background
        layout="total, sizes, prev, pager, next"
        :page-sizes="[25, 50, 100, 200]"
        :total="rowCount"
      />
    </div>

    <div v-show="viewMode === 'chart'" class="prediction-chart">
      <VChart :option="chartOption" autoresize />
    </div>
  </div>
</template>

<style scoped>
.prediction-result {
  min-height: 0;
}

.prediction-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.prediction-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #0d1f3c;
  font-size: 13px;
  font-weight: 600;
}

.prediction-summary .muted {
  color: #7a8799;
  font-weight: 400;
}

.prediction-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.prediction-warning {
  margin-bottom: 10px;
}

.prediction-table {
  min-height: 0;
}

.prediction-pagination {
  margin-top: 10px;
  justify-content: flex-end;
}

.prediction-chart {
  height: 360px;
}
</style>
