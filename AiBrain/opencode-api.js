const DEFAULT_BASE = 'http://127.0.0.1:4096'

function buildAuth(opts) {
  if (!opts.pass) return {}
  return {
    authorization: `Basic ${btoa(`${opts.user || 'opencode'}:${opts.pass}`)}`,
  }
}

function buildUrl(base, path) {
  const b = base && base.endsWith('/') ? base : `${base || DEFAULT_BASE}/`
  return new URL(path.startsWith('/') ? path.slice(1) : path, b).toString()
}

async function req(opts, path, init) {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json')
  headers.set('x-opencode-directory', opts.dir || '')
  for (const [key, value] of Object.entries(buildAuth(opts))) {
    headers.set(key, value)
  }

  const res = await fetch(buildUrl(opts.base, path), {
    ...init,
    headers,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `请求失败: ${res.status}`)
  }

  if (res.status === 204) return undefined
  return res.json()
}

export const opencodeApi = {
  health(opts) {
    return req(opts, '/global/health')
  },
  providers(opts) {
    return req(opts, '/provider')
  },
  sessions(opts) {
    return req(opts, '/session')
  },
  create(opts, title) {
    return req(opts, '/session', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    })
  },
  messages(opts, sid) {
    return req(opts, `/session/${sid}/message`)
  },
  prompt(opts, sid, input) {
    return req(opts, `/session/${sid}/prompt_async`, {
      method: 'POST',
      body: JSON.stringify({
        agent: input.agent || undefined,
        model:
          input.providerID && input.modelID
            ? { providerID: input.providerID, modelID: input.modelID }
            : undefined,
        parts: [{ type: 'text', text: input.text }],
      }),
    })
  },
  deleteSession(opts, sid) {
    return req(opts, `/session/${sid}`, { method: 'DELETE' })
  },
  abort(opts, sid) {
    return req(opts, `/session/${sid}/abort`, { method: 'POST' })
  },
  questionReply(opts, requestID, body) {
    return req(opts, `/question/${requestID}/reply`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  questionReject(opts, requestID) {
    return req(opts, `/question/${requestID}/reject`, { method: 'POST' })
  },
  event(opts) {
    const u = new URL(buildUrl(opts.base, '/event'))
    u.searchParams.set('directory', opts.dir || '')
    if (opts.pass) {
      u.searchParams.set('auth_token', btoa(`${opts.user || 'opencode'}:${opts.pass}`))
    }
    return new EventSource(u.toString())
  },
}
