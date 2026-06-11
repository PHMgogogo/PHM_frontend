// ============================================================
// PHM 系统核心实体类型定义（对齐后端 API）
// ============================================================

// ---- 枚举 ----

export type AircraftStatus = 'active' | 'retired' | 'maintenance'

export type ConfigItemType = 'SYSTEM' | 'SUBSYSTEM' | 'EQUIPMENT' | 'LRU'

export type DataType = 'DIAGNOSIS' | 'EVALUATION' | 'PREDICTION' | 'RAW'

// ---- 实体 ----

export interface AircraftModel {
  modelCode: string
  manufacturer: string
  description: string
  createdAt?: string
}

export interface Aircraft {
  aircraftNumber: string
  modelCode: string
  airline: string
  configVersion: string
  status: AircraftStatus
  createdAt?: string
}

export interface ConfigItem {
  itemId: number
  modelCode: string
  parentItemId: number | null
  ataChapter: string
  systemName: string
  subSystemName: string | null
  equipmentName: string | null
  partNumber: string | null
  itemType: ConfigItemType
  label?: string
  children?: ConfigItem[]
}

// ---- CSV 相关 ----

export interface CsvUploadParams {
  file: File
  tableName: string
  aircraftNumber: string
  parentItemId?: number
  dataType?: DataType
}

export interface ColumnAnalysis {
  columnName: string
  columnType: string
  suggestedMapping?: string
}

export interface CsvPreviewResult {
  columns: ColumnAnalysis[]
  rowCount: number
  sampleData: Record<string, string>[]
  errors?: string[]
}

// ---- API 响应 ----

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  error?: string
  data?: T
}

export interface PaginatedData<T> {
  data: T[]
  total: number
  page: number
  size: number
}
