<script setup lang="ts">
import { ref } from 'vue'
import { VideoPause } from '@element-plus/icons-vue'
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

// ========== 方法 ==========
function handleSendKey(e: KeyboardEvent) {
  if (e.ctrlKey && !chatStore.sessionBusy) {
    chatStore.inputText = inputText.value
    inputText.value = ''
    chatStore.handleSend()
  }
}

async function sendMessage() {
  chatStore.inputText = inputText.value
  inputText.value = ''
  await chatStore.handleSend()
}
</script>

<template>
  <!-- 无 currentTask 时的空状态 -->
  <div v-if="!taskStore.getCurrentTask(props.aircraftNumber)" class="chat-empty-state">
    <div class="chat-empty-icon">💬</div>
    <p>{{ taskStore.tasks.length === 0 ? '暂无任务，请先创建任务再开始对话。' : '请先在任务管理中选择一个任务开始对话。' }}</p>
    <el-button type="primary" @click="emit('navigate-to-tasks')">
      {{ taskStore.tasks.length === 0 ? '去创建任务' : '去任务管理' }}
    </el-button>
  </div>

  <!-- 有 currentTask：对话界面 -->
  <div v-else class="chat-layout-simple">
    <!-- 顶部栏：连接状态 + 模型选择 + 操作 -->
    <div class="chat-top-bar">
      <div class="conn-status-area">
        <span v-if="chatStore.errorMsg" class="conn-error-inline">
          ⚠ {{ chatStore.errorMsg }}
          <el-button size="small" type="primary" plain @click="chatStore.retryConnect">重试</el-button>
        </span>
        <span v-else-if="chatStore.connecting" class="conn-info-inline">⏳ 连接中…</span>
        <span v-else-if="chatStore.connected" class="conn-ok-inline">
          ✅ 已连接
          <span v-if="chatStore.serverVersion" class="version-tag-inline">v{{ chatStore.serverVersion }}</span>
        </span>
        <span v-else class="conn-info-inline">⚪ 未连接</span>
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
        <span class="current-task-label">任务：{{ taskStore.getCurrentTask(props.aircraftNumber)?.name }}</span>
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
    <div class="input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        placeholder="输入消息"
        resize="none"
        :disabled="!chatStore.currentSid || chatStore.sessionBusy"
        @keydown="handleSendKey"
      />
      <el-button
        type="primary"
        :disabled="!chatStore.currentSid || chatStore.sessionBusy || !inputText.trim()"
        @click="sendMessage"
      >
        Ctrl + Enter 发送
      </el-button>
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

.input-area {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #e0e8f5;
  flex-shrink: 0;
  align-items: flex-end;
}

.input-area :deep(.el-textarea__inner) {
  border-radius: 8px;
  resize: none;
}
</style>
