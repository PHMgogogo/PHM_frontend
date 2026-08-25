// ============================================================
// PHM 系统核心实体类型定义（对齐后端 API）
// ============================================================

// ---- 枚举 ----

export type AircraftStatus = 'active' | 'retired' | 'maintenance'

export type ConfigItemType = 'SYSTEM' | 'SUBSYSTEM' | 'EQUIPMENT' | 'LRU'

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

/** 架次（飞行任务）：单机 → 架次 → CSV数据表（一对多，一个架次可关联多张数据表） */
export interface Sortie {
  sortieId: number
  aircraftNumber: string
  sortieNumber: string
  flightDate: string // "YYYY-MM-DD"
  startTime: string // "HH:mm:ss"
  endTime: string // "HH:mm:ss"
}

export interface ConfigItem {
  itemId: number
  modelCode: string
  parentItemId: number | null
  ataChapter: string
  // modify here
  systemName: string | null
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
  sortieId: number
  parentItemId?: number
}

/** /csv/preview 接口返回的完整响应 */
export interface CsvPreviewResponse {
  validation: {
    valid: boolean
    totalRows: number
    validRows: number
    invalidRows: number
    columns: string[]
    warnings: string[]
    errors: string[]
    sampleData: string[][]
  }
  analysis: {
    columns: string[]
    originalColumns: string[]
    timestampColumn: string
    /** 列名 → SQL 数据类型映射，如 { "Altitude": "INT64", "Lat": "DOUBLE" } */
    columnTypes: Record<string, string>
    numericColumns: string[]
    textColumns: string[]
    totalRows: number
    sampleData: Record<string, string>[]
  }
}

// ---- 构型数据映射 ----

