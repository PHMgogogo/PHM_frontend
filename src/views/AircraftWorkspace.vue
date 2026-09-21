<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getSorties } from '@/api/aircraft'
import { useAircraftStore } from '@/stores/aircraft'
import { isExternalAircraft, baseModelCode } from '@/utils/aircraft-source'
import { useChatStore } from '@/stores/chat'
import { useConfigItemStore } from '@/stores/configItem'
import { useTaskStore } from '@/stores/task'
import WorkspaceSidebar from '@/components/WorkspaceSidebar.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import TaskPanel from '@/components/TaskPanel.vue'
import DataPanel from '@/components/DataPanel.vue'
import SortieQueryPanel from '@/components/SortieQueryPanel.vue'
import SortieTimeSeriesPanel from '@/components/SortieTimeSeriesPanel.vue'
import type { Sortie } from '@/types/entities'
import DemoRealtimeView from '@/views/demo/DemoRealtimeView.vue'
import DemoDiagnosisView from '@/views/demo/DemoDiagnosisView.vue'
import DemoHealthView from '@/views/demo/DemoHealthView.vue'
import DemoTrendView from '@/views/demo/DemoTrendView.vue'
import DemoPredictionView from '@/views/demo/DemoPredictionView.vue'
import DemoMaintenanceView from '@/views/demo/DemoMaintenanceView.vue'
import PipelineWorkspace from '@/views/pipeline/PipelineWorkspace.vue'
import taskIcon from '@/assets/task.svg'
import dataIcon from '@/assets/data.svg'
import sortieIcon from '@/assets/sortie.svg'
import chatIcon from '@/assets/chat.svg'
import monitorIcon from '@/assets/monitor.svg'
import diagnosisIcon from '@/assets/diagnosis.svg'
import healthIcon from '@/assets/health.svg'
import trendIcon from '@/assets/trend.svg'
import predictionIcon from '@/assets/predict.svg'
import maintenanceIcon from '@/assets/maintenance.svg'
import pipelineIcon from '@/assets/pipeline.svg'

const route = useRoute()
const router = useRouter()
const aircraftStore = useAircraftStore()
const chatStore = useChatStore()
const configItemStore = useConfigItemStore()
const taskStore = useTaskStore()

const aircraftNumber = computed(() => route.params.aircraftNumber as string)

// 单机来自 GET /aircraft/plane（已聚合本地/航新/633）。
// 同一机号可能在多源同时存在（如 20011 本地/航新/633 各一条），取第一条。
const aircraft = computed(() =>
  aircraftStore.aircrafts.find((a) => a.aircraftNumber === aircraftNumber.value),
)

/** 外部平台单机（航新/633）：整台只读。接口不返回 source，按占位符判定 */
const isExternal = computed(() => !!aircraft.value && isExternalAircraft(aircraft.value))

/**
 * 当前飞行器的机型（GET /aircraft/models 下发的原始编码）。
 * 架次查询 / 时序查询 / 时序训练推理的机型参数必填，统一从这里取，
 * 保证「选机型 → 选架次 → 查时序」三步用的是同一个机型值。
 * 三方模型的编码形如 `K4-WS19:1`，后端按该编码路由到唯一平台，不做截断。
 */
const currentModelCode = computed(() => aircraft.value?.modelCode ?? '')

// ---- UI 状态 ----
// 注意：isExternal 依赖异步拉取到的单机数据，挂载时才能确定，故在 onMounted 里校正
const activeMenu = ref('task')
const initializing = ref(true)
const sidebarCollapsed = ref(false)
const allWorkspaceMenus = [
  { key: 'chat', svg: chatIcon, title: '当前对话' },
  { key: 'task', svg: taskIcon, title: '会话管理' },
  { key: 'data', svg: dataIcon, title: '数据管理' },
  { key: 'sortie', svg: sortieIcon, title: '架次查询' },
  // 时序数据查询与架次查询同级：从架次查询点某行跳入，也可从菜单直接进（需先选架次）
  { key: 'timeseries', svg: sortieIcon, title: '时序数据查询' },
  { key: 'pipeline', svg: pipelineIcon, title: '逻辑编排' },
  { key: 'monitor-old', svg: monitorIcon, title: '实时监控' },
  { key: 'diagnosis', svg: diagnosisIcon, title: '增强诊断' },
  { key: 'health', svg: healthIcon, title: '健康评估' },
  { key: 'trend', svg: trendIcon, title: '趋势分析' },
  { key: 'prediction', svg: predictionIcon, title: '故障预测' },
  { key: 'maintenance', svg: maintenanceIcon, title: '维修建议' },
]
// 会话 / 对话是本地产物（算法实例 + OpenCode 会话），与单机来自哪个平台无关，两者都保留。
// 但「数据管理」是本地 CSV 链路（架次 → config_data_mapping → csv_<表名>），三方单机的架次
// 来自三方平台、不存在本地映射，故三方单机不再提供该入口；三方训练 / 推理走「时序数据查询」。
const workspaceMenus = computed(() =>
  isExternal.value ? allWorkspaceMenus.filter((m) => m.key !== 'data') : allWorkspaceMenus,
)

