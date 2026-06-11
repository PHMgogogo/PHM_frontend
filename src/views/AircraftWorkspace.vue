<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAircraftStore } from '@/stores/aircraft'
import { useChatStore } from '@/stores/chat'
import { useConfigItemStore } from '@/stores/configItem'
import { useDataMappingStore } from '@/stores/dataMapping'
import MessageFeed from '@/components/MessageFeed.vue'
import {
  ArrowLeft, Refresh, VideoPause, Plus, Delete, Upload,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { DataType } from '@/types/entities'

const route = useRoute()
const router = useRouter()
const aircraftStore = useAircraftStore()
const chatStore = useChatStore()
const configItemStore = useConfigItemStore()
const dataMappingStore = useDataMappingStore()

const aircraftNumber = computed(() => route.params.aircraftNumber as string)
const aircraft = computed(() =>
  aircraftStore.aircrafts.find((a) => a.aircraftNumber === aircraftNumber.value),
)

onMounted(() => {
  aircraftStore.fetchAircrafts()
  chatStore.autoConnect()
  if (aircraft.value?.modelCode) {
    configItemStore.fetchAll(aircraft.value.modelCode)
  }
})

onUnmounted(() => {
  chatStore.dispose()
})

// ---- 导航 ----
const activeMenu = ref('chat')
const workspaceMenus = [
  { key: 'chat', icon: '💬', title: '对话入口' },
  { key: 'data', icon: '🗂️', title: '数据管理' },
]

// ----  Chat（保持不变） ----
const inputText = ref('')

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

// ---- 数据管理（CSV 上传 + 构型绑定） ----
const csvFile = ref<File | null>(null)
const csvTableName = ref('')
const csvParentItemId = ref<number | undefined>(undefined)
const csvDataType = ref<DataType>('RAW')
const dataTypeOptions: { label: string; value: DataType }[] = [
  { label: '诊断数据', value: 'DIAGNOSIS' },
  { label: '评估数据', value: 'EVALUATION' },
  { label: '预测数据', value: 'PREDICTION' },
  { label: '原始数据', value: 'RAW' },
]

const uploadRef = ref()

function handleFileChange(file: File) {
  csvFile.value = file
}

async function analyzeFile() {
  if (!csvFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }
  try {
    const result = await dataMappingStore.previewCsv(csvFile.value)
    if (result.errors && result.errors.length > 0) {
      ElMessage.warning(`数据校验发现 ${result.errors.length} 个问题`)
    } else {
      ElMessage.success(`共 ${result.rowCount} 行，${result.columns.length} 列，校验通过`)
    }
  } catch (e) {
    ElMessage.error('分析失败: ' + (e as Error).message)
  }
}

async function handleCsvUpload() {
  if (!csvFile.value || !csvTableName.value.trim()) {
    ElMessage.warning('请填写表名并选择文件')
    return
  }
  try {
    await dataMappingStore.uploadCsv(
      csvFile.value,
      csvTableName.value.trim(),
      aircraftNumber.value,
      csvParentItemId.value,
      csvDataType.value,
    )
    ElMessage.success(dataMappingStore.uploadResult?.message || '上传成功')
    // 重置
    csvFile.value = null
    csvTableName.value = ''
    csvParentItemId.value = undefined
    csvDataType.value = 'RAW'
    dataMappingStore.clearAnalysis()
    uploadRef.value?.clearFiles()
  } catch {
    // 错误已在 store 中处理
  }
}

</script>

<template>
  <div v-if="!aircraft" class="not-found">
    <p>未找到该飞行器</p>
    <el-button type="primary" @click="router.push('/')">返回首页</el-button>
  </div>

  <div v-else class="workspace-layout">
    <!-- 左侧导航 -->
    <aside class="ws-sidebar">
      <div class="ws-back" @click="router.push('/')">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回首页</span>
      </div>
      <div class="ws-aircraft-name">
        <span class="ws-aircraft-icon">✈️</span>
        <span class="ws-aircraft-title">{{ aircraft.aircraftNumber }}</span>
      </div>
      <div class="ws-aircraft-meta">
        <div>{{ aircraft.modelCode }}</div>
        <div v-if="aircraft.airline">{{ aircraft.airline }}</div>
      </div>
      <ul class="ws-menu-list">
        <li
          v-for="menu in workspaceMenus"
          :key="menu.key"
          :class="['ws-menu-item', { active: activeMenu === menu.key }]"
          @click="activeMenu = menu.key"
        >
          <span class="ws-menu-icon">{{ menu.icon }}</span>
          <span class="ws-menu-title">{{ menu.title }}</span>
        </li>
      </ul>
    </aside>

    <!-- 右侧内容 -->
    <main class="ws-content">

      <!-- ========== 对话入口 ========== -->
      <template v-if="activeMenu === 'chat'">
        <div class="chat-layout">
          <div class="session-panel">
            <div class="session-panel-header">会话管理</div>

            <div v-if="chatStore.errorMsg" class="conn-error">
              <span>{{ chatStore.errorMsg }}</span>
              <el-button size="small" type="primary" plain @click="chatStore.retryConnect">
                重试
              </el-button>
            </div>
            <div v-else-if="chatStore.connecting" class="conn-info">连接中…</div>
            <div v-else-if="chatStore.connected" class="conn-ok">
              已连接
              <span v-if="chatStore.serverVersion" class="version-tag">
                v{{ chatStore.serverVersion }}
              </span>
            </div>

            <div class="new-session-row">
              <el-input
                v-model="chatStore.newSessionTitle"
                placeholder="会话名称（可选）"
                size="small"
                :disabled="!chatStore.connected"
                @keydown.enter="chatStore.handleCreateSession"
              />
              <el-button
                type="primary"
                size="small"
                :disabled="!chatStore.connected"
                :loading="chatStore.creating"
                @click="chatStore.handleCreateSession"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
            </div>

            <div class="session-list">
              <div
                v-for="item in chatStore.sessions"
                :key="item.id"
                class="session-row"
                :class="{ active: item.id === chatStore.currentSid }"
                @click="chatStore.handleOpenSession(item.id)"
              >
                <span class="session-title">{{ item.title || '(无标题)' }}</span>
                <el-button
                  link
                  size="small"
                  class="session-del"
                  @click.stop="chatStore.handleDeleteSession(item)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
              <div v-if="!chatStore.sessions.length" class="session-empty">暂无会话</div>
            </div>
          </div>

          <div class="chat-main">
            <div class="chat-main-header">
              <span class="chat-main-title">对话</span>
              <div class="chat-header-actions">
                <el-select
                  v-model="chatStore.selectedModel"
                  placeholder="选择模型"
                  size="small"
                  style="width: 220px"
                  :disabled="!chatStore.connected"
                >
                  <el-option
                    v-for="m in chatStore.modelOptions"
                    :key="m.value"
                    :label="m.label"
                    :value="m.value"
                  />
                </el-select>
                <el-button
                  size="small"
                  :icon="Refresh"
                  :disabled="!chatStore.currentSid"
                  @click="chatStore.handleRefresh"
                />
                <el-button
                  v-if="chatStore.sessionBusy"
                  size="small"
                  type="warning"
                  :icon="VideoPause"
                  @click="chatStore.handleAbort"
                >
                  中止
                </el-button>
              </div>
            </div>

            <MessageFeed
              :messages="chatStore.messages"
              :session-busy="chatStore.sessionBusy"
              :current-sid="chatStore.currentSid"
              :pending-question="chatStore.pendingQuestion"
              @question-reply="chatStore.handleQuestionReply"
              @question-reject="chatStore.handleQuestionReject"
            />

            <div class="input-area">
              <el-input
                v-model="inputText"
                type="textarea"
                :rows="3"
                placeholder="输入消息，Ctrl+Enter 发送"
                resize="none"
                :disabled="!chatStore.currentSid || chatStore.sessionBusy"
                @keydown="handleSendKey"
              />
              <el-button
                type="primary"
                :disabled="!chatStore.currentSid || chatStore.sessionBusy || !inputText.trim()"
                @click="sendMessage"
              >
                发送
              </el-button>
            </div>
          </div>
        </div>
      </template>

      <!-- ========== 数据管理（CSV 上传 + 构型绑定） ========== -->
      <template v-else-if="activeMenu === 'data'">
        <div class="page-inner">
          <div class="page-inner-header">
            <h2 class="inner-title">数据管理</h2>
          </div>

          <!-- CSV 上传区域 -->
          <div class="upload-section">
            <div class="section-title">CSV 数据上传</div>
            <div class="upload-form">
              <div class="form-row">
                <el-form-item label="CSV 文件" label-width="80px">
                  <el-upload
                    ref="uploadRef"
                    :auto-upload="false"
                    :limit="1"
                    accept=".csv"
                    :on-change="(f: any) => handleFileChange(f.raw)"
                    drag
                  >
                    <el-icon class="el-icon--upload"><Upload /></el-icon>
                    <div class="el-upload__text">拖拽或点击上传 CSV 文件</div>
                  </el-upload>
                </el-form-item>
              </div>

              <div class="form-row inline-fields">
                <el-form-item label="数据表名" label-width="80px">
                  <el-input
                    v-model="csvTableName"
                    placeholder=""
                    style="width: 200px"
                  />
                </el-form-item>

                <el-form-item label="数据类型" label-width="80px">
                  <el-select v-model="csvDataType" style="width: 160px">
                    <el-option
                      v-for="dt in dataTypeOptions"
                      :key="dt.value"
                      :label="dt.label"
                      :value="dt.value"
                    />
                  </el-select>
                </el-form-item>
              </div>

              <div class="form-row">
                <el-form-item label="关联构型" label-width="80px">
                  <el-select
                    v-model="csvParentItemId"
                    placeholder="选择构型项目（可选）"
                    clearable
                    style="width: 100%"
                    filterable
                  >
                    <el-option
                      v-for="item in configItemStore.selectList"
                      :key="item.itemId"
                      :label="item.label"
                      :value="item.itemId"
                    />
                  </el-select>
                </el-form-item>
              </div>

              <div class="form-actions">
                <el-button @click="analyzeFile" :loading="dataMappingStore.analyzing">
                  分析预览
                </el-button>
                <el-button
                  type="primary"
                  @click="handleCsvUpload"
                  :loading="dataMappingStore.uploading"
                  :disabled="!csvFile || !csvTableName.trim()"
                >
                  <el-icon><Upload /></el-icon> 上传
                </el-button>
              </div>
            </div>

            <!-- 预览结果 -->
            <div v-if="dataMappingStore.previewResult" class="preview-panel">
              <div class="preview-header">
                <span>分析结果：{{ dataMappingStore.previewResult.rowCount }} 行，{{ dataMappingStore.previewResult.columns.length }} 列</span>
              </div>
              <div v-if="dataMappingStore.previewResult.errors?.length" class="preview-errors">
                <div
                  v-for="(err, i) in dataMappingStore.previewResult.errors"
                  :key="i"
                  class="preview-error-item"
                >
                  ⚠ {{ err }}
                </div>
              </div>
              <el-table
                :data="dataMappingStore.previewResult.columns"
                size="small"
                max-height="200"
              >
                <el-table-column prop="columnName" label="列名" />
                <el-table-column prop="columnType" label="列类型" />
                <el-table-column prop="suggestedMapping" label="建议映射" />
              </el-table>
            </div>
          </div>

          <!-- 已上传记录 -->
          <div v-if="dataMappingStore.csvRecords.length > 0" class="records-section">
            <div class="section-title">已上传数据</div>
            <el-table :data="dataMappingStore.csvRecords" size="small">
              <el-table-column prop="tableName" label="表名" />
              <el-table-column prop="dataType" label="数据类型" width="100" />
              <el-table-column prop="uploadedAt" label="上传时间" width="180">
                <template #default="{ row }">
                  {{ row.uploadedAt.slice(0, 19).replace('T', ' ') }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
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

/* ---- 整体布局 ---- */
.workspace-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* ---- 左侧侧边栏 ---- */
.ws-sidebar {
  width: 15%;
  min-width: 160px;
  max-width: 240px;
  background: #0d1f3c;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  color: #c8d8f0;
  user-select: none;
}

.ws-back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px 14px;
  font-size: 13px;
  color: #8cafd4;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  transition: color 0.2s;
}
.ws-back:hover { color: #fff; }

.ws-aircraft-name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px 4px;
}
.ws-aircraft-icon { font-size: 20px; }
.ws-aircraft-title {
  font-size: 15px;
  font-weight: 700;
  color: #e8f0fc;
  word-break: break-all;
}

.ws-aircraft-meta {
  padding: 4px 20px 14px;
  font-size: 12px;
  color: #6888aa;
  line-height: 1.6;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 10px;
}

.ws-menu-list {
  list-style: none;
  margin: 0;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ws-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s, color 0.2s;
}
.ws-menu-item:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.ws-menu-item.active { background: #1a6cf0; color: #fff; font-weight: 600; }
.ws-menu-icon { font-size: 16px; flex-shrink: 0; }
.ws-menu-title { white-space: nowrap; }

/* ---- 右侧内容 ---- */
.ws-content {
  flex: 1;
  background: #f4f6fb;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---- 对话布局 ---- */
.chat-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  height: 100%;
}

.session-panel {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e0e8f5;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.session-panel-header {
  padding: 16px 16px 10px;
  font-size: 13px;
  font-weight: 700;
  color: #0d1f3c;
  border-bottom: 1px solid #f0f3f8;
  flex-shrink: 0;
}

.conn-error {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  background: #fff5f5;
  font-size: 12px;
  color: #c0392b;
  border-bottom: 1px solid #ffd0d0;
  flex-shrink: 0;
}

.conn-info {
  padding: 6px 12px;
  font-size: 12px;
  color: #8c9ab0;
  flex-shrink: 0;
}

.conn-ok {
  padding: 6px 12px;
  font-size: 12px;
  color: #27ae60;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.version-tag {
  font-size: 11px;
  color: #8c9ab0;
  background: #f0f3f8;
  padding: 1px 6px;
  border-radius: 10px;
}

.new-session-row {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f3f8;
  flex-shrink: 0;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
}
.session-row:hover { background: #f0f5ff; border-color: #d0e3ff; }
.session-row:hover .session-del { opacity: 1; }
.session-row.active { background: #eaf1ff; border-color: #1a6cf0; }

.session-title {
  font-size: 13px;
  color: #3a4a5c;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-del {
  opacity: 0;
  transition: opacity 0.15s;
  color: #e74c3c !important;
  flex-shrink: 0;
}

.session-empty {
  font-size: 13px;
  color: #bcc5d0;
  padding: 12px 4px;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f8faff;
}

.chat-main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e0e8f5;
  flex-shrink: 0;
}

.chat-main-title {
  font-size: 15px;
  font-weight: 700;
  color: #0d1f3c;
}

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

/* ---- 数据管理 ---- */
.page-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 28px 32px;
  gap: 20px;
  overflow-y: auto;
}

.page-inner-header {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.inner-title {
  font-size: 18px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.inner-subtitle {
  font-size: 13px;
  color: #8c9ab0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #3a4a5c;
  margin-bottom: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.upload-section {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  border: 1px solid #e0e8f5;
}

.upload-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  width: 100%;
}

.inline-fields {
  display: flex;
  gap: 24px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.preview-panel {
  margin-top: 16px;
  border: 1px solid #d4e3fb;
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  background: #f0f5ff;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #1a6cf0;
}

.preview-errors {
  padding: 8px 12px;
  background: #fff8f0;
}

.preview-error-item {
  font-size: 12px;
  color: #e6a23c;
  line-height: 1.8;
}

.records-section {
  margin-top: 8px;
}

.inner-empty {
  color: #bcc5d0;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}
</style>
