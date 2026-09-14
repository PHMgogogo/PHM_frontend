// ============================================================
// 算法实例 API — 远程算法服务器（192.168.31.13:8001）
// ============================================================

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type { InstanceResponse } from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.PMGR, timeout: 60000 })

/** 基础算法标识（与后端 /highlevel 的 algo 参数一致） */
export type HighLevelAlgo =
  | 'framework'
  | 'analysis_dl_afd'
  | 'analysis_dl_fp'
  | 'analysis_dl_he'
  | 'analysis_dl_ta'
  | 'analysis_ml_afd'
  | 'analysis_ml_fp'
  | 'analysis_ml_he'
  | 'analysis_ml_ta'
  | 'analysis_stat_afd'
  | 'analysis_stat_fp'
  | 'analysis_stat_he'
  | 'analysis_stat_ta'

export const DEFAULT_HIGHLEVEL_ALGO: HighLevelAlgo = 'framework'

/** 基础模型（非分析类）的展示名 */
export const BASE_ALGO_LABEL = '基础模型'

/**
 * 分析类算法的两个维度：
 * - 算法类型（family）：统计学 / 机器学习 / 深度学习
 * - 任务类型（task）：增强故障诊断 AFD / 趋势分析 TA / 健康评估 HE / 故障预测 FP
 * 两者组合确定算法 ID，如 analysis_dl_afd。
 */

export type AlgoFamily = 'stat' | 'ml' | 'dl'
export type AlgoTaskKind = 'afd' | 'ta' | 'he' | 'fp'

export interface AlgoFamilyOption {
  label: string
  value: AlgoFamily
}

export interface AlgoTaskKindOption {
  label: string
  value: AlgoTaskKind
}

/** 算法类型选项 */
export const ALGO_FAMILY_OPTIONS: AlgoFamilyOption[] = [
  { label: '统计学', value: 'stat' },
  { label: '机器学习', value: 'ml' },
  { label: '深度学习', value: 'dl' },
]

/** 任务类型选项 */
export const ALGO_TASK_KIND_OPTIONS: AlgoTaskKindOption[] = [
  { label: '增强故障诊断（AFD）', value: 'afd' },
  { label: '趋势分析（TA）', value: 'ta' },
  { label: '健康评估（HE）', value: 'he' },
  { label: '故障预测（FP）', value: 'fp' },
]

/** 由算法类型 + 任务类型推导算法 ID（如 analysis_dl_afd） */
export function buildAlgoId(family: AlgoFamily, task: AlgoTaskKind): HighLevelAlgo {
  return `analysis_${family}_${task}` as HighLevelAlgo
}

export const instanceApi = {
  /** 启动一个算法实例（GET /highlevel），可指定基础算法 algo */
  start(algo: HighLevelAlgo = DEFAULT_HIGHLEVEL_ALGO) {
    return client.get<InstanceResponse>('/highlevel', { algo })
  },

  /** 删除一个算法实例（DELETE /highlevel/{instance_id_or_prefix}） */
  remove(instanceIdOrPrefix: string) {
    return client.del<void>(`/highlevel/${instanceIdOrPrefix}`)
  },

  /** 重启算法实例（OpenAPI 规范为 GET） */
  restart(instanceId: string) {
    return client.get<InstanceResponse>(`/highlevel/${instanceId}/restart`)
  },
}
