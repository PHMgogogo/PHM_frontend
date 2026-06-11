import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { opencodeApi } from '@/lib/opencode-api'

// 默认连接配置（来自 ConnectionConfig.vue 默认填充值）
const DEFAULT_OPTS = {
  base: 'http://127.0.0.1:4096',
  dir: "D:\\AA Lynx's Workspace\\user_project\\web_test",
  user: 'opencode',
  pass: '',
}

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

  const opts = computed(() => DEFAULT_OPTS)

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
          options.find((o) => o.providerID === 'alibaba-cn' && o.modelID.includes('qwen')) ||
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
      messages.value = (await opencodeApi.messages(opts.value, sid)) as ChatMessage[]
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

  function patchPartDelta(messageID: string, partID: string, field: string, delta: string) {
    const msgIdx = messages.value.findIndex((m) => m.info.id === messageID)
    if (msgIdx === -1) return
    const msg = messages.value[msgIdx]
    const partIdx = msg.parts.findIndex((p) => p.id === partID)
    if (partIdx === -1) return
    const oldPart = msg.parts[partIdx] as Record<string, unknown>
    const newPart = { ...oldPart, [field]: ((oldPart[field] as string) ?? '') + delta }
    const newParts = msg.parts.map((p, i) => (i === partIdx ? (newPart as unknown as MessagePart) : p))
    const updated = [...messages.value]
    updated[msgIdx] = { ...msg, parts: newParts }
    messages.value = updated
  }

  // ---- SSE ----
  function startEventSource() {
    stopEventSource()
    try {
      eventSource = opencodeApi.event(opts.value)
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
      eventSource.onerror = () => stopEventSource()
    } catch {
      // ignore
    }
  }

  function stopEventSource() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  function dispose() {
    stopEventSource()
  }

  return {
    connecting, connected, serverVersion, errorMsg,
    modelOptions, selectedModel,
    sessions, currentSid, newSessionTitle, creating,
    messages, inputText, sending, sessionBusy,
    pendingQuestion,
    autoConnect, retryConnect,
    handleOpenSession, handleCreateSession, handleDeleteSession,
    handleSend, handleAbort, handleRefresh,
    handleQuestionReply, handleQuestionReject,
    dispose,
  }
})
