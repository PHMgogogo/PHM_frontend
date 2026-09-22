// ============================================================
// 统一 API 前缀；真实服务地址由开发/生产代理配置。
// ============================================================

export const API_PREFIX = {
  CORE: '/api',
  PMGR: '/api/pmgr',
  INSTANCE: '',
  TASK: '/api',
  OPENCODE: '/opencode',
  RAG: '/api',
  // 兼容既有文档 API 调用；新代码优先使用语义更清晰的 RAG。
  DOCUMENT: '/api',
  EXTERNAL_PLATFORM: '/api',
} as const

export function instanceWorkerBase(instanceId: string): string {
  return `${API_PREFIX.INSTANCE}/${encodeURIComponent(instanceId)}`
}

// ============================================================
// OpenCode(v2) 连接凭据
// opencode2 serve 不提供 --password 参数，服务端密码经环境变量
// OPENCODE_PASSWORD 指定(见 algo/algorithms/opencode/start.bash)。
// 用户名固定为 opencode，认证方式为 HTTP Basic。
// 若服务端未设置 OPENCODE_PASSWORD，则每次启动随机生成密码，此处需清空。
// ============================================================
export const OPENCODE_AUTH = {
  user: 'opencode',
  pass: 'phm-opencode-2024',
} as const
