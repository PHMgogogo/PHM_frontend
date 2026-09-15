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
  /**
   * 注意：GET /aircraft/plane 对外源（航新/633）单机返回 '-'，不属于 AircraftStatus 枚举。
   * 当前无任何界面渲染或比较该字段，但取到外源行时它并非合法枚举值，需做判断请先走
   * @/utils/aircraft-source 的 isExternalAircraft。
   */
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
  /** 本地行有值；第三方构型行（GET /aircraft/config-items 不传 modelCode）为 null */
  itemId: number
  modelCode: string
  parentItemId: number | null
  /** GJB 章节号（后端 DTO 字段名即 gjbChapter，非 ataChapter） */
  gjbChapter: string
  // modify here
  systemName: string | null
  subSystemName: string | null
  equipmentName: string | null
  partNumber: string | null
  itemType: ConfigItemType
  label?: string
  children?: ConfigItem[]
}

// ---- 外来平台配置 ----

/** 外来平台配置（读接口返回形态：写/测接口用平台枚举 + ip/port，见 api/externalPlatform.ts） */
export interface ExternalPlatform {
  id: number
  platformName: string
  platformIp: string
  port: number
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

// ---- 时序数据查询（POST /csv/query-timeseries）----
// 该接口按 本地 → 航新 → 633 优先级择一返回，两种入参形态互斥：
// - 本地：sortieId（+ paralist 为 CSV 列名，大小写不敏感，且必须显式给出——实测无「全部列」写法）
// - 三方：aircraftNumber + sortieNumber（+ paralist 为参数名，可留空由后端决定）
// startTime / endTime 可选，留空则由后端按架次自身起止时间取。

export interface TimeSeriesQuery {
  /** 本地架次：与 config_data_mapping 关联，据此定位 csv_xxx 表 */
  sortieId?: number
  /** 三方架次：机号 */
  aircraftNumber?: string
  /** 三方架次：架次号 */
  sortieNumber?: string
  startTime?: string
  endTime?: string
  /** 本地 → CSV 列名；三方 → 参数名 */
  paralist?: string[]
}

export interface TimeSeriesParameter {
  /** 参数名，后端一律小写返回 */
  name: string
  /** 与 timestamps 按下标对齐；后端下发字符串，故不声明为 number[] */
  values: unknown[]
}

export interface TimeSeriesData {
  /** 毫秒时间戳 */
  timestamps: number[]
  parameters: TimeSeriesParameter[]
}

/** GET /csv/overview 响应中前端用到的字段（响应实际还含 tableName/deviceName 等） */
export interface CsvOverview {
  dataColumns: string[]
  textColumns: string[]
  /** 列名 → SQL 类型；注意键为大写（如 ALTITUDE），与 dataColumns 的小写不同 */
  columnTypes: Record<string, string>
  /** 时间轴列名（如 timestamps），不应当作 paralist 提交 */
  timestampColumn: string
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
  /** 机型（后端保证非空，缺省为 ""） */
  model_code: string
  work_dir: string
  is_global: boolean
}

/** GET /api/tasks/aircraft/{aircraft_id} 响应体 */
export interface AircraftTaskListResponse {
  /** 该飞机是否仍需初始化（无任何专属任务时为 true，与 tasks 是否含全局任务无关） */
  initialization_required: boolean
  tasks: TaskResponse[]
  /** 对账时实例服务不可用：本次未清理失效任务，列表可能含失效项 */
  stale_check_failed?: boolean
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
  /** 机型（可选，不传后端默认 ""） */
  model_code?: string
  is_global?: boolean
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
  /** 机型 */
  modelCode: string
  workDir: string
  aircraftId: string
  isGlobal: boolean
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
  start_time: string | null
  stop_time: string | null
  /** 实例所基于的模板快照（含代理规则、tags），临时/已删除模板也能拿到 */
  template?: Template
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
