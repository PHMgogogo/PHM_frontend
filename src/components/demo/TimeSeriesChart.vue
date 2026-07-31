<template>
  <div class="chart-wrap" :style="{ height: height }">
    <v-chart :option="chartOption" autoresize />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, DataZoomComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer])

const props = defineProps({
  seriesData: { type: Object, default: () => ({}) }, // { paramName: [{t, v}] }
  limits: { type: Object, default: () => ({}) },     // { paramName: limitVal }
  xLabel: { type: String, default: '时间(s)' },
  height: { type: String, default: '300px' },
  multiMode: { type: Boolean, default: false },
})

const COLORS = ['#3b7cff', '#36c4a0', '#f5a623', '#f56c6c', '#b37feb', '#36cfc9']

const chartOption = computed(() => {
  const names = Object.keys(props.seriesData)
  const series = names.map((name, idx) => {
    const data = props.seriesData[name] || []
    const limit = props.limits[name]
    return {
      name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color: COLORS[idx % COLORS.length] },
      data: data.map((d: any) => d.v ?? d.value),
      markLine: limit != null ? {
        silent: true,
        data: [{ yAxis: limit, name: '限制值', lineStyle: { color: '#f56c6c', type: 'dashed', width: 1 } }],
        label: { formatter: `限制 ${limit}`, color: '#f56c6c', fontSize: 11 },
      } : undefined,
    }
  })

  const xData = names.length > 0
    ? (props.seriesData[names[0]] || []).map((d: any, i: number) => d.t ?? d.sortie ?? i)
    : []

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e4e8f1', textStyle: { color: '#333' } },
    legend: {
      data: names,
      textStyle: { color: '#8c9ab0' },
      top: 4,
    },
    grid: { left: 50, right: 20, top: 36, bottom: 40 },
    xAxis: {
      type: 'category',
      data: xData,
      name: props.xLabel,
      nameTextStyle: { color: '#8c9ab0' },
      axisLine: { lineStyle: { color: '#dde3ef' } },
      axisLabel: { color: '#8c9ab0', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#dde3ef' } },
      splitLine: { lineStyle: { color: '#e4e8f1' } },
      axisLabel: { color: '#8c9ab0', fontSize: 11 },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 20, bottom: 0, handleStyle: { color: '#3b7cff' }, textStyle: { color: '#8c9ab0' } },
    ],
    series,
  }
})
</script>

<style scoped>
.chart-wrap {
  width: 100%;
}
</style>
