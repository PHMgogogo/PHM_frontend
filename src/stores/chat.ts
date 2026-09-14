import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { opencodeApi } from '@/api/opencode'
import type { ConnOpts, OpencodeEvent } from '@/api/opencode'
import { API_PREFIX, OPENCODE_AUTH } from '@/config/endpoints'

// 默认连接配置（来自 ConnectionConfig.vue 默认填充值）
const DEFAULT_OPTS = {
  base: API_PREFIX.OPENCODE,
  dir: "/mnt/d/phm",
  user: OPENCODE_AUTH.user,
  pass: OPENCODE_AUTH.pass,
}
const DEFAULT_PROVIDER="local-model"
const DEFAULT_MODEL="deepseek-v4-pro"

/**
 * v2 会话的模型需在「创建会话」时指定，否则回退到 opencode 全局默认模型。
 * 此处统一导出，供创建会话处（chat.ts / task.ts）复用。
 */
export const DEFAULT_MODEL_REF = { providerID: DEFAULT_PROVIDER, id: DEFAULT_MODEL }
export interface MessagePart {
  id?: string
  type: string
  text?: string
  tool?: string
  /** 工具名（v2 使用 name） */
  name?: string
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

/** v2 待处理 form（AI 主动提问） */
export interface PendingForm {
  id: string
  sessionID: string
  title: string
  questions: Array<{ question: string; options: Array<{ label: string; value: unknown }> }>
  /** 字段 key，用于构造 reply 的 answers */
  fieldKeys: string[]
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

  // Form（v2 取代旧 question）
  const pendingQuestion = ref<null | PendingForm>(null)

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

  // ---- 解析 v2 模型列表 ----
  async function loadModels() {
    const res = await opencodeApi.models(opts.value)
    const options: ModelOption[] = []
    for (const m of res.data || []) {
      const modelID = m.modelID || m.id || ''
      if (!m.providerID || !modelID) continue
      options.push({
        label: `${m.providerID}/${modelID}`,
        value: `${m.providerID}/${modelID}`,
        providerID: m.providerID,
        modelID,
      })
    }
    modelOptions.value = options
    if (!selectedModel.value) {
      const preferred =
        options.find((o) => o.providerID === DEFAULT_PROVIDER && o.modelID === DEFAULT_MODEL) ||
        options[0]
      if (preferred) selectedModel.value = preferred.value
    }
  }

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
    opts.value = {
      base: API_PREFIX.OPENCODE,
      dir: workDir,
      user: OPENCODE_AUTH.user,
      pass: OPENCODE_AUTH.pass,
    }

    try {
      const [health] = await Promise.all([
        opencodeApi.health(opts.value),
        loadModels(),
      ])
      serverVersion.value = health.version || ''
      connected.value = true
      currentSid.value = sessionId
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
      const [health, sessionsRes] = await Promise.all([
        opencodeApi.health(opts.value),
        opencodeApi.sessions(opts.value),
        loadModels(),
      ])
      serverVersion.value = health.version || ''
      connected.value = true

      sessions.value = sessionsRes.data || []
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
    await loadPendingForms(sid)
  }

  async function loadMessages(sid: string) {
    try {
      const res = await opencodeApi.messages(opts.value, sid)
      messages.value = (res.data || []).map((m) => normalizeMessage(m as Record<string, unknown>, sid))
    } catch (e: unknown) {
      ElMessage.error('加载消息失败: ' + (e as Error).message)
    }
  }

  /** 把 v2 消息结构（user{text} / assistant{content[]}）映射为 UI 使用的 {info, parts} */
  function normalizeMessage(m: Record<string, unknown>, sid: string): ChatMessage {
    const id = String(m.id || '')
    const type = String(m.type || '')
    const role: 'user' | 'assistant' = type === 'user' ? 'user' : 'assistant'
    const parts: MessagePart[] = []

    if (role === 'user') {
      if (typeof m.text === 'string' && m.text) parts.push({ type: 'text', text: m.text })
    } else {
      for (const c of (m.content as Array<Record<string, unknown>>) || []) {
        const ctype = String(c.type || '')
        if (ctype === 'text' || ctype === 'reasoning') {
          parts.push({ type: ctype, text: String(c.text ?? '') })
        } else if (ctype === 'tool') {
          parts.push({
            type: 'tool',
            tool: String(c.name || ''),
            id: c.id ? String(c.id) : undefined,
            state: mapToolState(c.state as Record<string, unknown> | undefined),
          })
        }
      }
    }

    return {
      info: {
        id,
        role,
        sessionID: sid,
        error: m.error,
      },
      parts,
    }
  }

