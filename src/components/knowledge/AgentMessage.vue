<script setup lang="ts">
import { computed } from 'vue'
import { ChatDotRound, DocumentCopy, Flag, StarFilled, Warning } from '@element-plus/icons-vue'
import type { FeedbackType } from '@/api/knowledge-agent'
import type { KnowledgeMessage } from '@/stores/knowledge-agent'
import { confidencePresentation } from '@/utils/knowledge-format'
import { renderMarkdown } from '@/utils/useMarkdown'

const props = defineProps<{
  message: KnowledgeMessage
  feedbackEnabled: boolean
}>()

const emit = defineEmits<{
  sources: [message: KnowledgeMessage]
  feedback: [message: KnowledgeMessage, type: FeedbackType]
  retry: [messageId: string]
}>()

const renderedContent = computed(() => renderMarkdown(props.message.content))
const isFinal = computed(() => props.message.runState === 'completed')
const metadata = computed(() => props.message.metadata)
const createdDateTime = computed(() => new Date(props.message.createdAt).toISOString())
const createdTime = computed(() =>
  new Date(props.message.createdAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }),
)
const confidence = computed(() => confidencePresentation(metadata.value?.confidence))
const feedbackAvailable = computed(
  () =>
    props.feedbackEnabled &&
    !props.message.historical &&
    Boolean(metadata.value?.message_id && metadata.value.trace_id) &&
    props.message.feedbackState !== 'submitted',
)
const feedbackSubmitting = computed(() => props.message.feedbackState === 'submitting')
const persistenceWarning = computed(() => {
  if (props.message.historical || !isFinal.value) return ''
  if (
    metadata.value?.contract_version === 2 &&
    metadata.value.history_persisted === true
  ) {
    return ''
  }
  if (
    metadata.value?.contract_version === 2 &&
    metadata.value.history_persisted === false
  ) {
    return '本次回答未保存到会话历史；刷新页面后可能无法恢复'
  }
  return '无法确认本次回答是否已保存；当前会话暂不登记到本设备列表'
})

const structuredSections = computed(() => {
  const answer = metadata.value?.structured_answer
  if (!answer) return []
  const labels = metadata.value?.section_labels ?? []
  const fallback = ['摘要', '详情', '步骤', '备注', '来源', '信息缺口']
  const values: Array<string | string[]> = [
    answer.summary,
    answer.details,
    answer.steps,
    answer.notes,
    answer.sources,
    answer.gaps,
  ]
  return values
    .map((value, index) => ({
      label: labels[index] || fallback[index],
      values: Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [],
    }))
    .filter((section) => section.values.length > 0)
})

function routeLabel(route?: string): string {
  const labels: Record<string, string> = {
    rag: '知识库路径',
    fast: '快速知识库路径',
    general_chat: '通用对话路径',
    degraded: '降级路径',
  }
  return route ? labels[route] || route : '路径未提供'
}
</script>

