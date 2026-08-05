import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { opencodeApi } from '@/api/opencode'
import type { ConnOpts } from '@/api/opencode'
import { API_PREFIX } from '@/config/endpoints'

// 默认连接配置（来自 ConnectionConfig.vue 默认填充值）
const DEFAULT_OPTS = {
  base: API_PREFIX.OPENCODE,
  dir: "/mnt/d/phm",
  user: 'opencode',
  pass: '',
}
const DEFAULT_PROVIDER="deepseeklocal"
const DEFAULT_MODEL="deepseek-v4-pro"
export interface MessagePart {
  id?: string
  type: string
  text?: string
  tool?: string
  state?: {
    status?: string
    title?: string
    input?: unknown
    output?: string
    error?: string
  }
  messageID?: string
}

export interface ChatMessage {
  info: {
    id: string
    role: 'user' | 'assistant'
    sessionID: string
    error?: unknown
  }
  parts: MessagePart[]
}

export interface ModelOption {
  label: string
  value: string
  providerID: string
  modelID: string
}

export const useChatStore = defineStore('chat', () => {
  // 连接状态
  const connecting = ref(false)
  const connected = ref(false)
  const serverVersion = ref('')
  const errorMsg = ref('')

  // 模型
  const modelOptions = ref<ModelOption[]>([])
  const selectedModel = ref('')

  // 会话
  const sessions = ref<Array<{ id: string; title?: string }>>([])
  const currentSid = ref('')
  const newSessionTitle = ref('')
  const creating = ref(false)

  // 消息
  const messages = ref<ChatMessage[]>([])
  const inputText = ref('')
  const sending = ref(false)
  const sessionBusy = ref(false)

  // Question
  const pendingQuestion = ref<null | { id: string; sessionID: string; questions: Array<{ question: string; options: Array<{ label: string }> }> }>(null)

  // SSE
  let eventSource: EventSource | null = null
  const sseReadyState = ref<number>(-1) // -1=未初始化, 0=CONNECTING, 1=OPEN, 2=CLOSED
  let sseRetryCount = 0
  let sseRetryTimer: ReturnType<typeof setTimeout> | null = null
  const SSE_RETRY_BASE_MS = 3000   // 初始重试间隔 3s
  const SSE_RETRY_MAX_MS = 30000   // 最大重试间隔 30s

  // 流式 delta 合并缓冲：rAF 节流，避免逐 token 触发整数组替换 + 全量重渲染
  let pendingDeltas = new Map<string, { messageID: string; partID: string; field: string; text: string }>()
  let deltaRafId: number | null = null

  // 防止重复连接：记录正在连接的目标 sessionId
  let connectingToSid = ''

  const opts = ref<ConnOpts>({ ...DEFAULT_OPTS })

  // ---- 连接到指定任务的 session ----
  async function connectToSession(sessionId: string, workDir: string) {
    // 如果已连接到同一 session，跳过
    if (connected.value && currentSid.value === sessionId) return
    // 如果正在连接同一 session，跳过（防止快速双击导致重复连接）
    if (connecting.value && connectingToSid === sessionId) return

    // 清理旧连接
    dispose()
    errorMsg.value = ''
    connecting.value = true
    connected.value = false
    currentSid.value = ''
    connectingToSid = sessionId
    messages.value = []
    sessionBusy.value = false
    pendingQuestion.value = null

    // 设置动态连接选项
    opts.value = { base: API_PREFIX.OPENCODE, dir: workDir, user: 'opencode', pass: '' }

    try {
      const [health, providersRes] = await Promise.all([
        opencodeApi.health(opts.value),
        opencodeApi.providers(opts.value),
      ])
      serverVersion.value = health.version || ''
      connected.value = true
      currentSid.value = sessionId

      // 填充模型选项
      const options: ModelOption[] = []
      for (const provider of providersRes.all || []) {
        for (const model of Object.values(provider.models || {})) {
          options.push({
            label: `${provider.id}/${model.id}`,
            value: `${provider.id}/${model.id}`,
            providerID: provider.id,
            modelID: model.id,
          })
        }
      }
      modelOptions.value = options
      if (!selectedModel.value) {
        const preferred =
          options.find((o) => o.providerID === DEFAULT_PROVIDER && o.modelID === DEFAULT_MODEL) ||
          options[0]
        if (preferred) selectedModel.value = preferred.value
      }
      startEventSource()
      await loadMessages(sessionId)
    } catch (e: unknown) {
      errorMsg.value = (e as Error).message || '连接失败，请确认 OpenCode 服务已启动'
      connected.value = false
      currentSid.value = ''
    } finally {
      connecting.value = false
      connectingToSid = ''
    }
  }

  // ---- 自动连接 ----
  async function autoConnect() {
    if (connected.value) return
    errorMsg.value = ''
    connecting.value = true
    try {
      const [health, providersRes, sessionsRes] = await Promise.all([
        opencodeApi.health(opts.value),
        opencodeApi.providers(opts.value),
        opencodeApi.sessions(opts.value),
      ])
      serverVersion.value = health.version || ''
      connected.value = true

      const options: ModelOption[] = []
      for (const provider of providersRes.all || []) {
        for (const model of Object.values(provider.models || {})) {
          options.push({
            label: `${provider.id}/${model.id}`,
            value: `${provider.id}/${model.id}`,
            providerID: provider.id,
            modelID: model.id,
          })
        }
      }
      modelOptions.value = options
      if (!selectedModel.value) {
        const preferred =
          options.find((o) => o.providerID === DEFAULT_PROVIDER && o.modelID === DEFAULT_MODEL) ||
          options[0]
        if (preferred) selectedModel.value = preferred.value
      }

      sessions.value = sessionsRes || []
      startEventSource()
      // 自动打开或创建会话
      if (sessions.value.length > 0 && !currentSid.value) {
        await handleOpenSession(sessions.value[0].id)
      } else if (sessions.value.length === 0) {
        await handleCreateSession()
      }
    } catch (e: unknown) {
      const err = e as Error
      errorMsg.value = err.message || '连接失败，请确认 OpenCode 服务已启动'
      connected.value = false
    } finally {
      connecting.value = false
    }
  }

  async function retryConnect() {
    connected.value = false
    await autoConnect()
  }

  // ---- 会话操作 ----
  async function handleOpenSession(sid: string) {
    currentSid.value = sid
    sessionBusy.value = false
    pendingQuestion.value = null
    await loadMessages(sid)
  }

  async function loadMessages(sid: string) {
    try {
      const prom = opencodeApi.messages(opts.value, sid)
      const msgs = await prom
      messages.value = msgs as ChatMessage[]
    } catch (e: unknown) {
      ElMessage.error('加载消息失败: ' + (e as Error).message)
    }
  }

  async function handleCreateSession() {
    creating.value = true
    try {
      const session = await opencodeApi.create(opts.value, newSessionTitle.value || undefined)
      sessions.value = [session, ...sessions.value]
      newSessionTitle.value = ''
      await handleOpenSession(session.id)
    } catch (e: unknown) {
      ElMessage.error('创建会话失败: ' + (e as Error).message)
    } finally {
      creating.value = false
    }
  }

  async function handleDeleteSession(item: { id: string; title?: string }) {
    try {
      await ElMessageBox.confirm(
        `确认删除会话「${item.title || item.id.slice(0, 8)}」？此操作不可恢复。`,
        '删除会话',
        { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }
    try {
      await opencodeApi.deleteSession(opts.value, item.id)
      sessions.value = sessions.value.filter((s) => s.id !== item.id)
      if (currentSid.value === item.id) {
        currentSid.value = ''
        messages.value = []
        sessionBusy.value = false
        pendingQuestion.value = null
      }
      ElMessage.success('会话已删除')
    } catch (e: unknown) {
      ElMessage.error('删除失败: ' + (e as Error).message)
    }
  }

  // ---- 发送消息 ----
  async function handleSend() {
    const sid = currentSid.value
    const body = inputText.value.trim()
    if (!sid || !body || sessionBusy.value) return

    const modelOpt = modelOptions.value.find((m) => m.value === selectedModel.value)
    sending.value = true
    sessionBusy.value = true
    inputText.value = ''

    const optimisticId = `optimistic-${Date.now()}`

    messages.value = [
      ...messages.value,
      {
        info: { id: optimisticId, role: 'user', sessionID: sid },
        parts: [{ type: 'text', text: body }],
      },
    ]

    try {
      await opencodeApi.prompt(opts.value, sid, {
        text: body,
        providerID: modelOpt?.providerID,
        modelID: modelOpt?.modelID,
      })
      await loadMessages(sid)
    } catch (e: unknown) {
      ElMessage.error('发送失败: ' + (e as Error).message)
      messages.value = messages.value.filter((m) => m.info.id !== optimisticId)
      inputText.value = body
      sessionBusy.value = false
    } finally {
      sending.value = false
    }
  }

  async function handleAbort() {
    if (!currentSid.value) return
    try {
      await opencodeApi.abort(opts.value, currentSid.value)
    } catch (e: unknown) {
      ElMessage.error('中止失败: ' + (e as Error).message)
    }
  }

  async function handleRefresh() {
    if (!currentSid.value) return
    await loadMessages(currentSid.value)
  }

  async function handleQuestionReply(labels: string[]) {
    if (!pendingQuestion.value) return
    const qid = pendingQuestion.value.id
    pendingQuestion.value = null
    try {
      await opencodeApi.questionReply(opts.value, qid, { answers: [labels] })
    } catch (e: unknown) {
      ElMessage.error('回复失败: ' + (e as Error).message)
    }
  }

  async function handleQuestionReject() {
    if (!pendingQuestion.value) return
    const qid = pendingQuestion.value.id
    pendingQuestion.value = null
    try {
      await opencodeApi.questionReject(opts.value, qid)
    } catch (e: unknown) {
      ElMessage.error('拒绝失败: ' + (e as Error).message)
    }
  }

  // ---- 增量 patch ----
  function patchMessage(info: ChatMessage['info']) {
    const idx = messages.value.findIndex((m) => m.info.id === info.id)
    if (idx !== -1) {
      const updated = [...messages.value]
      updated[idx] = { ...updated[idx], info }
      messages.value = updated
    } else if (info.role === 'user') {
      // 收到服务端 user 消息但未匹配到已有 ID：检查是否存在乐观更新的 user 消息
      // （ID 以 "optimistic-" 开头），有则原地替换，避免出现两条相同内容
      const optIdx = messages.value.findIndex((m) => m.info.id.startsWith('optimistic-') && m.info.role === 'user')
      if (optIdx !== -1) {
        const updated = [...messages.value]
        updated[optIdx] = { info, parts: [] }
        messages.value = updated
      } else {
        messages.value = [...messages.value, { info, parts: [] }]
      }
    } else {
      messages.value = [...messages.value, { info, parts: [] }]
    }
  }

  function patchPart(part: MessagePart & { messageID: string }) {
    const msgIdx = messages.value.findIndex((m) => m.info.id === part.messageID)
    if (msgIdx === -1) return
    const msg = messages.value[msgIdx]
    const partIdx = msg.parts.findIndex((p) => p.id === part.id)
    const newParts =
      partIdx !== -1
        ? msg.parts.map((p, i) => (i === partIdx ? { ...p, ...part } : p))
        : [...msg.parts, part]
    const updated = [...messages.value]
    updated[msgIdx] = { ...msg, parts: newParts }
    messages.value = updated
  }

  // 将同帧内的多次 delta 合并为一次响应式更新（每帧最多一次，避免逐 token 全量重渲染）
  function flushDeltas() {
    deltaRafId = null
    if (!pendingDeltas.size) return
    const deltas = Array.from(pendingDeltas.values())
    pendingDeltas.clear()
    // 按 messageID 聚合，减少数组替换次数
    const byMsg = new Map<string, typeof deltas>()
    for (const d of deltas) {
      if (!byMsg.has(d.messageID)) byMsg.set(d.messageID, [])
      byMsg.get(d.messageID)!.push(d)
    }
    for (const [messageID, list] of byMsg) {
      const msgIdx = messages.value.findIndex((m) => m.info.id === messageID)
      if (msgIdx === -1) continue
      const msg = messages.value[msgIdx]
      const newParts = msg.parts.map((p) => {
        const matched = list.filter((d) => d.partID === p.id)
        if (!matched.length) return p
        const merged = { ...p } as Record<string, unknown>
        for (const d of matched) merged[d.field] = ((merged[d.field] as string) ?? '') + d.text
        return merged as unknown as MessagePart
      })
      const updated = [...messages.value]
      updated[msgIdx] = { ...msg, parts: newParts }
      messages.value = updated
    }
  }

  function patchPartDelta(messageID: string, partID: string, field: string, delta: string) {
    const key = `${messageID}::${partID}::${field}`
    const prev = pendingDeltas.get(key)
    if (prev) prev.text += delta
    else pendingDeltas.set(key, { messageID, partID, field, text: delta })
    if (deltaRafId === null) deltaRafId = requestAnimationFrame(flushDeltas)
  }

  // ---- SSE ----
  function scheduleReconnect() {
    if (sseRetryTimer) return
    const delay = Math.min(SSE_RETRY_BASE_MS * Math.pow(2, sseRetryCount), SSE_RETRY_MAX_MS)
    sseRetryCount++
    console.log(`[ChatStore] SSE 将在 ${(delay / 1000).toFixed(1)}s 后重连 (第 ${sseRetryCount} 次)`)
    sseRetryTimer = setTimeout(() => {
      sseRetryTimer = null
      startEventSource()
    }, delay)
  }

  function startEventSource() {
    stopEventSource()
    try {
      eventSource = opencodeApi.event(opts.value)
      sseReadyState.value = 0 // CONNECTING
      eventSource.onopen = () => {
        sseRetryCount = 0
        sseReadyState.value = 1 // OPEN
      }
      eventSource.onmessage = async (e: MessageEvent) => {
        let event: { type: string; properties?: Record<string, unknown> }
        try {
          event = JSON.parse(e.data)
        } catch {
          return
        }
        const sid = currentSid.value
        const props = (event.properties || {}) as Record<string, unknown>

        switch (event.type) {
          case 'session.status':
            if (props.sessionID === sid) {
              const isIdle = (props.status as { type?: string })?.type === 'idle'
              if (isIdle && deltaRafId !== null) {
                // 收尾 flush：idle 前确保最后一个 token 已渲染
                cancelAnimationFrame(deltaRafId)
                flushDeltas()
              }
              sessionBusy.value = !isIdle
              if (isIdle) await loadMessages(sid)
            }
            break
          case 'message.updated':
            if (props.info && props.sessionID === sid)
              patchMessage(props.info as ChatMessage['info'])
            break
          case 'message.part.updated':
            if (props.part && props.sessionID === sid)
              patchPart(props.part as MessagePart & { messageID: string })
            break
          case 'message.part.delta':
            if (props.sessionID === sid && props.messageID && props.partID)
              patchPartDelta(
                props.messageID as string,
                props.partID as string,
                (props.field as string) || 'text',
                (props.delta as string) || '',
              )
            break
          case 'question.asked':
            if (props.sessionID === sid) pendingQuestion.value = props as typeof pendingQuestion.value
            break
          case 'question.replied':
          case 'question.rejected':
            if (props.sessionID === sid) pendingQuestion.value = null
            break
        }
      }
      eventSource.onerror = () => {
        sseReadyState.value = eventSource?.readyState ?? 2 // CLOSED
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }
        scheduleReconnect()
      }
    } catch (e: unknown) {
      console.error('[ChatStore] EventSource 创建失败:', e)
      scheduleReconnect()
    }
  }

  function stopEventSource() {
    if (sseRetryTimer) {
      clearTimeout(sseRetryTimer)
      sseRetryTimer = null
    }
    sseRetryCount = 0
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    sseReadyState.value = -1 // 未初始化
  }

  function dispose() {
    stopEventSource()
    // 重置连接态：dispose 已关闭 SSE，必须同步清掉 connected/currentSid 等，
    // 否则 Pinia 单例残影会让 connectToSession 开头的防重入误判为「已连接同一 session」
    // 而直接 return，导致 SPA 内导航后再也无法重建 SSE（仅 F5 整页刷新才能恢复）。
    connected.value = false
    currentSid.value = ''
    connecting.value = false
    connectingToSid = ''
    sessionBusy.value = false
    if (deltaRafId !== null) {
      cancelAnimationFrame(deltaRafId)
      deltaRafId = null
    }
    pendingDeltas.clear()
  }

  return {
    connecting, connected, serverVersion, errorMsg,
    modelOptions, selectedModel,
    sessions, currentSid, newSessionTitle, creating,
    messages, inputText, sending, sessionBusy,
    pendingQuestion,
    autoConnect, retryConnect,
    connectToSession,
    handleOpenSession, handleCreateSession, handleDeleteSession,
    handleSend, handleAbort, handleRefresh,
    handleQuestionReply, handleQuestionReject,
    dispose,
    sseReadyState,
  }
})
