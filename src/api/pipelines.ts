// ============================================================
// 逻辑编排（open_pipeline）后端 API
// 后端通过网关暴露在 /api/pipelines 前缀下（→ open_pipeline 服务）
// ============================================================

import { createClient } from './client'

const client = createClient({ baseURL: '/api/pipelines' })

// ---- 流水线 ----

export function getPipelineList() {
  return client.get<{ data: string[] }>('/pipeline')
}

export function createPipeline(id: string) {
  return client.post<unknown>('/pipeline', { id })
}

export function renamePipeline(oldId: string, newId: string) {
  return client.put<unknown>(`/${oldId}/rename`, { new_id: newId })
}

export function deletePipeline(id: string) {
  return client.del<unknown>(`/pipeline/${id}`)
}

export function getPipeline<T = any>(id: string) {
  return client.get<T>(`/pipeline/${id}`)
}

export function savePipeline(pipeline: any) {
  return client.put<unknown>(`/pipeline/${pipeline.id}`, pipeline)
}

export function runPipeline(pipeline: any) {
  return client.post<any>(`/run`, { pipeline })
}

// ---- 节点 ----

export function getNodeTypes() {
  return client.get<any>('/node/types')
}

export function getNodeSchema(nodeType: string) {
  return client.get<any>(`/node/schema/${nodeType}`)
}

export function getInstances() {
  return client.get<any[]>('/instance/list')
}

// ---- AI 对话（SSE 流式，返回原始 Response） ----

export function chatAgent(payload: { user_input: string; history: any[]; pipeline: any }) {
  return fetch('/api/pipelines/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// 节点帮助文档，SSE 流式返回
export function getNodeHelp(nodeType: string) {
  return fetch(`/api/pipelines/node/help/${nodeType}`)
}

// ---- Cron ----

export function getCronNext(pipelineId: string) {
  return client.get<{ next: string | null }>(`/${pipelineId}/cron/next`)
}

export function getCronContexts(pipelineId: string) {
  return client.get<{ data: { filename: string; executed_at: string | null }[] }>(`/${pipelineId}/cron/contexts`)
}

export function getCronContext(pipelineId: string, filename: string) {
  return client.get<any>(`/${pipelineId}/cron/contexts/${filename}`)
}

export function generateCron(prompt: string) {
  return client.post<{ cron?: string }>('/cron/generate', { prompt })
}
