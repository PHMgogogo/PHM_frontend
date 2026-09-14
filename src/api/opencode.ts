import { API_PREFIX } from '@/config/endpoints'

const DEFAULT_BASE = API_PREFIX.OPENCODE

export interface ConnOpts {
  base?: string
  dir?: string
  user?: string
  pass?: string
  /** 请求超时毫秒数，默认 15000 */
  timeout?: number
}

/** 模型引用（v2 Model.Ref） */
export interface ModelRef {
  providerID: string
  /** v2 使用 id 字段表示模型标识 */
  id?: string
  modelID?: string
  variant?: string
}

interface PromptInput {
  text: string
}

/** v2 事件负载（SSE /api/event） */
export interface OpencodeEvent {
  id?: string
  created?: number
  type: string
  location?: { directory?: string }
  data?: Record<string, unknown>
  [key: string]: unknown
}

function buildAuth(opts: ConnOpts): Record<string, string> {
  // v2 仍使用 HTTP Basic 认证
  if (!opts.pass) return {}
  return {
    authorization: `Basic ${btoa(`${opts.user || 'opencode'}:${opts.pass}`)}`,
  }
}

function buildUrl(base: string | undefined, path: string): string {
  const rawBase = (base || DEFAULT_BASE).trim()
  const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase
  const relativePath = path.startsWith('/') ? path.slice(1) : path

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(baseUrl) || baseUrl.startsWith('//')) {
    return new URL(relativePath, `${baseUrl}/`).toString()
  }

  return `${baseUrl}/${relativePath}`
}

/**
 * v2 通过 ``location[directory]`` 查询参数指定工作目录（deepObject 风格），
 * 旧版的 ``x-opencode-directory`` 请求头已失效。
 */
function appendLocation(url: string, dir?: string): string {
  if (!dir) return url
  const u = new URL(url, window.location.origin)
  u.searchParams.set('location[directory]', dir)
  return u.toString()
}

async function req<T = unknown>(opts: ConnOpts, path: string, init?: RequestInit): Promise<T> {
  // 深拷贝：若 opts 是 Vue reactive proxy，解包为纯对象，避免传递 Proxy 给原生 API
  const opts_deepcopy: ConnOpts = JSON.parse(JSON.stringify(opts))
  const timeout = opts_deepcopy.timeout ?? 60000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)

  // 如果调用方也传了 signal，联动：任一 abort 都会触发另一个
  if (init?.signal) {
    if (init.signal.aborted) ctrl.abort()
    else init.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }

  const headers = new Headers((init?.headers as HeadersInit) || {})
  headers.set('content-type', 'application/json')
  for (const [key, value] of Object.entries(buildAuth(opts_deepcopy))) {
    headers.set(key, value)
  }

  const url = appendLocation(buildUrl(opts_deepcopy.base, path), opts_deepcopy.dir)

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `请求失败: ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    const resj = await res.json()
    return Promise.resolve(resj) as T
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('请求超时，OpenCode 服务未响应')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export const opencodeApi = {
  /** 健康检查：{healthy, version, pid} */
  health: (opts: ConnOpts) => req<{ healthy?: boolean; version?: string; pid?: number }>(opts, '/api/health'),
  /** 模型列表：{location, data:[{id, modelID, providerID, name, ...}]} */
  models: (opts: ConnOpts) =>
    req<{ data?: Array<{ id?: string; modelID?: string; providerID?: string; name?: string }> }>(
      opts,
      '/api/model',
    ),
  /** Provider 列表：{location, data:[{id, name, ...}]} */
  providers: (opts: ConnOpts) =>
    req<{ data?: Array<{ id: string; name?: string }> }>(opts, '/api/provider'),
  /** 会话列表：{data:[{id, title?, ...}]} */
  sessions: (opts: ConnOpts) =>
    req<{ data?: Array<{ id: string; title?: string }> }>(opts, '/api/session'),
  /**
   * 创建会话：body {title?, model?, location?}，返回 {data:{id, title?, ...}}
   * 注意：创建会话时 query 参数 location[directory] 会被服务端忽略，
   * 工作目录必须放到请求体的 location 字段（Location.Ref）才生效。
   */
  create: (opts: ConnOpts, title?: string, model?: ModelRef, dir?: string) =>
    req<{ data: { id: string; title?: string } }>(opts, '/api/session', {
      method: 'POST',
      body: JSON.stringify({
        title: title || undefined,
        model: model ? normalizeModelRef(model) : undefined,
        location: dir ? { directory: dir } : undefined,
      }),
    }),
  /** 切换会话模型：body 必须为 {model: Model.Ref} */
  switchModel: (opts: ConnOpts, sid: string, model: ModelRef) =>
    req(opts, `/api/session/${sid}/model`, {
      method: 'POST',
      body: JSON.stringify({ model: normalizeModelRef(model) }),
    }),
  /** 消息列表：{data:[...], cursor}；order=asc 保证按时间正序返回（v2 限制 limit ≤ 200） */
  messages: (opts: ConnOpts, sid: string) =>
    req<{ data?: unknown[]; cursor?: unknown }>(
      opts,
      `/api/session/${sid}/message?order=asc&limit=200`,
    ),
  /**
   * 发送提示词：body {text}
   * 注意：v2 的 /prompt 接口不接受 model 字段（additionalProperties=false，会被静默丢弃），
   * 会话使用的模型由「创建会话时的 model」或「/model 切换接口」决定。
   */
  prompt: (opts: ConnOpts, sid: string, input: PromptInput) =>
    req(opts, `/api/session/${sid}/prompt`, {
      method: 'POST',
      body: JSON.stringify({ text: input.text }),
    }),
  /** 删除会话 */
  deleteSession: (opts: ConnOpts, sid: string) =>
    req(opts, `/api/session/${sid}`, { method: 'DELETE' }),
  /** 中断当前执行 */
  interrupt: (opts: ConnOpts, sid: string) =>
    req(opts, `/api/session/${sid}/interrupt`, { method: 'POST' }),
  /** 列出会话待处理的 form */
  forms: (opts: ConnOpts, sid: string) =>
    req<{ data?: Array<FormInfo> }>(opts, `/api/session/${sid}/form`),
  /** 回复 form（v2 取代旧 question.reply） */
  formReply: (opts: ConnOpts, sid: string, formID: string, answers: Record<string, unknown>) =>
    req(opts, `/api/session/${sid}/form/${formID}/reply`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  /** 取消 form（v2 取代旧 question.reject） */
  formCancel: (opts: ConnOpts, sid: string, formID: string) =>
    req(opts, `/api/session/${sid}/form/${formID}/cancel`, { method: 'POST' }),
  event: (opts: ConnOpts): EventSource => {
    const base = appendLocation(buildUrl(opts.base, '/api/event'), opts.dir)
    const u = new URL(base, window.location.origin)
    if (opts.pass) {
      u.searchParams.set('auth_token', btoa(`${opts.user || 'opencode'}:${opts.pass}`))
    }
    return new EventSource(u.toString())
  },
}

/** v2 统一使用 {id, providerID, variant?}，此处做字段归一 */
function normalizeModelRef(model: ModelRef): ModelRef {
  return {
    providerID: model.providerID,
    id: model.id || model.modelID || '',
    variant: model.variant,
  }
}

/** v2 form 描述（AI 主动提问的新载体） */
export interface FormField {
  key: string
  type?: string
  title?: string
  description?: string
  required?: boolean
  options?: Array<{ label?: string; value?: unknown; [k: string]: unknown }>
  [k: string]: unknown
}

export interface FormInfo {
  id: string
  sessionID: string
  title: string
  fields?: FormField[]
}
