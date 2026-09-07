// ============================================================
// 外来平台配置管理 API（对应后端 07 外来平台配置管理）
// ============================================================
// 注意：该控制器与机型/CSV 在同一个后端（152.136.119.117:8080），
// 但它的路由挂在 /api 前缀下（/api/external-platforms），而机型/CSV 挂在根路径。
// 因此这里不使用 API_PREFIX.CORE（会被 /api 代理剥掉前缀），
// 而是走独立代理前缀 API_PREFIX.EXTERNAL_PLATFORM（vite 把 /ext-platform → /api）。
//
// 写/测接口均使用【query 参数 + 空 body】，返回统一包装 { success, message?, error? }（= ApiResponse）；
// 读接口（list / get）返回裸数组 / 裸对象。

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type { ExternalPlatform } from '@/types/entities'
import type { ApiResponse } from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.EXTERNAL_PLATFORM })

/** 平台类型枚举（后端固定两类：航新 HANGXIN / 三三 SAN_SAN），每类唯一 */
export type PlatformType = 'HANGXIN' | 'SAN_SAN'

/** 平台类型 → 后端展示的平台名称（写接口用枚举，读接口回名称，靠此字典互转） */
export const PLATFORM_TYPE_LABELS: Record<PlatformType, string> = {
  HANGXIN: '航新服务',
  SAN_SAN: '633服务',
}

export const PLATFORM_TYPES: PlatformType[] = ['HANGXIN', 'SAN_SAN']

/** 平台名称 → 枚举（编辑时后端只给 platformName，写接口却要 platform 枚举） */
export function platformNameToType(name: string): PlatformType | undefined {
  const hit = Object.entries(PLATFORM_TYPE_LABELS).find(([, label]) => label === name)
  return hit ? (hit[0] as PlatformType) : undefined
}

/** 追加 query 参数到路径；跳过 undefined / 空字符串 */
function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `${path}?${s}` : path
}

export interface ExternalPlatformWriteParams {
  /** 平台类型枚举（新增时必填，编辑时沿用原类型） */
  platform: PlatformType
  ip: string
  port: number
}

export interface ExternalPlatformProbeParams {
  ip: string
  port: number
}

export const externalPlatformApi = {
  /** GET /external-platforms 获取所有平台配置 */
  list() {
    return client.get<ExternalPlatform[]>('/external-platforms')
  },

  /** GET /external-platforms/{id} 按 ID 获取 */
  get(id: number) {
    return client.get<ExternalPlatform>(`/external-platforms/${id}`)
  },

  /** POST /external-platforms?platform=&ip=&port= 新增（每类平台唯一，重复会返回 success:false） */
  create(p: ExternalPlatformWriteParams) {
    return client.post<ApiResponse>(withQuery('/external-platforms', p))
  },

  /** PUT /external-platforms/{id}?platform=&ip=&port= 更新 */
  update(id: number, p: ExternalPlatformWriteParams) {
    return client.put<ApiResponse>(withQuery(`/external-platforms/${id}`, p))
  },

  /** DELETE /external-platforms/{id} 删除 */
  remove(id: number) {
    return client.del<ApiResponse>(`/external-platforms/${id}`)
  },

  /** POST /external-platforms/{id}/test 测试已保存平台连通性 */
  testById(id: number) {
    return client.post<ApiResponse>(`/external-platforms/${id}/test`)
  },

  /** POST /external-platforms/test?ip=&port= 测试 IP+端口连通性（不保存） */
  testByAddress(p: ExternalPlatformProbeParams) {
    return client.post<ApiResponse>(withQuery('/external-platforms/test', p))
  },
}
