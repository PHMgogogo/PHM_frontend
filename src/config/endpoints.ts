// ============================================================
// 统一 API 前缀；真实服务地址由开发/生产代理配置。
// ============================================================

export const API_PREFIX = {
  CORE: '/api',
  PMGR: '/api/pmgr',
  INSTANCE: '/instance',
  TASK: '/api',
  OPENCODE: '/opencode',
  RAG: '/api',
  // 兼容既有文档 API 调用；新代码优先使用语义更清晰的 RAG。
  DOCUMENT: '/api',
  EXTERNAL_PLATFORM: '/api',
  /** 统一数据聚合查询（与外来平台同后端，接口挂在 /api/unified 下，故同样需独立前缀）→ proxy '/unified' */
  UNIFIED: '/api/unified',
} as const

export function instanceWorkerBase(instanceId: string): string {
  return `${API_PREFIX.INSTANCE}/${encodeURIComponent(instanceId)}`
}

export const DEBUG_BACKEND = {
  URL: 'http://172.21.48.1:8001',
  LABEL: '调试后端 (192.168.31.13:8001)',
} as const
