// ============================================================
// 统一数据聚合查询 API（对应后端 06-统一数据聚合查询）
// ============================================================
// 说明：
// - 该控制器与机型/CSV/外来平台同在后端 152.136.119.117:8080，
//   但路由挂在 /api/unified 前缀下（而机型/CSV 挂在根路径、外来平台挂在 /api）。
//   因此这里不走 API_PREFIX.CORE（会被 /api 代理剥掉前缀），
//   而是走独立代理前缀 API_PREFIX.UNIFIED（vite 把 /unified → /api/unified）。
// - 返回统一包装 { code, message?, data[], hangxin, sansan, local }（= UnifiedApiResult），
//   一次调用聚合 本地(local) / 航新服务(hangxin) / 633服务(sansan) 三源，data 每条带 source。

import { createClient } from './client'
import { ApiError } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type {
  SourceInfo,
  UnifiedAircraftRow,
  UnifiedApiResult,
  UnifiedConfigRow,
  UnifiedModelRow,
  UnifiedSortieQuery,
  UnifiedSortieRow,
  UnifiedSource,
} from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.UNIFIED })

/** 数据来源 → 界面展示文案 */
export const SOURCE_LABELS: Record<UnifiedSource, string> = {
  local: '本地',
  hangxin: '航新服务',
  sansan: '633服务',
}

/** 来源顺序（用于计数展示排序） */
export const SOURCE_ORDER: UnifiedSource[] = ['local', 'hangxin', 'sansan']

/** 来源枚举 → 展示文案（未知/空回退原文） */
export function sourceText(s?: UnifiedSource | null): string {
  return s ? (SOURCE_LABELS[s] ?? s) : ''
}

/** 追加 query 参数到路径；跳过 undefined / null / 空字符串 */
function withQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `${path}?${s}` : path
}

/** 断言统一响应成功；失败抛 ApiError（带 code/message） */
function assertOk<T>(res: UnifiedApiResult<T>, fallback: string): UnifiedApiResult<T> {
  if (res.code !== 200) {
    throw new ApiError(res.message || fallback, res.code, res)
  }
  return res
}

/** 把单个数据源的 message 变成「来源：提示」；非 success/空 视为告警 */
function toNote(source: UnifiedSource, info: SourceInfo): string | null {
  const msg = info.message?.trim()
  if (!msg || msg.toLowerCase() === 'success') return null
  return `「${SOURCE_LABELS[source]}」${msg}`
}

/** 汇总统一响应里各数据源的告警（供页面顶部轻提示），无告警返回空数组 */
export function sourceWarnings(res: { hangxin: SourceInfo; sansan: SourceInfo; local: SourceInfo }): string[] {
  return SOURCE_ORDER.map((s) => toNote(s, res[s])).filter((n): n is string => !!n)
}

export const unifiedApi = {
  /** GET /unified/aircraft/query 聚合查询单机 */
  async queryAircraft(params?: { airplaneType?: string; airplaneNum?: string }) {
    const res = await client.get<UnifiedApiResult<UnifiedAircraftRow>>(
      withQuery('/aircraft/query', {
        airplaneType: params?.airplaneType,
        airplaneNum: params?.airplaneNum,
      }),
    )
    return assertOk(res, '聚合查询单机失败')
  },

  /** GET /unified/model/query 聚合查询机型 */
  async queryModel(params?: { airplaneType?: string }) {
    const res = await client.get<UnifiedApiResult<UnifiedModelRow>>(
      withQuery('/model/query', { airplaneType: params?.airplaneType }),
    )
    return assertOk(res, '聚合查询机型失败')
  },

  /** GET /unified/config/query 聚合查询单机构型（按机型 modelCode 过滤，父子成树） */
  async queryConfig(params?: { modelCode?: string; pageNum?: number; pageSize?: number }) {
    const res = await client.get<UnifiedApiResult<UnifiedConfigRow>>(
      withQuery('/config/query', {
        modelCode: params?.modelCode,
        pageNum: params?.pageNum,
        pageSize: params?.pageSize,
      }),
    )
    return assertOk(res, '聚合查询构型失败')
  },

  /** POST /unified/sortie/query 聚合查询架次元数据 */
  async querySortie(body: UnifiedSortieQuery = {}) {
    const res = await client.post<UnifiedApiResult<UnifiedSortieRow>>('/sortie/query', body)
    return assertOk(res, '聚合查询架次失败')
  },
}
