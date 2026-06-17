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

onMounted(() => {
  aircraftStore.fetchAircrafts()
  if (aircraft.value?.modelCode) {
    configItemStore.fetchAll(aircraft.value.modelCode)
  }
  taskStore.init()
})

onUnmounted(() => {
  chatStore.dispose()
})

// ---- 任务加载完成后，若该飞行器有 currentTask 且 workDir 可用，自动进入对话 ----
let initialCheckDone = false
watch(
  () => taskStore.loading,
  (loading, wasLoading) => {
    if (wasLoading && !loading && !initialCheckDone) {
      initialCheckDone = true
      initializing.value = false
      const ct = taskStore.getCurrentTask(aircraftNumber.value)
      const wd = ct ? ct.workDir : undefined
      if (ct && wd) {
        activeMenu.value = 'chat'
        chatStore.connectToSession(ct.sessionId, wd)
      } else {

      }
    }
  },
)

// ---- 飞行器切换时清理（SPA 内导航到其他飞行器） ----
watch(aircraftNumber, async (newVal, oldVal) => {
  if (oldVal && newVal !== oldVal) {
    chatStore.dispose()
    initialCheckDone = false

    // 先确定默认 tab 并渲染 UI，再初始化会话
    const menu = resolveDefaultMenu()
    activeMenu.value = menu

    if (menu === 'chat') {
      await nextTick()
      const ct = taskStore.getCurrentTask(newVal)
      if (ct && ct.workDir) {
        chatStore.connectToSession(ct.sessionId, ct.workDir)
      }
    }
  }
})

// ---- 导航 ----
function resolveDefaultMenu(): string {
  const ct = taskStore.getCurrentTask(aircraftNumber.value)
  if (ct && ct.workDir) return 'chat'
  return 'task'
}
// 初始化为安全默认值。任务加载完成后由 watch(taskStore.loading) 根据
// currentTask 是否存在 workDir 自动决定是否切换到 'chat'
const activeMenu = ref('task')
const initializing = ref(true)
const sidebarCollapsed = ref(false)
const workspaceMenus = [
  { key: 'task', icon: '📋', title: '算法管理' },
  { key: 'data', icon: '🗂️', title: '数据管理' },
  { key: 'chat', icon: '💬', title: '对话入口' },
]

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
