const DEFAULT_BASE = 'http://127.0.0.1:4096'

interface ConnOpts {
  base?: string
  dir?: string
  user?: string
  pass?: string
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
  const b = base && base.endsWith('/') ? base : `${base || DEFAULT_BASE}/`
  return new URL(path.startsWith('/') ? path.slice(1) : path, b).toString()
}

async function req<T = unknown>(opts: ConnOpts, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers((init?.headers as HeadersInit) || {})
  headers.set('content-type', 'application/json')
  headers.set('x-opencode-directory', opts.dir || '')
  for (const [key, value] of Object.entries(buildAuth(opts))) {
    headers.set(key, value)
  }
  const res = await fetch(buildUrl(opts.base, path), { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `请求失败: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as T
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
  messages: (opts: ConnOpts, sid: string) => req<unknown[]>(opts, `/session/${sid}/message`),
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
    const u = new URL(buildUrl(opts.base, '/event'))
    u.searchParams.set('directory', opts.dir || '')
    if (opts.pass) {
      u.searchParams.set('auth_token', btoa(`${opts.user || 'opencode'}:${opts.pass}`))
    }
    return new EventSource(u.toString())
  },
}
