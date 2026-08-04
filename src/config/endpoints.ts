// ============================================================
// 统一的 API 端点配置（前端路径前缀）
// ============================================================
// 前端通过 Vite 代理访问各后端服务，这里集中管理所有路径前缀，
// 需与 vite.config.ts 中 server.proxy 的 key 保持一致。
//
// ⚠️ 修改后端的「真实地址（IP/端口）」请改 vite.config.ts 的 proxy target，
//    而非本文件；本文件只负责前端可见的相对前缀。
// ============================================================

/**
 * 各后端服务对应的路径前缀（与 vite.config.ts 的 proxy key 一一对应）。
 */
export const API_PREFIX = {
  /** 主后端：构型 / 任务 / CSV / 文档检索 → proxy '/api' */
  CORE: '/api',
  /** 算法实例管理（pmgr）→ proxy '/api/pmgr' */
  PMGR: '/api/pmgr',
  /** 算法实例 worker（按 instance_id 操作模型）→ proxy '/instance' */
  INSTANCE: '/instance',
  /** 图表数据展示代理 → proxy '/task' */
  TASK: '/task',
  /** OpenCode 对话服务 → proxy '/opencode' */
  OPENCODE: '/opencode',
  /** 文档检索服务 → proxy '/document' */
  DOCUMENT: '/document',
} as const

/** 构造某实例 worker 的 baseURL：/instance/{instanceId} */
export function instanceWorkerBase(instanceId: string): string {
  return `${API_PREFIX.INSTANCE}/${instanceId}`
}

/**
 * ApiDocsView 调试用的后端绝对地址（绕过 Vite 代理直连，仅用于本地调试）。
 * 生产环境应通过部署层反向代理，不应依赖此地址。
 */
export const DEBUG_BACKEND = {
  /** 调试用 OpenAPI server 地址 */
  URL: 'http://172.21.48.1:8001',
  /** Scalar 服务器选择器中显示的标签 */
  LABEL: '调试后端 (192.168.31.13:8001)',
} as const
