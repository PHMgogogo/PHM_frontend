// ============================================================
// CSV 数据管理 API
// ============================================================

import { createClient } from './client'
import type { ApiResponse, CsvPreviewResponse } from '@/types/entities'

const client = createClient({ baseURL: '/api' })

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

export function uploadCsv(
  file: File,
  tableName: string,
  aircraftNumber: string,
  parentItemId?: number,
) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('tableName', tableName)
  fd.append('aircraftNumber', aircraftNumber)
  if (parentItemId !== undefined) {
    fd.append('parentItemId', String(parentItemId))
  }
  return client.upload<ApiResponse>('/csv/upload', fd)
}

// 查询已上传的 CSV 数据表列表（如果后端提供）
export function getCsvTables(modelCode?: string) {
  const params = modelCode ? { modelCode } : undefined
  return client.get<unknown[]>('/csv/tables', params)
}

/**
 * GET /csv/overview —— 按构型数据映射（mappingId）查询对应 CSV 表的数据列名。
 * 后端返回字段较多，前端只关心 dataColumns（数据列名列表）。
 */
export function getCsvOverview(mappingId: number) {
  return client.get<{ dataColumns: string[] }>('/csv/overview', {
    mappingId: String(mappingId),
  })
}
