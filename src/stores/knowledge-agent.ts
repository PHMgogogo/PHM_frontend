import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import {
  getChatHistory,
  streamKnowledgeChat,
  submitFeedback,
  type FeedbackType,
  type KnowledgeMode,
} from '@/api/knowledge-agent'
import { ApiError } from '@/api/client'
import { KNOWLEDGE_CAPABILITIES } from '@/config/knowledge'
import {
  KNOWLEDGE_NORMALIZATION_LIMITS,
  type KnowledgeStreamEvent,
  type PublicKnowledgeMetadata,
  type SourceDocument,
} from '@/utils/knowledge-normalize'
import {
  forgetLocalSession,
  readLocalSessions,
  rememberLocalSession,
  type LocalSessionReference,
} from '@/utils/local-sessions'
import { RunOwnership, type AgentTerminalState, type RunToken } from '@/utils/run-ownership'
import { SseLimitError } from '@/utils/sse'

export type AgentRunState =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'cancelled'
  | 'error'

export type AgentStageKey = 'intent' | 'retrieve' | 'grade' | 'rewrite' | 'generate'

export interface AgentStage {
  key: AgentStageKey
  label: string
}

export interface KnowledgeMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  runState?: AgentRunState
  statusText?: string
  stages?: AgentStage[]
  intent?: string
  preliminaryRoute?: string
  sources?: SourceDocument[]
  processingTimeMs?: number
  metadata?: PublicKnowledgeMetadata
  historical?: boolean
  feedbackState?: 'idle' | 'submitting' | 'submitted' | 'failed'
  retryPrompt?: string
}

interface ActiveRun {
  token: RunToken
  controller: AbortController
  assistantMessageId: string
  prompt: string
  tokenBuffer: string
  frameId: number | ReturnType<typeof setTimeout> | null
  frameKind: 'raf' | 'timeout' | null
}

const STAGE_LABELS: Record<AgentStageKey, string> = {
  intent: '意图分析',
  retrieve: '知识检索',
  grade: '证据评估',
  rewrite: '查询优化',
  generate: '生成回答',
}

