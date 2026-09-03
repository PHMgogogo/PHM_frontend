// ============================================================
// 统一 API 前缀；真实服务地址由开发/生产代理配置。
// ============================================================

export const API_PREFIX = {
  CORE: '/api',
  PMGR: '/api/pmgr',
  INSTANCE: '/instance',
  TASK: '/task',
  OPENCODE: '/opencode',
  RAG: '/document',
  // 兼容既有文档 API 调用；新代码优先使用语义更清晰的 RAG。
  DOCUMENT: '/document',
} as const

export function instanceWorkerBase(instanceId: string): string {
  return `${API_PREFIX.INSTANCE}/${encodeURIComponent(instanceId)}`
}

export const DEBUG_BACKEND = {
  URL: 'http://172.21.48.1:8001',
  LABEL: '调试后端 (192.168.31.13:8001)',
} as const
