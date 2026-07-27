// ============================================================
// 图表数据展示 API（FastAPI 展示代理）
// ============================================================
// 对应 API.md 第 9 个接口：POST /api/display
// 后端把 data/columns/limit/type 组装成 SQL，转发给外部 CSV 模块，
// 并把 CSV 模块返回的"行式"结果转成前端期望的"序列式"图表数据。

import { createClient } from './client'

const client = createClient({ baseURL: '/task' })

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

/** POST /api/display 请求体 */
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

/** POST /api/display 响应体 */
export interface DisplayResponse {
  /** 图表维度定义；长度决定轴数量（1/2/3） */
  dimensions: DisplayDimension[]
  /** 参数名列表；每个元素对应 data 中的一条序列 */
  parameter: string[]
  /** 数据序列集合；长度与 parameter 列表一致 */
  data: DisplaySeries[]
}

/**
 * POST /display —— 图表数据查询（展示代理）。
 * 把 data/columns/limit/type 提交，后端组装 SQL 并转换为序列式图表数据。
 */
export function queryDisplay(req: DisplayRequest) {
  return client.post<DisplayResponse>('/display', req)
}
