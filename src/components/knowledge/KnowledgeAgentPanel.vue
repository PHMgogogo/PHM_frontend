<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDownBold,
  ChatLineRound,
  Clock,
  Promotion,
  RefreshLeft,
  VideoPause,
} from '@element-plus/icons-vue'
import type { FeedbackType } from '@/api/knowledge-agent'
import { useKnowledgeAgentStore, type KnowledgeMessage } from '@/stores/knowledge-agent'
import { BottomScrollScheduler, bottomDistance, isNearBottom } from '@/utils/chat-scroll'
import AgentMessage from './AgentMessage.vue'
import SessionDrawer from './SessionDrawer.vue'
import SourceDrawer from './SourceDrawer.vue'

const props = defineProps<{
  active?: boolean
  suggestedQuery?: string
  suggestionNonce?: number
}>()

const store = useKnowledgeAgentStore()
const input = ref('')
const feed = ref<HTMLElement | null>(null)
const messageList = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const bottomDistancePx = ref(0)
const sourceDrawerVisible = ref(false)
const selectedSources = ref<KnowledgeMessage['sources']>([])
const sessionDrawerVisible = ref(false)
const correctionVisible = ref(false)
const correctionText = ref('')
const correctionTarget = ref<KnowledgeMessage | null>(null)
const showScrollToLatest = computed(
  () => !stickToBottom.value && bottomDistancePx.value > 72,
)
function latestMessage(): KnowledgeMessage | undefined {
  return store.messages[store.messages.length - 1]
}

const latestLayoutSignature = computed(() => {
  const last = latestMessage()
  return [
    store.messages.length,
    last?.id,
    last?.content.length,
    last?.runState,
    last?.stages?.length,
    last?.sources?.length,
    last?.metadata?.route,
    last?.metadata?.confidence,
  ].join(':')
})
const liveAnnouncement = computed(() => {
  if (store.historyLoading) return '正在加载本设备会话'
  const last = latestMessage()
  if (!last || last.role !== 'assistant') return ''
  if (store.running) return last.statusText || '知识库 Agent 正在回答'
  if (last.runState === 'completed') {
    return last.metadata?.route === 'degraded' ? '回答完成，当前为降级路径' : '回答完成'
  }
  const terminalLabels: Record<string, string> = {
    interrupted: '回答在完成前中断',
    cancelled: '回答已取消',
    error: '回答失败',
  }
  return terminalLabels[last.runState || ''] || ''
})

const scrollScheduler = new BottomScrollScheduler(
  (callback) => window.requestAnimationFrame(callback),
  (frameId) => window.cancelAnimationFrame(frameId),
)
let resizeObserver: ResizeObserver | null = null

function isPanelActive(): boolean {
  return props.active !== false
}

function refreshScrollState(userIntent = false): void {
  const element = feed.value
  if (!element) return
  bottomDistancePx.value = bottomDistance(element)
  if (isNearBottom(element)) {
    stickToBottom.value = true
    return
  }
  if (userIntent) {
    stickToBottom.value = false
    scrollScheduler.invalidate()
  }
}

async function scheduleScrollToBottom(): Promise<void> {
  if (!stickToBottom.value || !isPanelActive()) return
  await nextTick()
  const element = feed.value
  if (!element || !stickToBottom.value || !isPanelActive()) return
  scrollScheduler.schedule(
    element,
    () => stickToBottom.value && feed.value === element && isPanelActive(),
    () => refreshScrollState(),
  )
}

function resetScrollContext(): void {
  scrollScheduler.invalidate()
  stickToBottom.value = true
  bottomDistancePx.value = 0
  void scheduleScrollToBottom()
}

watch(
  () => props.suggestionNonce,
  () => {
    if (props.suggestedQuery) input.value = props.suggestedQuery
  },
)

watch(
  latestLayoutSignature,
  async () => {
    if (stickToBottom.value) await scheduleScrollToBottom()
    else refreshScrollState()
  },
  { flush: 'post' },
)

watch(
  () => props.active,
  (active) => {
    if (active) resetScrollContext()
    else scrollScheduler.invalidate()
  },
)

function handleFeedScroll(): void {
  refreshScrollState(true)
}

function returnToLatest(): void {
  resetScrollContext()
}

async function submit(): Promise<void> {
  const prompt = input.value.trim()
  if (!prompt || store.running) return
  input.value = ''
  stickToBottom.value = true
  await store.send(prompt)
}

function useExample(prompt: string): void {
  input.value = prompt
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submit()
}

function openSources(message: KnowledgeMessage): void {
  selectedSources.value = message.sources ?? []
  sourceDrawerVisible.value = true
}

async function handleFeedback(message: KnowledgeMessage, type: FeedbackType): Promise<void> {
  if (type === 'CORRECTION') {
    correctionTarget.value = message
    correctionText.value = ''
    correctionVisible.value = true
    return
  }
  await store.sendFeedback(message.id, type)
}

async function submitCorrection(): Promise<void> {
  const target = correctionTarget.value
  if (!target || !correctionText.value.trim()) return
  const submitted = await store.sendFeedback(
    target.id,
    'CORRECTION',
    '用户提供了纠正答案',
    correctionText.value,
  )
  if (submitted) correctionVisible.value = false
}

