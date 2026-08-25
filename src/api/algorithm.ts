// ============================================================
// 算法管理 API — 算法文件 / 算法配置 / 运行中算法
//
// 路径转换：
//   前端请求: /api/pmgr/algorithms
//     → Vite proxy '/api' → 网关 openarch_gateway '/api/pmgr' 规则
//     → 算法后端 127.0.0.1:8000/algorithms
// ============================================================

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type {
  AlgorithmDetail,
  CatRequest,
  CreateInstanceRequest,
  FileMetaInfo,
  InstanceDetail,
  InstanceInfo,
  ProcessConnection,
  Template,
  UrlProxyRule,
} from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.PMGR, timeout: 60000 })

/** 网关服务管理客户端（代理规则测试等，走 /api → 网关 /smgr） */
const gatewayClient = createClient({ baseURL: API_PREFIX.CORE, timeout: 15000 })

/** 代理规则测试请求体 */
export interface ProxyRuleTestRequest {
  path: string
  upr: UrlProxyRule
  host: string
}

/** 代理规则测试结果 */
export interface ProxyRuleTestResult {
  match: [boolean, string[]]
  dest: string | null
  host: string
  file: string | null
}

export const algorithmApi = {
  // ---- 算法文件 ----

  /** GET /algorithms — 算法 id 列表 */
  listAlgorithms() {
    return client.get<string[]>('/algorithms')
  },

  /** GET /algorithms/{id} — 算法详情（含文件树） */
  getAlgorithm(id: string) {
    return client.get<AlgorithmDetail>(`/algorithms/${id}`)
  },

  /** POST /algorithms/upload — 上传算法 zip 包 */
  uploadAlgorithm(form: FormData) {
    return client.upload<AlgorithmDetail>('/algorithms/upload', form)
  },

  /** PUT /algorithms/{id} — 只更新算法元信息（不重新上传文件）
   *  先拉取现有算法，合并传入的可选字段后整体提交 */
  async updateAlgorithm(id: string, body: Partial<AlgorithmDetail>) {
    const existing = await this.getAlgorithm(id)
    return client.put<AlgorithmDetail>(`/algorithms/${id}`, {
      ...existing,
      ...body,
    })
  },

  /** POST /algorithms/{id}/cat — 查看算法内文件内容 */
  catAlgorithmFile(id: string, body: CatRequest) {
    return client.post<FileMetaInfo>(`/algorithms/${id}/cat`, body)
  },

  // ---- 算法配置（模板） ----

  /** GET /templates — 模板 id 列表 */
  listTemplates() {
    return client.get<string[]>('/templates')
  },

  /** GET /templates/{id} — 模板详情 */
  getTemplate(id: string) {
    return client.get<Template>(`/templates/${id}`)
  },

  /** POST /templates — 创建模板 */
  createTemplate(body: Template) {
    return client.post<Template>('/templates', body)
  },

  /** PUT /templates/{id} — 更新已有模板配置
   *  先拉取现有模板，合并传入的可选字段后整体提交 */
  async updateTemplate(id: string, body: Partial<Template>) {
    const existing = await this.getTemplate(id)
    return client.put<Template>(`/templates/${id}`, {
      ...existing,
      ...body,
    })
  },

  /** DELETE /templates/{id} — 删除模板 */
  deleteTemplate(id: string) {
    return client.del<void>(`/templates/${id}`)
  },

  // ---- 运行中算法（实例） ----

  /** GET /instances — 实例列表 */
  listInstances() {
    return client.get<InstanceInfo[]>('/instances')
  },

  /** GET /instances/{id} — 实例详情 */
  getInstance(id: string) {
    return client.get<InstanceDetail>(`/instances/${id}`)
  },

  /** POST /instances — 由模板创建并启动实例 */
  createInstance(body: CreateInstanceRequest) {
    return client.post<{ instance_id: string }>('/instances', body)
  },

  /** POST /instances/{id}/stop — 停止实例 */
  stopInstance(id: string) {
    return client.post<void>(`/instances/${id}/stop`)
  },

  /** POST /instances/{id}/start — 启动已存在实例 */
  startInstance(id: string) {
    return client.post<InstanceDetail>(`/instances/${id}/start`)
  },

  /** DELETE /instances/{id} — 删除实例 */
  deleteInstance(id: string) {
    return client.del<void>(`/instances/${id}`)
  },

  /** GET /instances/{id}/logs/{out|err} — 实例日志 */
  getInstanceLogs(id: string, kind: 'out' | 'err') {
    return client.get<{ logs: string }>(`/instances/${id}/logs/${kind}`)
  },

  /** GET /instances/{id}/connections — 实例进程连接（无运行进程时为 null） */
  getInstanceConnections(id: string) {
    return client.get<{ connections: ProcessConnection[] | null }>(
      `/instances/${id}/connections`,
    )
  },

  /** GET /instances/{id}/publish — 发布实例（下载 zip 包） */
  publishInstance(id: string, filename?: string) {
    // 直接让浏览器导航到该 URL，由后端流式返回 zip（Content-Disposition: attachment），
    // 避免前端先缓冲整个文件导致大文件卡顿。
    const url = `${API_PREFIX.PMGR}/instances/${id}/publish`
    const link = document.createElement('a')
    link.href = url
    if (filename) link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },
}

/** 测试单条代理规则（网关 /smgr/rules/test） */
export function testProxyRule(body: ProxyRuleTestRequest): Promise<ProxyRuleTestResult> {
  return gatewayClient.post<ProxyRuleTestResult>('/smgr/rules/test', body)
}

// ============================================================
// 网关服务管理（openarch_gateway /smgr）— 代理规则 CRUD
// ============================================================

export const gatewayApi = {
  /** GET /smgr/rules — 代理规则列表 */
  listRules() {
    return gatewayClient.get<UrlProxyRule[]>('/smgr/rules')
  },

  /** POST /smgr/rules — 新增代理规则（重名时报错） */
  addRule(rule: UrlProxyRule) {
    return gatewayClient.post<void>('/smgr/rules', rule)
  },

  /** PUT /smgr/rules — 更新代理规则 */
  updateRule(rule: UrlProxyRule) {
    return gatewayClient.put<void>('/smgr/rules', rule)
  },

  /** DELETE /smgr/rules/{name} — 删除代理规则 */
  deleteRule(name: string) {
    return gatewayClient.del<void>(`/smgr/rules/${encodeURIComponent(name)}`)
  },
}
