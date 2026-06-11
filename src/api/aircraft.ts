// ============================================================
// 飞机构型管理 API
// ============================================================

import { createClient } from './client'
import type { AircraftModel, Aircraft, ConfigItem, ApiResponse } from '@/types/entities'

const client = createClient({ baseURL: '/api' })

// ---- 机型 ----

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

export function createConfigItem(data: Omit<ConfigItem, 'itemId' | 'children'>) {
  return client.post<ApiResponse>('/aircraft/config-items', data)
}

export function deleteConfigItem(itemId: number) {
  return client.del<ApiResponse>(`/aircraft/config-items/${itemId}`)
}