// 菜单随单机来源变化时兜底：三方单机若仍停在被摘掉的「数据管理」，挪回会话管理
watch(isExternal, (external) => {
  if (external && activeMenu.value === 'data') activeMenu.value = 'task'
})

// ---- 初始化指定飞机的任务上下文：拉取列表；有会话则自动选中第一个并进入对话，否则停在会话列表 ----
async function bootstrapFor(id: string) {
  initializing.value = true
  try {
    await taskStore.init(id, aircraft.value?.modelCode ?? '')
  } finally {
    initializing.value = false
  }
  // 自动选中第一个会话。
  const firstTask = taskStore.tasks[0]
  if (firstTask && firstTask.workDir) {
    taskStore.setCurrentTask(firstTask.id)
    activeMenu.value = 'chat'
    await nextTick()
    chatStore.connectToSession(firstTask.sessionId, firstTask.workDir)
  } else {
    activeMenu.value = 'task'
  }
}

onMounted(async () => {
  // 单机与机型：GET /aircraft/plane 现在按机型必填过滤，故先取机型再汇总全部机型的单机，
  // 之后才能按路由里的机号解析出当前飞行器（含外部平台单机）。
  await aircraftStore.fetchModels()
  await aircraftStore.fetchAllAircrafts()
  // 只有本地机型才有本地构型；三方机型编码不在本地构型表里，不去拉
  if (aircraft.value?.modelCode && !isExternal.value) {
    configItemStore.fetchAll(aircraft.value.modelCode)
  }
  await bootstrapFor(aircraftNumber.value)
})

onUnmounted(() => {
  chatStore.dispose()
})

// ---- 飞行器切换时清理并重新初始化（SPA 内导航到其他飞行器） ----
watch(aircraftNumber, async (newVal, oldVal) => {
  if (oldVal && newVal !== oldVal) {
    chatStore.dispose()
    // 架次是「某台飞机的一条记录」，换机必须丢掉，否则会拿上一台的架次去查时序
    selectedSortie.value = null
    if (aircraft.value?.modelCode && !isExternal.value) {
      configItemStore.fetchAll(aircraft.value.modelCode)
    }
    await bootstrapFor(newVal)
  }
})

// ---- 子组件事件处理 ----
function onEnterChat() {
  activeMenu.value = 'chat'
}

function onNavigateToTasks() {
  activeMenu.value = 'task'
}

/**
 * 架次查询点了某行 → 记住架次并切到同级的「时序数据查询」页面。
 * 选中的架次放在工作台而非时序页里：切走再回来能保留上一次的选择。
 */
const selectedSortie = ref<Sortie | null>(null)
/** 从菜单直接进时序页时，正在自动定位该单机的第一条架次 */
const sortieResolving = ref(false)

function onSelectSortie(sortie: Sortie) {
  selectedSortie.value = sortie
  activeMenu.value = 'timeseries'
}

/**
 * 直接进「时序数据查询」时没点过架次：默认取该单机的第一条架次，让页面直接出数据。
 * 先让用户看一条真实的（多半也是最新的）架次，比让他先去列表里挑一次少一步；
 * 只有该单机确实没有架次时才落到引导态。
 */