export interface ConfigDataMapping {
  mappingId: number
  aircraftNumber: string
  itemId: number
  csvTableName: string
  dataTime: string
  createdAt: string
  /** 关联架次ID（一个架次可关联多条映射 / 多张 CSV 数据表，后端按需返回） */
  sortieId?: number
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

// ---- Instance Worker API 类型 ----

export type DatasetContentType = 'text_csv' | 'path_csv' | 'json_csv'

export interface DatasetPayload {
  content_type: DatasetContentType
  content: string
  data_cols: string[]
  label_cols: string[] | null
}

export interface TrainArgs {
  epoch: number
  batch_size: number
  learning_rate: number
  device: 'cpu' | 'cuda'
  progress: boolean
  mode: 'train'
  shuffle: boolean
}

export interface InferArgs {
  batch_size: number
  device: 'cpu' | 'cuda'
  progress: boolean
  mode: 'eval'
  shuffle: boolean
}

export interface TrainRequest {
  dataset: DatasetPayload
  args: TrainArgs
  detach: boolean
}

export interface InferRequest {
  dataset: DatasetPayload
  args: InferArgs
  detach: boolean
}

export interface LoadRequest {
  path: string | null
}

export interface SaveRequest {
  path: string
}

export interface ModelResult {
  loss: number
  outputs: number[][]
  ids: number[]
}

export interface ProgressCounter {
  n: number
  total: number
  elapsed: number
  rate: number | null
}

export interface StateResponse {
  state: 'UNLOADED' | 'LOADED' | 'TRAINING' | 'INFERRING'
  epoch_progress?: ProgressCounter
  batch_progress?: ProgressCounter
  result?: ModelResult[]
}

// ---- 任务管理（后端 DTO） ----

/** GET /api/tasks 返回的单条任务 */
export interface TaskResponse {
  task_id: number
  name: string
  description: string
  session_id: string
  aircraft_id: string
  instance_id: string
  work_dir: string
  is_global: boolean
  default: boolean
}

/** GET /api/tasks/aircraft/{aircraft_id} 响应体 */
export interface AircraftTaskListResponse {
  /** 该飞机是否仍需初始化（无任何专属任务时为 true，与 tasks 是否含全局任务无关） */
  initialization_required: boolean
  tasks: TaskResponse[]
}

/** POST /api/tasks 请求体 */
export interface TaskCreateRequest {
  name: string
  description?: string
  session_id: string
  instance_id: string
  work_dir?: string
  // 注：aircraft_id 显式传入时不得为空字符串（后端 min_length=1），省略则用默认 ""
  aircraft_id?: string
  is_global?: boolean
  default?: boolean
}

/** POST /api/tasks 成功响应 */
export interface TaskCreateResponse {
  task_id: number
}

// ---- 数据管理 → 训练接口 ----

/** POST /api/tasks/train 请求体 */
export interface TrainTaskRequest {
  table_name: string
  data_cols: string[]
  label_cols: string[]
  instance_id: string
  batch_size?: number
  epoch?: number
  learning_rate?: number
  detach?: boolean
  device?: 'cpu' | 'cuda'
}

/** POST /api/tasks/infer 请求体 — 比 TrainRequest 少 epoch 和 learning_rate */
export interface InferTaskRequest {
  table_name: string
  data_cols: string[]
  label_cols: string[]
  instance_id: string
  batch_size?: number
  detach?: boolean
  device?: 'cpu' | 'cuda'
}

/** 前端任务实体（camelCase） */
export interface Task {
  id: number
  name: string
  description: string
  sessionId: string
  instanceId?: string
  workDir: string
  aircraftId: string
  isGlobal: boolean
  /** 是否为对应飞机的默认任务 */
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

// ---- 算法管理（对齐 algo/asgi.py 后端模型） ----

/** 算法文件树节点：目录为嵌套对象，文件值为 null */
export interface AlgorithmTree {
  [key: string]: AlgorithmTree | null
}

/** GET /algorithms/{id} 返回的算法详情 */
export interface AlgorithmDetail {
  id: string
  version: string
  description: string
  tree?: AlgorithmTree
  base_on: string
  ignores: string[]
}

/** POST /algorithms/{id}/cat 请求体 */
export interface CatRequest {
  path: string
  offset?: number
  length?: number
  encoding?: string
  fmt?: string | null
}

/** cat 返回的文件元信息 */
export interface FileMetaInfo {
  file_offset: number
  file_chunk_length: number
  file_total_length: number
  file_type: 'text' | 'image'
  chunk_content: string
}

/** 路由规则（UrlProxyRule） */
export interface UrlProxyRule {
  name: string
  order: number
  rule_type: 'EXACT' | 'PREFIX' | 'REGEX'
  pattern: string
  dest_index: number[]
  dest_format?: string | null
  rewrite_host?: string | null
  editable?: boolean
  timeout?: number | null
  enable?: boolean
  file_serve_root_path?: string | null
  default_entrance?: string | null
  cors?: boolean
  file_serve_fallback?: string | null
}

/** 算法配置（模板） */
export interface Template {
  algorithm: AlgorithmDetail
  entry: string
  restart_always: boolean
  id: string
  is_temporary: boolean
  restart_interval_seconds: number
  volume: boolean
  bind_listener: boolean
  rules: UrlProxyRule[]
  tags: string[]
}

/** 实例状态 */
export type InstanceStatus = 'NOT_READY' | 'STOP' | 'RUNNING' | 'EXITED'

/** GET /instances 返回的实例列表项 */
export interface InstanceInfo {
  id: string
  status: InstanceStatus
  template_id: string
}

/** GET /instances/{id} 返回的实例详情 */
export interface InstanceDetail {
  id: string
  status: InstanceStatus
  template_id: string
  start_time: string | null
  stop_time: string | null
  logs: { out: string; err: string }
  tree: AlgorithmTree
  /** 实例所基于的模板快照（含代理规则） */
  template?: Template
}

/** POST /instances 请求体 */
export interface CreateInstanceRequest {
  template_id: string
  id?: string | null
  entry?: string | null
}

/** 连接信息 */
export interface ConnectionInfo {
  fd: number
  family: string
  type: string
  laddr: { ip: string; port: number } | null
  raddr: { ip: string; port: number } | null
  status: string
}

export interface ProcessConnection {
  pid: number
  name: string
  conns: ConnectionInfo[]
}
