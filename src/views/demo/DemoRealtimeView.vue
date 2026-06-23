<template>
  <div class="demo-realtime">
    <h2 class="page-title">实时监控</h2>

    <!-- 顶部工具栏 -->
    <div class="toolbar" style="margin-bottom: 16px; display: flex; align-items: center; gap: 16px;">
      <PlaneSelector />
      <el-divider direction="vertical" />
      <span style="font-size: 13px; color: #8c9ab0;">推送频率：</span>
      <el-select v-model="pushInterval" size="small" style="width: 100px" @change="resetTimer">
        <el-option :value="2000" label="2秒" />
        <el-option :value="5000" label="5秒" />
        <el-option :value="10000" label="10秒" />
      </el-select>
      <el-tag :type="isLive ? 'success' : 'info'" effect="dark" size="small">
        {{ isLive ? '● 数据推送中' : '○ 已暂停' }}
      </el-tag>
      <el-button :type="isLive ? 'warning' : 'primary'" size="small" @click="toggleLive">
        {{ isLive ? '暂停' : '恢复' }}
      </el-button>
    </div>

    <el-row :gutter="16">
      <!-- 左侧：关键参数仪表盘 -->
      <el-col :span="14">
        <el-card class="panel">
          <template #header>
            <span class="section-title">
              <el-icon><Odometer /></el-icon> 关键参数监控看板
            </span>
          </template>
          <el-row :gutter="12">
            <el-col :span="8" v-for="param in paramCards" :key="param.key" style="margin-bottom: 12px">
              <div class="param-card" :class="param.status">
                <div class="param-label">{{ param.label }}</div>
                <div class="param-value">{{ currentParams[param.key] ?? '—' }}<span class="param-unit">{{ param.unit }}</span></div>
                <el-progress
                  :percentage="param.percent(currentParams[param.key])"
                  :color="progressColor(param.status)"
                  :stroke-width="4"
                  :show-text="false"
                  style="margin-top: 6px"
                />
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <!-- 右侧：系统告警看板 -->
      <el-col :span="10">
        <el-card class="panel">
          <template #header>
            <span class="section-title">
              <el-icon><Warning /></el-icon> 故障告警看板
            </span>
          </template>
          <div class="alarm-systems">
            <div
              v-for="sys in alarmSystems"
              :key="sys.key"
              class="alarm-system-row"
              :class="{ 'has-fault': sys.fault > 0, 'has-warning': sys.fault === 0 && sys.warning > 0 }"
            >
              <span class="sys-name">{{ sys.name }}</span>
              <div class="sys-indicators">
                <el-tag type="success" size="small" effect="dark">正常 {{ sys.normal }}</el-tag>
                <el-tag v-if="sys.warning" type="warning" size="small" effect="dark">告警 {{ sys.warning }}</el-tag>
                <el-tag v-if="sys.fault" type="danger" size="small" effect="dark">故障 {{ sys.fault }}</el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 告警消息列表 -->
    <el-card class="panel" style="margin-top: 16px">
      <template #header>
        <div class="section-header">
          <span class="section-title"><el-icon><BellFilled /></el-icon> 当前告警消息</span>
          <el-radio-group v-model="alarmFilter" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="fault">故障</el-radio-button>
            <el-radio-button value="warning">告警</el-radio-button>
            <el-radio-button value="info">提示</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="filteredAlarms" size="small" style="width: 100%">
        <el-table-column label="级别" width="80">
          <template #default="{ row }">
            <el-tag :type="alarmType(row.level)" size="small" effect="dark">
              {{ alarmLabel(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="system" label="系统" width="120" />
        <el-table-column prop="code" label="告警码" width="140" />
        <el-table-column prop="message" label="告警信息" />
        <el-table-column prop="time" label="时间" width="160" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.acknowledged ? 'info' : 'danger'" size="small">
              {{ row.acknowledged ? '已确认' : '未确认' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button v-if="!row.acknowledged" type="primary" size="small" text @click="row.acknowledged = true">确认</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 机载健康管理诊断结果 -->
    <el-card class="panel" style="margin-top: 16px">
      <template #header>
        <span class="section-title"><el-icon><DataAnalysis /></el-icon> 机载健康管理诊断结果</span>
      </template>
      <div v-if="onboardHM" class="onboard-hm">
        <el-alert
          :title="onboardHM.status"
          :description="onboardHM.description"
          :type="hmAlertType(onboardHM.status)"
          :closable="false"
          show-icon
          style="margin-bottom: 8px"
        />
        <span style="font-size: 12px; color: #8c9ab0;">最后更新：{{ onboardHM.time }}</span>
      </div>
      <el-empty v-else description="暂无诊断结果" :image-size="60" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDemoAppStore } from '@/stores/demoAppStore'
import PlaneSelector from '@/components/demo/PlaneSelector.vue'
import { realtimeParams, alarmData, alarmSystems, onboardHMData } from '@/mock/demo/realtime'

const store = useDemoAppStore()
const isLive = ref(true)
const pushInterval = ref(2000)
const alarmFilter = ref('all')
let timer: ReturnType<typeof setInterval> | null = null

const paramCards = [
  { key: 'fuel',               label: '燃油量',    unit: '%',      status: 'normal', percent: (v: number) => v ?? 0 },
  { key: 'throttle',           label: '油门',      unit: '%',      status: 'normal', percent: (v: number) => v ?? 0 },
  { key: 'airspeed',           label: '空速',      unit: 'km/h',   status: 'normal', percent: (v: number) => Math.min((v ?? 0) / 1200 * 100, 100) },
  { key: 'altitude',           label: '高度',      unit: 'm',      status: 'normal', percent: (v: number) => Math.min((v ?? 0) / 15000 * 100, 100) },
  { key: 'heading',            label: '航向角',    unit: '°',      status: 'normal', percent: (v: number) => ((v ?? 0) / 360 * 100) },
  { key: 'pitch',              label: '俯仰角',    unit: '°',      status: 'normal', percent: (v: number) => Math.min(Math.abs(v ?? 0) / 45 * 100, 100) },
  { key: 'engineRpm',          label: '发动机转速', unit: '%',     status: 'normal', percent: (v: number) => v ?? 0 },
  { key: 'oilTemp',            label: '滑油温度',   unit: '℃',    status: 'normal', percent: (v: number) => Math.min((v ?? 0) / 180 * 100, 100) },
  { key: 'hydraulicPressure2', label: '2号液压',   unit: 'MPa',    status: 'warning', percent: (v: number) => Math.min((v ?? 0) / 25 * 100, 100) },
  { key: 'voltage',            label: '供电电压',   unit: 'V',     status: 'normal', percent: (v: number) => Math.min((v ?? 0) / 32 * 100, 100) },
]

const liveParams = ref({ ...((realtimeParams as any)['P001'] || {}) })

const currentParams = computed(() => liveParams.value)

function randomize(params: any) {
  const jitter = (v: number, range: number) => +(v + (Math.random() - 0.5) * range).toFixed(1)
  return {
    ...params,
    fuel: jitter(params.fuel, 0.2),
    throttle: jitter(params.throttle, 0.5),
    airspeed: jitter(params.airspeed, 5),
    altitude: jitter(params.altitude, 20),
    engineRpm: jitter(params.engineRpm, 0.3),
    oilTemp: jitter(params.oilTemp, 1),
    hydraulicPressure2: jitter(params.hydraulicPressure2, 0.2),
    voltage: jitter(params.voltage, 0.1),
    lastUpdate: new Date().toISOString(),
  }
}

function refreshParams() {
  const base = (realtimeParams as any)[store.selectedPlaneId] || (realtimeParams as any)['P001']
  if (base) liveParams.value = randomize(base)
}

function resetTimer() {
  if (timer) clearInterval(timer)
  if (isLive.value) timer = setInterval(refreshParams, pushInterval.value)
}

function toggleLive() {
  isLive.value = !isLive.value
  resetTimer()
}

const filteredAlarms = computed(() => {
  if (alarmFilter.value === 'all') return alarmData
  return alarmData.filter((a: any) => a.level === alarmFilter.value)
})

const onboardHM = computed(() => (onboardHMData as any)[store.selectedPlaneId] || null)

function alarmType(level: string) {
  return level === 'fault' ? 'danger' : level === 'warning' ? 'warning' : 'info'
}
function alarmLabel(level: string) {
  return level === 'fault' ? '故障' : level === 'warning' ? '告警' : '提示'
}
function hmAlertType(status: string) {
  return status === '正常' ? 'success' : status === '注意' ? 'warning' : 'error'
}
function progressColor(status: string) {
  return status === 'warning' ? '#faad14' : status === 'fault' ? '#ff4d4f' : '#3b7cff'
}

watch(() => store.selectedPlaneId, refreshParams)
onMounted(() => { refreshParams(); resetTimer() })
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.demo-realtime {
  padding: 0 32px 32px;
  overflow-y: auto;
  height: 100%;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 24px 0 16px;
}

.toolbar {
  padding: 10px 16px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e4e8f1;
}

.panel {
  margin-bottom: 0;
}

.param-card {
  background: #f9fafb;
  border: 1px solid #e4e8f1;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  transition: border-color 0.3s;
}

.param-card.warning {
  border-color: #faad14;
  background: rgba(250, 173, 20, 0.05);
}

.param-card.fault {
  border-color: #ff4d4f;
  background: rgba(255, 77, 79, 0.05);
}

.param-label {
  font-size: 11px;
  color: #8c9ab0;
  margin-bottom: 4px;
}

.param-value {
  font-size: 22px;
  font-weight: 700;
  color: #3b7cff;
  font-family: monospace;
}

.param-unit {
  font-size: 11px;
  color: #8c9ab0;
  margin-left: 3px;
}

.alarm-systems {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.alarm-system-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  background: #f9fafb;
  border-left: 3px solid #e4e8f1;
}

.alarm-system-row.has-fault {
  border-left-color: #ff4d4f;
  background: rgba(255, 77, 79, 0.04);
}

.alarm-system-row.has-warning {
  border-left-color: #faad14;
  background: rgba(250, 173, 20, 0.04);
}

.sys-name {
  font-size: 13px;
  color: #0d1f3c;
  min-width: 100px;
}

.sys-indicators {
  display: flex;
  gap: 6px;
}

.onboard-hm {
  padding: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
