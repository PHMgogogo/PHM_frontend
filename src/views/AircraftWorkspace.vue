<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAircraftStore } from '@/stores/aircraft'
import { useUnifiedStore } from '@/stores/unified'
import { sourceText } from '@/api/unified'
import { useChatStore } from '@/stores/chat'
import { useConfigItemStore } from '@/stores/configItem'
import { useTaskStore } from '@/stores/task'
import type { UnifiedSource } from '@/types/entities'
import WorkspaceSidebar from '@/components/WorkspaceSidebar.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import TaskPanel from '@/components/TaskPanel.vue'
import DataPanel from '@/components/DataPanel.vue'
import DemoRealtimeView from '@/views/demo/DemoRealtimeView.vue'
import DemoDiagnosisView from '@/views/demo/DemoDiagnosisView.vue'
import DemoHealthView from '@/views/demo/DemoHealthView.vue'
import DemoTrendView from '@/views/demo/DemoTrendView.vue'
import DemoPredictionView from '@/views/demo/DemoPredictionView.vue'
import DemoMaintenanceView from '@/views/demo/DemoMaintenanceView.vue'
import PipelineWorkspace from '@/views/pipeline/PipelineWorkspace.vue'
import taskIcon from '@/assets/task.svg'
import dataIcon from '@/assets/data.svg'
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
const unifiedStore = useUnifiedStore()
const chatStore = useChatStore()
const configItemStore = useConfigItemStore()
const taskStore = useTaskStore()

const aircraftNumber = computed(() => route.params.aircraftNumber as string)

/** 进入来源：首页卡片点击时经 query 携带（hangxin/sansan/local），无参视为本地 */
const entrySource = computed<UnifiedSource | undefined>(() => {
  const s = route.query.source
  return s === 'hangxin' || s === 'sansan' || s === 'local' ? s : undefined
})
/** 外部平台单机（航新/633）：整台只读 */
const isExternal = computed(
  () => entrySource.value !== undefined && entrySource.value !== 'local',
)

// 优先用统一聚合列表（含外部平台单机）解析，找不到再回退本地列表。
// 同一机号可能在多源同时存在：优先取与进入来源一致的那条（决定只读门控与来源展示）。
const aircraft = computed(() => {
  const rows = unifiedStore.aircrafts.filter((a) => a.aircraftNumber === aircraftNumber.value)
  if (rows.length > 0) {
    const preferred = entrySource.value
      ? rows.find((r) => r.source === entrySource.value)
      : undefined
    return preferred ?? rows[0]
  }
  return aircraftStore.aircrafts.find((a) => a.aircraftNumber === aircraftNumber.value)
})

// ---- UI 状态 ----
const activeMenu = ref(isExternal.value ? 'data' : 'task')
const initializing = ref(true)
const sidebarCollapsed = ref(false)
const allWorkspaceMenus = [
  { key: 'chat', svg: chatIcon, title: '当前对话' },
  { key: 'task', svg: taskIcon, title: '会话管理' },
  { key: 'data', svg: dataIcon, title: '数据管理' },
  { key: 'pipeline', svg: pipelineIcon, title: '逻辑编排' },
  { key: 'monitor-old', svg: monitorIcon, title: '实时监控' },
  { key: 'diagnosis', svg: diagnosisIcon, title: '增强诊断' },
  { key: 'health', svg: healthIcon, title: '健康评估' },
  { key: 'trend', svg: trendIcon, title: '趋势分析' },
  { key: 'prediction', svg: predictionIcon, title: '故障预测' },
  { key: 'maintenance', svg: maintenanceIcon, title: '维修建议' },
]
// 外部平台单机：隐藏依赖本地的会话/对话（本地任务初始化只对本地单机有意义）
const externalHiddenKeys = new Set(['task', 'chat'])
const workspaceMenus = computed(() =>
  allWorkspaceMenus.filter((m) => !isExternal.value || !externalHiddenKeys.has(m.key)),
)

// ---- 初始化指定飞机的任务上下文：拉取列表，空列表则静默自动创建默认会话 ----
async function bootstrapFor(id: string) {
  initializing.value = true
  try {
    await taskStore.init(id)
  } finally {
    initializing.value = false
  }
  // 每个单机都有默认会话，因此任意情况下都进入当前对话：
  // - 若 cookie 已有该飞机的 currentTask，直接使用；
  // - 若 cookie 无记录，自动选中默认会话并更新 cookie。
  let ct = taskStore.getCurrentTask(id)
  if (!ct) {
    const defaultTask = taskStore.tasks.find(t => t.isDefault)
    if (defaultTask && defaultTask.workDir) {
      taskStore.setCurrentTask(id, defaultTask.id)
      ct = defaultTask
    }
  }
  if (ct && ct.workDir) {
    activeMenu.value = 'chat'
    await nextTick()
    chatStore.connectToSession(ct.sessionId, ct.workDir)
  } else {
    activeMenu.value = 'task'
  }
}

onMounted(async () => {
  await unifiedStore.fetchAircrafts()
  if (isExternal.value) {
    // 外部平台单机：只读查看，无需本地任务/构型初始化
    initializing.value = false
    return
  }
  aircraftStore.fetchAircrafts()
  if (aircraft.value?.modelCode) {
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
    if (isExternal.value) {
      initializing.value = false
      activeMenu.value = 'data'
      return
    }
    await bootstrapFor(newVal)
  }
})

// ---- 子组件事件处理 ----
function onEnterChat() {
  if (!isExternal.value) activeMenu.value = 'chat'
}

function onNavigateToTasks() {
  activeMenu.value = isExternal.value ? 'data' : 'task'
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
      @update:active-menu="activeMenu = $event"
      @update:collapsed="sidebarCollapsed = $event"
      @navigate-home="router.push('/')"
    />

    <!-- 右侧内容 -->
    <main class="ws-content">
      <div v-if="isExternal && aircraft" class="readonly-banner">
        该飞行器来自「{{ sourceText(aircraft.source) }}」，外部平台数据仅支持查看
      </div>
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
          :readonly="isExternal"
          @navigate-to-tasks="onNavigateToTasks"
        />
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

.readonly-banner {
  padding: 8px 16px;
  font-size: 13px;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.12);
  border-bottom: 1px solid rgba(230, 162, 60, 0.3);
  flex-shrink: 0;
}

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c9ab0;
  font-size: 15px;
}
</style>
