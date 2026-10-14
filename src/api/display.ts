// ============================================================
// 图表数据展示 API
// ============================================================
// 图表数据查询原走 PHM_entity 展示代理（POST /api/display/raw-data：后端把
// data/columns/limit/type 组装成 SQL 转发 data_module，并把"行式"结果转成
// "序列式"图表数据）。现改为前端直调 data_module 的 POST /csv/sql 并在本地
// 完成 SQL 编排与转换，原因（2026-10 排查，见 scripts/repro-display-sql-error.mjs）：
// 线上部署的 entity 仍是旧版 display.py —— 拼列名时做 upper() 且不加引号
// （SELECT N1_SPEED, ...），而 data_module 建表时列名以引号标识符保留原始
// 小写（"n1_speed"），达梦对引号标识符大小写敏感 → 列不存在 → 400 SQL执行错误。
// 这无法通过请求参数规避（任何列名都会被 upper() 破坏大小写），只能绕开代理。
// 此处的编排规则与本地已修复但未部署的 entity 版本一致；待线上 entity 更新
// 后如需回归代理路径，把 queryDisplay 恢复为 client.post('/display/raw-data', req)
// 并删去本模块的 SQL 编排/转换辅助函数即可。
// 画布快照 save/load 是独立的文件存取能力（线上正常），仍走 entity。

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'

/** entity 展示服务客户端（画布快照 save/load） */
const client = createClient({ baseURL: API_PREFIX.TASK })
/** data_module 客户端（SQL 查询）；30s 对齐此前代理链路的耗时预算（大表不限行时更宽裕） */
const csvClient = createClient({ baseURL: API_PREFIX.CORE, timeout: 30000 })

/** display 接口的图表类型枚举 */
export const DISPLAY_TYPE = {
  /** 2D 单参数时序：恰好 2 列（时间 + 1 参数） */
  SINGLE_TIMESERIES_2D: 'SINGLE_TIMESERIES_2D',
  /** 2D 多参数时序：≥3 列（时间 + 多参数） */
  MULTI_TIMESERIES_2D: 'MULTI_TIMESERIES_2D',
  /** 2D 两参数映射：恰好 2 列（x + y） */
  MAPPING_2D: 'MAPPING_2D',
  /** 3D 点云：恰好 3 列（x + y + z） */
  POINT_CLOUD_3D: 'POINT_CLOUD_3D',
} as const

export type DisplayType = (typeof DISPLAY_TYPE)[keyof typeof DISPLAY_TYPE]

/**
 * 前端图表渲染样式枚举（仅前端渲染用，不进入 DisplayRequest）。
 * 决定 2D 数据的 ECharts series 渲染样式；与 size 同为前端渲染关注点。
 */
export const CHART_STYLE = {
  /** 折线（line） */
  LINE: 'LINE',
  /** 散点（scatter） */
  SCATTER: 'SCATTER',
  /** 柱状（bar） */
  BAR: 'BAR',
  /** 面积（line + areaStyle） */
  AREA: 'AREA',
} as const

export type ChartStyle = (typeof CHART_STYLE)[keyof typeof CHART_STYLE]

/** 维度定义（轴） */
export interface DisplayDimension {
  /** 维度名（取自查询的列名） */
  name: string
  /** 单位；时间轴为 "time"，其余默认空字符串 */
  unit: string
}

/** 数据序列：每个 parameter 对应一条 series */
export interface DisplaySeries {
  /** 参数名，对应 parameter 列表中的一个元素 */
  parameter: string
  /** 序列颜色（如 #FF0000），由前端分配，为空时省略 */
  color?: string
  /** 数据点；内层数组元素顺序与 dimensions 一致 */
  data: (number | string)[][]
}

/** POST /api/display/raw-data 请求体 */
export interface DisplayRequest {
  /** 数据源标识；映射到 SQL 中的 csv_{data} 表名 */
  data: string
  /** 要展示的列名；列数需匹配 type 约定 */
  columns: string[]
  /** 返回数据点上限；0 = 不限制（不生成 LIMIT 子句），默认 0 */
  limit?: number
  /** 图表类型 */
  type: DisplayType
}