  /** v2 工具状态 → UI 期望的 {status, title, input, output, error} */
  function mapToolState(state?: Record<string, unknown>) {
    if (!state) return undefined
    const status = String(state.status || '')
    const content = (state.content as Array<{ type?: string; text?: string }>) || []
    const output = content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n')
    const err = state.error as { message?: string } | undefined
    return {
      status,
      input: state.input,
      output: output || undefined,
      error: err?.message,
    }
  }

  async function loadPendingForms(sid: string) {
    try {
      const res = await opencodeApi.forms(opts.value, sid)
      const form = (res.data || [])[0]
      pendingQuestion.value = form ? normalizeForm(form) : null
    } catch {
      pendingQuestion.value = null
    }
  }

  function normalizeForm(form: {
    id: string
    sessionID: string
    title: string
    fields?: Array<{
      key: string
      title?: string
      options?: Array<{ label?: string; value?: unknown }>
    }>
  }): PendingForm {
    const fields = form.fields || []
    return {
      id: form.id,
      sessionID: form.sessionID,
      title: form.title,
      questions: fields.map((f) => ({
        question: f.title || f.key,
        options: (f.options || []).map((o) => ({
          label: String(o.label ?? o.value ?? ''),
          value: o.value ?? o.label,
        })),
      })),
      fieldKeys: fields.map((f) => f.key),
    }
  }

