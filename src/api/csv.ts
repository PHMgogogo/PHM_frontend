// ============================================================
// CSV 数据管理 API
// ============================================================

import { createClient } from './client'
import { ApiError } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type {
  ApiResponse,
  CsvOverview,
  CsvPreviewResponse,
  TimeSeriesData,
  TimeSeriesQuery,
} from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.CORE })

/** /csv 下的部分接口返回 {code, message, data} 信封，而 client.request 不拆信封 */
interface Envelope<T> {
  code: number
  message?: string
  data: T
}

/** 断言信封响应成功；失败抛 ApiError */
function assertOk<T>(res: Envelope<T>, fallback: string): Envelope<T> {
  if (res.code !== 200) {
    throw new ApiError(res.message || fallback, res.code, res)
  }
  return res
}

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
 * GET /csv/overview —— 查询某张 CSV 表的列信息。
 *
 * 两种定位方式等价（后端自选其一，不传则报错）：
 * - `mappingId`：构型数据映射ID（数据管理 / 训练 / 推理三条既有路径用这个）；
 * - `aircraftNumber` + `deviceName`：机号 + 表名，其中 deviceName 为映射的 csvTableName
 *   （可带可不带 `csv_` 前缀）。时序查询拿到的是架次，只有这种形态可用。
 *
 * 注意返回**不带信封**，且列名以两种形态出现：dataColumns 小写、columnTypes 的键大写。
 */
export function getCsvOverview(
  target: number | { aircraftNumber: string; deviceName: string },
) {
  const params: Record<string, string> =
    typeof target === 'number'
      ? { mappingId: String(target) }
      : { aircraftNumber: target.aircraftNumber, deviceName: target.deviceName }
  return client.get<CsvOverview>('/csv/overview', params)
}

/**
 * POST /csv/query-timeseries —— 查某个架次的时序数据。
 * 后端按 本地 → 航新 → 633 优先级择一返回，故只需按其分支填入对应字段（见 TimeSeriesQuery）。
 *
 * 返回信封 `{code, message, data}`，此处拆包后返回 data。
 */
export async function queryTimeseries(body: TimeSeriesQuery): Promise<TimeSeriesData> {
  const res = await client.post<Envelope<TimeSeriesData>>('/csv/query-timeseries', body)
  assertOk(res, '时序数据查询失败')
  // 无数据时后端可能下发 null，统一归一为可安全遍历的空结构
  return {
    timestamps: res.data?.timestamps ?? [],
    parameters: res.data?.parameters ?? [],
  }
}

/**
 * POST /csv/drop —— 删除指定的 CSV 数据表。
 * tableName 为完整表名（含 `csv_` 前缀，如 `csv_训练`）。
 */
export function dropCsvTable(tableName: string) {
  const params = new URLSearchParams({ tableName })
  return client.post<ApiResponse>(`/csv/drop?${params.toString()}`)
}
