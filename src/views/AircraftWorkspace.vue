<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAircraftStore } from '@/stores/aircraft'
import { useChatStore } from '@/stores/chat'
import { useDataSourceStore } from '@/stores/dataSource'
import { useAlgorithmStore } from '@/stores/algorithm'
import MessageFeed from '@/components/MessageFeed.vue'
import AddAircraftDialog from '@/components/AddAircraftDialog.vue'
import {
  ArrowLeft, Refresh, VideoPause, Plus, Delete,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const aircraftStore = useAircraftStore()
const chatStore = useChatStore()
const dsStore = useDataSourceStore()
const algStore = useAlgorithmStore()

const aircraftId = computed(() => route.params.id as string)
const aircraft = computed(() => aircraftStore.aircrafts.find((a) => a.id === aircraftId.value))
const config = computed(() =>
  aircraft.value?.configId
    ? aircraftStore.configs.find((c) => c.id === aircraft.value!.configId)
    : undefined,
)

const activeMenu = ref('chat')
const workspaceMenus = [
  { key: 'chat', icon: '💬', title: '对话入口' },
  { key: 'data', icon: '🗂️', title: '数据管理' },
  { key: 'algorithm', icon: '🧠', title: '算法管理' },
]

// ----  Chat ----
const inputText = ref('')

onMounted(() => {
  chatStore.autoConnect()
})
onUnmounted(() => {
  chatStore.dispose()
})

function handleSendKey(e: KeyboardEvent) {
  if (e.ctrlKey && !chatStore.sessionBusy) {
    chatStore.inputText = inputText.value
    inputText.value = ''
    chatStore.handleSend()
  }
}

function syncInput() {
  chatStore.inputText = inputText.value
}

async function sendMessage() {
  chatStore.inputText = inputText.value
  inputText.value = ''
  await chatStore.handleSend()
}

// ---- 数据管理 ----
const showConfigDialog = ref(false)
const dsDialogVisible = ref(false)
const dsForm = ref({ name: '', selectedFields: [] as string[] })

const aircraftDataSources = computed(() => dsStore.getByAircraft(aircraftId.value))

const configFields = computed(() =>
  config.value ? Object.keys(config.value.mappings) : [],
)

function openCreateDs() {
  dsForm.value = { name: '', selectedFields: [] }
  dsDialogVisible.value = true
}

function submitDs() {
  if (!dsForm.value.name.trim()) {
    ElMessage.warning('请输入数据源名称')
    return
  }
  if (dsForm.value.selectedFields.length === 0) {
    ElMessage.warning('请至少选择一个字段')
    return
  }
  dsStore.add({
    aircraftId: aircraftId.value,
    name: dsForm.value.name.trim(),
    selectedFields: dsForm.value.selectedFields,
  })
  ElMessage.success('算法数据源已创建')
  dsDialogVisible.value = false
}

async function deleteDs(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确定要删除数据源"${name}"吗？`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    dsStore.remove(id)
    // 同步删除使用该数据源的算法
    algStore.algorithms
      .filter((a) => a.dataSourceId === id)
      .forEach((a) => algStore.remove(a.id))
    ElMessage.success('数据源已删除')
  } catch { /* cancelled */ }
}

// ---- 算法管理 ----
const algDialogVisible = ref(false)
const algForm = ref({ name: '', dataSourceId: '' })

const aircraftAlgorithms = computed(() => algStore.getByAircraft(aircraftId.value))

function openCreateAlg() {
  algForm.value = { name: '', dataSourceId: '' }
  algDialogVisible.value = true
}

function submitAlg() {
  if (!algForm.value.name.trim()) {
    ElMessage.warning('请输入算法名称')
    return
  }
  if (!algForm.value.dataSourceId) {
    ElMessage.warning('请选择算法数据源')
    return
  }
  const ds = aircraftDataSources.value.find((d) => d.id === algForm.value.dataSourceId)
  algStore.add({
    aircraftId: aircraftId.value,
    name: algForm.value.name.trim(),
    dataSourceId: algForm.value.dataSourceId,
    dataSourceName: ds?.name ?? '',
  })
  ElMessage.success('算法已创建')
  algDialogVisible.value = false
}

async function deleteAlg(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确定要删除算法"${name}"吗？`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    algStore.remove(id)
    ElMessage.success('算法已删除')
  } catch { /* cancelled */ }
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
        <span class="ws-aircraft-title">{{ aircraft.name }}</span>
      </div>
      <div class="ws-aircraft-type">{{ aircraft.type }}</div>
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
          <!-- 会话列表面板 -->
          <div class="session-panel">
            <div class="session-panel-header">会话管理</div>

            <!-- 连接状态 -->
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

            <!-- 新建会话 -->
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

            <!-- 会话列表 -->
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

          <!-- 聊天主区域 -->
          <div class="chat-main">
            <div class="chat-main-header">
              <span class="chat-main-title">对话</span>
              <div class="chat-header-actions">
                <!-- 模型选择 -->
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

            <!-- 消息流 -->
            <MessageFeed
              :messages="chatStore.messages"
              :session-busy="chatStore.sessionBusy"
              :current-sid="chatStore.currentSid"
              :pending-question="chatStore.pendingQuestion"
              @question-reply="chatStore.handleQuestionReply"
              @question-reject="chatStore.handleQuestionReject"
            />

            <!-- 输入区 -->
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

      <!-- ========== 数据管理 ========== -->
      <template v-else-if="activeMenu === 'data'">
        <div class="page-inner">
          <div class="page-inner-header">
            <h2 class="inner-title">数据管理</h2>
          </div>

          <!-- 无构型提示 -->
          <template v-if="!config">
            <div class="gate-empty">
              <div class="gate-icon">🗂️</div>
              <p class="gate-msg">当前飞行器尚未配置构型，请先完成构型配置。</p>
              <el-button type="primary" @click="showConfigDialog = true">编辑构型</el-button>
            </div>
          </template>

          <!-- 已有构型 -->
          <template v-else>
            <div class="toolbar">
              <div class="config-badge">
                构型：<strong>{{ config.configName }}</strong>
              </div>
              <el-button type="primary" @click="openCreateDs">
                <el-icon><Plus /></el-icon> 创建算法数据源
              </el-button>
            </div>

            <!-- 数据源列表 -->
            <div v-if="aircraftDataSources.length === 0" class="inner-empty">
              <p>暂无算法数据源，点击上方按钮创建</p>
            </div>
            <el-table v-else :data="aircraftDataSources" class="entity-table">
              <el-table-column prop="name" label="名称" min-width="160" />
              <el-table-column label="所需数据" min-width="240">
                <template #default="{ row }">
                  <div class="field-tags">
                    <el-tag
                      v-for="f in row.selectedFields"
                      :key="f"
                      size="small"
                      type="primary"
                      effect="plain"
                    >{{ f }}</el-tag>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button type="danger" link size="small" @click="deleteDs(row.id, row.name)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </div>
      </template>

      <!-- ========== 算法管理 ========== -->
      <template v-else-if="activeMenu === 'algorithm'">
        <div class="page-inner">
          <div class="page-inner-header">
            <h2 class="inner-title">算法管理</h2>
          </div>

          <!-- 无数据源提示 -->
          <template v-if="aircraftDataSources.length === 0">
            <div class="gate-empty">
              <div class="gate-icon">🧠</div>
              <p class="gate-msg">
                请先在「数据管理」中创建算法数据源，才能创建算法。
              </p>
              <el-button type="primary" @click="activeMenu = 'data'">前往数据管理</el-button>
            </div>
          </template>

          <!-- 已有数据源 -->
          <template v-else>
            <div class="toolbar">
              <el-button type="primary" @click="openCreateAlg">
                <el-icon><Plus /></el-icon> 创建算法
              </el-button>
            </div>

            <div v-if="aircraftAlgorithms.length === 0" class="inner-empty">
              <p>暂无算法，点击上方按钮创建</p>
            </div>
            <el-table v-else :data="aircraftAlgorithms" class="entity-table">
              <el-table-column prop="name" label="名称" min-width="160" />
              <el-table-column prop="dataSourceName" label="数据源" min-width="160" />
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="algStore.STATUS_TYPES[row.status]" effect="plain" size="small">
                    {{ algStore.STATUS_LABELS[row.status] }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button type="danger" link size="small" @click="deleteAlg(row.id, row.name)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </div>
      </template>
    </main>
  </div>

  <!-- 复用构型管理弹窗（编辑构型入口） -->
  <AddAircraftDialog v-model:visible="showConfigDialog" />

  <!-- 创建算法数据源弹窗 -->
  <el-dialog v-model="dsDialogVisible" title="创建算法数据源" width="480px" :close-on-click-modal="false">
    <el-form label-width="100px">
      <el-form-item label="数据源名称" required>
        <el-input v-model="dsForm.name" placeholder="例：发动机健康监测数据源" clearable />
      </el-form-item>
      <el-form-item label="选择字段" required>
        <el-checkbox-group v-model="dsForm.selectedFields" class="field-checkbox-group">
          <el-checkbox v-for="field in configFields" :key="field" :label="field">
            {{ field }}
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dsDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitDs">创建</el-button>
    </template>
  </el-dialog>

  <!-- 创建算法弹窗 -->
  <el-dialog v-model="algDialogVisible" title="创建算法" width="440px" :close-on-click-modal="false">
    <el-form label-width="100px">
      <el-form-item label="算法名称" required>
        <el-input v-model="algForm.name" placeholder="例：发动机寿命预测算法" clearable />
      </el-form-item>
      <el-form-item label="算法数据源" required>
        <el-select v-model="algForm.dataSourceId" placeholder="请选择数据源" style="width: 100%">
          <el-option
            v-for="ds in aircraftDataSources"
            :key="ds.id"
            :label="ds.name"
            :value="ds.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="algDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitAlg">创建</el-button>
    </template>
  </el-dialog>
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

.ws-aircraft-type {
  padding: 0 20px 14px;
  font-size: 12px;
  color: #6888aa;
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

/* 会话面板 */
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

/* 聊天主区域 */
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

/* ---- 数据管理 / 算法管理 ---- */
.page-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 28px 32px;
  gap: 20px;
}

.page-inner-header {
  flex-shrink: 0;
}

.inner-title {
  font-size: 18px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.config-badge {
  font-size: 13px;
  color: #3a4a5c;
}
.config-badge strong { color: #1a6cf0; }

.entity-table {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
}

.field-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 无构型/无数据源 门控 */
.gate-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.gate-icon { font-size: 56px; opacity: 0.5; }

.gate-msg {
  font-size: 15px;
  color: #8c9ab0;
  margin: 0;
  text-align: center;
  max-width: 360px;
}

.inner-empty {
  color: #bcc5d0;
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}

.field-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
