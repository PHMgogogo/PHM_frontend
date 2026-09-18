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

/**
 * 单机列表。`modelCode` **必填**（后端按机型路由到唯一平台，缺省会 400「机型不能为空」）。
 * 不再支持「不传机型返回全部单机」；需要全量机队请先取 GET /aircraft/models 后按机型逐个查。
 */
export function getPlanes(modelCode: string) {
  return client.get<Aircraft[]>('/aircraft/plane', { modelCode })
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

/**
 * 获取架次列表。`modelCode` **必填**（后端按机型路由到唯一平台），
 * `aircraftNumber` 可选（不传则返回该机型下各源全部架次）。
 *
 * 每行带 `sortieKey`——它才是时序查询要回传的架次标识（`sortieId` 三方行可能为 null）。
 */
export function getSorties(modelCode: string, aircraftNumber?: string) {
  const params: Record<string, string> = { modelCode }
  if (aircraftNumber) params.aircraftNumber = aircraftNumber
  return client.get<Sortie[]>('/aircraft/sorties', params)
}

/** 获取架次详情 */
export function getSortie(sortieId: number) {
  return client.get<Sortie>(`/aircraft/sorties/${sortieId}`)
}

/** 按参数组ID查该架次的参数字段名（仅航新支持，失败时后端返回空数组） */
export function getSortieParameters(parameterGroupId: string) {
  return client.get<string[]>('/aircraft/sortie/parameters', { parameterGroupId })
}

/**
 * 添加架次（aircraftNumber 由调用方注入）。
 * sortieId 与 sortieKey 均由后端生成（本地架次的 key 即主键的字符串形态），调用方不传。
 */
export function addSortie(data: Omit<Sortie, 'sortieId' | 'sortieKey'>) {
  return client.post<ApiResponse>('/aircraft/sorties', data)
}

/** 删除架次（级联删除关联的 CSV 数据表与关联记录） */
export function deleteSortie(sortieId: number) {
  return client.del<ApiResponse>(`/aircraft/sorties/${sortieId}`)
}

// ---- 构型项目 ----

/**
 * 构型项目列表。`modelCode` **必填**（后端按机型路由到唯一平台，缺省会 400）。
 *
 * - 传该机型：命中三方平台的机型返回该平台构型（`itemId` / `parentItemId` 为 null）；
 *   否则返回本地该机型的构型（`itemId` 为数字）。
 * - 不再支持「不传机型返回全部第三方构型」。
 */
export function getConfigItems(modelCode: string) {
  return client.get<ConfigItem[]>('/aircraft/config-items', { modelCode })
}

export function getConfigItemTree(modelCode: string) {
  return client.get<ConfigItem[]>('/aircraft/config-items/tree', { modelCode })
}

export function getConfigItemSelectList(modelCode: string) {
  return client.get<ConfigItem[]>('/aircraft/config-items/select-list', { modelCode })
}

/** 创建构型项目：仅 modelCode / itemType / gjbChapter 必填，其余按 itemType 条件填写 */
export function createConfigItem(
  data: Partial<Omit<ConfigItem, 'itemId' | 'children'>> & Pick<ConfigItem, 'modelCode' | 'itemType' | 'gjbChapter'>,
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