  async function handleCreateSession() {
    creating.value = true
    try {
      const res = await opencodeApi.create(
        opts.value,
        newSessionTitle.value || undefined,
        DEFAULT_MODEL_REF,
        opts.value.dir,
      )
      const session = res.data
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

    // v2 的 /prompt 不接受 model，需先通过 /model 切换会话模型
    if (modelOpt) {
      try {
        await opencodeApi.switchModel(opts.value, sid, {
          providerID: modelOpt.providerID,
          id: modelOpt.modelID,
        })
      } catch (e: unknown) {
        ElMessage.error('切换模型失败: ' + (e as Error).message)
        sending.value = false
        sessionBusy.value = false
        inputText.value = body
        return
      }
    }

    const optimisticId = `optimistic-${Date.now()}`

    messages.value = [
      ...messages.value,
      {
        info: { id: optimisticId, role: 'user', sessionID: sid },
        parts: [{ type: 'text', text: body }],
      },
    ]

    try {
      await opencodeApi.prompt(opts.value, sid, { text: body })
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
      await opencodeApi.interrupt(opts.value, currentSid.value)
    } catch (e: unknown) {
      ElMessage.error('中止失败: ' + (e as Error).message)
      return
    }
    // 中止后服务端不一定会补发 execution.failed/succeeded 事件，
    // 需在前端主动收尾：结束繁忙态、冲刷未落地的流式 delta、拉取最终消息。
    sessionBusy.value = false
    if (deltaRafId !== null) {
      cancelAnimationFrame(deltaRafId)
      deltaRafId = null
    }
    flushDeltas()
    await loadMessages(currentSid.value)
  }

  async function handleRefresh() {
    if (!currentSid.value) return
    await loadMessages(currentSid.value)
  }

  async function handleQuestionReply(labels: string[]) {
    if (!pendingQuestion.value) return
    const form = pendingQuestion.value
    pendingQuestion.value = null
    // v2 form 回复以 answers: { <fieldKey>: <value> } 提交
    const answers: Record<string, unknown> = {}
    form.fieldKeys.forEach((key, i) => {
      answers[key] = labels[i] ?? labels[0]
    })
    try {
      await opencodeApi.formReply(opts.value, form.sessionID, form.id, answers)
    } catch (e: unknown) {
      ElMessage.error('回复失败: ' + (e as Error).message)
    }
  }

  async function handleQuestionReject() {
    if (!pendingQuestion.value) return
    const form = pendingQuestion.value
    pendingQuestion.value = null
    try {
      await opencodeApi.formCancel(opts.value, form.sessionID, form.id)
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

  /**
   * v2 流式文本/思考以 ordinal 标识分段，此处按 ordinal 生成稳定的 partID，
   * 保证 text.started / text.delta / text.ended 能命中同一 part。
   */
  function ensureStreamPart(messageID: string, ordinal: number, type: 'text' | 'reasoning') {
    const partID = `ord-${type}-${ordinal}`
    const msgIdx = messages.value.findIndex((m) => m.info.id === messageID)
    if (msgIdx === -1) return partID
    const msg = messages.value[msgIdx]
    if (!msg.parts.some((p) => p.id === partID)) {
      const updated = [...messages.value]
      updated[msgIdx] = { ...msg, parts: [...msg.parts, { id: partID, type, text: '' }] }
      messages.value = updated
    }
    return partID
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
        let event: OpencodeEvent
        try {
          event = JSON.parse(e.data)
        } catch {
          return
        }
        if (!event.type) return
        const sid = currentSid.value
        // v2 事件业务数据统一放在 data 字段
        const data = (event.data || {}) as Record<string, unknown>
        const evtSid = data.sessionID as string | undefined
        if (evtSid && evtSid !== sid) return

        switch (event.type) {
          case 'session.execution.started':
            sessionBusy.value = true
            break
          case 'session.execution.succeeded':
            sessionBusy.value = false
            if (deltaRafId !== null) {
              cancelAnimationFrame(deltaRafId)
              flushDeltas()
            }
            if (sid) await loadMessages(sid)
            break
          case 'session.execution.failed': {
            sessionBusy.value = false
            const err = data.error as { message?: string } | undefined
            if (err?.message) ElMessage.error(err.message)
            if (sid) await loadMessages(sid)
            break
          }
          case 'session.step.started': {
            const messageID = data.assistantMessageID as string | undefined
            if (messageID) {
              patchMessage({ id: messageID, role: 'assistant', sessionID: sid })
            }
            break
          }
          case 'session.text.started': {
            const messageID = data.assistantMessageID as string | undefined
            if (messageID) ensureStreamPart(messageID, Number(data.ordinal) || 0, 'text')
            break
          }
          case 'session.text.delta': {
            const messageID = data.assistantMessageID as string | undefined
            if (!messageID) break
            const partID = ensureStreamPart(messageID, Number(data.ordinal) || 0, 'text')
            patchPartDelta(messageID, partID, 'text', String(data.delta ?? ''))
            break
          }
          case 'session.text.ended': {
            const messageID = data.assistantMessageID as string | undefined
            if (!messageID) break
            const partID = ensureStreamPart(messageID, Number(data.ordinal) || 0, 'text')
            patchPart({ id: partID, type: 'text', text: String(data.text ?? ''), messageID })
            break
          }
          case 'session.reasoning.started': {
            const messageID = data.assistantMessageID as string | undefined
            if (messageID) ensureStreamPart(messageID, Number(data.ordinal) || 0, 'reasoning')
            break
          }
          case 'session.reasoning.delta': {
            const messageID = data.assistantMessageID as string | undefined
            if (!messageID) break
            const partID = ensureStreamPart(messageID, Number(data.ordinal) || 0, 'reasoning')
            patchPartDelta(messageID, partID, 'text', String(data.delta ?? ''))
            break
          }
          case 'session.reasoning.ended': {
            const messageID = data.assistantMessageID as string | undefined
            if (!messageID) break
            const partID = ensureStreamPart(messageID, Number(data.ordinal) || 0, 'reasoning')
            patchPart({ id: partID, type: 'reasoning', text: String(data.text ?? ''), messageID })
            break
          }
          case 'session.tool.input.started':
          case 'session.tool.input.delta':
          case 'session.tool.input.ended':
          case 'session.tool.progress':
          case 'session.tool.success':
          case 'session.tool.failed': {
            if (sid) await loadMessages(sid)
            break
          }
          case 'session.form.created':
          case 'session.form.state': {
            if (sid) await loadPendingForms(sid)
            break
          }
          case 'session.form.replied':
          case 'session.form.cancelled':
            pendingQuestion.value = null
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
