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

interface PromptInput {
  text: string
  agent?: string
  providerID?: string
  modelID?: string
}

function buildAuth(opts: ConnOpts): Record<string, string> {
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

async function req<T = unknown>(opts: ConnOpts, path: string, init?: RequestInit): Promise<T> {
  // 深拷贝：若 opts 是 Vue reactive proxy，解包为纯对象，避免传递 Proxy 给原生 API
  const opts_deepcopy: ConnOpts = JSON.parse(JSON.stringify(opts))
  const timeout = opts_deepcopy.timeout ?? 15000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)

  // 如果调用方也传了 signal，联动：任一 abort 都会触发另一个
  if (init?.signal) {
    if (init.signal.aborted) ctrl.abort()
    else init.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }

  const headers = new Headers((init?.headers as HeadersInit) || {})
  headers.set('content-type', 'application/json')
  headers.set('x-opencode-directory', opts_deepcopy.dir || '')
  for (const [key, value] of Object.entries(buildAuth(opts_deepcopy))) {
    headers.set(key, value)
  }

  try {
    const res = await fetch(buildUrl(opts_deepcopy.base, path), {
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
  health: (opts: ConnOpts) => req<{ version?: string }>(opts, '/global/health'),
  providers: (opts: ConnOpts) => req<{ all?: Array<{ id: string; models?: Record<string, { id: string }> }> }>(opts, '/provider'),
  sessions: (opts: ConnOpts) => req<Array<{ id: string; title?: string }>>(opts, '/session'),
  create: (opts: ConnOpts, title?: string) =>
    req<{ id: string; title?: string }>(opts, '/session', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  messages: async (opts: ConnOpts, sid: string) => {
    return req<unknown[]>(opts, `/session/${sid}/message`)
  },
  prompt: (opts: ConnOpts, sid: string, input: PromptInput) =>
    req(opts, `/session/${sid}/prompt_async`, {
      method: 'POST',
      body: JSON.stringify({
        agent: input.agent || undefined,
        model:
          input.providerID && input.modelID
            ? { providerID: input.providerID, modelID: input.modelID }
            : undefined,
        parts: [{ type: 'text', text: input.text }],
      }),
    }),
  deleteSession: (opts: ConnOpts, sid: string) =>
    req(opts, `/session/${sid}`, { method: 'DELETE' }),
  abort: (opts: ConnOpts, sid: string) =>
    req(opts, `/session/${sid}/abort`, { method: 'POST' }),
  questionReply: (opts: ConnOpts, requestID: string, body: unknown) =>
    req(opts, `/question/${requestID}/reply`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  questionReject: (opts: ConnOpts, requestID: string) =>
    req(opts, `/question/${requestID}/reject`, { method: 'POST' }),
  event: (opts: ConnOpts): EventSource => {
    const relPath = buildUrl(opts.base, '/event')
    // buildUrl 返回的是相对路径（如 /opencode/event），
    // new URL() 单参数要求绝对 URL，需以当前页面 origin 为基准解析
    const u = new URL(relPath, window.location.origin)
    u.searchParams.set('directory', opts.dir || '')
    if (opts.pass) {
      u.searchParams.set('auth_token', btoa(`${opts.user || 'opencode'}:${opts.pass}`))
    }
    return new EventSource(u.toString())
  },
}
