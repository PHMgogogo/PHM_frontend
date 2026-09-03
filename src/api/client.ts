// ============================================================
// HTTP 客户端 — 基于 fetch 的可实例化封装
// ============================================================
// 使用工厂函数 createClient() 创建绑定不同 baseURL 的客户端实例，
// 每个实例享有独立的超时控制、错误封装和请求方法。

import { API_PREFIX } from '@/config/endpoints'

export interface ClientConfig {
  /** 该实例的前缀，例如 '/api' 或 '/document'，需与 vite proxy 对齐 */
  baseURL: string
  /** 请求超时毫秒数，默认 15000 */
  timeout?: number
}

export type ApiErrorKind = 'http' | 'timeout' | 'cancelled' | 'network' | 'invalid-response'

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown,
    public kind: ApiErrorKind = status === undefined ? 'network' : 'http',
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

function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const message = (item as Record<string, unknown>).msg
        return typeof message === 'string' && message.trim() ? message.trim() : null
      })
      .filter((item): item is string => item !== null)
    return messages.length ? messages.join('；') : null
  }
  return null
}

export function extractApiErrorMessage(data: unknown, status?: number): string {
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 2_000)
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>
    const detail = detailMessage(record.detail)
    if (detail) return detail.slice(0, 2_000)
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim().slice(0, 2_000)
    }
  }
  return status === undefined ? '网络错误' : `请求失败（${status}）`
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
  function createSignal(customSignal?: AbortSignal): {
    signal?: AbortSignal
    didTimeout(): boolean
    clear(): void
  } {
    if (!timeout && !customSignal) {
      return { signal: undefined, didTimeout: () => false, clear() {} }
    }
    const ctrl = new AbortController()
    let timedOut = false
    const timer = timeout
      ? setTimeout(() => {
          timedOut = true
          ctrl.abort()
        }, timeout)
      : undefined
    const abortFromCaller = () => ctrl.abort()
    if (customSignal) {
      if (customSignal.aborted) ctrl.abort()
      else customSignal.addEventListener('abort', abortFromCaller, { once: true })
    }
    return {
      signal: ctrl.signal,
      didTimeout: () => timedOut,
      clear() {
        if (timer) clearTimeout(timer)
        customSignal?.removeEventListener('abort', abortFromCaller)
      },
    }
  }

  async function request<T>(
    method: string,
    path: string,
    body?: BodyInit | null,
    headers?: Record<string, string>,
    options: RequestOptions = {},
  ): Promise<T> {
    const { signal, didTimeout, clear } = createSignal(options.signal)
    try {
      const res = await fetch(buildUrl(path), {
        method,
        headers: { ...headers, ...options.headers },
        body,
        signal,
      })
      const rawText = await res.text()
      let data: unknown
      if (rawText) {
        try {
          data = JSON.parse(rawText) as unknown
        } catch {
          data = rawText.slice(0, 2_000)
        }
      }
      if (!res.ok) {
        throw new ApiError(extractApiErrorMessage(data, res.status), res.status, data, 'http')
      }
      return data as T
    } catch (e) {
      if (e instanceof ApiError) throw e
      if (e instanceof DOMException && e.name === 'AbortError') {
        if (options.signal?.aborted && !didTimeout()) {
          throw new ApiError('请求已取消', undefined, undefined, 'cancelled')
        }
        throw new ApiError('请求超时', undefined, undefined, 'timeout')
      }
      throw new ApiError((e as Error).message || '网络错误', undefined, undefined, 'network')
    } finally {
      clear()
    }
  }

  // ---- 公开方法 ----

  function get<T>(
    path: string,
    params?: Record<string, string>,
    options?: RequestOptions,
  ): Promise<T> {
    let url = path
    if (params) {
      const sp = new URLSearchParams(params)
      url += `?${sp.toString()}`
    }
    return request<T>('GET', url, undefined, undefined, options)
  }

  function post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('POST', path, body ? JSON.stringify(body) : undefined, {
      'Content-Type': 'application/json',
    }, options)
  }

  function put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return request<T>('PUT', path, body ? JSON.stringify(body) : undefined, {
      'Content-Type': 'application/json',
    }, options)
  }

  function del<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('DELETE', path, undefined, undefined, options)
  }

  function upload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
    return request<T>('POST', path, formData, undefined, options)
  }

  return { get, post, put, del, upload }
}

// ============================================================
// 默认导出：向后兼容的单例（原有直接导入 get/post/del 的代码不受影响）
// 同时保留工厂函数供多后端场景使用
// ============================================================
const defaultClient = createClient({ baseURL: API_PREFIX.CORE })

export const get = defaultClient.get
export const post = defaultClient.post
export const put = defaultClient.put
export const del = defaultClient.del
export const upload = defaultClient.upload
