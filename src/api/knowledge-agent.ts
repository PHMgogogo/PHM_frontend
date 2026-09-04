import { ApiError, createClient, extractApiErrorMessage } from './client'
import { API_PREFIX } from '@/config/endpoints'
import { createSseParser, SseLimitError } from '@/utils/sse'
import {
  normalizeChatHistory,
  normalizeKnowledgeStreamEvent,
  type ChatHistoryResponse,
  type KnowledgeStreamEvent,
} from '@/utils/knowledge-normalize'

const client = createClient({ baseURL: API_PREFIX.RAG })

export type KnowledgeMode = 'thinking' | 'fast'

export interface KnowledgeChatRequest {
  message: string
  session_id?: string
  stream: true
  include_sources: true
  mode: KnowledgeMode
}

export type FeedbackType = 'THUMBS_UP' | 'THUMBS_DOWN' | 'CORRECTION' | 'FLAG'

export interface FeedbackRequest {
  session_id: string
  message_id: string
  trace_id: string
  feedback_type: FeedbackType
  content: string
  original_answer: string
  corrected_answer: string
}

export interface StreamKnowledgeOptions {
  signal: AbortSignal
  onEvent(event: KnowledgeStreamEvent): void
  connectTimeoutMs?: number
}

function ragUrl(path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('RAG path must be relative')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_PREFIX.RAG}${normalized}`
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = (await response.text()).slice(0, 2_000)
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function streamKnowledgeChat(
  request: KnowledgeChatRequest,
  options: StreamKnowledgeOptions,
): Promise<void> {
  const controller = new AbortController()
  let connectTimedOut = false
  const abortFromCaller = () => controller.abort()
  if (options.signal.aborted) controller.abort()
  else options.signal.addEventListener('abort', abortFromCaller, { once: true })

  const timeout = setTimeout(() => {
    connectTimedOut = true
    controller.abort()
  }, options.connectTimeoutMs ?? 15_000)

  let response: Response
  try {
    response = await fetch(ragUrl('/chat/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  } catch (error) {
    options.signal.removeEventListener('abort', abortFromCaller)
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (options.signal.aborted && !connectTimedOut) {
        throw new ApiError('请求已取消', undefined, undefined, 'cancelled')
      }
      throw new ApiError('连接知识库 Agent 超时', undefined, undefined, 'timeout')
    }
    throw new ApiError((error as Error).message || '知识库 Agent 网络错误', undefined, undefined, 'network')
  } finally {
    clearTimeout(timeout)
  }

  try {
    if (!response.ok) {
      const payload = await responsePayload(response)
      throw new ApiError(
        extractApiErrorMessage(payload, response.status),
        response.status,
        payload,
        'http',
      )
    }
    if (!response.body) {
      throw new ApiError('服务未返回流式响应', undefined, undefined, 'invalid-response')
    }

    const parser = createSseParser({
      onEvent(raw) {
        const event = normalizeKnowledgeStreamEvent(raw)
        if (event) options.onEvent(event)
      },
    })
    const reader = response.body.getReader()
    try {
      while (true) {
        if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const { done, value } = await reader.read()
        if (done) break
        parser.push(value)
      }
      parser.finish()
    } catch (error) {
      if (error instanceof SseLimitError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError('请求已取消', undefined, undefined, 'cancelled')
      }
      throw error
    } finally {
      try {
        await reader.cancel()
      } catch {
        // reader 可能已自然结束。
      }
      reader.releaseLock()
    }
  } finally {
    options.signal.removeEventListener('abort', abortFromCaller)
  }
}

export async function getChatHistory(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatHistoryResponse> {
  const response = await client.get<unknown>(
    `/chat/history/${encodeURIComponent(sessionId)}`,
    { limit: '50' },
    { signal },
  )
  const normalized = normalizeChatHistory(response)
  if (!normalized || normalized.session_id !== sessionId) {
    throw new ApiError('会话历史响应格式无效', undefined, undefined, 'invalid-response')
  }
  return normalized
}

export function submitFeedback(request: FeedbackRequest, signal?: AbortSignal) {
  return client.post<unknown>('/feedback', request, { signal }).then((response) => {
    const record = response && typeof response === 'object' && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : null
    if (!record || record.status !== 'ok' || typeof record.id !== 'string' || !record.id.trim()) {
      throw new ApiError('反馈响应格式无效', undefined, undefined, 'invalid-response')
    }
    return { status: 'ok' as const, id: record.id.slice(0, 256) }
  })
}

export function deleteRemoteSession(sessionId: string, signal?: AbortSignal) {
  return client.del<{ status: string; message: string }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
    { signal },
  )
}
