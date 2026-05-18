<template>
  <div class="feed-wrapper">
    <!-- 消息流 -->
    <div ref="feedRef" class="feed">
      <template v-if="currentSid">
        <div v-if="!messages.length && !sessionBusy" class="empty-hint center">
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
              <!-- 文本 -->
              <p v-if="part.type === 'text' && part.text" class="bubble-text">{{ part.text }}</p>

              <!-- 推理过程 -->
              <div v-else-if="part.type === 'reasoning' && part.text" class="reasoning-block">
                <div class="reasoning-header" @click="toggleReasoning(part.id || idx)">
                  <el-icon class="reasoning-icon"><MagicStick /></el-icon>
                  <span>思考过程</span>
                  <el-icon class="toggle-icon">
                    <component :is="expandedReasoning.has(part.id || idx) ? ArrowUp : ArrowDown" />
                  </el-icon>
                </div>
                <div v-if="expandedReasoning.has(part.id || idx)" class="reasoning-body">
                  {{ part.text }}
                </div>
              </div>

              <!-- 工具调用 -->
              <div v-else-if="part.type === 'tool'" class="tool-block">
                <div class="tool-header" @click="toggleTool(part.id || idx)">
                  <el-icon class="tool-icon"><SetUp /></el-icon>
                  <span class="tool-name">{{ part.tool }}</span>
                  <el-tag
                    :type="toolStateType(part.state)"
                    effect="dark"
                    size="small"
                    class="tool-status-tag"
                  >{{ toolStateLabel(part.state) }}</el-tag>
                  <el-icon class="toggle-icon">
                    <component :is="expandedTools.has(part.id || idx) ? ArrowUp : ArrowDown" />
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
              {{ msg.info.error?.data?.message || JSON.stringify(msg.info.error) }}
            </div>
          </div>
        </div>

        <!-- 生成中占位 -->
        <div v-if="sessionBusy" class="bubble bubble-bot generating">
          <div class="bubble-role">助手</div>
          <div class="bubble-body">
            <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
          </div>
        </div>
      </template>

      <div v-else class="empty-hint center">请先连接服务并选择或创建一个会话。</div>
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
          @click="$emit('question-reply', [opt.label])"
        >
          {{ opt.label }}
        </el-button>
        <el-button size="small" type="danger" plain @click="$emit('question-reject')">
          拒绝
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import {
  SetUp, Warning, ArrowDown, ArrowUp, QuestionFilled, MagicStick,
} from '@element-plus/icons-vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  sessionBusy: { type: Boolean, default: false },
  currentSid: { type: String, default: '' },
  pendingQuestion: { type: Object, default: null },
})

defineEmits(['question-reply', 'question-reject'])

const feedRef = ref(null)

// 推理/工具折叠状态（组件内部管理，与会话无关的 UI 状态）
const expandedReasoning = ref(new Set())
const expandedTools = ref(new Set())

// 切换会话时重置展开状态
watch(() => props.currentSid, () => {
  expandedReasoning.value = new Set()
  expandedTools.value = new Set()
})

// 消息更新时自动滚到底部
watch(() => props.messages, async () => {
  await nextTick()
  if (feedRef.value) {
    feedRef.value.scrollTop = feedRef.value.scrollHeight
  }
}, { deep: false })

function toggleReasoning(id) {
  const s = new Set(expandedReasoning.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedReasoning.value = s
}

function toggleTool(id) {
  const s = new Set(expandedTools.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedTools.value = s
}

function toolStateType(state) {
  if (!state) return 'info'
  const map = { pending: 'warning', running: 'primary', completed: 'success', error: 'danger' }
  return map[state.status] || 'info'
}

function toolStateLabel(state) {
  if (!state) return '未知'
  const map = { pending: '等待中', running: '执行中', completed: '已完成', error: '出错' }
  return map[state.status] || state.status
}

function formatJson(obj) {
  if (!obj) return ''
  try { return JSON.stringify(obj, null, 2) } catch { return String(obj) }
}
</script>

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
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.empty-hint { color: #4a6a80; font-size: 13px; padding: 8px 0; }
.empty-hint.center { margin: auto; text-align: center; }

/* 气泡 */
.bubble {
  max-width: 82%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bubble-user { align-self: flex-end; }
.bubble-bot { align-self: flex-start; }

.bubble-role { font-size: 11px; color: #4a6a80; padding: 0 4px; }
.bubble-user .bubble-role { text-align: right; }

.bubble-body {
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bubble-user .bubble-body {
  background: #1677ff;
  color: #fff;
  border-bottom-right-radius: 2px;
}

.bubble-bot .bubble-body {
  background: #112240;
  color: #c8ddf0;
  border: 1px solid #1a3a5c;
  border-bottom-left-radius: 2px;
}

.bubble-text { margin: 0; white-space: pre-wrap; word-break: break-word; }

/* 推理块 */
.reasoning-block { border: 1px solid #5a4a20; border-radius: 6px; overflow: hidden; }

.reasoning-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #2a1f0a;
  cursor: pointer;
  font-size: 12px;
  color: #d4a940;
  user-select: none;
}

.reasoning-header:hover { background: #3a2a0e; }
.reasoning-icon { color: #d4a940; }

.reasoning-body {
  padding: 10px 12px;
  font-size: 13px;
  color: #c8aa6e;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  background: #1a1408;
}

/* 工具调用块 */
.tool-block { border: 1px solid #1a3a5c; border-radius: 6px; overflow: hidden; }

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #0d2a4a;
  cursor: pointer;
  font-size: 12px;
  color: #5baef5;
  user-select: none;
}

.tool-header:hover { background: #103660; }
.tool-icon { color: #40a9ff; }
.tool-name { font-family: monospace; font-weight: 600; color: #78c8ff; }
.tool-status-tag { margin-left: 4px; }
.toggle-icon { margin-left: auto; color: #4a6a80; }

.tool-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #071520;
}

.tool-title { font-size: 12px; color: #78c8ff; font-style: italic; }
.tool-section { display: flex; flex-direction: column; gap: 4px; }

.tool-label {
  font-size: 11px;
  color: #4a6a80;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.err-label { color: #ff4d4f; }

.tool-code {
  margin: 0;
  padding: 8px 10px;
  background: #0a1628;
  border: 1px solid #1a3a5c;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  color: #a0c8e8;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}

.tool-code.output { color: #6ad87e; }

.tool-code-err {
  margin: 0;
  padding: 8px 10px;
  background: #1a0a0a;
  border: 1px solid #5a1a1a;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Cascadia Code', 'Consolas', monospace;
  color: #ff7875;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

/* 消息错误 */
.msg-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ff7875;
  font-size: 13px;
}

/* 生成中动画 */
.generating .bubble-body {
  padding: 12px 18px;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #40a9ff;
  display: inline-block;
  animation: typing 1.2s infinite;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

/* Question 面板 */
.question-panel {
  padding: 12px 16px;
  border-top: 1px solid #5a4a00;
  background: #1a1200;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.question-text {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #d4a940;
}

.question-options { display: flex; flex-wrap: wrap; gap: 8px; }

@keyframes typing {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}
</style>
