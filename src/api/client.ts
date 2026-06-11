// ============================================================
// HTTP 客户端 — 基于 fetch 的可实例化封装
// ============================================================
// 使用工厂函数 createClient() 创建绑定不同 baseURL 的客户端实例，
// 每个实例享有独立的超时控制、错误封装和请求方法。

export interface ClientConfig {
  /** 该实例的前缀，例如 '/api' 或 '/document'，需与 vite proxy 对齐 */
  baseURL: string
  /** 请求超时毫秒数，默认 15000 */
  timeout?: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 标准请求选项（透传给 fetch） */
export interface RequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
}

// ---- 工厂函数 ----

export function createClient(config: ClientConfig) {
  const { baseURL, timeout = 15000 } = config

  /** 拼接最终的请求 URL */
  function buildUrl(path: string): string {
    const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`
    const p = path.startsWith('/') ? path.slice(1) : path
    return `${base}${p}`
  }

  /** 创建带超时的 AbortSignal */
  function createSignal(customSignal?: AbortSignal): { signal?: AbortSignal; clear(): void } {
    if (!timeout && !customSignal) return { signal: undefined, clear() {} }
    const ctrl = new AbortController()
    const timer = timeout ? setTimeout(() => ctrl.abort(), timeout) : undefined
    // 外部信号也联动取消
    if (customSignal) {
      if (customSignal.aborted) ctrl.abort()
      else customSignal.addEventListener('abort', () => ctrl.abort(), { once: true })
    }
    return {
      signal: ctrl.signal,
      clear() {
        if (timer) clearTimeout(timer)
      },
    }
  }

  async function request<T>(
    method: string,
    path: string,
    body?: BodyInit | null,
    headers?: Record<string, string>,
  ): Promise<T> {
    const { signal, clear } = createSignal()
    try {
      const res = await fetch(buildUrl(path), {
        method,
        headers,
        body,
        signal,
      })
      if (!res.ok) {
        let data: unknown
        try { data = await res.json() } catch { /* ignore */ }
        const text = typeof data === 'object' ? JSON.stringify(data) : String(data ?? '')
        throw new ApiError(text || `请求失败: ${res.status}`, res.status, data)
      }
      return res.json() as T
    } catch (e) {
      if (e instanceof ApiError) throw e
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new ApiError('请求超时', undefined)
      }
      throw new ApiError((e as Error).message || '网络错误', undefined)
    } finally {
      clear()
    }
  }

  // ---- 公开方法 ----

  function get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = path
    if (params) {
      const sp = new URLSearchParams(params)
      url += `?${sp.toString()}`
    }
    return request<T>('GET', url)
  }

  function post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body ? JSON.stringify(body) : undefined, {
      'Content-Type': 'application/json',
    })
  }

  function put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('PUT', path, body ? JSON.stringify(body) : undefined, {
      'Content-Type': 'application/json',
    })
  }

  function del<T>(path: string): Promise<T> {
    return request<T>('DELETE', path)
  }

  function upload<T>(path: string, formData: FormData): Promise<T> {
    return request<T>('POST', path, formData)
  }

  return { get, post, put, del, upload }
}

// ============================================================
// 默认导出：向后兼容的单例（原有直接导入 get/post/del 的代码不受影响）
// 同时保留工厂函数供多后端场景使用
// ============================================================
const defaultClient = createClient({ baseURL: '/api' })

export const get = defaultClient.get
export const post = defaultClient.post
export const put = defaultClient.put
export const del = defaultClient.del
export const upload = defaultClient.upload