<template>
  <article
    :class="['agent-message', message.role]"
    :data-run-state="message.runState"
    :aria-label="message.role === 'user' ? '你的消息' : '知识库 Agent 消息'"
  >
    <div class="message-avatar" aria-hidden="true">
      <span v-if="message.role === 'user'">你</span>
      <el-icon v-else><ChatDotRound /></el-icon>
    </div>
    <div class="message-body">
      <div :class="['message-heading', { 'user-heading': message.role === 'user' }]">
        <strong v-if="message.role === 'assistant'">知识库 Agent</strong>
        <time :datetime="createdDateTime">{{ createdTime }}</time>
      </div>

      <template v-if="message.role === 'assistant'">
        <div v-if="message.stages?.length" class="execution-block">
          <span class="section-kicker">执行过程</span>
          <div class="stage-row" aria-label="执行阶段">
            <span v-for="stage in message.stages" :key="stage.key" class="stage-pill">
              <i />{{ stage.label }}
            </span>
          </div>
        </div>

        <el-alert
          v-if="message.runState === 'error'"
          :title="message.statusText || '知识库 Agent 暂时不可用'"
          type="error"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else-if="message.runState === 'interrupted' || message.runState === 'cancelled'"
          :title="message.statusText || '回答未完成'"
          type="warning"
          :closable="false"
          show-icon
        />
        <div
          v-else-if="message.runState === 'connecting' || message.runState === 'running'"
          class="live-status"
        >
          <span class="live-dot" />{{ message.statusText || '处理中…' }}
        </div>
      </template>

      <div v-if="message.content" class="markdown-body" v-html="renderedContent" />
      <div
        v-else-if="
          message.role === 'assistant' &&
          ['connecting', 'running'].includes(message.runState || '')
        "
        class="answer-placeholder"
      >
        正在等待首个回答片段…
      </div>

      <el-collapse v-if="isFinal && structuredSections.length" class="structured-answer">
        <el-collapse-item title="结构化诊断视图" name="structured">
          <section v-for="section in structuredSections" :key="section.label">
            <h4>{{ section.label }}</h4>
            <ul v-if="section.values.length > 1">
              <li v-for="value in section.values" :key="value">{{ value }}</li>
            </ul>
            <p v-else>{{ section.values[0] }}</p>
          </section>
        </el-collapse-item>
      </el-collapse>

      <div v-if="message.role === 'assistant' && isFinal" class="trust-panel">
        <span class="section-kicker">回答状态</span>
        <el-alert
          v-if="metadata?.route === 'degraded'"
          title="本回答来自降级路径，请在服务恢复后重试"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-alert
          v-if="metadata?.refused"
          title="证据不足或存在冲突，Agent 拒绝给出确定结论"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-alert
          v-if="persistenceWarning"
          :title="persistenceWarning"
          type="warning"
          :closable="false"
          show-icon
        />
        <div class="trust-row">
          <el-tag :type="metadata?.route === 'degraded' ? 'warning' : 'info'" effect="plain">
            {{ routeLabel(metadata?.route) }}
          </el-tag>
          <el-tag :type="confidence.kind === 'available' ? 'success' : 'info'" effect="plain">
            置信度：{{ confidence.label }}
          </el-tag>
          <el-tag v-if="metadata?.confidence_level" type="info" effect="plain">
            可信等级：{{ metadata.confidence_level }}
          </el-tag>
          <el-tag v-if="metadata?.force_rag" type="primary" effect="plain">自动切换知识库</el-tag>
          <span v-if="message.processingTimeMs !== undefined">
            {{ (message.processingTimeMs / 1000).toFixed(2) }} s
          </span>
          <span v-if="message.historical">历史接口仅恢复文本</span>
        </div>
      </div>

      <div v-if="message.role === 'assistant' && isFinal" class="message-actions">
        <el-button
          v-if="message.sources?.length"
          text
          type="primary"
          :icon="DocumentCopy"
          @click="emit('sources', message)"
        >
          查看 {{ message.sources.length }} 条依据
        </el-button>
        <template v-if="feedbackAvailable">
          <el-button
            text
            :icon="StarFilled"
            :disabled="feedbackSubmitting"
            @click="emit('feedback', message, 'THUMBS_UP')"
          >
            有帮助
          </el-button>
          <el-button
            text
            :icon="Warning"
            :disabled="feedbackSubmitting"
            @click="emit('feedback', message, 'THUMBS_DOWN')"
          >
            无帮助
          </el-button>
          <el-button
            text
            :icon="Flag"
            :disabled="feedbackSubmitting"
            @click="emit('feedback', message, 'FLAG')"
          >
            标记
          </el-button>
          <el-button
            text
            :disabled="feedbackSubmitting"
            @click="emit('feedback', message, 'CORRECTION')"
          >
            纠正
          </el-button>
        </template>
        <span v-else-if="message.feedbackState === 'submitted'" class="feedback-note">反馈已提交</span>
        <span v-else-if="!message.historical && !feedbackEnabled" class="feedback-note">
          当前部署未启用反馈写入
        </span>
      </div>
      <div
        v-else-if="
          message.role === 'assistant' &&
          ['error', 'interrupted', 'cancelled'].includes(message.runState || '') &&
          message.retryPrompt
        "
        class="message-actions"
      >
        <el-button text type="primary" @click="emit('retry', message.id)">使用同一问题重试</el-button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.agent-message { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; align-items: start; }
