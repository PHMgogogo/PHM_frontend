import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as aircraftApi from '@/api/aircraft'
import { baseModelCode } from '@/utils/aircraft-source'
import type { AircraftModel, Aircraft } from '@/types/entities'

export const useAircraftStore = defineStore('aircraft', () => {
  // ---- 飞机构型 ----
  const models = ref<AircraftModel[]>([])
  const modelsLoading = ref(false)

  async function fetchModels() {
    modelsLoading.value = true
    try {
      models.value = await aircraftApi.getModels()
    } catch {
      models.value = []
    } finally {
      modelsLoading.value = false
    }
  }

  async function createModel(data: Omit<AircraftModel, 'createdAt'>) {
    await aircraftApi.createModel(data)
    await fetchModels()
  }

  async function deleteModel(modelCode: string) {
    await aircraftApi.deleteModel(modelCode)
    await fetchModels()
  }

  // ---- 飞机单机 ----
  const aircrafts = ref<Aircraft[]>([])
  const aircraftsLoading = ref(false)
  const aircraftNumbers = ref<string[]>([])

  /**
   * 拉取单机列表。`modelCode` 必填（后端按机型路由到唯一平台）。
   * 需要全量机队时用 fetchAllAircrafts()。
   */
  async function fetchAircrafts(modelCode: string) {
    if (!modelCode) {
      aircrafts.value = []
      return
    }
    aircraftsLoading.value = true
    try {
      aircrafts.value = await aircraftApi.getPlanes(modelCode)
    } catch {
      aircrafts.value = []
    } finally {
      aircraftsLoading.value = false
    }
  }

  /**
   * 拉取全部机型的单机并汇总显示。
   *
   * /aircraft/plane 的机型必填后不再有「一次拿全部单机」的入口，故这里按机型并发拉取后
   * 合并；单个机型失败只跳过该机型（不整表清空，避免一个平台不可达时页面全空）。
   * 机型编码取自 GET /aircraft/models，三方为 `K4-WS19:1` 这类合成码，
   * 传给 /aircraft/plane 前须截断为冒号前的基础编码，否则返回空列表。
   *
   * @param modelCodes 机型编码列表；缺省用已拉取的 models
   */
  async function fetchAllAircrafts(modelCodes?: string[]) {
    const codes = [
      ...new Set(
        (modelCodes ?? models.value.map((m) => m.modelCode))
          .map((c) => baseModelCode(c ?? '').trim())
          .filter(Boolean),
      ),
    ]
    if (!codes.length) {
      aircrafts.value = []
      return
    }
    aircraftsLoading.value = true
    try {
      const results = await Promise.allSettled(codes.map((code) => aircraftApi.getPlanes(code)))
      aircrafts.value = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    } finally {
      aircraftsLoading.value = false
    }
  }

  async function createAircraft(data: Omit<Aircraft, 'createdAt'>) {
    await aircraftApi.createPlane(data)
    await fetchAircrafts(data.modelCode)
  }

  async function deleteAircraft(aircraftNumber: string, modelCode: string) {
    await aircraftApi.deletePlane(aircraftNumber)
    await fetchAircrafts(modelCode)
  }

  async function fetchaircraftNumbers(modelCode: string) {
    try {
      aircraftNumbers.value = await aircraftApi.getAircraftNumbers(modelCode)
    } catch {
      aircraftNumbers.value = []
    }
  }

  return {
    models,
    modelsLoading,
    fetchModels,
    createModel,
    deleteModel,
    aircrafts,
    aircraftsLoading,
    fetchAircrafts,
    fetchAllAircrafts,
    createAircraft,
    deleteAircraft,
    aircraftNumbers,
    fetchaircraftNumbers,
  }
})
