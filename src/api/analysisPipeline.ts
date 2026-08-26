// ============================================================
// 分析流水线绑定 API（aircraft_id ↔ pipeline_id）
// 后端：/root/phm/entity/app/routers/analysis_pipeline.py
// 前缀：/api/analysis/pipelines
// ============================================================

import { createClient } from './client'

const client = createClient({ baseURL: '/api/analysis/pipelines' })

export interface AnalysisPipelineBinding {
  id: number
  aircraft_id: string
  pipeline_id: string
}

/** 创建绑定记录（aircraft_id + pipeline_id 联合唯一，重复返回 409） */
export function createAnalysisPipeline(data: { aircraft_id: string; pipeline_id: string }) {
  return client.post<AnalysisPipelineBinding>('/', data)
}

/** 按 aircraft_id 过滤列出绑定记录 */
export function listAnalysisPipelines(aircraftId: string) {
  return client.get<AnalysisPipelineBinding[]>('/', { aircraft_id: aircraftId })
}

/** 按主键 id 获取单条绑定记录 */
export function getAnalysisPipeline(id: number) {
  return client.get<AnalysisPipelineBinding>(`/${id}`)
}

/** 按主键 id 更新绑定记录（可更新 aircraft_id / pipeline_id） */
export function updateAnalysisPipeline(id: number, data: { aircraft_id?: string; pipeline_id?: string }) {
  return client.put<AnalysisPipelineBinding>(`/${id}`, data)
}

/** 按主键 id 删除绑定记录 */
export function deleteAnalysisPipeline(id: number) {
  return client.del<{ detail: string }>(`/${id}`)
}
