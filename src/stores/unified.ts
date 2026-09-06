// ============================================================
// 统一聚合数据 store（只读展示）
// ============================================================
// 仅服务于「跨平台合并数据」的只读展示（首页单机/机型、单机工作台来源判定）。
// 本地的增删改、CSV 上传等写流程仍走 useAircraftStore / dataMapping 等，不与本 store 混用。

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { unifiedApi, sourceWarnings } from '@/api/unified'
import type { UnifiedModelRow, UnifiedAircraftRow, UnifiedSource } from '@/types/entities'
import type { Aircraft, AircraftStatus } from '@/types/entities'

/** 首页卡片/工作台使用的单机展示对象：Aircraft 兼容 + 来源 */
export type UnifiedAircraft = Aircraft & { source: UnifiedSource }

function toAircraft(row: UnifiedAircraftRow): UnifiedAircraft {
  return {
    aircraftNumber: row.aircraftNumber,
    modelCode: row.modelCode ?? '',
    airline: row.organization ?? '',
    configVersion: row.configVersion ?? '',
    // 远端行 status 通常为空；仅本地行有真实枚举。为满足类型需兜底，卡片对远端行不展示状态。
    status: (row.status as AircraftStatus) || 'active',
    createdAt: row.createdTime ?? undefined,
    source: row.source,
  }
}

export const useUnifiedStore = defineStore('unified', () => {
  const aircrafts = ref<UnifiedAircraft[]>([])
  const models = ref<UnifiedModelRow[]>([])
  const loading = ref(false)
  const aircraftError = ref('')
  /** 单机三源查询的告警提示（如某源查询失败） */
  const sourceNotes = ref<string[]>([])
  const modelsLoading = ref(false)
  /** 机型三源查询的告警提示 */
  const modelsNotes = ref<string[]>([])

  async function fetchAircrafts(params?: { airplaneType?: string }) {
    loading.value = true
    aircraftError.value = ''
    try {
      const res = await unifiedApi.queryAircraft(params)
      aircrafts.value = res.data.map(toAircraft)
      sourceNotes.value = sourceWarnings(res)
    } catch (e) {
      aircraftError.value = (e as Error).message || '聚合查询单机失败'
      aircrafts.value = []
      sourceNotes.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchModels() {
    modelsLoading.value = true
    try {
      const res = await unifiedApi.queryModel()
      models.value = res.data
      modelsNotes.value = sourceWarnings(res)
    } catch (e) {
      models.value = []
      modelsNotes.value = []
    } finally {
      modelsLoading.value = false
    }
  }

  return {
    aircrafts,
    models,
    modelsLoading,
    loading,
    aircraftError,
    sourceNotes,
    modelsNotes,
    fetchAircrafts,
    fetchModels,
  }
})
