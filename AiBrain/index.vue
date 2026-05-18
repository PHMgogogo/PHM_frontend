<template>
  <div class="ai-brain">
    <div class="page-head">
      <div class="page-title">
        智能大脑
        <span v-if="serverVersion" class="version-tag">v{{ serverVersion }}</span>
      </div>
    </div>

    <el-tabs v-model="activeTab" type="border-card" class="brain-tabs">
      <!-- Tab 1: 对话入口 -->
      <el-tab-pane label="对话入口" name="chat">
        <div class="brain-layout">
          <!-- 左侧面板 -->
          <div class="left-panel">
            <ConnectionConfig
              v-model:serverBase="serverBase"
              v-model:workDir="workDir"
              v-model:password="password"
              :connecting="connecting"
              :connected="connected"
              :errorMsg="errorMsg"
              @connect="handleConnect"
            />

            <SessionList
              v-model:newSessionTitle="newSessionTitle"
              :sessions="sessions"
              :currentSid="currentSid"
              :connected="connected"
              :creating="creating"
              @open="handleOpenSession"
              @create="handleCreateSession"
              @delete="handleDeleteSession"
            />
          </div>

          <!-- 右侧聊天区 -->
          <el-card class="card-dark chat-card">
            <template #header>
              <div class="chat-header">
                <span class="section-header">对话</span>

                <div class="chat-actions">
                  <!-- 模型选择 -->
                  <el-select
                    v-model="selectedModel"
                    placeholder="选择模型"
                    size="small"
                    class="model-select"
                    :disabled="!connected"
                  >
                    <el-option
                      v-for="m in modelOptions"
                      :key="m.value"
                      :label="m.label"
                      :value="m.value"
                    />
                  </el-select>

                  <el-button
                    size="small"
                    :icon="Refresh"
                    :disabled="!currentSid"
                    @click="handleRefresh"
                  />

                  <el-button
                    v-if="sessionBusy"
                    size="small"
                    type="warning"
                    :icon="VideoPause"
                    @click="handleAbort"
                  >
                    中止
                  </el-button>
                </div>
              </div>
            </template>

            <!-- 消息流 + Question 面板 -->
            <MessageFeed
              :messages="messages"
              :sessionBusy="sessionBusy"
              :currentSid="currentSid"
              :pendingQuestion="pendingQuestion"
              @question-reply="handleQuestionReply"
              @question-reject="handleQuestionReject"
            />

            <!-- 输入区 -->
            <div class="input-area">
              <el-input
                v-model="inputText"
                type="textarea"
                :rows="3"
                placeholder="输入消息，Ctrl+Enter 发送"
                resize="none"
                :disabled="!currentSid || sessionBusy"
                @keydown.ctrl.enter="handleSend"
              />
              <el-button
                type="primary"
                :loading="sending"
                :disabled="!currentSid || !inputText.trim() || sessionBusy"
                @click="handleSend"
              >
                发送
              </el-button>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- Tab 2: 算法管理 -->
      <el-tab-pane label="算法管理" name="algo">
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Cpu, Refresh, VideoPause } from '@element-plus/icons-vue'
import { useBrain } from './useBrain.js'

const activeTab = ref('chat')
import ConnectionConfig from './ConnectionConfig.vue'
import SessionList from './SessionList.vue'
import MessageFeed from './MessageFeed.vue'

const {
  serverBase, workDir, password,
  connecting, connected, serverVersion, errorMsg,
  modelOptions, selectedModel,
  sessions, currentSid, newSessionTitle, creating,
  messages, inputText, sending, sessionBusy,
  pendingQuestion,
  handleConnect,
  handleOpenSession,
  handleCreateSession,
  handleDeleteSession,
  handleSend,
  handleAbort,
  handleRefresh,
  handleQuestionReply,
  handleQuestionReject,
} = useBrain()
</script>

<style scoped>
.ai-brain {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 700;
  color: #e8f4ff;
  flex-shrink: 0;
}

.title-icon { font-size: 22px; color: #40a9ff; }

.version-tag {
  font-size: 12px;
  font-weight: 400;
  color: #4a6a80;
  background: #0d1b2e;
  border: 1px solid #1a3a5c;
  padding: 2px 8px;
  border-radius: 10px;
}

.brain-tabs {
  flex: 1;
  min-height: 0;
  background: #112240 !important;
  border-color: #1a3a5c !important;
}

:deep(.brain-tabs .el-tabs__content) {
  background: #112240;
  padding: 16px;
  height: calc(100% - 40px);
  box-sizing: border-box;
  overflow: hidden;
}

:deep(.brain-tabs .el-tab-pane) {
  height: 100%;
}

:deep(.el-tabs--border-card > .el-tabs__header) {
  background: #0d1b2e;
  border-color: #1a3a5c;
}

:deep(.el-tabs--border-card > .el-tabs__header .el-tabs__item.is-active) {
  background: #112240;
  color: #40a9ff;
}

:deep(.el-tabs--border-card > .el-tabs__header .el-tabs__item) {
  color: #7aadcc;
}

.brain-layout {
  display: flex;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.left-panel {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.chat-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  min-height: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-actions { display: flex; align-items: center; gap: 8px; }

.model-select { width: 200px; }

.section-header {
  font-size: 14px;
  font-weight: 600;
  color: #a0b4c8;
}

.input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #1a3a5c;
  flex-shrink: 0;
  align-items: flex-end;
}

.input-area :deep(.el-textarea__inner) {
  background: #0a1628;
  border-color: #1a3a5c;
  color: #c8ddf0;
  resize: none;
}

.input-area :deep(.el-textarea__inner):focus { border-color: #40a9ff; }
</style>
