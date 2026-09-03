<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { ChatLineRound, Clock, Promotion, RefreshLeft, VideoPause } from '@element-plus/icons-vue'
import type { FeedbackType } from '@/api/knowledge-agent'
import { useKnowledgeAgentStore, type KnowledgeMessage } from '@/stores/knowledge-agent'
import AgentMessage from './AgentMessage.vue'
import SessionDrawer from './SessionDrawer.vue'
import SourceDrawer from './SourceDrawer.vue'

const props = defineProps<{
  suggestedQuery?: string
  suggestionNonce?: number
}>()

const store = useKnowledgeAgentStore()
const input = ref('')
const feed = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const sourceDrawerVisible = ref(false)
const selectedSources = ref<KnowledgeMessage['sources']>([])
const sessionDrawerVisible = ref(false)
const correctionVisible = ref(false)
const correctionText = ref('')
const correctionTarget = ref<KnowledgeMessage | null>(null)

onMounted(() => store.init())

watch(
  () => props.suggestionNonce,
  () => {
    if (props.suggestedQuery) input.value = props.suggestedQuery
  },
)

watch(
  () =>
    store.messages
      .map((message) => `${message.id}:${message.content.length}:${message.runState}`)
      .join('|'),
  async () => {
    if (!stickToBottom.value) return
    await nextTick()
    if (feed.value) feed.value.scrollTop = feed.value.scrollHeight
  },
)

function handleFeedScroll(): void {
  const element = feed.value
  if (!element) return
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 72
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

function openSession(id: string): void {
  sessionDrawerVisible.value = false
  void store.openLocalSession(id)
}

function startNewConversation(): void {
  store.newConversation()
  sessionDrawerVisible.value = false
}
</script>

<template>
  <section class="agent-panel" aria-labelledby="knowledge-agent-title">
    <header class="agent-toolbar">
      <div>
        <div class="agent-title-row">
          <span class="agent-logo"><el-icon><ChatLineRound /></el-icon></span>
          <div>
            <h3 id="knowledge-agent-title">知识库 Agent</h3>
            <p>最终依据与可信状态以服务端 <code>done</code> 事件为准。</p>
          </div>
        </div>
      </div>
      <div class="agent-tools">
        <el-segmented v-model="store.mode" :options="[
          { label: 'Thinking', value: 'thinking' },
          { label: 'Fast', value: 'fast' },
        ]" :disabled="store.running" />
        <el-tooltip
          :content="store.mode === 'thinking' ? '完整意图、检索、评估与生成流程' : '直接检索并生成，延迟更低'"
        >
          <span class="mode-help">{{ store.mode === 'thinking' ? '完整分析' : '低延迟' }}</span>
        </el-tooltip>
        <el-button :icon="Clock" @click="sessionDrawerVisible = true">本设备会话</el-button>
        <el-button :icon="RefreshLeft" @click="store.newConversation">新对话</el-button>
      </div>
    </header>

    <div ref="feed" class="message-feed" data-testid="agent-message-feed" @scroll="handleFeedScroll">
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

    <footer class="composer">
      <div v-if="store.sessionId" class="session-chip">
        当前会话：{{ store.sessionId.slice(0, 8) }}… · 仅 ID 保存于本设备
      </div>
      <el-input
        v-model="input"
        type="textarea"
        :rows="3"
        resize="none"
        maxlength="4000"
        show-word-limit
        placeholder="输入问题；Enter 发送，Shift+Enter 换行"
        @keydown.enter.exact.prevent="submit"
      />
      <div class="composer-actions">
        <span>
          {{ store.mode === 'fast' ? 'Fast 仅显示检索与生成阶段' : 'Thinking 会展示完整公开阶段' }}
        </span>
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
.agent-toolbar { display: flex; justify-content: space-between; gap: 18px; align-items: center; background: #fff; border-bottom: 1px solid #e7ecf4; padding: 15px 18px; }
.agent-title-row { display: flex; align-items: center; gap: 11px; }
.agent-logo { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; color: #fff; background: linear-gradient(135deg,#1a6cf0,#5a8ff3); font-size: 20px; }
.agent-toolbar h3 { color: #14294a; margin: 0; font-size: 16px; }
.agent-toolbar p { color: #8996aa; margin: 3px 0 0; font-size: 11px; }
.agent-toolbar code { color: #1a6cf0; }
.agent-tools { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; justify-content: flex-end; }
.mode-help { color: #7c899e; font-size: 11px; border-bottom: 1px dotted currentColor; }
.message-feed { overflow-y: auto; display: flex; flex-direction: column; gap: 16px; padding: 22px clamp(14px, 3vw, 34px); scroll-behavior: smooth; }
.agent-empty { min-height: 100%; display: grid; place-content: center; justify-items: center; text-align: center; padding: 30px; }
.empty-mark { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; color: #1a6cf0; background: #eaf2ff; font-size: 28px; margin-bottom: 14px; }
.agent-empty h3 { color: #1c3151; font-size: 18px; margin: 0; }
.agent-empty > p { color: #7e8ca1; max-width: 560px; line-height: 1.65; font-size: 13px; }
.example-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; width: min(720px, 100%); margin-top: 12px; }
.example-grid button { color: #425979; background: #fff; border: 1px solid #dce5f2; border-radius: 10px; padding: 11px; cursor: pointer; line-height: 1.5; transition: border-color .2s, color .2s; }
.example-grid button:hover { border-color: #7caaf8; color: #1a6cf0; }
.composer { background: #fff; border-top: 1px solid #e3e9f2; padding: 12px 16px 14px; }
.session-chip { color: #78869b; font-size: 10px; margin-bottom: 7px; }
.composer-actions { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 9px; }
.composer-actions > span { color: #8996aa; font-size: 11px; }
.correction-note { color: #6f7d91; background: #f5f8fc; border-radius: 8px; padding: 10px; font-size: 12px; }
@media (max-width: 900px) { .agent-panel { min-height: 640px; height: calc(100vh - 210px); } .agent-toolbar { align-items: flex-start; flex-direction: column; } .agent-tools { justify-content: flex-start; } .example-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .agent-panel { min-height: 620px; height: calc(100vh - 190px); border-radius: 12px; } .agent-tools { width: 100%; } .agent-tools .el-button { flex: 1; } .message-feed { padding: 14px 10px; } }
</style>
