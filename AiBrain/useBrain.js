import { ref, computed, watch, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { opencodeApi } from '../../lib/opencode-api.js'

export function useBrain() {
  // ---- 连接配置 ----
  const serverBase = ref('http://127.0.0.1:4096')
  const workDir = ref('D:\\AA Lynx\'s Workspace\\user_project\\web_test')
  const password = ref('')
  const connecting = ref(false)
  const connected = ref(false)
  const serverVersion = ref('')
  const errorMsg = ref('')

  // ---- 模型 ----
  const modelOptions = ref([])
  const selectedModel = ref('')

  // ---- 会话 ----
  const sessions = ref([])
  const currentSid = ref('')
  const newSessionTitle = ref('')
  const creating = ref(false)

  // ---- 消息 ----
  const messages = ref([])
  const inputText = ref('')
  const sending = ref(false)
  const sessionBusy = ref(false)

  // ---- Question ----
  const pendingQuestion = ref(null)

  // ---- SSE ----
  let eventSource = null

  // ---- 请求配置 ----
  const opts = computed(() => ({
    base: serverBase.value,
    dir: workDir.value,
    user: 'opencode',
    pass: password.value,
  }))

  // ---- 连接 ----
  async function handleConnect() {
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

      const options = []
      for (const provider of (providersRes.all || [])) {
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
        const preferred = options.find(o => o.providerID === 'alibaba-cn' && o.modelID.includes('qwen3.5-plus'))
          || options.find(o => o.providerID === 'alibaba-cn' && /qwen/i.test(o.modelID))
          || options[0]
        if (preferred) selectedModel.value = preferred.value
      }

      sessions.value = sessionsRes || []
      ElMessage.success('连接成功')
      startEventSource()  // 连接成功后立即建立 SSE
    } catch (e) {
      errorMsg.value = e.message || '连接失败'
      connected.value = false
    } finally {
      connecting.value = false
    }
  }

  // ---- 打开会话 ----
  async function handleOpenSession(sid) {
    currentSid.value = sid
    sessionBusy.value = false
    pendingQuestion.value = null
    await loadMessages(sid)
  }

  async function loadMessages(sid) {
    try {
      messages.value = await opencodeApi.messages(opts.value, sid)
    } catch (e) {
      ElMessage.error('加载消息失败: ' + e.message)
    }
  }

  // ---- 创建会话 ----
  async function handleCreateSession() {
    creating.value = true
    try {
      const session = await opencodeApi.create(opts.value, newSessionTitle.value || undefined)
      sessions.value = [session, ...sessions.value]
      newSessionTitle.value = ''
      await handleOpenSession(session.id)
    } catch (e) {
      ElMessage.error('创建会话失败: ' + e.message)
    } finally {
      creating.value = false
    }
  }

  // ---- 删除会话 ----
  async function handleDeleteSession(item) {
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
      sessions.value = sessions.value.filter(s => s.id !== item.id)
      if (currentSid.value === item.id) {
        currentSid.value = ''
        messages.value = []
        sessionBusy.value = false
        pendingQuestion.value = null
      }
      ElMessage.success('会话已删除')
    } catch (e) {
      ElMessage.error('删除失败: ' + e.message)
    }
  }

  // ---- 发送消息 ----
  async function handleSend() {
    const sid = currentSid.value
    const body = inputText.value.trim()
    if (!sid || !body) return

    const modelOpt = modelOptions.value.find(m => m.value === selectedModel.value)
    sending.value = true
    sessionBusy.value = true
    inputText.value = ''

    // 乐观更新：立即在 UI 上展示用户消息
    const optimisticId = `optimistic-${Date.now()}`
    messages.value = [
      ...messages.value,
      { info: { id: optimisticId, role: 'user', sessionID: sid }, parts: [{ type: 'text', text: body }] },
    ]

    try {
      await opencodeApi.prompt(opts.value, sid, {
        text: body,
        providerID: modelOpt?.providerID,
        modelID: modelOpt?.modelID,
      })
      // 发送成功后全量同步一次，用真实消息替换乐观条目
      await loadMessages(sid)
    } catch (e) {
      ElMessage.error('发送失败: ' + e.message)
      // 回滚乐观条目
      messages.value = messages.value.filter(m => m.info.id !== optimisticId)
      inputText.value = body
      sessionBusy.value = false
    } finally {
      sending.value = false
    }
  }

  // ---- 中止生成 ----
  async function handleAbort() {
    if (!currentSid.value) return
    try {
      await opencodeApi.abort(opts.value, currentSid.value)
    } catch (e) {
      ElMessage.error('中止失败: ' + e.message)
    }
  }

  // ---- 刷新消息 ----
  async function handleRefresh() {
    if (!currentSid.value) return
    await loadMessages(currentSid.value)
  }

  // ---- Question 交互 ----
  async function handleQuestionReply(labels) {
    if (!pendingQuestion.value) return
    const qid = pendingQuestion.value.id
    pendingQuestion.value = null
    try {
      await opencodeApi.questionReply(opts.value, qid, { answers: [labels] })
    } catch (e) {
      ElMessage.error('回复失败: ' + e.message)
    }
  }

  async function handleQuestionReject() {
    if (!pendingQuestion.value) return
    const qid = pendingQuestion.value.id
    pendingQuestion.value = null
    try {
      await opencodeApi.questionReject(opts.value, qid)
    } catch (e) {
      ElMessage.error('拒绝失败: ' + e.message)
    }
  }

  // ---- 增量 patch：仅更新消息 info ----
  function patchMessage(info) {
    const idx = messages.value.findIndex(m => m.info.id === info.id)
    console.log(`[patchMessage] id=${info.id}, found=${idx !== -1}, total_msgs=${messages.value.length}`)
    if (idx !== -1) {
      const updated = [...messages.value]
      updated[idx] = { ...updated[idx], info }
      messages.value = updated
    } else {
      messages.value = [...messages.value, { info, parts: [] }]
    }
  }

  // ---- 增量 patch：仅更新消息中的某个 part ----
  function patchPart(part) {
    const msgIdx = messages.value.findIndex(m => m.info.id === part.messageID)
    console.log(`[patchPart] messageID=${part.messageID}, partID=${part.id}, type=${part.type}, msgFound=${msgIdx !== -1}`)
    if (msgIdx === -1) {
      console.warn(`[patchPart] 未找到对应消息！当前 messages:`, messages.value.map(m => m.info?.id))
      return
    }

    const msg = messages.value[msgIdx]
    const partIdx = msg.parts.findIndex(p => p.id === part.id)
    console.log(`[patchPart] partFound=${partIdx !== -1}, textLen=${part.text?.length ?? 'n/a'}`)

    const newParts = partIdx !== -1
      ? msg.parts.map((p, i) => i === partIdx ? { ...p, ...part } : p)
      : [...msg.parts, part]

    const updated = [...messages.value]
    updated[msgIdx] = { ...msg, parts: newParts }
    messages.value = updated
  }

  // ---- 增量 patch：将 delta 追加到指定 part 的指定字段 ----
  function patchPartDelta(messageID, partID, field, delta) {
    const msgIdx = messages.value.findIndex(m => m.info.id === messageID)
    if (msgIdx === -1) return

    const msg = messages.value[msgIdx]
    const partIdx = msg.parts.findIndex(p => p.id === partID)
    if (partIdx === -1) return

    const oldPart = msg.parts[partIdx]
    const newPart = { ...oldPart, [field]: (oldPart[field] ?? '') + delta }
    const newParts = msg.parts.map((p, i) => i === partIdx ? newPart : p)

    const updated = [...messages.value]
    updated[msgIdx] = { ...msg, parts: newParts }
    messages.value = updated
  }

  // ---- SSE ----
  function startEventSource() {
    stopEventSource()
    if (!workDir.value) return
    console.log('[SSE] 启动 EventSource, workDir=', workDir.value)
    try {
      eventSource = opencodeApi.event(opts.value)
      eventSource.onopen = () => console.log('[SSE] 连接已建立')
      eventSource.onmessage = async (e) => {
        let event
        try { event = JSON.parse(e.data) } catch {
          console.warn('[SSE] 解析事件失败，原始数据:', e.data)
          return
        }

        // 打印所有收到的事件类型（过滤高频噪音）
        if (!['ping', 'heartbeat', 'server.heartbeat', 'message.part.delta'].includes(event.type)) {
          console.log(`[SSE] event.type=${event.type}`, event.properties)
        }

        const sid = currentSid.value
        const props = event.properties || {}

        switch (event.type) {
          case 'session.status':
            if (props.sessionID === sid) {
              const isIdle = props.status?.type === 'idle'
              console.log(`[SSE] session.status → ${props.status?.type}, isIdle=${isIdle}`)
              sessionBusy.value = !isIdle
              if (isIdle) {
                // 生成结束后做一次全量同步，确保最终状态一致
                console.log('[SSE] idle → 全量 loadMessages')
                await loadMessages(sid)
              }
            } else {
              console.log(`[SSE] session.status 忽略（sid 不匹配: props=${props.sessionID}, cur=${sid}）`)
            }
            break

          case 'message.updated':
            console.log(`[SSE] message.updated: sessionID=${props.sessionID}, cur=${sid}, hasInfo=${!!props.info}`)
            if (props.info && props.sessionID === sid) {
              patchMessage(props.info)
            }
            break

          case 'message.part.updated':
            console.log(`[SSE] message.part.updated: sessionID=${props.sessionID}, cur=${sid}, hasPart=${!!props.part}`)
            if (props.part && props.sessionID === sid) {
              patchPart(props.part)
            }
            break

          case 'message.part.delta':
            // 真正的流式 token，逐字追加到对应 part 字段
            if (props.sessionID === sid && props.messageID && props.partID) {
              patchPartDelta(props.messageID, props.partID, props.field || 'text', props.delta || '')
            }
            break

          case 'question.asked':
            if (props.sessionID === sid) {
              pendingQuestion.value = props
            }
            break

          case 'question.replied':
          case 'question.rejected':
            if (props.sessionID === sid) {
              pendingQuestion.value = null
            }
            break

          default:
            // 未处理的事件类型，已在上方打印
            break
        }
      }
      eventSource.onerror = (err) => {
        console.error('[SSE] 连接出错:', err)
        stopEventSource()
      }
    } catch (e) {
      console.error('[SSE] EventSource 构造失败:', e)
    }
  }

  function stopEventSource() {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  watch(workDir, () => startEventSource())
  onUnmounted(() => stopEventSource())

  return {
    // 状态
    serverBase, workDir, password,
    connecting, connected, serverVersion, errorMsg,
    modelOptions, selectedModel,
    sessions, currentSid, newSessionTitle, creating,
    messages, inputText, sending, sessionBusy,
    pendingQuestion,
    // 操作
    handleConnect,
    handleOpenSession,
    handleCreateSession,
    handleDeleteSession,
    handleSend,
    handleAbort,
    handleRefresh,
    handleQuestionReply,
    handleQuestionReject,
  }
}
