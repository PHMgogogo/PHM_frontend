// ============================================================
// CSV 数据管理 API
// ============================================================

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type { ApiResponse, CsvPreviewResponse } from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.CORE })

export function analyzeColumns(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return client.upload<CsvPreviewResponse['analysis']['columnTypes']>('/csv/analyze-columns', fd)
}

export function previewCsv(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return client.upload<CsvPreviewResponse>('/csv/preview', fd)
}

/**
 * POST /csv/upload —— 上传 CSV 并入库。
 * `file` 走 multipart；`tableName`/`sortieId`/`parentItemId` 走 query。
 * 通过架次自动关联到单机 + 构型项目。
 */
export function uploadCsv(
  file: File,
  tableName: string,
  sortieId: number,
  parentItemId?: number,
) {
  const fd = new FormData()
  fd.append('file', file)
  const params = new URLSearchParams({ tableName, sortieId: String(sortieId) })
  if (parentItemId !== undefined) {
    params.set('parentItemId', String(parentItemId))
  }
  return client.upload<ApiResponse>(`/csv/upload?${params.toString()}`, fd)
}

// 查询已上传的 CSV 数据表列表（如果后端提供）
export function getCsvTables(modelCode?: string) {
  const params = modelCode ? { modelCode } : undefined
  return client.get<unknown[]>('/csv/tables', params)
}

/**
 * GET /csv/overview —— 按构型数据映射（mappingId）查询对应 CSV 表的数据列名。
 * 后端返回字段较多，前端只关心 dataColumns（数据列名列表）与 textColumns（文本列，训练/推理时不可选）。
 */
export function getCsvOverview(mappingId: number) {
  return client.get<{ dataColumns: string[]; textColumns: string[] }>('/csv/overview', {
    mappingId: String(mappingId),
  })
}

/**
 * POST /csv/drop —— 删除指定的 CSV 数据表。
 * tableName 为完整表名（含 `csv_` 前缀，如 `csv_训练`）。
 */
export function dropCsvTable(tableName: string) {
  const params = new URLSearchParams({ tableName })
  return client.post<ApiResponse>(`/csv/drop?${params.toString()}`)
}
