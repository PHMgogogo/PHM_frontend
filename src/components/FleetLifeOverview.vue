<template>
  <div class="fleet-life-page">
    <div class="panel-header">
      <div>
        <h3>机群寿命分布</h3>
        <p>单机整体寿命按全部 EQUIPMENT 的剩余寿命之和 / 初始寿命之和计算。</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="loadOverview">刷新</el-button>
    </div>

    <el-alert
      v-if="error"
      class="panel-error"
      type="error"
      :closable="false"
      show-icon
      :title="error"
    />

    <div v-loading="loading" class="panel-body">
      <el-empty
        v-if="!loading && !error && !overview?.aircraft.length"
        description="当前筛选条件下暂无单机构型寿命数据"
        :image-size="90"
      />

      <template v-else-if="overview">
        <section class="summary-grid">
          <div class="summary-cell">
            <span>单机数量</span>
            <strong>{{ overview.summary.aircraftCount }}</strong>
            <small>纳入统计的本地单机</small>
          </div>
          <div class="summary-cell">
            <span>机群整体剩余</span>
            <strong>{{ formatPercent(overview.summary.remainingRatio) }}</strong>
            <small>全部设备加权平均</small>
          </div>
          <div class="summary-cell">
            <span>设备寿命实例</span>
            <strong>{{ overview.summary.equipmentCount }}</strong>
            <small>参与汇总的 EQUIPMENT</small>
          </div>
          <div class="summary-cell">
            <span>需关注单机</span>
            <strong>
              {{ overview.summary.warningAircraftCount + overview.summary.criticalAircraftCount }}
            </strong>
            <small>
              关注 {{ overview.summary.warningAircraftCount }} /
              临界 {{ overview.summary.criticalAircraftCount }}
            </small>
          </div>
        </section>

        <section class="chart-grid">
          <div class="chart-panel">
            <div class="chart-heading">
              <h4>单机寿命状态分布</h4>
              <span>按单机加权剩余比例分组</span>
            </div>
            <VChart class="chart" :option="pieOption" autoresize />
          </div>

          <div class="chart-panel">
            <div class="chart-heading">
              <h4>单机整体寿命排行</h4>
              <span>柱高为加权平均剩余比例</span>
            </div>
            <VChart class="chart" :option="barOption" autoresize />
          </div>
        </section>

        <section class="detail-section">
          <div class="chart-heading">
            <h4>单机整体寿命明细</h4>
            <span>按整体剩余比例从低到高排序</span>
          </div>
          <el-table :data="overview.aircraft" border size="small">
            <el-table-column prop="aircraftNumber" label="机号" width="150" />
            <el-table-column prop="modelCode" label="机型" width="150" />
            <el-table-column label="设备数" width="90" align="center">
              <template #default="{ row }">{{ row.equipmentCount }}</template>
            </el-table-column>
            <el-table-column label="初始寿命" width="120" align="right">
              <template #default="{ row }">{{ formatHours(row.initialLifeHours) }} 小时</template>
            </el-table-column>
            <el-table-column label="已用寿命" width="120" align="right">
              <template #default="{ row }">{{ formatHours(row.usedLifeHours) }} 小时</template>
            </el-table-column>
            <el-table-column label="剩余寿命" width="120" align="right">
              <template #default="{ row }">
                <strong class="remaining-value">{{ formatHours(row.remainingLifeHours) }} 小时</strong>
              </template>
            </el-table-column>
            <el-table-column label="整体剩余比例" min-width="190">
              <template #default="{ row }">
                <div v-if="row.status === 'missing'" class="missing-text">未配置寿命实例</div>
                <el-progress
                  v-else
                  :percentage="Math.round(row.remainingRatio * 100)"
                  :stroke-width="9"
                  :color="statusColor(row.status)"
                />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" effect="plain" size="small">
                  {{ statusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getFleetLifeOverview } from '@/api/aircraft'
import { baseModelCode } from '@/utils/aircraft-source'
import type { FleetLifeOverview, FleetLifeStatus } from '@/types/entities'

use([PieChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  modelCode?: string
}>()

const overview = ref<FleetLifeOverview | null>(null)
const loading = ref(false)
const error = ref('')
let requestSequence = 0

const statusText: Record<FleetLifeStatus, string> = {
  normal: '正常',
  warning: '关注',
  critical: '临界',
  missing: '未配置',
}

const statusColors: Record<FleetLifeStatus, string> = {
  normal: '#23806f',
  warning: '#d97706',
  critical: '#c2413a',
  missing: '#8a9795',
}

const pieOption = computed(() => {
  const summary = overview.value?.summary
  const pieData = [
    { name: '正常', value: summary?.normalAircraftCount ?? 0 },
    { name: '关注', value: summary?.warningAircraftCount ?? 0 },
    { name: '临界', value: summary?.criticalAircraftCount ?? 0 },
    { name: '未配置', value: summary?.missingAircraftCount ?? 0 },
  ].filter((item) => item.value > 0)
  return {
    animation: false,
    color: [
      statusColors.normal,
      statusColors.warning,
      statusColors.critical,
      statusColors.missing,
    ],
    tooltip: { trigger: 'item', formatter: '{b}: {c} 架 ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#64748b' } },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '44%'],
        label: { formatter: '{b}\n{c} 架' },
        data: pieData,
      },
    ],
  }
})

