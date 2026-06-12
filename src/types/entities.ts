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

// ---- 算法实例 ----

export interface InstanceResponse {
  instance_id: string
  entrance: string
  base_url: string
  doc_url: string
  index_url: string
  file_path: string
  help: string
}

// ---- 任务管理（后端 DTO） ----

/** GET /api/tasks 返回的单条任务 */
export interface TaskResponse {
  task_id: number
  name: string
  description: string
  session_id: string
  instance_id: string
  work_dir: string
}

/** POST /api/tasks 请求体 */
export interface TaskCreateRequest {
  name: string
  description?: string
  session_id: string
  instance_id: string
  work_dir?: string
}

/** POST /api/tasks 成功响应 */
export interface TaskCreateResponse {
  task_id: number
}

/** 前端任务实体（camelCase） */
export interface Task {
  id: number
  name: string
  description: string
  sessionId: string
  instanceId?: string
  workDir: string
  createdAt: string
  updatedAt: string
}
