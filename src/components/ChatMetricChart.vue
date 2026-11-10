<template>
  <section class="metric-chart-card">
    <div class="chart-heading">
      <div>
        <strong>{{ payload.chart.title }}</strong>
        <span>
          {{ payload.chart.metric }} 区间
          {{ payload.chart.range.min }} ~ {{ payload.chart.range.max }}
          {{ payload.chart.unit || '' }}
        </span>
      </div>
      <el-tag type="success" effect="plain">{{ payload.chart.series.length }} 个架次</el-tag>
    </div>

    <div v-if="payload.summary" class="summary-row">
      <span>命中架次 <strong>{{ payload.summary.matchedSortieCount }}</strong></span>
      <span>区间内点 <strong>{{ payload.summary.inRangePoints }}</strong></span>
      <span>区间外点 <strong>{{ payload.summary.outOfRangePoints }}</strong></span>
      <span>
        范围
        <strong>{{ payload.summary.minimum }} ~ {{ payload.summary.maximum }}</strong>
      </span>
      <span>平均 <strong>{{ payload.summary.average }}</strong></span>
    </div>

    <VChart class="metric-chart" :option="chartOption" autoresize />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { MetricRangeChartPayload } from '@/types/chat-chart'

use([LineChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  payload: MetricRangeChartPayload
}>()

const COLORS = ['#17685a', '#2f6fdd', '#d97706', '#c2413a', '#0f8b8d', '#7c5cbf']

const chartOption = computed(() => {
  const chart = props.payload.chart
  const outsidePoints = chart.series.flatMap((series) =>
    series.points
      .filter((point) => point[2] !== 1)
      .map((point) => [point[0], point[1]]),
  )
  const lineSeries = chart.series.map((series, index) => ({
    name: series.name,
    type: 'line',
    showSymbol: false,
    smooth: false,
    animation: false,
    lineStyle: { width: 1.8, color: COLORS[index % COLORS.length] },
    itemStyle: { color: COLORS[index % COLORS.length] },
    data: series.points.map((point) => [point[0], point[1]]),
    markArea:
      index === 0
        ? {
            silent: true,
            itemStyle: { color: 'rgba(35, 128, 111, 0.09)' },
            data: [[{ yAxis: chart.range.min }, { yAxis: chart.range.max }]],
          }
        : undefined,
  }))

  return {
    animation: false,
    color: COLORS,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? `${value}${chart.unit || ''}` : String(value ?? ''),
    },
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: { color: '#5f7088', fontSize: 11 },
    },
    grid: { left: 58, right: 24, top: 44, bottom: 48, containLabel: true },
    xAxis: {
      type: 'value',
      name: chart.xAxisName,
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel: { color: '#7f8c9f' },
      splitLine: { lineStyle: { color: '#edf1f5' } },
    },
    yAxis: {
      type: 'value',
      name: chart.yAxisName,
      axisLabel: { color: '#7f8c9f' },
      splitLine: { lineStyle: { color: '#edf1f5' } },
    },
    series: [
      ...lineSeries,
      {
        name: '区间外点',
        type: 'scatter',
        symbolSize: 5,
        animation: false,
        itemStyle: { color: '#c2413a', opacity: 0.75 },
        data: outsidePoints,
      },
    ],
  }
})
</script>

<style scoped>
.metric-chart-card {
  margin-top: 10px;
  border: 1px solid #dce7e3;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
}

.chart-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chart-heading > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.chart-heading strong {
  color: #1d2b2a;
  font-size: 13px;
}

.chart-heading span {
  color: #7f8c9f;
  font-size: 11px;
}

.summary-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 9px;
  color: #718096;
  font-size: 11px;
}

.summary-row strong {
  color: #17685a;
}

.metric-chart {
  width: 100%;
  height: 360px;
}

@media (max-width: 760px) {
  .metric-chart {
    height: 300px;
  }
}
</style>