/** POST /api/display/raw-data 响应体 */
export interface DisplayResponse {
  /** 图表维度定义；长度决定轴数量（1/2/3） */
  dimensions: DisplayDimension[]
  /** 参数名列表；每个元素对应 data 中的一条序列 */
  parameter: string[]
  /** 数据序列集合；长度与 parameter 列表一致 */
  data: DisplaySeries[]
}

// ============================================================
// 图表数据查询：直调 data_module /csv/sql + 本地行式→序列式转换
// ============================================================

/** 各图表类型的期望列数 [下限, 上限]；上限 null 表示仅约束下限（与 entity/builder 约束一致） */
const EXPECTED_COLUMNS: Record<DisplayType, [number, number | null]> = {
  SINGLE_TIMESERIES_2D: [2, 2], // 恰好 2 列：时间 + 参数
  MULTI_TIMESERIES_2D: [3, null], // 至少 3 列：时间 + 多参数
  MAPPING_2D: [2, 2], // 恰好 2 列：x + y
  POINT_CLOUD_3D: [3, 3], // 恰好 3 列：x + y + z
}

/** 按 type 校验列数，不符抛错（对齐 entity 的 422 前置校验，省一次 round-trip） */
function validateColumnCount(type: DisplayType, n: number): void {
  const [lo, hi] = EXPECTED_COLUMNS[type]
  if (hi === null ? n < lo : n !== hi) {
    throw new Error(`${type} requires ${hi === null ? `at least ${lo}` : `exactly ${hi}`} columns, got ${n}`)
  }
}

