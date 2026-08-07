// ============================================================
// 图表数据展示 API（FastAPI 展示代理）
// ============================================================
// 对应 API.md 第 9 个接口：POST /api/display/raw-data
// 后端把 data/columns/limit/type 组装成 SQL，转发给外部 CSV 模块，
// 并把 CSV 模块返回的"行式"结果转成前端期望的"序列式"图表数据。

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'

const client = createClient({ baseURL: API_PREFIX.TASK })

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

/**
 * POST /display/raw-data —— 图表数据查询（展示代理）。
 * 把 data/columns/limit/type 提交，后端组装 SQL 并转换为序列式图表数据。
 */
export function queryDisplay(req: DisplayRequest) {
  return client.post<DisplayResponse>('/display/raw-data', req)
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