function identifier(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random()}`
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function stageFromNode(name: string): AgentStageKey | null {
  if (name === 'retrieve') return 'retrieve'
  if (name === 'grade') return 'grade'
  if (name === 'rewrite') return 'rewrite'
  if (name === 'generate' || name === 'fast_generate') return 'generate'
  return null
}

function stageFromStatus(status: string, mode: KnowledgeMode): AgentStageKey | null {
  if (status.includes('检索')) return 'retrieve'
  if (status.includes('生成') || status.includes('组织回答')) return 'generate'
  if (mode === 'thinking' && status.includes('意图')) return 'intent'
  return null
}

export const useKnowledgeAgentStore = defineStore('knowledge-agent', () => {
  const messages = ref<KnowledgeMessage[]>([])
  const mode = ref<KnowledgeMode>('thinking')
  const sessionId = ref<string | null>(null)
  const runState = ref<AgentRunState>('idle')
  const localSessions = ref<LocalSessionReference[]>([])
  const historyLoading = ref(false)
  const historyError = ref('')
  const historyWarning = ref('')

  const ownership = new RunOwnership()
  let activeRun: ActiveRun | null = null
  let historyController: AbortController | null = null
  let historyGeneration = 0

  const running = computed(
    () => runState.value === 'connecting' || runState.value === 'running',
  )

  function targetMessage(messageId: string): KnowledgeMessage | undefined {
    return messages.value.find((message) => message.id === messageId)
  }

  function addStage(message: KnowledgeMessage, stage: AgentStageKey | null): void {
    if (!stage || message.stages?.some((item) => item.key === stage)) return
    if (mode.value === 'fast' && ['intent', 'grade', 'rewrite'].includes(stage)) return
    message.stages ??= []
    message.stages.push({ key: stage, label: STAGE_LABELS[stage] })
  }

  function cancelFrame(run: ActiveRun): void {
    if (run.frameId === null) return
    if (run.frameKind === 'raf' && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(run.frameId as number)
    } else {
      clearTimeout(run.frameId as ReturnType<typeof setTimeout>)
    }
    run.frameId = null
    run.frameKind = null
  }

  function flushTokens(token: RunToken): void {
    const run = activeRun
    if (!run || run.token.runId !== token.runId || !ownership.owns(token)) return
    cancelFrame(run)
    if (!run.tokenBuffer) return
    const message = targetMessage(token.assistantMessageId)
    if (message) message.content += run.tokenBuffer
    run.tokenBuffer = ''
  }

  function scheduleTokenFlush(token: RunToken): void {
    const run = activeRun
    if (!run || run.frameId !== null || !ownership.owns(token)) return
    const callback = () => {
      if (activeRun) {
        activeRun.frameId = null
        activeRun.frameKind = null
      }
      flushTokens(token)
    }
    if (typeof requestAnimationFrame === 'function') {
      run.frameKind = 'raf'
      run.frameId = requestAnimationFrame(callback)
    } else {
      run.frameKind = 'timeout'
      run.frameId = setTimeout(callback, 16)
    }
  }

  function submitTerminal(token: RunToken, state: AgentTerminalState, statusText: string): boolean {
    const run = activeRun
    if (!run || run.token.runId !== token.runId) return false
    flushTokens(token)
    if (!ownership.commitTerminal(token, state)) return false
    cancelFrame(run)
    const message = targetMessage(token.assistantMessageId)
    if (message) {
      message.runState = state
      message.statusText = statusText
    }
    runState.value = state
    return true
  }

  function failForLimit(token: RunToken): void {
    if (submitTerminal(token, 'error', '响应超过安全限制，可重试')) {
      activeRun?.controller.abort()
    }
  }

  function queueToken(token: RunToken, content: string): void {
    const run = activeRun
    const message = targetMessage(token.assistantMessageId)
    if (!run || !message || !ownership.owns(token)) return
    if (
      message.content.length +
        run.tokenBuffer.length +
        content.length >
      KNOWLEDGE_NORMALIZATION_LIMITS.answerChars
    ) {
      failForLimit(token)
      return
    }
    run.tokenBuffer += content
    scheduleTokenFlush(token)
  }

  function rememberSession(id: string): void {
    const storage = browserStorage()
    if (!storage) return
    localSessions.value = rememberLocalSession(storage, id)
  }

  function handleEvent(token: RunToken, event: KnowledgeStreamEvent): RunToken {
    if (!ownership.owns(token)) return token
    const message = targetMessage(token.assistantMessageId)
    if (!message) return token

    switch (event.type) {
      case 'session': {
        sessionId.value = event.session_id
        const updated = ownership.updateSession(token, event.session_id)
        if (updated && activeRun) activeRun.token = updated
        return updated ?? token
      }
      case 'status':
        message.statusText = event.message
        message.runState = 'running'
        runState.value = 'running'
        addStage(message, stageFromStatus(event.message, mode.value))
        break
      case 'intent':
        message.intent = event.intent
        if (mode.value === 'thinking') {
          message.preliminaryRoute = event.route
          addStage(message, 'intent')
        }
        break
      case 'node':
        addStage(message, stageFromNode(event.name))
        break
      case 'token':
        queueToken(token, event.content)
        break
      case 'done':
        flushTokens(token)
        if (!ownership.owns(token)) break
        message.content = event.full_response
        message.sources = ['rag', 'fast'].includes(event.metadata.route ?? '')
          ? event.sources
          : []
        message.processingTimeMs = event.processing_time_ms ?? undefined
        message.metadata = event.metadata
        message.preliminaryRoute = undefined
        if (
          event.metadata.contract_version === 2 &&
          event.metadata.history_persisted === true &&
          token.sessionId
        ) {
          rememberSession(token.sessionId)
        }
        submitTerminal(token, 'completed', '回答完成')
        break
      case 'error':
        if (submitTerminal(token, 'error', event.message)) activeRun?.controller.abort()
        break
    }
    return token
  }

  async function send(rawPrompt: string): Promise<void> {
    const prompt = rawPrompt.trim()
    if (!prompt || running.value) return

    const userMessage: KnowledgeMessage = {
      id: identifier('user'),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    }
    const assistantMessage: KnowledgeMessage = {
      id: identifier('assistant'),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      runState: 'connecting',
      statusText: '正在连接知识库 Agent…',
      stages: [],
      feedbackState: 'idle',
      retryPrompt: prompt,
    }
    messages.value.push(userMessage, assistantMessage)
    runState.value = 'connecting'

    let token = ownership.begin(sessionId.value, assistantMessage.id)
    const controller = new AbortController()
    activeRun = {
      token,
      controller,
      assistantMessageId: assistantMessage.id,
      prompt,
      tokenBuffer: '',
      frameId: null,
      frameKind: null,
    }

    try {
      await streamKnowledgeChat(
        {
          message: prompt,
          session_id: sessionId.value ?? undefined,
          stream: true,
          include_sources: true,
          mode: mode.value,
        },
        {
          signal: controller.signal,
          onEvent(event) {
            token = handleEvent(token, event)
          },
        },
      )
      if (ownership.owns(token)) submitTerminal(token, 'interrupted', '回答在完成前中断')
    } catch (error) {
      if (!ownership.owns(token)) return
      if (error instanceof ApiError && error.kind === 'cancelled') {
        submitTerminal(token, 'cancelled', '已取消')
      } else if (error instanceof SseLimitError) {
        failForLimit(token)
      } else {
        submitTerminal(
          token,
          'error',
          error instanceof Error && error.message ? error.message : '知识库 Agent 暂时不可用',
        )
      }
    } finally {
      if (activeRun?.token.runId === token.runId) {
        cancelFrame(activeRun)
        activeRun = null
      }
    }
  }

  function cancelActive(): void {
    const run = activeRun
    if (!run) return
    flushTokens(run.token)
    submitTerminal(run.token, 'cancelled', '已取消')
    run.controller.abort()
    cancelFrame(run)
    activeRun = null
  }

  async function retryMessage(messageId: string): Promise<void> {
    const prompt = targetMessage(messageId)?.retryPrompt?.trim()
    if (prompt && !running.value) await send(prompt)
  }

  function newConversation(): void {
    cancelActive()
    historyGeneration += 1
    historyController?.abort()
    historyController = null
    sessionId.value = null
    messages.value = []
    runState.value = 'idle'
    historyError.value = ''
    historyWarning.value = ''
  }

  async function openLocalSession(id: string): Promise<boolean> {
    if (!localSessions.value.some((item) => item.id === id)) return false
    cancelActive()
    historyGeneration += 1
    const owner = historyGeneration
    historyController?.abort()
    historyController = new AbortController()
    historyLoading.value = true
    historyError.value = ''
    historyWarning.value = ''
    try {
      const history = await getChatHistory(id, historyController.signal)
      if (owner !== historyGeneration) return false
      sessionId.value = id
      messages.value = history.messages.map((message) => ({
        id: identifier('history'),
        role: message.role,
        content: message.content,
        createdAt: message.timestamp ? message.timestamp * 1_000 : Date.now(),
        historical: true,
        runState: message.role === 'assistant' ? 'completed' : undefined,
      }))
      runState.value = 'idle'
      rememberSession(id)
      if (history.contract_version !== 2 || history.complete === null) {
        historyWarning.value = '服务端未声明历史完整性，当前记录可能不完整'
      } else if (!history.complete || history.degraded) {
        historyWarning.value = '当前仅恢复了部分会话历史，请稍后重试以获取完整记录'
      }
      return true
    } catch (error) {
      if (owner !== historyGeneration) return false
      if (!(error instanceof ApiError && error.kind === 'cancelled')) {
        historyError.value = error instanceof Error ? error.message : '加载会话历史失败'
      }
      return false
    } finally {
      if (owner === historyGeneration) historyLoading.value = false
    }
  }

  function forgetSession(id: string): void {
    const storage = browserStorage()
    if (storage) localSessions.value = forgetLocalSession(storage, id)
    if (sessionId.value === id) newConversation()
  }

  async function sendFeedback(
    messageId: string,
    feedbackType: FeedbackType,
    content = '',
    correctedAnswer = '',
  ): Promise<boolean> {
    const message = targetMessage(messageId)
    const metadata = message?.metadata
    if (
      !KNOWLEDGE_CAPABILITIES.feedback ||
      !message ||
      message.historical ||
      !sessionId.value ||
      !metadata?.message_id ||
      !metadata.trace_id ||
      message.feedbackState === 'submitting' ||
      message.feedbackState === 'submitted'
    ) {
      return false
    }
    if (feedbackType === 'CORRECTION' && !correctedAnswer.trim()) return false

    message.feedbackState = 'submitting'
    try {
      await submitFeedback({
        session_id: sessionId.value,
        message_id: metadata.message_id,
        trace_id: metadata.trace_id,
        feedback_type: feedbackType,
        content: content.trim(),
        original_answer: message.content,
        corrected_answer: correctedAnswer.trim(),
      })
      message.feedbackState = 'submitted'
      ElMessage.success('反馈已提交')
      return true
    } catch (error) {
      message.feedbackState = 'failed'
      ElMessage.error(error instanceof Error ? error.message : '反馈提交失败')
      return false
    }
  }

  function init(): void {
    const storage = browserStorage()
    localSessions.value = storage ? readLocalSessions(storage) : []
  }

  function dispose(): void {
    cancelActive()
    ownership.invalidate()
    historyGeneration += 1
    historyController?.abort()
    historyController = null
    historyLoading.value = false
    historyWarning.value = ''
  }

  return {
    capabilities: KNOWLEDGE_CAPABILITIES,
    messages,
    mode,
    sessionId,
    runState,
    localSessions,
    historyLoading,
    historyError,
    historyWarning,
    running,
    send,
    retryMessage,
    cancelActive,
    newConversation,
    openLocalSession,
    forgetSession,
    sendFeedback,
    init,
    dispose,
  }
})