/** 把列名包装为 SQL 引号标识符；内嵌双引号按 SQL 约定转义（"→""） */
function quoteIdentifier(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

/**
 * 按 DisplayRequest 编排 SQL：`SELECT "c1", "c2" FROM csv_{data} [LIMIT n]`。
 * 列名加引号并保持原样大小写（建表时以引号标识符保留列名原始小写，达梦对
 * 引号标识符大小写敏感，不加引号会被折叠为大写而查不到列）；表名不加引号
 * （建表时未加引号，引号形态反而查不到表）；容忍 data 已带 csv_ 前缀。
 */
function buildDisplaySql(req: DisplayRequest): string {
  const columnsSql = req.columns.map(quoteIdentifier).join(', ')
  const table = req.data.toLowerCase().startsWith('csv_') ? req.data.slice(4) : req.data
  let sql = `SELECT ${columnsSql} FROM csv_${table}`
  const limit = req.limit ?? 0
  if (limit > 0) sql += ` LIMIT ${limit}`
  return sql
}

/** 上游全列以字符串返回；图表数据点期望数值，无法解析（时间标签/标识/描述）保持字符串 */
function coerceValue(v: string): number | string {
  const s = v.trim()
  if (s === '') return ''
  const n = Number(s)
  return Number.isFinite(n) ? n : v
}

/** POST /csv/sql 响应体 */
interface CsvSqlResult {
  success?: boolean
  error?: string
  data?: Record<string, string>[] | null
  columns?: string[]
  totalRows?: number
}

/**
 * 行式 → 序列式转换（与 entity 修复版 _transform 同规则）。
 * 轴列/参数列按 type 划分：时序 col[0]=时间轴；映射/点云 col[0]=x（点云另有
 * col[1]=y 轴）；参数列各自产出一个系列，数据点 = [各轴列值..., 该参数值]。
 * 行按列名索引取值，不受上游 columns 返回顺序影响。
 */
function transformRowsToDisplay(
  type: DisplayType,
  columns: string[],
  rows: Record<string, string>[],
): DisplayResponse {
  const is3D = type === DISPLAY_TYPE.POINT_CLOUD_3D
  const isMulti = type === DISPLAY_TYPE.MULTI_TIMESERIES_2D
  const timeAxis = type === DISPLAY_TYPE.SINGLE_TIMESERIES_2D || isMulti
  const axis = is3D ? [columns[0], columns[1]] : [columns[0]]
  const params = isMulti ? columns.slice(1) : [columns[is3D ? 2 : 1]]
  // dimensions = 轴列 + 首参数列（2D 两轴 / 3D 三轴）；时序首轴 unit 标 time
  const dimensions = [...axis, params[0]].map((name, i) => ({
    name,
    unit: timeAxis && i === 0 ? 'time' : '',
  }))
  const data: DisplaySeries[] = params.map((p) => ({
    parameter: p,
    data: rows.map((row) => [...axis.map((a) => coerceValue(row[a])), coerceValue(row[p])]),
  }))
  return { dimensions, parameter: params, data }
}

/**
 * 图表数据查询 —— 直调 data_module POST /csv/sql，本地编排 SQL 并转换为序列式。
 * （原走 entity /display/raw-data 代理；线上旧版代理的列名大写化 bug 见文件头注释。）
 */
export async function queryDisplay(req: DisplayRequest): Promise<DisplayResponse> {
  validateColumnCount(req.type, req.columns.length)
  const result = await csvClient.post<CsvSqlResult>('/csv/sql', { sql: buildDisplaySql(req) })
  if (!result || result.success === false) {
    throw new Error(result?.error || 'SQL 查询失败')
  }
  return transformRowsToDisplay(req.type, req.columns, result.data ?? [])
}

// ============================================================
// 画布持久化：保存 / 加载当前画布快照
// ============================================================
// 画布 JSON 由前端定义，后端作为「不透明 blob」原样落盘 / 原样回传，
// 不解析、不裁剪 option / config。详见后端接口契约 v1。

/** 单张图表项（保存/加载时不透明；字段对齐 DashboardContainer 的 layout item） */
export interface DisplayLayoutItem {
  i: string | number
  x: number
  y: number
  w: number
  h: number
  type?: string
  category?: string
  title?: string
  static?: boolean
  /** 该图表的查询配置快照（不透明，字段随迭代增减） */
  config?: Record<string, unknown> | null
  /** 完整 ECharts option，内含 series[].data 数值（不透明，体积大） */
  option?: Record<string, unknown> | null
  [key: string]: unknown
}

/** 画布快照（不透明 blob，后端原样存取） */
export interface DisplayCanvas {
  /** 前端自定义的快照格式版本号，便于以后升级做兼容 */
  version: number
  /** 画布级配置（栅格 / 尺寸预设） */
  config: Record<string, unknown>
  /** 图表项数组 */
  layout: DisplayLayoutItem[]
}

/** POST /display/save 请求体（= 落盘内容） */
export interface DisplaySaveRequest {
  /** 画布标识，前端给定；后端按不透明字符串用作文件名 */
  key: string
  /** 画布快照（不透明） */
  canvas: DisplayCanvas
  /** 前端生成的保存时刻（ISO8601） */
  timestamp: string
}

/** POST /display/save 响应体 */
export interface DisplaySaveResponse {
  key: string
  /** 服务端落盘时刻（ISO8601） */
  savedAt: string
}

/** GET /display/load 响应体 */
export interface DisplayLoadResponse {
  key: string
  canvas: DisplayCanvas
  savedAt: string
}

/**
 * POST /display/save —— 保存（覆盖）当前画布快照。
 * 同 key 再次保存即覆盖；后端把 canvas 原样落盘。
 */
export function saveDisplay(req: DisplaySaveRequest) {
  return client.post<DisplaySaveResponse>('/display/save', req)
}

/**
 * GET /display/load —— 读取指定 key 的画布快照。
 * 不存在时后端返回 404，调用方需捕获并视为「无已保存画布」。
 */
export function loadDisplay(key: string) {
  return client.get<DisplayLoadResponse>('/display/load', { key })
}
