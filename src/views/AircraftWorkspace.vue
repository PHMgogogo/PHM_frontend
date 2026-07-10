<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAircraftStore } from '@/stores/aircraft'
import { useChatStore } from '@/stores/chat'
import { useConfigItemStore } from '@/stores/configItem'
import { useTaskStore } from '@/stores/task'
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
import taskIcon from '@/assets/task.svg'
import dataIcon from '@/assets/data.svg'
import chatIcon from '@/assets/chat.svg'
import monitorIcon from '@/assets/monitor.svg'
import diagnosisIcon from '@/assets/diagnosis.svg'
import healthIcon from '@/assets/health.svg'
import trendIcon from '@/assets/trend.svg'
import predictionIcon from '@/assets/predict.svg'
import maintenanceIcon from '@/assets/maintenance.svg'

const route = useRoute()
const router = useRouter()
const aircraftStore = useAircraftStore()
const chatStore = useChatStore()
const configItemStore = useConfigItemStore()
const taskStore = useTaskStore()

const aircraftNumber = computed(() => route.params.aircraftNumber as string)
const aircraft = computed(() =>
  aircraftStore.aircrafts.find((a) => a.aircraftNumber === aircraftNumber.value),
)

// ---- UI 状态 ----
const activeMenu = ref('task')
const initializing = ref(true)
const sidebarCollapsed = ref(false)
const workspaceMenus = [
  { key: 'task', svg: taskIcon, title: '会话管理' },
  { key: 'data', svg: dataIcon, title: '数据管理' },
  { key: 'chat', svg: chatIcon, title: '当前对话' },
  { key: 'monitor-old', svg: monitorIcon, title: '实时监控' },
  { key: 'diagnosis', svg: diagnosisIcon, title: '增强诊断' },
  { key: 'health', svg: healthIcon, title: '健康评估' },
  { key: 'trend', svg: trendIcon, title: '趋势分析' },
  { key: 'prediction', svg: predictionIcon, title: '故障预测' },
  { key: 'maintenance', svg: maintenanceIcon, title: '维修建议' },
]

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

onMounted(() => {
  aircraftStore.fetchAircrafts()
  if (aircraft.value?.modelCode) {
    configItemStore.fetchAll(aircraft.value.modelCode)
  }
  bootstrapFor(aircraftNumber.value)
})

onUnmounted(() => {
  chatStore.dispose()
})

// ---- 飞行器切换时清理并重新初始化（SPA 内导航到其他飞行器） ----
watch(aircraftNumber, async (newVal, oldVal) => {
  if (oldVal && newVal !== oldVal) {
    chatStore.dispose()
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
      <div v-if="initializing" class="loading-state">
        <p>正在加载工作区...</p>
      </div>
      <template v-else>
        <ChatPanel
          v-if="activeMenu === 'chat'"
          :aircraft-number="aircraftNumber"
          @navigate-to-tasks="onNavigateToTasks"
        />
        <TaskPanel
          v-else-if="activeMenu === 'task'"
          :aircraft-number="aircraftNumber"
          @enter-chat="onEnterChat"
        />
        <DataPanel
          v-else-if="activeMenu === 'data'"
          :aircraft-number="aircraftNumber"
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

.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c9ab0;
  font-size: 15px;
}
</style>
