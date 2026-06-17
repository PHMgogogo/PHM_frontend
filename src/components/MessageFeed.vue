<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ChatMessage, MessagePart } from '@/stores/chat'
import { ArrowDown, ArrowUp, SetUp, Warning, QuestionFilled, MagicStick } from '@element-plus/icons-vue'
import { renderMarkdown } from '@/utils/useMarkdown'

const props = defineProps<{
  messages: ChatMessage[]
  sessionBusy: boolean
  currentSid: string
  pendingQuestion: null | {
    id: string
    questions: Array<{ question: string; options: Array<{ label: string }> }>
  }
}>()

const emit = defineEmits<{
  (e: 'question-reply', labels: string[]): void
  (e: 'question-reject'): void
}>()

const feedRef = ref<HTMLElement | null>(null)
const expandedReasoning = ref(new Set<string | number>())
const expandedTools = ref(new Set<string | number>())

watch(
  () => props.currentSid,
  () => {
    expandedReasoning.value = new Set()
    expandedTools.value = new Set()
  },
)

watch(
  () => props.messages,
  async () => {
    await nextTick()
    if (feedRef.value) feedRef.value.scrollTop = feedRef.value.scrollHeight
  },
  { deep: false },
)

function toggleReasoning(id: string | number) {
  const s = new Set(expandedReasoning.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedReasoning.value = s
}

function toggleTool(id: string | number) {
  const s = new Set(expandedTools.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedTools.value = s
}

function toolStateType(state?: MessagePart['state']) {
  if (!state) return 'info'
  const map: Record<string, string> = { pending: 'warning', running: 'primary', completed: 'success', error: 'danger' }
  return map[state.status || ''] || 'info'
}

function toolStateLabel(state?: MessagePart['state']) {
  if (!state) return '未知'
  const map: Record<string, string> = { pending: '等待中', running: '执行中', completed: '已完成', error: '出错' }
  return map[state.status || ''] || (state.status ?? '')
}

function formatJson(obj: unknown) {
  if (!obj) return ''
  try { return JSON.stringify(obj, null, 2) } catch { return String(obj) }
}

</script>

<template>
  <div class="feed-wrapper">
    <div ref="feedRef" class="feed">
      <template v-if="currentSid">
        <div v-if="!messages.length && !sessionBusy" class="empty-hint">
          暂无消息，发送第一条消息开始对话。
        </div>

        <div
          v-for="msg in messages"
          :key="msg.info.id"
          class="bubble"
          :class="msg.info.role === 'user' ? 'bubble-user' : 'bubble-bot'"
        >
          <div class="bubble-role">{{ msg.info.role === 'user' ? '用户' : '助手' }}</div>
          <div class="bubble-body">
            <template v-for="(part, idx) in msg.parts" :key="part.id || idx">
              <!-- 文本 / 流式文本 -->
              <div
                v-if="part.type === 'text' && part.text"
                class="bubble-text markdown-body"
                v-html="renderMarkdown(part.text)"
              />

              <!-- 思考过程 -->
              <div v-else-if="part.type === 'reasoning' && part.text" class="reasoning-block">
                <div class="reasoning-header" @click="toggleReasoning(part.id || idx)">
                  <el-icon><MagicStick /></el-icon>
                  <span>思考过程</span>
                  <el-icon class="toggle-icon">
                    <ArrowUp v-if="expandedReasoning.has(part.id || idx)" />
                    <ArrowDown v-else />
                  </el-icon>
                </div>
                <div v-if="expandedReasoning.has(part.id || idx)" class="reasoning-body">
                  {{ part.text }}
                </div>
              </div>

              <!-- 工具调用 -->
              <div v-else-if="part.type === 'tool'" class="tool-block">
                <div class="tool-header" @click="toggleTool(part.id || idx)">
                  <el-icon><SetUp /></el-icon>
                  <span class="tool-name">{{ part.tool }}</span>
                  <el-tag
                    :type="toolStateType(part.state)"
                    effect="plain"
                    size="small"
                    class="tool-status-tag"
                  >{{ toolStateLabel(part.state) }}</el-tag>
                  <el-icon class="toggle-icon">
                    <ArrowUp v-if="expandedTools.has(part.id || idx)" />
                    <ArrowDown v-else />
                  </el-icon>
                </div>
                <div v-if="expandedTools.has(part.id || idx)" class="tool-body">
                  <div v-if="part.state?.title" class="tool-title">{{ part.state.title }}</div>
                  <div class="tool-section">
                    <span class="tool-label">输入</span>
                    <pre class="tool-code">{{ formatJson(part.state?.input) }}</pre>
                  </div>
                  <div v-if="part.state?.output" class="tool-section">
                    <span class="tool-label">输出</span>
                    <pre class="tool-code output">{{ part.state.output }}</pre>
                  </div>
                  <div v-if="part.state?.error" class="tool-section">
                    <span class="tool-label err-label">错误</span>
                    <pre class="tool-code tool-code-err">{{ part.state.error }}</pre>
                  </div>
                </div>
              </div>
            </template>

            <!-- 助手消息出错 -->
            <div v-if="msg.info.role === 'assistant' && msg.info.error" class="msg-error">
              <el-icon><Warning /></el-icon>
              {{ (msg.info.error as { data?: { message?: string } })?.data?.message || JSON.stringify(msg.info.error) }}
            </div>
          </div>
        </div>

        <!-- 生成中占位 -->
        <!-- <div v-if="sessionBusy" class="bubble bubble-bot">
          <div class="bubble-role">助手</div>
          <div class="bubble-body generating">
            <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
          </div>
        </div> -->
      </template>

      <div v-else class="empty-hint">正在初始化会话，请稍候…</div>
    </div>

    <!-- AI 主动提问面板 -->
    <div v-if="pendingQuestion" class="question-panel">
      <div class="question-text">
        <el-icon><QuestionFilled /></el-icon>
        {{ pendingQuestion.questions[0]?.question }}
      </div>
      <div class="question-options">
        <el-button
          v-for="opt in pendingQuestion.questions[0]?.options"
          :key="opt.label"
          size="small"
          type="primary"
          plain
          @click="emit('question-reply', [opt.label])"
        >{{ opt.label }}</el-button>
        <el-button size="small" type="danger" plain @click="emit('question-reject')">拒绝</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feed-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.feed {
  flex: 1;
  overflow-y: auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.empty-hint {
  color: #8c9ab0;
  font-size: 14px;
  text-align: center;
  margin: auto;
}

.bubble {
  max-width: 80%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bubble-user { align-self: flex-end; }
.bubble-bot { align-self: flex-start; }

.bubble-role {
  font-size: 11px;
  color: #8c9ab0;
  padding: 0 4px;
}
.bubble-user .bubble-role { text-align: right; }

.bubble-body {
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.7;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bubble-user .bubble-body {
  background: #1a6cf0;
  color: #fff;
  border-bottom-right-radius: 2px;
}

.bubble-bot .bubble-body {
  background: #fff;
  color: #1a2840;
  border: 1px solid #d4e3fb;
  border-bottom-left-radius: 2px;
  box-shadow: 0 2px 8px rgba(26, 108, 240, 0.06);
}

.bubble-text {
  margin: 0;
  word-break: break-word;
}
/* markdown 渲染输出块级元素间距 */
.bubble-text :deep(p) {
  margin: 0 0 0.5em;
}
.bubble-text :deep(p:last-child) {
  margin-bottom: 0;
}

/* 表格样式 — 框线与字体同色 */
.bubble-text :deep(table) {
  border-collapse: collapse;
  margin: 0.5em 0;
  width: 100%;
}
.bubble-text :deep(th),
.bubble-text :deep(td) {
  border: 1px solid currentColor;
  padding: 6px 12px;
  text-align: left;
}
.bubble-text :deep(th) {
  font-weight: 600;
  background: rgba(128, 128, 128, 0.15);
}

.markdown-body :deep(ol),
.markdown-body :deep(ul) {
  padding-left: revert;
}

.bubble-text :deep(code) {
  background: rgba(26, 108, 240, 0.1);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 13px;
}

.bubble-user .bubble-text :deep(code) {
  background: rgba(255, 255, 255, 0.2);
}

/* 思考过程 - 米黄色系 */
.reasoning-block {
  border: 1px solid #e8d9b0;
  border-radius: 6px;
  overflow: hidden;
  background: #fdf8ed;
}

.reasoning-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #faf0d7;
  cursor: pointer;
  font-size: 12px;
  color: #8a6c1a;
  user-select: none;
}

.reasoning-header:hover { background: #f5e8c0; }

.reasoning-body {
  padding: 10px 12px;
  font-size: 13px;
  color: #6b4e0a;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

/* 工具调用 - 浅绿色系 */
.tool-block {
  border: 1px solid #b8e8d0;
  border-radius: 6px;
  overflow: hidden;
  background: #edfaf4;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #d8f5e8;
  cursor: pointer;
  font-size: 12px;
  color: #1a6640;
  user-select: none;
}

.tool-header:hover { background: #c5f0dc; }

.tool-name {
  font-family: monospace;
  font-weight: 600;
  color: #0e7c40;
}

.tool-status-tag { margin-left: 4px; }
.toggle-icon { margin-left: auto; }

.tool-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-title { font-size: 12px; color: #0e7c40; font-style: italic; }
.tool-section { display: flex; flex-direction: column; gap: 4px; }

.tool-label {
  font-size: 11px;
  color: #4a7a60;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.err-label { color: #c0392b; }

.tool-code {
  margin: 0;
  padding: 8px 10px;
  background: #f0faf6;
  border: 1px solid #c8eedd;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
  color: #1a3a2a;
}

.tool-code.output { background: #f6fff9; }
.tool-code-err { background: #fff0f0; border-color: #ffc0c0; color: #c0392b; }

.msg-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e74c3c;
  font-size: 13px;
}

/* 打字动画 */
.generating {
  flex-direction: row !important;
  align-items: center;
  gap: 4px !important;
  padding: 12px 16px !important;
}

.typing-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #1a6cf0;
  display: inline-block;
  animation: bounce 1.2s infinite ease-in-out;
}
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* Question 面板 */
.question-panel {
  padding: 12px 16px;
  background: #eaf3ff;
  border-top: 1px solid #c0d8f8;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.question-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #0d1f3c;
  font-weight: 500;
}

.question-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