async function ensureSortieForTimeseries() {
  if (selectedSortie.value || sortieResolving.value) return
  sortieResolving.value = true
  try {
    // 架次查询机型必填：用当前飞行器所属机型（三方合成码须截断为冒号前的基础编码）
    const code = aircraft.value?.modelCode
    if (!code) {
      selectedSortie.value = null
      ElMessage.warning('无法确定该飞行器的机型，不能查询架次')
      return
    }
    const list = await getSorties(baseModelCode(code), aircraftNumber.value)
    selectedSortie.value = list[0] ?? null
    if (!selectedSortie.value) ElMessage.info('该单机暂无架次')
  } catch (e) {
    ElMessage.error('获取架次失败: ' + (e as Error).message)
  } finally {
    sortieResolving.value = false
  }
}

/** 菜单切换：进时序页时补齐默认架次 */
function onMenuChange(key: string) {
  activeMenu.value = key
  if (key === 'timeseries') void ensureSortieForTimeseries()
}
</script>

<template>
  <div v-if="!aircraft" class="not-found">
    <p>未找到该飞行器</p>
    <el-button type="primary" @click="router.push('/')">返回首页</el-button>
  </div>

  <div v-else class="workspace-layout">
    <!-- 左侧导航 -->
    <WorkspaceSidebar
      :aircraft="aircraft"
      :active-menu="activeMenu"
      :collapsed="sidebarCollapsed"
      :menus="workspaceMenus"
      @update:active-menu="onMenuChange"
      @update:collapsed="sidebarCollapsed = $event"
      @navigate-home="router.push('/')"
    />

    <!-- 右侧内容 -->
    <main class="ws-content">
      <div v-if="initializing" class="loading-state">
        <p>正在加载工作区...</p>
      </div>
      <template v-else>
        <ChatPanel
          v-if="activeMenu === 'chat'"
          :aircraft-number="aircraftNumber"
          @navigate-to-tasks="onNavigateToTasks"
        />
        <PipelineWorkspace
          v-else-if="activeMenu === 'pipeline'"
          :aircraft-number="aircraftNumber"
        />
        <TaskPanel
          v-else-if="activeMenu === 'task'"
          :aircraft-number="aircraftNumber"
          @enter-chat="onEnterChat"
        />
        <DataPanel
          v-else-if="activeMenu === 'data'"
          :aircraft-number="aircraftNumber"
          :model-code="currentModelCode"
          :readonly="isExternal"
        />
        <SortieQueryPanel
          v-else-if="activeMenu === 'sortie'"
          :aircraft-number="aircraftNumber"
          :model-code="currentModelCode"
          :external="isExternal"
          @select-sortie="onSelectSortie"
        />
        <SortieTimeSeriesPanel
          v-else-if="activeMenu === 'timeseries' && selectedSortie"
          :sortie="selectedSortie"
          :model-code="currentModelCode"
          :external="isExternal"
          @back="activeMenu = 'sortie'"
          @navigate-to-tasks="onNavigateToTasks"
        />
        <!-- 该单机没有任何架次（或架次拉取失败）时的兜底引导 -->
        <div v-else-if="activeMenu === 'timeseries'" class="empty-hint">
          <template v-if="sortieResolving">
            <p>正在加载该单机的架次...</p>
          </template>
          <template v-else>
            <p>该单机暂无架次，无法查看时序数据</p>
            <el-button type="primary" @click="activeMenu = 'sortie'">去架次查询</el-button>
          </template>
        </div>
        <DemoRealtimeView
          v-else-if="activeMenu === 'monitor-old'"
        />
        <DemoDiagnosisView
          v-else-if="activeMenu === 'diagnosis'"
        />
        <DemoHealthView
          v-else-if="activeMenu === 'health'"
        />
        <DemoTrendView
          v-else-if="activeMenu === 'trend'"
        />
        <DemoPredictionView
          v-else-if="activeMenu === 'prediction'"
        />
        <DemoMaintenanceView
          v-else-if="activeMenu === 'maintenance'"
        />
      </template>
    </main>
  </div>
</template>

<style scoped>
.not-found {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #8c9ab0;
}

.workspace-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.ws-content {
  flex: 1;
  background: #f4f6fb;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c9ab0;
  font-size: 15px;
}

.empty-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #8c9ab0;
  font-size: 15px;
}

.empty-hint p {
  margin: 0;
}
</style>
