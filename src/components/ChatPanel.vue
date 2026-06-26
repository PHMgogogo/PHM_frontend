<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { VideoPause, Warning, Loading, CircleCheck, Clock, Plus } from '@element-plus/icons-vue'
import { useChatStore } from '@/stores/chat'
import { useTaskStore } from '@/stores/task'
import MessageFeed from '@/components/MessageFeed.vue'

const props = defineProps<{
  aircraftNumber: string
}>()

const emit = defineEmits<{
  (e: 'navigate-to-tasks'): void
}>()

const chatStore = useChatStore()

const taskStore = useTaskStore()

const inputText = ref('')

// 待发送的附件文件：用户点「+」挑选后在此持有，发送成功后清空
const pendingFiles = ref<File[]>([])

// SSE 状态监控：每 5s 打印 EventSource 状态
const READY_STATE_LABELS: Record<number, string> = { [-1]: '未初始化', 0: 'CONNECTING', 1: 'OPEN', 2: 'CLOSED' }
let sseMonitorTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  sseMonitorTimer = setInterval(() => {
    const state = chatStore.sseReadyState
    console.log(`[SSE Monitor] EventSource readyState: ${state} (${READY_STATE_LABELS[state] ?? '未知'})`)
  }, 5000)
})

onBeforeUnmount(() => {
  if (sseMonitorTimer) {
    clearInterval(sseMonitorTimer)
    sseMonitorTimer = null
  }
  // 注意：不在此处调用 chatStore.dispose()。SSE 是会话级资源，生命周期由
  // AircraftWorkspace（切飞行器/离开页面）与 connectToSession（切 session）管理，
  // 不应随 chat tab 的显隐而断流，否则切到会话管理/数据管理再切回会丢失实时推送。
})

// ========== 方法 ==========
function handleSendKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !chatStore.sessionBusy) {
    e.preventDefault()
    void sendWithFiles()
  }
}

// 发送当前正文 + 已附带文件；成功后清空附件
async function sendWithFiles() {
  chatStore.inputText = inputText.value
  inputText.value = ''
  const ok = await chatStore.handleSend(pendingFiles.value)
  if (ok) {
    pendingFiles.value = []
  } else {
    // 发送失败：正文已被 store 还原到 chatStore.inputText，同步回输入框
    inputText.value = chatStore.inputText
  }
}

// 「+」挑选附件：可多选，累积到 pendingFiles（发送时才上传）
function onFilePick(uf: UploadFile) {
  if (uf.raw) pendingFiles.value.push(uf.raw)
}

// 移除某个附件
function removeFile(i: number) {
  pendingFiles.value.splice(i, 1)
}