async function openSession(id: string): Promise<void> {
  sessionDrawerVisible.value = false
  resetScrollContext()
  await store.openLocalSession(id)
  await scheduleScrollToBottom()
}

function startNewConversation(): void {
  resetScrollContext()
  store.newConversation()
  sessionDrawerVisible.value = false
}

onMounted(async () => {
  store.init()
  await nextTick()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (stickToBottom.value) void scheduleScrollToBottom()
      else refreshScrollState()
    })
    if (feed.value) resizeObserver.observe(feed.value)
    if (messageList.value) resizeObserver.observe(messageList.value)
  }
  if (props.active !== false) await scheduleScrollToBottom()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  scrollScheduler.invalidate()
})
</script>

<template>
  <section class="agent-panel" aria-labelledby="knowledge-agent-title">
    <header class="agent-toolbar" data-testid="agent-toolbar">
      <div class="agent-identity">
        <span class="agent-logo"><el-icon><ChatLineRound /></el-icon></span>
        <div>
          <h3 id="knowledge-agent-title">知识库 Agent</h3>
          <p>回答会标注检索路径、证据来源与可信状态。</p>
        </div>
      </div>
      <div class="toolbar-controls">
        <div class="mode-control" data-testid="agent-mode-control">
          <span class="control-label">回答模式</span>
          <el-segmented v-model="store.mode" :options="[
            { label: 'Thinking', value: 'thinking' },
            { label: 'Fast', value: 'fast' },
          ]" :disabled="store.running" />
          <el-tooltip
            :content="store.mode === 'thinking' ? '完整执行意图、检索、评估与回答流程' : '直接检索并回答，响应更快'"
          >
            <span class="mode-help">
              {{ store.mode === 'thinking' ? '适合复杂诊断' : '适合快速查证' }}
            </span>
          </el-tooltip>
        </div>
        <div class="conversation-actions">
          <el-button :icon="Clock" @click="sessionDrawerVisible = true">本设备会话</el-button>
          <el-button :icon="RefreshLeft" @click="startNewConversation">新对话</el-button>
        </div>
      </div>
    </header>

    <div class="message-stage" data-testid="agent-message-stage">
      <div
        ref="feed"
        class="message-feed"
        data-testid="agent-message-feed"
        role="log"
        aria-label="知识库 Agent 对话记录"
        :aria-busy="store.running"
        @scroll="handleFeedScroll"
      >
        <div ref="messageList" class="message-list">
          <div v-if="store.messages.length === 0" class="agent-empty">
            <div class="empty-mark"><el-icon><ChatLineRound /></el-icon></div>
            <h3>围绕知识库证据提问</h3>
            <p>Agent 会展示可验证阶段、最终路径、来源与可信状态；不会展示原始内部推理。</p>
            <div class="example-grid">
              <button type="button" @click="useExample('轴承温度和振动同时升高时，应优先检查哪些故障模式？')">
                轴承温度与振动同时升高
              </button>
              <button type="button" @click="useExample('请基于知识库整理液压压力异常的排查步骤，并指出证据缺口。')">
                液压压力异常排查
              </button>
              <button type="button" @click="useExample('现有资料对传感器漂移有哪些判定依据？')">
                传感器漂移判据
              </button>
            </div>
          </div>

          <AgentMessage
            v-for="message in store.messages"
            :key="message.id"
            :message="message"
            :feedback-enabled="store.capabilities.feedback"
            @sources="openSources"
            @feedback="handleFeedback"
            @retry="store.retryMessage"
          />
        </div>
      </div>
      <el-button
        v-if="showScrollToLatest"
        class="scroll-latest"
        type="primary"
        plain
        round
        :icon="ArrowDownBold"
        @click="returnToLatest"
      >
        回到最新回答
      </el-button>
      <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ liveAnnouncement }}
      </p>
    </div>

    <footer class="composer" data-testid="agent-composer">
      <div class="composer-context">
        <span v-if="store.sessionId" class="session-chip">
          当前会话：{{ store.sessionId.slice(0, 8) }}… · 仅 ID 保存于本设备
        </span>
        <span class="mode-context">
          {{ store.mode === 'fast' ? 'Fast · 快速查证' : 'Thinking · 完整诊断' }}
        </span>
      </div>
      <el-input
        v-model="input"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 5 }"
        resize="none"
        maxlength="4000"
        show-word-limit
        placeholder="输入问题；Enter 发送，Shift+Enter 换行"
        @keydown="handleComposerKeydown"
      />
      <div class="composer-actions">
        <span>Enter 发送 · Shift+Enter 换行</span>
        <el-button
          v-if="store.running"
          type="warning"
          plain
          :icon="VideoPause"
          @click="store.cancelActive"
        >
          取消
        </el-button>
        <el-button v-else type="primary" :icon="Promotion" :disabled="!input.trim()" @click="submit">
          发送
        </el-button>
      </div>
    </footer>

    <SourceDrawer
      v-model="sourceDrawerVisible"
      :sources="selectedSources || []"
    />
    <SessionDrawer
      v-model="sessionDrawerVisible"
      :sessions="store.localSessions"
      :current-session-id="store.sessionId"
      :loading="store.historyLoading"
      :error="store.historyError"
      @open="openSession"
      @forget="store.forgetSession"
      @new="startNewConversation"
    />

    <el-dialog v-model="correctionVisible" title="提供纠正答案" width="min(560px, 92vw)">
      <p class="correction-note">纠正会写入 RAG 反馈/记忆系统，仅在部署已授权反馈写入时可用。</p>
      <el-input
        v-model="correctionText"
        type="textarea"
        :rows="6"
        maxlength="8000"
        show-word-limit
        placeholder="填写你认为更准确的答案"
      />
      <template #footer>
        <el-button @click="correctionVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!correctionText.trim()" @click="submitCorrection">
          提交纠正
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.agent-panel { min-height: 680px; height: calc(100vh - 230px); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; background: #f7f9fc; border: 1px solid #e2e8f1; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(13,31,60,.05); }
.agent-toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: 18px; align-items: center; background: #fff; border-bottom: 1px solid #e7ecf4; padding: 15px 18px; }
.agent-identity { display: flex; align-items: center; gap: 11px; min-width: 0; }
.agent-logo { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; color: #fff; background: linear-gradient(135deg,#1a6cf0,#5a8ff3); font-size: 20px; }
.agent-toolbar h3 { color: #14294a; margin: 0; font-size: 16px; }
.agent-toolbar p { color: #8996aa; margin: 3px 0 0; font-size: 11px; }
.toolbar-controls { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px 12px; min-width: 0; }
.mode-control { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; padding: 4px 5px 4px 9px; border: 1px solid #e6ebf3; border-radius: 11px; background: #f8fafd; }
.control-label { color: #596b86; font-size: 11px; font-weight: 600; white-space: nowrap; }
.mode-help { color: #7c899e; font-size: 11px; border-bottom: 1px dotted currentColor; }
.conversation-actions { display: flex; align-items: center; gap: 8px; }
.conversation-actions :deep(.el-button + .el-button) { margin-left: 0; }
.message-stage { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.message-feed { height: 100%; min-width: 0; overflow-y: auto; padding: 22px clamp(14px, 3vw, 34px) 64px; scrollbar-gutter: stable; }
.message-list { min-height: 100%; display: flex; flex-direction: column; gap: 16px; }
.scroll-latest { position: absolute; z-index: 3; left: 50%; bottom: 14px; transform: translateX(-50%); box-shadow: 0 8px 24px rgba(26,108,240,.18); }
.agent-empty { min-height: 100%; display: grid; place-content: center; justify-items: center; text-align: center; padding: 30px; }
.empty-mark { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; color: #1a6cf0; background: #eaf2ff; font-size: 28px; margin-bottom: 14px; }
.agent-empty h3 { color: #1c3151; font-size: 18px; margin: 0; }
.agent-empty > p { color: #7e8ca1; max-width: 560px; line-height: 1.65; font-size: 13px; }
.example-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; width: min(720px, 100%); margin-top: 12px; }
.example-grid button { color: #425979; background: #fff; border: 1px solid #dce5f2; border-radius: 10px; padding: 11px; cursor: pointer; line-height: 1.5; transition: border-color .2s, color .2s; }
.example-grid button:hover { border-color: #7caaf8; color: #1a6cf0; }
.composer { min-width: 0; background: #fff; border-top: 1px solid #e3e9f2; padding: 11px 16px 13px; box-shadow: 0 -8px 22px rgba(20,41,74,.025); }
.composer-context { min-width: 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 7px; }
.session-chip, .mode-context { color: #78869b; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mode-context { flex: 0 0 auto; color: #5d7292; }
.composer :deep(.el-textarea__inner) { border-radius: 11px; padding: 11px 12px 22px; line-height: 1.55; box-shadow: 0 0 0 1px #dfe6f0 inset; transition: box-shadow .2s ease; }
.composer :deep(.el-textarea__inner:focus) { box-shadow: 0 0 0 1px #5f98f6 inset, 0 0 0 3px rgba(26,108,240,.08); }
.composer-actions { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 9px; }
.composer-actions > span { color: #8996aa; font-size: 11px; }
.correction-note { color: #6f7d91; background: #f5f8fc; border-radius: 8px; padding: 10px; font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 900px) { .agent-panel { min-height: 640px; height: calc(100vh - 210px); } .agent-toolbar { grid-template-columns: 1fr; align-items: start; } .toolbar-controls { justify-content: space-between; } .mode-control { flex: 1 1 310px; } .example-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .agent-panel { min-height: 620px; height: calc(100vh - 190px); border-radius: 12px; } .toolbar-controls, .conversation-actions { width: 100%; } .conversation-actions .el-button { flex: 1; } .message-feed { padding: 14px 10px 60px; } .composer { padding-inline: 12px; } }
@media (prefers-reduced-motion: reduce) { .example-grid button, .composer :deep(.el-textarea__inner) { transition: none; } }
</style>
