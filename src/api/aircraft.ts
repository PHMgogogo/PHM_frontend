// ============================================================
// 飞机构型管理 API
// ============================================================

import { createClient } from './client'
import { API_PREFIX } from '@/config/endpoints'
import type { AircraftModel, Aircraft, Sortie, ConfigItem, ConfigDataMapping, ApiResponse } from '@/types/entities'

const client = createClient({ baseURL: API_PREFIX.CORE })

// ---- 构型 ----

export function getModels() {
  return client.get<AircraftModel[]>('/aircraft/models')
}

export function createModel(data: Omit<AircraftModel, 'createdAt'>) {
  return client.post<ApiResponse>('/aircraft/models', data)
}

export function deleteModel(modelCode: string) {
  return client.del<ApiResponse>(`/aircraft/models/${modelCode}`)
}

// ---- 单机（plane） ----

export function getPlanes(modelCode?: string) {
  const params = modelCode ? { modelCode } : undefined
  return client.get<Aircraft[]>('/aircraft/plane', params)
}

export function createPlane(data: Omit<Aircraft, 'createdAt'>) {
  return client.post<ApiResponse>('/aircraft/plane', data)
}

export function deletePlane(aircraftNumber: string) {
  return client.del<ApiResponse>(`/aircraft/plane/${aircraftNumber}`)
}

export function getAircraftNumbers(modelCode: string) {
  return client.get<string[]>('/aircraft/aircraft-numbers', { modelCode })
}

// ---- 架次（sortie） ----

/** 获取某单机下的架次列表（按 sortieId 降序） */
export function getSorties(aircraftNumber: string) {
  return client.get<Sortie[]>('/aircraft/sorties', { aircraftNumber })
}

/** 获取架次详情 */
export function getSortie(sortieId: number) {
  return client.get<Sortie>(`/aircraft/sorties/${sortieId}`)
}

/** 添加架次（aircraftNumber 由调用方注入） */
export function addSortie(data: Omit<Sortie, 'sortieId'>) {
  return client.post<ApiResponse>('/aircraft/sorties', data)
}

/** 删除架次（级联删除关联的 CSV 数据表与关联记录） */
export function deleteSortie(sortieId: number) {
  return client.del<ApiResponse>(`/aircraft/sorties/${sortieId}`)
}

// ---- 构型项目 ----

export function getConfigItems(modelCode: string) {
  return client.get<ConfigItem[]>('/aircraft/config-items', { modelCode })
}

export function getConfigItemTree(modelCode: string) {
  return client.get<ConfigItem[]>('/aircraft/config-items/tree', { modelCode })
}

export function getConfigItemSelectList(modelCode: string) {
  return client.get<ConfigItem[]>('/aircraft/config-items/select-list', { modelCode })
}

/** 创建构型项目：仅 modelCode / itemType / ataChapter 必填，其余按 itemType 条件填写 */
export function createConfigItem(
  data: Partial<Omit<ConfigItem, 'itemId' | 'children'>> & Pick<ConfigItem, 'modelCode' | 'itemType' | 'ataChapter'>,
) {
  return client.post<ApiResponse>('/aircraft/config-items', data)
}

export function deleteConfigItem(itemId: number) {
  return client.del<ApiResponse>(`/aircraft/config-items/${itemId}`)
}

// ---- 构型数据映射 ----

/**
 * GET /aircraft/mappings —— 查询 CSV 数据表与构型/架次的关联。
 * 筛选参数二选一：传 `sortieId` 查某架次的数据表；传 `itemId` 查某构型项目的数据表。
 */
export function getMappings(params: { sortieId?: number; itemId?: number }) {
  const query: Record<string, string> = {}
  if (params.sortieId !== undefined) query.sortieId = String(params.sortieId)
  if (params.itemId !== undefined) query.itemId = String(params.itemId)
  return client.get<ConfigDataMapping[]>('/aircraft/mappings', query)
}