async function handleClearMessages() {
  if (chatStore.messages.length === 0) return
  const task = taskStore.getCurrentTask(props.aircraftNumber)
  if (!task) return
  try {
    await ElMessageBox.confirm(
      '清空将重置 AI 上下文，当前对话历史不可恢复。是否继续？',
      '确认清空',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    await taskStore.clearTaskSession(task.id)
  } catch {
    // 用户取消
  }
}

async function sendMessage() {
  await sendWithFiles()
}
</script>

<template>
  <!-- 无 currentTask 时的空状态 -->
  <div v-if="!taskStore.getCurrentTask(props.aircraftNumber)" class="chat-empty-state">
    <div class="chat-empty-icon">💬</div>
    <p>{{ taskStore.tasks.length === 0 ? '暂无会话，请先创建会话再开始对话。' : '请先在会话管理中选择一个会话开始对话。' }}</p>
    <el-button type="primary" @click="emit('navigate-to-tasks')">
      {{ taskStore.tasks.length === 0 ? '去创建会话' : '去会话管理' }}
    </el-button>
  </div>

  <!-- 有 currentTask：对话界面 -->
  <div v-else class="chat-layout-simple">
    <!-- 顶部栏：连接状态 + 模型选择 + 操作 -->
    <div class="chat-top-bar">
      <div class="conn-status-area">
        <span v-if="chatStore.errorMsg" class="conn-error-inline">
          <el-icon color="#EF4444"><Warning /></el-icon> {{ chatStore.errorMsg }}
          <el-button size="small" type="primary" plain @click="chatStore.retryConnect">重试</el-button>
        </span>
        <span v-else-if="chatStore.connecting" class="conn-info-inline"><el-icon class="is-loading" color="#F59E0B"><Loading /></el-icon> 连接中…</span>
        <span v-else-if="chatStore.connected" class="conn-ok-inline">
          <el-icon color="#22C55E"><CircleCheck /></el-icon> 已连接
          <span v-if="chatStore.serverVersion" class="version-tag-inline">v{{ chatStore.serverVersion }}</span>
        </span>
        <span v-else class="conn-info-inline"><el-icon color="#94A3B8"><Clock /></el-icon> 未连接</span>
      </div>

      <div class="chat-header-actions">
        <!-- <select
          v-model="chatStore.selectedModel"
          class="native-model-select"
          :disabled="!chatStore.connected"
        >
          <option value="" disabled>选择模型</option>
          <option v-for="m in chatStore.modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select> -->
        <!-- <el-button size="small" :icon="Refresh" :disabled="!chatStore.currentSid" @click="chatStore.handleRefresh" /> -->
        <el-button v-if="chatStore.sessionBusy" size="small" type="warning" :icon="VideoPause" @click="chatStore.handleAbort">
          中止
        </el-button>
        <span class="current-task-label">会话：{{ taskStore.getCurrentTask(props.aircraftNumber)?.name }}</span>
      </div>
    </div>

    <!-- 消息区域 -->
    <MessageFeed
      :messages="chatStore.messages"
      :session-busy="chatStore.sessionBusy"
      :current-sid="chatStore.currentSid"
      :pending-question="chatStore.pendingQuestion"
      @question-reply="chatStore.handleQuestionReply"
      @question-reject="chatStore.handleQuestionReject"
    />

    <!-- 输入区域 -->
    <div class="input-section">
      <!-- 已附带的附件 -->
      <div v-if="pendingFiles.length" class="attached-files">
        <el-tag
          v-for="(f, i) in pendingFiles"
          :key="i"
          type="info"
          closable
          @close="removeFile(i)"
        >
          {{ f.name }}
        </el-tag>
      </div>

      <div class="input-area">
        <!-- 「+」上传附件（发送时才上传） -->
        <el-upload
          :show-file-list="false"
          :auto-upload="false"
          multiple
          :on-change="onFilePick"
        >
          <el-button
            :icon="Plus"
            circle
            :disabled="!chatStore.currentSid || chatStore.sessionBusy"
          />
        </el-upload>

        <el-input
          v-model="inputText"
          type="textarea"
          :rows="3"
          placeholder="输入消息"
          resize="none"
          :disabled="!chatStore.currentSid || chatStore.sessionBusy"
          @keydown="handleSendKey"
        />
        <div class="input-actions">
          <el-button
            :disabled="!chatStore.currentSid || chatStore.sessionBusy"
            :loading="taskStore.clearing"
            @click="handleClearMessages"
          >
            清空对话记录
          </el-button>
          <el-button
            type="primary"
            :disabled="!chatStore.currentSid || chatStore.sessionBusy || !inputText.trim()"
            @click="sendMessage"
          >
            Enter 发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #8c9ab0;
}
.chat-empty-icon { font-size: 48px; }
.chat-empty-state p { font-size: 15px; margin: 0; }

.chat-layout-simple {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.chat-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #e0e8f5;
  flex-shrink: 0;
}

.conn-status-area { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.conn-ok-inline { color: #27ae60; display: flex; align-items: center; gap: 6px; }
.conn-error-inline { color: #c0392b; display: flex; align-items: center; gap: 6px; }
.conn-info-inline { color: #8c9ab0; }
.version-tag-inline { font-size: 11px; color: #8c9ab0; background: #f0f3f8; padding: 1px 6px; border-radius: 10px; }
.current-task-label { font-size: 12px; color: #8c9ab0; margin-left: 8px; white-space: nowrap; }

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: #fff;
  border-top: 1px solid #e0e8f5;
}

.attached-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px 0;
}

.input-area {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  align-items: flex-end;
}

.input-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  width: 120px;
}

.input-actions .el-button {
  width: 100%;
  margin-left: 0;
}

.input-area :deep(.el-textarea__inner) {
  border-radius: 8px;
  resize: none;
}
</style>