const barOption = computed(() => {
  const aircraft = overview.value?.aircraft ?? []
  return {
    animation: false,
    grid: { left: 48, right: 24, top: 24, bottom: 64 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params
        const item = aircraft[first?.dataIndex ?? 0]
        if (!item) return ''
        return [
          `<strong>${item.aircraftNumber}</strong>`,
          `机型：${item.modelCode}`,
          `设备数量：${item.equipmentCount}`,
          `初始寿命：${formatHours(item.initialLifeHours)} 小时`,
          `已用寿命：${formatHours(item.usedLifeHours)} 小时`,
          `剩余寿命：${formatHours(item.remainingLifeHours)} 小时`,
          `整体剩余：${formatPercent(item.remainingRatio)}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'category',
      data: aircraft.map((item) => item.aircraftNumber),
      axisLabel: { color: '#64748b', rotate: aircraft.length > 8 ? 35 : 0 },
      axisLine: { lineStyle: { color: '#dbe3ea' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%', color: '#64748b' },
      splitLine: { lineStyle: { color: '#edf1f4' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 46,
        data: aircraft.map((item) => ({
          value: Math.round(item.remainingRatio * 100),
          itemStyle: { color: statusColor(item.status) },
        })),
        label: {
          show: true,
          position: 'top',
          formatter: '{c}%',
          color: '#475569',
          fontSize: 11,
        },
      },
    ],
  }
})

async function loadOverview() {
  const sequence = ++requestSequence
  loading.value = true
  error.value = ''
  try {
    const code = props.modelCode ? baseModelCode(props.modelCode) : undefined
    const result = await getFleetLifeOverview(code)
    if (sequence !== requestSequence) return
    overview.value = result
  } catch (e) {
    if (sequence !== requestSequence) return
    overview.value = null
    error.value = `加载机群寿命分布失败：${(e as Error).message}`
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function statusColor(status: FleetLifeStatus) {
  return statusColors[status]
}

function statusLabel(status: FleetLifeStatus) {
  return statusText[status]
}

function statusTagType(
  status: FleetLifeStatus,
): 'success' | 'warning' | 'danger' | 'info' {
  const types: Record<FleetLifeStatus, 'success' | 'warning' | 'danger' | 'info'> = {
    normal: 'success',
    warning: 'warning',
    critical: 'danger',
    missing: 'info',
  }
  return types[status]
}

function formatPercent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function formatHours(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('zh-CN')
}

watch(
  () => props.modelCode,
  loadOverview,
)

onMounted(loadOverview)
</script>

<style scoped>
.fleet-life-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px 12px;
}

.panel-header h3 {
  margin: 0;
  color: var(--phm-text);
  font-size: 16px;
  font-weight: 700;
}

.panel-header p {
  margin: 5px 0 0;
  color: var(--phm-text-secondary);
  font-size: 12px;
}

.panel-error {
  margin: 0 22px 12px;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 22px 22px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--phm-border);
  border-radius: 8px;
  background: var(--phm-surface);
}

.summary-cell span {
  color: var(--phm-text-secondary);
  font-size: 12px;
}

.summary-cell strong {
  color: var(--phm-text);
  font-size: 23px;
  line-height: 1.2;
}

.summary-cell small {
  color: var(--phm-text-muted);
  font-size: 11px;
}

.chart-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(420px, 1.5fr);
  gap: 12px;
  margin-top: 12px;
}

.chart-panel,
.detail-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--phm-border);
  border-radius: 8px;
  background: var(--phm-surface);
}

.chart-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.chart-heading h4 {
  margin: 0;
  color: var(--phm-text);
  font-size: 14px;
}

.chart-heading span {
  color: var(--phm-text-muted);
  font-size: 11px;
}

.chart {
  width: 100%;
  height: 320px;
}

.detail-section {
  margin-top: 12px;
}

.remaining-value {
  color: var(--phm-primary-700);
}

.missing-text {
  color: var(--phm-text-muted);
  font-size: 12px;
}

@media (max-width: 1050px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .panel-header {
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .panel-header,
  .panel-body {
    padding-right: 14px;
    padding-left: 14px;
  }
}
</style>