.agent-message.user { grid-template-columns: minmax(0, 1fr) 36px; }
.message-avatar { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 11px; color: #1a6cf0; background: #edf4ff; font-size: 12px; font-weight: 700; }
.user .message-avatar { grid-column: 2; grid-row: 1; color: #fff; background: linear-gradient(135deg,#1769e8,#3f84f5); box-shadow: 0 5px 14px rgba(26,108,240,.2); }
.message-body { min-width: 0; width: min(100%,1040px); background: #fff; border: 1px solid #e7ecf4; border-radius: 4px 14px 14px; padding: 15px 17px; box-shadow: 0 6px 18px rgba(13,31,60,.035); }
.user .message-body { grid-column: 1; grid-row: 1; justify-self: end; width: fit-content; max-width: min(72%,760px); background: linear-gradient(145deg,#eaf3ff,#f2f7ff); border-color: #cfe0fb; border-radius: 15px 4px 15px 15px; box-shadow: 0 6px 18px rgba(26,108,240,.07); }
.message-heading { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 10px; }
.message-heading.user-heading { justify-content: flex-end; margin-bottom: 5px; }
.message-heading strong { color: #233653; font-size: 13px; }
.message-heading time { color: #9ba6b7; font-size: 10px; }
.execution-block { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; margin: 0 0 13px; border: 1px solid #edf1f7; border-radius: 10px; background: #f8fafd; }
.section-kicker { flex: 0 0 auto; color: #8794a8; font-size: 10px; font-weight: 600; letter-spacing: .04em; }
.stage-row { display: flex; flex-wrap: wrap; gap: 6px; }
.stage-pill { display: inline-flex; align-items: center; gap: 5px; color: #617089; background: #f4f6fa; border-radius: 999px; padding: 4px 8px; font-size: 11px; }
.stage-pill i { width: 6px; height: 6px; border-radius: 50%; background: #1a6cf0; }
.live-status { display: flex; align-items: center; gap: 8px; color: #687893; font-size: 12px; margin-bottom: 10px; }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #1a6cf0; box-shadow: 0 0 0 5px rgba(26,108,240,.12); animation: pulse 1.2s infinite; }
.answer-placeholder { color: #9aa6b8; font-size: 13px; padding: 6px 0; }
.markdown-body { color: #2f405b; font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; }
.markdown-body :deep(p) { margin: 8px 0; }
.markdown-body :deep(p:first-child) { margin-top: 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(pre.code-block) { overflow-x: auto; border-radius: 10px; background: #101827; color: #e7edf8; }
.markdown-body :deep(.code-header) { display: flex; justify-content: space-between; padding: 7px 10px; background: rgba(255,255,255,.06); }
.markdown-body :deep(pre code) { display: block; padding: 12px; }
.markdown-body :deep(img) { display: block; max-width: 100%; height: auto; margin: 12px 0; border: 1px solid #e4eaf3; border-radius: 10px; }
.structured-answer { margin-top: 14px; }
.structured-answer section { border-left: 3px solid #d9e7ff; padding-left: 12px; margin: 12px 0; }
.structured-answer h4 { color: #1f4e95; margin: 0 0 5px; }
.structured-answer p, .structured-answer ul { color: #465873; margin: 0; line-height: 1.65; }
.trust-panel { display: grid; gap: 9px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #edf0f5; }
.trust-row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; color: #8793a5; font-size: 11px; }
.message-actions { border-top: 1px solid #edf0f5; display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin-top: 11px; padding-top: 8px; }
.feedback-note { color: #8c98aa; font-size: 11px; padding: 0 8px; }
@keyframes pulse { 50% { opacity: .45; } }
@media (max-width: 900px) { .user .message-body { max-width: 88%; } }
@media (max-width: 700px) { .agent-message { grid-template-columns: 30px minmax(0, 1fr); gap: 8px; } .agent-message.user { grid-template-columns: minmax(0, 1fr) 30px; } .message-avatar { width: 30px; height: 30px; } .message-body { padding: 13px; } .user .message-body { max-width: 94%; } .execution-block { display: grid; gap: 6px; } }
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }
</style>
